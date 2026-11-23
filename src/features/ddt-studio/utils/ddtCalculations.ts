import { parseDdtQuantity } from "./ddtQuantity";
import { MonetaryValue, money, safeMoney, isPositivePrice } from "@/shared/domain/monetaryValue";
import { DdtItem, DdtTotals } from "../models/ddt";

export const OPERATORI = ["Alessandro", "Nicola", "Samu"] as const;

export function normalizeOperator(op?: string): string {
  if (!op) return "";
  const lower = op.trim().toLowerCase();
  if (lower === "a" || lower === "ale" || lower === "alessandro") return "Alessandro";
  if (lower === "b" || lower === "nico" || lower === "nicola") return "Nicola";
  if (lower === "c" || lower === "sam" || lower === "samu" || lower === "samuele") return "Samu";
  return op;
}

export function getOperatorSymbol(op?: string): string {
  if (!op) return "";
  const lower = op.trim().toLowerCase();
  if (lower === "a" || lower === "ale" || lower === "alessandro") return "A";
  if (lower === "b" || lower === "nico" || lower === "nicola") return "b";
  if (lower === "c" || lower === "sam" || lower === "samu" || lower === "samuele") return "c";
  return op;
}

export function toDateIT(iso?: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length === 3) {
    return `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}`;
  }
  return iso;
}

export function formatAddressOrCity(str?: string): string {
  if (!str) return "";
  const s = str.trim();
  if (s.includes("-")) {
    const parts = s.split("-");
    const main = parts[0].trim();
    const prov = parts.slice(1).join("-").trim().toUpperCase();
    return `${main} - ${prov}`;
  }
  return s;
}

export interface DestinazioneDisplay {
  nome: string;
  indirizzo: string;
  citta: string;
}

/**
 * Risolve in modo coerente e intelligente i dati da mostrare nel box "Luogo di destinazione merce".
 * Gestisce sia i nuovi DDT che i vecchi DDT storici importati da Access/Supabase.
 */
export function resolveDestinazioneDisplay(ddt: {
  client_name?: string;
  client_address?: string;
  client_city?: string;
  destination_name?: string;
  destination_address?: string;
  destination_city?: string;
}): DestinazioneDisplay {
  const clientName = (ddt.client_name || "—").trim();
  const clientAddr = (ddt.client_address || "").trim();
  const clientCity = (ddt.client_city || "").trim();

  const rawDestName = (ddt.destination_name || "").trim();
  const rawDestAddr = (ddt.destination_address || "").trim();
  const rawDestCity = (ddt.destination_city || "").trim();

  const isStreetPattern = (s: string) =>
    /^(via|viale|corso|piazza|p\.zza|strada|loc\.|localit[aà]|f\.sso|fosso|borgo|largo|vicolo|c\.so)\b/i.test(s);

  // Caso 1: destination_address è valorizzato esplicitamente (es. "CV5", o indirizzo di consegna)
  if (rawDestAddr) {
    const isDestNameSameAsClientOrEmpty = !rawDestName || rawDestName.toUpperCase() === clientName.toUpperCase();
    const isDestNameSameAsAddr = rawDestName.toUpperCase() === rawDestAddr.toUpperCase() || isStreetPattern(rawDestName);

    const nome = isDestNameSameAsAddr || isDestNameSameAsClientOrEmpty ? clientName : rawDestName;
    const indirizzo = rawDestAddr;
    const citta = rawDestCity;
    return { nome, indirizzo, citta };
  }

  // Caso 2: destination_address non è valorizzato (es. vecchi DDT storici o nessun indirizzo alternativo)
  if (!rawDestName || rawDestName.toUpperCase() === clientName.toUpperCase()) {
    return {
      nome: clientName,
      indirizzo: clientAddr,
      citta: clientCity,
    };
  }

  // Se rawDestName coincide con la sede legale del cliente o contiene una via/strada
  const isStreetOrClientAddr =
    (clientAddr && rawDestName.toUpperCase() === clientAddr.toUpperCase()) ||
    isStreetPattern(rawDestName);

  if (isStreetOrClientAddr) {
    return {
      nome: clientName,
      indirizzo: rawDestName || clientAddr,
      citta: rawDestCity || clientCity,
    };
  }

  // Se rawDestName è una sigla o codice di destinazione (es. "CV2", "Stab. Ferrania"):
  return {
    nome: clientName,
    indirizzo: rawDestName,
    citta: rawDestCity,
  };
}

/**
 * Parsea una stringa di sconto singola o a cascata (es. "10", "10+3", "(10 + 3)", "10+5+2")
 * Restituisce l'array di percentuali di sconto da applicare sequenzialmente.
 */
export function parseCascadeDiscounts(raw?: string | number | null): number[] {
  if (raw === null || raw === undefined || raw === "") return [];
  const clean = String(raw).trim().replace(/[()%]/g, "");
  if (!clean) return [];

  return clean
    .split("+")
    .map((part) => parseFloat(part.trim().replace(",", ".")))
    .filter((n) => !isNaN(n) && n > 0);
}

/**
 * Normalizza una stringa di sconto rimuovendo rumore floating-point IEEE-754
 * (es. "7.000000000000001" -> "7", "28.999999999999996" -> "29").
 */
export function normalizeDiscountString(raw?: string | number | null): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const clean = String(raw).trim().replace(/[()%]/g, "");
  if (!clean) return "";

  if (clean.includes("+")) {
    const parts = clean
      .split("+")
      .map((p) => {
        const trimmed = p.trim();
        const n = parseFloat(trimmed.replace(",", "."));
        return isNaN(n) ? trimmed : String(Math.round(n * 1e6) / 1e6);
      })
      .filter(Boolean);
    return parts.join("+");
  }

  const n = parseFloat(clean.replace(",", "."));
  if (isNaN(n)) return clean;
  return String(Math.round(n * 1e6) / 1e6);
}

/**
 * Formatta la stringa di sconto per la visualizzazione nella griglia e nel documento cartaceo/PDF.
 * Mantiene la dicitura inserita dall'utente aggiungendo il simbolo '%' finale (es. "10 + 3%").
 */
export function formatCascadeDiscountDisplay(raw?: string | number | null): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const clean = normalizeDiscountString(raw);
  if (!clean) return "";

  if (clean.includes("+")) {
    const parts = clean.split("+").map((p) => p.trim()).filter(Boolean);
    return parts.length > 0 ? parts.map((p) => `${p}%`).join(" + ") : "";
  }

  const n = parseFloat(clean.replace(",", "."));
  if (isNaN(n) || n <= 0) return "";
  return `${Math.round(n * 1e6) / 1e6}%`;
}

/**
 * Calcolo esatto a 5 decimali per la singola riga del DDT.
 * Supporta sconti a cascata (es. 10+3%, dove prima si calcola il 10% e sul netto risultante il 3%).
 * L'IVA non viene applicata automaticamente: se non specificata dall'utente, l'importo IVA è 0.
 */
export function calculateRowAmounts(
  quantityRaw: string | number,
  unitPriceRaw: MonetaryValue | string | number,
  discountRaw: string | number = 0,
  vatRateRaw?: string | number | null
): { netAmount: MonetaryValue; vatAmount: MonetaryValue } {
  const price = safeMoney(unitPriceRaw);
  
  const q = parseDdtQuantity(quantityRaw) ?? (String(quantityRaw ?? "").trim() ? 0 : (price.isPositive() ? 1 : 0));
  
  if (q <= 0 || price.isZero()) {
    return { netAmount: money(0), vatAmount: money(0) };
  }

  // Lordo = qta * prezzo unitario (5 decimali esatti)
  const gross = price.times(q);

  // Sconto % sequenziale / a cascata (es. 10 + 3)
  const discounts = parseCascadeDiscounts(discountRaw);
  let net = gross;
  for (const disc of discounts) {
    net = net.applyDiscount(disc);
  }

  // IVA %: l'IVA non si applica automaticamente a meno che non sia esplicitamente inserita dall'utente
  let vat = money(0);
  if (vatRateRaw !== undefined && vatRateRaw !== null && String(vatRateRaw).trim() !== "") {
    const vatStr = String(vatRateRaw).trim().replace(",", ".");
    const vatRate = parseFloat(vatStr);
    if (!isNaN(vatRate) && vatRate > 0) {
      vat = net.calculateVat(vatRate);
    }
  }

  return { netAmount: net, vatAmount: vat };
}

/**
 * Calcola i totali del documento DDT sommando tutte le righe con 5 decimali
 */
export function calculateDdtTotals(items: Partial<DdtItem>[]): DdtTotals {
  let totalTaxable = money(0);
  let totalVat = money(0);
  let totalCost = money(0);

  for (const item of items) {
    if (
      !item.description?.trim() &&
      !isPositivePrice(item.unit_price) &&
      !isPositivePrice(item.purchase_price)
    ) {
      continue;
    }

    const { netAmount, vatAmount } = calculateRowAmounts(
      item.quantity ?? "1",
      item.unit_price || money(0),
      item.discount_pct || "0",
      item.vat_rate
    );

    totalTaxable = totalTaxable.plus(netAmount);
    totalVat = totalVat.plus(vatAmount);

    if (isPositivePrice(item.purchase_price)) {
      const pCost = safeMoney(item.purchase_price);
      const q = parseDdtQuantity(item.quantity) ?? (item.quantity?.trim() ? 0 : 1);
      totalCost = totalCost.plus(pCost.times(q));
    }
  }

  const totalDoc = totalTaxable.plus(totalVat);
  const revenue = totalCost.isPositive() ? totalTaxable.minus(totalCost) : undefined;
  const markup = totalCost.isPositive() && revenue
    ? revenue.dividedBy(totalCost).times(100).toNumber()
    : undefined;

  return {
    totale_imponibile: totalTaxable,
    totale_iva: totalVat,
    totale_documento: totalDoc,
    totale_acquisto: totalCost.isPositive() ? totalCost : undefined,
    totale_ricavo: revenue,
    ricarico_percentuale: markup !== undefined ? Math.round(markup * 1000) / 1000 : undefined,
  };
}

export function isRowFilled(r: Partial<DdtItem>): boolean {
  if (!r) return false;
  const hasDesc = Boolean(r.description && r.description.trim().length > 0);
  const hasCode = Boolean(r.code && r.code.trim().length > 0);
  const hasPrice = isPositivePrice(r.unit_price);
  const hasQta = (parseDdtQuantity(r.quantity) ?? 0) > 0;
  const hasUnit = Boolean(r.unit && r.unit.trim().length > 0);
  return hasDesc || hasCode || hasPrice || hasQta || hasUnit;
}

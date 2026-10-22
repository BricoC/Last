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
 * Formatta la stringa di sconto per la visualizzazione nella griglia e nel documento cartaceo/PDF.
 * Mantiene la dicitura inserita dall'utente aggiungendo il simbolo '%' finale (es. "10 + 3%").
 */
export function formatCascadeDiscountDisplay(raw?: string | number | null): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const clean = String(raw).trim().replace(/[()%]/g, "");
  if (!clean) return "";

  if (clean.includes("+")) {
    const parts = clean.split("+").map((p) => p.trim()).filter(Boolean);
    return parts.length > 0 ? parts.map((p) => `${p}%`).join(" + ") : "";
  }

  const n = parseFloat(clean.replace(",", "."));
  if (isNaN(n) || n <= 0) return "";
  return `${n}%`;
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
  
  const qStr = String(quantityRaw ?? "").trim().replace(",", ".");
  const q = qStr ? parseFloat(qStr) : (price.isPositive() ? 1 : 0);
  
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
    if (!item.description?.trim() && !isPositivePrice(item.unit_price)) {
      continue;
    }

    const { netAmount, vatAmount } = calculateRowAmounts(
      item.quantity || "1",
      item.unit_price || money(0),
      item.discount_pct || "0",
      item.vat_rate
    );

    totalTaxable = totalTaxable.plus(netAmount);
    totalVat = totalVat.plus(vatAmount);

    if (isPositivePrice(item.purchase_price)) {
      const pCost = safeMoney(item.purchase_price);
      const qStr = String(item.quantity || "1").trim().replace(",", ".");
      const q = qStr ? parseFloat(qStr) : 1;
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
  const rawQ = r.quantity ? String(r.quantity).trim().replace(",", ".") : "";
  const hasQta = Boolean(rawQ && parseFloat(rawQ) > 0);
  const hasUnit = Boolean(r.unit && r.unit.trim().length > 0);
  return hasDesc || hasCode || hasPrice || hasQta || hasUnit;
}

export const ROWS_PER_PAGE = 25;

export interface DdtPageData {
  pageNum: number;
  totalPages: number;
  isFirst: boolean;
  isLast: boolean;
  rows: (Partial<DdtItem> & { net_amount?: MonetaryValue })[];
}

/**
 * Paginazione esatta fedele a noManV1:
 * Mantiene tutte le righe fino all'ultima compilata (inclusi gli spazi vuoti intermedi)
 * e riempie ogni pagina fino a ROWS_PER_PAGE (25 righe) per disegnare la griglia completa.
 */
export function paginateDdtRows(items: DdtItem[]): DdtPageData[] {
  let lastFilledIndex = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (isRowFilled(items[i])) {
      lastFilledIndex = i;
      break;
    }
  }

  // Mantiene tutte le righe fino all'ultima compilata (inclusi gli spazi vuoti intermedi)
  const activeItems = lastFilledIndex >= 0 ? items.slice(0, lastFilledIndex + 1) : [];
  const totalPages = Math.max(1, Math.ceil(activeItems.length / ROWS_PER_PAGE));
  const pages: DdtPageData[] = [];

  for (let p = 0; p < totalPages; p++) {
    const start = p * ROWS_PER_PAGE;
    const end = start + ROWS_PER_PAGE;
    const chunk = activeItems.slice(start, end);
    const isFirst = p === 0;
    const isLast = p === totalPages - 1;

    // Riempi sempre fino a ROWS_PER_PAGE (25 righe) per pagina per disegnare l'intera griglia verticale continua
    const padded: (Partial<DdtItem> & { net_amount?: MonetaryValue })[] = [...chunk];
    while (padded.length < ROWS_PER_PAGE) {
      padded.push({
        id: `empty-p${p}-${padded.length}`,
        ddt_id: "",
        row_index: start + padded.length + 1,
        description: "",
        unit: "",
        quantity: "",
        unit_price: money(0),
        discount_pct: "",
        net_amount: money(0),
        vat_rate: "",
        vat_amount: money(0),
      });
    }

    pages.push({
      pageNum: p + 1,
      totalPages,
      isFirst,
      isLast,
      rows: padded,
    });
  }

  return pages;
}

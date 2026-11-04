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
    const citta = rawDestCity || (rawDestAddr.toUpperCase() === clientAddr.toUpperCase() ? clientCity : "");
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
export const SINGLE_PAGE_SLOTS = 25;
export const FIRST_PAGE_MULTI_SLOTS = 25;
export const MIDDLE_PAGE_SLOTS = 25;
export const LAST_PAGE_MULTI_SLOTS = 25;

export interface DdtPageData {
  pageNum: number;
  totalPages: number;
  isFirst: boolean;
  isLast: boolean;
  rows: (Partial<DdtItem> & { net_amount?: MonetaryValue })[];
}

function createEmptyDdtRow(id: string, rowIndex: number): Partial<DdtItem> & { net_amount?: MonetaryValue } {
  return {
    id,
    ddt_id: "",
    row_index: rowIndex,
    description: "",
    unit: "",
    quantity: "",
    unit_price: money(0),
    discount_pct: "",
    net_amount: money(0),
    vat_rate: "",
    vat_amount: money(0),
  };
}

/**
 * Calcola quante righe visive (slot di altezza) occupa la descrizione di un articolo quando va a capo.
 * In Times New Roman 9.5pt nella colonna descrizione della DDT ci stanno circa 50-52 caratteri per riga.
 */
export function getItemRowSlots(item: Partial<DdtItem>): number {
  const desc = item.description ? String(item.description).trim() : "";
  if (!desc) return 1;
  const lines = desc.split("\n");
  let totalLines = 0;
  const CHARS_PER_LINE = 50;
  for (const l of lines) {
    const trimmed = l.trim();
    if (!trimmed) {
      totalLines += 1;
    } else {
      totalLines += Math.max(1, Math.ceil(trimmed.length / CHARS_PER_LINE));
    }
  }
  return Math.max(1, totalLines);
}

/**
 * Paginazione esatta fedele al layout fisico A4:
 * Mantiene tutte le righe fino all'ultima compilata.
 * Calcola l'ingombro verticale effettivo di ciascun articolo (considerando le righe che vanno a capo)
 * e riempie ogni pagina con righe vuote fino a saturare tutto lo spazio bianco disponibile:
 * - Pagina singola con footer: 28 slot
 * - Pagina 1 di documento multipagina: 33 slot
 * - Pagine intermedie: 45 slot
 * - Ultima pagina con footer: 40 slot
 * Garantisce che l'altezza complessiva della griglia e la posizione dei totali/footer restino stabili al millimetro.
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

  if (activeItems.length === 0) {
    const padded: (Partial<DdtItem> & { net_amount?: MonetaryValue })[] = [];
    while (padded.length < SINGLE_PAGE_SLOTS) {
      padded.push(createEmptyDdtRow(`empty-p0-${padded.length}`, padded.length + 1));
    }
    return [{
      pageNum: 1,
      totalPages: 1,
      isFirst: true,
      isLast: true,
      rows: padded,
    }];
  }

  const itemSlots = activeItems.map((it) => getItemRowSlots(it));
  const totalSlots = itemSlots.reduce((sum, s) => sum + s, 0);

  // Se tutti gli articoli stanno in un'unica pagina con footer (<= SINGLE_PAGE_SLOTS)
  if (totalSlots <= SINGLE_PAGE_SLOTS) {
    const padded: (Partial<DdtItem> & { net_amount?: MonetaryValue })[] = [...activeItems];
    let remainingSlots = SINGLE_PAGE_SLOTS - totalSlots;
    while (remainingSlots > 0) {
      padded.push(createEmptyDdtRow(`empty-p0-${padded.length}`, padded.length + 1));
      remainingSlots -= 1;
    }
    return [{
      pageNum: 1,
      totalPages: 1,
      isFirst: true,
      isLast: true,
      rows: padded,
    }];
  }

  // Altrimenti documento multipagina: raggruppa dinamicamente
  const pagesChunks: { chunk: (Partial<DdtItem> & { net_amount?: MonetaryValue })[]; usedSlots: number }[] = [];
  let currentChunk: (Partial<DdtItem> & { net_amount?: MonetaryValue })[] = [];
  let currentSlots = 0;

  for (let i = 0; i < activeItems.length; i++) {
    const item = activeItems[i];
    const slots = itemSlots[i];
    const isFirst = pagesChunks.length === 0;
    const maxSlots = isFirst ? FIRST_PAGE_MULTI_SLOTS : MIDDLE_PAGE_SLOTS;
    const wouldStarveNextPage = isFirst && (i === activeItems.length - 1);

    if (currentChunk.length > 0 && (currentSlots + slots > maxSlots || wouldStarveNextPage)) {
      pagesChunks.push({ chunk: currentChunk, usedSlots: currentSlots });
      currentChunk = [item];
      currentSlots = slots;
    } else {
      currentChunk.push(item);
      currentSlots += slots;
    }
  }

  if (currentChunk.length > 0) {
    pagesChunks.push({ chunk: currentChunk, usedSlots: currentSlots });
  }

  // Verifica che l'ultima pagina non superi LAST_PAGE_MULTI_SLOTS (40)
  while (pagesChunks.length > 1 && pagesChunks[pagesChunks.length - 1].usedSlots > LAST_PAGE_MULTI_SLOTS) {
    const last = pagesChunks.pop()!;
    const c1: (Partial<DdtItem> & { net_amount?: MonetaryValue })[] = [];
    const c2: (Partial<DdtItem> & { net_amount?: MonetaryValue })[] = [];
    let s1 = 0;
    let s2 = 0;
    for (const it of last.chunk) {
      const s = getItemRowSlots(it);
      if (c2.length === 0 && s1 + s <= MIDDLE_PAGE_SLOTS && (last.chunk.length - c1.length > 1)) {
        c1.push(it);
        s1 += s;
      } else {
        c2.push(it);
        s2 += s;
      }
    }
    pagesChunks.push({ chunk: c1, usedSlots: s1 });
    pagesChunks.push({ chunk: c2, usedSlots: s2 });
  }

  const totalPages = pagesChunks.length;
  const pages: DdtPageData[] = [];
  let globalRowCounter = 0;

  for (let p = 0; p < totalPages; p++) {
    const { chunk, usedSlots } = pagesChunks[p];
    const isFirst = p === 0;
    const isLast = p === totalPages - 1;

    const targetSlots = totalPages === 1
      ? SINGLE_PAGE_SLOTS
      : isFirst
      ? FIRST_PAGE_MULTI_SLOTS
      : isLast
      ? LAST_PAGE_MULTI_SLOTS
      : MIDDLE_PAGE_SLOTS;

    const padded: (Partial<DdtItem> & { net_amount?: MonetaryValue })[] = [...chunk];
    let remainingSlots = targetSlots - usedSlots;
    while (remainingSlots > 0) {
      padded.push(createEmptyDdtRow(`empty-p${p}-${padded.length}`, globalRowCounter + padded.length + 1));
      remainingSlots -= 1;
    }

    globalRowCounter += chunk.length;

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

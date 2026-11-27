import { parseDdtQuantity } from "../utils/ddtQuantity";
import { parseCascadeDiscounts } from "../utils/ddtCalculations";
export function formatCloudDestination(
  destinationName?: string | null,
  destinationAddress?: string | null,
  clientName?: string | null,
): string {
  const rawDestName = (destinationName || "").trim();
  const rawDestAddr = (destinationAddress || "").trim();
  const normalizedClient = (clientName || "").trim().toUpperCase();
  if (!rawDestAddr) return rawDestName;

  const upperName = rawDestName.toUpperCase();
  const upperAddr = rawDestAddr.toUpperCase();
  const isDestNameMissingOrClient = !rawDestName || upperName === normalizedClient;
  if (isDestNameMissingOrClient || upperName === upperAddr) {
    return rawDestAddr;
  }

  const existingSegments = rawDestName
    .split(/\s+-\s+/)
    .map((segment) => segment.trim().toUpperCase())
    .filter(Boolean);
  if (existingSegments.includes(upperAddr)) {
    return rawDestName;
  }

  return `${rawDestName} - ${rawDestAddr}`;
}
export interface LocalDdtRow {
  id: string;
  doc_number: number | null;
  year: number;
  series: string;
  doc_date: string;
  status: string;
  client_name: string;
  client_address: string | null;
  client_city: string | null;
  client_vat: string | null;
  client_fiscal_code: string | null;
  client_sdi: string | null;
  client_phones_json: string | null;
  destination_name: string | null;
  destination_address?: string | null;
  destination_city: string | null;
  transport_reason: string | null;
  payment_method: string | null;
  order_reference: string | null;
  operator: string | null;
  goods_appearance: string | null;
  carriage_terms: string | null;
  packages_count: string | null;
  weight_kg: string | null;
  carrier: string | null;
  internal_notes: string | null;
  total_taxable_subunits: number;
  total_vat_subunits: number;
  total_document_subunits: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: string;
  project_url?: string | null;
  cloud_restore_requested?: number;
}

export interface LocalDdtItemRow {
  id: string;
  ddt_id: string;
  row_index: number;
  code: string | null;
  description: string;
  row_kind: string | null;
  unit: string | null;
  quantity: string | null;
  unit_price_subunits: number;
  discount_pct: string | null;
  net_amount_subunits: number;
  vat_rate: number;
  purchase_price_subunits: number;
  deleted_at: string | null;
}

function parseNumericString(value: string | number | null | undefined, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (value === null || value === undefined) return fallback;
  const parsed = parseFloat(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round5(value: number): number {
  return Math.round(value * 100000) / 100000;
}

export function buildSupabaseDdtPayloads(doc: LocalDdtRow, items: LocalDdtItemRow[]) {
  let phones: unknown[] = [];
  try {
    if (doc.client_phones_json) {
      const parsed = JSON.parse(doc.client_phones_json);
      if (Array.isArray(parsed)) phones = parsed;
    }
  } catch {
    phones = [];
  }

  const activeItems = items.filter((it) => !it.deleted_at);
  let totalPurchaseCost = 0;
  let totalDiscount = 0;

  const linePayloads = activeItems.map((it) => {
    const isNote =
      it.row_kind === "note" ||
      (it.row_kind !== "item" &&
        Boolean(it.description?.trim()) &&
        (it.unit_price_subunits ?? 0) === 0 &&
        (it.net_amount_subunits ?? 0) === 0 &&
        (it.purchase_price_subunits ?? 0) === 0 &&
        (!it.code || !String(it.code).trim()) &&
        !parseDdtQuantity(it.quantity) &&
        (!it.unit || !String(it.unit).trim()));

    const qty = isNote ? 0 : parseDdtQuantity(it.quantity) ?? (it.quantity?.trim() ? 0 : 1);
    const unitPrice = isNote ? 0 : (it.unit_price_subunits || 0) / 100000;
    const cascadeDiscounts = isNote ? [] : parseCascadeDiscounts(it.discount_pct);
    const discountFactor = cascadeDiscounts.reduce((acc, pct) => acc * (1 - pct / 100), 1);
    const discountDecimal = round5(1 - discountFactor);
    const netAmount = isNote ? 0 : (it.net_amount_subunits || 0) / 100000;
    const purchaseUnit = isNote ? 0 : (it.purchase_price_subunits || 0) / 100000;
    const discountedUnit = !isNote && qty > 0 ? round5(netAmount / qty) : 0;
    const lineCost = isNote ? 0 : purchaseUnit * qty;
    const lineProfit = isNote ? 0 : round5(netAmount - lineCost);

    if (!isNote) {
      totalPurchaseCost += lineCost;
      totalDiscount += Math.max(0, unitPrice * qty - netAmount);
    }

    return {
      id: it.id,
      ddt_id: doc.id,
      riga_nr: it.row_index,
      um: isNote ? "" : it.unit || "NR",
      quantita: qty,
      descrizione: it.description || "",
      prezzo: round5(unitPrice),
      sconto_pct: discountDecimal,
      importo: round5(netAmount),
      iva_pct: isNote ? 0 : Math.round(Number(it.vat_rate || 0)),
      prezzo_acquisto: round5(purchaseUnit),
      prezzo_scontato: discountedUnit,
      ricavo: lineProfit,
      anno: doc.year,
      numero_ddt: doc.doc_number,
    };
  });

  const taxable = (doc.total_taxable_subunits || 0) / 100000;
  const vat = (doc.total_vat_subunits || 0) / 100000;
  const totalDoc = (doc.total_document_subunits || 0) / 100000;
  const roundedCost = round5(totalPurchaseCost);
  const profit = round5(taxable - roundedCost);
  const markup = roundedCost > 0 ? round5(profit / roundedCost) : 0;

  const rawDestCity = (doc.destination_city || "").trim();
  const cloudDestinazione = formatCloudDestination(
    doc.destination_name,
    doc.destination_address,
    doc.client_name,
  );
  const cloudCittaDest = rawDestCity;

  const headerPayload = {
    id: doc.id,
    numero: doc.doc_number,
    anno: doc.year,
    data: doc.doc_date,
    cliente: doc.client_name,
    indirizzo: doc.client_address || "",
    citta: doc.client_city || "",
    pagamento: doc.payment_method || "",
    destinazione: cloudDestinazione,
    citta_dest: cloudCittaDest,
    nr_vs_ordine: doc.order_reference || "",
    causale: doc.transport_reason || "Vendita",
    porto: doc.carriage_terms || "",
    aspetto: doc.goods_appearance || "",
    colli: doc.packages_count || "",
    peso_kg: parseNumericString(doc.weight_kg, 0),
    vettore: doc.carrier || "",
    operatore: doc.operator || "",
    note: doc.internal_notes || "",
    totale_imponibile: round5(taxable),
    totale_iva: round5(vat),
    totale_documento: round5(totalDoc),
    stato: doc.status,
    created_at: doc.created_at,
    ultima_modifica: doc.updated_at,
    piva: doc.client_vat || "",
    cod_fiscale: doc.client_fiscal_code || "",
    sdi: doc.client_sdi || "",
    telefoni: phones,
    prezzo_acquisto_totale: roundedCost,
    ricavo: profit,
    ricarico_totale: markup,
    sconto_totale: round5(totalDiscount),
  };

  return { headerPayload, linePayloads };
}

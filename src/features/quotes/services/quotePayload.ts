import type { Quote, QuoteDraftInput, QuoteItem, QuoteItemInput } from "../models/quote";
import { isQuoteDraftItemActive } from "../models/quoteDraft";
import { calculateQuoteItem, calculateQuoteTotals } from "../utils/quoteCalculations";

export function buildQuoteSavePayload(input: QuoteDraftInput, existing: Quote | null, now: string, id: string) {
  const globalDiscount = input.global_discount_pct ?? 0;
  if (!Number.isFinite(globalDiscount) || globalDiscount > 100) {
    throw new RangeError("Lo sconto globale deve essere valido e non può superare il 100%.");
  }
  const items = input.items.filter(isQuoteDraftItemActive);
  const calculations = items.map((item) => calculateQuoteItem(item, globalDiscount));
  const totals = calculateQuoteTotals(calculations);
  return {
    id, status: input.status ?? "bozza", year: input.year ?? new Date().getFullYear(),
    quote_date: input.quote_date ?? localDate(), created_at: existing?.created_at ?? now,
    updated_at: now, updated_by: "system", client_id: input.client_id ?? null,
    client_name: input.client_name?.trim() ?? "", client_address: input.client_address ?? null,
    client_city: input.client_city ?? null, client_postal_code: input.client_postal_code ?? null,
    client_province: input.client_province ?? null, client_vat: input.client_vat ?? null,
    client_fiscal_code: input.client_fiscal_code ?? null, client_sdi: input.client_sdi ?? null,
    client_pec: input.client_pec ?? null, client_phones_json: JSON.stringify(input.client_phones ?? []),
    destination_name: input.destination_name ?? null, destination_address: input.destination_address ?? null,
    destination_city: input.destination_city ?? null, subject: input.subject?.trim() ?? "",
    global_discount_pct: String(globalDiscount), validity_days: input.validity_days ?? 30,
    payment_method: input.payment_method ?? null, delivery_date: input.delivery_date ?? null,
    delivery_terms: input.delivery_terms ?? null, default_supplier: input.default_supplier ?? null,
    internal_notes: input.internal_notes ?? null, customer_notes: input.customer_notes ?? null,
    total_taxable_subunits: totals.taxable.toSubunits(), total_vat_subunits: totals.vat.toSubunits(),
    total_document_subunits: totals.total.toSubunits(), total_cost_subunits: totals.cost.toSubunits(),
    total_profit_subunits: totals.gross_profit.toSubunits(),
    items: items.map((item, index) => buildItemPayload(item, calculations[index], index + 1, existing?.items[index])),
  };
}

function buildItemPayload(
  item: QuoteItemInput,
  calculation: ReturnType<typeof calculateQuoteItem>,
  rowIndex: number,
  existing?: QuoteItem
) {
  return {
    id: item.id || existing?.id || crypto.randomUUID(), row_index: rowIndex,
    product_id: item.product_id ?? null, supplier: item.supplier ?? null,
    supplier_item_code: item.supplier_item_code ?? null, code: item.code ?? null,
    description: item.description.trim(), unit: item.unit?.trim() || "NR", quantity: String(item.quantity),
    purchase_price_subunits: item.purchase_price.toSubunits(),
    markup_pct: calculation.markup_pct === null ? null : String(calculation.markup_pct),
    base_unit_price_subunits: calculation.base_unit_price.toSubunits(),
    effective_unit_price_subunits: calculation.effective_unit_price.toSubunits(),
    forced_unit_price_subunits: item.forced_unit_price?.toSubunits() ?? null,
    discount_pct: String(item.discount_pct ?? 0),
    effective_markup_pct: calculation.effective_markup_pct === null ? null : String(calculation.effective_markup_pct),
    margin_pct: calculation.margin_pct === null ? null : String(calculation.margin_pct),
    net_amount_subunits: calculation.net_amount.toSubunits(), cost_total_subunits: calculation.cost_total.toSubunits(),
    gross_profit_subunits: calculation.gross_profit.toSubunits(), vat_rate: item.vat_rate,
    vat_amount_subunits: calculation.vat_amount.toSubunits(), availability: item.availability ?? null,
    notes: item.notes ?? null,
  };
}

function localDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

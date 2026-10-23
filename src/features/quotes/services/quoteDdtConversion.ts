import { money } from "@/shared/domain/monetaryValue";
import { calculateQuoteItem, calculateQuoteTotals } from "../utils/quoteCalculations";
import type { QuoteDraftInput } from "../models/quote";
import type { DdtDocument, DdtItem } from "@/features/ddt-studio/models/ddt";

export function buildQuoteDdtConversion(input: QuoteDraftInput, ddtId: string) {
  const now = new Date().toISOString();
  const date = new Date().toISOString().slice(0, 10);
  const activeItems = input.items.filter((item) => item.description.trim());
  const calculations = activeItems.map((item) => calculateQuoteItem(item, input.global_discount_pct ?? 0));
  const totals = calculateQuoteTotals(calculations);
  const items: DdtItem[] = activeItems.map((item, index) => {
    const calculated = calculations[index];
    return {
      id: crypto.randomUUID(), created_at: now, updated_at: now, updated_by: "system",
      deleted_at: null, sync_status: "pending", ddt_id: ddtId, row_index: index + 1,
      product_id: item.product_id ?? undefined, code: item.code ?? undefined,
      description: item.description.trim(), unit: item.unit?.trim() || "NR", quantity: String(item.quantity),
      unit_price: calculated.effective_unit_price, base_price: calculated.effective_unit_price,
      discount_pct: "0", net_amount: calculated.net_amount, vat_rate: item.vat_rate,
      vat_amount: calculated.vat_amount, purchase_price: item.purchase_price ?? money(0),
    };
  });
  const ddt: Partial<DdtDocument> = {
    id: ddtId, doc_number: null, series: "", year: Number(date.slice(0, 4)), doc_date: date, status: "bozza",
    client_id: input.client_id ?? undefined, client_name: input.client_name?.trim() || "Cliente",
    client_address: input.client_address ?? undefined, client_city: input.client_city ?? undefined,
    client_vat: input.client_vat ?? undefined, client_fiscal_code: input.client_fiscal_code ?? undefined,
    client_sdi: input.client_sdi ?? undefined, client_phones: input.client_phones ?? [],
    destination_name: input.destination_name ?? undefined, destination_address: input.destination_address ?? undefined,
    destination_city: input.destination_city ?? undefined, transport_reason: "Vendita",
    payment_method: input.payment_method ?? undefined, account_or_balance: "", operator: "",
    carriage_terms: "Franco stabilimento", internal_notes: `Rif. ${input.subject || "Preventivo"} del ${formatDate(input.quote_date)}`,
    total_taxable: totals.taxable, total_vat: totals.vat, total_document: totals.total,
  };
  const payload = {
    id: ddtId, doc_number: null, year: ddt.year, series: "", doc_date: date, status: "bozza", is_emission: false,
    updated_at: now, updated_by: "system", client_id: input.client_id ?? null,
    client_name: ddt.client_name, client_address: input.client_address ?? null, client_city: input.client_city ?? null,
    client_vat: input.client_vat ?? null, client_fiscal_code: input.client_fiscal_code ?? null,
    client_sdi: input.client_sdi ?? null, client_phones_json: JSON.stringify(input.client_phones ?? []),
    destination_name: input.destination_name ?? null, destination_address: input.destination_address ?? null,
    destination_city: input.destination_city ?? null, transport_reason: "Vendita",
    payment_method: input.payment_method ?? null, order_reference: null, account_or_balance: "",
    operator: null, goods_appearance: null, carriage_terms: "Franco stabilimento", packages_count: null,
    weight_kg: null, carrier: null, pickup_date_time: null,
    internal_notes: ddt.internal_notes, total_taxable_subunits: totals.taxable.toSubunits(),
    total_vat_subunits: totals.vat.toSubunits(), total_document_subunits: totals.total.toSubunits(),
    items: items.map((item, index) => ({
      id: item.id, row_index: index + 1, product_id: item.product_id ?? null, code: item.code ?? null,
      description: item.description, unit: item.unit, quantity: item.quantity,
      unit_price_subunits: item.unit_price.toSubunits(), discount_pct: "0",
      net_amount_subunits: item.net_amount.toSubunits(), vat_rate: Number(item.vat_rate ?? 0),
      vat_amount_subunits: item.vat_amount.toSubunits(), purchase_price_subunits: item.purchase_price?.toSubunits() ?? 0,
    })),
  };
  return { ddt, items, payload, updatedAt: now };
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

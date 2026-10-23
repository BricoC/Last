import { money, safeMoney } from "@/shared/domain/monetaryValue";
import type { Quote, QuoteDraftInput, QuoteItemInput, QuoteStatus } from "./quote";

export type QuoteDraftItem = Omit<QuoteItemInput, "purchase_price" | "base_unit_price" | "forced_unit_price"> & {
  purchase_price: string;
  base_unit_price: string;
  forced_unit_price: string;
};

export type QuoteDraft = Omit<QuoteDraftInput, "items" | "status"> & { status?: QuoteStatus; items: QuoteDraftItem[] };

export function createEmptyQuoteDraft(): QuoteDraft {
  const now = new Date();
  return {
    year: now.getFullYear(),
    quote_date: localDate(),
    status: "bozza",
    client_name: "",
    subject: "",
    validity_days: 30,
    global_discount_pct: 0,
    items: Array.from({ length: 500 }, createEmptyQuoteItem),
  };
}

export function createEmptyQuoteItem(): QuoteDraftItem {
  return {
    description: "", code: "", unit: "", quantity: "", purchase_price: "0",
    markup_pct: 0, base_unit_price: "", forced_unit_price: "", discount_pct: 0,
    vat_rate: 22,
  };
}

export function isQuoteDraftItemActive(item: QuoteDraftItem | QuoteItemInput): boolean {
  const hasPrice = [item.purchase_price, item.base_unit_price, item.forced_unit_price]
    .some((value) => !safeMoney(value).isZero());
  return Boolean(item.description.trim() || item.code?.trim() || item.unit?.trim()
    || item.supplier?.trim() || item.supplier_item_code?.trim() || String(item.quantity ?? "").trim()
    || hasPrice || Number(item.markup_pct) !== 0 || Number(item.discount_pct) !== 0
    || item.availability?.trim() || item.notes?.trim());
}

export function quoteToDraft(quote: Quote): QuoteDraft {
  const savedItems = quote.items.map((item) => ({
    id: item.id, product_id: item.product_id, supplier: item.supplier,
    supplier_item_code: item.supplier_item_code, code: item.code,
    description: item.description, unit: item.unit, quantity: item.quantity,
    purchase_price: item.purchase_price.toCanonicalString(),
    markup_pct: item.markup_pct, base_unit_price: item.base_unit_price.toCanonicalString(),
    forced_unit_price: item.forced_unit_price?.toCanonicalString() ?? "",
    discount_pct: item.discount_pct, vat_rate: item.vat_rate,
    availability: item.availability, notes: item.notes,
  }));
  return {
    id: quote.id,
    year: quote.year,
    quote_date: quote.quote_date,
    status: quote.status,
    client_id: quote.client_id,
    client_name: quote.client_name,
    client_address: quote.client_address,
    client_city: quote.client_city,
    client_postal_code: quote.client_postal_code,
    client_province: quote.client_province,
    client_vat: quote.client_vat,
    client_fiscal_code: quote.client_fiscal_code,
    client_sdi: quote.client_sdi,
    client_pec: quote.client_pec,
    client_phones: quote.client_phones,
    destination_name: quote.destination_name,
    destination_address: quote.destination_address,
    destination_city: quote.destination_city,
    subject: quote.subject,
    validity_days: quote.validity_days,
    payment_method: quote.payment_method,
    delivery_date: quote.delivery_date,
    delivery_terms: quote.delivery_terms,
    default_supplier: quote.default_supplier,
    global_discount_pct: quote.global_discount_pct,
    internal_notes: quote.internal_notes,
    customer_notes: quote.customer_notes,
    items: [...savedItems, ...Array.from({ length: Math.max(0, 500 - savedItems.length) }, createEmptyQuoteItem)],
  };
}

export function toQuoteInput(draft: QuoteDraft): QuoteDraftInput {
  return {
    ...draft,
    items: draft.items.filter(isQuoteDraftItemActive).map((item) => ({
      ...item,
      quantity: String(item.quantity ?? "").trim() || "1",
      purchase_price: money(item.purchase_price),
      base_unit_price: item.base_unit_price ? money(item.base_unit_price) : null,
      forced_unit_price: item.forced_unit_price ? money(item.forced_unit_price) : null,
    })),
  };
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

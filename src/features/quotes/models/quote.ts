import type { MonetaryValue } from "@/shared/domain/monetaryValue";
import type { BaseEntity } from "@/shared/types/baseEntity";

export type QuoteStatus = "bozza" | "inviato" | "confermato" | "rifiutato";
export type QuoteVatRate = 0 | 4 | 10 | 22;

export interface QuoteTotals {
  taxable: MonetaryValue;
  vat: MonetaryValue;
  total: MonetaryValue;
  cost: MonetaryValue;
  gross_profit: MonetaryValue;
  markup_pct: number | null;
  margin_pct: number | null;
}

export interface Quote extends BaseEntity {
  quote_number: number | null;
  year: number;
  quote_date: string;
  status: QuoteStatus;
  client_id: string | null;
  client_name: string;
  client_address: string | null;
  client_city: string | null;
  client_postal_code: string | null;
  client_province: string | null;
  client_vat: string | null;
  client_fiscal_code: string | null;
  client_sdi: string | null;
  client_pec: string | null;
  client_phones: { id: string | number; nome: string; numero: string }[];
  destination_name: string | null;
  destination_address: string | null;
  destination_city: string | null;
  subject: string;
  global_discount_pct: number;
  validity_days: number;
  payment_method: string | null;
  delivery_date: string | null;
  delivery_terms: string | null;
  default_supplier: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  converted_ddt_id: string | null;
  totals: QuoteTotals;
  items: QuoteItem[];
}

export interface QuoteItem extends BaseEntity {
  quote_id: string;
  row_index: number;
  product_id: string | null;
  supplier: string | null;
  supplier_item_code: string | null;
  code: string | null;
  description: string;
  unit: string;
  quantity: string;
  purchase_price: MonetaryValue;
  markup_pct: number | null;
  base_unit_price: MonetaryValue;
  effective_unit_price: MonetaryValue;
  forced_unit_price: MonetaryValue | null;
  discount_pct: number;
  effective_markup_pct: number | null;
  margin_pct: number | null;
  net_amount: MonetaryValue;
  cost_total: MonetaryValue;
  gross_profit: MonetaryValue;
  vat_rate: QuoteVatRate;
  vat_amount: MonetaryValue;
  availability: string | null;
  notes: string | null;
}

export interface QuoteItemInput {
  id?: string;
  product_id?: string | null;
  supplier?: string | null;
  supplier_item_code?: string | null;
  code?: string | null;
  description: string;
  unit?: string;
  quantity: string | number;
  purchase_price: MonetaryValue;
  markup_pct?: number | null;
  base_unit_price?: MonetaryValue | null;
  forced_unit_price?: MonetaryValue | null;
  discount_pct?: number;
  vat_rate: QuoteVatRate;
  availability?: string | null;
  notes?: string | null;
}

export interface QuoteDraftInput {
  id?: string;
  status?: QuoteStatus;
  year?: number;
  quote_date?: string;
  client_id?: string | null;
  client_name?: string;
  client_address?: string | null;
  client_city?: string | null;
  client_postal_code?: string | null;
  client_province?: string | null;
  client_vat?: string | null;
  client_fiscal_code?: string | null;
  client_sdi?: string | null;
  client_pec?: string | null;
  client_phones?: Quote["client_phones"];
  destination_name?: string | null;
  destination_address?: string | null;
  destination_city?: string | null;
  subject?: string;
  global_discount_pct?: number;
  validity_days?: number;
  payment_method?: string | null;
  delivery_date?: string | null;
  delivery_terms?: string | null;
  default_supplier?: string | null;
  internal_notes?: string | null;
  customer_notes?: string | null;
  items: QuoteItemInput[];
}

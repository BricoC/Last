import type { MonetaryValue } from "@/shared/domain/monetaryValue";
import type { QuoteVatRate } from "./quote";

export interface QuoteFavoriteItem {
  id: string;
  category: string;
  description: string;
  unit: string;
  supplier: string | null;
  supplier_item_code: string | null;
  code: string | null;
  purchase_price: MonetaryValue;
  markup_pct: number | null;
  base_unit_price: MonetaryValue;
  forced_unit_price: MonetaryValue | null;
  discount_pct: number;
  vat_rate: QuoteVatRate;
  availability: string | null;
  notes: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface QuoteFavoriteItemInput {
  id?: string;
  category?: string;
  description: string;
  unit?: string;
  supplier?: string | null;
  supplier_item_code?: string | null;
  code?: string | null;
  purchase_price?: MonetaryValue | string | number;
  markup_pct?: number | null;
  base_unit_price?: MonetaryValue | string | number | null;
  forced_unit_price?: MonetaryValue | string | number | null;
  discount_pct?: number;
  vat_rate?: QuoteVatRate;
  availability?: string | null;
  notes?: string | null;
}

export interface QuoteHistoricalItem {
  id: string;
  quote_id: string;
  quote_number: number | null;
  year: number;
  quote_date: string;
  client_name: string;
  description: string;
  unit: string;
  quantity: string;
  supplier: string | null;
  supplier_item_code: string | null;
  code: string | null;
  purchase_price: MonetaryValue;
  markup_pct: number | null;
  base_unit_price: MonetaryValue;
  effective_unit_price: MonetaryValue;
  forced_unit_price: MonetaryValue | null;
  discount_pct: number;
  vat_rate: QuoteVatRate;
  availability: string | null;
  notes: string | null;
}


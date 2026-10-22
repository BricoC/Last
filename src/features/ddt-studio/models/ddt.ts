import { BaseEntity } from "@/shared/types/baseEntity";
import { MonetaryValue } from "@/shared/domain/monetaryValue";

export type DdtStatus = "bozza" | "confermato" | "annullato";
export type DdtAccountOrBalance = "" | "in_conto" | "a_saldo";

export interface DdtItem {
  id: string;
  ddt_id: string;
  row_index: number;
  product_id?: string;
  code?: string;
  description: string;
  unit: string;
  quantity: string;
  unit_price: MonetaryValue; // 5 decimali
  discount_pct: string;
  net_amount: MonetaryValue;  // 5 decimali
  vat_rate?: number | string | null;
  vat_amount: MonetaryValue;  // 5 decimali
  purchase_price?: MonetaryValue; // 5 decimali
}

export interface DdtDocument extends BaseEntity {
  doc_number: number | null; // null per le bozze
  year: number;
  doc_date: string; // YYYY-MM-DD
  status: DdtStatus;
  
  // Cliente & Destinazione
  client_id?: string;
  client_name: string;
  client_address?: string;
  client_city?: string;
  client_vat?: string;
  client_fiscal_code?: string;
  client_sdi?: string;
  client_phones?: { id: number | string; nome: string; numero: string }[];
  
  destination_name?: string;
  destination_address?: string;
  destination_city?: string;

  // Dati Commerciali
  transport_reason: string;
  payment_method?: string;
  order_reference?: string;
  account_or_balance: DdtAccountOrBalance;
  operator: string;

  // Logistica
  goods_appearance?: string;
  carriage_terms: string;
  packages_count?: string;
  weight_kg?: string;
  carrier?: string;
  pickup_date_time?: string;
  internal_notes?: string;

  // Totali
  total_taxable: MonetaryValue; // 5 decimali
  total_vat: MonetaryValue;     // 5 decimali
  total_document: MonetaryValue;// 5 decimali

  // Righe
  items: DdtItem[];
}

export interface DdtTotals {
  totale_imponibile: MonetaryValue;
  totale_iva: MonetaryValue;
  totale_documento: MonetaryValue;
  totale_acquisto?: MonetaryValue;
  totale_ricavo?: MonetaryValue;
  ricarico_percentuale?: number;
}

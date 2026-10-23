import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { MonetaryValue } from "@/shared/domain/monetaryValue";
import type {
  Quote,
  QuoteDraftInput,
  QuoteItem,
  QuoteItemInput,
  QuoteStatus,
  QuoteVatRate,
} from "../models/quote";
import { calculateQuoteItem, calculateQuoteTotals } from "../utils/quoteCalculations";

export class QuoteRepository {
  public async getQuotes(search = ""): Promise<Quote[]> {
    const db = await getDatabase();
    const term = search.trim();
    const rows = await db.select<QuoteRow[]>(
      `SELECT * FROM quotes WHERE deleted_at IS NULL
       AND (? = '' OR client_name LIKE ? OR subject LIKE ? OR CAST(quote_number AS TEXT) LIKE ?)
       ORDER BY quote_date DESC, updated_at DESC LIMIT 200`,
      [term, `%${term}%`, `%${term}%`, `%${term}%`]
    );
    return rows.map((row) => this.mapQuote(row, []));
  }

  public async getQuoteById(id: string): Promise<Quote | null> {
    const db = await getDatabase();
    const quotes = await db.select<QuoteRow[]>(
      "SELECT * FROM quotes WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );
    if (!quotes[0]) return null;
    const rows = await db.select<QuoteItemRow[]>(
      "SELECT * FROM quote_items WHERE quote_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC",
      [id]
    );
    return this.mapQuote(quotes[0], rows.map(this.mapItem));
  }

  public async saveDraft(input: QuoteDraftInput): Promise<Quote> {
    const existing = input.id ? await this.getQuoteById(input.id) : null;
    if (input.id && !existing) throw new Error("Preventivo da aggiornare non trovato.");
    const now = new Date().toISOString();
    const quoteId = input.id || crypto.randomUUID();
    const globalDiscount = input.global_discount_pct ?? 0;
    if (!Number.isFinite(globalDiscount) || globalDiscount > 100) {
      throw new RangeError("Lo sconto globale deve essere valido e non può superare il 100%.");
    }

    const activeItems = input.items.filter((item) => item.description.trim().length > 0);
    const calculations = activeItems.map((item) => calculateQuoteItem(item, globalDiscount));
    const totals = calculateQuoteTotals(calculations);
    const payload = {
      id: quoteId,
      year: input.year ?? localYear(),
      quote_date: input.quote_date ?? localDate(),
      created_at: existing?.created_at ?? now,
      updated_at: now,
      updated_by: "system",
      client_id: input.client_id ?? null,
      client_name: input.client_name?.trim() ?? "",
      client_address: input.client_address ?? null,
      client_city: input.client_city ?? null,
      client_postal_code: input.client_postal_code ?? null,
      client_province: input.client_province ?? null,
      client_vat: input.client_vat ?? null,
      client_fiscal_code: input.client_fiscal_code ?? null,
      client_sdi: input.client_sdi ?? null,
      client_pec: input.client_pec ?? null,
      client_phones_json: JSON.stringify(input.client_phones ?? []),
      destination_name: input.destination_name ?? null,
      destination_address: input.destination_address ?? null,
      destination_city: input.destination_city ?? null,
      subject: input.subject?.trim() ?? "",
      global_discount_pct: String(globalDiscount),
      validity_days: input.validity_days ?? 30,
      payment_method: input.payment_method ?? null,
      delivery_date: input.delivery_date ?? null,
      delivery_terms: input.delivery_terms ?? null,
      default_supplier: input.default_supplier ?? null,
      internal_notes: input.internal_notes ?? null,
      customer_notes: input.customer_notes ?? null,
      total_taxable_subunits: totals.taxable.toSubunits(),
      total_vat_subunits: totals.vat.toSubunits(),
      total_document_subunits: totals.total.toSubunits(),
      total_cost_subunits: totals.cost.toSubunits(),
      total_profit_subunits: totals.gross_profit.toSubunits(),
      items: activeItems.map((item, index) => this.toItemPayload(
        item, calculations[index], index + 1
      )),
    };

    await invoke("save_quote_transaction", { payload });
    const saved = await this.getQuoteById(quoteId);
    if (!saved) throw new Error("Errore recupero preventivo salvato.");
    return saved;
  }

  public async softDeleteQuote(id: string): Promise<void> {
    await invoke("soft_delete_quote_transaction", {
      id,
      deletedAt: new Date().toISOString(),
      updatedBy: "system",
    });
  }

  private toItemPayload(
    item: QuoteItemInput,
    calculation: ReturnType<typeof calculateQuoteItem>,
    rowIndex: number
  ) {
    return {
      id: item.id || crypto.randomUUID(),
      row_index: rowIndex,
      product_id: item.product_id ?? null,
      supplier: item.supplier ?? null,
      supplier_item_code: item.supplier_item_code ?? null,
      code: item.code ?? null,
      description: item.description.trim(),
      unit: item.unit?.trim() || "NR",
      quantity: String(item.quantity),
      purchase_price_subunits: item.purchase_price.toSubunits(),
      markup_pct: calculation.markup_pct === null ? null : String(calculation.markup_pct),
      base_unit_price_subunits: calculation.base_unit_price.toSubunits(),
      effective_unit_price_subunits: calculation.effective_unit_price.toSubunits(),
      forced_unit_price_subunits: item.forced_unit_price?.toSubunits() ?? null,
      discount_pct: String(item.discount_pct ?? 0),
      effective_markup_pct: calculation.effective_markup_pct === null
        ? null : String(calculation.effective_markup_pct),
      margin_pct: calculation.margin_pct === null ? null : String(calculation.margin_pct),
      net_amount_subunits: calculation.net_amount.toSubunits(),
      cost_total_subunits: calculation.cost_total.toSubunits(),
      gross_profit_subunits: calculation.gross_profit.toSubunits(),
      vat_rate: item.vat_rate,
      vat_amount_subunits: calculation.vat_amount.toSubunits(),
      availability: item.availability ?? null,
      notes: item.notes ?? null,
    };
  }

  private mapQuote(row: QuoteRow, items: QuoteItem[]): Quote {
    return {
      id: row.id,
      quote_number: row.quote_number,
      year: row.year,
      quote_date: row.quote_date,
      status: normalizeStatus(row.status),
      client_id: row.client_id,
      client_name: row.client_name,
      client_address: row.client_address,
      client_city: row.client_city,
      client_postal_code: row.client_postal_code,
      client_province: row.client_province,
      client_vat: row.client_vat,
      client_fiscal_code: row.client_fiscal_code,
      client_sdi: row.client_sdi,
      client_pec: row.client_pec,
      client_phones: parsePhones(row.client_phones_json),
      destination_name: row.destination_name,
      destination_address: row.destination_address,
      destination_city: row.destination_city,
      subject: row.subject,
      global_discount_pct: Number(row.global_discount_pct),
      validity_days: row.validity_days,
      payment_method: row.payment_method,
      delivery_date: row.delivery_date,
      delivery_terms: row.delivery_terms,
      default_supplier: row.default_supplier,
      internal_notes: row.internal_notes,
      customer_notes: row.customer_notes,
      converted_ddt_id: row.converted_ddt_id,
      totals: {
        taxable: MonetaryValue.fromSubunits(row.total_taxable_subunits),
        vat: MonetaryValue.fromSubunits(row.total_vat_subunits),
        total: MonetaryValue.fromSubunits(row.total_document_subunits),
        cost: MonetaryValue.fromSubunits(row.total_cost_subunits),
        gross_profit: MonetaryValue.fromSubunits(row.total_profit_subunits),
        markup_pct: percentage(row.total_profit_subunits, row.total_cost_subunits),
        margin_pct: percentage(row.total_profit_subunits, row.total_taxable_subunits),
      },
      items,
      created_at: row.created_at,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      deleted_at: row.deleted_at,
      sync_status: row.sync_status,
    };
  }

  private mapItem(row: QuoteItemRow): QuoteItem {
    return {
      id: row.id,
      quote_id: row.quote_id,
      row_index: row.row_index,
      product_id: row.product_id,
      supplier: row.supplier,
      supplier_item_code: row.supplier_item_code,
      code: row.code,
      description: row.description,
      unit: row.unit,
      quantity: row.quantity,
      purchase_price: MonetaryValue.fromSubunits(row.purchase_price_subunits),
      markup_pct: nullableNumber(row.markup_pct),
      base_unit_price: MonetaryValue.fromSubunits(row.base_unit_price_subunits),
      effective_unit_price: MonetaryValue.fromSubunits(row.effective_unit_price_subunits),
      forced_unit_price: row.forced_unit_price_subunits === null
        ? null : MonetaryValue.fromSubunits(row.forced_unit_price_subunits),
      discount_pct: Number(row.discount_pct),
      effective_markup_pct: nullableNumber(row.effective_markup_pct),
      margin_pct: nullableNumber(row.margin_pct),
      net_amount: MonetaryValue.fromSubunits(row.net_amount_subunits),
      cost_total: MonetaryValue.fromSubunits(row.cost_total_subunits),
      gross_profit: MonetaryValue.fromSubunits(row.gross_profit_subunits),
      vat_rate: row.vat_rate as QuoteVatRate,
      vat_amount: MonetaryValue.fromSubunits(row.vat_amount_subunits),
      availability: row.availability,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      deleted_at: row.deleted_at,
      sync_status: row.sync_status,
    };
  }
}

interface QuoteRow {
  id: string; quote_number: number | null; year: number; quote_date: string; status: string;
  client_id: string | null; client_name: string; client_address: string | null; client_city: string | null;
  client_postal_code: string | null; client_province: string | null; client_vat: string | null;
  client_fiscal_code: string | null; client_sdi: string | null; client_pec: string | null;
  client_phones_json: string; destination_name: string | null; destination_address: string | null;
  destination_city: string | null; subject: string; global_discount_pct: string; validity_days: number;
  payment_method: string | null; delivery_date: string | null; delivery_terms: string | null;
  default_supplier: string | null; internal_notes: string | null; customer_notes: string | null;
  converted_ddt_id: string | null; total_taxable_subunits: number; total_vat_subunits: number;
  total_document_subunits: number; total_cost_subunits: number; total_profit_subunits: number;
  created_at: string; updated_at: string; updated_by: string; deleted_at: string | null;
  sync_status: "synced" | "pending";
}

interface QuoteItemRow {
  id: string; quote_id: string; row_index: number; product_id: string | null; supplier: string | null;
  supplier_item_code: string | null; code: string | null; description: string; unit: string;
  quantity: string; purchase_price_subunits: number; markup_pct: string | null;
  base_unit_price_subunits: number; effective_unit_price_subunits: number;
  forced_unit_price_subunits: number | null; discount_pct: string; effective_markup_pct: string | null;
  margin_pct: string | null; net_amount_subunits: number; cost_total_subunits: number;
  gross_profit_subunits: number; vat_rate: number; vat_amount_subunits: number;
  availability: string | null; notes: string | null; created_at: string; updated_at: string;
  updated_by: string; deleted_at: string | null; sync_status: "synced" | "pending";
}

function normalizeStatus(value: string): QuoteStatus {
  return ["bozza", "inviato", "confermato", "rifiutato"].includes(value)
    ? value as QuoteStatus : "bozza";
}

function nullableNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

function parsePhones(value: string): Quote["client_phones"] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Quote["client_phones"][number] =>
      typeof item === "object" && item !== null
      && (typeof item.id === "number" || typeof item.id === "string")
      && typeof item.nome === "string" && typeof item.numero === "string"
    );
  } catch {
    return [];
  }
}

function localDate(): string {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

function localYear(): number {
  return new Date().getFullYear();
}

export const quoteRepository = new QuoteRepository();

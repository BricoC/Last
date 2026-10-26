import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { MonetaryValue } from "@/shared/domain/monetaryValue";
import type {
  Quote,
  QuoteDraftInput,
  QuoteItem,
  QuoteStatus,
  QuoteVatRate,
} from "../models/quote";
import { buildQuoteDdtConversion } from "./quoteDdtConversion";
import { buildQuoteSavePayload } from "./quotePayload";
import { quoteToDraft, toQuoteInput } from "../models/quoteDraft";
import { buildMultiTermSqlSearch } from "@/shared/utils/multiTermSqlSearch";

export class QuoteRepository {
  public async getQuotes(search = ""): Promise<Quote[]> {
    const db = await getDatabase();
    const searchSql = buildMultiTermSqlSearch(search, [
      "client_name", "subject", "quote_date", "CAST(quote_number AS TEXT)", "CAST(year AS TEXT)", "status",
    ], { numberedParameters: false });
    const rows = await db.select<QuoteRow[]>(
      `SELECT * FROM quotes WHERE deleted_at IS NULL
       ${searchSql.sql ? `AND (${searchSql.sql})` : ""}
       ORDER BY quote_date DESC, updated_at DESC LIMIT 200`,
      searchSql.params
    );
    return rows.map((row) => this.mapQuote(row, []));
  }

  public async duplicateQuote(id: string): Promise<Quote> {
    const source = await this.getQuoteById(id);
    if (!source) throw new Error("Preventivo da copiare non trovato.");
    const today = new Date();
    const draft = quoteToDraft(source);
    const copied = {
      ...draft,
      id: undefined,
      status: "bozza" as const,
      year: today.getFullYear(),
      quote_date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
      items: draft.items.map((item) => ({ ...item, id: undefined })),
    };
    return this.saveDraft(toQuoteInput(copied));
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
    const payload = buildQuoteSavePayload(input, existing, now, quoteId);
    await invoke("save_quote_transaction", { payload });
    const saved = await this.getQuoteById(quoteId);
    if (!saved) throw new Error("Errore recupero preventivo salvato.");
    return saved;
  }

  public async convertToDdt(input: QuoteDraftInput) {
    const now = new Date().toISOString();
    const quoteId = input.id || crypto.randomUUID();
    const activeItems = input.items.filter((item) => item.description.trim());
    if (!activeItems.length) throw new Error("Inserisci almeno una riga descrittiva prima di convertire il preventivo.");
    const quotePayload = buildQuoteSavePayload(input, null, now, quoteId);
    const conversion = buildQuoteDdtConversion(input, crypto.randomUUID());
    await invoke<string>("convert_quote_to_ddt_transaction", {
      quotePayload, ddtPayload: conversion.payload,
    });
    return { quoteId, ...conversion };
  }

  public async softDeleteQuote(id: string): Promise<void> {
    await invoke("soft_delete_quote_transaction", {
      id,
      deletedAt: new Date().toISOString(),
      updatedBy: "system",
    });
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

export const quoteRepository = new QuoteRepository();

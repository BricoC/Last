import { applyLocalDatabaseBatch } from "@/shared/data-layer/localDatabaseBatch";
import { pendingCloudWrite } from "@/shared/data-layer/pendingCloudOperations";
import { getLastKnownSupabaseProjectUrl } from "@/shared/services/supabaseConfigCache";
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { MonetaryValue } from "@/shared/domain/monetaryValue";
import type {
  Quote,
  QuoteDraftInput,
  QuoteItem,
  QuoteStatus,
  QuoteVatRate,
  TrashQuoteRow,
} from "../models/quote";
import { buildQuoteDdtConversion } from "./quoteDdtConversion";
import { buildQuoteSavePayload } from "./quotePayload";
import { quoteToDraft, toQuoteInput } from "../models/quoteDraft";
import { buildMultiTermSqlSearch } from "@/shared/utils/multiTermSqlSearch";
import { QuoteSyncService } from "./quoteSyncService";

export class QuoteRepository {
  public async getQuotes(search = ""): Promise<Quote[]> {
    const db = await getDatabase();
    try {
      await QuoteSyncService.pullQuotes();
    } catch (err) {
      console.warn("[QuoteRepository] Sync pullQuotes non riuscito:", err);
    }
    await this.ensureQuoteNumbersAssigned();
    const searchSql = buildMultiTermSqlSearch(search, [
      "client_name",
      "subject",
      "quote_date",
      "CAST(quote_number AS TEXT)",
      "printf('%d.%03d', year, quote_number)",
      "printf('%03d', quote_number)",
      "CAST(year AS TEXT)",
      "status",
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
      quote_number: null,
      status: "bozza" as const,
      year: today.getFullYear(),
      quote_date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
      items: draft.items.map((item) => ({ ...item, id: undefined })),
    };
    return this.saveDraft(toQuoteInput(copied));
  }

  public async getQuoteById(id: string, allowRemote = true): Promise<Quote | null> {
    const db = await getDatabase();
    let quotes = await db.select<QuoteRow[]>(
      "SELECT * FROM quotes WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );
    if (!quotes[0] && allowRemote) {
      try {
        await QuoteSyncService.pullQuoteById(id);
      } catch (err) {
        console.warn("[QuoteRepository] pullQuoteById non riuscito:", err);
      }
      quotes = await db.select<QuoteRow[]>(
        "SELECT * FROM quotes WHERE id = $1 AND deleted_at IS NULL",
        [id]
      );
    }
    if (!quotes[0]) return null;

    let rows = await db.select<QuoteItemRow[]>(
      "SELECT * FROM quote_items WHERE quote_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC",
      [id]
    );

    // Se in locale non ci sono righe attive, tenta il recupero immediato da Supabase Cloud
    if (rows.length === 0 && allowRemote) {
      try {
        await QuoteSyncService.pullQuoteById(id);
      } catch (err) {
        console.warn("[QuoteRepository] pullQuoteById per righe vuote non riuscito:", err);
      }
      rows = await db.select<QuoteItemRow[]>(
        "SELECT * FROM quote_items WHERE quote_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC",
        [id]
      );
    }

    return this.mapQuote(quotes[0], rows.map(this.mapItem));
  }

  public async getArchivedQuoteForSync(id: string): Promise<Quote | null> {
    const db = await getDatabase();
    const [quote] = await db.select<QuoteRow[]>("SELECT * FROM quotes WHERE id = $1 AND deleted_at IS NOT NULL", [id]);
    if (!quote) return null;
    const items = await db.select<QuoteItemRow[]>(
      "SELECT * FROM quote_items WHERE quote_id = $1 AND deleted_at = $2 ORDER BY row_index",
      [id, quote.deleted_at],
    );
    return this.mapQuote(quote, items.map(this.mapItem));
  }

  public async generateUniqueQuoteNumber(year: number): Promise<number> {
    return this.generateNextQuoteNumber(year);
  }

  /**
   * Genera il prossimo numero progressivo per l'anno specificato.
   * Il numero è STRETTAMENTE univoco: se un preventivo viene cancellato o eliminato,
   * quel numero è perso per sempre e la sequenza avanza al successivo senza mai riutilizzarlo.
   */
  public async generateNextQuoteNumber(year: number): Promise<number> {
    const db = await getDatabase();

    // 1. Leggi l'ultimo numero registrato nella tabella sequenze persistente
    let seqMax = 0;
    try {
      const seqRows = await db.select<{ last_number: number }[]>(
        "SELECT last_number FROM quote_sequences WHERE year = $1",
        [year]
      );
      seqMax = seqRows[0]?.last_number ?? 0;
    } catch (err) {
      console.warn("[QuoteRepository] Lettura quote_sequences:", err);
    }

    // 2. Leggi il massimo quote_number da tutti i preventivi locali (compresi quelli cancellati/soft-deleted)
    let quotesMax = 0;
    try {
      const rows = await db.select<{ max_num: number | null }[]>(
        "SELECT MAX(quote_number) as max_num FROM quotes WHERE year = $1",
        [year]
      );
      quotesMax = rows[0]?.max_num ?? 0;
    } catch (err) {
      console.warn("[QuoteRepository] Lettura MAX quotes:", err);
    }

    // 3. Leggi il massimo quote_number dal cestino locale
    let trashMax = 0;
    try {
      const trashRows = await db.select<{ max_num: number | null }[]>(
        "SELECT MAX(quote_number) as max_num FROM quotes_trash WHERE year = $1",
        [year]
      );
      trashMax = trashRows[0]?.max_num ?? 0;
    } catch (err) {
      console.warn("[QuoteRepository] Lettura MAX quotes_trash:", err);
    }

    // 4. Leggi la sequenza remota da Supabase Cloud (se online)
    let remoteMax = 0;
    try {
      remoteMax = await QuoteSyncService.getRemoteMaxQuoteNumber(year);
    } catch (err) {
      console.warn("[QuoteRepository] Lettura remoteMax da Supabase:", err);
    }

    const currentMax = Math.max(seqMax, quotesMax, trashMax, remoteMax, 0);
    const nextNumber = currentMax + 1;

    // Registra subito il nuovo numero nella sequenza locale persistente
    try {
      await db.execute(
        `INSERT INTO quote_sequences (year, last_number) VALUES ($1, $2)
         ON CONFLICT(year) DO UPDATE SET last_number = MAX(last_number, excluded.last_number)`,
        [year, nextNumber]
      );
    } catch (err) {
      console.warn("[QuoteRepository] Salvataggio locale quote_sequences:", err);
    }

    // Aggiorna la sequenza anche su Supabase Cloud (asincrono / non bloccante)
    void QuoteSyncService.updateRemoteSequence(year, nextNumber);

    return nextNumber;
  }

  private async ensureQuoteNumbersAssigned(): Promise<void> {
    try {
      const db = await getDatabase();
      // Assegna solo a preventivi che non hanno ancora un numero. NON rinumerare o ricomprimere mai i numeri esistenti!
      const missing = await db.select<{ id: string; year: number }[]>(
        "SELECT id, year FROM quotes WHERE quote_number IS NULL AND deleted_at IS NULL ORDER BY year ASC, created_at ASC"
      );

      for (const r of missing) {
        const nextSeq = await this.generateNextQuoteNumber(r.year);
        await db.execute("UPDATE quotes SET quote_number = $1 WHERE id = $2", [nextSeq, r.id]);
      }
    } catch (err) {
      console.warn("[QuoteRepository] Assegnazione automatica quote_number:", err);
    }
  }

  public async saveDraft(input: QuoteDraftInput): Promise<Quote> {
    const existing = input.id ? await this.getQuoteById(input.id) : null;
    if (input.id && !existing) throw new Error("Preventivo da aggiornare non trovato.");
    const year = input.year ?? (existing?.year ?? new Date().getFullYear());
    let quoteNumber = existing?.quote_number ?? input.quote_number ?? null;
    if (quoteNumber == null) {
      quoteNumber = await this.generateUniqueQuoteNumber(year);
    }
    const inputWithNumber: QuoteDraftInput = {
      ...input,
      year,
      quote_number: quoteNumber,
    };
    const now = new Date().toISOString();
    const quoteId = input.id || crypto.randomUUID();
    const payload = buildQuoteSavePayload(inputWithNumber, existing, now, quoteId);
    await invoke("save_quote_transaction", { payload });
    const activeProjectUrl = getLastKnownSupabaseProjectUrl();
    if (activeProjectUrl) {
      const db = await getDatabase();
      await db.execute("UPDATE quotes SET project_url = COALESCE(project_url, $1) WHERE id = $2", [
        activeProjectUrl,
        quoteId,
      ]);
    }
    const saved = await this.getQuoteById(quoteId);
    if (!saved) throw new Error("Errore recupero preventivo salvato.");
    try {
      await QuoteSyncService.retryPendingChanges();
    } catch (err) {
      console.warn("[QuoteRepository] Sync pushQuote su Supabase non riuscito:", err);
    }
    return saved;
  }

  public async convertToDdt(input: QuoteDraftInput) {
    const now = new Date().toISOString();
    const quoteId = input.id || crypto.randomUUID();
    const existing = input.id ? await this.getQuoteById(input.id) : null;
    const year = input.year ?? (existing?.year ?? new Date().getFullYear());
    let quoteNumber = existing?.quote_number ?? input.quote_number ?? null;
    if (quoteNumber == null) {
      quoteNumber = await this.generateUniqueQuoteNumber(year);
    }
    const activeItems = input.items.filter((item) => item.description.trim());
    if (!activeItems.length) throw new Error("Inserisci almeno una riga descrittiva prima di convertire il preventivo.");
    const inputWithNumber: QuoteDraftInput = { ...input, year, quote_number: quoteNumber };
    const quotePayload = buildQuoteSavePayload(inputWithNumber, existing, now, quoteId);
    const conversion = buildQuoteDdtConversion(inputWithNumber, crypto.randomUUID());
    await invoke<string>("convert_quote_to_ddt_transaction", {
      quotePayload, ddtPayload: conversion.payload,
    });
    return { quoteId, quoteNumber, ...conversion };
  }

  /**
   * Sposta un preventivo nel Cestino (massimo 5 elementi memorizzati sia in locale che su Supabase Cloud).
   * Il numero di preventivo rimane consumato e non verrà mai riutilizzato.
   */
  public async softDeleteQuote(id: string): Promise<void> {
    const quote = await this.getQuoteById(id);
    if (!quote) return;
    const deletedAt = new Date().toISOString();
    const remote = QuoteSyncService.mapQuoteToSupabase(quote);
    await applyLocalDatabaseBatch([
      { sql: `UPDATE quotes SET deleted_at = $1, updated_at = $1, updated_by = 'system', sync_status = 'pending', project_url = COALESCE(project_url, $4)
        WHERE id = $2 AND deleted_at IS NULL AND updated_at = $3`,
        params: [deletedAt, id, quote.updated_at, getLastKnownSupabaseProjectUrl()], expectedRows: 1 },
      { sql: `UPDATE quote_items SET deleted_at = $1, updated_at = $1, updated_by = 'system', sync_status = 'pending'
        WHERE quote_id = $2 AND deleted_at IS NULL`, params: [deletedAt, id] },
      { sql: `INSERT INTO quotes_trash (id, quote_number, numero, year, quote_date, client_name, subject,
          total_document_subunits, data_json, deleted_at, deleted_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'system')
        ON CONFLICT(id) DO UPDATE SET quote_number = excluded.quote_number, numero = excluded.numero,
          year = excluded.year, quote_date = excluded.quote_date, client_name = excluded.client_name,
          subject = excluded.subject, total_document_subunits = excluded.total_document_subunits,
          data_json = excluded.data_json, deleted_at = excluded.deleted_at, deleted_by = excluded.deleted_by`,
        params: [id, quote.quote_number, remote.numero, quote.year, quote.quote_date, quote.client_name,
          quote.subject, quote.totals.total.toSubunits(), JSON.stringify(remote), deletedAt] },
      pendingCloudWrite(
        "quotes",
        id,
        "trash",
        { ...remote, deleted_at: deletedAt, updated_at: deletedAt, deleted_by: "system" },
        (quote as typeof quote & { project_url?: string | null }).project_url ?? getLastKnownSupabaseProjectUrl()
      ),
      { sql: `DELETE FROM quotes_trash WHERE id NOT IN (
          SELECT id FROM quotes_trash ORDER BY deleted_at DESC, id DESC LIMIT 5
        )`, params: [] },
    ]);
    await QuoteSyncService.retryPendingChanges();
  }

  /**
   * Restituisce i preventivi attualmente nel Cestino (massimo 5, ordinati dal più recente).
   */
  public async getTrashQuotes(): Promise<TrashQuoteRow[]> {
    const db = await getDatabase();
    try {
      await QuoteSyncService.pullTrashQuotes();
    } catch (err) {
      console.warn("[QuoteRepository] Sync pullTrashQuotes:", err);
    }

    const rows = await db.select<TrashQuoteRow[]>(
      "SELECT * FROM quotes_trash ORDER BY deleted_at DESC LIMIT 5"
    );
    return rows;
  }

  /**
   * Restituisce il conteggio attuale di preventivi nel Cestino (da 0 a 5).
   */
  public async getTrashCount(): Promise<number> {
    try {
      const db = await getDatabase();
      const rows = await db.select<{ count: number }[]>(
        "SELECT COUNT(*) as count FROM quotes_trash"
      );
      return rows[0]?.count ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Ripristina un preventivo dal Cestino all'archivio attivo.
   * Il preventivo riprende esattamente il proprio numero originale e stato,
   * e viene rimosso dal cestino locale e da Supabase Cloud.
   */
  public async restoreQuoteFromTrash(id: string): Promise<Quote | null> {
    const db = await getDatabase();
    const [trash] = await db.select<TrashQuoteRow[]>("SELECT * FROM quotes_trash WHERE id = $1", [id]);
    if (!trash) return null;
    const now = new Date().toISOString();
    const [local] = await db.select<Array<{ id: string }>>("SELECT id FROM quotes WHERE id = $1", [id]);
    const finish = [
      { sql: "DELETE FROM quotes_trash WHERE id = $1 AND deleted_at = $2", params: [id, trash.deleted_at], expectedRows: 1 },
      pendingCloudWrite("quotes", id, "restore", null),
    ];
    if (local) {
      await applyLocalDatabaseBatch([
        { sql: "UPDATE quotes SET deleted_at = NULL, updated_at = $1, sync_status = 'pending', project_url = COALESCE(project_url, $3) WHERE id = $2",
          params: [now, id, getLastKnownSupabaseProjectUrl()], expectedRows: 1 },
        { sql: "UPDATE quote_items SET deleted_at = NULL, updated_at = $1, sync_status = 'pending' WHERE quote_id = $2",
          params: [now, id] },
        ...finish,
      ]);
    } else {
      await QuoteSyncService.restoreTrashSnapshot(trash, now, finish);
    }
    const restored = await this.getQuoteById(id, false);
    await QuoteSyncService.retryPendingChanges();
    return restored;
  }

  public async deleteTrashPermanently(id: string): Promise<void> {
    await getDatabase();
    await applyLocalDatabaseBatch([
      { sql: "DELETE FROM quotes_trash WHERE id = $1", params: [id] },
      pendingCloudWrite("quotes", id, "cleanup", null),
    ]);
    await QuoteSyncService.retryPendingChanges();
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

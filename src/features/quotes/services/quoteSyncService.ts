import { flushPendingCloudOperations, getPendingOperationFailure } from "@/shared/data-layer/pendingCloudOperations";
import type { TrashQuoteRow } from "../models/quote";
import { supabaseFetch } from "@/shared/services/supabaseSession";
import { getDatabase } from "@/shared/data-layer/database";
import { applyLocalDatabaseBatch, type SqliteWrite } from "@/shared/data-layer/localDatabaseBatch";
import type { Quote } from "../models/quote";
import { formatQuoteCode } from "../models/quoteDraft";
import {
  createCachedSupabaseConfigLoader,
  matchesActiveSupabaseProject,
  normalizeSupabaseProjectUrl,
  type CachedSupabaseConfig,
} from "@/shared/services/supabaseConfigCache";
import { money } from "@/shared/domain/monetaryValue";
import { parseItalianNumber } from "@/shared/utils/numberUtils";

export const getSupabaseCredentials = createCachedSupabaseConfigLoader("QuoteSyncService");

function cloudVatRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const rate = parseItalianNumber(value);
  return rate !== null && Number.isFinite(rate) && rate >= 0 && rate <= 100 ? Math.round(rate) : null;
}

function parseDataJson(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function extractAndNormalizeItems(dataJson: Record<string, any>): any[] {
  if (Array.isArray(dataJson.items)) {
    return dataJson.items.map((it: any, idx: number) => ({
      id: it.id || crypto.randomUUID(),
      row_index: it.row_index ?? idx + 1,
      product_id: it.product_id || null,
      supplier: it.supplier || null,
      supplier_item_code: it.supplier_item_code || null,
      code: it.code || null,
      description: it.description || "",
      unit: it.unit || "NR",
      quantity: String(it.quantity ?? "1"),
      purchase_price_subunits: Number(it.purchase_price_subunits) || 0,
      markup_pct: it.markup_pct != null ? String(it.markup_pct) : null,
      base_unit_price_subunits: Number(it.base_unit_price_subunits) || 0,
      effective_unit_price_subunits: Number(it.effective_unit_price_subunits ?? it.base_unit_price_subunits) || 0,
      forced_unit_price_subunits: it.forced_unit_price_subunits != null ? Number(it.forced_unit_price_subunits) : null,
      discount_pct: String(it.discount_pct ?? "0"),
      effective_markup_pct: it.effective_markup_pct != null ? String(it.effective_markup_pct) : null,
      margin_pct: it.margin_pct != null ? String(it.margin_pct) : null,
      net_amount_subunits: Number(it.net_amount_subunits) || 0,
      cost_total_subunits: Number(it.cost_total_subunits ?? it.purchase_price_subunits) || 0,
      gross_profit_subunits: Number(it.gross_profit_subunits) || 0,
      vat_rate: cloudVatRate(it.vat_rate),
      vat_amount_subunits: Number(it.vat_amount_subunits) || 0,
      availability: it.availability || null,
      notes: it.notes || null,
    }));
  }

  // Supporto retrocompatibilità preventivi precedente versione ("righe")
  if (Array.isArray(dataJson.righe) && dataJson.righe.length > 0) {
    return dataJson.righe.map((riga: any, idx: number) => {
      const purchaseSubunits = Math.round((Number(riga.prezzo_acquisto) || 0) * 100000);
      const baseSubunits = Math.round((Number(riga.prezzo_unitario_base) || 0) * 100000);
      const effSubunits = Math.round((Number(riga.prezzo_unitario_effettivo ?? riga.prezzo_unitario_base) || 0) * 100000);
      const forcedSubunits = riga.prezzo_unitario_forzato != null ? Math.round(Number(riga.prezzo_unitario_forzato) * 100000) : null;
      const netSubunits = Math.round((Number(riga.importo_netto) || 0) * 100000);
      const costSubunits = Math.round((Number(riga.costo_totale_riga) || 0) * 100000);
      const profitSubunits = Math.round((Number(riga.ricavo_riga) || 0) * 100000);
      const vatRate = cloudVatRate(riga.iva);
      const vat = parseItalianNumber(riga.importo_iva);
      const vatSubunits = vat === null ? (vatRate ? Math.round(netSubunits * vatRate / 100) : 0) : money(vat).toSubunits();

      return {
        id: riga.id || crypto.randomUUID(),
        row_index: riga.riga_nr ?? idx + 1,
        product_id: null,
        supplier: riga.fornitore || null,
        supplier_item_code: riga.articolo_fornitore || null,
        code: riga.codice_articolo || null,
        description: riga.descrizione || "",
        unit: riga.um || "NR",
        quantity: String(riga.quantita ?? "1"),
        purchase_price_subunits: purchaseSubunits,
        markup_pct: riga.ricarico_pct != null ? String(riga.ricarico_pct) : null,
        base_unit_price_subunits: baseSubunits,
        effective_unit_price_subunits: effSubunits,
        forced_unit_price_subunits: forcedSubunits,
        discount_pct: String(riga.sconto_pct ?? "0"),
        effective_markup_pct: riga.ricarico_effettivo_pct != null ? String(riga.ricarico_effettivo_pct) : null,
        margin_pct: riga.margine_pct != null ? String(riga.margine_pct) : null,
        net_amount_subunits: netSubunits,
        cost_total_subunits: costSubunits,
        gross_profit_subunits: profitSubunits,
        vat_rate: vatRate,
        vat_amount_subunits: vatSubunits,
        availability: riga.disponibilita || null,
        notes: riga.note || null,
      };
    });
  }

  return [];
}

function buildQuoteItemWrites(
  quoteId: string,
  items: any[],
  createdAt: string,
  updatedAt: string
): SqliteWrite[] {
  const writes: SqliteWrite[] = [{
    sql: `UPDATE quote_items SET deleted_at = $1, updated_at = $1, sync_status = 'synced'
      WHERE quote_id = $2 AND deleted_at IS NULL AND id NOT IN (SELECT value FROM json_each($3))`,
    params: [updatedAt, quoteId, JSON.stringify(items.map((item) => item.id))],
  }];
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    writes.push({
      sql: `INSERT INTO quote_items (
        id, quote_id, row_index, product_id, supplier, supplier_item_code,
        code, description, unit, quantity, purchase_price_subunits,
        markup_pct, base_unit_price_subunits, effective_unit_price_subunits, forced_unit_price_subunits,
        discount_pct, effective_markup_pct, margin_pct, net_amount_subunits,
        cost_total_subunits, gross_profit_subunits, vat_rate, vat_amount_subunits,
        availability, notes, created_at, updated_at, updated_by, deleted_at, sync_status
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23,
        $24, $25, $26, $27, $28, $29, 'synced'
      ) ON CONFLICT(id) DO UPDATE SET
        row_index = excluded.row_index, product_id = excluded.product_id,
        supplier = excluded.supplier, supplier_item_code = excluded.supplier_item_code,
        code = excluded.code, description = excluded.description,
        unit = excluded.unit, quantity = excluded.quantity,
        purchase_price_subunits = excluded.purchase_price_subunits, markup_pct = excluded.markup_pct,
        base_unit_price_subunits = excluded.base_unit_price_subunits, effective_unit_price_subunits = excluded.effective_unit_price_subunits,
        forced_unit_price_subunits = excluded.forced_unit_price_subunits, discount_pct = excluded.discount_pct,
        effective_markup_pct = excluded.effective_markup_pct, margin_pct = excluded.margin_pct,
        net_amount_subunits = excluded.net_amount_subunits, cost_total_subunits = excluded.cost_total_subunits,
        gross_profit_subunits = excluded.gross_profit_subunits, vat_rate = excluded.vat_rate,
        vat_amount_subunits = excluded.vat_amount_subunits, availability = excluded.availability,
        notes = excluded.notes, created_at = excluded.created_at,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by,
        deleted_at = excluded.deleted_at, sync_status = excluded.sync_status
      WHERE quote_items.quote_id = excluded.quote_id`,
      expectedRows: 1,
      params: [
        it.id || crypto.randomUUID(),
        quoteId,
        it.row_index ?? idx + 1,
        it.product_id || null,
        it.supplier || null,
        it.supplier_item_code || null,
        it.code || null,
        it.description || "",
        it.unit || "NR",
        String(it.quantity ?? "1"),
        Number(it.purchase_price_subunits) || 0,
        it.markup_pct != null ? String(it.markup_pct) : null,
        Number(it.base_unit_price_subunits) || 0,
        Number(it.effective_unit_price_subunits ?? it.base_unit_price_subunits) || 0,
        it.forced_unit_price_subunits != null ? Number(it.forced_unit_price_subunits) : null,
        String(it.discount_pct ?? "0"),
        it.effective_markup_pct != null ? String(it.effective_markup_pct) : null,
        it.margin_pct != null ? String(it.margin_pct) : null,
        Number(it.net_amount_subunits) || 0,
        Number(it.cost_total_subunits) || 0,
        Number(it.gross_profit_subunits) || 0,
        cloudVatRate(it.vat_rate),
        Number(it.vat_amount_subunits) || 0,
        it.availability || null,
        it.notes || null,
        createdAt || new Date().toISOString(),
        updatedAt || new Date().toISOString(),
        "supabase",
        null,
      ],
    });
  }
  return writes;
}

async function applyRemoteQuote(
  r: Record<string, any>,
  restoreWrites?: SqliteWrite[],
  projectUrl?: string | null,
): Promise<boolean> {
  if (!r?.id) return false;
  const db = await getDatabase();
  const [local] = await db.select<{ updated_at: string; sync_status: string; project_url?: string | null }[]>(
    "SELECT updated_at, sync_status, project_url FROM quotes WHERE id = $1", [r.id]
  );
  const normalizedProjectUrl = normalizeSupabaseProjectUrl(projectUrl);
  if (
    !restoreWrites &&
    local?.project_url &&
    normalizedProjectUrl &&
    !matchesActiveSupabaseProject(local.project_url, normalizedProjectUrl)
  ) {
    return false;
  }
  const remoteTimestamp = r.updated_at || r.created_at || null;
  const remoteTime = Date.parse(remoteTimestamp ?? "");
  const localTime = Date.parse(local?.updated_at ?? "");
  if (local?.sync_status === "pending" ||
    (Number.isFinite(localTime) && (!Number.isFinite(remoteTime) || remoteTime < localTime))) {
    return false;
  }

  const createdAt = r.created_at || new Date().toISOString();
  const updatedAt = remoteTimestamp || createdAt;
  const dataJson = parseDataJson(r.data_json);
  const items = extractAndNormalizeItems(dataJson);
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error(`Identificativi riga duplicati nel preventivo ${r.id}`);
  }
  const header: SqliteWrite = {
    sql: `INSERT INTO quotes (
          id, quote_number, year, quote_date, status,
          client_id, client_name, client_address, client_city, client_postal_code,
          client_province, client_vat, client_fiscal_code, client_sdi, client_pec,
          client_phones_json, destination_name, destination_address, destination_city,
          subject, global_discount_pct, validity_days, payment_method, delivery_date,
          delivery_terms, default_supplier, internal_notes, customer_notes,
          total_taxable_subunits, total_vat_subunits, total_document_subunits,
          total_cost_subunits, total_profit_subunits,
          created_at, updated_at, updated_by, deleted_at, converted_ddt_id, sync_status, project_url
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19,
          $20, $21, $22, $23, $24,
          $25, $26, $27, $28,
          $29, $30, $31,
          $32, $33,
          $34, $35, $36, $37, $39, 'synced', $40
        )
        ON CONFLICT(id) DO UPDATE SET
          quote_number = excluded.quote_number,
          year = excluded.year,
          quote_date = excluded.quote_date,
          status = excluded.status,
          client_id = excluded.client_id,
          client_name = excluded.client_name,
          client_address = excluded.client_address,
          client_city = excluded.client_city,
          client_postal_code = excluded.client_postal_code,
          client_province = excluded.client_province,
          client_vat = excluded.client_vat,
          client_fiscal_code = excluded.client_fiscal_code,
          client_sdi = excluded.client_sdi,
          client_pec = excluded.client_pec,
          client_phones_json = excluded.client_phones_json,
          destination_name = excluded.destination_name,
          destination_address = excluded.destination_address,
          destination_city = excluded.destination_city,
          subject = excluded.subject,
          global_discount_pct = excluded.global_discount_pct,
          validity_days = excluded.validity_days,
          payment_method = excluded.payment_method,
          delivery_date = excluded.delivery_date,
          delivery_terms = excluded.delivery_terms,
          default_supplier = excluded.default_supplier,
          internal_notes = excluded.internal_notes,
          customer_notes = excluded.customer_notes,
          total_taxable_subunits = excluded.total_taxable_subunits,
          total_vat_subunits = excluded.total_vat_subunits,
          total_document_subunits = excluded.total_document_subunits,
          total_cost_subunits = excluded.total_cost_subunits,
          total_profit_subunits = excluded.total_profit_subunits,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          deleted_at = excluded.deleted_at,
          converted_ddt_id = COALESCE(excluded.converted_ddt_id, quotes.converted_ddt_id),
          sync_status = 'synced',
          project_url = COALESCE(quotes.project_url, excluded.project_url)
        WHERE COALESCE(quotes.sync_status, '') <> 'pending'
          AND (quotes.project_url IS NULL OR excluded.project_url IS NULL OR quotes.project_url = excluded.project_url)
          AND (julianday(quotes.updated_at) IS NULL OR julianday($38) IS NULL OR julianday($38) >= julianday(quotes.updated_at))`,
    expectedRows: 1,
    params: [
          r.id,
          r.quote_number != null ? Number(r.quote_number) : null,
          Number(r.anno) || new Date().getFullYear(),
          r.data || new Date().toISOString().split("T")[0],
          r.stato || "bozza",
          dataJson.client_id || null,
          r.cliente || "",
          dataJson.client_address || null,
          dataJson.client_city || null,
          dataJson.client_postal_code || null,
          dataJson.client_province || null,
          dataJson.client_vat || null,
          dataJson.client_fiscal_code || null,
          dataJson.client_sdi || null,
          dataJson.client_pec || null,
          JSON.stringify(dataJson.client_phones || []),
          dataJson.destination_name || null,
          dataJson.destination_address || null,
          dataJson.destination_city || null,
          r.oggetto || "",
          String(r.sconto_globale_pct || "0"),
          Number(r.validita_giorni) || 30,
          r.pagamento || null,
          r.data_consegna || null,
          dataJson.delivery_terms || null,
          dataJson.default_supplier || null,
          dataJson.internal_notes || null,
          dataJson.customer_notes || null,
          Math.round((Number(r.totale_imponibile) || 0) * 100000),
          Math.round((Number(r.totale_iva) || 0) * 100000),
          Math.round((Number(r.totale_documento) || 0) * 100000),
          Math.round((Number(r.totale_costo) || 0) * 100000),
          Math.round((Number(r.totale_profitto) || 0) * 100000),
          createdAt,
          updatedAt,
          r.updated_by || "supabase",
          r.deleted_at || null,
          remoteTimestamp,
          dataJson.converted_ddt_id || null,
          normalizedProjectUrl,
        ],
  };

  const hasItemsSnapshot = Array.isArray(dataJson.items) || Array.isArray(dataJson.righe);
  const writes = hasItemsSnapshot ? buildQuoteItemWrites(r.id, items, createdAt, updatedAt) : [];
  await applyLocalDatabaseBatch([header, ...writes, ...(restoreWrites ?? [])]);
  return true;
}

export class QuoteSyncService {
  public static async restoreTrashSnapshot(trash: TrashQuoteRow, now: string, finish: SqliteWrite[]) {
    const saved = parseDataJson(trash.data_json);
    const row = "data_json" in saved ? saved : {
      id: trash.id, quote_number: trash.quote_number, anno: trash.year, data: trash.quote_date,
      cliente: trash.client_name, oggetto: trash.subject, totale_documento: Number(trash.total_document_subunits) / 100000,
      data_json: saved,
    };
    const restored = await applyRemoteQuote(
      { ...row, id: trash.id, updated_at: now, deleted_at: null },
      [
        { sql: "UPDATE quotes SET sync_status = 'pending' WHERE id = $1", params: [trash.id] },
        ...finish,
      ],
      trash.project_url ?? null,
    );
    if (!restored) throw new Error("Lo stato del preventivo è cambiato durante il ripristino.");
  }

  private static pendingRetry: Promise<void> | null = null;

  private static lastRetryError: string | null = null;

  public static getLastRetryError(): string | null {
    return this.lastRetryError;
  }

  public static retryPendingChanges(): Promise<void> {
    if (this.pendingRetry) return this.pendingRetry;
    this.pendingRetry = (async () => {
      this.lastRetryError = null;
      const { quoteRepository } = await import("./quoteRepository");
      const initialCreds = await getSupabaseCredentials();
      await flushPendingCloudOperations(
        "quotes",
        async ({ record_id, action, payload, project_url }) => {
          const creds = initialCreds ?? (await getSupabaseCredentials());
          const expectedProject = normalizeSupabaseProjectUrl(project_url);
          const actualProject = normalizeSupabaseProjectUrl(creds?.projectUrl);
          if (!creds || !expectedProject || !actualProject || expectedProject !== actualProject) {
            throw new Error("Il progetto Supabase attivo è cambiato durante l'invio dell'operazione preventivo.");
          }
          if (action === "trash") {
            const row = JSON.parse(payload);
            if (!await this.pushTrashRow(row, creds)) throw new Error("Spostamento preventivo nel cestino non confermato");
            const db = await getDatabase();
            await db.execute("UPDATE quotes SET sync_status = 'synced' WHERE id = $1 AND deleted_at = $2",
              [record_id, row.deleted_at]);
          } else if (action === "restore") {
            const quote = await quoteRepository.getQuoteById(record_id, false);
            if (!quote) return;
            if (!await this.pushQuote(quote, creds) || !await this.deleteTrashFromSupabase(record_id, creds)) {
              throw new Error("Ripristino preventivo non confermato");
            }
          } else if (action === "cleanup" && !await this.deleteTrashFromSupabase(record_id, creds)) {
            throw new Error("Rimozione dal cestino preventivi non confermata");
          }
        },
        initialCreds?.projectUrl ?? null,
      );
      let failedCount = 0;
      const db = await getDatabase();
      const archived = await db.select<Array<{ id: string; deleted_at: string; in_trash: number; project_url?: string | null }>>(
        `SELECT id, deleted_at, project_url, EXISTS(SELECT 1 FROM quotes_trash WHERE id = quotes.id) AS in_trash
          FROM quotes WHERE sync_status = 'pending' AND deleted_at IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM pending_cloud_operations WHERE scope = 'quotes' AND record_id = quotes.id
          )`,
      );
      for (const row of archived) {
        if (!matchesActiveSupabaseProject(row.project_url, initialCreds?.projectUrl)) continue;
        const quote = await quoteRepository.getArchivedQuoteForSync(row.id);
        if (quote?.deleted_at !== row.deleted_at) continue;
        const confirmed = row.in_trash
          ? await this.pushTrashRow({ ...this.mapQuoteToSupabase(quote), deleted_by: quote.updated_by || "system" }, initialCreds ?? undefined)
          : await this.deleteQuote(row.id, initialCreds ?? undefined);
        if (confirmed) {
          await db.execute(
            "UPDATE quotes SET sync_status = 'synced' WHERE id = $1 AND deleted_at = $2",
            [row.id, row.deleted_at],
          );
        } else {
          failedCount++;
        }
      }
      const pending = await db.select<Array<{ id: string; project_url?: string | null }>>(
        `SELECT id, project_url FROM quotes WHERE sync_status = 'pending' AND deleted_at IS NULL AND NOT EXISTS (
          SELECT 1 FROM pending_cloud_operations WHERE scope = 'quotes' AND record_id = quotes.id
        ) ORDER BY updated_at`
      );
      for (const { id, project_url } of pending) {
        if (!matchesActiveSupabaseProject(project_url, initialCreds?.projectUrl)) continue;
        const quote = await quoteRepository.getQuoteById(id, false);
        if (quote && !(await this.pushQuote(quote))) {
          failedCount++;
        }
      }
      const opFailure = getPendingOperationFailure("quotes");
      if (opFailure) {
        this.lastRetryError = opFailure;
      } else if (failedCount > 0) {
        this.lastRetryError = `${failedCount} preventivi non confermati su Supabase`;
      }
    })().finally(() => { this.pendingRetry = null; });
    return this.pendingRetry;
  }

  /**
   * Converte un oggetto Quote di Last nel payload per la tabella preventivi su Supabase
   */
  public static mapQuoteToSupabase(quote: Quote) {
    const code = formatQuoteCode(quote.year, quote.quote_number) ?? "";
    const now = new Date().toISOString();

    const dataJson = {
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
      delivery_terms: quote.delivery_terms,
      default_supplier: quote.default_supplier,
      internal_notes: quote.internal_notes,
      customer_notes: quote.customer_notes,
      converted_ddt_id: quote.converted_ddt_id,
      items: quote.items.map((item) => ({
        id: item.id,
        row_index: item.row_index,
        product_id: item.product_id,
        supplier: item.supplier,
        supplier_item_code: item.supplier_item_code,
        code: item.code,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        purchase_price_subunits: item.purchase_price.toSubunits(),
        markup_pct: item.markup_pct,
        base_unit_price_subunits: item.base_unit_price.toSubunits(),
        forced_unit_price_subunits: item.forced_unit_price?.toSubunits() ?? null,
        discount_pct: item.discount_pct,
        effective_unit_price_subunits: item.effective_unit_price.toSubunits(),
        net_amount_subunits: item.net_amount.toSubunits(),
        vat_rate: item.vat_rate,
        vat_amount_subunits: item.vat_amount.toSubunits(),
        cost_total_subunits: item.cost_total.toSubunits(),
        gross_profit_subunits: item.gross_profit.toSubunits(),
        margin_pct: item.margin_pct,
        availability: item.availability,
        notes: item.notes,
      })),
    };

    return {
      id: quote.id,
      numero: code,
      quote_number: quote.quote_number,
      anno: quote.year,
      data: quote.quote_date,
      cliente: quote.client_name,
      oggetto: quote.subject,
      destinazione: quote.destination_name || quote.destination_address || "",
      pagamento: quote.payment_method || "",
      validita_giorni: quote.validity_days,
      data_consegna: quote.delivery_date || "",
      stato: quote.status,
      totale_imponibile: quote.totals.taxable.toNumber(),
      totale_iva: quote.totals.vat.toNumber(),
      totale_documento: quote.totals.total.toNumber(),
      totale_costo: quote.totals.cost.toNumber(),
      totale_profitto: quote.totals.gross_profit.toNumber(),
      sconto_globale_pct: quote.global_discount_pct,
      data_json: dataJson,
      deleted_at: quote.deleted_at,
      updated_at: quote.updated_at || now,
      updated_by: quote.updated_by || "system",
      created_at: quote.created_at || now,
    };
  }

  /**
   * Invia un preventivo direttamente a Supabase Cloud (UPSERT)
   */
  public static async pushQuote(quote: Quote, overrideCreds?: CachedSupabaseConfig): Promise<boolean> {
    try {
      const creds = overrideCreds ?? (await getSupabaseCredentials());
      if (!creds) return false;
      if (quote.project_url && !matchesActiveSupabaseProject(quote.project_url, creds.projectUrl)) {
        return false;
      }

      const db = await getDatabase();
      if (quote.quote_number == null) {
        const [local] = await db.select<{ floor: number }[]>(
          `SELECT MAX(
            COALESCE((SELECT last_number FROM quote_sequences WHERE year=$1),0),
            COALESCE((SELECT MAX(quote_number) FROM quotes WHERE year=$1),0),
            COALESCE((SELECT MAX(quote_number) FROM quotes_trash WHERE year=$1),0)
          ) AS floor`, [quote.year],
        );
        const allocation = await supabaseFetch(new URL("/rest/v1/rpc/last_reserve_quote_number", creds.projectUrl), {
          method: "POST",
          headers: { apikey: creds.anonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ p_year: quote.year, p_quote_id: quote.id, p_local_floor: local?.floor ?? 0 }),
        });
        if (!allocation.ok) throw new Error(`Numerazione preventivi: HTTP ${allocation.status}. Verifica la migrazione Supabase.`);
        const number = await allocation.json();
        if (!Number.isSafeInteger(number) || number <= 0) throw new Error("Numero preventivo cloud non valido");
        const applied = await db.execute(
          "UPDATE quotes SET quote_number=$1 WHERE id=$2 AND year=$3 AND updated_at=$4 AND quote_number IS NULL AND deleted_at IS NULL",
          [number, quote.id, quote.year, quote.updated_at],
        );
        if (applied.rowsAffected !== 1) return false;
        quote = { ...quote, quote_number: number };
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("quote-number-assigned", { detail: { id: quote.id, number } }));
        }
      }
      const row = this.mapQuoteToSupabase(quote);
      const url = `${creds.projectUrl}/rest/v1/preventivi`;

      const res = await supabaseFetch(url, {
        method: "POST",
        headers: {
          apikey: creds.anonKey,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(row),
      });

      if (res.ok) {
        await applyLocalDatabaseBatch([
          {
            sql: "UPDATE quotes SET sync_status = 'synced' WHERE id = $1 AND updated_at = $2 AND quote_number IS $3",
            params: [quote.id, quote.updated_at, quote.quote_number],
          },
          {
            sql: `UPDATE quote_items SET sync_status = 'synced' WHERE quote_id = $1 AND EXISTS (
              SELECT 1 FROM quotes WHERE id = $1 AND updated_at = $2 AND quote_number IS $3 AND sync_status = 'synced'
            )`,
            params: [quote.id, quote.updated_at, quote.quote_number],
          },
        ]);
        return true;
      } else {
        const txt = await res.text();
        console.warn(`[QuoteSyncService] Errore push preventivo su Supabase (${res.status}):`, txt);
      }
    } catch (err) {
      console.warn("[QuoteSyncService] Errore rete push preventivo su Supabase:", err);
    }
    return false;
  }

  /**
   * Notifica a Supabase il soft delete di un preventivo
   */
  public static async deleteQuote(id: string, overrideCreds?: CachedSupabaseConfig): Promise<boolean> {
    try {
      const creds = overrideCreds ?? (await getSupabaseCredentials());
      if (!creds) return false;
      const db = await getDatabase();
      const [localRow] = await db.select<Array<{ project_url?: string | null }>>(
        "SELECT project_url FROM quotes WHERE id = $1 LIMIT 1",
        [id],
      );
      if (localRow?.project_url && !matchesActiveSupabaseProject(localRow.project_url, creds.projectUrl)) {
        return false;
      }

      const now = new Date().toISOString();
      const url = `${creds.projectUrl}/rest/v1/preventivi?id=eq.${encodeURIComponent(id)}`;

      const res = await supabaseFetch(url, {
        method: "PATCH",
        headers: {
          apikey: creds.anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deleted_at: now,
          updated_at: now,
          updated_by: "system",
        }),
      });

      return res.ok;
    } catch (err) {
      console.warn("[QuoteSyncService] Errore soft delete preventivo su Supabase:", err);
      return false;
    }
  }

  /**
   * Scarica i preventivi da Supabase Cloud e aggiorna la copia locale SQLite
   */
  public static async pullQuotes(): Promise<number> {
    const creds = await getSupabaseCredentials();
    if (!creds) throw new Error("Configurazione Supabase assente per i preventivi");
    const url = new URL("/rest/v1/preventivi", creds.projectUrl);
    url.searchParams.set("order", "id.asc");
    url.searchParams.set("limit", "500");
    const headers = { apikey: creds.anonKey };
    let imported = 0;
    let offset = 0;
    while (true) {
      url.searchParams.set("offset", String(offset));
      const response = await supabaseFetch(url.toString(), { headers });
      if (!response.ok) throw new Error(`Download preventivi: HTTP ${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("Risposta preventivi non valida");
      if (!rows.length) return imported;
      for (const row of rows) {
        try {
          if (await applyRemoteQuote(row, undefined, creds.projectUrl)) imported++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("dati locali sono cambiati")) {
            console.warn("[QuoteSyncService] Preventivo saltato per modifica locale concorrente:", row?.id);
            continue;
          }
          throw err;
        }
      }
      offset += rows.length;
    }
  }

  public static async pullQuoteById(id: string): Promise<boolean> {
    try {
      const creds = await getSupabaseCredentials();
      if (!creds) return false;
      const url = new URL("/rest/v1/preventivi", creds.projectUrl);
      url.searchParams.set("id", `eq.${id}`);
      const response = await supabaseFetch(url, {
        headers: { apikey: creds.anonKey },
      });
      if (!response.ok) return false;
      const rows = await response.json();
      return Array.isArray(rows) && rows.length === 1 && await applyRemoteQuote(rows[0], undefined, creds.projectUrl);
    } catch (error) {
      console.warn("[QuoteSyncService] Errore pullQuoteById:", error);
      return false;
    }
  }

  /**
   * Sposta un preventivo nel Cestino di Supabase Cloud (tabella preventivi_cestino)
   * e assicura il limite FIFO di massimo 5 elementi.
   */
  private static async pushTrashRow(trashRow: Record<string, unknown>, overrideCreds?: CachedSupabaseConfig): Promise<boolean> {
    try {
      const creds = overrideCreds ?? (await getSupabaseCredentials());
      if (!creds) return false;

      // 1. Inserisci o aggiorna nel cestino remoto
      const postUrl = `${creds.projectUrl}/rest/v1/preventivi_cestino`;
      const res = await supabaseFetch(postUrl, {
        method: "POST",
        headers: {
          apikey: creds.anonKey,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(trashRow),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.warn("[QuoteSyncService] Errore push preventivo nel cestino Supabase:", txt);
        return false;
      }

      // 2. Rimuovi dall'elenco preventivi attivi su Supabase
      if (!await this.deleteQuote(String(trashRow.id), creds)) return false;

      // 3. FIFO: Mantieni al massimo 5 elementi nel cestino remoto
      try {
        const listUrl = `${creds.projectUrl}/rest/v1/preventivi_cestino?select=id,deleted_at&order=deleted_at.desc`;
        const listRes = await supabaseFetch(listUrl, {
          headers: {
            apikey: creds.anonKey,
          },
        });
        if (listRes.ok) {
          const allTrash = await listRes.json();
          if (Array.isArray(allTrash) && allTrash.length > 5) {
            const toPrune = allTrash.slice(5);
            for (const item of toPrune) {
              await supabaseFetch(`${creds.projectUrl}/rest/v1/preventivi_cestino?id=eq.${encodeURIComponent(item.id)}`, {
                method: "DELETE",
                headers: {
                  apikey: creds.anonKey,
                },
              });
            }
          }
        }
      } catch (pruneErr) {
        console.warn("[QuoteSyncService] Pruning cestino remoto:", pruneErr);
      }

      return res.ok;
    } catch (err) {
      console.warn("[QuoteSyncService] Errore salvataggio cestino Supabase:", err);
      return false;
    }
  }

  /**
   * Rimuove un preventivo dal cestino remoto di Supabase
   */
  public static async deleteTrashFromSupabase(id: string, overrideCreds?: CachedSupabaseConfig): Promise<boolean> {
    try {
      const creds = overrideCreds ?? (await getSupabaseCredentials());
      if (!creds) return false;

      const url = `${creds.projectUrl}/rest/v1/preventivi_cestino?id=eq.${encodeURIComponent(id)}`;
      const res = await supabaseFetch(url, {
        method: "DELETE",
        headers: {
          apikey: creds.anonKey,
        },
      });
      return res.ok;
    } catch (err) {
      console.warn("[QuoteSyncService] Errore rimozione da cestino Supabase:", err);
      return false;
    }
  }

  /**
   * Scarica gli ultimi elementi del Cestino da Supabase (max 5) e sincronizza la tabella locale
   */
  public static async pullTrashQuotes(): Promise<number> {
    try {
      const creds = await getSupabaseCredentials();
      if (!creds) return 0;

      const url = `${creds.projectUrl}/rest/v1/preventivi_cestino?order=deleted_at.desc&limit=5`;
      const res = await supabaseFetch(url, {
        headers: {
          apikey: creds.anonKey,
        },
      });

      if (!res.ok) return 0;
      const remoteItems = await res.json();
      if (!Array.isArray(remoteItems)) return 0;

      const db = await getDatabase();
      const trashProjectUrl = normalizeSupabaseProjectUrl(creds.projectUrl);
      if (remoteItems.length === 0) {
        if (trashProjectUrl) {
          await db.execute(
            `DELETE FROM quotes_trash
             WHERE project_url = $1 AND NOT EXISTS (
               SELECT 1 FROM pending_cloud_operations WHERE scope = 'quotes' AND record_id = quotes_trash.id
             )`,
            [trashProjectUrl]
          );
        }
        return 0;
      }
      for (const item of remoteItems) {
        await db.execute(
          `INSERT INTO quotes_trash (
            id, quote_number, numero, year, quote_date,
            client_name, subject, total_document_subunits, data_json,
            deleted_at, deleted_by, project_url
          ) SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12 WHERE NOT EXISTS (
            SELECT 1 FROM pending_cloud_operations WHERE scope = 'quotes' AND record_id = $1
          ) AND NOT EXISTS (SELECT 1 FROM quotes WHERE id = $1 AND deleted_at IS NULL)
          ON CONFLICT(id) DO UPDATE SET
            quote_number = excluded.quote_number,
            numero = excluded.numero,
            year = excluded.year,
            quote_date = excluded.quote_date,
            client_name = excluded.client_name,
            subject = excluded.subject,
            total_document_subunits = excluded.total_document_subunits,
            data_json = excluded.data_json,
            deleted_at = excluded.deleted_at,
            deleted_by = excluded.deleted_by,
            project_url = COALESCE(quotes_trash.project_url, excluded.project_url)
          WHERE quotes_trash.project_url IS NULL OR quotes_trash.project_url = excluded.project_url`,
          [
            item.id,
            item.quote_number != null ? Number(item.quote_number) : null,
            item.numero || "",
            Number(item.anno) || new Date().getFullYear(),
            item.data || "",
            item.cliente || "",
            item.oggetto || "",
            Math.round((Number(item.totale_documento) || 0) * 100000),
            JSON.stringify(item),
            item.deleted_at || new Date().toISOString(),
            item.deleted_by || "system",
            trashProjectUrl,
          ]
        );
      }

      // Prune locale a max 5 (isolato per progetto)
      if (trashProjectUrl) {
        await db.execute(
          `DELETE FROM quotes_trash
           WHERE project_url = $1 AND id NOT IN (
             SELECT id FROM quotes_trash
             WHERE project_url = $1
             ORDER BY deleted_at DESC
             LIMIT 5
           )`,
          [trashProjectUrl]
        );
      }

      return remoteItems.length;
    } catch (err) {
      console.warn("[QuoteSyncService] Errore pull cestino da Supabase:", err);
      return 0;
    }
  }


}

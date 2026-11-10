import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import type { Quote } from "../models/quote";
import { formatQuoteCode } from "../models/quoteDraft";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
  configPath: string;
}

let cachedSupabaseConfig: SupabaseConfig | null = null;

export async function getSupabaseCredentials(): Promise<SupabaseConfig | null> {
  if (cachedSupabaseConfig) return cachedSupabaseConfig;
  try {
    const status = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
    if (status?.config?.projectUrl && status?.config?.anonKey) {
      cachedSupabaseConfig = {
        projectUrl: status.config.projectUrl.replace(/\/$/, ""),
        anonKey: status.config.anonKey.trim(),
      };
      return cachedSupabaseConfig;
    }
  } catch (err) {
    console.warn("[QuoteSyncService] Impossibile recuperare credenziali Supabase:", err);
  }
  return null;
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
  if (Array.isArray(dataJson.items) && dataJson.items.length > 0) {
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
      vat_rate: [0, 4, 10, 22].includes(Number(it.vat_rate)) ? Number(it.vat_rate) : 22,
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
      const vatRate = [0, 4, 10, 22].includes(Number(riga.iva)) ? Number(riga.iva) : 22;
      const vatSubunits = Math.round(Number(riga.importo_iva) || (netSubunits * (vatRate / 100)));

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

async function syncQuoteItemsIntoDb(
  db: any,
  quoteId: string,
  items: any[],
  createdAt: string,
  updatedAt: string
): Promise<void> {
  if (!items || items.length === 0) return;
  await db.execute("DELETE FROM quote_items WHERE quote_id = $1", [quoteId]);
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    await db.execute(
      `INSERT OR REPLACE INTO quote_items (
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
      )`,
      [
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
        [0, 4, 10, 22].includes(Number(it.vat_rate)) ? Number(it.vat_rate) : 22,
        Number(it.vat_amount_subunits) || 0,
        it.availability || null,
        it.notes || null,
        createdAt || new Date().toISOString(),
        updatedAt || new Date().toISOString(),
        "supabase",
        null,
      ]
    );
  }
}

export class QuoteSyncService {
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
  public static async pushQuote(quote: Quote): Promise<boolean> {
    try {
      const creds = await getSupabaseCredentials();
      if (!creds) return false;

      const row = this.mapQuoteToSupabase(quote);
      const url = `${creds.projectUrl}/rest/v1/preventivi`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(row),
      });

      if (res.ok) {
        const db = await getDatabase();
        await db.execute("UPDATE quotes SET sync_status = 'synced' WHERE id = $1", [quote.id]);
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
  public static async deleteQuote(id: string): Promise<boolean> {
    try {
      const creds = await getSupabaseCredentials();
      if (!creds) return false;

      const now = new Date().toISOString();
      const url = `${creds.projectUrl}/rest/v1/preventivi?id=eq.${encodeURIComponent(id)}`;

      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
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
    try {
      const creds = await getSupabaseCredentials();
      if (!creds) return 0;

      const url = `${creds.projectUrl}/rest/v1/preventivi?order=created_at.desc&limit=500`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
        },
      });

      if (!res.ok) return 0;

      const remoteRows = await res.json();
      if (!Array.isArray(remoteRows) || remoteRows.length === 0) return 0;

      const db = await getDatabase();
      let imported = 0;

      for (const r of remoteRows) {
        if (!r.id) continue;

        // Verifica se esiste già in locale
        const local = await db.select<{ id: string; updated_at: string }[]>(
          "SELECT id, updated_at FROM quotes WHERE id = $1",
          [r.id]
        );

        const dataJson = parseDataJson(r.data_json);
        const items = extractAndNormalizeItems(dataJson);

        // Inserisci o aggiorna la testata
        await db.execute(
          `INSERT INTO quotes (
            id, quote_number, year, quote_date, status,
            client_id, client_name, client_address, client_city, client_postal_code,
            client_province, client_vat, client_fiscal_code, client_sdi, client_pec,
            client_phones_json, destination_name, destination_address, destination_city,
            subject, global_discount_pct, validity_days, payment_method, delivery_date,
            delivery_terms, default_supplier, internal_notes, customer_notes,
            total_taxable_subunits, total_vat_subunits, total_document_subunits,
            total_cost_subunits, total_profit_subunits,
            created_at, updated_at, updated_by, deleted_at, sync_status
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21, $22, $23, $24,
            $25, $26, $27, $28,
            $29, $30, $31,
            $32, $33,
            $34, $35, $36, $37, 'synced'
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
            sync_status = 'synced'`,
          [
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
            r.created_at || new Date().toISOString(),
            r.updated_at || new Date().toISOString(),
            r.updated_by || "supabase",
            r.deleted_at || null,
          ]
        );

        // Verifica quante righe attive sono memorizzate in locale
        const existingItems = await db.select<{ count: number }[]>(
          "SELECT count(*) as count FROM quote_items WHERE quote_id = $1 AND deleted_at IS NULL",
          [r.id]
        );
        const localItemCount = existingItems[0]?.count ?? 0;
        const remoteUpdatedAt = new Date(r.updated_at || r.created_at || 0).getTime();
        const localUpdatedAt = local[0] ? new Date(local[0].updated_at || 0).getTime() : 0;

        // Se non ci sono righe locali o il record remoto è più recente, sincronizza le righe
        if ((localItemCount === 0 || remoteUpdatedAt >= localUpdatedAt) && items.length > 0) {
          await syncQuoteItemsIntoDb(db, r.id, items, r.created_at || new Date().toISOString(), r.updated_at || new Date().toISOString());
        }

        imported++;
      }

      return imported;
    } catch (err) {
      console.warn("[QuoteSyncService] Errore pull preventivi da Supabase:", err);
      return 0;
    }
  }

  /**
   * Scarica un singolo preventivo da Supabase per ID, aggiorna SQLite locale (testata e righe)
   */
  public static async pullQuoteById(id: string): Promise<boolean> {
    try {
      const creds = await getSupabaseCredentials();
      if (!creds) return false;

      const url = `${creds.projectUrl}/rest/v1/preventivi?id=eq.${encodeURIComponent(id)}&select=*`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
        },
      });

      if (!res.ok) return false;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) return false;

      const r = rows[0];
      const db = await getDatabase();
      const dataJson = parseDataJson(r.data_json);
      const items = extractAndNormalizeItems(dataJson);

      await db.execute(
        `INSERT INTO quotes (
          id, quote_number, year, quote_date, status,
          client_id, client_name, client_address, client_city, client_postal_code,
          client_province, client_vat, client_fiscal_code, client_sdi, client_pec,
          client_phones_json, destination_name, destination_address, destination_city,
          subject, global_discount_pct, validity_days, payment_method, delivery_date,
          delivery_terms, default_supplier, internal_notes, customer_notes,
          total_taxable_subunits, total_vat_subunits, total_document_subunits,
          total_cost_subunits, total_profit_subunits,
          created_at, updated_at, updated_by, deleted_at, sync_status
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19,
          $20, $21, $22, $23, $24,
          $25, $26, $27, $28,
          $29, $30, $31,
          $32, $33,
          $34, $35, $36, $37, 'synced'
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
          sync_status = 'synced'`,
        [
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
          r.created_at || new Date().toISOString(),
          r.updated_at || new Date().toISOString(),
          r.updated_by || "supabase",
          r.deleted_at || null,
        ]
      );

      if (items.length > 0) {
        await syncQuoteItemsIntoDb(db, r.id, items, r.created_at || new Date().toISOString(), r.updated_at || new Date().toISOString());
      }
      return true;
    } catch (err) {
      console.warn("[QuoteSyncService] Errore pullQuoteById:", err);
      return false;
    }
  }

  /**
   * Sposta un preventivo nel Cestino di Supabase Cloud (tabella preventivi_cestino)
   * e assicura il limite FIFO di massimo 5 elementi.
   */
  public static async pushTrashQuote(
    quote: Quote,
    deletedAt: string = new Date().toISOString(),
    deletedBy: string = "system"
  ): Promise<boolean> {
    try {
      const creds = await getSupabaseCredentials();
      if (!creds) return false;

      const baseRow = this.mapQuoteToSupabase(quote);
      const trashRow = {
        ...baseRow,
        deleted_at: deletedAt,
        deleted_by: deletedBy,
      };

      // 1. Inserisci o aggiorna nel cestino remoto
      const postUrl = `${creds.projectUrl}/rest/v1/preventivi_cestino`;
      const res = await fetch(postUrl, {
        method: "POST",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(trashRow),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.warn("[QuoteSyncService] Errore push preventivo nel cestino Supabase:", txt);
      }

      // 2. Rimuovi dall'elenco preventivi attivi su Supabase
      await this.deleteQuote(quote.id);

      // 3. FIFO: Mantieni al massimo 5 elementi nel cestino remoto
      try {
        const listUrl = `${creds.projectUrl}/rest/v1/preventivi_cestino?select=id,deleted_at&order=deleted_at.desc`;
        const listRes = await fetch(listUrl, {
          headers: {
            apikey: creds.anonKey,
            Authorization: `Bearer ${creds.anonKey}`,
          },
        });
        if (listRes.ok) {
          const allTrash = await listRes.json();
          if (Array.isArray(allTrash) && allTrash.length > 5) {
            const toPrune = allTrash.slice(5);
            for (const item of toPrune) {
              await fetch(`${creds.projectUrl}/rest/v1/preventivi_cestino?id=eq.${encodeURIComponent(item.id)}`, {
                method: "DELETE",
                headers: {
                  apikey: creds.anonKey,
                  Authorization: `Bearer ${creds.anonKey}`,
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
  public static async deleteTrashFromSupabase(id: string): Promise<boolean> {
    try {
      const creds = await getSupabaseCredentials();
      if (!creds) return false;

      const url = `${creds.projectUrl}/rest/v1/preventivi_cestino?id=eq.${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
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
      const res = await fetch(url, {
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
        },
      });

      if (!res.ok) return 0;
      const remoteItems = await res.json();
      if (!Array.isArray(remoteItems) || remoteItems.length === 0) return 0;

      const db = await getDatabase();
      for (const item of remoteItems) {
        await db.execute(
          `INSERT INTO quotes_trash (
            id, quote_number, numero, year, quote_date,
            client_name, subject, total_document_subunits, data_json,
            deleted_at, deleted_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
            deleted_by = excluded.deleted_by`,
          [
            item.id,
            item.quote_number != null ? Number(item.quote_number) : null,
            item.numero || "",
            Number(item.anno) || new Date().getFullYear(),
            item.data || "",
            item.cliente || "",
            item.oggetto || "",
            Math.round((Number(item.totale_documento) || 0) * 100000),
            typeof item.data_json === "string" ? item.data_json : JSON.stringify(item.data_json || {}),
            item.deleted_at || new Date().toISOString(),
            item.deleted_by || "system",
          ]
        );
      }

      // Prune locale a max 5
      await db.execute(`
        DELETE FROM quotes_trash
        WHERE id NOT IN (
          SELECT id FROM quotes_trash
          ORDER BY deleted_at DESC
          LIMIT 5
        )
      `);

      return remoteItems.length;
    } catch (err) {
      console.warn("[QuoteSyncService] Errore pull cestino da Supabase:", err);
      return 0;
    }
  }

  /**
   * Ottiene il massimo numero progressivo preventivi noto da Supabase (per garantire unicità anche tra postazioni)
   */
  public static async getRemoteMaxQuoteNumber(year: number): Promise<number> {
    try {
      const creds = await getSupabaseCredentials();
      if (!creds) return 0;

      let maxFound = 0;

      // 1. Controlla la tabella sequenze
      const seqUrl = `${creds.projectUrl}/rest/v1/preventivi_sequenza?anno=eq.${year}&select=ultimo_numero`;
      const seqRes = await fetch(seqUrl, {
        headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
      });
      if (seqRes.ok) {
        const rows = await seqRes.json();
        if (Array.isArray(rows) && rows.length > 0 && rows[0].ultimo_numero != null) {
          maxFound = Math.max(maxFound, Number(rows[0].ultimo_numero) || 0);
        }
      }

      // 2. Controlla max quote_number in preventivi attivi
      const prevUrl = `${creds.projectUrl}/rest/v1/preventivi?anno=eq.${year}&select=quote_number&order=quote_number.desc&limit=1`;
      const prevRes = await fetch(prevUrl, {
        headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
      });
      if (prevRes.ok) {
        const rows = await prevRes.json();
        if (Array.isArray(rows) && rows.length > 0 && rows[0].quote_number != null) {
          maxFound = Math.max(maxFound, Number(rows[0].quote_number) || 0);
        }
      }

      // 3. Controlla max quote_number in preventivi_cestino
      const cestUrl = `${creds.projectUrl}/rest/v1/preventivi_cestino?anno=eq.${year}&select=quote_number&order=quote_number.desc&limit=1`;
      const cestRes = await fetch(cestUrl, {
        headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
      });
      if (cestRes.ok) {
        const rows = await cestRes.json();
        if (Array.isArray(rows) && rows.length > 0 && rows[0].quote_number != null) {
          maxFound = Math.max(maxFound, Number(rows[0].quote_number) || 0);
        }
      }

      return maxFound;
    } catch {
      return 0;
    }
  }

  /**
   * Aggiorna il numero massimo nella sequenza remota su Supabase
   */
  public static async updateRemoteSequence(year: number, lastNumber: number): Promise<void> {
    try {
      const creds = await getSupabaseCredentials();
      if (!creds) return;

      const url = `${creds.projectUrl}/rest/v1/preventivi_sequenza`;
      await fetch(url, {
        method: "POST",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          anno: year,
          ultimo_numero: lastNumber,
        }),
      });
    } catch (err) {
      console.warn("[QuoteSyncService] Errore aggiornamento sequenza remota:", err);
    }
  }
}

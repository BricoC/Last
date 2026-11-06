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

        const dataJson = r.data_json && typeof r.data_json === "object" ? r.data_json : {};
        const items: any[] = Array.isArray(dataJson.items) ? dataJson.items : [];

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

        // Se l'elemento è nuovo e contiene righe salvate in dataJson, reinseriscile in quote_items
        if (local.length === 0 && items.length > 0) {
          for (let idx = 0; idx < items.length; idx++) {
            const it = items[idx];
            await db.execute(
              `INSERT OR REPLACE INTO quote_items (
                id, quote_id, row_index, product_id, supplier, supplier_item_code,
                code, description, unit, quantity, purchase_price_subunits,
                markup_pct, base_unit_price_subunits, forced_unit_price_subunits,
                discount_pct, net_unit_price_subunits, net_amount_subunits,
                vat_rate, vat_amount_subunits, gross_amount_subunits,
                total_cost_subunits, gross_profit_subunits, margin_pct,
                availability, notes, created_at, updated_at, updated_by, sync_status
              ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14,
                $15, $16, $17,
                $18, $19, $20,
                $21, $22, $23,
                $24, $25, $26, $27, $28, 'synced'
              )`,
              [
                it.id || crypto.randomUUID(),
                r.id,
                it.row_index ?? idx,
                it.product_id || null,
                it.supplier || null,
                it.supplier_item_code || null,
                it.code || null,
                it.description || "",
                it.unit || "NR",
                String(it.quantity || "1"),
                Number(it.purchase_price_subunits) || 0,
                String(it.markup_pct || "0"),
                Number(it.base_unit_price_subunits) || 0,
                it.forced_unit_price_subunits != null ? Number(it.forced_unit_price_subunits) : null,
                String(it.discount_pct || "0"),
                Number(it.effective_unit_price_subunits || it.base_unit_price_subunits) || 0,
                Number(it.net_amount_subunits) || 0,
                Number(it.vat_rate) || 22,
                Number(it.vat_amount_subunits) || 0,
                Number(it.net_amount_subunits || 0) + Number(it.vat_amount_subunits || 0),
                Number(it.cost_total_subunits || it.purchase_price_subunits) || 0,
                Number(it.gross_profit_subunits) || 0,
                it.margin_pct != null ? String(it.margin_pct) : null,
                it.availability || null,
                it.notes || null,
                r.created_at || new Date().toISOString(),
                r.updated_at || new Date().toISOString(),
                "supabase",
              ]
            );
          }
        }

        imported++;
      }

      return imported;
    } catch (err) {
      console.warn("[QuoteSyncService] Errore pull preventivi da Supabase:", err);
      return 0;
    }
  }
}

import { pendingCloudWrite, flushPendingCloudOperations } from "@/shared/data-layer/pendingCloudOperations";
import { supabaseFetch } from "@/shared/services/supabaseSession";
import { getDatabase } from "@/shared/data-layer/database";
import { normalizeSupabaseProjectUrl, resolveActiveSupabaseProjectUrl } from "@/shared/services/supabaseConfigCache";
import { OrRow, getOrStatus, isActualOrderReference } from "../types/orNumbers";
import { cleanDestinationName } from "@/features/ddt-studio/utils/destinationCleaner";
import { invoke } from "@tauri-apps/api/core";
import { applyLocalDatabaseBatch, type SqliteWrite } from "@/shared/data-layer/localDatabaseBatch";
import { MonetaryValue } from "@/shared/domain/monetaryValue";
import { parseDdtQuantity } from "@/features/ddt-studio/utils/ddtQuantity";
import { calculateRowAmounts } from "@/features/ddt-studio/utils/ddtCalculations";
import { ddtCloudPushService } from "@/features/ddt-studio/services/ddtCloudPushService";

export class OrNumbersRepository {
  private static logsTableEnsured = false;

  public static async ensureLogsTable(): Promise<void> {
    if (this.logsTableEnsured) return;
    try {
      const db = await getDatabase();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ddt_logs (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      this.logsTableEnsured = true;
    } catch (e) {
      console.error("Errore creazione tabella ddt_logs:", e);
    }
  }

  public static async getLogsMap(): Promise<Record<string, string>> {
    await this.ensureLogsTable();

    // Sincronizzazione automatica da Supabase verso SQLite
    try {
      const configRes = await invoke<{ config: { projectUrl: string; anonKey: string } | null }>("load_supabase_config").catch(() => null);
      if (configRes?.config?.projectUrl && configRes?.config?.anonKey) {
        await this.retryPendingLogs();
        const url = new URL("/rest/v1/ddt_logs?select=id,status,updated_at&order=id.asc&limit=1000", configRes.config.projectUrl);
        for (let offset = 0; ; ) {
          url.searchParams.set("offset", String(offset));
          const response = await supabaseFetch(url, { headers: { apikey: configRes.config.anonKey } });
          if (!response.ok) throw new Error(`Lettura log OR: HTTP ${response.status}`);
          const rows = await response.json();
          if (!Array.isArray(rows)) throw new Error("Risposta log OR non valida");
          if (!rows.length) break;
          await applyLocalDatabaseBatch(rows.map((row) => ({
            sql: `INSERT INTO ddt_logs (id,status,updated_at) SELECT $1,$2,$3 WHERE NOT EXISTS (
              SELECT 1 FROM pending_cloud_operations WHERE scope = 'or_logs' AND record_id = $1
            ) ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
              WHERE julianday(excluded.updated_at) >= julianday(ddt_logs.updated_at)`,
            params: [row.id, row.status, row.updated_at || "1970-01-01T00:00:00Z"],
          })));
          offset += rows.length;
        }
      }
    } catch (err) {
      console.warn("[OrNumbersRepository] Sync ddt_logs da Supabase:", err);
    }

    try {
      const db = await getDatabase();
      const rows = await db.select<{ id: string; status: string }[]>(
        "SELECT id, status FROM ddt_logs"
      );
      const map: Record<string, string> = {};
      for (const r of rows) {
        map[r.id] = r.status;
      }
      return map;
    } catch (e) {
      console.warn("Errore lettura ddt_logs:", e);
      return {};
    }
  }

  public static async updateLog(key: string, status: string): Promise<void> {
    return this.updateLogsBatch({ [key]: status });
  }

  public static async updateLogsBatch(updates: Record<string, string>): Promise<void> {
    await this.ensureLogsTable();
    const timestamp = new Date().toISOString();
    const projectUrl = await resolveActiveSupabaseProjectUrl();
    await applyLocalDatabaseBatch(Object.entries(updates).flatMap(([id, status]) => [
      { sql: `INSERT INTO ddt_logs (id,status,updated_at) VALUES ($1,$2,$3)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
        params: [id, status, timestamp] },
      pendingCloudWrite("or_logs", id, "upsert", { id, status, updated_at: timestamp }, projectUrl),
    ]));
    void this.retryPendingLogs().catch(console.warn);
  }

  public static retryPendingLogs(): Promise<number> {
    return flushPendingCloudOperations("or_logs", async ({ payload, project_url }) => {
      const status = await invoke<{ config: { projectUrl: string; anonKey: string } | null }>("load_supabase_config");
      if (!status.config?.projectUrl || !status.config.anonKey) throw new Error("Supabase non configurato");
      const expectedProject = normalizeSupabaseProjectUrl(project_url);
      const actualProject = normalizeSupabaseProjectUrl(status.config.projectUrl);
      if (!expectedProject || !actualProject || expectedProject !== actualProject) {
        throw new Error("Il progetto Supabase attivo è cambiato durante l'invio del log OR.");
      }
      const response = await supabaseFetch(new URL("/rest/v1/ddt_logs", status.config.projectUrl), {
        method: "POST",
        headers: {
          apikey: status.config.anonKey, "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: payload,
      });
      if (!response.ok) throw new Error(`Salvataggio log OR: HTTP ${response.status}`);
    });
  }

  private static inFlightOrderSyncs = new Map<string, Promise<void>>();

  public static async syncOrdersFromSupabase(year: number, month?: number): Promise<void> {
    const key = `${year}:${month ?? "all"}`;
    const existing = this.inFlightOrderSyncs.get(key);
    if (existing) return existing;
    const task = this.executeSyncOrdersFromSupabase(year, month).finally(() => {
      this.inFlightOrderSyncs.delete(key);
    });
    this.inFlightOrderSyncs.set(key, task);
    return task;
  }

  private static async executeSyncOrdersFromSupabase(year: number, month?: number): Promise<void> {
    try {
      const configRes = await invoke<{ config: { projectUrl: string; anonKey: string } | null }>("load_supabase_config").catch(() => null);
      if (!configRes?.config?.projectUrl || !configRes?.config?.anonKey) return;

      const activeProjectUrl = normalizeSupabaseProjectUrl(configRes.config.projectUrl);
      const url = new URL("/rest/v1/ddt", configRes.config.projectUrl.replace(/\/$/, ""));
      url.searchParams.set("anno", `eq.${year}`);
      if (month !== undefined) {
        const mm = String(month).padStart(2, "0");
        const startDate = `${year}-${mm}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
        url.searchParams.set("data", `gte.${startDate}`);
        url.searchParams.append("data", `lte.${endDate}`);
      }
      url.searchParams.set("nr_vs_ordine", "not.is.null");
      url.searchParams.set("select", "id,numero,anno,nr_vs_ordine");
      url.searchParams.set("order", "numero.asc,id.asc");
      url.searchParams.set("limit", "1000");

      const db = await getDatabase();
      for (let offset = 0; ; offset += 1000) {
        url.searchParams.set("offset", String(offset));
        const res = await supabaseFetch(url.toString(), {
          headers: {
            apikey: configRes.config.anonKey,
          },
        });
        if (!res.ok) break;
        const remoteDdts = (await res.json()) as Array<{ id: string; numero: number; anno: number; nr_vs_ordine: string | null }>;
        if (!Array.isArray(remoteDdts) || remoteDdts.length === 0) break;

        for (const d of remoteDdts) {
          const ord = (d.nr_vs_ordine || "").trim();
          if (ord) {
            await db.execute(
              `UPDATE ddt_documents 
               SET order_reference = $1 
               WHERE (id = $2 OR (doc_number = $3 AND year = $4))
                 AND (project_url = $5 OR project_url IS NULL)
                 AND deleted_at IS NULL AND COALESCE(sync_status, '') <> 'pending'
                 AND (order_reference IS NULL OR TRIM(order_reference) = '' OR TRIM(order_reference) <> $1)`,
              [ord, d.id, d.numero, d.anno, activeProjectUrl]
            );
          }
        }
        if (remoteDdts.length < 1000) break;
      }
    } catch (e) {
      console.warn("[OrNumbersRepository] Sync orders da Supabase warning:", e);
    }
  }

  public static async getOrRowsForMonth(
    year: number,
    month: number,
    clientType: "CARRARA" | "WEPA"
  ): Promise<OrRow[]> {
    await this.ensureLogsTable();

    // Sincronizza prima gli ordini da Supabase per il mese selezionato
    await this.syncOrdersFromSupabase(year, month);

    const db = await getDatabase();

    const mm = String(month).padStart(2, "0");
    const startDate = `${year}-${mm}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

    let clientCondition = "";
    if (clientType === "CARRARA") {
      clientCondition = "LOWER(client_name) LIKE '%carrara%'";
    } else {
      clientCondition = "LOWER(client_name) LIKE '%wepa%'";
    }

    const query = `
      SELECT 
        id, doc_number, series, doc_date, client_name, 
        destination_name, destination_address, destination_city, 
        order_reference,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM ddt_items i
            WHERE i.ddt_id = ddt_documents.id
              AND i.deleted_at IS NULL
              AND COALESCE(i.row_kind, 'item') <> 'note'
              AND COALESCE(i.unit_price_subunits, 0) > 0
          )
          AND NOT EXISTS (
            SELECT 1 FROM ddt_items i
            WHERE i.ddt_id = ddt_documents.id
              AND i.deleted_at IS NULL
              AND COALESCE(i.row_kind, 'item') <> 'note'
              AND (
                TRIM(COALESCE(i.description, '')) <> ''
                OR TRIM(COALESCE(i.quantity, '')) <> ''
              )
              AND NOT (
                COALESCE(i.unit_price_subunits, 0) = 0
                AND COALESCE(i.net_amount_subunits, 0) = 0
                AND TRIM(COALESCE(i.quantity, '')) = ''
                AND TRIM(COALESCE(i.unit, '')) = ''
              )
              AND COALESCE(i.unit_price_subunits, 0) <= 0
          )
          THEN 0
          ELSE 1
        END AS has_missing_prices
      FROM ddt_documents
      WHERE deleted_at IS NULL
        AND doc_number IS NOT NULL
        AND status NOT IN ('bozza', 'annullato')
        AND ${clientCondition}
        AND doc_date >= $1 AND doc_date <= $2
      ORDER BY 
        doc_number ASC,
        doc_date ASC
    `;

    const [rows, logsMap] = await Promise.all([
      db.select<Array<{
        id: string;
        doc_number: number | null;
        series: string | null;
        doc_date: string;
        client_name: string;
        destination_name: string | null;
        destination_address: string | null;
        destination_city: string | null;
        order_reference: string | null;
        has_missing_prices: number;
      }>>(query, [startDate, endDate]),
      this.getLogsMap(),
    ]);

    const statusPriority = { unpriced: 0, red: 1, yellow: 2, green: 3 } as const;
    return rows
      .map((r) => {
        const formattedDateIt = r.doc_date.split("-").reverse().join(".");
        const formattedDateSlash = r.doc_date.split("-").reverse().join("/");
        const keyDot = `${r.doc_number}_${formattedDateIt}`;
        const keySlash = `${r.doc_number}_${formattedDateSlash}`;
        const keyId = r.id;

        const logStatus = logsMap[keyDot] || logsMap[keySlash] || logsMap[keyId] || "";

        // Destinazione pulita dal nome del cliente
        const rawDest = r.destination_name || r.destination_address || r.destination_city || "";
        let cleanDest = cleanDestinationName(rawDest, r.client_name);

        // Normalizzazione speciale stile noManV1 per Wepa
        if (clientType === "WEPA") {
          if (cleanDest.toUpperCase().includes("SALANETTI")) {
            cleanDest = "Localita' Salanetti";
          } else if (cleanDest.toUpperCase().includes("RALLETTA")) {
            cleanDest = "F.sso Ralletta";
          }
        }

        const rawOrderRef = (r.order_reference || "").trim();
        const effectiveOrderRef = isActualOrderReference(rawOrderRef) ? rawOrderRef : "";

        return {
          id: r.id,
          docNumber: r.doc_number,
          series: r.series || "",
          date: r.doc_date,
          client: r.client_name,
          destination: cleanDest || rawDest || "—",
          orderReference: effectiveOrderRef,
          statusLog: logStatus,
          hasMissingPrices: Boolean(r.has_missing_prices),
        };
      })
      .sort((a, b) => statusPriority[getOrStatus(a)] - statusPriority[getOrStatus(b)]);
  }

  public static async assignOrderReference(
    ddtId: string,
    orderRef: string,
    discountPercent?: number
  ): Promise<void> {
    const db = await getDatabase();
    const [document] = await db.select<{ updated_at: string }[]>(
      "SELECT updated_at FROM ddt_documents WHERE id = $1 AND deleted_at IS NULL", [ddtId]
    );
    if (!document) throw new Error("DDT da aggiornare non trovato.");
    const now = new Date().toISOString();
    const writes: SqliteWrite[] = [];
    let totals = "";
    const parameters: unknown[] = [orderRef.trim(), now, ddtId, document.updated_at];

    if (discountPercent !== undefined) {
      if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
        throw new Error("Sconto OR fuori intervallo.");
      }
      const rows = await db.select<{
        id: string; updated_at: string; quantity: string; unit_price_subunits: number; vat_rate: number;
      }[]>(
        `SELECT id, updated_at, quantity, unit_price_subunits, vat_rate FROM ddt_items
          WHERE ddt_id = $1 AND deleted_at IS NULL AND COALESCE(row_kind, 'item') <> 'note'`,
        [ddtId]
      );
      const discount = String(discountPercent);
      let taxable = 0;
      let tax = 0;
      for (const row of rows) {
        const { netAmount, vatAmount } = calculateRowAmounts(
          parseDdtQuantity(row.quantity) ?? row.quantity,
          MonetaryValue.fromSubunits(row.unit_price_subunits), discount, row.vat_rate
        );
        const net = netAmount.toSubunits();
        const vat = vatAmount.toSubunits();
        taxable += net;
        tax += vat;
        writes.push({
          sql: `UPDATE ddt_items SET discount_pct = $1, net_amount_subunits = $2,
                vat_amount_subunits = $3, updated_at = $4, sync_status = 'pending'
                WHERE id = $5 AND updated_at = $6 AND deleted_at IS NULL`,
          params: [discount, net, vat, now, row.id, row.updated_at],
          expectedRows: 1,
        });
      }
      totals = ", total_taxable_subunits = $5, total_vat_subunits = $6, total_document_subunits = $7";
      parameters.push(taxable, tax, taxable + tax);
    }

    writes.unshift({
      sql: `UPDATE ddt_documents SET order_reference = $1, updated_at = $2, sync_status = 'pending'${totals}
            WHERE id = $3 AND updated_at = $4 AND deleted_at IS NULL`,
      params: parameters,
      expectedRows: 1,
    });
    await applyLocalDatabaseBatch(writes);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ddt-data-updated"));
    try {
      const result = await ddtCloudPushService.pushDdtById(ddtId, { reassignNumberOnConflict: false });
      if (!result.success) console.warn("[OrNumbersRepository] DDT in attesa di sincronizzazione:", result.error);
    } catch (error) {
      console.warn("[OrNumbersRepository] DDT in attesa di sincronizzazione:", error);
    }
  }
}

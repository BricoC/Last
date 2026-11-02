import { getDatabase } from "@/shared/data-layer/database";
import { OrRow, isActualOrderReference } from "../types/orNumbers";
import { cleanDestinationName } from "@/features/ddt-studio/utils/destinationCleaner";
import { invoke } from "@tauri-apps/api/core";

export class OrNumbersRepository {
  private static logsTableEnsured = false;
  private static activeLogsSyncPromise: Promise<boolean> | null = null;
  private static activeOrdersSyncKey: string | null = null;
  private static activeOrdersSyncPromise: Promise<boolean> | null = null;

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

  /**
   * Lettura istantanea dei log dalla cache SQLite locale (< 5ms).
   * Non effettua chiamate di rete.
   */
  public static async getLogsMap(): Promise<Record<string, string>> {
    await this.ensureLogsTable();
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
      console.warn("Errore lettura ddt_logs locale:", e);
      return {};
    }
  }

  /**
   * Sincronizzazione remota deduplicata da Supabase per i ddt_logs.
   * Scrive in SQLite usando un'unica transazione (BEGIN/COMMIT).
   */
  public static async syncRemoteLogs(): Promise<boolean> {
    if (this.activeLogsSyncPromise) {
      return this.activeLogsSyncPromise;
    }

    this.activeLogsSyncPromise = (async () => {
      try {
        await this.ensureLogsTable();
        const configRes = await invoke<{ config: { projectUrl: string; anonKey: string } | null }>("load_supabase_config").catch(() => null);
        if (!configRes?.config?.projectUrl || !configRes?.config?.anonKey) return false;

        const url = new URL("/rest/v1/ddt_logs?select=id,status", configRes.config.projectUrl.replace(/\/$/, ""));
        const res = await fetch(url.toString(), {
          headers: {
            apikey: configRes.config.anonKey,
            Authorization: `Bearer ${configRes.config.anonKey}`,
          },
        });

        if (!res.ok) return false;
        const remoteLogs = (await res.json()) as Array<{ id: string; status: string }>;
        if (!Array.isArray(remoteLogs) || remoteLogs.length === 0) return false;

        const db = await getDatabase();
        await db.execute("BEGIN TRANSACTION;");
        try {
          for (const r of remoteLogs) {
            await db.execute(
              `INSERT OR REPLACE INTO ddt_logs (id, status, updated_at) VALUES ($1, $2, datetime('now'))`,
              [r.id, r.status]
            );
          }
          await db.execute("COMMIT;");
        } catch (txErr) {
          await db.execute("ROLLBACK;");
          throw txErr;
        }

        return true;
      } catch (err) {
        console.warn("[OrNumbersRepository] Sync ddt_logs da Supabase:", err);
        return false;
      } finally {
        this.activeLogsSyncPromise = null;
      }
    })();

    return this.activeLogsSyncPromise;
  }

  public static async updateLog(key: string, status: string): Promise<void> {
    await this.ensureLogsTable();
    try {
      const db = await getDatabase();
      await db.execute(
        `INSERT OR REPLACE INTO ddt_logs (id, status, updated_at) VALUES ($1, $2, datetime('now'))`,
        [key, status]
      );

      // Async sync verso Supabase se configurato
      void this.syncSingleLogToSupabase(key, status);
    } catch (e) {
      console.error(`Errore aggiornamento log ${key}:`, e);
    }
  }

  public static async updateLogsBatch(updates: Record<string, string>): Promise<void> {
    await this.ensureLogsTable();
    try {
      const db = await getDatabase();
      await db.execute("BEGIN TRANSACTION;");
      try {
        for (const [key, status] of Object.entries(updates)) {
          await db.execute(
            `INSERT OR REPLACE INTO ddt_logs (id, status, updated_at) VALUES ($1, $2, datetime('now'))`,
            [key, status]
          );
        }
        await db.execute("COMMIT;");
      } catch (txErr) {
        await db.execute("ROLLBACK;");
        throw txErr;
      }

      // Async batch sync verso Supabase
      void this.syncLogsBatchToSupabase(updates);
    } catch (e) {
      console.error("Errore salvataggio batch ddt_logs:", e);
    }
  }

  private static async syncSingleLogToSupabase(key: string, status: string): Promise<void> {
    try {
      const configRes = await invoke<{ config: { projectUrl: string; anonKey: string } | null }>("load_supabase_config").catch(() => null);
      if (!configRes?.config?.projectUrl || !configRes?.config?.anonKey) return;

      const url = new URL("/rest/v1/ddt_logs", configRes.config.projectUrl.replace(/\/$/, ""));
      await fetch(url.toString(), {
        method: "POST",
        headers: {
          apikey: configRes.config.anonKey,
          Authorization: `Bearer ${configRes.config.anonKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify([{ id: key, status }])
      });
    } catch (err) {
      console.warn("[OrNumbersRepository] Supabase log sync warning:", err);
    }
  }

  private static async syncLogsBatchToSupabase(updates: Record<string, string>): Promise<void> {
    try {
      const configRes = await invoke<{ config: { projectUrl: string; anonKey: string } | null }>("load_supabase_config").catch(() => null);
      if (!configRes?.config?.projectUrl || !configRes?.config?.anonKey) return;

      const records = Object.entries(updates).map(([id, status]) => ({ id, status }));
      if (records.length === 0) return;

      const url = new URL("/rest/v1/ddt_logs", configRes.config.projectUrl.replace(/\/$/, ""));
      await fetch(url.toString(), {
        method: "POST",
        headers: {
          apikey: configRes.config.anonKey,
          Authorization: `Bearer ${configRes.config.anonKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify(records)
      });
    } catch (err) {
      console.warn("[OrNumbersRepository] Supabase batch log sync warning:", err);
    }
  }

  public static async syncRemoteOrdersForMonth(
    year: number,
    startDate: string,
    endDate: string
  ): Promise<boolean> {
    const syncKey = `${year}_${startDate}_${endDate}`;
    if (this.activeOrdersSyncKey === syncKey && this.activeOrdersSyncPromise) {
      return this.activeOrdersSyncPromise;
    }

    this.activeOrdersSyncKey = syncKey;
    this.activeOrdersSyncPromise = (async () => {
      try {
        const configRes = await invoke<{ config: { projectUrl: string; anonKey: string } | null }>("load_supabase_config").catch(() => null);
        if (!configRes?.config?.projectUrl || !configRes?.config?.anonKey) return false;

        const url = new URL("/rest/v1/ddt", configRes.config.projectUrl.replace(/\/$/, ""));
        url.searchParams.set("select", "numero,anno,nr_vs_ordine");
        url.searchParams.set("anno", `eq.${year}`);
        url.searchParams.append("data", `gte.${startDate}`);
        url.searchParams.append("data", `lte.${endDate}`);
        url.searchParams.set("nr_vs_ordine", "not.is.null");

        const res = await fetch(url.toString(), {
          headers: {
            apikey: configRes.config.anonKey,
            Authorization: `Bearer ${configRes.config.anonKey}`,
          },
        });

        if (!res.ok) return false;
        const remoteDdts = (await res.json()) as Array<{ numero: number; anno: number; nr_vs_ordine: string }>;
        if (!Array.isArray(remoteDdts) || remoteDdts.length === 0) return false;

        const db = await getDatabase();
        await db.execute("BEGIN TRANSACTION;");
        let updatedCount = 0;
        try {
          for (const rd of remoteDdts) {
            const orderVal = (rd.nr_vs_ordine || "").trim();
            if (orderVal && isActualOrderReference(orderVal)) {
              await db.execute(
                `UPDATE ddt_documents 
                 SET order_reference = $1, 
                     updated_at = datetime('now')
                 WHERE doc_number = $2 AND year = $3 AND (order_reference IS NULL OR order_reference != $1)`,
                [orderVal, rd.numero, rd.anno]
              );
              updatedCount++;
            }
          }
          await db.execute("COMMIT;");
        } catch (txErr) {
          await db.execute("ROLLBACK;");
          throw txErr;
        }

        return updatedCount > 0;
      } catch (err) {
        console.warn("[OrNumbersRepository] Sync nr_vs_ordine da Supabase:", err);
        return false;
      } finally {
        if (this.activeOrdersSyncKey === syncKey) {
          this.activeOrdersSyncPromise = null;
          this.activeOrdersSyncKey = null;
        }
      }
    })();

    return this.activeOrdersSyncPromise;
  }

  /**
   * Sincronizzazione in background per il mese specificato:
   * recupera sia gli ordini del mese che i log di stato da Supabase in parallelo.
   */
  public static async syncMonthFromRemote(year: number, month: number): Promise<boolean> {
    const mm = String(month).padStart(2, "0");
    const startDate = `${year}-${mm}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

    const [ordersResult, logsResult] = await Promise.allSettled([
      this.syncRemoteOrdersForMonth(year, startDate, endDate),
      this.syncRemoteLogs(),
    ]);

    const ordersChanged = ordersResult.status === "fulfilled" && ordersResult.value;
    const logsChanged = logsResult.status === "fulfilled" && logsResult.value;
    return Boolean(ordersChanged || logsChanged);
  }

  /**
   * Lettura istantanea (< 10ms) dal database SQLite locale.
   * Nessun blocco di rete verso Supabase.
   */
  public static async getOrRowsForMonth(
    year: number,
    month: number,
    clientType: "CARRARA" | "WEPA"
  ): Promise<OrRow[]> {
    await this.ensureLogsTable();
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
        order_reference
      FROM ddt_documents
      WHERE deleted_at IS NULL
        AND ${clientCondition}
        AND doc_date >= $1 AND doc_date <= $2
      ORDER BY 
        CASE WHEN doc_number IS NULL THEN 999999 ELSE doc_number END ASC,
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
      }>>(query, [startDate, endDate]),
      this.getLogsMap(),
    ]);

    return rows.map((r) => {
      const formattedDateIt = r.doc_date.split("-").reverse().join(".");
      const formattedDateSlash = r.doc_date.split("-").reverse().join("/");
      const keyDot = `${r.doc_number}_${formattedDateIt}`;
      const keySlash = `${r.doc_number}_${formattedDateSlash}`;
      const keyId = r.id;

      const logStatus = logsMap[keyDot] || logsMap[keySlash] || logsMap[keyId] || "";

      // Destinazione pulita dal nome del cliente
      const rawDest = r.destination_address || r.destination_city || r.destination_name || "";
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
      };
    });
  }

  public static async assignOrderReference(
    ddtId: string,
    orderRef: string,
    discountPercent?: number
  ): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      `UPDATE ddt_documents 
       SET order_reference = $1, 
           updated_at = datetime('now'),
           sync_status = 'pending'
       WHERE id = $2`,
      [orderRef.trim(), ddtId]
    );

    if (discountPercent !== undefined && !isNaN(discountPercent)) {
      await db.execute(
        `UPDATE ddt_items 
         SET discount_percent = $1,
             updated_at = datetime('now'),
             sync_status = 'pending'
         WHERE ddt_id = $2 AND deleted_at IS NULL`,
        [discountPercent, ddtId]
      );
    }

    // Aggiornamento anche verso Supabase su tabella ddt
    try {
      const configRes = await invoke<{ config: { projectUrl: string; anonKey: string } | null }>("load_supabase_config").catch(() => null);
      if (configRes?.config?.projectUrl && configRes?.config?.anonKey) {
        const ddtRows = await db.select<Array<{ doc_number: number; year: number }>>(
          "SELECT doc_number, year FROM ddt_documents WHERE id = $1",
          [ddtId]
        );
        const doc = ddtRows[0];
        if (doc?.doc_number && doc?.year) {
          const url = new URL("/rest/v1/ddt", configRes.config.projectUrl.replace(/\/$/, ""));
          url.searchParams.set("anno", `eq.${doc.year}`);
          url.searchParams.set("numero", `eq.${doc.doc_number}`);
          await fetch(url.toString(), {
            method: "PATCH",
            headers: {
              apikey: configRes.config.anonKey,
              Authorization: `Bearer ${configRes.config.anonKey}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal"
            },
            body: JSON.stringify({ nr_vs_ordine: orderRef.trim() })
          });
        }
      }
    } catch (err) {
      console.warn("[OrNumbersRepository] Supabase assign OR sync warning:", err);
    }
  }
}

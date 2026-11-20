import { createSupabaseRealtimeSubscription } from "@/shared/services/supabaseRealtimeSubscription";
import { flushPendingCloudOperations } from "@/shared/data-layer/pendingCloudOperations";
import { getAuthenticatedSupabaseClient } from "@/shared/services/supabaseSession";
import { supabaseFetch } from "@/shared/services/supabaseSession";
import { matchesActiveSupabaseProject, normalizeSupabaseProjectUrl } from "@/shared/services/supabaseConfigCache";
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import type { OfferRecord } from "../types/offer";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
  isValid: boolean;
}

export interface OffersSyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  error?: string;
}

interface RemoteOfferRow {
  id: number;
  local_id?: string | null;
  offer_date: string;
  requester: string;
  contact?: string | null;
  items_text: string;
  status: string;
  is_urgent?: boolean | number | null;
  is_archived: boolean | number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const REMOTE_PULL_LIMIT = 1000;

function hasOfferChanged(local: OfferRecord, remote: RemoteOfferRow): boolean {
  return (
    Number(local.supabase_id ?? 0) !== Number(remote.id) ||
    (local.offer_date || "") !== (remote.offer_date || "") ||
    (local.requester || "") !== (remote.requester || "") ||
    (local.contact || "") !== (remote.contact || "") ||
    (local.items_text || "") !== (remote.items_text || "") ||
    (local.status || "") !== (remote.status || "") ||
    Boolean(local.is_urgent) !== Boolean(remote.is_urgent) ||
    Boolean(local.is_archived) !== Boolean(remote.is_archived) ||
    (local.created_by || "Operatore") !== (remote.created_by || "Operatore") ||
    (local.updated_by || "Operatore") !== (remote.updated_by || "Operatore") ||
    (local.updated_at || "") !== (remote.updated_at || local.updated_at || "")
  );
}

export class OffersSyncService {
  private isSyncing = false;
  private syncError: string | null = null;
  private lastSyncTime: Date | null = null;
  private activeSyncPromise: Promise<OffersSyncResult> | null = null;
  private pendingResync = false;

  public getStatus() {
    return {
      isSyncing: this.isSyncing,
      syncError: this.syncError,
      lastSyncTime: this.lastSyncTime,
    };
  }

  private async getSupabaseCredentials(): Promise<SupabaseConfig | null> {
    try {
      const res = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
      if (res?.config?.projectUrl && res?.config?.anonKey) {
        return {
          projectUrl: res.config.projectUrl.replace(/\/$/, ""),
          anonKey: res.config.anonKey,
        };
      }
    } catch (err) {
      console.warn("[OffersSync] Impossibile recuperare configurazione Supabase:", err);
    }
    return null;
  }

  public async retryPendingChanges(): Promise<void> {
    const db = await getDatabase();
    const pending = await db.select<unknown[]>(
      `SELECT 1 FROM pending_cloud_operations WHERE scope = 'offers'
       UNION ALL SELECT 1 FROM offers WHERE sync_status = 'pending' LIMIT 1`,
    );
    if (pending.length) await this.sync();
  }

  private flushDeletions(creds: SupabaseConfig): Promise<number> {
    return flushPendingCloudOperations(
      "offers",
      async ({ record_id, payload, project_url }) => {
        const expectedProject = normalizeSupabaseProjectUrl(project_url);
        const actualProject = normalizeSupabaseProjectUrl(creds.projectUrl);
        if (!expectedProject || !actualProject || expectedProject !== actualProject) {
          throw new Error("Il progetto Supabase attivo è cambiato durante l'eliminazione dell'offerta.");
        }
        const { remoteId } = JSON.parse(payload) as { remoteId: number | null };
        const target = new URL("/rest/v1/offerte", creds.projectUrl);
        target.searchParams.set(remoteId ? "id" : "local_id", `eq.${remoteId ?? record_id}`);
        const response = await supabaseFetch(target, { method: "DELETE", headers: { apikey: creds.anonKey } });
        if (!response.ok) throw new Error(`Eliminazione offerta: HTTP ${response.status}`);
      },
      creds.projectUrl,
    );
  }

  public readonly subscribeRealtime = createSupabaseRealtimeSubscription(
    async () => {
      const config = await this.getSupabaseCredentials();
      return config ? getAuthenticatedSupabaseClient(config.projectUrl, config.anonKey) : null;
    },
    (client, isCurrent) => client.channel("last:offers", { config: { private: true } })
      .on("broadcast", { event: "offerte" }, () => {
        if (isCurrent()) void this.sync().catch(console.warn);
      }).subscribe(),
    "[OffersSync] Realtime offerte",
  );

  /**
   * Sincronizzazione bidirezionale con coalescing: se una sync è già attiva,
   * accoda un ulteriore passaggio al termine anziché fallire o perdere modifiche.
   */
  public async sync(): Promise<OffersSyncResult> {
    if (this.activeSyncPromise) {
      this.pendingResync = true;
      return this.activeSyncPromise;
    }

    this.activeSyncPromise = (async () => {
      let totalPushed = 0;
      let totalPulled = 0;
      let lastResult: OffersSyncResult = { success: true, pushed: 0, pulled: 0 };

      do {
        this.pendingResync = false;
        lastResult = await this.executeSingleSync();
        totalPushed += lastResult.pushed;
        totalPulled += lastResult.pulled;
        if (!lastResult.success) {
          this.pendingResync = false;
          return { ...lastResult, pushed: totalPushed, pulled: totalPulled };
        }
      } while (this.pendingResync);

      return {
        success: true,
        pushed: totalPushed,
        pulled: totalPulled,
      };
    })().finally(() => {
      this.activeSyncPromise = null;
    });

    return this.activeSyncPromise;
  }

  private async executeSingleSync(): Promise<OffersSyncResult> {
    const creds = await this.getSupabaseCredentials();
    if (!creds) {
      this.syncError = "Configurazione Supabase non configurata";
      return { success: false, pushed: 0, pulled: 0, error: this.syncError };
    }

    this.isSyncing = true;
    this.syncError = null;

    let pushed = 0;
    let pulled = 0;
    let updated = 0;
    let deleted = 0;

    try {
      const db = await getDatabase();

      await this.flushDeletions(creds);

      // 1. PUSH: Invia le offerte con sync_status = 'pending' verso Supabase (solo per il progetto attivo)
      const activeProjectUrl = normalizeSupabaseProjectUrl(creds.projectUrl);
      const pendings = await db.select<Array<OfferRecord & { project_url?: string | null }>>(
        `SELECT * FROM offers WHERE sync_status = 'pending' AND NOT EXISTS (
          SELECT 1 FROM pending_cloud_operations WHERE scope = 'offers' AND record_id = offers.id
        )`
      );

      for (const item of pendings) {
        if (!matchesActiveSupabaseProject(item.project_url, activeProjectUrl)) continue;
        const payload = {
          local_id: item.id,
          offer_date: item.offer_date,
          requester: item.requester,
          contact: item.contact || "",
          items_text: item.items_text,
          status: item.status,
          is_urgent: Boolean(item.is_urgent),
          is_archived: Boolean(item.is_archived),
          created_by: item.created_by || "Operatore",
          updated_by: item.updated_by || "Operatore",
          created_at: item.created_at,
          updated_at: item.updated_at,
        };

        if (item.supabase_id) {
          const url = new URL(`/rest/v1/offerte?id=eq.${item.supabase_id}`, creds.projectUrl);
          const res = await supabaseFetch(url.toString(), {
            method: "PATCH",
            headers: {
              apikey: creds.anonKey,
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            const confirmed = await res.json();
            if (!Array.isArray(confirmed) || confirmed.length !== 1) throw new Error("Offerta non confermata da Supabase");
            await db.execute(
              "UPDATE offers SET sync_status = 'synced' WHERE id = $1 AND updated_at = $2",
              [item.id, item.updated_at],
            );
            pushed++;
          } else {
            const errBody = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(`Errore invio Supabase: ${errBody?.message || res.statusText || res.status}`);
          }
        } else {
          const url = new URL("/rest/v1/offerte?on_conflict=local_id", creds.projectUrl);
          const res = await supabaseFetch(url.toString(), {
            method: "POST",
            headers: {
              apikey: creds.anonKey,
              "Content-Type": "application/json",
              Prefer: "return=representation,resolution=merge-duplicates",
            },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            const data = await res.json().catch(() => []);
            const remoteId = Array.isArray(data) && data[0]?.id ? Number(data[0].id) : null;
            if (!remoteId) throw new Error("Offerta non confermata da Supabase");
            await db.execute(
              `UPDATE offers SET supabase_id = $1,
               sync_status = CASE WHEN updated_at = $3 THEN 'synced' ELSE sync_status END WHERE id = $2`,
              [remoteId, item.id, item.updated_at],
            );
            pushed++;
          } else {
            const errBody = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(`Errore invio Supabase: ${errBody?.message || res.statusText || res.status}`);
          }
        }
      }

      // 2. PULL: Scarica le offerte remote e aggiorna la copia locale
      const pullUrl = new URL(
        `/rest/v1/offerte?select=*&order=id.desc&limit=${REMOTE_PULL_LIMIT}`,
        creds.projectUrl
      );
      const pullRes = await supabaseFetch(pullUrl.toString(), {
        headers: {
          apikey: creds.anonKey,
          Prefer: "count=exact",
        },
      });

      if (!pullRes.ok) {
        const errBody = (await pullRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(`Errore lettura Supabase: ${errBody?.message || pullRes.statusText || pullRes.status}`);
      }

      const remoteList = (await pullRes.json()) as RemoteOfferRow[];

      if (Array.isArray(remoteList)) {
        const remoteIds = new Set<number>();

        for (const rem of remoteList) {
          remoteIds.add(Number(rem.id));

          const existing = await db.select<OfferRecord[]>(
            `SELECT * FROM offers WHERE (supabase_id = $1 OR (id = $2 AND $2 IS NOT NULL)) AND (project_url = $3 OR project_url IS NULL) LIMIT 1`,
            [rem.id, rem.local_id || null, activeProjectUrl]
          );

          const isArchivedNum = rem.is_archived ? 1 : 0;
          const isUrgentNum = rem.is_urgent ? 1 : 0;
          const nowIso = new Date().toISOString();

          if (existing.length === 0) {
            const newId = rem.local_id || crypto.randomUUID();
            await db.execute(
              `INSERT INTO offers (
                id, supabase_id, offer_date, requester, contact, items_text, status, is_urgent, is_archived, created_by, updated_by, created_at, updated_at, sync_status, project_url
              ) SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'synced', $14
              WHERE NOT EXISTS (
                SELECT 1 FROM pending_cloud_operations
                WHERE scope = 'offers' AND project_url = $14 AND (record_id = $1 OR json_extract(payload, '$.remoteId') = $2)
              ) ON CONFLICT(id) DO NOTHING`,
              [
                newId,
                rem.id,
                rem.offer_date || nowIso.slice(0, 10),
                rem.requester || "Cliente",
                rem.contact || "",
                rem.items_text || "",
                rem.status || "Da preparare",
                isUrgentNum,
                isArchivedNum,
                rem.created_by || "Operatore",
                rem.updated_by || "Operatore",
                rem.created_at || nowIso,
                rem.updated_at || nowIso,
                activeProjectUrl,
              ]
            );
            pulled++;
          } else if (existing[0].sync_status === "synced" && hasOfferChanged(existing[0], rem)) {
            await db.execute(
              `UPDATE offers SET 
                supabase_id = $1,
                offer_date = $2,
                requester = $3,
                contact = $4,
                items_text = $5,
                status = $6,
                is_urgent = $7,
                is_archived = $8,
                created_by = $9,
                updated_by = $10,
                updated_at = $11,
                project_url = $14
               WHERE id = $12 AND sync_status = 'synced' AND updated_at = $13`,
              [
                rem.id,
                rem.offer_date,
                rem.requester,
                rem.contact || "",
                rem.items_text,
                rem.status,
                isUrgentNum,
                isArchivedNum,
                rem.created_by || "Operatore",
                rem.updated_by || "Operatore",
                rem.updated_at || nowIso,
                existing[0].id, existing[0].updated_at,
                activeProjectUrl,
              ]
            );
            updated++;
          }
        }

        // Se abbiamo ricevuto l'elenco completo, rimuovi localmente i record synced eliminati da altri PC
        const total = pullRes.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
        if (total !== undefined && Number(total) === remoteList.length && remoteIds.size === remoteList.length) {
          const localSynced = await db.select<{ id: string; supabase_id: number | null }[]>(
            `SELECT id, supabase_id FROM offers WHERE supabase_id IS NOT NULL AND sync_status = 'synced' AND project_url = $1`,
            [activeProjectUrl]
          );
          for (const loc of localSynced) {
            if (loc.supabase_id !== null && !remoteIds.has(Number(loc.supabase_id))) {
              await db.execute(`DELETE FROM offers WHERE id = $1 AND sync_status = 'synced' AND supabase_id = $2`,
                [loc.id, loc.supabase_id]);
              deleted++;
            }
          }
        }
      }

      this.lastSyncTime = new Date();
      if (pushed > 0 || pulled > 0 || updated > 0 || deleted > 0) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("offers-data-updated"));
        }
      }
      return { success: true, pushed, pulled };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.syncError = msg;
      console.warn("[OffersSync] Sync interrotta (offline o errore rete):", err);
      return { success: false, pushed, pulled, error: msg };
    } finally {
      this.isSyncing = false;
    }
  }

}

export const offersSyncService = new OffersSyncService();

import { createSupabaseRealtimeSubscription } from "@/shared/services/supabaseRealtimeSubscription";
import { flushPendingCloudOperations } from "@/shared/data-layer/pendingCloudOperations";
import { getAuthenticatedSupabaseClient } from "@/shared/services/supabaseSession";
import { supabaseFetch } from "@/shared/services/supabaseSession";
import { matchesActiveSupabaseProject, normalizeSupabaseProjectUrl } from "@/shared/services/supabaseConfigCache";
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import type { OfferRecord } from "../types/offer";
import { writeRemoteOffer } from "./offerCloudWrite";

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
  private missingOffers = new Map<string, { remoteId: number; projectUrl: string }>();

  public getStatus() {
    return {
      isSyncing: this.isSyncing,
      syncError: this.syncError,
      lastSyncTime: this.lastSyncTime,
      missingOfferIds: [...this.missingOffers.keys()],
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
    if (pending.length) {
      const result = await this.sync();
      if (!result.success) throw new Error(result.error || "Sincronizzazione offerte incompleta");
    }
  }

  public async republishMissingOffer(id: string): Promise<OffersSyncResult> {
    await this.activeSyncPromise;
    const missing = this.missingOffers.get(id);
    const creds = await this.getSupabaseCredentials();
    if (!missing || !matchesActiveSupabaseProject(missing.projectUrl, creds?.projectUrl)) {
      throw new Error("Verifica di nuovo lo stato cloud dell’offerta prima di ripubblicarla.");
    }
    const db = await getDatabase();
    const write = await db.execute(
      `UPDATE offers SET supabase_id = NULL
       WHERE id = $1 AND supabase_id = $2 AND project_url = $3 AND sync_status = 'pending'
         AND NOT EXISTS (
           SELECT 1 FROM pending_cloud_operations WHERE scope = 'offers' AND record_id = offers.id
         )`,
      [id, missing.remoteId, missing.projectUrl],
    );
    if (write.rowsAffected !== 1) throw new Error("Lo stato dell’offerta è cambiato. Aggiorna la lista e riprova.");
    this.missingOffers.delete(id);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("offers-data-updated"));
    return this.sync();
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
        target.searchParams.set("local_id", `eq.${record_id}`);
        target.searchParams.set("select", "id");
        const response = await supabaseFetch(target, {
          method: "DELETE",
          headers: { apikey: creds.anonKey, Prefer: "return=representation" },
        });
        if (!response.ok) throw new Error(`Eliminazione offerta: HTTP ${response.status}`);
        const removed = await response.json();
        if (!Array.isArray(removed) || removed.length > 1) throw new Error("Eliminazione offerta non confermata");
        if (!removed.length && remoteId) {
          target.search = "";
          target.searchParams.set("id", `eq.${remoteId}`);
          target.searchParams.set("local_id", "is.null");
          const legacyDelete = await supabaseFetch(target, { method: "DELETE", headers: { apikey: creds.anonKey } });
          if (!legacyDelete.ok) throw new Error(`Eliminazione offerta: HTTP ${legacyDelete.status}`);
        }
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
    const missingOffers = new Map<string, { remoteId: number; projectUrl: string }>();

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
        const itemProjectUrl = item.project_url;
        if (!itemProjectUrl || !matchesActiveSupabaseProject(itemProjectUrl, activeProjectUrl)) continue;
        const remoteId = await writeRemoteOffer(creds, item);
        if (remoteId === null && item.supabase_id) {
          missingOffers.set(item.id, { remoteId: item.supabase_id, projectUrl: itemProjectUrl });
          continue;
        }
        await db.execute(
          `UPDATE offers SET supabase_id = $1,
             sync_status = CASE WHEN updated_at = $3 THEN 'synced' ELSE sync_status END
           WHERE id = $2 AND project_url = $4 AND supabase_id IS $5 AND sync_status = 'pending'`,
          [remoteId, item.id, item.updated_at, itemProjectUrl, item.supabase_id ?? null],
        );
        pushed++;
      }

      // 2. PULL: Scarica tutte le offerte remote con paginazione completa
      const remoteList: RemoteOfferRow[] = [];
      let expectedRemoteTotal: number | null = null;
      for (let offset = 0; ; offset += REMOTE_PULL_LIMIT) {
        const pullUrl = new URL(
          `/rest/v1/offerte?select=*&order=id.asc&limit=${REMOTE_PULL_LIMIT}&offset=${offset}`,
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

        const rangeHeader = pullRes.headers.get("content-range");
        const parsedTotal = rangeHeader ? Number(rangeHeader.split("/").pop()) : NaN;
        if (Number.isFinite(parsedTotal)) expectedRemoteTotal = parsedTotal;

        const page = (await pullRes.json()) as RemoteOfferRow[];
        if (!Array.isArray(page) || page.length === 0) break;
        remoteList.push(...page);
        if (page.length < REMOTE_PULL_LIMIT) break;
        if (expectedRemoteTotal !== null && remoteList.length >= expectedRemoteTotal) break;
      }

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
        if (expectedRemoteTotal !== null && expectedRemoteTotal === remoteList.length && remoteIds.size === remoteList.length) {
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

      if (missingOffers.size) {
        this.syncError = `Offerte da verificare prima di ripubblicarle sul cloud: ${missingOffers.size}`;
        return { success: false, pushed, pulled, error: this.syncError };
      }
      this.lastSyncTime = new Date();
      return { success: true, pushed, pulled };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.syncError = msg;
      console.warn("[OffersSync] Sync interrotta (offline o errore rete):", err);
      return { success: false, pushed, pulled, error: msg };
    } finally {
      this.isSyncing = false;
      const missingChanged = this.missingOffers.size !== missingOffers.size ||
        [...this.missingOffers.keys()].some((id) => !missingOffers.has(id));
      this.missingOffers = missingOffers;
      if (typeof window !== "undefined" && (pushed || pulled || updated || deleted || missingChanged)) {
        window.dispatchEvent(new CustomEvent("offers-data-updated"));
      }
    }
  }

}

export const offersSyncService = new OffersSyncService();

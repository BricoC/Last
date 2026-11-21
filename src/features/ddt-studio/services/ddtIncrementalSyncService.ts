import { createSupabaseRealtimeSubscription } from "@/shared/services/supabaseRealtimeSubscription";
import { getAuthenticatedSupabaseClient } from "@/shared/services/supabaseSession";
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { clientSyncService } from "@/features/clients/services/clientSyncService";
import { ddtRepository } from "./ddtRepository";
import { ddtCloudPushService } from "./ddtCloudPushService";
import { pullDdtChanges } from "./ddtCloudPull";
import { OrNumbersRepository } from "@/features/or-numbers/services/orNumbersRepository";


interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
}

export interface NumberingGapInfo {
  year: number;
  missingNumbers: number[];
}

export interface IncrementalSyncResult {
  newHeadersCount: number;
  newLinesCount: number;
  recoveredGapsCount?: number;
  updatedHistoricalCount?: number;
  unresolvedGaps?: NumberingGapInfo[];
  backupPath: string | null;
  error?: string;
}

export interface SyncDdtOptions {
  includePreviousYear?: boolean;
  checkModifiedRecent?: boolean;
}

class DdtIncrementalSyncService {
  private activeSyncPromise: Promise<IncrementalSyncResult> | null = null;
  private pendingResync = false;
  private pendingIncludePrevYear = false;
  private pendingCheckModified = false;
  public readonly subscribeRealtime = createSupabaseRealtimeSubscription(
    async () => {
      const status = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
      const config = status?.config;
      return config?.projectUrl && config.anonKey
        ? getAuthenticatedSupabaseClient(config.projectUrl, config.anonKey)
        : null;
    },
    (client, isCurrent) => client
        .channel("last:ddt", { config: { private: true } })
        .on(
          "broadcast",
          { event: "ddt" },
          ({ payload }) => {
            if (!isCurrent() || !payload) return;
            void this.syncNewDdtsFromSupabase().catch(console.warn);
          }
        )
        .subscribe(),
    "[Sync Incrementale] Realtime DDT",
  );

  public async syncNewDdtsFromSupabase(
    options: SyncDdtOptions = {}
  ): Promise<IncrementalSyncResult> {
    if (this.activeSyncPromise) {
      this.pendingResync = true;
      if (options.includePreviousYear) this.pendingIncludePrevYear = true;
      if (options.checkModifiedRecent) this.pendingCheckModified = true;
      return this.activeSyncPromise;
    }

    this.activeSyncPromise = (async () => {
      let lastResult: IncrementalSyncResult = { newHeadersCount: 0, newLinesCount: 0, backupPath: null };
      let totalHeaders = 0;
      let totalLines = 0;
      let nextOpts: SyncDdtOptions = { ...options };

      do {
        this.pendingResync = false;
        this.pendingIncludePrevYear = false;
        this.pendingCheckModified = false;
        lastResult = await this.executeSingleSync(nextOpts);
        totalHeaders += lastResult.newHeadersCount;
        totalLines += lastResult.newLinesCount;
        if (lastResult.error) {
          this.pendingResync = false;
          return { ...lastResult, newHeadersCount: totalHeaders, newLinesCount: totalLines };
        }
        nextOpts = {
          includePreviousYear: this.pendingIncludePrevYear,
          checkModifiedRecent: this.pendingCheckModified,
        };
      } while (this.pendingResync);

      if (
        typeof window !== "undefined" &&
        (totalHeaders > 0 || (lastResult.updatedHistoricalCount ?? 0) > 0 || (lastResult.recoveredGapsCount ?? 0) > 0)
      ) {
        window.dispatchEvent(new CustomEvent("cloud-sync-status-updated"));
      }

      return { ...lastResult, newHeadersCount: totalHeaders, newLinesCount: totalLines };
    })().finally(() => {
      this.activeSyncPromise = null;
    });

    return this.activeSyncPromise;
  }

  private async executeSingleSync(options: SyncDdtOptions): Promise<IncrementalSyncResult> {
    const empty = { newHeadersCount: 0, newLinesCount: 0, backupPath: null };
    try {
      const status = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
      if (!status?.config?.projectUrl || !status.config.anonKey) {
        return { ...empty, error: "Configurazione Supabase assente" };
      }
      const push = await ddtCloudPushService.pushPendingDdts();
      const pull = await pullDdtChanges(status.config.projectUrl, status.config.anonKey);
      const year = new Date().getFullYear();
      if (pull.added || pull.updated || pull.deleted) {
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ddt-data-updated"));
        if (pull.added) {
          await clientSyncService.importMissingClientsFromDdts();
          await ddtRepository.enrichMissingDdtClientData();
        }
      }
      await OrNumbersRepository.syncOrdersFromSupabase(year).catch(console.warn);
      const unresolvedGaps: NumberingGapInfo[] = [];
      if (options.includePreviousYear) {
        const db = await getDatabase();
        for (const y of [year, year - 1]) {
          const rows = await db.select<{ doc_number: number }[]>(
            "SELECT DISTINCT doc_number FROM ddt_documents WHERE year=$1 AND doc_number>0 AND (status<>'bozza' OR deleted_at IS NOT NULL) ORDER BY doc_number",
            [y],
          );
          const missingNumbers: number[] = [];
          let next = 1;
          for (const row of rows) {
            while (next < row.doc_number) missingNumbers.push(next++);
            next = row.doc_number + 1;
          }
          if (missingNumbers.length) unresolvedGaps.push({ year: y, missingNumbers });
        }
        if (unresolvedGaps.length && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("ddt-numbering-gap-detected", { detail: { unresolvedGaps } }));
        }
      }
      return {
        newHeadersCount: pull.added,
        newLinesCount: pull.lines,
        updatedHistoricalCount: pull.updated + pull.deleted,
        backupPath: null,
        unresolvedGaps,
        ...(push.errors || pull.deferred ? {
          error: [push.errors && `DDT da inviare: ${push.errors}`, pull.deferred && `DDT cloud in conflitto: ${pull.deferred}`]
            .filter(Boolean).join(" · "),
        } : {}),
      };
    } catch (err) {
      return { ...empty, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const ddtIncrementalSyncService = new DdtIncrementalSyncService();

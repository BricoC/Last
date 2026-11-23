import { supabaseFetch } from "@/shared/services/supabaseSession";
import { normalizeSupabaseProjectUrl } from "./supabaseConfigCache";
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import type { IncrementalSyncResult } from "@/features/ddt-studio/services/ddtIncrementalSyncService";

export interface CloudSyncStatusInfo {
  isConfigured: boolean;
  isChecking: boolean;
  error?: string | null;

  // Stato Locale (Ultimo scaricamento nel programma)
  localLastSyncDate: Date | null;
  localLastSyncSummary: string | null;
  localLatestDdt: {
    year: number;
    number: number;
    date: string;
    client: string;
  } | null;
  localLatestListino: {
    code: string;
    description: string;
    updatedAt: string | null;
  } | null;

  // Stato Remoto (Effettivo aggiornamento su Supabase)
  remoteLatestDate: Date | null;
  remoteLatestSummary: string | null;
  remoteLatestDdt: {
    year: number;
    number: number;
    date: string;
    client: string;
    createdAt?: string;
  } | null;
  remoteLatestListino: {
    code: string;
    description: string;
    updatedAt: string | null;
  } | null;

  // Confronto Allineamento
  hasPendingRemoteChanges: boolean;
  hasPendingLocalChanges?: boolean;
  canAutoSync?: boolean;
  alignmentMessage: string;
}

export function formatSyncTimestamp(date: Date | string | null | undefined): string {
  if (!date) return "Nessuna sincronizzazione registrata";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "Data non disponibile";

  const pad = (n: number) => String(n).padStart(2, "0");
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());

  const today = new Date();
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  if (isToday) {
    return `Oggi alle ${hours}:${minutes}:${seconds}`;
  }
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 10) return "appena adesso";
  if (diffSec < 60) return `${diffSec} sec fa`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ore fa`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} gg fa`;
}

class CloudSyncStatusService {
  private lastStatus: CloudSyncStatusInfo | null = null;
  private lastCheckTime = 0;
  private isChecking = false;

  public async getStatus(forceRefresh = false): Promise<CloudSyncStatusInfo> {
    const now = Date.now();
    // Cache di 15 secondi a meno che non sia forzato
    if (!forceRefresh && this.lastStatus && now - this.lastCheckTime < 15000) {
      return this.lastStatus;
    }
    if (this.isChecking && this.lastStatus) {
      return this.lastStatus;
    }

    this.isChecking = true;
    try {
      const status = await this.computeStatus();
      this.lastStatus = status;
      this.lastCheckTime = Date.now();
      return status;
    } finally {
      this.isChecking = false;
    }
  }

  private async computeStatus(): Promise<CloudSyncStatusInfo> {
    // 1. Carica configurazione Supabase
    const cfgStatus = await invoke<{ config: { projectUrl: string; anonKey: string } | null }>(
      "load_supabase_config"
    ).catch(() => null);

    const isConfigured = Boolean(cfgStatus?.config?.projectUrl && cfgStatus?.config?.anonKey);

    // 2. Lettura dati locali
    let localLastSyncDate: Date | null = null;
    const storedTimestamp = localStorage.getItem("last_supabase_sync_timestamp");
    if (storedTimestamp) {
      const parsed = new Date(storedTimestamp);
      if (!isNaN(parsed.getTime())) {
        localLastSyncDate = parsed;
      }
    }
    const localLastSyncSummary = localStorage.getItem("last_supabase_sync_summary") || null;

    let localLatestDdt: CloudSyncStatusInfo["localLatestDdt"] = null;
    let localLatestListino: CloudSyncStatusInfo["localLatestListino"] = null;
    let hasPendingLocalChanges = false;
    let localError: string | null = null;

    try {
      const db = await getDatabase();
      const ddtRows = await db.select<
        { year: number; doc_number: number; date: string; client_name: string }[]
      >(
        `SELECT year, doc_number, doc_date as date, client_name 
         FROM ddt_documents 
         WHERE deleted_at IS NULL AND doc_number IS NOT NULL 
         ORDER BY year DESC, doc_number DESC 
         LIMIT 1;`
      );
      if (ddtRows.length > 0) {
        localLatestDdt = {
          year: ddtRows[0].year,
          number: ddtRows[0].doc_number,
          date: ddtRows[0].date || "",
          client: ddtRows[0].client_name || "",
        };
      }

      const listinoRows = await db.select<
        { codice_articolo: string; descrizione: string; updated_at: string }[]
      >(
        `SELECT codice_articolo, descrizione, updated_at 
         FROM listino_generale 
         WHERE updated_at IS NOT NULL AND updated_at != '' 
         ORDER BY updated_at DESC 
         LIMIT 1;`
      );
      if (listinoRows.length > 0) {
        localLatestListino = {
          code: listinoRows[0].codice_articolo || "",
          description: listinoRows[0].descrizione || "",
          updatedAt: listinoRows[0].updated_at || null,
        };
      }
      const activeProjectUrl = normalizeSupabaseProjectUrl(cfgStatus?.config?.projectUrl ?? "");
      const [pending] = await db.select<{ count: number }[]>(`SELECT (
        EXISTS(SELECT 1 FROM listino_generale WHERE sync_revision IS NOT NULL)
        OR EXISTS(SELECT 1 FROM listini_clienti WHERE sync_revision IS NOT NULL)
        OR EXISTS(SELECT 1 FROM company_settings WHERE id = 'company_profile' AND deleted_at IS NULL AND sync_status = 'pending')
        OR EXISTS(SELECT 1 FROM email_settings WHERE id = 'email_config' AND deleted_at IS NULL AND sync_status = 'pending')
        OR ($1 IS NOT NULL AND (
          EXISTS(SELECT 1 FROM ddt_documents WHERE sync_status = 'pending' AND status <> 'bozza' AND project_url = $1)
          OR EXISTS(SELECT 1 FROM quotes WHERE sync_status = 'pending' AND deleted_at IS NULL AND project_url = $1)
          OR EXISTS(SELECT 1 FROM clients WHERE sync_status = 'pending' AND deleted_at IS NULL AND project_url = $1)
          OR EXISTS(SELECT 1 FROM offers WHERE sync_status = 'pending' AND project_url = $1)
          OR EXISTS(SELECT 1 FROM notes WHERE sync_status = 'pending' AND project_url = $1)
          OR EXISTS(SELECT 1 FROM note_deletions WHERE project_url = $1)
          OR EXISTS(SELECT 1 FROM supplier_invoices WHERE cloud_upload_pending = 1 AND project_url = $1)
          OR EXISTS(SELECT 1 FROM orders WHERE sync_status = 'pending' AND project_url = $1)
          OR EXISTS(SELECT 1 FROM pending_cloud_operations WHERE project_url = $1)
        ))
      ) AS count`, [activeProjectUrl]);
      hasPendingLocalChanges = Boolean(pending?.count);
    } catch (err) {
      console.warn("[CloudSyncStatus] Errore lettura dati locali SQLite:", err);
      localError = "Verifica dei dati locali incompleta";
    }

    if (!isConfigured || !cfgStatus?.config) {
      return {
        isConfigured: false,
        isChecking: false,
        error: "Credenziali Supabase non configurate",
        localLastSyncDate,
        localLastSyncSummary,
        localLatestDdt,
        localLatestListino,
        remoteLatestDate: null,
        remoteLatestSummary: null,
        remoteLatestDdt: null,
        remoteLatestListino: null,
        hasPendingRemoteChanges: false,
        alignmentMessage: "Supabase non configurato",
      };
    }

    // 3. Lettura remota da Supabase
    const projectUrl = cfgStatus.config.projectUrl.trim().replace(/\/$/, "");
    const anonKey = cfgStatus.config.anonKey.trim();
    const headers = { apikey: anonKey };

    let remoteLatestDdt: CloudSyncStatusInfo["remoteLatestDdt"] = null;
    let remoteLatestListino: CloudSyncStatusInfo["remoteLatestListino"] = null;
    let remoteLatestDate: Date | null = null;
    let remoteLatestSummary: string | null = null;
    let remoteError: string | null = null;

    let hasPendingRemoteChanges = false;
    try {
      const listTables = ["listino_generale", "listini_vari", "listini_clienti"] as const;
      const [remoteRevision, ddt, ...lists] = await Promise.all([
        supabaseFetch(`${projectUrl}/rest/v1/rpc/last_ddt_revision`, {
          method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}",
        }),
        supabaseFetch(`${projectUrl}/rest/v1/ddt?select=anno,numero,cliente,data,created_at,ultima_modifica&order=anno.desc,numero.desc&limit=1`, { headers }),
        ...listTables.map((table) => supabaseFetch(
          `${projectUrl}/rest/v1/${table}?select=codice_articolo,descrizione,updated_at,last_sync_revision&order=last_sync_revision.desc&limit=1`, { headers },
        )),
      ]);
      if (!remoteRevision.ok || !ddt.ok || lists.some((response) => !response.ok)) {
        throw new Error("Verifica cloud incompleta. Controlla la connessione e le migrazioni Supabase.");
      }
      const [{ readPriceListPullState }, { getDdtPullState }] = await Promise.all([
        import("@/features/price-lists/services/priceListPullState"),
        import("@/features/ddt-studio/services/ddtCloudPull"),
      ]);
      const [revision, [latestDdt], priceState, ddtState, ...latestLists] = await Promise.all([
        remoteRevision.json(), ddt.json(), readPriceListPullState(projectUrl), getDdtPullState(projectUrl),
        ...lists.map((response) => response.json()),
      ]);
      if (!/^\d+$/.test(String(revision))) throw new Error("Revisione DDT non valida");
      hasPendingRemoteChanges = !ddtState.initialized || BigInt(revision) > BigInt(ddtState.revision);
      const registerActivity = (time: string | null | undefined, summary: string) => {
        if (!time) return;
        const date = new Date(time);
        if (Number.isFinite(date.getTime()) && (!remoteLatestDate || date > remoteLatestDate)) {
          remoteLatestDate = date;
          remoteLatestSummary = summary;
        }
      };
      if (latestDdt) {
        remoteLatestDdt = {
          year: Number(latestDdt.anno), number: Number(latestDdt.numero), date: latestDdt.data || "",
          client: latestDdt.cliente || "", createdAt: latestDdt.created_at || undefined,
        };
        registerActivity(latestDdt.ultima_modifica || latestDdt.created_at, `DDT n. ${latestDdt.numero}`);
      }
      for (const [index, table] of listTables.entries()) {
        const [row] = latestLists[index];
        if (!row) continue;
        const cursor = priceState.get(table);
        if (!/^\d+$/.test(String(row.last_sync_revision))) throw new Error("Revisione listino non valida");
        if (!cursor || BigInt(row.last_sync_revision) > BigInt(cursor)) hasPendingRemoteChanges = true;
        if (table !== "listini_clienti" &&
          (!remoteLatestListino || Date.parse(row.updated_at) > Date.parse(remoteLatestListino.updatedAt ?? ""))) {
          remoteLatestListino = { code: row.codice_articolo || "", description: row.descrizione || "", updatedAt: row.updated_at };
        }
        registerActivity(row.updated_at, table === "listini_clienti" ? "Listini Clienti" : "Listino Generale");
      }
    } catch (error) {
      remoteError = error instanceof Error ? error.message : String(error);
    }
    const lastFailure = localStorage.getItem("last_supabase_sync_failure");
    const alignmentMessage = remoteError ?? localError ?? lastFailure ?? (
      hasPendingRemoteChanges ? "Modifiche remote da scaricare" :
      hasPendingLocalChanges ? "Modifiche locali da inviare" : "Programma allineato a Supabase"
    );

    return {
      isConfigured: true,
      isChecking: false,
      error: remoteError ?? localError ?? lastFailure,
      canAutoSync: !remoteError && !localError,
      hasPendingLocalChanges,
      localLastSyncDate,
      localLastSyncSummary,
      localLatestDdt,
      localLatestListino,
      remoteLatestDate,
      remoteLatestSummary,
      remoteLatestDdt,
      remoteLatestListino,
      hasPendingRemoteChanges,
      alignmentMessage,
    };
  }

  /**
   * Esegue la sincronizzazione completa (DDT + Listino Generale + Listini Clienti)
   * e aggiorna il timestamp locale dell'ultimo scaricamento.
   */
  public async executeFullSync(): Promise<{
    ddtResult: IncrementalSyncResult;
    genCount: number;
    cliCount: number;
    summary: string;
    success: boolean;
  }> {
    const [
      priceListModule,
      offersModule,
      clientModule,
      ddtModule,
      quotesModule,
      notesModule,
      ordersModule,
      invoicesModule,
      orNumbersModule,
      companySettingsModule,
      emailSettingsModule,
    ] = await Promise.all([
      import("@/features/price-lists/services/priceListSyncService"),
      import("@/features/offers/services/offersSyncService"),
      import("@/features/clients/services/clientSyncService"),
      import("@/features/ddt-studio/services/ddtIncrementalSyncService"),
      import("@/features/quotes/services/quoteSyncService"),
      import("@/features/notes/services/notesSyncService"),
      import("@/features/orders/services/orderSupabaseService"),
      import("@/features/invoices/services/electronicInvoicesService"),
      import("@/features/or-numbers/services/orNumbersRepository"),
      import("@/features/settings/companySettingsRepository"),
      import("@/features/settings/emailSettingsRepository"),
    ]);
    const { priceListSyncService } = priceListModule;
    const { offersSyncService } = offersModule;
    const { clientSyncService } = clientModule;
    const { ddtIncrementalSyncService } = ddtModule;
    const { QuoteSyncService } = quotesModule;
    const { notesSyncService } = notesModule;
    const { orderSupabaseService } = ordersModule;
    const { electronicInvoicesService } = invoicesModule;
    const { OrNumbersRepository } = orNumbersModule;
    const { retryPendingCompanySettings } = companySettingsModule;
    const { retryPendingEmailSettings } = emailSettingsModule;

    const [
      priceWrites,
      offerWrites,
      clientWrites,
      quoteWrites,
      noteWrites,
      orderWrites,
      invoiceWrites,
      orLogWrites,
      companySettingsWrites,
      emailSettingsWrites,
    ] = await Promise.allSettled([
      priceListSyncService.retryPendingChanges(),
      offersSyncService.retryPendingChanges(),
      clientSyncService.syncPendingClientsToSupabase(),
      QuoteSyncService.retryPendingChanges(),
      notesSyncService.sync(),
      orderSupabaseService.processOfflineQueue(),
      electronicInvoicesService.retryPendingUploads(),
      OrNumbersRepository.retryPendingLogs(),
      retryPendingCompanySettings().then((ok) => { if (!ok) throw new Error("Invio dati aziendali non confermato"); }),
      retryPendingEmailSettings().then((ok) => { if (!ok) throw new Error("Invio impostazioni email non confermato"); }),
    ]);
    const [ddt, general, clients] = await Promise.allSettled([
      ddtIncrementalSyncService.syncNewDdtsFromSupabase({ includePreviousYear: true, checkModifiedRecent: true }),
      priceListSyncService.syncIncrementalGeneralFromSupabase(),
      priceListSyncService.syncIncrementalClientiFromSupabase(),
    ]);
    const ddtResult = ddt.status === "fulfilled" ? ddt.value : {
      newHeadersCount: 0, newLinesCount: 0, backupPath: null, error: String(ddt.reason),
    };
    const genCount = general.status === "fulfilled" ? general.value.updatedCount : 0;
    const cliCount = clients.status === "fulfilled" ? clients.value.updatedCount : 0;

    const failures = [
      ["Invio listini", priceWrites.status === "rejected" ? String(priceWrites.reason) : undefined],
      ["Offerte", offerWrites.status === "rejected" ? String(offerWrites.reason) : undefined],
      ["Clienti", clientWrites.status === "rejected" ? String(clientWrites.reason) : undefined],
      ["Preventivi", quoteWrites.status === "rejected" ? String(quoteWrites.reason) : undefined],
      ["Note", noteWrites.status === "rejected" ? String(noteWrites.reason) : undefined],
      ["Ordini", orderWrites.status === "rejected" ? String(orderWrites.reason) : undefined],
      ["Fatture", invoiceWrites.status === "rejected" ? String(invoiceWrites.reason) : undefined],
      ["Log OR", orLogWrites.status === "rejected" ? String(orLogWrites.reason) : undefined],
      ["Dati aziendali", companySettingsWrites.status === "rejected" ? String(companySettingsWrites.reason) : undefined],
      ["Impostazioni email", emailSettingsWrites.status === "rejected" ? String(emailSettingsWrites.reason) : undefined],
      ["DDT", ddtResult.error],
      ["Listino generale", general.status === "fulfilled" ? general.value.error : String(general.reason)],
      ["Listini clienti", clients.status === "fulfilled" ? clients.value.error : String(clients.reason)],
    ].filter(([, error]) => Boolean(error)).map(([label, error]) => `${label}: ${error}`);

    let summary: string;
    if (failures.length) {
      summary = `Sincronizzazione parziale. ${failures.join(" · ")}`;
      localStorage.setItem("last_supabase_sync_failure", summary);
    } else {
      const parts = [ddtResult.newHeadersCount ? `${ddtResult.newHeadersCount} nuovi DDT` : "DDT verificati"];
      if (genCount > 0) parts.push(`${genCount} art. listino generale`);
      if (cliCount > 0) parts.push(`${cliCount} listini clienti`);
      summary = parts.join(", ");
      localStorage.setItem("last_supabase_sync_timestamp", new Date().toISOString());
      localStorage.setItem("last_supabase_sync_summary", summary);
      localStorage.removeItem("last_supabase_sync_failure");
    }

    this.lastStatus = null;
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cloud-sync-status-updated"));
    return { ddtResult, genCount, cliCount, summary, success: failures.length === 0 };
  }
}

export const cloudSyncStatusService = new CloudSyncStatusService();


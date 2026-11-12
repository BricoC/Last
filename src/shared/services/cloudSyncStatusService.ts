import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { ddtIncrementalSyncService, IncrementalSyncResult } from "@/features/ddt-studio/services/ddtIncrementalSyncService";
import { priceListSyncService } from "@/features/price-lists/services/priceListSyncService";

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
    let localMaxCliUpdatedAt: Date | null = null;
    let localMaxGenUpdatedAt: Date | null = null;

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
        if (listinoRows[0].updated_at) {
          const d = new Date(listinoRows[0].updated_at);
          if (!isNaN(d.getTime())) localMaxGenUpdatedAt = d;
        }
      }

      const cliRows = await db.select<{ updated_at: string }[]>(
        `SELECT updated_at 
         FROM listini_clienti 
         WHERE updated_at IS NOT NULL AND updated_at != '' 
         ORDER BY updated_at DESC 
         LIMIT 1;`
      );
      if (cliRows.length > 0 && cliRows[0].updated_at) {
        const d = new Date(cliRows[0].updated_at);
        if (!isNaN(d.getTime())) localMaxCliUpdatedAt = d;
      }
    } catch (err) {
      console.warn("[CloudSyncStatus] Errore lettura dati locali SQLite:", err);
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
    const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

    let remoteLatestDdt: CloudSyncStatusInfo["remoteLatestDdt"] = null;
    let remoteLatestListino: CloudSyncStatusInfo["remoteLatestListino"] = null;
    let remoteLatestDate: Date | null = null;
    let remoteLatestSummary: string | null = null;
    let remoteError: string | null = null;

    try {
      const [ddtFetch, genFetch, cliFetch] = await Promise.allSettled([
        fetch(
          `${projectUrl}/rest/v1/ddt?select=anno,numero,cliente,data,created_at,ultima_modifica&order=anno.desc,numero.desc&limit=1`,
          { headers }
        ),
        fetch(
          `${projectUrl}/rest/v1/listino_generale?select=codice_articolo,descrizione,updated_at&order=updated_at.desc.nullslast&limit=1`,
          { headers }
        ),
        fetch(
          `${projectUrl}/rest/v1/listini_clienti?select=cliente,codice_articolo,updated_at&order=updated_at.desc.nullslast&limit=1`,
          { headers }
        ),
      ]);

      let ddtDate: Date | null = null;
      if (ddtFetch.status === "fulfilled" && ddtFetch.value.ok) {
        const ddtData = (await ddtFetch.value.json()) as any[];
        if (ddtData && ddtData.length > 0) {
          const r = ddtData[0];
          remoteLatestDdt = {
            year: Number(r.anno) || new Date().getFullYear(),
            number: Number(r.numero) || 0,
            date: r.data || "",
            client: r.cliente || "",
            createdAt: r.created_at || r.ultima_modifica || undefined,
          };
          const rawDateStr = r.created_at || r.ultima_modifica || r.data;
          if (rawDateStr) {
            const p = new Date(rawDateStr);
            if (!isNaN(p.getTime())) ddtDate = p;
          }
        }
      }

      let genDate: Date | null = null;
      if (genFetch.status === "fulfilled" && genFetch.value.ok) {
        const genData = (await genFetch.value.json()) as any[];
        if (genData && genData.length > 0) {
          const g = genData[0];
          remoteLatestListino = {
            code: g.codice_articolo || "",
            description: g.descrizione || "",
            updatedAt: g.updated_at || null,
          };
          if (g.updated_at) {
            const p = new Date(g.updated_at);
            if (!isNaN(p.getTime())) genDate = p;
          }
        }
      }

      let cliDate: Date | null = null;
      if (cliFetch.status === "fulfilled" && cliFetch.value.ok) {
        const cliData = (await cliFetch.value.json()) as any[];
        if (cliData && cliData.length > 0) {
          const c = cliData[0];
          if (c.updated_at) {
            const p = new Date(c.updated_at);
            if (!isNaN(p.getTime())) cliDate = p;
          }
        }
      }

      // Trova la data più recente tra quelle trovate su Supabase
      const candidateDates: { date: Date; summary: string }[] = [];
      if (ddtDate && remoteLatestDdt) {
        candidateDates.push({
          date: ddtDate,
          summary: `DDT n. ${remoteLatestDdt.number} (${remoteLatestDdt.client || "Senza cliente"})`,
        });
      }
      if (genDate && remoteLatestListino) {
        candidateDates.push({
          date: genDate,
          summary: `Listino Generale (${remoteLatestListino.code || "Articolo"} - ${remoteLatestListino.description || ""})`,
        });
      }
      if (cliDate) {
        candidateDates.push({
          date: cliDate,
          summary: `Listini Clienti dedicati`,
        });
      }

      candidateDates.sort((a, b) => b.date.getTime() - a.date.getTime());
      if (candidateDates.length > 0) {
        remoteLatestDate = candidateDates[0].date;
        remoteLatestSummary = candidateDates[0].summary;
      }
    } catch (err: any) {
      console.warn("[CloudSyncStatus] Errore connessione Supabase:", err);
      remoteError = err?.message || "Errore di connessione a Supabase";
    }

    // 4. Calcola se ci sono modifiche remote non ancora scaricate in locale
    let hasPendingRemoteChanges = false;
    let alignmentMessage = "Programma allineato a Supabase";

    // Verifica se il database locale SQLite è già aggiornato rispetto alle ultime date rilevate sul Cloud
    // (es. se la migrazione o il salvataggio è partito da questo stesso PC, o se i dati locali sono già più recenti o identici)
    const isLocalDdtUpToDate =
      !remoteLatestDdt ||
      !localLatestDdt ||
      localLatestDdt.year > remoteLatestDdt.year ||
      (localLatestDdt.year === remoteLatestDdt.year && localLatestDdt.number >= remoteLatestDdt.number);

    let isLocalDataAlreadyUpToDate = false;
    if (isLocalDdtUpToDate && remoteLatestDate) {
      // Controlla se la modifica Cloud più recente corrisponde a dati che il DB locale ha già
      const localMaxDate = Math.max(
        localLastSyncDate?.getTime() || 0,
        localMaxGenUpdatedAt?.getTime() || 0,
        localMaxCliUpdatedAt?.getTime() || 0
      );
      // Tolleranza di 5 secondi per disallineamenti di clock o conversioni millisecondi
      if (localMaxDate > 0 && localMaxDate >= remoteLatestDate.getTime() - 5000) {
        isLocalDataAlreadyUpToDate = true;
      }
    }

    // Regola A: Se su Supabase esiste un DDT con numero superiore al massimo locale
    if (
      remoteLatestDdt &&
      localLatestDdt &&
      (remoteLatestDdt.year > localLatestDdt.year ||
        (remoteLatestDdt.year === localLatestDdt.year && remoteLatestDdt.number > localLatestDdt.number))
    ) {
      hasPendingRemoteChanges = true;
      alignmentMessage = `Nuovo DDT n. ${remoteLatestDdt.number} presente sul Cloud (locale fermo al n. ${localLatestDdt.number})`;
    }
    // Regola B: Se i dati locali (SQLite) sono già uguali o più recenti dell'attività del Cloud
    else if (isLocalDataAlreadyUpToDate) {
      hasPendingRemoteChanges = false;
      alignmentMessage = "Programma aggiornato: allineato con l'ultima attività del Cloud";
      // Auto-aggiorna il timestamp nel browser per evitare falsi positivi futuri
      try {
        if (remoteLatestDate) {
          localStorage.setItem("last_supabase_sync_timestamp", remoteLatestDate.toISOString());
          localStorage.setItem("last_supabase_sync_summary", "Dati locali già allineati al Cloud");
        }
      } catch {}
    }
    // Regola C: Se l'attività remota è più recente dell'ultimo scaricamento locale (con 5s di tolleranza)
    else if (remoteLatestDate && localLastSyncDate) {
      const diffMs = remoteLatestDate.getTime() - localLastSyncDate.getTime();
      if (diffMs > 5000) {
        hasPendingRemoteChanges = true;
        alignmentMessage = `Modifiche rilevate sul Cloud (${formatRelativeTime(remoteLatestDate)}): ${remoteLatestSummary || "Nuovi dati"}`;
      } else {
        alignmentMessage = "Programma aggiornato: allineato con l'ultima attività del Cloud";
      }
    }
    // Regola D: Se non è mai stato registrato uno scaricamento locale su questa macchina
    else if (!localLastSyncDate && remoteLatestDate) {
      if (isLocalDdtUpToDate) {
        hasPendingRemoteChanges = false;
        alignmentMessage = "Programma allineato a Supabase";
        try {
          localStorage.setItem("last_supabase_sync_timestamp", new Date().toISOString());
          localStorage.setItem("last_supabase_sync_summary", "DDT e listini allineati");
        } catch {}
      } else {
        hasPendingRemoteChanges = true;
        alignmentMessage = "Nessuna sincronizzazione recente registrata in locale";
      }
    }

    return {
      isConfigured: true,
      isChecking: false,
      error: remoteError,
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
  }> {
    const ddtResult = await ddtIncrementalSyncService.syncNewDdtsFromSupabase();

    let genCount = 0;
    try {
      const genRes = await priceListSyncService.syncIncrementalGeneralFromSupabase();
      genCount = genRes.updatedCount || 0;
    } catch (e) {
      console.warn("[CloudSyncStatus] Errore sync incrementale listino generale:", e);
    }

    let cliCount = 0;
    try {
      const cliRes = await priceListSyncService.syncIncrementalClientiFromSupabase();
      cliCount = cliRes.updatedCount || 0;
    } catch (e) {
      console.warn("[CloudSyncStatus] Errore sync incrementale listini clienti:", e);
    }

    // Genera sommario leggibile
    const parts: string[] = [];
    if (ddtResult.newHeadersCount > 0) {
      parts.push(`${ddtResult.newHeadersCount} nuovi DDT`);
    } else {
      parts.push("DDT verificati (nessun nuovo doc)");
    }
    if (genCount > 0) parts.push(`${genCount} art. listino generale`);
    if (cliCount > 0) parts.push(`${cliCount} listini clienti`);

    const summary = parts.join(", ");
    const nowIso = new Date().toISOString();

    localStorage.setItem("last_supabase_sync_timestamp", nowIso);
    localStorage.setItem("last_supabase_sync_summary", summary);

    // Invalida cache interna e ricalcola
    this.lastStatus = null;
    void this.getStatus(true);

    window.dispatchEvent(new CustomEvent("cloud-sync-status-updated"));

    return {
      ddtResult,
      genCount,
      cliCount,
      summary,
    };
  }
}

export const cloudSyncStatusService = new CloudSyncStatusService();


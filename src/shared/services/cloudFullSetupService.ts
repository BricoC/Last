import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { importAllReadableSupabaseDdts } from "@/features/settings/data-import/ddtReadOnlyPreviewService";
import { clientSyncService } from "@/features/clients/services/clientSyncService";
import { ddtRepository } from "@/features/ddt-studio/services/ddtRepository";
import { priceListSyncService, SyncProgress } from "@/features/price-lists/services/priceListSyncService";
import { AppUserService } from "@/shared/services/appUserService";
import { loadBackupConfig } from "@/features/settings/services/backupService";

export interface SetupStatus {
  needsSupabase: boolean;
  needsData: boolean;
  needsBackupFolder: boolean;
  needsUser: boolean;
  supabaseUrl: string;
  supabaseKey: string;
  backupFolder: string;
  currentUserId: string;
  isAllConfigured: boolean;
}

export interface SetupProgress {
  stage: "ddt" | "price-lists" | "users" | "completed" | "error";
  message: string;
  percent: number;
}

export class CloudFullSetupService {
  public static async checkStatus(): Promise<SetupStatus> {
    let supabaseUrl = "";
    let supabaseKey = "";

    try {
      const cfgRes = await invoke<{ config: { projectUrl: string; anonKey: string } | null }>("load_supabase_config");
      if (cfgRes?.config?.projectUrl) {
        supabaseUrl = cfgRes.config.projectUrl;
        supabaseKey = cfgRes.config.anonKey || "";
      }
    } catch (e) {
      console.warn("[CloudSetup] Errore verifica credenziali Supabase:", e);
    }

    const needsSupabase = !supabaseUrl.trim() || !supabaseKey.trim();

    // Controlla se il database locale è privo di dati (0 DDT o 0 articoli nel listino)
    let needsData = false;
    try {
      const db = await getDatabase();
      const ddtRows = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM ddt_documents WHERE deleted_at IS NULL");
      const ddtCount = ddtRows?.[0]?.count || 0;

      const listinoRows = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM listino_generale WHERE deleted_at IS NULL");
      const listinoCount = listinoRows?.[0]?.count || 0;

      if (ddtCount === 0 || listinoCount === 0) {
        needsData = true;
      }
    } catch {
      needsData = true;
    }

    const backupConfig = loadBackupConfig();
    const backupFolder = backupConfig.folderPath || "";
    const needsBackupFolder = !backupFolder.trim();

    const activeUserId = AppUserService.getActiveUserId();
    const needsUser = !activeUserId;

    // Se l'utente ha esplicitamente nascosto il reminder in localStorage
    const dismissed = typeof localStorage !== "undefined" && localStorage.getItem("dashboard_setup_dismissed") === "true";

    const isAllConfigured = (!needsSupabase && !needsData && !needsBackupFolder) || dismissed;

    return {
      needsSupabase,
      needsData,
      needsBackupFolder,
      needsUser,
      supabaseUrl,
      supabaseKey,
      backupFolder,
      currentUserId: activeUserId,
      isAllConfigured,
    };
  }

  public static async runFullCloudImport(
    projectUrl: string,
    anonKey: string,
    onProgress: (prog: SetupProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    const url = projectUrl.trim().replace(/\/$/, "");
    const key = anonKey.trim();

    if (!url || !key) {
      return { success: false, error: "Credenziali Supabase mancanti." };
    }

    try {
      // 1. Salva la configurazione nel backend di Rust
      await invoke("save_supabase_config", { config: { projectUrl: url, anonKey: key } });

      // 2. FASE 1: Download completo DDT di tutti gli anni (2023, 2024, 2025, 2026...) e righe
      onProgress({
        stage: "ddt",
        message: "Scaricamento e indicizzazione storico DDT (tutti gli anni)...",
        percent: 15,
      });

      const ddtRes = await importAllReadableSupabaseDdts(url, key);
      console.log("[CloudSetup] DDT importati da Supabase:", ddtRes);

      onProgress({
        stage: "ddt",
        message: "Estrazione e arricchimento anagrafica clienti dai DDT...",
        percent: 40,
      });

      await clientSyncService.importMissingClientsFromDdts();
      await ddtRepository.enrichMissingDdtClientData();

      // 3. FASE 2: Download completo Listino Generale (8.849) e Listini Clienti (18.558)
      onProgress({
        stage: "price-lists",
        message: "Scaricamento Listino Generale (8.849 articoli) e Listini Clienti...",
        percent: 50,
      });

      await priceListSyncService.syncAllFromSupabase((p: SyncProgress) => {
        let pct = 50;
        if (p.stage === "general") {
          pct = 50 + Math.round((p.current / (p.total || 8849)) * 20);
        } else if (p.stage === "clienti") {
          pct = 70 + Math.round((p.current / (p.total || 18558)) * 20);
        }
        onProgress({
          stage: "price-lists",
          message: p.message,
          percent: Math.min(92, pct),
        });
      });

      // 4. FASE 3: Sincronizzazione Utenti e Postazioni
      onProgress({
        stage: "users",
        message: "Sincronizzazione utenti e postazioni aziendali...",
        percent: 95,
      });

      try {
        await AppUserService.syncWithCloud();
      } catch (e) {
        console.warn("[CloudSetup] Sync utenti non riuscita:", e);
      }

      onProgress({
        stage: "completed",
        message: "Inizializzazione completata con successo! Tutti i dati sono disponibili.",
        percent: 100,
      });

      // Notifica tutti i componenti della Dashboard e DDT di ricaricare i dati aggiornati
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ddt-data-updated"));
      }

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[CloudSetup] Errore inizializzazione da Supabase:", msg);
      onProgress({
        stage: "error",
        message: `Errore: ${msg}`,
        percent: 0,
      });
      return { success: false, error: msg };
    }
  }
}

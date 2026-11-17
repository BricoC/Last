import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { importAllReadableSupabaseDdts } from "@/features/settings/data-import/ddtReadOnlyPreviewService";
import { clientSyncService } from "@/features/clients/services/clientSyncService";
import { ddtRepository } from "@/features/ddt-studio/services/ddtRepository";
import { priceListSyncService, SyncProgress } from "@/features/price-lists/services/priceListSyncService";
import { offersSyncService } from "@/features/offers/services/offersSyncService";
import { notesSyncService } from "@/features/notes/services/notesSyncService";
import { QuoteSyncService } from "@/features/quotes/services/quoteSyncService";
import { orderSupabaseService } from "@/features/orders/services/orderSupabaseService";
import { electronicInvoicesService } from "@/features/invoices/services/electronicInvoicesService";
import { AppUserService } from "@/shared/services/appUserService";
import {
  loadBackupConfig,
  pullBackupSettingsFromSupabase,
} from "@/features/settings/services/backupService";
import { pullEmailSettingsFromSupabase } from "@/features/settings/emailSettingsRepository";

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
  stage: "ddt" | "price-lists" | "modules" | "users" | "completed" | "error";
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

    // Se l'utente ha già completato il setup o chiuso il banner in localStorage
    const dismissed =
      typeof localStorage !== "undefined" &&
      (localStorage.getItem("dashboard_setup_dismissed") === "true" ||
        localStorage.getItem("dashboard_setup_completed") === "true");

    // Se Supabase e la cartella di backup sono già impostati, la postazione è già configurata
    const isAlreadySetup = !needsSupabase && !needsBackupFolder;

    const isAllConfigured = isAlreadySetup || dismissed || (!needsSupabase && !needsData && !needsBackupFolder);

    // Se è tutto configurato, memorizza persistentemente che il primo avvio è completato
    if (isAlreadySetup && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem("dashboard_setup_completed", "true");
      } catch {}
    }

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
        message: "Scaricamento storico DDT e righe da Supabase...",
        percent: 12,
      });

      const ddtRes = await importAllReadableSupabaseDdts(url, key);
      console.log("[CloudSetup] DDT importati da Supabase:", ddtRes);

      onProgress({
        stage: "ddt",
        message: "Scaricamento anagrafica completa Clienti...",
        percent: 30,
      });

      try {
        await clientSyncService.syncAllFromSupabase();
      } catch (e) {
        console.warn("[CloudSetup] Sync anagrafica clienti da Supabase non riuscita:", e);
      }
      await clientSyncService.importMissingClientsFromDdts();
      await ddtRepository.enrichMissingDdtClientData();

      // 3. FASE 2: Download completo Listino Generale, Listini Vari e Listini Clienti
      onProgress({
        stage: "price-lists",
        message: "Scaricamento Listino Generale e Listini Clienti...",
        percent: 40,
      });

      await priceListSyncService.syncAllFromSupabase((p: SyncProgress) => {
        let pct = 40;
        if (p.stage === "general") {
          pct = 40 + Math.round((p.current / (p.total || 8849)) * 18);
        } else if (p.stage === "clienti") {
          pct = 58 + Math.round((p.current / (p.total || 18558)) * 18);
        }
        onProgress({
          stage: "price-lists",
          message: p.message,
          percent: Math.min(76, pct),
        });
      });

      // 4. FASE 3: Offerte, Note, Preventivi, Ordini, Fornitori e Fatture Elettroniche
      onProgress({
        stage: "modules",
        message: "Scaricamento Offerte, Note, Preventivi, Ordini e Fatture...",
        percent: 80,
      });

      await Promise.allSettled([
        offersSyncService.sync().catch((e) => console.warn("[CloudSetup] Offerte:", e)),
        notesSyncService.sync().catch((e) => console.warn("[CloudSetup] Note:", e)),
        QuoteSyncService.pullQuotes().catch((e) => console.warn("[CloudSetup] Preventivi:", e)),
        orderSupabaseService.fetchSuppliers().catch((e) => console.warn("[CloudSetup] Fornitori:", e)),
        orderSupabaseService.fetchOrders("attivi").catch((e) => console.warn("[CloudSetup] Ordini attivi:", e)),
        orderSupabaseService.fetchOrders("archiviati").catch((e) => console.warn("[CloudSetup] Ordini archiviati:", e)),
        electronicInvoicesService.syncFromSupabase().catch((e) => console.warn("[CloudSetup] Fatture:", e)),
      ]);

      // 5. FASE 4: Utenti, Postazioni e Impostazioni Cloud
      onProgress({
        stage: "users",
        message: "Sincronizzazione utenti, email e configurazione backup...",
        percent: 94,
      });

      await Promise.allSettled([
        AppUserService.syncWithCloud().catch((e) => console.warn("[CloudSetup] Utenti:", e)),
        pullEmailSettingsFromSupabase().catch((e) => console.warn("[CloudSetup] Email settings:", e)),
        pullBackupSettingsFromSupabase().catch((e) => console.warn("[CloudSetup] Backup settings:", e)),
      ]);

      onProgress({
        stage: "completed",
        message: "Scaricamento completo da Cloud terminato con successo! Tutti i dati sono in locale.",
        percent: 100,
      });

      // Notifica tutti i moduli e la TopNavBar di aggiornare i dati e gli stati
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ddt-data-updated"));
        window.dispatchEvent(new CustomEvent("clients-data-updated"));
        window.dispatchEvent(new CustomEvent("cloud-sync-status-updated"));
        window.dispatchEvent(new CustomEvent("supabase-config-updated"));
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


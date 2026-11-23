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
import { requireSupabaseAccess } from "./supabaseSession";
import {
  loadBackupConfig,
  pullBackupSettingsFromSupabase,
} from "@/features/settings/services/backupService";
import { pullCompanySettingsFromSupabase } from "@/features/settings/companySettingsRepository";
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
  stage: "ddt" | "price-lists" | "modules" | "settings" | "completed" | "error";
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

      const listinoRows = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM listino_generale");
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

    const setupPartial = typeof localStorage !== "undefined" &&
      localStorage.getItem("dashboard_setup_partial") === "true";
    const dismissed = typeof localStorage !== "undefined" &&
      localStorage.getItem("dashboard_setup_dismissed") === "true";
    const isAllConfigured = dismissed || (!setupPartial && !needsSupabase && !needsData && !needsBackupFolder);
    needsData ||= setupPartial;

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

    const failures: string[] = [];
    const step = async (name: string, operation: () => Promise<unknown>) => {
      try {
        const result = await operation();
        if (result && typeof result === "object" && "success" in result && result.success === false) {
          throw new Error("error" in result ? String(result.error || "Operazione incompleta") : "Operazione incompleta");
        }
      } catch (error) {
        failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    try {
      await requireSupabaseAccess(url, key);

      // 2. FASE 1: Download completo DDT di tutti gli anni (2023, 2024, 2025, 2026...) e righe
      onProgress({
        stage: "ddt",
        message: "Scaricamento storico DDT e righe da Supabase...",
        percent: 12,
      });

      await step("DDT", async () => {
        const result = await importAllReadableSupabaseDdts(url, key);
        if (result.conflicts || result.orphanLines || result.lineIdConflicts) {
          throw new Error(`Import parziale (${result.conflicts} conflitti testata, ${result.orphanLines} righe orfane, ${result.lineIdConflicts} conflitti riga)`);
        }
      });

      onProgress({
        stage: "ddt",
        message: "Scaricamento anagrafica completa Clienti...",
        percent: 30,
      });

      await step("Clienti", () => clientSyncService.syncAllFromSupabase());
      await step("Anagrafica da DDT", async () => {
        await clientSyncService.importMissingClientsFromDdts();
        await ddtRepository.enrichMissingDdtClientData();
      });

      // 3. FASE 2: Download completo Listino Generale, Listini Vari e Listini Clienti
      onProgress({
        stage: "price-lists",
        message: "Scaricamento Listino Generale e Listini Clienti...",
        percent: 40,
      });

      await step("Listini", () => priceListSyncService.syncAllFromSupabase((p: SyncProgress) => {
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
      }));

      // 4. FASE 3: Offerte, Note, Preventivi, Ordini, Fornitori e Fatture Elettroniche
      onProgress({
        stage: "modules",
        message: "Scaricamento Offerte, Note, Preventivi, Ordini e Fatture...",
        percent: 80,
      });

      await Promise.all([
        step("Offerte", () => offersSyncService.sync()),
        step("Note", () => notesSyncService.sync()),
        step("Preventivi", () => QuoteSyncService.pullQuotes()),
        step("Fornitori", () => orderSupabaseService.fetchSuppliers(true)),
        step("Ordini", async () => {
          await orderSupabaseService.fetchOrders("attivi", true);
          await orderSupabaseService.fetchOrders("archiviati", true);
        }),
        step("Fatture", () => electronicInvoicesService.syncFromSupabase()),
      ]);

      // 5. FASE 4: Impostazioni Cloud
      onProgress({
        stage: "settings",
        message: "Sincronizzazione dati aziendali, email e configurazione backup...",
        percent: 94,
      });

      await Promise.all([
        step("Dati aziendali", () => pullCompanySettingsFromSupabase(false)),
        step("Impostazioni email", () => pullEmailSettingsFromSupabase(true)),
        step("Impostazioni backup", () => pullBackupSettingsFromSupabase(true)),
      ]);

      const error = failures.length ? `Scaricamento parziale. ${failures.join(" · ")}` : undefined;
      if (typeof localStorage !== "undefined") {
        if (error) localStorage.setItem("dashboard_setup_partial", "true");
        else localStorage.removeItem("dashboard_setup_partial");
      }
      onProgress({
        stage: error ? "error" : "completed",
        message: error ?? "Scaricamento completo da Cloud terminato.",
        percent: 100,
      });

      // Notifica tutti i moduli e la TopNavBar di aggiornare i dati e gli stati
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ddt-data-updated"));
        window.dispatchEvent(new CustomEvent("clients-data-updated"));
        window.dispatchEvent(new CustomEvent("cloud-sync-status-updated"));
      }

      return error ? { success: false, error } : { success: true };
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


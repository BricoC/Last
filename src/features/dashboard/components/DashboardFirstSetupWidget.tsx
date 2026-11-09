import React, { useState, useEffect } from "react";
import {
  Cloud,
  HardDrive,
  User,
  CheckCircle2,
  FolderOpen,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { invoke } from "@tauri-apps/api/core";
import {
  CloudFullSetupService,
  SetupStatus,
  SetupProgress,
} from "@/shared/services/cloudFullSetupService";
import { selectBackupFolder, loadBackupConfig, saveBackupConfig } from "@/features/settings/services/backupService";
import { useUserStore } from "@/shared/stores/useUserStore";

interface Props {
  onSetupCompleted?: () => void;
}

export const DashboardFirstSetupWidget: React.FC<Props> = ({ onSetupCompleted }) => {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Campi configurazione
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [backupFolder, setBackupFolder] = useState("");
  const [saveStatusMessage, setSaveStatusMessage] = useState<string | null>(null);

  // Stato importazione
  const [isRunningImport, setIsRunningImport] = useState(false);
  const [importProgress, setImportProgress] = useState<SetupProgress | null>(null);

  const { users, currentUser, requestSwitchUser } = useUserStore();

  useEffect(() => {
    void checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    const s = await CloudFullSetupService.checkStatus();
    setStatus(s);
    setSupabaseUrl(s.supabaseUrl);
    setSupabaseKey(s.supabaseKey);
    setBackupFolder(s.backupFolder);
  };

  const handleChooseFolder = async () => {
    const chosen = await selectBackupFolder(backupFolder);
    if (chosen) {
      setBackupFolder(chosen);
      const cfg = loadBackupConfig();
      cfg.folderPath = chosen;
      saveBackupConfig(cfg);
      setSaveStatusMessage("Cartella di backup salvata!");
      setTimeout(() => setSaveStatusMessage(null), 3000);
      void checkSetupStatus();
    }
  };

  const handleSaveCredentials = async () => {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      setSaveStatusMessage("Inserisci sia l'URL che la chiave Anon di Supabase.");
      return;
    }
    try {
      await invoke("save_supabase_config", {
        config: { projectUrl: supabaseUrl.trim(), anonKey: supabaseKey.trim() },
      });
      setSaveStatusMessage("Credenziali Supabase salvate con successo!");
      setTimeout(() => setSaveStatusMessage(null), 3000);
      void checkSetupStatus();
    } catch (e) {
      setSaveStatusMessage(`Errore salvataggio: ${e}`);
    }
  };

  const handleStartFullImport = async () => {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      setSaveStatusMessage("Inserisci e salva prima le credenziali Supabase.");
      return;
    }

    setIsRunningImport(true);
    setImportProgress({
      stage: "ddt",
      message: "Avvio inizializzazione Cloud...",
      percent: 5,
    });

    const res = await CloudFullSetupService.runFullCloudImport(
      supabaseUrl,
      supabaseKey,
      (prog) => setImportProgress(prog)
    );

    setIsRunningImport(false);
    if (res.success) {
      void checkSetupStatus();
      if (onSetupCompleted) onSetupCompleted();
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem("dashboard_setup_dismissed", "true");
  };

  // Se è tutto configurato e non mancano dati, oppure l'utente l'ha chiuso, non mostrare nulla
  if (!status || status.isAllConfigured || isDismissed) {
    return null;
  }

  return (
    <div className="shrink-0 rounded-xl border border-blue-500/30 bg-blue-950/25 backdrop-blur-xs p-3.5 shadow-lg text-[var(--foreground)] transition-all animate-in fade-in duration-200">
      {/* Header Banner non bloccante */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white tracking-wide">
                Configurazione Iniziale Postazione (Primo Avvio)
              </h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {status.needsData ? "Dati locali da sincronizzare" : "Setup rapido"}
              </span>
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Imposta rapidamente le credenziali e scarica lo storico da Supabase per rendere questo computer operativo al 100%.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--card)] transition-colors cursor-pointer"
            title={isCollapsed ? "Espandi configurazione" : "Comprimi"}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--card)] transition-colors cursor-pointer"
            title="Ignora avviso per ora"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contenuto espandibile */}
      {!isCollapsed && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]/60 space-y-3 text-xs">
          {saveStatusMessage && (
            <div className="p-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-[11px] text-blue-200">
              {saveStatusMessage}
            </div>
          )}

          {/* Griglia 3 sezioni rapide */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 1. Utente / Postazione */}
            <div className="p-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-1.5">
              <div className="flex items-center gap-1.5 text-zinc-300 font-semibold text-[11px]">
                <User className="w-3.5 h-3.5 text-[var(--primary)]" />
                <span>1. Postazione PC / Utente</span>
              </div>
              <select
                value={currentUser?.id || ""}
                onChange={(e) => void requestSwitchUser(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white outline-none cursor-pointer"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id} className="bg-[var(--card)]">
                    {u.name} {u.station_name ? `(${u.station_name})` : ""}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-[var(--muted-foreground)] block">
                Assegna chi utilizzerà questo computer.
              </span>
            </div>

            {/* 2. Connessione Cloud Supabase */}
            <div className="p-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-1.5">
              <div className="flex items-center justify-between text-zinc-300 font-semibold text-[11px]">
                <div className="flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-sky-400" />
                  <span>2. Cloud Supabase</span>
                </div>
                {!status.needsSupabase && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Collegato
                  </span>
                )}
              </div>
              <input
                type="text"
                placeholder="https://xyz.supabase.co"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-[11px] font-mono text-white outline-none"
              />
              <input
                type="password"
                placeholder="Chiave Anon / Pubblica..."
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-[11px] font-mono text-white outline-none"
              />
              <button
                type="button"
                onClick={handleSaveCredentials}
                className="w-full py-1 rounded bg-[var(--card)] hover:bg-[var(--background)] border border-[var(--border)] text-[10px] font-bold text-white transition-colors cursor-pointer"
              >
                Salva Connessione
              </button>
            </div>

            {/* 3. Cartella di Backup */}
            <div className="p-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-1.5">
              <div className="flex items-center justify-between text-zinc-300 font-semibold text-[11px]">
                <div className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                  <span>3. Cartella Backup</span>
                </div>
                {!status.needsBackupFolder && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Impostata
                  </span>
                )}
              </div>
              <span className="font-mono text-[10px] text-zinc-300 block truncate bg-[var(--background)] px-2 py-1 rounded border border-[var(--border)]">
                {backupFolder || "Nessuna cartella scelta"}
              </span>
              <button
                type="button"
                onClick={handleChooseFolder}
                className="w-full py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-[10px] font-bold text-amber-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FolderOpen className="w-3 h-3" />
                <span>Scegli Cartella (es. OneDrive)...</span>
              </button>
              <span className="text-[10px] text-[var(--muted-foreground)] block">
                Il backup automatico partirà solo dopo aver scelto la cartella.
              </span>
            </div>
          </div>

          {/* Sezione Azione Principale: Scarica Tutto da Supabase */}
          <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-emerald-300">
                Inizializzazione Completa da Supabase (DDT Storico + Listini)
              </h4>
              <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                Scarica in un colpo solo tutti i DDT (2023, 2024, 2025, 2026), gli 8.849 articoli del Listino Generale e i 18.558 Listini Clienti direttamente dal Cloud.
              </p>
            </div>

            <button
              type="button"
              disabled={isRunningImport || !supabaseUrl || !supabaseKey}
              onClick={handleStartFullImport}
              className={cn(
                "shrink-0 px-4 py-2 rounded-lg text-xs font-bold text-white shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer",
                isRunningImport || !supabaseUrl || !supabaseKey
                  ? "bg-emerald-800/40 opacity-60 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-500 active:scale-98"
              )}
            >
              {isRunningImport ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Download in corso...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Scarica e Inizializza Tutto da Cloud</span>
                </>
              )}
            </button>
          </div>

          {/* Barra di Avanzamento durante il download */}
          {isRunningImport && importProgress && (
            <div className="space-y-1.5 p-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-white">{importProgress.message}</span>
                <span className="font-mono text-emerald-400 font-bold">{importProgress.percent}%</span>
              </div>
              <div className="w-full bg-[var(--background)] h-2 rounded-full overflow-hidden border border-[var(--border)]">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${importProgress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

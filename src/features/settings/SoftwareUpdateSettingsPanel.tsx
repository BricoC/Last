import React from "react";
import {
  RefreshCw,
  CheckCircle2,
  DownloadCloud,
  ShieldCheck,
  Database,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { useAppUpdaterStore } from "@/shared/stores/useAppUpdaterStore";
import { cn } from "@/shared/utils/cn";

export const SoftwareUpdateSettingsPanel: React.FC = () => {
  const {
    currentVersion,
    newVersion,
    releaseDate,
    releaseNotes,
    status,
    downloadProgress,
    errorMessage,
    checkForUpdates,
    restartApp,
  } = useAppUpdaterStore();

  const isChecking = status === "checking";
  const isDownloading = status === "downloading";
  const isReady = status === "ready";

  const handleManualCheck = () => {
    void checkForUpdates(false);
  };

  return (
    <div className="space-y-6">
      {/* Box Stato Principale Versione */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[var(--border)]">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-[var(--background)] border border-[var(--border)] flex items-center justify-center p-1.5 shrink-0 shadow-xs">
              <img src="/logo.svg" alt="Last" className="w-full h-full object-contain pointer-events-none" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-[var(--foreground)]">Last</h3>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30">
                  v{currentVersion}
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                Architettura moderna Tauri v2 con aggiornamenti automatici protetti da firma digitale
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isChecking || isDownloading}
            onClick={handleManualCheck}
            className={cn(
              "flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer",
              isChecking || isDownloading
                ? "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] opacity-60 cursor-not-allowed"
                : "bg-[var(--primary)] text-white hover:opacity-90 active:scale-98"
            )}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", (isChecking || isDownloading) && "animate-spin")} />
            <span>
              {isChecking
                ? "Verifica in corso..."
                : isDownloading
                ? `Scaricamento (${downloadProgress}%)...`
                : "Verifica disponibilità aggiornamenti"}
            </span>
          </button>
        </div>

        {/* Feedback di Stato dell'aggiornamento */}
        <div className="pt-5">
          {isReady ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-emerald-400">
                    Nuova versione v{newVersion} pronta per l'installazione!
                  </h4>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    L'aggiornamento è stato scaricato e verificato con successo. Puoi riavviare ora in 3 secondi senza perdere alcuna sessione o dato.
                  </p>
                  {releaseNotes && (
                    <div className="mt-3 p-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] font-mono max-h-32 overflow-y-auto">
                      <span className="font-sans font-semibold text-[11px] text-[var(--muted-foreground)] block mb-1">
                        Note di rilascio ({releaseDate || "recente"}):
                      </span>
                      {releaseNotes}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void restartApp()}
                className="shrink-0 flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md cursor-pointer transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Riavvia e Applica Ora</span>
              </button>
            </div>
          ) : isDownloading ? (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-[var(--primary)] font-semibold">
                  <DownloadCloud className="w-4 h-4 animate-bounce" />
                  <span>Download in background della versione v{newVersion || "..."}</span>
                </div>
                <span className="font-mono text-[var(--muted-foreground)]">{downloadProgress}%</span>
              </div>
              <div className="w-full bg-[var(--background)] h-2 rounded-full overflow-hidden border border-[var(--border)]">
                <div
                  className="bg-[var(--primary)] h-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          ) : errorMessage ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-amber-400">Verifica completata con avviso</h4>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-xs text-emerald-400 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Il gestionale è aggiornato all'ultima versione disponibile. Non ci sono aggiornamenti in sospeso.</span>
            </div>
          )}
        </div>
      </div>

      {/* Griglia Schede Informative */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-2 shadow-xs">
          <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs">
            <Database className="w-4 h-4" />
            <span>Database SQLite Intatto</span>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
            L'aggiornatore sostituisce esclusivamente il codice dell'applicazione. Il tuo database locale (
            <code className="text-xs text-[var(--foreground)] font-mono">LastData.db</code>), i backup, le tabelle e i documenti restano protetti e inalterati al 100%.
          </p>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-2 shadow-xs">
          <div className="flex items-center space-x-2 text-blue-400 font-semibold text-xs">
            <ShieldCheck className="w-4 h-4" />
            <span>Firma Crittografica</span>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
            Ogni pacchetto di aggiornamento deve essere firmato crittograficamente con la tua chiave privata. Se un file venisse manomesso, l'applicazione rifiuterebbe l'installazione.
          </p>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-2 shadow-xs">
          <div className="flex items-center space-x-2 text-purple-400 font-semibold text-xs">
            <DownloadCloud className="w-4 h-4" />
            <span>Stile Windows Update</span>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
            Il download avviene in modo completamente silenzioso in background senza interrompere le attività alla cassa o in ufficio. Un popup ti avvisa quando è pronto il riavvio rapido.
          </p>
        </div>
      </div>

      {/* Box Note Tecniche */}
      <div className="bg-[var(--card)]/50 border border-[var(--border)] rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-[var(--muted-foreground)] gap-2">
        <div>
          <span className="font-semibold text-[var(--foreground)]">Canale di Rilascio Ufficiale:</span>
          <p className="font-mono text-[11px] text-[var(--muted-foreground)] mt-0.5">
            https://github.com/BricoC/Last/releases
          </p>
        </div>
        <div className="text-[11px]">
          Per i dettagli su come generare un rilascio, consulta la guida nella sezione Note.
        </div>
      </div>
    </div>
  );
};

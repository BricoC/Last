import React from "react";
import {
  RefreshCw,
  CheckCircle2,
  DownloadCloud,
  ShieldCheck,
  Database,
  RotateCcw,
  Sparkles,
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
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-[var(--primary)] shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-[var(--foreground)]">Last Gestionale Desktop</h3>
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
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Puoi continuare a utilizzare normalmente il gestionale; non ci saranno blocchi o rallentamenti.
              </p>
            </div>
          ) : status === "up-to-date" ? (
            <div className="p-3.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-center space-x-3 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Il gestionale è aggiornato all'ultima versione disponibile. Non ci sono aggiornamenti in sospeso.</span>
            </div>
          ) : status === "error" ? (
            <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start space-x-3 text-xs text-amber-400">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Nessun nuovo rilascio disponibile o rete non raggiungibile</p>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                  {errorMessage || "Verifica la connessione a Internet o attendi la pubblicazione di una nuova release."}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--muted-foreground)] flex items-center justify-between">
              <span>Controllo automatico attivo all'avvio dell'applicazione ogni volta che si avvia il programma.</span>
              <span className="font-mono text-[11px] text-[var(--foreground)]">Ultimo controllo: all'avvio</span>
            </div>
          )}
        </div>
      </div>

      {/* Riquadri Informativi e Garanzie di Sicurezza */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4.5 space-y-2">
          <div className="flex items-center space-x-2 text-emerald-400">
            <Database className="w-4 h-4" />
            <h4 className="text-xs font-bold text-[var(--foreground)]">Database SQLite Intatto</h4>
          </div>
          <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
            L'aggiornatore sostituisce esclusivamente il codice dell'applicazione. Il tuo database locale (<code className="text-[10px] text-[var(--foreground)]">LastData.db</code>), i backup, le tabelle e i documenti restano protetti e inalterati al 100%.
          </p>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4.5 space-y-2">
          <div className="flex items-center space-x-2 text-blue-400">
            <ShieldCheck className="w-4 h-4" />
            <h4 className="text-xs font-bold text-[var(--foreground)]">Firma Crittografica</h4>
          </div>
          <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
            Ogni pacchetto di aggiornamento deve essere firmato crittograficamente con la tua chiave privata. Se un file venisse manomesso, l'applicazione rifiuterebbe l'installazione.
          </p>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4.5 space-y-2">
          <div className="flex items-center space-x-2 text-purple-400">
            <DownloadCloud className="w-4 h-4" />
            <h4 className="text-xs font-bold text-[var(--foreground)]">Stile Windows Update</h4>
          </div>
          <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
            Il download avviene in modo completamente silenzioso in background senza interrompere le attività alla cassa o in ufficio. Un popup ti avvisa quando è pronto il riavvio rapido.
          </p>
        </div>
      </div>

      {/* Riferimento Repository e Documentazione */}
      <div className="p-4 rounded-xl bg-[var(--background)] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
        <div>
          <span className="font-semibold text-[var(--foreground)] block">Canale di Rilascio Ufficiale:</span>
          <span className="font-mono text-[11px]">https://github.com/BricoC/Last/releases</span>
        </div>
        <div className="flex items-center space-x-2 text-[11px]">
          <span>Per i dettagli su come generare un rilascio, consulta la guida nella sezione Note.</span>
        </div>
      </div>
    </div>
  );
};

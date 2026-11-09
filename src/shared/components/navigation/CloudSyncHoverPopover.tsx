import React from "react";
import {
  Cloud,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ArrowDownToLine,
} from "lucide-react";
import {
  CloudSyncStatusInfo,
  formatSyncTimestamp,
  formatRelativeTime,
} from "@/shared/services/cloudSyncStatusService";
import { cn } from "@/shared/utils/cn";

interface CloudSyncHoverPopoverProps {
  status: CloudSyncStatusInfo | null;
  isLoading: boolean;
  isSyncing: boolean;
  onRefreshStatus: () => void;
  onExecuteSync: () => void;
}

export const CloudSyncHoverPopover: React.FC<CloudSyncHoverPopoverProps> = ({
  status,
  isLoading,
  isSyncing,
  onRefreshStatus,
  onExecuteSync,
}) => {
  if (!status) {
    return (
      <div className="absolute right-0 top-9 z-50 w-96 p-4 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl rounded-xl text-slate-100 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          <span>Verifica stato Cloud Supabase in corso…</span>
        </div>
      </div>
    );
  }

  const {
    localLastSyncDate,
    localLastSyncSummary,
    localLatestDdt,
    remoteLatestDate,
    remoteLatestSummary,
    remoteLatestDdt,
    hasPendingRemoteChanges,
    alignmentMessage,
    error,
  } = status;

  return (
    <div
      className="absolute right-0 top-9 z-50 w-[420px] p-4 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl rounded-xl text-slate-100 text-xs animate-in fade-in zoom-in-95 duration-150 select-none cursor-default"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Intestazione Popover */}
      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2 font-bold text-slate-200">
          <Cloud className="w-4 h-4 text-emerald-400" />
          <span className="text-sm">Stato Sincronizzazione Supabase</span>
        </div>
        <button
          type="button"
          onClick={onRefreshStatus}
          disabled={isLoading || isSyncing}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
          title="Ricarica orari e stato attuale da Supabase"
        >
          <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin text-emerald-400")} />
          <span>Verifica</span>
        </button>
      </div>

      {/* Banner Allineamento / Verdetto Rapido */}
      <div
        className={cn(
          "mb-3.5 p-2.5 rounded-lg border flex items-start gap-2.5 transition-all",
          hasPendingRemoteChanges
            ? "bg-amber-500/15 border-amber-500/40 text-amber-200"
            : "bg-emerald-500/15 border-emerald-500/35 text-emerald-200"
        )}
      >
        {hasPendingRemoteChanges ? (
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <div className="font-bold text-[12px] flex items-center justify-between">
            <span>
              {hasPendingRemoteChanges
                ? "⚡ Nuovi dati presenti sul Cloud!"
                : "✅ Programma perfettamente allineato"}
            </span>
          </div>
          <p className="text-[11px] mt-0.5 opacity-90 leading-relaxed">{alignmentMessage}</p>
        </div>
      </div>

      {/* Dettagli a Due Colonne / Schede */}
      <div className="space-y-2.5 mb-4">
        {/* Scheda 1: Scaricamento nel Programma (Locale) */}
        <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5 text-sky-400" />
              Ultimo Scaricamento nel Programma (Locale)
            </span>
            {localLastSyncDate && (
              <span className="text-[10px] text-slate-400 font-mono">
                {formatRelativeTime(localLastSyncDate)}
              </span>
            )}
          </div>
          <div className="text-[12px] font-medium text-slate-100">
            {formatSyncTimestamp(localLastSyncDate)}
          </div>
          {localLatestDdt && (
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <span>Archivio DDT locale:</span>
              <span className="font-semibold text-slate-300">
                DDT n. {localLatestDdt.number} ({localLatestDdt.year})
              </span>
              {localLatestDdt.client && (
                <span className="truncate max-w-[150px] text-slate-400">
                  — {localLatestDdt.client}
                </span>
              )}
            </div>
          )}
          {localLastSyncSummary && (
            <div className="text-[10px] text-slate-400 italic mt-0.5 truncate">
              Esito: {localLastSyncSummary}
            </div>
          )}
        </div>

        {/* Scheda 2: Ultima Modifica sul Cloud Supabase (Remoto) */}
        <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-emerald-400" />
              Ultima Attività su Supabase (Cloud)
            </span>
            {remoteLatestDate && (
              <span className="text-[10px] text-emerald-400 font-mono">
                {formatRelativeTime(remoteLatestDate)}
              </span>
            )}
          </div>
          <div className="text-[12px] font-medium text-slate-100">
            {formatSyncTimestamp(remoteLatestDate)}
          </div>
          {remoteLatestDdt && (
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <span>Ultimo DDT su Supabase:</span>
              <span className="font-semibold text-emerald-300">
                DDT n. {remoteLatestDdt.number} ({remoteLatestDdt.year})
              </span>
              {remoteLatestDdt.client && (
                <span className="truncate max-w-[150px] text-slate-400">
                  — {remoteLatestDdt.client}
                </span>
              )}
            </div>
          )}
          {remoteLatestSummary && (
            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
              Attività: {remoteLatestSummary}
            </div>
          )}
        </div>
      </div>

      {/* Errore eventuale */}
      {error && (
        <div className="mb-3 text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/30 p-2 rounded">
          {error}
        </div>
      )}

      {/* Pulsante Azione Sincronizza nel Footer del Popover */}
      <button
        type="button"
        onClick={onExecuteSync}
        disabled={isSyncing}
        className={cn(
          "w-full py-2 px-3 rounded-lg flex items-center justify-center gap-2 font-semibold text-xs transition-all shadow-md cursor-pointer",
          hasPendingRemoteChanges
            ? "bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold animate-pulse"
            : "bg-emerald-600 hover:bg-emerald-500 text-white"
        )}
      >
        {isSyncing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Sincronizzazione Cloud in corso…</span>
          </>
        ) : (
          <>
            <ArrowDownToLine className="w-4 h-4" />
            <span>
              {hasPendingRemoteChanges
                ? "Scarica Aggiornamenti Cloud Ora"
                : "Sincronizza e Verifica Tutto (Cloud)"}
            </span>
          </>
        )}
      </button>
    </div>
  );
};

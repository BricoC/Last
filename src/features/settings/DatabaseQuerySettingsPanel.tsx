import React from "react";
import { Database, Check, Zap, Layers } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { useAppSettingsStore, HISTORY_LIMIT_OPTIONS, HistoryModalLimit } from "@/shared/stores/useAppSettingsStore";

export const DatabaseQuerySettingsPanel: React.FC = () => {
  const { historyModalLimit, setHistoryModalLimit } = useAppSettingsStore();

  return (
    <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4 text-[var(--foreground)]">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-[var(--primary)] mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold">Limite Record Storico Articoli (Query SQL)</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Scegli quanti movimenti caricare dal database locale SQLite quando apri il popup dello storico vendite di un articolo nei DDT.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-[var(--background)] border border-[var(--border)] px-3 py-1 text-xs font-mono font-medium text-[var(--primary)]">
          <Zap className="w-3.5 h-3.5" />
          <span>Attivo: {historyModalLimit === "tutti" ? "TUTTI I RECORD" : `${historyModalLimit.toLocaleString("it-IT")} DDT`}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5 pt-1">
        {HISTORY_LIMIT_OPTIONS.map((opt) => {
          const isSelected = historyModalLimit === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setHistoryModalLimit(opt.value as HistoryModalLimit)}
              className={cn(
                "p-3 rounded-lg border text-left transition-all flex flex-col justify-between cursor-pointer",
                isSelected
                  ? "bg-[var(--background)] border-[var(--primary)] ring-2 ring-[var(--primary)]/30 shadow-md font-semibold"
                  : "bg-[var(--background)]/60 border-[var(--border)] hover:border-[var(--primary)]/60 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn("text-xs font-bold", isSelected ? "text-[var(--primary)]" : "text-[var(--foreground)]")}>
                  {opt.label}
                </span>
                {isSelected && <Check className="w-3.5 h-3.5 text-[var(--primary)]" />}
              </div>
              <p className="text-[10px] leading-tight opacity-75">{opt.desc}</p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-[var(--background)]/50 border border-[var(--border)]/60 px-3.5 py-2.5 text-xs text-[var(--muted-foreground)]">
        <Layers className="w-4 h-4 text-[var(--primary)] shrink-0" />
        <span>
          <strong>Nota sulle prestazioni:</strong> Il valore predefinito è <strong>1.000</strong> record ordinati per data decrescente.
          Impostare &quot;Tutti&quot; visualizza l&apos;intero archivio storico dell&apos;articolo senza alcun limite SQL.
        </span>
      </div>
    </section>
  );
};

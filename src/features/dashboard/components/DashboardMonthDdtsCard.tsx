import React from "react";
import { Clock, Copy, MapPin, Search, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { DashboardRecentDdt } from "../services/dashboardService";
import {
  formatDashboardEur,
  MONTH_NAMES,
  MONTH_NAMES_FULL,
} from "../utils/dashboardViewUtils";

export interface DashboardMonthDdtsCardProps {
  currentYearNum: number;
  selectedMonthForDdts: number;
  onSelectMonthForDdts: (month: number) => void;
  monthDdtsCount: number;
  filteredMonthDdts: DashboardRecentDdt[];
  monthDdtSearch: string;
  onChangeMonthDdtSearch: (value: string) => void;
  onMonthDdtKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  isCopyingBatch: boolean;
  batchProgress: { current: number; total: number; label: string } | null;
  onCopyFilteredPdfs: () => void;
  selectedQuickDdtId: string | null;
  onSelectQuickDdtId: (id: string) => void;
  onOpenMonthListModal?: () => void;
}

export const DashboardMonthDdtsCard: React.FC<DashboardMonthDdtsCardProps> = ({
  currentYearNum,
  selectedMonthForDdts,
  onSelectMonthForDdts,
  monthDdtsCount,
  filteredMonthDdts,
  monthDdtSearch,
  onChangeMonthDdtSearch,
  onMonthDdtKeyDown,
  isCopyingBatch,
  batchProgress,
  onCopyFilteredPdfs,
  selectedQuickDdtId,
  onSelectQuickDdtId,
  onOpenMonthListModal,
}) => {
  return (
    <div className="col-span-5 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 overflow-hidden shadow-xs">
      {/* Header Quadrante 4 con selettore mese e ricerca */}
      <div className="flex items-center justify-between shrink-0 mb-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <button
            type="button"
            onClick={onOpenMonthListModal}
            className="text-xs font-bold text-[var(--foreground)] hover:text-[var(--primary)] uppercase tracking-wider shrink-0 transition-colors cursor-pointer"
            title="Apri elenco completo DDT del mese"
          >
            DDT del Mese
          </button>
          <select
            value={selectedMonthForDdts}
            onChange={(e) => onSelectMonthForDdts(Number(e.target.value))}
            className="bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-[10px] font-bold rounded px-1.5 py-0.5 outline-none cursor-pointer shrink-0"
          >
            {MONTH_NAMES.map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m} {currentYearNum}
              </option>
            ))}
          </select>

          {/* Textbox di ricerca rapida multi-parola per numero DDT, cliente e destinazione */}
          <div className="relative flex items-center min-w-[120px] max-w-[210px] flex-1">
            <Search className="w-3 h-3 text-[var(--muted-foreground)] absolute left-2 pointer-events-none" />
            <input
              type="text"
              value={monthDdtSearch}
              onChange={(e) => onChangeMonthDdtSearch(e.target.value)}
              onKeyDown={onMonthDdtKeyDown}
              placeholder="Cerca N°, cliente o destinazione..."
              className="w-full bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-[10px] rounded pl-6 pr-5 py-0.5 outline-none focus:border-[var(--primary)] transition-colors placeholder:text-[var(--muted-foreground)]/60"
            />
            {monthDdtSearch && (
              <button
                type="button"
                onClick={() => onChangeMonthDdtSearch("")}
                className="absolute right-1 text-[var(--muted-foreground)] hover:text-white p-0.5 rounded cursor-pointer"
                title="Cancella ricerca"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {/* Pulsante Copia PDF Filtrate per incollare in email */}
          <button
            type="button"
            onClick={onCopyFilteredPdfs}
            disabled={isCopyingBatch || filteredMonthDdts.length === 0}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold border transition-all shrink-0 cursor-pointer shadow-xs",
              isCopyingBatch
                ? "border-sky-500/60 bg-sky-500/20 text-sky-300"
                : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:border-sky-500 hover:text-sky-300 hover:bg-sky-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
            )}
            title={
              filteredMonthDdts.length > 0
                ? `Genera e copia negli appunti i PDF di tutti i ${filteredMonthDdts.length} DDT filtrati per incollarli in un'email (Ctrl+V)`
                : "Nessun DDT da copiare"
            }
          >
            {isCopyingBatch ? (
              <>
                <span className="w-2.5 h-2.5 animate-spin rounded-full border border-sky-400 border-t-transparent" />
                <span>
                  {batchProgress ? `${batchProgress.current}/${batchProgress.total}` : "Copia…"}
                </span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-sky-400" />
                <span>Copia PDF ({filteredMonthDdts.length})</span>
              </>
            )}
          </button>
        </div>

        <span className="text-[10px] text-[var(--muted-foreground)] shrink-0 font-medium">
          {monthDdtSearch.trim()
            ? `${filteredMonthDdts.length} / ${monthDdtsCount} DDT`
            : `${monthDdtsCount} DDT`}
        </span>
      </div>

      {/* Lista DDT del mese selezionato (Cliccabile: apre DDTQuickViewModal!) con scrollbar visibile */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1.5 scrollbar-thin">
        {filteredMonthDdts && filteredMonthDdts.length > 0 ? (
          filteredMonthDdts.map((doc) => {
            const label = `${doc.series ? `${doc.series}/` : ""}${doc.docNumber ?? "BOZ"}`;
            const isSelected = selectedQuickDdtId === doc.id;
            return (
              <div
                key={doc.id}
                onClick={() => onSelectQuickDdtId(doc.id)}
                role="button"
                tabIndex={0}
                className={cn(
                  "flex items-center justify-between p-1.5 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/50 hover:bg-[var(--background)] hover:border-[var(--primary)] transition-all cursor-pointer group",
                  isSelected && "ring-1 ring-[var(--primary)] border-[var(--primary)] bg-[var(--background)]"
                )}
                title={`Clicca per visualizzare l'anteprima del DDT ${label}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                  <span className="font-mono text-[11px] font-extrabold text-[var(--primary)] shrink-0">
                    N° {label}
                  </span>
                  <span
                    className="text-xs font-semibold truncate text-[var(--foreground)] group-hover:text-white avorio-ink shrink-0 max-w-[190px]"
                    title={doc.clientName}
                  >
                    {doc.clientName}
                  </span>
                  {doc.destination && (
                    <span
                      className="text-[10px] text-[var(--muted-foreground)] truncate max-w-[210px] flex items-center gap-1 group-hover:text-slate-300 font-sans"
                      title={`Destinazione: ${doc.destination}`}
                    >
                      <MapPin className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                      <span className="truncate">{doc.destination}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-[var(--muted-foreground)]">
                    {doc.docDate}
                  </span>
                  <span className="font-mono text-xs font-bold text-white avorio-ink">
                    {formatDashboardEur(doc.totalDocument)}
                  </span>
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      doc.pricingStatus === "complete_with_margins"
                        ? "bg-emerald-400"
                        : doc.pricingStatus === "priced_no_margins"
                        ? "bg-amber-400"
                        : "bg-rose-500"
                    )}
                    title={
                      doc.pricingStatus === "complete_with_margins"
                        ? "Prezzato interamente con margini e IVA"
                        : doc.pricingStatus === "priced_no_margins"
                        ? "Da completare (mancano margini o IVA)"
                        : "Né prezzi né margini (non prezzato interamente)"
                    }
                  />
                </div>
              </div>
            );
          })
        ) : monthDdtSearch.trim() ? (
          <div className="h-full flex flex-col items-center justify-center text-xs text-[var(--muted-foreground)] p-4 text-center">
            <span>Nessun DDT trovato per &quot;{monthDdtSearch}&quot;.</span>
            <button
              type="button"
              onClick={() => onChangeMonthDdtSearch("")}
              className="text-[11px] text-[var(--primary)] underline mt-1.5 cursor-pointer hover:text-white"
            >
              Azzera filtro di ricerca
            </button>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-xs text-[var(--muted-foreground)] p-4 text-center">
            <span>
              Nessun DDT emesso nel mese di {MONTH_NAMES_FULL[selectedMonthForDdts - 1]}.
            </span>
            <span className="text-[10px] mt-1 opacity-75">
              Seleziona un altro mese dal menù a tendina.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

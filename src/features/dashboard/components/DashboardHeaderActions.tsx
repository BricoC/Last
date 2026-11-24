import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Calendar,
  Check,
  ChevronDown,
  Landmark,
  Package,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { type RibaDeadlineInfo } from "../services/ribaService";
import { DEFAULT_DASHBOARD_YEARS, YEAR_COLORS } from "../utils/dashboardViewUtils";

export interface DashboardHeaderActionsProps {
  currentYearNum: number;
  availableYears?: number[];
  selectedYears: number[];
  onToggleYear: (year: number) => void;
  onSelectYears: (years: number[]) => void;
  ribaInfo: RibaDeadlineInfo | null;
  onOpenRibaModal: () => void;
  onOpenArticleHistory: () => void;
  loading: boolean;
  onReload: () => void;
}

export const DashboardHeaderActions: React.FC<DashboardHeaderActionsProps> = ({
  currentYearNum,
  availableYears,
  selectedYears,
  onToggleYear,
  onSelectYears,
  ribaInfo,
  onOpenRibaModal,
  onOpenArticleHistory,
  loading,
  onReload,
}) => {
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
  const yearDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target as Node)) {
        setIsYearDropdownOpen(false);
      }
    };
    if (isYearDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isYearDropdownOpen]);

  const yearsList = availableYears || DEFAULT_DASHBOARD_YEARS;

  return (
    <div className="ml-auto flex flex-wrap items-center gap-2 max-w-full">
      {/* Pulsante Ri.Ba. Banca */}
      {ribaInfo && (
        <button
          type="button"
          onClick={onOpenRibaModal}
          className={cn(
            "flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs select-none border group",
            ribaInfo.isPaid
              ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:border-emerald-500/50"
              : ribaInfo.daysToDeadline <= 5
              ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/40 ring-1 ring-rose-500/30 animate-pulse hover:brightness-110"
              : ribaInfo.daysToDeadline <= 10
              ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50"
              : "bg-[var(--card)] hover:bg-[var(--border)]/40 text-slate-300 border-[var(--border)]"
          )}
          title={`Scadenza Ri.Ba: ${ribaInfo.deadlineStr} - ${
            ribaInfo.isPaid ? "PAGATA" : "NON PAGATA"
          }. Clicca per visualizzare o preparare l'email.`}
        >
          <div className="relative flex items-center justify-center">
            <Landmark
              className={cn(
                "w-3.5 h-3.5 transition-colors",
                ribaInfo.isPaid
                  ? "text-emerald-400"
                  : ribaInfo.daysToDeadline <= 5
                  ? "text-rose-400"
                  : ribaInfo.daysToDeadline <= 10
                  ? "text-amber-400"
                  : "text-sky-400"
              )}
            />
            {!ribaInfo.isPaid && ribaInfo.daysToDeadline <= 5 && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            )}
          </div>

          <span>
            Ri.Ba: <span className="font-mono font-bold">{ribaInfo.deadlineStr}</span>
          </span>

          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
              ribaInfo.isPaid
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : ribaInfo.daysToDeadline <= 5
                ? "bg-rose-600 text-white shadow-xs font-black"
                : ribaInfo.daysToDeadline <= 10
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-sky-500/15 text-sky-300 border border-sky-500/30"
            )}
          >
            {ribaInfo.isPaid ? "PAGATA" : "NON PAGATA"}
          </span>

          {!ribaInfo.isPaid && ribaInfo.daysToDeadline <= 5 && (
            <span className="text-[10px] bg-black/40 text-rose-200 px-1 py-0.5 rounded font-extrabold">
              {ribaInfo.daysToDeadline === 0 ? "OGGI" : `-${ribaInfo.daysToDeadline}g`}
            </span>
          )}
        </button>
      )}

      {/* Pulsante Storico Articoli (apre direttamente il popup a schermo intero) */}
      <button
        type="button"
        onClick={onOpenArticleHistory}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--card)] hover:bg-[var(--primary)] text-slate-200 avorio-ink hover:text-white border border-[var(--border)] hover:border-[var(--primary)] text-xs font-bold transition-all cursor-pointer shadow-xs group"
        title="Apri lo Storico e Resoconto Articoli a tutto schermo"
      >
        <Package className="w-3.5 h-3.5 text-sky-400 group-hover:text-white transition-colors" />
        <span>Storico Articoli</span>
        <ArrowUpRight className="w-3 h-3 text-[var(--muted-foreground)] group-hover:text-white transition-colors" />
      </button>

      {/* Menù a Tendina Multi-selezione Anni Grafico */}
      <div className="relative" ref={yearDropdownRef}>
        <button
          type="button"
          onClick={() => setIsYearDropdownOpen((prev) => !prev)}
          className="flex items-center gap-1.5 bg-[var(--card)] hover:bg-[var(--border)]/40 px-2.5 py-1 rounded-lg border border-[var(--border)] shadow-xs text-xs font-bold text-[var(--foreground)] transition-colors cursor-pointer select-none"
          title="Seleziona gli anni da visualizzare nel grafico"
        >
          <Calendar className="w-3.5 h-3.5 text-[var(--primary)]" />
          <span>
            {selectedYears.length === (availableYears?.length || 4)
              ? `Tutti gli anni (${selectedYears.length})`
              : `Anni (${selectedYears.length}): ${[...selectedYears].sort((a, b) => b - a).join(", ")}`}
          </span>
          <ChevronDown
            className={cn(
              "w-3 h-3 text-[var(--muted-foreground)] transition-transform duration-200",
              isYearDropdownOpen && "rotate-180"
            )}
          />
        </button>

        {isYearDropdownOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-60 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[var(--border)]/70 px-1 text-[10px]">
              <span className="font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
                Anni Grafico
              </span>
              <button
                type="button"
                onClick={() => onSelectYears(yearsList)}
                className="text-[var(--primary)] hover:underline font-semibold cursor-pointer"
              >
                Seleziona tutti
              </button>
            </div>

            <div className="space-y-1">
              {yearsList.map((yr) => {
                const isSelected = selectedYears.includes(yr);
                const color = YEAR_COLORS[yr]?.bg || "bg-zinc-400";
                return (
                  <label
                    key={yr}
                    className={cn(
                      "flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-colors",
                      isSelected
                        ? "bg-[var(--background)] text-white font-bold"
                        : "hover:bg-[var(--background)]/60 text-[var(--muted-foreground)]"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleYear(yr)}
                        className="rounded border-[var(--border)] bg-[var(--background)] text-[var(--primary)] focus:ring-0 cursor-pointer"
                      />
                      <span className={cn("w-2 h-2 rounded-full shrink-0", color)} />
                      <span>
                        Anno {yr}
                        {yr === currentYearNum && (
                          <span className="text-[9px] font-normal text-emerald-400 ml-1">
                            (in corso)
                          </span>
                        )}
                      </span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[var(--primary)]" />}
                  </label>
                );
              })}
            </div>

            <div className="pt-1.5 mt-1.5 border-t border-[var(--border)]/50 px-1 text-[9px] text-[var(--muted-foreground)] flex items-center justify-between">
              <span>
                Attivi: {selectedYears.length} di {yearsList.length}
              </span>
              <button
                type="button"
                onClick={() => onSelectYears([currentYearNum])}
                className="hover:text-white underline cursor-pointer"
              >
                Solo {currentYearNum}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ricarica */}
      <button
        type="button"
        onClick={onReload}
        disabled={loading}
        className="p-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)] transition-all cursor-pointer disabled:opacity-50"
        title="Ricarica dati"
      >
        <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-[var(--primary)]")} />
      </button>
    </div>
  );
};

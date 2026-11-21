import type { Dispatch, SetStateAction } from "react";
import { Calendar, LoaderCircle, Mail, RefreshCw, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/cn";
import type { DdtListViewRow } from "../services/ddtReadModelsRepository";
import { DDT_MONTH_OPTIONS, formatDdtMoney, formatDdtPercent } from "../services/ddtViewFormatting";

type Props = {
  rows: DdtListViewRow[]; filtered: DdtListViewRow[]; previousYears: number[]; yearCounts: Record<number, number>; currentYear: number;
  filterYear2026: boolean; setFilterYear2026: Dispatch<SetStateAction<boolean>>; selectedMonth: number | null;
  setSelectedMonth: Dispatch<SetStateAction<number | null>>; totals: { taxable: number; purchase: number; revenue: number };
  markupPercent: number | null; selectedIds: Set<string>; setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setIsEmailModalOpen: Dispatch<SetStateAction<boolean>>; load: () => Promise<void>; loading: boolean;
};

export function DdtListToolbar(props: Props) {
 const { rows, filtered, previousYears, yearCounts, currentYear, filterYear2026, setFilterYear2026, selectedMonth, setSelectedMonth, totals, markupPercent, selectedIds, setSelectedIds, setIsEmailModalOpen, load, loading } = props;
 return (
   <>
      {/* Strip Barra Strumenti & Statistiche (Stile Dashboard) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs shadow-sm shrink-0 select-none">
        {/* Gruppo Sinistra: Badges Contatori, Filtri Rapidi & Finanziari */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. DDT Emesse Totale con Popup Hover Ultimi 3 Anni */}
          <div className="group relative flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--background)] border border-[var(--border)] hover:border-blue-500/50 transition-colors cursor-help">
            <span className="text-[10.5px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
              DDT emesse:
            </span>
            <span className="font-mono font-bold text-blue-400 text-xs">
              {rows.length.toLocaleString("it-IT")}
            </span>

            {/* Popup Hover Ultimi 3 Anni */}
            <div className="absolute top-full left-0 mt-1.5 z-50 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-150 p-3 bg-[#15171e] border border-[#2d313d] rounded-lg shadow-2xl text-xs min-w-[210px] pointer-events-none">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#2d313d]">
                <span className="font-bold text-[var(--foreground)] uppercase text-[10px] tracking-wider">
                  DDT Ultimi 3 Anni
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)] font-mono">Storico</span>
              </div>
              <div className="space-y-1.5">
                {previousYears.map((y) => (
                  <div key={y} className="flex items-center justify-between py-0.5">
                    <span className="text-[var(--muted-foreground)] font-mono">Anno {y}:</span>
                    <span className="font-mono font-bold text-blue-400">
                      {(yearCounts[y] || 0).toLocaleString("it-IT")}
                    </span>
                  </div>
                ))}
                <div className="pt-1.5 mt-1 border-t border-[#2d313d]/60 flex items-center justify-between">
                  <span className="text-[var(--muted-foreground)] font-mono text-[11px]">{currentYear} (in corso):</span>
                  <span className="font-mono font-bold text-emerald-400 text-[11px]">
                    {(yearCounts[currentYear] || 0).toLocaleString("it-IT")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. DDT Visibili */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--background)] border border-[var(--border)]">
            <span className="text-[10.5px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
              DDT visibili:
            </span>
            <span className={cn("font-mono font-bold text-xs", filtered.length !== rows.length ? "text-amber-400" : "text-emerald-400")}>
              {filtered.length.toLocaleString("it-IT")}
            </span>
          </div>

          <div className="h-4 w-px bg-[var(--border)] hidden sm:block" />

          {/* 3. Pulsante Anno in Corso (2026) */}
          <button
            type="button"
            onClick={() => setFilterYear2026((prev) => !prev)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer",
              filterYear2026
                ? "bg-blue-600 hover:bg-blue-500 text-white border border-blue-400 shadow-sm shadow-blue-500/20"
                : "bg-[var(--background)] hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
            )}
            title={filterYear2026 ? `Filtro ${currentYear} attivo (clicca per mostrare tutti gli anni)` : `Filtra solo DDT dell'anno ${currentYear}`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{currentYear}</span>
          </button>

          {/* 4. Menù a tendina Mesi */}
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border transition-colors",
            selectedMonth !== null
              ? "bg-blue-500/10 border-blue-500/40 text-blue-300"
              : "bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)]"
          )}>
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Mese:</span>
            <select
              value={selectedMonth ?? "all"}
              onChange={(e) => setSelectedMonth(e.target.value === "all" ? null : parseInt(e.target.value, 10))}
              className="bg-transparent text-xs text-[var(--foreground)] outline-none font-semibold cursor-pointer py-0.5 pr-1"
            >
              <option value="all" className="bg-[#181a20] text-white">Tutti i mesi</option>
              {DDT_MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value} className="bg-[#181a20] text-white">
                  {m.label}
                </option>
              ))}
            </select>
            {selectedMonth !== null && (
              <button
                type="button"
                onClick={() => setSelectedMonth(null)}
                className="text-[var(--muted-foreground)] hover:text-white ml-0.5 cursor-pointer p-0.5"
                title="Azzera filtro mese"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="h-4 w-px bg-[var(--border)] hidden md:block" />

          {/* 5. Totali Finanziari DDT List */}
          <div className="flex flex-wrap items-center gap-2.5 px-2.5 py-1 rounded-md bg-[var(--background)] border border-[var(--border)]">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Tot. Imponibile:</span>
              <span className="font-mono font-bold text-white text-xs">{formatDdtMoney(totals.taxable)}</span>
            </div>
            <div className="h-3 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Acquisto:</span>
              <span className="font-mono font-semibold text-zinc-300 text-xs">{formatDdtMoney(totals.purchase)}</span>
            </div>
            <div className="h-3 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Ricavo:</span>
              <span className="font-mono font-bold text-emerald-400 text-xs">{formatDdtMoney(totals.revenue)}</span>
            </div>
            <div className="h-3 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Ricavo %:</span>
              <span className="font-mono font-bold text-blue-400 text-xs">{formatDdtPercent(markupPercent)}</span>
            </div>
          </div>
        </div>

        {/* Gruppo Destra: Azioni Selezione & Refresh */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-bold text-[11px] border border-blue-500/30">
                {selectedIds.size} selezionat{selectedIds.size === 1 ? "o" : "i"}
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline cursor-pointer"
              >
                Deseleziona
              </button>
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(true)}
                className="h-6 px-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                title="Allega ad email i DDT selezionati e apri Outlook"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Allega ad email ({selectedIds.size})</span>
              </button>
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 px-2.5 cursor-pointer bg-[var(--background)] hover:bg-[var(--accent)] border border-[var(--border)]"
            onClick={() => void load()}
            disabled={loading}
            title="Ricarica elenco DDT"
          >
            {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

   </>
 );
}

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  dashboardService,
  MonthlyPerformanceReport,
} from "../services/dashboardService";
import { MonthDailyModal } from "./MonthDailyModal";
import {
  BarChart3,
  Calendar,
  X,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Percent,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { useEscClose } from "@/shared/hooks/useEscClose";

export interface MonthlyPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialYear?: number;
  availableYears?: number[];
}

function formatEur(amount: number): string {
  return `€ ${Math.round(amount).toLocaleString("it-IT")}`;
}

export const MonthlyPerformanceModal: React.FC<MonthlyPerformanceModalProps> = ({
  isOpen,
  onClose,
  initialYear,
  availableYears = [2026, 2025, 2024, 2023],
}) => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedYear, setSelectedYear] = useState<number>(initialYear || currentYear);
  const [report, setReport] = useState<MonthlyPerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);

  // Popup Dettaglio Giornaliero del Mese
  const [selectedMonthForDaily, setSelectedMonthForDaily] = useState<number | null>(null);

  // Chiusura in cascata con tasto Escape (LIFO stack)
  useEscClose(isOpen, onClose);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardService.getMonthlyPerformanceReport(selectedYear);
      setReport(res);
    } catch (err) {
      console.error("Errore caricamento report mensile:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    if (isOpen) {
      void loadReport();
    }
  }, [isOpen, loadReport]);

  const prevYearTotalTurnover = useMemo(() => {
    if (!report) return 0;
    return report.months.reduce((acc, m) => acc + m.prevYearTurnover, 0);
  }, [report]);

  const totalDeltaPct = useMemo(() => {
    if (!report || prevYearTotalTurnover === 0) return null;
    return ((report.totalTurnover - prevYearTotalTurnover) / prevYearTotalTurnover) * 100;
  }, [report, prevYearTotalTurnover]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs select-none font-sans"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-6xl h-[92vh] rounded-2xl border border-[var(--border)] bg-[var(--card)] flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold tracking-tight text-white uppercase">
                  Rendimento Mensile Anno {selectedYear}
                </h2>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Analisi economica dettagliata per mese: vendite, costi d&apos;acquisto, utile lordo, margini e trend comparativi. Clicca su un mese per il dettaglio giornaliero.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Selettore Anno */}
            <div className="flex items-center gap-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-xs shadow-xs">
              <Calendar className="w-3.5 h-3.5 text-[var(--primary)]" />
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr} className="bg-slate-900 text-white">
                    Anno {yr}
                  </option>
                ))}
              </select>
            </div>

            {/* Tasto Chiudi ESC */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--border)] transition-colors cursor-pointer"
              title="Chiudi (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barra KPI Globale Superiore */}
        {report && (
          <div className="grid grid-cols-6 gap-2 px-5 py-2.5 bg-[var(--background)]/50 border-b border-[var(--border)] shrink-0">
            {/* 1. Totale Vendite */}
            <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-2">
              <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] font-bold uppercase">
                <span>Totale Vendite</span>
                <DollarSign className="w-3 h-3 text-[var(--primary)]" />
              </div>
              <div className="text-sm font-extrabold text-white mt-0.5">
                {formatEur(report.totalTurnover)}
              </div>
            </div>

            {/* 2. Costi Acquisto */}
            <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-2">
              <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] font-bold uppercase">
                <span>Costi Acquisto</span>
                <ShoppingCart className="w-3 h-3 text-red-400" />
              </div>
              <div className="text-sm font-extrabold text-red-400 mt-0.5">
                {formatEur(report.totalCost)}
              </div>
            </div>

            {/* 3. Utile Lordo */}
            <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-2">
              <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] font-bold uppercase">
                <span>Utile Lordo</span>
                <TrendingUp className="w-3 h-3 text-emerald-400" />
              </div>
              <div className="text-sm font-extrabold text-emerald-400 mt-0.5">
                {formatEur(report.totalMargin)}
              </div>
            </div>

            {/* 4. Margine Medio % */}
            <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-2">
              <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] font-bold uppercase">
                <span>Margine Lordo %</span>
                <Percent className="w-3 h-3 text-sky-400" />
              </div>
              <div className="text-sm font-extrabold text-sky-400 mt-0.5">
                {report.averageMarginPercent.toFixed(1)}%
              </div>
            </div>

            {/* 5. Media Vendite / Mese */}
            <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-2">
              <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] font-bold uppercase">
                <span>Media Mese</span>
                <BarChart3 className="w-3 h-3 text-purple-400" />
              </div>
              <div className="text-sm font-extrabold text-white mt-0.5">
                {formatEur(report.averageMonthlyTurnover)}
              </div>
            </div>

            {/* 6. DDT Emessi */}
            <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-2">
              <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] font-bold uppercase">
                <span>DDT Emessi</span>
                <Layers className="w-3 h-3 text-amber-400" />
              </div>
              <div className="text-sm font-extrabold text-white mt-0.5">
                {report.totalDdtCount.toLocaleString("it-IT")} DDT
              </div>
            </div>
          </div>
        )}

        {/* Tabella Rendimento Mensile a 12 Mesi */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]">
              Caricamento rendiconto economico...
            </div>
          ) : report ? (
            <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--background)]/40 shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[var(--card)] text-[10px] uppercase font-bold text-[var(--muted-foreground)] border-b border-[var(--border)] sticky top-0 z-10 select-none">
                  <tr>
                    <th className="py-2.5 px-3">Mese</th>
                    <th className="py-2.5 px-3 text-right">Fatturato / Vendite</th>
                    <th className="py-2.5 px-3 text-center">vs {selectedYear - 1}</th>
                    <th className="py-2.5 px-3 text-right">Costi Acquisto</th>
                    <th className="py-2.5 px-3 text-right">Utile Lordo</th>
                    <th className="py-2.5 px-3 text-right">Margine %</th>
                    <th className="py-2.5 px-3 text-right">Ricarico %</th>
                    <th className="py-2.5 px-3 text-right">DDT Emessi</th>
                    <th className="py-2.5 px-3 text-right">Ticket Medio</th>
                    <th className="py-2.5 px-3 text-center">Dettaglio Giornaliero</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/40 font-mono text-xs">
                  {report.months.map((m) => {
                    const isCurrent =
                      selectedYear === currentYear && m.month === currentMonth;
                    return (
                      <tr
                        key={m.month}
                        onClick={() => setSelectedMonthForDaily(m.month)}
                        className={cn(
                          "transition-colors cursor-pointer group",
                          isCurrent
                            ? "bg-[var(--primary)]/10 hover:bg-[var(--primary)]/15"
                            : "hover:bg-[var(--card)]/90"
                        )}
                        title={`Clicca sulla cella del mese per aprire l'analisi giornaliera di ${m.monthName}`}
                      >
                        {/* Cella Mese */}
                        <td className="py-2.5 px-3 font-sans">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-[var(--foreground)] group-hover:text-[var(--primary)] text-xs flex items-center gap-1.5 transition-colors">
                              {m.monthName}
                              <span className="text-[10px] font-mono font-normal text-[var(--muted-foreground)]">
                                ({String(m.month).padStart(2, "0")}/{selectedYear})
                              </span>
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] font-bold uppercase tracking-wider bg-[var(--primary)]/20 text-[var(--primary)] px-1.5 py-0.2 rounded border border-[var(--primary)]/40">
                                In corso
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Vendite */}
                        <td className="py-2.5 px-3 text-right font-extrabold text-white">
                          {formatEur(m.turnover)}
                        </td>

                        {/* vs Anno Prec. */}
                        <td className="py-2.5 px-3 text-center font-sans">
                          {m.deltaPercentVsPrevYear !== null ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
                                m.deltaPercentVsPrevYear >= 0
                                  ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                                  : "bg-red-950/60 text-red-400 border-red-500/30"
                              )}
                              title={`Anno ${selectedYear - 1}: ${formatEur(m.prevYearTurnover)}`}
                            >
                              {m.deltaPercentVsPrevYear >= 0 ? "+" : ""}
                              {m.deltaPercentVsPrevYear.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[10px] text-[var(--muted-foreground)]">-</span>
                          )}
                        </td>

                        {/* Costi */}
                        <td className="py-2.5 px-3 text-right text-red-400">
                          {m.cost > 0 ? formatEur(m.cost) : "-"}
                        </td>

                        {/* Utile Lordo */}
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                          {m.margin > 0 ? formatEur(m.margin) : "-"}
                        </td>

                        {/* Margine % */}
                        <td className="py-2.5 px-3 text-right font-semibold text-sky-400">
                          {m.turnover > 0 && m.cost > 0 ? `${m.marginPercent.toFixed(1)}%` : "-"}
                        </td>

                        {/* Ricarico % */}
                        <td className="py-2.5 px-3 text-right font-semibold text-amber-400">
                          {m.cost > 0 && m.margin > 0 ? `${m.markupPercent.toFixed(1)}%` : "-"}
                        </td>

                        {/* DDT Emessi */}
                        <td className="py-2.5 px-3 text-right text-slate-200">
                          {m.ddtCount > 0 ? `${m.ddtCount} DDT` : "-"}
                        </td>

                        {/* Ticket Medio */}
                        <td className="py-2.5 px-3 text-right text-[var(--muted-foreground)]">
                          {m.ddtCount > 0 ? formatEur(m.averageTicket) : "-"}
                        </td>

                        {/* Dettaglio Giornaliero */}
                        <td className="py-2.5 px-3 text-center font-sans">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMonthForDaily(m.month);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-[var(--card)] hover:bg-[var(--primary)] text-slate-300 hover:text-white border border-[var(--border)] transition-all cursor-pointer shadow-2xs"
                            title={`Apri il grafico e dettaglio giorno per giorno di ${m.monthName}`}
                          >
                            <span>Vedi Giorni</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Footer Totali Annuali */}
                <tfoot className="bg-[var(--card)]/95 border-t-2 border-[var(--border)] font-mono text-xs font-bold text-white select-none">
                  <tr>
                    <td className="py-3 px-3 font-sans font-black text-xs uppercase tracking-wider text-[var(--primary)]">
                      Totale Anno {selectedYear}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-sm text-white">
                      {formatEur(report.totalTurnover)}
                    </td>
                    <td className="py-3 px-3 text-center font-sans">
                      {totalDeltaPct !== null ? (
                        <span
                          className={cn(
                            "inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
                            totalDeltaPct >= 0
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                              : "bg-red-950/60 text-red-400 border-red-500/30"
                          )}
                        >
                          {totalDeltaPct >= 0 ? "+" : ""}
                          {totalDeltaPct.toFixed(1)}%
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-red-400 font-extrabold">
                      {formatEur(report.totalCost)}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-400 font-black text-sm">
                      {formatEur(report.totalMargin)}
                    </td>
                    <td className="py-3 px-3 text-right text-sky-400 font-extrabold">
                      {report.averageMarginPercent.toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 text-right text-amber-400 font-extrabold">
                      {report.averageMarkupPercent.toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 text-right text-white">
                      {report.totalDdtCount.toLocaleString("it-IT")} DDT
                    </td>
                    <td className="py-3 px-3 text-right text-slate-300">
                      {report.totalDdtCount > 0
                        ? formatEur(report.totalTurnover / report.totalDdtCount)
                        : "-"}
                    </td>
                    <td className="py-3 px-3 text-center font-sans text-[10px] text-[var(--muted-foreground)]">
                      12 Mesi
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-2.5 border-t border-[var(--border)] bg-[var(--background)]/80 flex items-center justify-between text-xs text-[var(--muted-foreground)] shrink-0">
          <span>
            Clicca su una qualsiasi cella o riga del mese per aprire l&apos;analisi giornaliera dettagliata (giorno per giorno e cumulativo).
          </span>
          <span className="font-sans">
            Premi <kbd className="rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-mono text-white">Esc</kbd> per chiudere
          </span>
        </div>
      </div>

      {/* POPUP LIVELLO 2: Dettaglio Giornaliero del Mese */}
      {selectedMonthForDaily !== null && (
        <MonthDailyModal
          isOpen={selectedMonthForDaily !== null}
          onClose={() => setSelectedMonthForDaily(null)}
          initialMonth={selectedMonthForDaily}
        />
      )}
    </div>
  );
};

import React from "react";
import { ArrowUpRight, BarChart3 } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { MonthlyPerformanceReport } from "../services/dashboardService";
import {
  DashboardPerformanceTotals,
  DEFAULT_DASHBOARD_YEARS,
  formatDashboardEur,
} from "../utils/dashboardViewUtils";

export interface DashboardMonthlyPerformanceCardProps {
  availableYears?: number[];
  currentYearNum: number;
  currentMonthNum: number;
  performanceYear: number;
  onChangePerformanceYear: (year: number) => void;
  performanceCompYear: number;
  onChangePerformanceCompYear: (year: number) => void;
  performanceReport: MonthlyPerformanceReport | null;
  perfTotals: DashboardPerformanceTotals | null;
  loadingPerformance: boolean;
  onExpandModal: () => void;
  onSelectMonthDaily: (month: number) => void;
}

export const DashboardMonthlyPerformanceCard: React.FC<
  DashboardMonthlyPerformanceCardProps
> = ({
  availableYears,
  currentYearNum,
  currentMonthNum,
  performanceYear,
  onChangePerformanceYear,
  performanceCompYear,
  onChangePerformanceCompYear,
  performanceReport,
  perfTotals,
  loadingPerformance,
  onExpandModal,
  onSelectMonthDaily,
}) => {
  const yearsList = availableYears || DEFAULT_DASHBOARD_YEARS;
  const comparisonYears =
    performanceReport?.availableComparisonYears ||
    yearsList.filter((y) => y !== performanceYear);

  return (
    <div className="col-span-5 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 overflow-hidden shadow-xs">
      {/* Header Quadrante 2 */}
      <div className="flex items-center justify-between shrink-0 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-[var(--primary)]" />
            Rendimento Mensile
          </span>
          {/* Menù a tendina scelta anno per il rendimento */}
          <select
            value={performanceYear}
            onChange={(e) => {
              const newYr = Number(e.target.value);
              onChangePerformanceYear(newYr);
              onChangePerformanceCompYear(newYr - 1);
            }}
            className="bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-[10px] font-bold rounded px-1.5 py-0.5 outline-none cursor-pointer hover:border-[var(--primary)]"
            title="Seleziona l'anno per il rendimento mensile"
          >
            {yearsList.map((yr) => (
              <option key={yr} value={yr}>
                Anno {yr}
              </option>
            ))}
          </select>

          {/* Filtro Anno di Confronto (default anno precedente, modificabile su qualsiasi anno) */}
          <div className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
            <span>vs</span>
            <select
              value={performanceCompYear}
              onChange={(e) => onChangePerformanceCompYear(Number(e.target.value))}
              className="bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-[10px] font-bold rounded px-1.5 py-0.5 outline-none cursor-pointer hover:border-[var(--primary)]"
              title="Seleziona l'anno con cui confrontare le percentuali"
            >
              {comparisonYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--muted-foreground)] hidden sm:inline">
            Click su riga per dettagli
          </span>
          <button
            type="button"
            onClick={onExpandModal}
            className="text-[10px] font-semibold text-[var(--primary)] hover:underline flex items-center gap-0.5 cursor-pointer"
            title="Espandi il Rendimento Mensile a schermo intero"
          >
            <span>Espandi</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Tabella 12 Mesi Rendimento Economico */}
      <div className="flex-1 min-h-0 overflow-auto no-scrollbar rounded-lg border border-[var(--border)] bg-[var(--background)]/40 flex flex-col">
        {loadingPerformance ? (
          <div className="h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]">
            Caricamento rendimento mensile...
          </div>
        ) : performanceReport ? (
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[var(--card)] text-[9px] uppercase font-bold text-[var(--muted-foreground)] border-b border-[var(--border)] sticky top-0 z-10 select-none">
              <tr>
                <th className="py-1.5 px-2">Mese</th>
                <th className="py-1.5 px-2 text-right">Fatturato</th>
                <th className="py-1.5 px-1.5 text-center">vs {performanceCompYear}</th>
                <th className="py-1.5 px-2 text-right">Costi</th>
                <th className="py-1.5 px-2 text-right">Utile</th>
                <th className="py-1.5 px-2 text-right">Marg %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11px]">
              {performanceReport.months.map((m) => {
                const isCurrent = performanceYear === currentYearNum && m.month === currentMonthNum;
                const comp = m.comparisonsByYear?.[performanceCompYear] || {
                  year: performanceCompYear,
                  turnoverAtCutoff: m.prevYearTurnover,
                  fullMonthTurnover: m.prevYearTurnover,
                  deltaPercent: m.deltaPercentVsPrevYear,
                  isCutoffApplied: false,
                };
                const deltaVal = comp.deltaPercent;
                const tooltipText = comp.isCutoffApplied
                  ? `Anno ${performanceCompYear}: ${formatDashboardEur(comp.turnoverAtCutoff)} di ${formatDashboardEur(comp.fullMonthTurnover)}`
                  : `Anno ${performanceCompYear}: ${formatDashboardEur(comp.fullMonthTurnover)}`;

                return (
                  <tr
                    key={m.month}
                    onClick={() => onSelectMonthDaily(m.month)}
                    className={cn(
                      "transition-colors cursor-pointer group",
                      isCurrent
                        ? "bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20"
                        : "hover:bg-[var(--card)]/90"
                    )}
                    title={`Clicca per visualizzare l'andamento giornaliero di ${m.monthName} ${performanceYear} a confronto con tutti gli anni`}
                  >
                    {/* Mese */}
                    <td className="py-1.5 px-2 font-sans whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span
                          className={cn(
                            "font-bold text-[11px] group-hover:text-[var(--primary)] transition-colors",
                            isCurrent ? "text-[var(--primary)]" : "text-[var(--foreground)]"
                          )}
                        >
                          {m.monthName}
                        </span>
                        {isCurrent && (
                          <span className="text-[8px] font-bold uppercase tracking-wider bg-[var(--primary)]/25 text-[var(--primary)] px-1 py-0.2 rounded border border-[var(--primary)]/40">
                            In corso
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Fatturato */}
                    <td className="py-1.5 px-2 text-right font-extrabold text-white avorio-ink whitespace-nowrap">
                      {formatDashboardEur(m.turnover)}
                    </td>

                    {/* vs Anno Selezionato */}
                    <td className="py-1.5 px-1.5 text-center font-sans whitespace-nowrap">
                      {deltaVal !== null ? (
                        <span
                          className={cn(
                            "inline-flex items-center text-[9px] font-bold px-1 py-0.2 rounded border cursor-help",
                            deltaVal >= 0
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                              : "bg-red-950/60 text-red-400 border-red-500/30"
                          )}
                          title={tooltipText}
                        >
                          {deltaVal >= 0 ? "+" : ""}
                          {deltaVal.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[9px] text-[var(--muted-foreground)]">-</span>
                      )}
                    </td>

                    {/* Costi */}
                    <td className="py-1.5 px-2 text-right text-red-400/90 whitespace-nowrap">
                      {m.cost > 0 ? formatDashboardEur(m.cost) : "-"}
                    </td>

                    {/* Utile */}
                    <td className="py-1.5 px-2 text-right font-bold text-emerald-400 whitespace-nowrap">
                      {m.margin > 0 ? formatDashboardEur(m.margin) : "-"}
                    </td>

                    {/* Margine % */}
                    <td className="py-1.5 px-2 text-right font-semibold text-sky-400 whitespace-nowrap">
                      {m.turnover > 0 && m.cost > 0 ? `${m.marginPercent.toFixed(1)}%` : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {perfTotals && (
              <tfoot className="bg-[var(--card)] border-t-2 border-[var(--border)] font-mono text-[11px] font-bold sticky bottom-0 z-10 select-none">
                <tr>
                  <td className="py-1.5 px-2 font-sans uppercase text-[10px] text-white avorio-ink">
                    Totale
                  </td>
                  <td className="py-1.5 px-2 text-right text-white avorio-ink">
                    {formatDashboardEur(perfTotals.totTurnover)}
                  </td>
                  <td className="py-1.5 px-1.5 text-center font-sans">
                    {(() => {
                      const compTotals = performanceReport.totalsByComparisonYear?.[performanceCompYear];
                      const totDeltaVal = compTotals?.totDeltaPercent ?? perfTotals.totDelta;
                      const totTooltip = compTotals
                        ? `Anno ${performanceCompYear}: ${formatDashboardEur(compTotals.totTurnoverSamePeriod)} di ${formatDashboardEur(compTotals.totTurnoverFullYear)}`
                        : `Anno ${performanceCompYear}`;

                      return totDeltaVal !== null ? (
                        <span
                          className={cn(
                            "inline-flex items-center text-[9px] font-bold px-1 py-0.2 rounded border cursor-help",
                            totDeltaVal >= 0
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                              : "bg-red-950/60 text-red-400 border-red-500/30"
                          )}
                          title={totTooltip}
                        >
                          {totDeltaVal >= 0 ? "+" : ""}
                          {totDeltaVal.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[9px] text-[var(--muted-foreground)]">-</span>
                      );
                    })()}
                  </td>
                  <td className="py-1.5 px-2 text-right text-red-400">
                    {formatDashboardEur(perfTotals.totCost)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-emerald-400">
                    {formatDashboardEur(perfTotals.totMargin)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-sky-400">
                    {perfTotals.avgMargin.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]">
            Nessun dato economico disponibile per l&apos;anno {performanceYear}
          </div>
        )}
      </div>
    </div>
  );
};

import React from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { DashboardData } from "../services/dashboardService";
import {
  DashboardChartMetric,
  formatDashboardEur,
  getYearStyle,
  MONTH_NAMES,
  MONTH_NAMES_FULL,
} from "../utils/dashboardViewUtils";

export interface DashboardMultiYearChartProps {
  data: DashboardData | null;
  selectedYears: number[];
  chartMetric: DashboardChartMetric;
  onChangeMetric: (metric: DashboardChartMetric) => void;
  hoveredMonth: number | null;
  onHoverMonth: (month: number | null) => void;
  chartTicks: number[];
  onSelectMonthDaily: (month: number) => void;
}

export const DashboardMultiYearChart: React.FC<DashboardMultiYearChartProps> = ({
  data,
  selectedYears,
  chartMetric,
  onChangeMetric,
  hoveredMonth,
  onHoverMonth,
  chartTicks,
  onSelectMonthDaily,
}) => {
  return (
    <div className="col-span-7 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 overflow-hidden shadow-xs relative">
      {/* Header Quadrante 1 */}
      <div className="flex items-center justify-between shrink-0 mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[var(--primary)]" />
            Confronto Pluriennale Mese per Mese
          </span>
          <span className="text-[10px] text-[var(--muted-foreground)]">
            ({selectedYears.join(" vs ")})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Switcher Metrica Grafico */}
          <div className="flex items-center bg-[var(--background)] p-0.5 rounded border border-[var(--border)] text-[10px] font-semibold">
            <button
              type="button"
              onClick={() => onChangeMetric("turnover")}
              className={cn(
                "px-2 py-0.5 rounded transition-all cursor-pointer",
                chartMetric === "turnover"
                  ? "bg-[var(--primary)] text-white shadow-xs"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
            >
              Fatturato (€)
            </button>
            <button
              type="button"
              onClick={() => onChangeMetric("margin")}
              className={cn(
                "px-2 py-0.5 rounded transition-all cursor-pointer",
                chartMetric === "margin"
                  ? "bg-[var(--primary)] text-white shadow-xs"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
            >
              Margine (€)
            </button>
            <button
              type="button"
              onClick={() => onChangeMetric("ddtCount")}
              className={cn(
                "px-2 py-0.5 rounded transition-all cursor-pointer",
                chartMetric === "ddtCount"
                  ? "bg-[var(--primary)] text-white shadow-xs"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
            >
              N° DDT
            </button>
          </div>
        </div>
      </div>

      {/* Dettaglio del mese hover integrato nel card (TUTTI GLI ANNI VISIBILI, MAI TAGLIATI!) */}
      <div className="h-6 flex items-center justify-between px-2 py-0.5 bg-[var(--background)]/70 rounded-md border border-[var(--border)]/60 text-[10px] shrink-0 mb-1">
        {hoveredMonth && data ? (
          <div className="flex items-center gap-3 w-full">
            <span className="font-extrabold uppercase text-[var(--primary)] shrink-0">
              {MONTH_NAMES_FULL[hoveredMonth - 1]}:
            </span>
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar font-mono">
              {selectedYears.map((yr) => {
                const mData = data.monthlyByYear[yr]?.[hoveredMonth - 1];
                const val = mData
                  ? chartMetric === "turnover"
                    ? mData.turnover
                    : chartMetric === "margin"
                    ? mData.margin
                    : mData.ddtCount
                  : 0;
                const style = getYearStyle(yr);
                return (
                  <span key={yr} className="flex items-center gap-1 shrink-0">
                    <span className={cn("w-1.5 h-1.5 rounded-full", style.bg)} />
                    <span className={cn("font-bold", style.text)}>{yr}:</span>
                    <span className="font-semibold text-white avorio-ink">
                      {chartMetric === "ddtCount" ? `${val} DDT` : formatDashboardEur(val)}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        ) : (
          <span className="text-[10px] text-[var(--muted-foreground)] italic flex items-center justify-between w-full">
            <span>Passa sulle colonne per i valori degli anni ({selectedYears.join(", ")}).</span>
            <span className="text-[9px] text-[var(--primary)] font-semibold not-italic">
              Click su un mese per analisi giornaliera ↗
            </span>
          </span>
        )}
      </div>

      {/* Area Grafico a Barre con Asse Y a Sinistra e Linee Guida Orizzontali */}
      <div className="flex-1 min-h-0 flex relative pt-1">
        {/* Asse Y Sinistra con valori numerici estesi (NO "k") */}
        <div className="w-16 shrink-0 flex flex-col justify-between text-right pr-2 text-[9px] font-mono text-[var(--muted-foreground)] pb-4 select-none">
          {chartTicks.map((t, idx) => (
            <span key={idx}>
              {chartMetric === "ddtCount" ? `${Math.round(t)}` : formatDashboardEur(t)}
            </span>
          ))}
        </div>

        {/* Area Grafico con linee orizzontali e colonne */}
        <div className="flex-1 min-h-0 flex flex-col relative">
          {/* Linee guida orizzontali */}
          <div className="absolute inset-0 pb-4 flex flex-col justify-between pointer-events-none">
            {chartTicks.map((_, idx) => (
              <div key={idx} className="w-full border-b border-[var(--border)]/30 border-dashed" />
            ))}
          </div>

          {/* Colonne Mesi */}
          <div className="flex-1 flex items-end gap-1.5 px-1 border-b border-[var(--border)] pb-0.5 z-10">
            {MONTH_NAMES.map((mName, mIdx) => {
              const monthNum = mIdx + 1;
              const isHovered = hoveredMonth === monthNum;

              return (
                <div
                  key={mName}
                  onMouseEnter={() => onHoverMonth(monthNum)}
                  onMouseLeave={() => onHoverMonth(null)}
                  onClick={() => onSelectMonthDaily(monthNum)}
                  className={cn(
                    "flex-1 h-full flex items-end justify-center gap-0.5 rounded-t transition-colors cursor-pointer",
                    isHovered ? "bg-[var(--card)]/80" : "hover:bg-[var(--card)]/40"
                  )}
                  title={`Clicca per aprire l'analisi giornaliera dettagliata di ${MONTH_NAMES_FULL[mIdx]} (Giorno per giorno e cumulativo)`}
                >
                  {/* Barre affiancate per anno */}
                  <div className="w-full flex items-end justify-center gap-0.5 px-0.5 h-full">
                    {selectedYears.map((yr) => {
                      const mData = data?.monthlyByYear[yr]?.[mIdx];
                      const val = mData
                        ? chartMetric === "turnover"
                          ? mData.turnover
                          : chartMetric === "margin"
                          ? mData.margin
                          : mData.ddtCount
                        : 0;
                      const heightPct = Math.max(0, Math.min(100, (val / chartTicks[0]) * 100));
                      const style = getYearStyle(yr);

                      return (
                        <div
                          key={yr}
                          style={{ height: `${heightPct}%` }}
                          className={cn(
                            "flex-1 max-w-[8px] rounded-t-xs transition-all duration-300",
                            style.bg,
                            isHovered ? "brightness-125 ring-1 ring-white/50" : "opacity-85"
                          )}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Etichette Mesi */}
          <div className="flex items-center justify-between text-[10px] font-semibold text-[var(--muted-foreground)] pt-1 px-1 shrink-0">
            {MONTH_NAMES.map((mName, mIdx) => (
              <span
                key={mName}
                className={cn(
                  "flex-1 text-center transition-colors",
                  hoveredMonth === mIdx + 1 && "text-[var(--primary)] font-bold scale-105"
                )}
              >
                {mName}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

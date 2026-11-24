import React from "react";
import { Calendar, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { DashboardData } from "../services/dashboardService";
import {
  DashboardKpiHoverKey,
  formatDashboardEur,
  MONTH_NAMES,
} from "../utils/dashboardViewUtils";

export interface DashboardKpiBarProps {
  data: DashboardData | null;
  currentYearNum: number;
  hoveredKpi: DashboardKpiHoverKey | null;
  onHoverKpi: (kpi: DashboardKpiHoverKey | null) => void;
}

export const DashboardKpiBar: React.FC<DashboardKpiBarProps> = ({
  data,
  currentYearNum,
  hoveredKpi,
  onHoverKpi,
}) => {
  const currentMonthLabel = MONTH_NAMES[new Date().getMonth()];

  return (
    <div className="flex flex-wrap max-w-full items-center gap-2 bg-[var(--card)]/90 border border-[var(--border)] px-2.5 py-1 rounded-xl shadow-xs overflow-visible min-w-0 shrink">
      {/* 1. Fatturato Annuo con confronto YTD a oggi e Popover al passaggio del mouse */}
      <div
        className="relative flex items-center gap-1.5 text-xs shrink-0 cursor-help"
        onMouseEnter={() => onHoverKpi("turnover")}
        onMouseLeave={() => onHoverKpi(null)}
      >
        <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
          Fatturato {currentYearNum}:
        </span>
        <span className="font-extrabold text-white avorio-ink font-mono">
          {data ? formatDashboardEur(data.kpis.currentYearTurnover) : "..."}
        </span>
        {data?.kpis.ytd && data.kpis.ytd.deltaPercentVsPrevYear !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border shadow-2xs transition-transform hover:scale-105",
              data.kpis.ytd.deltaPercentVsPrevYear >= 0
                ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                : "bg-red-950/60 text-red-400 border-red-500/30"
            )}
            title={`Confronto al ${data.kpis.ytd.cutoffDateFormatted} vs ${currentYearNum - 1}`}
          >
            {data.kpis.ytd.deltaPercentVsPrevYear >= 0 ? "+" : ""}
            {data.kpis.ytd.deltaPercentVsPrevYear.toFixed(1)}%
          </span>
        )}

        {/* Popup informativo YTD Fatturato */}
        {hoveredKpi === "turnover" && data?.kpis.ytd && (
          <div className="absolute top-full left-0 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-[var(--border)]/70 pb-1.5 mb-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[var(--primary)]" />
                <span className="text-xs font-extrabold text-white">
                  Fatturato al {data.kpis.ytd.cutoffDateFormatted} (Oggi)
                </span>
              </div>
              <span className="text-[9px] font-mono text-[var(--muted-foreground)]">
                fino a oggi
              </span>
            </div>

            <div className="mb-2 bg-[var(--background)]/60 rounded-lg p-2 border border-[var(--border)]/50">
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">
                Fatturato {currentYearNum} a oggi:
              </div>
              <div className="text-sm font-black text-white font-mono">
                {formatDashboardEur(data.kpis.ytd.currentYearTurnover)}
              </div>
            </div>

            <div className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5 px-0.5">
              Differenza vs anni precedenti allo stesso giorno:
            </div>

            <div className="space-y-1.5">
              {data.kpis.ytd.historyComparisons.map((item) => {
                const isPositive = item.deltaPercent !== null && item.deltaPercent >= 0;
                return (
                  <div
                    key={item.year}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--background)]/40 border border-[var(--border)]/40 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-sans">Anno {item.year}:</span>
                      <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                        {formatDashboardEur(item.turnover)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono">
                      {item.deltaPercent !== null ? (
                        <span
                          className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded border",
                            isPositive
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                              : "bg-red-950/60 text-red-400 border-red-500/30"
                          )}
                        >
                          {isPositive ? "+" : ""}
                          {item.deltaPercent.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--muted-foreground)]">-</span>
                      )}
                      <span className="text-[9px] text-[var(--muted-foreground)]">
                        ({item.ddtCount} ddt)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-[var(--border)] shrink-0" />

      {/* 2. Margine Lordo Medio Annuo YTD */}
      <div
        className="relative flex items-center gap-1.5 text-xs shrink-0 cursor-help"
        onMouseEnter={() => onHoverKpi("margin")}
        onMouseLeave={() => onHoverKpi(null)}
      >
        <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
          Margine Lordo Annuo:
        </span>
        <span className="font-extrabold text-emerald-400 font-mono">
          {data?.kpis.averageMarginPercent !== null && data?.kpis.averageMarginPercent !== undefined
            ? `${data.kpis.averageMarginPercent.toFixed(1)}%`
            : "..."}
        </span>
        {data?.kpis.ytd && data.kpis.ytd.marginPercentDiffVsPrevYear !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border shadow-2xs transition-transform hover:scale-105",
              data.kpis.ytd.marginPercentDiffVsPrevYear >= 0
                ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                : "bg-red-950/60 text-red-400 border-red-500/30"
            )}
            title={`Differenza punti % vs ${currentYearNum - 1} allo stesso giorno`}
          >
            {data.kpis.ytd.marginPercentDiffVsPrevYear >= 0 ? "+" : ""}
            {data.kpis.ytd.marginPercentDiffVsPrevYear.toFixed(1)} pt
          </span>
        )}

        {/* Popup informativo Margine Annuo YTD */}
        {hoveredKpi === "margin" && data?.kpis.ytd && (
          <div className="absolute top-full left-0 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-[var(--border)]/70 pb-1.5 mb-2">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-extrabold text-white">
                  Margine Lordo al {data.kpis.ytd.cutoffDateFormatted} (Oggi)
                </span>
              </div>
              <span className="text-[9px] font-mono text-[var(--muted-foreground)]">
                fino a oggi
              </span>
            </div>

            <div className="mb-2 bg-[var(--background)]/60 rounded-lg p-2 border border-[var(--border)]/50">
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">
                Margine {currentYearNum} a oggi:
              </div>
              <div className="text-sm font-black text-emerald-400 font-mono">
                {(data.kpis.ytd.currentYearMarginPercent ?? data.kpis.averageMarginPercent ?? 0).toFixed(1)}%
              </div>
            </div>

            <div className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5 px-0.5">
              Differenza vs anni precedenti allo stesso giorno:
            </div>

            <div className="space-y-1.5">
              {data.kpis.ytd.historyComparisons.map((item) => {
                const isPositive = item.marginDiffPoints !== null && item.marginDiffPoints >= 0;
                return (
                  <div
                    key={item.year}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--background)]/40 border border-[var(--border)]/40 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-sans">Anno {item.year}:</span>
                      <span className="font-mono text-[11px] text-emerald-400">
                        {item.marginPercent !== null ? `${item.marginPercent.toFixed(1)}%` : "N/D"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono">
                      {item.marginDiffPoints !== null ? (
                        <span
                          className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded border",
                            isPositive
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                              : "bg-red-950/60 text-red-400 border-red-500/30"
                          )}
                        >
                          {isPositive ? "+" : ""}
                          {item.marginDiffPoints.toFixed(1)} pt
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--muted-foreground)]">-</span>
                      )}
                      <span className="text-[9px] text-[var(--muted-foreground)]">
                        ({formatDashboardEur(item.margin)})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-[var(--border)] shrink-0" />

      {/* Ricarico Annuo YTD */}
      <div
        className="relative flex items-center gap-1.5 text-xs shrink-0 cursor-help"
        onMouseEnter={() => onHoverKpi("markup")}
        onMouseLeave={() => onHoverKpi(null)}
      >
        <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
          Ricarico Annuo:
        </span>
        <span className="font-extrabold text-blue-400 font-mono">
          {data?.kpis.averageMarkupPercent !== null && data?.kpis.averageMarkupPercent !== undefined
            ? `${data.kpis.averageMarkupPercent.toFixed(1)}%`
            : "..."}
        </span>
        {data?.kpis.ytd && data.kpis.ytd.markupPercentDiffVsPrevYear !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border shadow-2xs transition-transform hover:scale-105",
              data.kpis.ytd.markupPercentDiffVsPrevYear >= 0
                ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                : "bg-red-950/60 text-red-400 border-red-500/30"
            )}
            title={`Differenza punti % vs ${currentYearNum - 1} allo stesso giorno`}
          >
            {data.kpis.ytd.markupPercentDiffVsPrevYear >= 0 ? "+" : ""}
            {data.kpis.ytd.markupPercentDiffVsPrevYear.toFixed(1)} pt
          </span>
        )}

        {/* Popup informativo Ricarico Annuo YTD */}
        {hoveredKpi === "markup" && data?.kpis.ytd && (
          <div className="absolute top-full left-0 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-[var(--border)]/70 pb-1.5 mb-2">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-extrabold text-white">
                  Ricarico al {data.kpis.ytd.cutoffDateFormatted} (Oggi)
                </span>
              </div>
              <span className="text-[9px] font-mono text-[var(--muted-foreground)]">
                fino a oggi
              </span>
            </div>

            <div className="mb-2 bg-[var(--background)]/60 rounded-lg p-2 border border-[var(--border)]/50">
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">
                Ricarico {currentYearNum} a oggi:
              </div>
              <div className="text-sm font-black text-blue-400 font-mono">
                {(data.kpis.ytd.currentYearMarkupPercent ?? data.kpis.averageMarkupPercent ?? 0).toFixed(1)}%
              </div>
            </div>

            <div className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5 px-0.5">
              Differenza vs anni precedenti allo stesso giorno:
            </div>

            <div className="space-y-1.5">
              {data.kpis.ytd.historyComparisons.map((item) => {
                const isPositive = item.markupDiffPoints !== null && item.markupDiffPoints >= 0;
                return (
                  <div
                    key={item.year}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--background)]/40 border border-[var(--border)]/40 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-sans">Anno {item.year}:</span>
                      <span className="font-mono text-[11px] text-blue-400">
                        {item.markupPercent !== null ? `${item.markupPercent.toFixed(1)}%` : "N/D"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono">
                      {item.markupDiffPoints !== null ? (
                        <span
                          className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded border",
                            isPositive
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                              : "bg-red-950/60 text-red-400 border-red-500/30"
                          )}
                        >
                          {isPositive ? "+" : ""}
                          {item.markupDiffPoints.toFixed(1)} pt
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--muted-foreground)]">-</span>
                      )}
                      <span className="text-[9px] text-[var(--muted-foreground)]">
                        (Costo: {formatDashboardEur(item.cost)})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-[var(--border)] shrink-0" />

      {/* 3. Mese Corrente MTD */}
      <div
        className="relative flex items-center gap-1.5 text-xs shrink-0 cursor-help"
        onMouseEnter={() => onHoverKpi("monthTurnover")}
        onMouseLeave={() => onHoverKpi(null)}
      >
        <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
          Mese Corrente ({currentMonthLabel}):
        </span>
        <span className="font-extrabold text-white avorio-ink font-mono">
          {data ? formatDashboardEur(data.kpis.ytd.currentMonthMtdTurnover) : "..."}
        </span>
        {data?.kpis.ytd && data.kpis.ytd.monthMtdTurnoverDeltaVsPrev !== null && (
          <span
            className={cn(
              "inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border shadow-2xs transition-transform hover:scale-105",
              data.kpis.ytd.monthMtdTurnoverDeltaVsPrev >= 0
                ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                : "bg-red-950/60 text-red-400 border-red-500/30"
            )}
            title={`Confronto al ${data.kpis.ytd.cutoffDateFormatted} vs ${currentYearNum - 1}`}
          >
            {data.kpis.ytd.monthMtdTurnoverDeltaVsPrev >= 0 ? "+" : ""}
            {data.kpis.ytd.monthMtdTurnoverDeltaVsPrev.toFixed(1)}%
          </span>
        )}

        {/* Popup informativo Mese Corrente MTD */}
        {hoveredKpi === "monthTurnover" && data?.kpis.ytd && (
          <div className="absolute top-full left-0 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-[var(--border)]/70 pb-1.5 mb-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-extrabold text-white">
                  Mese {currentMonthLabel} al {data.kpis.ytd.cutoffDateFormatted}
                </span>
              </div>
              <span className="text-[9px] font-mono text-[var(--muted-foreground)]">
                giorni 1-{data.kpis.ytd.cutoffDay}
              </span>
            </div>

            <div className="mb-2 bg-[var(--background)]/60 rounded-lg p-2 border border-[var(--border)]/50">
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">
                Fatturato {currentMonthLabel} {currentYearNum} a oggi:
              </div>
              <div className="text-sm font-black text-white font-mono">
                {formatDashboardEur(data.kpis.ytd.currentMonthMtdTurnover)}
              </div>
            </div>

            <div className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5 px-0.5">
              Stesso mese negli anni passati (1-{data.kpis.ytd.cutoffDay}):
            </div>

            <div className="space-y-1.5">
              {data.kpis.ytd.historyComparisons.map((item) => {
                const isPositive =
                  item.mtdTurnoverDeltaPercent !== null && item.mtdTurnoverDeltaPercent >= 0;
                return (
                  <div
                    key={item.year}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--background)]/40 border border-[var(--border)]/40 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-sans">Anno {item.year}:</span>
                      <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                        {formatDashboardEur(item.mtdTurnover)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono">
                      {item.mtdTurnoverDeltaPercent !== null ? (
                        <span
                          className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded border",
                            isPositive
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                              : "bg-red-950/60 text-red-400 border-red-500/30"
                          )}
                        >
                          {isPositive ? "+" : ""}
                          {item.mtdTurnoverDeltaPercent.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--muted-foreground)]">-</span>
                      )}
                      <span className="text-[9px] text-[var(--muted-foreground)]">
                        ({item.mtdDdtCount} ddt)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-[var(--border)] shrink-0" />

      {/* 4. Margine Lordo Medio del Mese MTD */}
      <div
        className="relative flex items-center gap-1.5 text-xs shrink-0 cursor-help"
        onMouseEnter={() => onHoverKpi("monthMargin")}
        onMouseLeave={() => onHoverKpi(null)}
      >
        <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
          Lordo Medio Mese:
        </span>
        <span className="font-extrabold text-emerald-400 font-mono">
          {data?.kpis.ytd.currentMonthMtdMarginPercent !== null &&
          data?.kpis.ytd.currentMonthMtdMarginPercent !== undefined
            ? `${data.kpis.ytd.currentMonthMtdMarginPercent.toFixed(1)}%`
            : data?.kpis.currentMonthTurnover === 0
            ? "0.0%"
            : "N/D"}
        </span>
        {data?.kpis.ytd && data.kpis.ytd.monthMtdMarginDiffVsPrev !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border shadow-2xs transition-transform hover:scale-105",
              data.kpis.ytd.monthMtdMarginDiffVsPrev >= 0
                ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                : "bg-red-950/60 text-red-400 border-red-500/30"
            )}
            title={`Differenza punti % vs ${currentYearNum - 1} allo stesso periodo`}
          >
            {data.kpis.ytd.monthMtdMarginDiffVsPrev >= 0 ? "+" : ""}
            {data.kpis.ytd.monthMtdMarginDiffVsPrev.toFixed(1)} pt
          </span>
        )}

        {/* Popup informativo Margine Mese MTD */}
        {hoveredKpi === "monthMargin" && data?.kpis.ytd && (
          <div className="absolute top-full left-0 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-[var(--border)]/70 pb-1.5 mb-2">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-extrabold text-white">
                  Margine {currentMonthLabel} al {data.kpis.ytd.cutoffDateFormatted}
                </span>
              </div>
              <span className="text-[9px] font-mono text-[var(--muted-foreground)]">
                giorni 1-{data.kpis.ytd.cutoffDay}
              </span>
            </div>

            <div className="mb-2 bg-[var(--background)]/60 rounded-lg p-2 border border-[var(--border)]/50">
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">
                Margine {currentMonthLabel} {currentYearNum} a oggi:
              </div>
              <div className="text-sm font-black text-emerald-400 font-mono">
                {(data.kpis.ytd.currentMonthMtdMarginPercent ?? 0).toFixed(1)}%
              </div>
            </div>

            <div className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5 px-0.5">
              Stesso mese negli anni passati (1-{data.kpis.ytd.cutoffDay}):
            </div>

            <div className="space-y-1.5">
              {data.kpis.ytd.historyComparisons.map((item) => {
                const isPositive =
                  item.mtdMarginDiffPoints !== null && item.mtdMarginDiffPoints >= 0;
                return (
                  <div
                    key={item.year}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--background)]/40 border border-[var(--border)]/40 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-sans">Anno {item.year}:</span>
                      <span className="font-mono text-[11px] text-emerald-400">
                        {item.mtdMarginPercent !== null ? `${item.mtdMarginPercent.toFixed(1)}%` : "N/D"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono">
                      {item.mtdMarginDiffPoints !== null ? (
                        <span
                          className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded border",
                            isPositive
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                              : "bg-red-950/60 text-red-400 border-red-500/30"
                          )}
                        >
                          {isPositive ? "+" : ""}
                          {item.mtdMarginDiffPoints.toFixed(1)} pt
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--muted-foreground)]">-</span>
                      )}
                      <span className="text-[9px] text-[var(--muted-foreground)]">
                        ({formatDashboardEur(item.mtdMargin)})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-[var(--border)] shrink-0" />

      {/* Ricarico Mensile MTD */}
      <div
        className="relative flex items-center gap-1.5 text-xs shrink-0 cursor-help"
        onMouseEnter={() => onHoverKpi("monthMarkup")}
        onMouseLeave={() => onHoverKpi(null)}
      >
        <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
          Ricarico Mensile:
        </span>
        <span className="font-extrabold text-blue-400 font-mono">
          {data?.kpis.ytd.currentMonthMtdMarkupPercent !== null &&
          data?.kpis.ytd.currentMonthMtdMarkupPercent !== undefined
            ? `${data.kpis.ytd.currentMonthMtdMarkupPercent.toFixed(1)}%`
            : data?.kpis.currentMonthTurnover === 0
            ? "0.0%"
            : "N/D"}
        </span>
        {data?.kpis.ytd && data.kpis.ytd.monthMtdMarkupDiffVsPrev !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border shadow-2xs transition-transform hover:scale-105",
              data.kpis.ytd.monthMtdMarkupDiffVsPrev >= 0
                ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                : "bg-red-950/60 text-red-400 border-red-500/30"
            )}
            title={`Differenza punti % vs ${currentYearNum - 1} allo stesso periodo`}
          >
            {data.kpis.ytd.monthMtdMarkupDiffVsPrev >= 0 ? "+" : ""}
            {data.kpis.ytd.monthMtdMarkupDiffVsPrev.toFixed(1)} pt
          </span>
        )}

        {/* Popup informativo Ricarico Mese MTD */}
        {hoveredKpi === "monthMarkup" && data?.kpis.ytd && (
          <div className="absolute top-full left-0 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-[var(--border)]/70 pb-1.5 mb-2">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-extrabold text-white">
                  Ricarico {currentMonthLabel} al {data.kpis.ytd.cutoffDateFormatted}
                </span>
              </div>
              <span className="text-[9px] font-mono text-[var(--muted-foreground)]">
                giorni 1-{data.kpis.ytd.cutoffDay}
              </span>
            </div>

            <div className="mb-2 bg-[var(--background)]/60 rounded-lg p-2 border border-[var(--border)]/50">
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">
                Ricarico {currentMonthLabel} {currentYearNum} a oggi:
              </div>
              <div className="text-sm font-black text-blue-400 font-mono">
                {(data.kpis.ytd.currentMonthMtdMarkupPercent ?? 0).toFixed(1)}%
              </div>
            </div>

            <div className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5 px-0.5">
              Stesso mese negli anni passati (1-{data.kpis.ytd.cutoffDay}):
            </div>

            <div className="space-y-1.5">
              {data.kpis.ytd.historyComparisons.map((item) => {
                const isPositive =
                  item.mtdMarkupDiffPoints !== null && item.mtdMarkupDiffPoints >= 0;
                return (
                  <div
                    key={item.year}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--background)]/40 border border-[var(--border)]/40 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-sans">Anno {item.year}:</span>
                      <span className="font-mono text-[11px] text-blue-400">
                        {item.mtdMarkupPercent !== null ? `${item.mtdMarkupPercent.toFixed(1)}%` : "N/D"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono">
                      {item.mtdMarkupDiffPoints !== null ? (
                        <span
                          className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded border",
                            isPositive
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                              : "bg-red-950/60 text-red-400 border-red-500/30"
                          )}
                        >
                          {isPositive ? "+" : ""}
                          {item.mtdMarkupDiffPoints.toFixed(1)} pt
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--muted-foreground)]">-</span>
                      )}
                      <span className="text-[9px] text-[var(--muted-foreground)]">
                        (Costo: {formatDashboardEur(item.mtdCost)})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-[var(--border)] shrink-0" />

      {/* 5. DDT Emessi Anno Corrente */}
      <div
        className="relative flex items-center gap-1.5 text-xs shrink-0 cursor-help"
        onMouseEnter={() => onHoverKpi("ddtCount")}
        onMouseLeave={() => onHoverKpi(null)}
      >
        <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
          DDT {currentYearNum} Emessi:
        </span>
        <span className="font-extrabold text-white avorio-ink font-mono">
          {data ? data.kpis.ytd.currentYearDdtCount.toLocaleString("it-IT") : "..."}
        </span>

        {/* Popup informativo DDT Emessi YTD vs Totale Anno */}
        {hoveredKpi === "ddtCount" && data?.kpis.ytd && (
          <div className="absolute top-full right-0 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-[var(--border)]/70 pb-1.5 mb-2">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-extrabold text-white">
                  DDT Emessi al {data.kpis.ytd.cutoffDateFormatted} (Oggi)
                </span>
              </div>
              <span className="text-[9px] font-mono text-[var(--muted-foreground)]">
                fino a oggi
              </span>
            </div>

            <div className="mb-2 bg-[var(--background)]/60 rounded-lg p-2 border border-[var(--border)]/50">
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">
                DDT Emessi nel {currentYearNum} a oggi:
              </div>
              <div className="text-sm font-black text-white font-mono">
                {data.kpis.ytd.currentYearDdtCount.toLocaleString("it-IT")} DDT
              </div>
            </div>

            <div className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5 px-0.5">
              DDT a oggi rispetto al totale degli anni passati:
            </div>

            <div className="space-y-1.5">
              {data.kpis.ytd.historyComparisons.map((item) => {
                return (
                  <div
                    key={item.year}
                    className="flex items-center justify-between p-2 rounded-lg bg-[var(--background)]/40 border border-[var(--border)]/40 text-xs"
                  >
                    <span className="font-bold text-white font-sans">Anno {item.year}:</span>
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="font-extrabold text-white text-[12px]">
                        {item.ddtCount.toLocaleString("it-IT")}
                      </span>
                      <span className="text-[11px] text-[var(--muted-foreground)]">di</span>
                      <span className="font-bold text-purple-400 text-[12px]">
                        {item.fullYearDdtCount.toLocaleString("it-IT")} DDT
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

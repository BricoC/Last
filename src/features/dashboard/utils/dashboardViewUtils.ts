import {
  ClientTurnoverRow,
  DashboardData,
  DashboardRecentDdt,
  MonthlyPerformanceReport,
} from "../services/dashboardService";
import { matchesFragmentSearch } from "@/shared/hooks/useFragmentSearch";

export const MONTH_NAMES = [
  "Gen",
  "Feb",
  "Mar",
  "Apr",
  "Mag",
  "Giu",
  "Lug",
  "Ago",
  "Set",
  "Ott",
  "Nov",
  "Dic",
];

export const MONTH_NAMES_FULL = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

export const DEFAULT_DASHBOARD_YEARS = [2026, 2025, 2024, 2023];

export const YEAR_COLORS: Record<
  number,
  { bg: string; border: string; text: string; fill: string }
> = {
  2026: { bg: "bg-emerald-500", border: "border-emerald-500", text: "text-emerald-400", fill: "#10b981" },
  2025: { bg: "bg-blue-500", border: "border-blue-500", text: "text-blue-400", fill: "#3b82f6" },
  2024: { bg: "bg-amber-500", border: "border-amber-500", text: "text-amber-400", fill: "#f59e0b" },
  2023: { bg: "bg-purple-500", border: "border-purple-500", text: "text-purple-400", fill: "#a855f7" },
};

export type DashboardChartMetric = "turnover" | "margin" | "ddtCount";

export type DashboardKpiHoverKey =
  | "turnover"
  | "margin"
  | "markup"
  | "monthTurnover"
  | "monthMargin"
  | "monthMarkup"
  | "ddtCount";

export interface DashboardPerformanceTotals {
  totTurnover: number;
  totCost: number;
  totMargin: number;
  avgMargin: number;
  totDelta: number | null;
  totDdts: number;
}

export function getYearStyle(yr: number) {
  return (
    YEAR_COLORS[yr] || {
      bg: "bg-zinc-400",
      border: "border-zinc-400",
      text: "text-zinc-300",
      fill: "#a1a1aa",
    }
  );
}

// Numero esteso arrotondato senza virgole e senza abbreviazione "k"
export function formatDashboardEur(amount: number): string {
  return `€ ${Math.round(amount).toLocaleString("it-IT")}`;
}

export function computePerformanceTotals(
  performanceReport: MonthlyPerformanceReport | null
): DashboardPerformanceTotals | null {
  if (!performanceReport) return null;
  const totTurnover = performanceReport.totalTurnover;
  const totCost = performanceReport.totalCost;
  const totMargin = performanceReport.totalMargin;
  const avgMargin = performanceReport.averageMarginPercent;
  const prevTotTurnover = performanceReport.months.reduce(
    (acc, m) => acc + m.prevYearTurnover,
    0
  );
  const totDelta =
    prevTotTurnover > 0
      ? ((totTurnover - prevTotTurnover) / prevTotTurnover) * 100
      : null;
  const totDdts = performanceReport.totalDdtCount;
  return { totTurnover, totCost, totMargin, avgMargin, totDelta, totDdts };
}

export function filterMonthDdts(
  monthDdts: DashboardRecentDdt[],
  monthDdtSearch: string
): DashboardRecentDdt[] {
  if (!monthDdtSearch.trim()) return monthDdts;
  return monthDdts.filter((doc) => {
    const label = `${doc.series ? `${doc.series}/` : ""}${doc.docNumber ?? "BOZ"}`;
    const searchTargets = [
      label,
      doc.docNumber != null ? String(doc.docNumber) : "",
      doc.docNumber != null ? `N° ${label}` : "",
      doc.docNumber != null ? `N ${label}` : "",
      doc.clientName || "",
      doc.destination || "",
      doc.destinationName || "",
      doc.destinationAddress || "",
      doc.destinationCity || "",
      doc.docDate || "",
    ];
    return matchesFragmentSearch(searchTargets, monthDdtSearch);
  });
}

export function computeMaxChartValue(
  data: DashboardData | null,
  selectedYears: number[],
  chartMetric: DashboardChartMetric
): number {
  if (!data) return 10000;
  let max = 0;
  for (const yr of selectedYears) {
    const months = data.monthlyByYear[yr] || [];
    for (const m of months) {
      const val =
        chartMetric === "turnover"
          ? m.turnover
          : chartMetric === "margin"
          ? m.margin
          : m.ddtCount;
      if (val > max) max = val;
    }
  }
  return max > 0 ? max * 1.15 : 10000;
}

export function computeChartTicks(
  maxChartValue: number,
  chartMetric: DashboardChartMetric
): number[] {
  const base = chartMetric === "ddtCount" ? 50 : 5000;
  const roundedMax = Math.max(base * 4, Math.ceil(maxChartValue / base) * base);
  const step = roundedMax / 4;
  return [roundedMax, step * 3, step * 2, step, 0];
}

export function filterAndSortClientMatrix(
  clientMatrix: ClientTurnoverRow[] | undefined,
  clientSearch: string,
  clientSortField: "total" | number
): ClientTurnoverRow[] {
  if (!clientMatrix) return [];
  let list = clientMatrix;
  if (clientSearch.trim()) {
    const q = clientSearch.toLowerCase();
    list = list.filter((c) => c.clientName.toLowerCase().includes(q));
  }
  return [...list].sort((a, b) => {
    if (clientSortField === "total") {
      return b.totalTurnover - a.totalTurnover;
    }
    const valA = a.turnoverByYear[clientSortField] || 0;
    const valB = b.turnoverByYear[clientSortField] || 0;
    return valB - valA;
  });
}

export function computeClientYearTotals(
  data: DashboardData | null
): Record<number, number> {
  const totals: Record<number, number> = {};
  if (!data) return totals;
  const years = data.availableYears || DEFAULT_DASHBOARD_YEARS;
  for (const yr of years) {
    if (data.monthlyByYear[yr]) {
      totals[yr] = data.monthlyByYear[yr].reduce((acc, m) => acc + m.turnover, 0);
    } else {
      totals[yr] = data.clientMatrix.reduce(
        (acc, c) => acc + (c.turnoverByYear[yr] || 0),
        0
      );
    }
  }
  return totals;
}

export function computeGrandTotalTurnover(data: DashboardData | null): number {
  return data?.clientMatrix?.reduce((acc, cli) => acc + cli.totalTurnover, 0) || 0;
}

export function detectStreetFighterCombo(
  history: string[]
): "shoryuken" | "hadouken" | null {
  const simplified = history
    .map((k) => {
      if (k === "ArrowDown") return "D";
      if (k === "ArrowRight") return "R";
      if (k === "ArrowLeft") return "L";
      if (k === "ArrowUp") return "U";
      return k.toLowerCase();
    })
    .join("");

  if (/(?:RD+R+aenter|shoryukenenter)$/i.test(simplified)) {
    return "shoryuken";
  }
  if (/(?:D+R+aenter|hadoukenenter)$/i.test(simplified)) {
    return "hadouken";
  }
  return null;
}

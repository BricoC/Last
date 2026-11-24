import { describe, it, expect } from "vitest";
import {
  computeChartTicks,
  computeClientYearTotals,
  computeGrandTotalTurnover,
  computeMaxChartValue,
  computePerformanceTotals,
  detectStreetFighterCombo,
  filterAndSortClientMatrix,
  filterMonthDdts,
} from "../dashboardViewUtils";
import type {
  ClientTurnoverRow,
  DashboardData,
  DashboardRecentDdt,
  MonthlyPerformanceReport,
} from "../../services/dashboardService";

const sampleClients: ClientTurnoverRow[] = [
  {
    clientName: "ALFA SRL",
    turnoverByYear: { 2026: 1200, 2025: 5000 },
    totalTurnover: 6200,
    ddtCountByYear: { 2026: 3, 2025: 10 },
  },
  {
    clientName: "BETA SPA",
    turnoverByYear: { 2026: 3500, 2025: 1000 },
    totalTurnover: 4500,
    ddtCountByYear: { 2026: 5, 2025: 2 },
  },
];

const sampleDdts: DashboardRecentDdt[] = [
  {
    id: "d1",
    series: "A",
    docNumber: 42,
    docDate: "2026-05-10",
    clientName: "ALFA SRL",
    destination: "Cantiere Roma Nord",
    totalDocument: 1250,
    hasCompleteMargins: true,
    pricingStatus: "complete_with_margins",
  },
  {
    id: "d2",
    series: "",
    docNumber: 43,
    docDate: "2026-05-11",
    clientName: "BETA SPA",
    destination: "Magazzino Milano",
    totalDocument: 800,
    hasCompleteMargins: false,
    pricingStatus: "priced_no_margins",
  },
];

describe("dashboardViewUtils", () => {
  it("computes chart scale and ticks for turnover and ddtCount", () => {
    const mockData = {
      availableYears: [2026, 2025],
      monthlyByYear: {
        2026: [{ month: 1, turnover: 18000, margin: 4000, ddtCount: 60 }],
        2025: [{ month: 1, turnover: 12000, margin: 3000, ddtCount: 40 }],
      },
      clientMatrix: sampleClients,
    } as unknown as DashboardData;

    const maxTurnover = computeMaxChartValue(mockData, [2026, 2025], "turnover");
    expect(maxTurnover).toBeCloseTo(18000 * 1.15, 5);
    expect(computeChartTicks(maxTurnover, "turnover")).toEqual([25000, 18750, 12500, 6250, 0]);

    const maxDdt = computeMaxChartValue(mockData, [2026], "ddtCount");
    expect(computeChartTicks(maxDdt, "ddtCount")).toEqual([200, 150, 100, 50, 0]);

    expect(computeClientYearTotals(mockData)).toEqual({ 2026: 18000, 2025: 12000 });
    expect(computeGrandTotalTurnover(mockData)).toBe(10700);
  });

  it("filters and sorts client matrix by total or specific year", () => {
    const byTotal = filterAndSortClientMatrix(sampleClients, "", "total");
    expect(byTotal.map((c) => c.clientName)).toEqual(["ALFA SRL", "BETA SPA"]);

    const by2026 = filterAndSortClientMatrix(sampleClients, "", 2026);
    expect(by2026.map((c) => c.clientName)).toEqual(["BETA SPA", "ALFA SRL"]);

    const searched = filterAndSortClientMatrix(sampleClients, "beta", "total");
    expect(searched).toHaveLength(1);
    expect(searched[0].clientName).toBe("BETA SPA");
  });

  it("filters month DDTs by number, client, and destination fragments", () => {
    expect(filterMonthDdts(sampleDdts, "")).toHaveLength(2);
    expect(filterMonthDdts(sampleDdts, "A/42")).toHaveLength(1);
    expect(filterMonthDdts(sampleDdts, "milano beta")).toHaveLength(1);
    expect(filterMonthDdts(sampleDdts, "inesistente")).toHaveLength(0);
  });

  it("computes performance totals and detects Street Fighter combos", () => {
    const report = {
      totalTurnover: 1500,
      totalCost: 1000,
      totalMargin: 500,
      averageMarginPercent: 33.3,
      totalDdtCount: 12,
      months: [{ prevYearTurnover: 1000 }],
    } as unknown as MonthlyPerformanceReport;

    const totals = computePerformanceTotals(report);
    expect(totals).toEqual({
      totTurnover: 1500,
      totCost: 1000,
      totMargin: 500,
      avgMargin: 33.3,
      totDelta: 50,
      totDdts: 12,
    });

    expect(detectStreetFighterCombo(["ArrowDown", "ArrowRight", "a", "Enter"])).toBe("hadouken");
    expect(detectStreetFighterCombo(["ArrowRight", "ArrowDown", "ArrowRight", "a", "Enter"])).toBe("shoryuken");
    expect(detectStreetFighterCombo(["a", "b", "Enter"])).toBeNull();
  });
});

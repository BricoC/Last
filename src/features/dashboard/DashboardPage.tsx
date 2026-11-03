import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { requestOpenDdt } from "@/features/ddt-studio/services/ddtNavigation";
import {
  dashboardService,
  DashboardData,
  DashboardRecentDdt,
  MonthlyPerformanceReport,
} from "./services/dashboardService";
import { DDTClientArticleHistoryModal } from "@/features/ddt-studio/components/DDTClientArticleHistoryModal";
import { DDTQuickViewModal } from "@/features/ddt-studio/components/DDTQuickViewModal";
import { MonthlyPerformanceModal } from "./components/MonthlyPerformanceModal";
import { MonthDailyModal } from "./components/MonthDailyModal";
import {
  TrendingUp,
  Calendar,
  Package,
  RefreshCw,
  Users,
  Clock,
  ArrowUpRight,
  Maximize2,
  X,
  BarChart3,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { useEscClose } from "@/shared/hooks/useEscClose";

const MONTH_NAMES = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic"
];

const MONTH_NAMES_FULL = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

const YEAR_COLORS: Record<number, { bg: string; border: string; text: string; fill: string }> = {
  2026: { bg: "bg-emerald-500", border: "border-emerald-500", text: "text-emerald-400", fill: "#10b981" },
  2025: { bg: "bg-blue-500", border: "border-blue-500", text: "text-blue-400", fill: "#3b82f6" },
  2024: { bg: "bg-amber-500", border: "border-amber-500", text: "text-amber-400", fill: "#f59e0b" },
  2023: { bg: "bg-purple-500", border: "border-purple-500", text: "text-purple-400", fill: "#a855f7" },
};

function getYearStyle(yr: number) {
  return (
    YEAR_COLORS[yr] || {
      bg: "bg-zinc-400",
      border: "border-zinc-400",
      text: "text-zinc-300",
      fill: "#a1a1aa",
    }
  );
}

// Numero esteso arrotondato senza virgole e senza abbreviazione "k" (come richiesto!)
function formatEur(amount: number): string {
  return `€ ${Math.round(amount).toLocaleString("it-IT")}`;
}

export const DashboardPage: React.FC = () => {
  const { openWindow } = useWindowStore();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState<"turnover" | "margin" | "ddtCount">("turnover");
  const [selectedYears, setSelectedYears] = useState<number[]>([2026, 2025, 2024, 2023]);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  // Filtro ricerca clienti
  const [clientSearch, setClientSearch] = useState("");
  const [clientSortField, setClientSortField] = useState<"total" | number>("total");
  const [isClientMatrixModalOpen, setIsClientMatrixModalOpen] = useState(false);

  // Ricerca live articoli in dashboard
  const currentYearNum = new Date().getFullYear();
  const currentMonthNum = new Date().getMonth() + 1;
  const [isArticleHistoryModalOpen, setIsArticleHistoryModalOpen] = useState(false);
  const [articleModalClient, setArticleModalClient] = useState("");
  const [articleModalDesc, setArticleModalDesc] = useState("");

  // DDT del Mese Corrente & Modale DDT Quick View (come in DDT List)
  const [selectedMonthForDdts, setSelectedMonthForDdts] = useState<number>(currentMonthNum);
  const [monthDdts, setMonthDdts] = useState<DashboardRecentDdt[]>([]);
  const [selectedQuickDdtId, setSelectedQuickDdtId] = useState<string | null>(null);

  // Modale Rendimento Mensile (12 schede) & Modale Dettaglio Giornaliero
  const [isMonthlyPerformanceModalOpen, setIsMonthlyPerformanceModalOpen] = useState(false);
  const [selectedMonthForDailyDirect, setSelectedMonthForDailyDirect] = useState<number | null>(null);

  // Rendimento Mensile integrato nel Quadrante 2
  const [performanceYear, setPerformanceYear] = useState<number>(currentYearNum);
  const [performanceReport, setPerformanceReport] = useState<MonthlyPerformanceReport | null>(null);
  const [loadingPerformance, setLoadingPerformance] = useState(false);

  // Hover popover per confronto YTD al giorno odierno
  const [isYtdHovered, setIsYtdHovered] = useState(false);

  // Chiusura con tasto ESC per la matrice clienti a tutto schermo (gli altri modali gestiscono autonomamente il loro stack)
  useEscClose(isClientMatrixModalOpen, () => setIsClientMatrixModalOpen(false));

  const loadPerformanceReport = useCallback(async (yr: number) => {
    setLoadingPerformance(true);
    try {
      const rep = await dashboardService.getMonthlyPerformanceReport(yr);
      setPerformanceReport(rep);
    } catch (err) {
      console.error("Errore caricamento report rendimento mensile:", err);
    } finally {
      setLoadingPerformance(false);
    }
  }, []);

  useEffect(() => {
    void loadPerformanceReport(performanceYear);
  }, [performanceYear, loadPerformanceReport]);

  const perfTotals = useMemo(() => {
    if (!performanceReport) return null;
    const totTurnover = performanceReport.totalTurnover;
    const totCost = performanceReport.totalCost;
    const totMargin = performanceReport.totalMargin;
    const avgMargin = performanceReport.averageMarginPercent;
    const prevTotTurnover = performanceReport.months.reduce((acc, m) => acc + m.prevYearTurnover, 0);
    const totDelta = prevTotTurnover > 0 ? ((totTurnover - prevTotTurnover) / prevTotTurnover) * 100 : null;
    const totDdts = performanceReport.totalDdtCount;
    return { totTurnover, totCost, totMargin, avgMargin, totDelta, totDdts };
  }, [performanceReport]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardService.getDashboardData();
      setData(res);

      // Se non ci sono DDT nel mese corrente (es. a inizio mese), controlla se il mese precedente ha DDT
      const ddtForCurMonth = await dashboardService.getDdtsForMonth(currentYearNum, currentMonthNum);
      if (ddtForCurMonth.length > 0) {
        setMonthDdts(ddtForCurMonth);
        setSelectedMonthForDdts(currentMonthNum);
      } else {
        const prevM = currentMonthNum > 1 ? currentMonthNum - 1 : 12;
        const prevYr = currentMonthNum > 1 ? currentYearNum : currentYearNum - 1;
        const ddtForPrevMonth = await dashboardService.getDdtsForMonth(prevYr, prevM);
        if (ddtForPrevMonth.length > 0) {
          setMonthDdts(ddtForPrevMonth);
          setSelectedMonthForDdts(prevM);
        } else {
          setMonthDdts(res.recentDdts);
        }
      }
    } catch (err) {
      console.error("Errore caricamento dati Dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, [currentMonthNum, currentYearNum]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Aggiornamento reattivo su sincronizzazioni
  useEffect(() => {
    const handleSync = () => {
      void loadData();
      void loadPerformanceReport(performanceYear);
    };
    window.addEventListener("ddt-data-updated", handleSync);
    return () => window.removeEventListener("ddt-data-updated", handleSync);
  }, [loadData, loadPerformanceReport, performanceYear]);

  // Carica i DDT quando l'utente cambia il mese selezionato nel Quadrante 4
  const handleSelectMonthForDdts = async (m: number) => {
    setSelectedMonthForDdts(m);
    try {
      const list = await dashboardService.getDdtsForMonth(currentYearNum, m);
      setMonthDdts(list);
    } catch (err) {
      console.error("Errore recupero DDT per mese:", err);
    }
  };

  // Gestione selettore ad albero/tendina per anni grafico
  const yearFilterValue = useMemo(() => {
    if (!data) return "all";
    const available = data.availableYears || [2026, 2025, 2024, 2023];
    if (selectedYears.length === available.length && available.every((y) => selectedYears.includes(y))) {
      return "all";
    }
    if (
      selectedYears.length === 3 &&
      available.slice(0, 3).every((y) => selectedYears.includes(y))
    ) {
      return "last3";
    }
    if (selectedYears.length === 1) {
      return String(selectedYears[0]);
    }
    return "custom";
  }, [data, selectedYears]);

  const handleYearFilterChange = (val: string) => {
    if (!data) return;
    const available = data.availableYears || [2026, 2025, 2024, 2023];
    if (val === "all") {
      setSelectedYears(available);
    } else if (val === "last3") {
      setSelectedYears(available.slice(0, 3));
    } else if (val === "custom") {
      // mantiene l'attuale
    } else {
      setSelectedYears([Number(val)]);
    }
  };

  const handleOpenDdtInStudio = (id: string) => {
    setSelectedQuickDdtId(null);
    openWindow({
      id: "ddt-studio",
      title: "DDT Studio (Pro)",
      componentId: "ddt-studio",
    });
    requestOpenDdt(id);
  };

  const handleOpenArticleHistory = (desc = "", client = "") => {
    setArticleModalDesc(desc);
    setArticleModalClient(client);
    setIsArticleHistoryModalOpen(true);
  };

  // Calcolo valore massimo per il grafico
  const maxChartValue = useMemo(() => {
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
  }, [data, selectedYears, chartMetric]);

  // Genera 5 tick e righe guida per l'asse Y del grafico (senza "k"!)
  const chartTicks = useMemo(() => {
    const base = chartMetric === "ddtCount" ? 50 : 5000;
    const roundedMax = Math.max(base * 4, Math.ceil(maxChartValue / base) * base);
    const step = roundedMax / 4;
    return [roundedMax, step * 3, step * 2, step, 0];
  }, [maxChartValue, chartMetric]);

  // Filtro e ordinamento matrice clienti
  const filteredClients = useMemo(() => {
    if (!data) return [];
    let list = data.clientMatrix;
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
  }, [data, clientSearch, clientSortField]);

  const monthDeltaPct = useMemo(() => {
    if (!data || data.kpis.prevYearSameMonthTurnover === 0) return null;
    return (
      ((data.kpis.currentMonthTurnover - data.kpis.prevYearSameMonthTurnover) /
        data.kpis.prevYearSameMonthTurnover) *
      100
    );
  }, [data]);

  // Totali fatturato per anno (per la tabella Fatturato Clienti per Anno)
  const clientYearTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    if (!data) return totals;
    const years = data.availableYears || [2026, 2025, 2024, 2023];
    for (const yr of years) {
      if (data.monthlyByYear[yr]) {
        totals[yr] = data.monthlyByYear[yr].reduce((acc, m) => acc + m.turnover, 0);
      } else {
        totals[yr] = data.clientMatrix.reduce((acc, c) => acc + (c.turnoverByYear[yr] || 0), 0);
      }
    }
    return totals;
  }, [data]);

  const grandTotalTurnover = useMemo(() => {
    return data?.clientMatrix?.reduce((acc, cli) => acc + cli.totalTurnover, 0) || 0;
  }, [data]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] p-3 gap-2.5 select-none font-sans">
      {/* 1. Header Toolbar Dashboard con Metriche Chiave Inline */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] pb-2 gap-3 flex-wrap">
        {/* Titolo Dashboard */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30">
            <TrendingUp className="w-4 h-4" />
          </div>
          <h1 className="text-base font-extrabold tracking-tight text-[var(--foreground)]">
            Dashboard
          </h1>
        </div>

        {/* Metriche Chiave Inline (Fatturato Annuo YTD con popup hover, Margine Lordo Medio Annuo, Mese Corrente, Lordo Medio Mese) */}
        <div className="flex items-center gap-3 bg-[var(--card)]/90 border border-[var(--border)] px-3 py-1.5 rounded-xl shadow-xs overflow-visible">
          {/* Fatturato Annuo con confronto YTD a oggi e Popover al passaggio del mouse */}
          <div
            className="relative flex items-center gap-1.5 text-xs shrink-0 cursor-help"
            onMouseEnter={() => setIsYtdHovered(true)}
            onMouseLeave={() => setIsYtdHovered(false)}
          >
            <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
              Fatturato {currentYearNum}:
            </span>
            <span className="font-extrabold text-white font-mono">
              {data ? formatEur(data.kpis.currentYearTurnover) : "..."}
            </span>
            {data?.kpis.ytd && data.kpis.ytd.deltaPercentVsPrevYear !== null && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border shadow-2xs transition-transform hover:scale-105",
                  data.kpis.ytd.deltaPercentVsPrevYear >= 0
                    ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                    : "bg-red-950/60 text-red-400 border-red-500/30"
                )}
                title={`Confronto al ${data.kpis.ytd.cutoffDateFormatted} vs ${currentYearNum - 1} (passa il mouse per tutti gli anni)`}
              >
                {data.kpis.ytd.deltaPercentVsPrevYear >= 0 ? "+" : ""}
                {data.kpis.ytd.deltaPercentVsPrevYear.toFixed(1)}%
              </span>
            )}

            {/* Popup informativo YTD con confronto pluriennale alla data odierna */}
            {isYtdHovered && data?.kpis.ytd && (
              <div className="absolute top-full left-0 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-[var(--border)]/70 pb-1.5 mb-2">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[var(--primary)]" />
                    <span className="text-xs font-extrabold text-white">
                      Confronto al {data.kpis.ytd.cutoffDateFormatted} (Oggi)
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
                    {formatEur(data.kpis.ytd.currentYearTurnover)}
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
                            {formatEur(item.turnover)}
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

          {/* Margine Lordo Medio Annuo */}
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
              Margine Lordo Annuo:
            </span>
            <span className="font-extrabold text-emerald-400 font-mono">
              {data?.kpis.averageMarginPercent !== null && data?.kpis.averageMarginPercent !== undefined
                ? `${data.kpis.averageMarginPercent.toFixed(1)}%`
                : "..."}
            </span>
          </div>

          <div className="h-4 w-px bg-[var(--border)] shrink-0" />

          {/* Mese Corrente */}
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
              Mese Corrente ({MONTH_NAMES[new Date().getMonth()]}):
            </span>
            <span className="font-extrabold text-white font-mono">
              {data ? formatEur(data.kpis.currentMonthTurnover) : "..."}
            </span>
            {monthDeltaPct !== null && (
              <span
                className={cn(
                  "inline-flex items-center text-[9px] font-bold px-1 rounded border",
                  monthDeltaPct >= 0
                    ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                    : "bg-red-950/40 text-red-400 border-red-500/30"
                )}
                title="Rispetto allo stesso mese dell'anno precedente"
              >
                {monthDeltaPct >= 0 ? "+" : ""}{monthDeltaPct.toFixed(1)}%
              </span>
            )}
          </div>

          <div className="h-4 w-px bg-[var(--border)] shrink-0" />

          {/* Margine Lordo Medio del Mese */}
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
              Lordo Medio Mese:
            </span>
            <span className="font-extrabold text-emerald-400 font-mono">
              {data?.kpis.currentMonthMarginPercent !== null && data?.kpis.currentMonthMarginPercent !== undefined
                ? `${data.kpis.currentMonthMarginPercent.toFixed(1)}%`
                : (data?.kpis.currentMonthTurnover === 0 ? "0.0%" : "N/D")}
            </span>
          </div>
        </div>

        {/* Destra: Tasto Storico Articoli, Menù a tendina Anni & Ricarica */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Pulsante Storico Articoli (apre direttamente il popup a schermo intero) */}
          <button
            type="button"
            onClick={() => handleOpenArticleHistory("")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--card)] hover:bg-[var(--primary)] text-slate-200 hover:text-white border border-[var(--border)] hover:border-[var(--primary)] text-xs font-bold transition-all cursor-pointer shadow-xs group"
            title="Apri lo Storico e Resoconto Articoli a tutto schermo"
          >
            <Package className="w-3.5 h-3.5 text-sky-400 group-hover:text-white transition-colors" />
            <span>Storico Articoli</span>
            <ArrowUpRight className="w-3 h-3 text-[var(--muted-foreground)] group-hover:text-white transition-colors" />
          </button>

          {/* Menù a Tendina Anni Grafico */}
          <div className="flex items-center gap-1.5 bg-[var(--card)] px-2.5 py-1 rounded-lg border border-[var(--border)] shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-[var(--primary)]" />
            <select
              value={yearFilterValue}
              onChange={(e) => handleYearFilterChange(e.target.value)}
              className="bg-transparent text-[var(--foreground)] text-xs font-bold outline-none cursor-pointer"
              title="Seleziona anni da visualizzare nel grafico"
            >
              <option value="all" className="bg-[var(--card)] text-white">
                Tutti gli anni ({data?.availableYears.length || 4})
              </option>
              <option value="last3" className="bg-[var(--card)] text-white">
                Ultimi 3 anni
              </option>
              {(data?.availableYears || [2026, 2025, 2024, 2023]).map((yr) => (
                <option key={yr} value={String(yr)} className="bg-[var(--card)] text-white">
                  Solo {yr}
                </option>
              ))}
              {yearFilterValue === "custom" && (
                <option value="custom" className="bg-[var(--card)] text-white">
                  Personalizzato ({selectedYears.length})
                </option>
              )}
            </select>
          </div>

          {/* Ricarica */}
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="p-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)] transition-all cursor-pointer disabled:opacity-50"
            title="Ricarica dati"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-[var(--primary)]")} />
          </button>
        </div>
      </header>

      {/* 2. Griglia Principale a 4 Quadranti (Flex-1, 100% altezza, Zero Scroll di pagina) */}
      <main className="flex-1 min-h-0 grid grid-cols-12 gap-2.5 overflow-hidden">
        {/* ============================================================== */}
        {/* QUADRANTE 1: GRAFICO MULTI-ANNO MENSILE (col-span-7)          */}
        {/* ============================================================== */}
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
                  onClick={() => setChartMetric("turnover")}
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
                  onClick={() => setChartMetric("margin")}
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
                  onClick={() => setChartMetric("ddtCount")}
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
                        <span className="font-semibold text-white">
                          {chartMetric === "ddtCount" ? `${val} DDT` : formatEur(val)}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : (
              <span className="text-[10px] text-[var(--muted-foreground)] italic flex items-center justify-between w-full">
                <span>Passa sulle colonne per i valori degli anni ({selectedYears.join(", ")}).</span>
                <span className="text-[9px] text-[var(--primary)] font-semibold not-italic">Click su un mese per analisi giornaliera ↗</span>
              </span>
            )}
          </div>

          {/* Area Grafico a Barre con Asse Y a Sinistra e Linee Guida Orizzontali (come richiesto!) */}
          <div className="flex-1 min-h-0 flex relative pt-1">
            {/* Asse Y Sinistra con valori numerici estesi (NO "k") */}
            <div className="w-16 shrink-0 flex flex-col justify-between text-right pr-2 text-[9px] font-mono text-[var(--muted-foreground)] pb-4 select-none">
              {chartTicks.map((t, idx) => (
                <span key={idx}>
                  {chartMetric === "ddtCount" ? `${Math.round(t)}` : formatEur(t)}
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
                      onMouseEnter={() => setHoveredMonth(monthNum)}
                      onMouseLeave={() => setHoveredMonth(null)}
                      onClick={() => setSelectedMonthForDailyDirect(monthNum)}
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

        {/* ============================================================== */}
        {/* QUADRANTE 2: TABELLA RENDIMENTO MENSILE (col-span-5)          */}
        {/* ============================================================== */}
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
                onChange={(e) => setPerformanceYear(Number(e.target.value))}
                className="bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-[10px] font-bold rounded px-1.5 py-0.5 outline-none cursor-pointer hover:border-[var(--primary)]"
                title="Seleziona l'anno per il rendimento mensile"
              >
                {(data?.availableYears || [2026, 2025, 2024, 2023]).map((yr) => (
                  <option key={yr} value={yr}>
                    Anno {yr}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--muted-foreground)] hidden sm:inline">
                Click su riga per dettagli
              </span>
              <button
                type="button"
                onClick={() => setIsMonthlyPerformanceModalOpen(true)}
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
                    <th className="py-1.5 px-1.5 text-center">vs {performanceYear - 1}</th>
                    <th className="py-1.5 px-2 text-right">Costi</th>
                    <th className="py-1.5 px-2 text-right">Utile</th>
                    <th className="py-1.5 px-2 text-right">Marg %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11px]">
                  {performanceReport.months.map((m) => {
                    const isCurrent = performanceYear === currentYearNum && m.month === currentMonthNum;
                    return (
                      <tr
                        key={m.month}
                        onClick={() => setSelectedMonthForDailyDirect(m.month)}
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
                        <td className="py-1.5 px-2 text-right font-extrabold text-white whitespace-nowrap">
                          {formatEur(m.turnover)}
                        </td>

                        {/* vs Anno Prec */}
                        <td className="py-1.5 px-1.5 text-center font-sans whitespace-nowrap">
                          {m.deltaPercentVsPrevYear !== null ? (
                            <span
                              className={cn(
                                "inline-flex items-center text-[9px] font-bold px-1 py-0.2 rounded border",
                                m.deltaPercentVsPrevYear >= 0
                                  ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                                  : "bg-red-950/60 text-red-400 border-red-500/30"
                              )}
                              title={`Anno ${performanceYear - 1}: ${formatEur(m.prevYearTurnover)}`}
                            >
                              {m.deltaPercentVsPrevYear >= 0 ? "+" : ""}
                              {m.deltaPercentVsPrevYear.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[9px] text-[var(--muted-foreground)]">-</span>
                          )}
                        </td>

                        {/* Costi */}
                        <td className="py-1.5 px-2 text-right text-red-400/90 whitespace-nowrap">
                          {m.cost > 0 ? formatEur(m.cost) : "-"}
                        </td>

                        {/* Utile */}
                        <td className="py-1.5 px-2 text-right font-bold text-emerald-400 whitespace-nowrap">
                          {m.margin > 0 ? formatEur(m.margin) : "-"}
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
                      <td className="py-1.5 px-2 font-sans uppercase text-[10px] text-white">
                        Totale
                      </td>
                      <td className="py-1.5 px-2 text-right text-white">
                        {formatEur(perfTotals.totTurnover)}
                      </td>
                      <td className="py-1.5 px-1.5 text-center font-sans">
                        {perfTotals.totDelta !== null ? (
                          <span
                            className={cn(
                              "inline-flex items-center text-[9px] font-bold px-1 py-0.2 rounded border",
                              perfTotals.totDelta >= 0
                                ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                                : "bg-red-950/60 text-red-400 border-red-500/30"
                            )}
                          >
                            {perfTotals.totDelta >= 0 ? "+" : ""}
                            {perfTotals.totDelta.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[9px] text-[var(--muted-foreground)]">-</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right text-red-400">
                        {formatEur(perfTotals.totCost)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-emerald-400">
                        {formatEur(perfTotals.totMargin)}
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

        {/* ============================================================== */}
        {/* QUADRANTE 3: MATRICE FATTURATO CLIENTI PER ANNO (col-span-7)  */}
        {/* ============================================================== */}
        <div className="col-span-7 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 overflow-hidden shadow-xs">
          {/* Header Quadrante 3 */}
          <div className="flex items-center justify-between shrink-0 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                Fatturato Clienti per Anno
              </span>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                ({filteredClients.length} clienti)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Cerca cliente compatto */}
              <div className="relative">
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Filtra cliente..."
                  className="w-32 bg-[var(--background)] border border-[var(--border)] rounded px-2 py-0.5 text-[10px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                />
              </div>

              {/* Tasto Espandi Matrice a Schermo Intero */}
              <button
                type="button"
                onClick={() => setIsClientMatrixModalOpen(true)}
                className="text-[10px] font-semibold bg-[var(--background)] hover:bg-[var(--primary)] hover:text-white border border-[var(--border)] px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer"
                title="Espandi Matrice Clienti a tutto schermo (Esc per chiudere)"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Espandi Tutti</span>
              </button>
            </div>
          </div>

          {/* Tabella Matrice Clienti compatta con Scroll orizzontale e verticale (colonne sticky) */}
          <div className="flex-1 min-h-0 overflow-auto border border-[var(--border)] rounded-lg bg-[var(--background)]/30">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[var(--card)] text-[10px] uppercase font-bold text-[var(--muted-foreground)] border-b border-[var(--border)] z-20">
                <tr>
                  <th className="p-2 align-bottom sticky left-0 bg-[var(--card)] z-30 min-w-[140px] shadow-[2px_0_4px_-1px_rgba(0,0,0,0.5)]">
                    <div className="font-extrabold text-[var(--foreground)]">Cliente</div>
                    <div className="text-[9px] font-sans font-bold text-[var(--muted-foreground)] mt-0.5 lowercase tracking-normal">
                      totale:
                    </div>
                  </th>
                  {(data?.availableYears || [2026, 2025, 2024, 2023]).map((yr) => (
                    <th
                      key={yr}
                      onClick={() => setClientSortField(yr)}
                      className={cn(
                        "p-2 text-right cursor-pointer hover:text-white transition-colors align-bottom min-w-[85px]",
                        clientSortField === yr && "text-[var(--primary)]"
                      )}
                    >
                      <div className={cn("font-extrabold", clientSortField === yr && "underline")}>{yr}</div>
                      <div className="text-[10px] font-mono font-bold text-white mt-0.5 tracking-normal">
                        {formatEur(clientYearTotals[yr] || 0)}
                      </div>
                    </th>
                  ))}
                  <th
                    onClick={() => setClientSortField("total")}
                    className={cn(
                      "p-2 text-right cursor-pointer hover:text-white transition-colors align-bottom sticky right-0 bg-[var(--card)] z-30 min-w-[95px] shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.5)]",
                      clientSortField === "total" && "text-[var(--primary)]"
                    )}
                  >
                    <div className={cn("font-extrabold", clientSortField === "total" && "underline")}>Totale</div>
                    <div className="text-[10px] font-mono font-bold text-white mt-0.5 tracking-normal">
                      {formatEur(grandTotalTurnover)}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11px]">
                {filteredClients.slice(0, 15).map((cli) => (
                  <tr
                    key={cli.clientName}
                    onClick={() => handleOpenArticleHistory("", cli.clientName)}
                    className="hover:bg-[var(--card)]/80 transition-colors cursor-pointer group"
                    title={`Clicca per vedere il resoconto articoli di ${cli.clientName}`}
                  >
                    <td className="p-2 font-sans font-semibold text-[var(--foreground)] truncate max-w-[160px] group-hover:text-[var(--primary)] sticky left-0 bg-[var(--card)] group-hover:bg-[#1a202c] z-10 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.5)]">
                      {cli.clientName}
                    </td>
                    {(data?.availableYears || [2026, 2025, 2024, 2023]).map((yr) => {
                      const val = cli.turnoverByYear[yr] || 0;
                      return (
                        <td key={yr} className="p-2 text-right text-[var(--muted-foreground)] min-w-[85px]">
                          {val > 0 ? formatEur(val) : "-"}
                        </td>
                      );
                    })}
                    <td className="p-2 text-right font-bold text-white sticky right-0 bg-[var(--card)] group-hover:bg-[#1a202c] z-10 shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.5)] min-w-[95px]">
                      {formatEur(cli.totalTurnover)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ============================================================== */}
        {/* QUADRANTE 4: DDT DEL MESE CON QUICK VIEW MODAL (col-span-5)   */}
        {/* ============================================================== */}
        <div className="col-span-5 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 overflow-hidden shadow-xs">
          {/* Header Quadrante 4 con selettore mese */}
          <div className="flex items-center justify-between shrink-0 mb-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                DDT del Mese
              </span>
              <select
                value={selectedMonthForDdts}
                onChange={(e) => void handleSelectMonthForDdts(Number(e.target.value))}
                className="bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-[10px] font-bold rounded px-1.5 py-0.5 outline-none cursor-pointer"
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m} {currentYearNum}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[10px] text-[var(--muted-foreground)]">
              {monthDdts.length} DDT
            </span>
          </div>

          {/* Lista DDT del mese selezionato (Cliccabile: apre DDTQuickViewModal!) */}
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1">
            {monthDdts && monthDdts.length > 0 ? (
              monthDdts.map((doc) => {
                const label = `${doc.series ? `${doc.series}/` : ""}${doc.docNumber ?? "BOZ"}`;
                return (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedQuickDdtId(doc.id)}
                    role="button"
                    tabIndex={0}
                    className="flex items-center justify-between p-1.5 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/50 hover:bg-[var(--background)] hover:border-[var(--primary)] transition-all cursor-pointer group"
                    title={`Clicca per visualizzare l'anteprima del DDT ${label}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="font-mono text-[11px] font-extrabold text-[var(--primary)] shrink-0">
                        N° {label}
                      </span>
                      <span className="text-xs font-semibold truncate text-[var(--foreground)] group-hover:text-white">
                        {doc.clientName}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono text-[var(--muted-foreground)]">
                        {doc.docDate}
                      </span>
                      <span className="font-mono text-xs font-bold text-white">
                        {formatEur(doc.totalDocument)}
                      </span>
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full",
                          doc.hasCompleteMargins ? "bg-emerald-400" : "bg-amber-400"
                        )}
                        title={doc.hasCompleteMargins ? "Margini completi" : "Margini incompleti"}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-xs text-[var(--muted-foreground)] p-4 text-center">
                <span>Nessun DDT emesso nel mese di {MONTH_NAMES_FULL[selectedMonthForDdts - 1]}.</span>
                <span className="text-[10px] mt-1 opacity-75">Seleziona un altro mese dal menù a tendina.</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ============================================================== */}
      {/* POPUP MODALE 1: MATRICE CLIENTI COMPLETA (Esc support)         */}
      {/* ============================================================== */}
      {isClientMatrixModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-3 backdrop-blur-xs select-none"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-[98vw] h-[95vh] rounded-2xl border border-[var(--border)] bg-[var(--card)] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]/70 shrink-0">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Matrice Completa Fatturato per Cliente
                  </h2>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Confronto dettagliato di tutti i clienti attivi per ciascun anno (scorrimento orizzontale per gli anni con cliente e totale bloccati)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Cerca cliente..."
                  className="bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-1 text-xs text-white outline-none focus:border-[var(--primary)] w-60"
                />
                <button
                  type="button"
                  onClick={() => setIsClientMatrixModalOpen(false)}
                  className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--border)] transition-colors cursor-pointer"
                  title="Chiudi (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: Tabella completa scrollabile sia orizzontalmente che verticalmente */}
            <div className="flex-1 overflow-auto p-3">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-[var(--card)] text-xs uppercase font-bold text-[var(--muted-foreground)] border-b border-[var(--border)] z-20">
                  <tr>
                    <th className="p-3 align-bottom sticky left-0 bg-[var(--card)] z-30 min-w-[200px] shadow-[2px_0_5px_-1px_rgba(0,0,0,0.5)]">
                      <div className="font-extrabold text-[var(--foreground)]">Cliente</div>
                      <div className="text-[10px] font-sans font-bold text-[var(--muted-foreground)] mt-0.5 lowercase tracking-normal">
                        totale annuo:
                      </div>
                    </th>
                    {(data?.availableYears || [2026, 2025, 2024, 2023]).map((yr) => (
                      <th
                        key={yr}
                        onClick={() => setClientSortField(yr)}
                        className={cn(
                          "p-3 text-right cursor-pointer hover:text-white transition-colors align-bottom min-w-[105px]",
                          clientSortField === yr && "text-[var(--primary)]"
                        )}
                      >
                        <div className={cn("font-extrabold", clientSortField === yr && "underline")}>Anno {yr}</div>
                        <div className="text-xs font-mono font-bold text-white mt-0.5 tracking-normal">
                          {formatEur(clientYearTotals[yr] || 0)}
                        </div>
                      </th>
                    ))}
                    <th
                      onClick={() => setClientSortField("total")}
                      className={cn(
                        "p-3 text-right cursor-pointer hover:text-white transition-colors align-bottom sticky right-0 bg-[var(--card)] z-30 min-w-[130px] shadow-[-2px_0_5px_-1px_rgba(0,0,0,0.5)]",
                        clientSortField === "total" && "text-[var(--primary)]"
                      )}
                    >
                      <div className={cn("font-extrabold", clientSortField === "total" && "underline")}>Totale Complessivo</div>
                      <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5 tracking-normal">
                        {formatEur(grandTotalTurnover)}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/40 font-mono text-xs">
                  {filteredClients.map((cli) => (
                    <tr
                      key={cli.clientName}
                      onClick={() => {
                        setIsClientMatrixModalOpen(false);
                        handleOpenArticleHistory("", cli.clientName);
                      }}
                      className="hover:bg-[var(--background)]/80 transition-colors cursor-pointer group"
                    >
                      <td className="p-3 font-sans font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] sticky left-0 bg-[var(--card)] group-hover:bg-[#1a202c] z-10 shadow-[2px_0_5px_-1px_rgba(0,0,0,0.5)] truncate max-w-[280px]">
                        {cli.clientName}
                      </td>
                      {(data?.availableYears || [2026, 2025, 2024, 2023]).map((yr) => {
                        const val = cli.turnoverByYear[yr] || 0;
                        return (
                          <td key={yr} className="p-3 text-right text-[var(--muted-foreground)] min-w-[105px]">
                            {val > 0 ? formatEur(val) : "-"}
                          </td>
                        );
                      })}
                      <td className="p-3 text-right font-bold text-emerald-400 sticky right-0 bg-[var(--card)] group-hover:bg-[#1a202c] z-10 shadow-[-2px_0_5px_-1px_rgba(0,0,0,0.5)] min-w-[130px]">
                        {formatEur(cli.totalTurnover)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-[var(--border)] bg-[var(--background)]/60 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
              <span>Totale: {filteredClients.length} clienti registrati</span>
              <button
                type="button"
                onClick={() => setIsClientMatrixModalOpen(false)}
                className="px-3 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-white hover:border-[var(--primary)] text-xs font-semibold cursor-pointer"
              >
                Chiudi (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* POPUP MODALE 2: RENDIMENTO MENSILE A 12 SCHEDE (Esc support)   */}
      {/* ============================================================== */}
      {isMonthlyPerformanceModalOpen && (
        <MonthlyPerformanceModal
          isOpen={isMonthlyPerformanceModalOpen}
          onClose={() => setIsMonthlyPerformanceModalOpen(false)}
          initialYear={currentYearNum}
          availableYears={data?.availableYears}
        />
      )}

      {/* ============================================================== */}
      {/* POPUP MODALE 3: DETTAGLIO GIORNALIERO DIRETTO (Esc support)    */}
      {/* ============================================================== */}
      {selectedMonthForDailyDirect !== null && (
        <MonthDailyModal
          isOpen={selectedMonthForDailyDirect !== null}
          onClose={() => setSelectedMonthForDailyDirect(null)}
          initialMonth={selectedMonthForDailyDirect}
        />
      )}

      {/* ============================================================== */}
      {/* POPUP MODALE 4: DDT QUICK VIEW (Modal nativo di DDT List!)     */}
      {/* ============================================================== */}
      {selectedQuickDdtId && (
        <DDTQuickViewModal
          isOpen={selectedQuickDdtId !== null}
          onClose={() => setSelectedQuickDdtId(null)}
          ddtId={selectedQuickDdtId}
          onOpenInStudio={handleOpenDdtInStudio}
        />
      )}

      {/* ============================================================== */}
      {/* POPUP MODALE 5: RESOCONTO STORICO ARTICOLI (Esc support)       */}
      {/* ============================================================== */}
      {isArticleHistoryModalOpen && (
        <DDTClientArticleHistoryModal
          isOpen={isArticleHistoryModalOpen}
          onClose={() => setIsArticleHistoryModalOpen(false)}
          clientName={articleModalClient}
          articleDescription={articleModalDesc}
          initialYear={performanceYear}
          onSelectDdt={(id) => {
            setIsArticleHistoryModalOpen(false);
            setSelectedQuickDdtId(id);
          }}
        />
      )}
    </div>
  );
};

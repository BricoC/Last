import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
import { RibaModal } from "./components/RibaModal";
import {
  calculateNextRibaDeadline,
  fetchRemoteRibaStatus,
  type RibaDeadlineInfo,
} from "./services/ribaService";
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
  Check,
  ChevronDown,
  Search,
  MapPin,
  Copy,
  Landmark,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { useEscClose } from "@/shared/hooks/useEscClose";
import { matchesFragmentSearch } from "@/shared/hooks/useFragmentSearch";
import { copyMultipleDdtPdfsByIds } from "@/features/ddt-studio/utils/ddtPdfClipboard";

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
  const [monthDdtSearch, setMonthDdtSearch] = useState("");
  const [selectedQuickDdtId, setSelectedQuickDdtId] = useState<string | null>(null);

  // Modale Rendimento Mensile (12 schede) & Modale Dettaglio Giornaliero
  const [isMonthlyPerformanceModalOpen, setIsMonthlyPerformanceModalOpen] = useState(false);
  const [selectedMonthForDailyDirect, setSelectedMonthForDailyDirect] = useState<number | null>(null);

  // Rendimento Mensile integrato nel Quadrante 2
  const [performanceYear, setPerformanceYear] = useState<number>(currentYearNum);
  const [performanceCompYear, setPerformanceCompYear] = useState<number>(currentYearNum - 1);
  const [performanceReport, setPerformanceReport] = useState<MonthlyPerformanceReport | null>(null);
  const [loadingPerformance, setLoadingPerformance] = useState(false);

  // Hover popover per confronto YTD/MTD al giorno odierno su tutte le 7 metriche
  const [hoveredKpi, setHoveredKpi] = useState<"turnover" | "margin" | "markup" | "monthTurnover" | "monthMargin" | "monthMarkup" | "ddtCount" | null>(null);

  // Stato e scadenza autorizzazione Ri.Ba. Banca
  const [ribaInfo, setRibaInfo] = useState<RibaDeadlineInfo | null>(() => {
    const next = calculateNextRibaDeadline();
    return {
      ...next,
      isPaid: false,
    };
  });
  const [isRibaModalOpen, setIsRibaModalOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkRiba = async () => {
      const initial = calculateNextRibaDeadline();
      if (!mounted) return;
      try {
        const remote = await fetchRemoteRibaStatus(initial.deadlineKey);
        if (mounted) {
          setRibaInfo({
            ...initial,
            isPaid: remote?.isPaid ?? false,
            sentAt: remote?.sentAt,
          });
        }
      } catch (err) {
        console.warn("[DashboardPage] Errore verifica stato Ri.Ba da Supabase:", err);
      }
    };
    void checkRiba();
    return () => {
      mounted = false;
    };
  }, []);

  // Menù a tendina multi-selezione anni per il grafico
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

  const handleToggleYear = (yr: number) => {
    if (selectedYears.includes(yr)) {
      if (selectedYears.length > 1) {
        setSelectedYears(selectedYears.filter((y) => y !== yr));
      }
    } else {
      setSelectedYears([...selectedYears, yr].sort((a, b) => b - a));
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

  // Filtro di ricerca multi-parola per numero DDT, cliente e destinazione nella tabella "DDT del Mese"
  const filteredMonthDdts = useMemo(() => {
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
  }, [monthDdts, monthDdtSearch]);

  // Gestione navigazione con freccia dx/sx nel popup DDT del mese
  const currentQuickDdtIndex = useMemo(() => {
    if (!selectedQuickDdtId) return -1;
    return filteredMonthDdts.findIndex((d) => d.id === selectedQuickDdtId);
  }, [filteredMonthDdts, selectedQuickDdtId]);

  const hasPrevQuickDdt = currentQuickDdtIndex > 0;
  const hasNextQuickDdt =
    currentQuickDdtIndex >= 0 && currentQuickDdtIndex < filteredMonthDdts.length - 1;

  const handlePrevQuickDdt = useCallback(() => {
    if (currentQuickDdtIndex > 0) {
      setSelectedQuickDdtId(filteredMonthDdts[currentQuickDdtIndex - 1].id);
    }
  }, [currentQuickDdtIndex, filteredMonthDdts]);

  const handleNextQuickDdt = useCallback(() => {
    if (currentQuickDdtIndex >= 0 && currentQuickDdtIndex < filteredMonthDdts.length - 1) {
      setSelectedQuickDdtId(filteredMonthDdts[currentQuickDdtIndex + 1].id);
    }
  }, [currentQuickDdtIndex, filteredMonthDdts]);

  // Stato copia batch PDF DDT negli appunti
  const [isCopyingBatch, setIsCopyingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const handleCopyFilteredPdfs = async () => {
    if (filteredMonthDdts.length === 0 || isCopyingBatch) return;
    setIsCopyingBatch(true);
    setBatchProgress(null);
    try {
      const ids = filteredMonthDdts.map((d) => d.id);
      const res = await copyMultipleDdtPdfsByIds(ids, (current, total, label) => {
        setBatchProgress({ current, total, label });
      });
      if (res.count === 1) {
        showToast("PDF copiato negli appunti! Ora puoi incollarlo (Ctrl+V) nell'email.");
      } else {
        showToast(`${res.count} PDF copiati negli appunti! Ora puoi incollarli (Ctrl+V) nell'email.`);
      }
    } catch (err) {
      console.error("Errore copia PDF batch:", err);
      showToast("Errore durante la generazione o copia dei file PDF.");
    } finally {
      setIsCopyingBatch(false);
      setBatchProgress(null);
    }
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

        {/* Metriche Chiave Inline (Fatturato Annuo YTD, Margine Lordo Medio Annuo, Mese Corrente, Lordo Medio Mese, DDT Emessi) */}
        <div className="flex items-center gap-2.5 bg-[var(--card)]/90 border border-[var(--border)] px-3 py-1.5 rounded-xl shadow-xs overflow-visible">
          {/* 1. Fatturato Annuo con confronto YTD a oggi e Popover al passaggio del mouse */}
          <div
            className="relative flex items-center gap-1.5 text-xs shrink-0 cursor-help"
            onMouseEnter={() => setHoveredKpi("turnover")}
            onMouseLeave={() => setHoveredKpi(null)}
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

          {/* 2. Margine Lordo Medio Annuo YTD */}
          <div
            className="relative flex items-center gap-1.5 text-xs shrink-0 cursor-help"
            onMouseEnter={() => setHoveredKpi("margin")}
            onMouseLeave={() => setHoveredKpi(null)}
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
                            ({formatEur(item.margin)})
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
            onMouseEnter={() => setHoveredKpi("markup")}
            onMouseLeave={() => setHoveredKpi(null)}
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
                            (Costo: {formatEur(item.cost)})
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
            onMouseEnter={() => setHoveredKpi("monthTurnover")}
            onMouseLeave={() => setHoveredKpi(null)}
          >
            <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
              Mese Corrente ({MONTH_NAMES[new Date().getMonth()]}):
            </span>
            <span className="font-extrabold text-white font-mono">
              {data ? formatEur(data.kpis.ytd.currentMonthMtdTurnover) : "..."}
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
                      Mese {MONTH_NAMES[new Date().getMonth()]} al {data.kpis.ytd.cutoffDateFormatted}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-[var(--muted-foreground)]">
                    giorni 1-{data.kpis.ytd.cutoffDay}
                  </span>
                </div>

                <div className="mb-2 bg-[var(--background)]/60 rounded-lg p-2 border border-[var(--border)]/50">
                  <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">
                    Fatturato {MONTH_NAMES[new Date().getMonth()]} {currentYearNum} a oggi:
                  </div>
                  <div className="text-sm font-black text-white font-mono">
                    {formatEur(data.kpis.ytd.currentMonthMtdTurnover)}
                  </div>
                </div>

                <div className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5 px-0.5">
                  Stesso mese negli anni passati (1-{data.kpis.ytd.cutoffDay}):
                </div>

                <div className="space-y-1.5">
                  {data.kpis.ytd.historyComparisons.map((item) => {
                    const isPositive = item.mtdTurnoverDeltaPercent !== null && item.mtdTurnoverDeltaPercent >= 0;
                    return (
                      <div
                        key={item.year}
                        className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--background)]/40 border border-[var(--border)]/40 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white font-sans">Anno {item.year}:</span>
                          <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                            {formatEur(item.mtdTurnover)}
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
            onMouseEnter={() => setHoveredKpi("monthMargin")}
            onMouseLeave={() => setHoveredKpi(null)}
          >
            <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
              Lordo Medio Mese:
            </span>
            <span className="font-extrabold text-emerald-400 font-mono">
              {data?.kpis.ytd.currentMonthMtdMarginPercent !== null && data?.kpis.ytd.currentMonthMtdMarginPercent !== undefined
                ? `${data.kpis.ytd.currentMonthMtdMarginPercent.toFixed(1)}%`
                : (data?.kpis.currentMonthTurnover === 0 ? "0.0%" : "N/D")}
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
                      Margine {MONTH_NAMES[new Date().getMonth()]} al {data.kpis.ytd.cutoffDateFormatted}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-[var(--muted-foreground)]">
                    giorni 1-{data.kpis.ytd.cutoffDay}
                  </span>
                </div>

                <div className="mb-2 bg-[var(--background)]/60 rounded-lg p-2 border border-[var(--border)]/50">
                  <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">
                    Margine {MONTH_NAMES[new Date().getMonth()]} {currentYearNum} a oggi:
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
                    const isPositive = item.mtdMarginDiffPoints !== null && item.mtdMarginDiffPoints >= 0;
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
                            ({formatEur(item.mtdMargin)})
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
            onMouseEnter={() => setHoveredKpi("monthMarkup")}
            onMouseLeave={() => setHoveredKpi(null)}
          >
            <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
              Ricarico Mensile:
            </span>
            <span className="font-extrabold text-blue-400 font-mono">
              {data?.kpis.ytd.currentMonthMtdMarkupPercent !== null && data?.kpis.ytd.currentMonthMtdMarkupPercent !== undefined
                ? `${data.kpis.ytd.currentMonthMtdMarkupPercent.toFixed(1)}%`
                : (data?.kpis.currentMonthTurnover === 0 ? "0.0%" : "N/D")}
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
                      Ricarico {MONTH_NAMES[new Date().getMonth()]} al {data.kpis.ytd.cutoffDateFormatted}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-[var(--muted-foreground)]">
                    giorni 1-{data.kpis.ytd.cutoffDay}
                  </span>
                </div>

                <div className="mb-2 bg-[var(--background)]/60 rounded-lg p-2 border border-[var(--border)]/50">
                  <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">
                    Ricarico {MONTH_NAMES[new Date().getMonth()]} {currentYearNum} a oggi:
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
                    const isPositive = item.mtdMarkupDiffPoints !== null && item.mtdMarkupDiffPoints >= 0;
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
                            (Costo: {formatEur(item.mtdCost)})
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
            onMouseEnter={() => setHoveredKpi("ddtCount")}
            onMouseLeave={() => setHoveredKpi(null)}
          >
            <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
              DDT {currentYearNum} Emessi:
            </span>
            <span className="font-extrabold text-white font-mono">
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

        {/* Destra: Tasto Ri.Ba. Banca, Tasto Storico Articoli, Menù a tendina Multi-selezione Anni & Ricarica */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Pulsante Ri.Ba. Banca */}
          {ribaInfo && (
            <button
              type="button"
              onClick={() => setIsRibaModalOpen(true)}
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
              title={`Scadenza Ri.Ba: ${ribaInfo.deadlineStr} - ${ribaInfo.isPaid ? "PAGATA" : "NON PAGATA"}. Clicca per visualizzare o preparare l'email.`}
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
            onClick={() => handleOpenArticleHistory("")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--card)] hover:bg-[var(--primary)] text-slate-200 hover:text-white border border-[var(--border)] hover:border-[var(--primary)] text-xs font-bold transition-all cursor-pointer shadow-xs group"
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
                {selectedYears.length === (data?.availableYears.length || 4)
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
                    onClick={() => {
                      const all = data?.availableYears || [2026, 2025, 2024, 2023];
                      setSelectedYears(all);
                    }}
                    className="text-[var(--primary)] hover:underline font-semibold cursor-pointer"
                  >
                    Seleziona tutti
                  </button>
                </div>

                <div className="space-y-1">
                  {(data?.availableYears || [2026, 2025, 2024, 2023]).map((yr) => {
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
                            onChange={() => handleToggleYear(yr)}
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
                    Attivi: {selectedYears.length} di {(data?.availableYears || [2026, 2025, 2024, 2023]).length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedYears([currentYearNum])}
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
                onChange={(e) => {
                  const newYr = Number(e.target.value);
                  setPerformanceYear(newYr);
                  setPerformanceCompYear(newYr - 1);
                }}
                className="bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-[10px] font-bold rounded px-1.5 py-0.5 outline-none cursor-pointer hover:border-[var(--primary)]"
                title="Seleziona l'anno per il rendimento mensile"
              >
                {(data?.availableYears || [2026, 2025, 2024, 2023]).map((yr) => (
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
                  onChange={(e) => setPerformanceCompYear(Number(e.target.value))}
                  className="bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-[10px] font-bold rounded px-1.5 py-0.5 outline-none cursor-pointer hover:border-[var(--primary)]"
                  title="Seleziona l'anno con cui confrontare le percentuali"
                >
                  {(
                    performanceReport?.availableComparisonYears ||
                    (data?.availableYears || [2026, 2025, 2024, 2023]).filter((y) => y !== performanceYear)
                  ).map((yr) => (
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
                      ? `Anno ${performanceCompYear}: ${formatEur(comp.turnoverAtCutoff)} di ${formatEur(comp.fullMonthTurnover)}`
                      : `Anno ${performanceCompYear}: ${formatEur(comp.fullMonthTurnover)}`;

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
                        {(() => {
                          const compTotals = performanceReport.totalsByComparisonYear?.[performanceCompYear];
                          const totDeltaVal = compTotals?.totDeltaPercent ?? perfTotals.totDelta;
                          const totTooltip = compTotals
                            ? `Anno ${performanceCompYear}: ${formatEur(compTotals.totTurnoverSamePeriod)} di ${formatEur(compTotals.totTurnoverFullYear)}`
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
                {filteredClients.map((cli) => (
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
          {/* Header Quadrante 4 con selettore mese e ricerca */}
          <div className="flex items-center justify-between shrink-0 mb-2 gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider shrink-0">
                DDT del Mese
              </span>
              <select
                value={selectedMonthForDdts}
                onChange={(e) => void handleSelectMonthForDdts(Number(e.target.value))}
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
                  onChange={(e) => setMonthDdtSearch(e.target.value)}
                  placeholder="Cerca N°, cliente o destinazione..."
                  className="w-full bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-[10px] rounded pl-6 pr-5 py-0.5 outline-none focus:border-[var(--primary)] transition-colors placeholder:text-[var(--muted-foreground)]/60"
                />
                {monthDdtSearch && (
                  <button
                    type="button"
                    onClick={() => setMonthDdtSearch("")}
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
                onClick={() => void handleCopyFilteredPdfs()}
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
                    <span>{batchProgress ? `${batchProgress.current}/${batchProgress.total}` : "Copia…"}</span>
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
                ? `${filteredMonthDdts.length} / ${monthDdts.length} DDT`
                : `${monthDdts.length} DDT`}
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
                    onClick={() => setSelectedQuickDdtId(doc.id)}
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
                      <span className="text-xs font-semibold truncate text-[var(--foreground)] group-hover:text-white shrink-0 max-w-[190px]" title={doc.clientName}>
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
            ) : monthDdtSearch.trim() ? (
              <div className="h-full flex flex-col items-center justify-center text-xs text-[var(--muted-foreground)] p-4 text-center">
                <span>Nessun DDT trovato per &quot;{monthDdtSearch}&quot;.</span>
                <button
                  type="button"
                  onClick={() => setMonthDdtSearch("")}
                  className="text-[11px] text-[var(--primary)] underline mt-1.5 cursor-pointer hover:text-white"
                >
                  Azzera filtro di ricerca
                </button>
              </div>
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
          onNavigatePrev={handlePrevQuickDdt}
          onNavigateNext={handleNextQuickDdt}
          hasPrev={hasPrevQuickDdt}
          hasNext={hasNextQuickDdt}
          currentIndex={currentQuickDdtIndex}
          totalCount={filteredMonthDdts.length}
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

      {/* ============================================================== */}
      {/* POPUP MODALE 6: AUTORIZZAZIONE RI.BA. BANCA                    */}
      {/* ============================================================== */}
      <RibaModal
        isOpen={isRibaModalOpen}
        onClose={() => setIsRibaModalOpen(false)}
        ribaInfo={ribaInfo}
        onStatusUpdated={(updated) => {
          setRibaInfo((prev) => (prev ? { ...prev, ...updated } : prev));
        }}
      />

      {/* Toast notifica per copia PDF o altre azioni */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-sky-400 text-white px-4 py-2.5 rounded-lg shadow-2xl text-xs font-semibold z-50 flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

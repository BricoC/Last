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
import { DayDdtListModal } from "./components/DayDdtListModal";
import { RibaModal } from "./components/RibaModal";
import { DashboardFirstSetupWidget } from "./components/DashboardFirstSetupWidget";
import { DashboardKpiBar } from "./components/DashboardKpiBar";
import { DashboardHeaderActions } from "./components/DashboardHeaderActions";
import { DashboardMultiYearChart } from "./components/DashboardMultiYearChart";
import { DashboardMonthlyPerformanceCard } from "./components/DashboardMonthlyPerformanceCard";
import { DashboardClientMatrixCard } from "./components/DashboardClientMatrixCard";
import { DashboardClientMatrixModal } from "./components/DashboardClientMatrixModal";
import { DashboardMonthDdtsCard } from "./components/DashboardMonthDdtsCard";
import {
  calculateNextRibaDeadline,
  fetchRemoteRibaStatus,
  getLocalRibaStatus,
  getSqliteRibaStatus,
  saveLocalRibaPaid,
  saveSqliteRibaPaid,
  saveRemoteRibaPaid,
  type RibaDeadlineInfo,
} from "./services/ribaService";
import {
  computeChartTicks,
  computeClientYearTotals,
  computeGrandTotalTurnover,
  computeMaxChartValue,
  computePerformanceTotals,
  DashboardChartMetric,
  DashboardKpiHoverKey,
  DEFAULT_DASHBOARD_YEARS,
  detectStreetFighterCombo,
  filterAndSortClientMatrix,
  filterMonthDdts,
} from "./utils/dashboardViewUtils";
import { SUPABASE_SESSION_UPDATED } from "@/shared/services/supabaseSession";
import { cn } from "@/shared/utils/cn";
import { useEscClose } from "@/shared/hooks/useEscClose";
import { copyMultipleDdtPdfsByIds } from "@/features/ddt-studio/utils/ddtPdfClipboard";
import { useEasterEggStore } from "@/shared/easter-eggs/useEasterEggStore";
import { NedryLockOverlay } from "@/shared/easter-eggs/NedryLockOverlay";

export const DashboardPage: React.FC = () => {
  const { openWindow } = useWindowStore();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState<DashboardChartMetric>("turnover");
  const [selectedYears, setSelectedYears] = useState<number[]>(DEFAULT_DASHBOARD_YEARS);
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

  // Hover popover per confronto YTD/MTD al giorno odierno su tutte le metriche
  const [hoveredKpi, setHoveredKpi] = useState<DashboardKpiHoverKey | null>(null);

  // Stato e scadenza autorizzazione Ri.Ba. Banca
  const [ribaInfo, setRibaInfo] = useState<RibaDeadlineInfo | null>(() => {
    const next = calculateNextRibaDeadline();
    const local = getLocalRibaStatus(next.deadlineKey);
    return {
      ...next,
      isPaid: local?.isPaid ?? false,
      sentAt: local?.sentAt,
    };
  });
  const [isRibaModalOpen, setIsRibaModalOpen] = useState(false);
  const [isMonthDdtListModalOpen, setIsMonthDdtListModalOpen] = useState(false);

  // Easter Egg Box & Dennis Nedry Pop-up
  const { playIllidanCinematic, triggerStreetFighter } = useEasterEggStore();
  const [secretBoxClicks, setSecretBoxClicks] = useState(0);
  const [secretPassword, setSecretPassword] = useState("");
  const [secretInputShake, setSecretInputShake] = useState(false);
  const [secretFailedAttempts, setSecretFailedAttempts] = useState(0);
  const [showNedryModal, setShowNedryModal] = useState(false);
  const secretInputRef = useRef<HTMLInputElement>(null);
  const secretClickResetTimer = useRef<NodeJS.Timeout | null>(null);

  // Street Fighter Easter Egg Combo Tracking (Hadouken & Shoryuken)
  const sfKeyHistoryRef = useRef<string[]>([]);
  const lastSfKeyTimeRef = useRef<number>(0);

  const handleSecretBoxClick = () => {
    if (secretClickResetTimer.current) {
      clearTimeout(secretClickResetTimer.current);
    }

    const nextClicks = secretBoxClicks + 1;
    setSecretBoxClicks(nextClicks);

    if (nextClicks >= 15) {
      setTimeout(() => {
        secretInputRef.current?.focus();
      }, 100);
    } else {
      secretClickResetTimer.current = setTimeout(() => {
        setSecretBoxClicks(0);
      }, 400);
    }
  };

  const handleSecretKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setSecretBoxClicks(0);
      setSecretPassword("");
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const clean = secretPassword.trim().toLowerCase();
      if (clean === "you are not prepared") {
        setSecretBoxClicks(0);
        setSecretPassword("");
        setSecretFailedAttempts(0);
        playIllidanCinematic();
      } else {
        setSecretInputShake(true);
        setSecretPassword("");
        const nextFails = secretFailedAttempts + 1;
        setSecretFailedAttempts(nextFails);
        setTimeout(() => setSecretInputShake(false), 400);

        if (nextFails >= 3) {
          setShowNedryModal(true);
          setSecretBoxClicks(0);
          setSecretFailedAttempts(0);
        }
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    const checkRiba = async () => {
      const initial = calculateNextRibaDeadline();
      if (!mounted) return;
      const { resolveActiveSupabaseProjectUrl } = await import("@/shared/services/supabaseConfigCache");
      const activeProjectUrl = await resolveActiveSupabaseProjectUrl();
      if (!mounted) return;
      const localLs = getLocalRibaStatus(initial.deadlineKey, activeProjectUrl);
      const localDb = await getSqliteRibaStatus(initial.deadlineKey, activeProjectUrl);
      const local = localDb?.isPaid ? localDb : localLs;
      if (mounted && local?.isPaid) {
        setRibaInfo({
          ...initial,
          isPaid: true,
          sentAt: local.sentAt,
        });
      }
      try {
        const remote = await fetchRemoteRibaStatus(initial.deadlineKey);
        if (!mounted) return;
        if (remote?.isPaid) {
          const sentAt = remote.sentAt || local?.sentAt || new Date().toISOString();
          saveLocalRibaPaid(initial.deadlineKey, initial.deadlineStr, sentAt, activeProjectUrl);
          await saveSqliteRibaPaid(initial.deadlineKey, initial.deadlineStr, sentAt, activeProjectUrl);
          setRibaInfo({
            ...initial,
            isPaid: true,
            sentAt,
            remoteSynced: true,
          });
        } else if (local?.isPaid) {
          const sentAt = local.sentAt || new Date().toISOString();
          saveLocalRibaPaid(initial.deadlineKey, initial.deadlineStr, sentAt, activeProjectUrl);
          await saveSqliteRibaPaid(initial.deadlineKey, initial.deadlineStr, sentAt, activeProjectUrl);
          setRibaInfo({
            ...initial,
            isPaid: true,
            sentAt,
            remoteSynced: false,
          });
          void saveRemoteRibaPaid(initial.deadlineKey, initial.deadlineStr, sentAt).then((synced) => {
            if (mounted && synced) {
              setRibaInfo((prev) => (prev ? { ...prev, remoteSynced: true } : prev));
            }
          });
        } else {
          setRibaInfo({
            ...initial,
            isPaid: false,
          });
        }
      } catch (err) {
        console.warn("[DashboardPage] Errore verifica stato Ri.Ba da Supabase:", err);
      }
    };
    void checkRiba();
    const onSessionUpdated = () => void checkRiba();
    window.addEventListener(SUPABASE_SESSION_UPDATED, onSessionUpdated);
    window.addEventListener("online", onSessionUpdated);
    return () => {
      mounted = false;
      window.removeEventListener(SUPABASE_SESSION_UPDATED, onSessionUpdated);
      window.removeEventListener("online", onSessionUpdated);
    };
  }, []);

  // Chiusura con tasto ESC per la matrice clienti a tutto schermo
  useEscClose(isClientMatrixModalOpen, () => setIsClientMatrixModalOpen(false));

  const selectedMonthForDdtsRef = useRef<number>(currentMonthNum);
  useEffect(() => {
    selectedMonthForDdtsRef.current = selectedMonthForDdts;
  }, [selectedMonthForDdts]);

  const loadPerformanceReport = useCallback(async (yr: number, silent = false) => {
    if (!silent) {
      setLoadingPerformance(true);
    }
    try {
      const rep = await dashboardService.getMonthlyPerformanceReport(yr);
      setPerformanceReport(rep);
    } catch (err) {
      console.error("Errore caricamento report rendimento mensile:", err);
    } finally {
      if (!silent) {
        setLoadingPerformance(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPerformanceReport(performanceYear);
  }, [performanceYear, loadPerformanceReport]);

  const perfTotals = useMemo(
    () => computePerformanceTotals(performanceReport),
    [performanceReport]
  );

  const loadData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const res = await dashboardService.getDashboardData();
      setData(res);

      const activeMonth = silent ? selectedMonthForDdtsRef.current : currentMonthNum;
      const ddtForMonth = await dashboardService.getDdtsForMonth(currentYearNum, activeMonth);
      if (ddtForMonth.length > 0 || silent) {
        setMonthDdts(ddtForMonth);
        if (!silent) setSelectedMonthForDdts(activeMonth);
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
      if (!silent) {
        setLoading(false);
      }
    }
  }, [currentMonthNum, currentYearNum]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Aggiornamento reattivo silenzioso su sincronizzazioni reali
  useEffect(() => {
    const handleSync = () => {
      void loadData(true);
      void loadPerformanceReport(performanceYear, true);
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

  const filteredMonthDdts = useMemo(
    () => filterMonthDdts(monthDdts, monthDdtSearch),
    [monthDdts, monthDdtSearch]
  );

  // Gestione Combo Easter Egg Street Fighter (Hadouken e Shoryuken) nella barra di ricerca DDT del Mese
  const handleMonthDdtKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = performance.now();
    if (now - lastSfKeyTimeRef.current > 4000) {
      sfKeyHistoryRef.current = [];
    }
    lastSfKeyTimeRef.current = now;

    if (e.key === "Backspace") {
      sfKeyHistoryRef.current.pop();
    }

    const key = e.key;
    if (
      ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(key) ||
      key.length === 1 ||
      key === "Enter"
    ) {
      const normKey = key.length === 1 ? key.toLowerCase() : key;
      sfKeyHistoryRef.current.push(normKey);
      if (sfKeyHistoryRef.current.length > 16) {
        sfKeyHistoryRef.current.shift();
      }
    }

    if (e.key === "Enter") {
      const combo = detectStreetFighterCombo(sfKeyHistoryRef.current);
      if (combo) {
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent?.stopImmediatePropagation?.();
        setMonthDdtSearch("");
        sfKeyHistoryRef.current = [];
        triggerStreetFighter(combo);
      }
    }
  };

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

  const maxChartValue = useMemo(
    () => computeMaxChartValue(data, selectedYears, chartMetric),
    [data, selectedYears, chartMetric]
  );

  const chartTicks = useMemo(
    () => computeChartTicks(maxChartValue, chartMetric),
    [maxChartValue, chartMetric]
  );

  const filteredClients = useMemo(
    () => filterAndSortClientMatrix(data?.clientMatrix, clientSearch, clientSortField),
    [data, clientSearch, clientSortField]
  );

  const clientYearTotals = useMemo(() => computeClientYearTotals(data), [data]);

  const grandTotalTurnover = useMemo(() => computeGrandTotalTurnover(data), [data]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] p-3 gap-2.5 select-none font-sans">
      {/* 1. Oscuramento progressivo da 6 a 14 click */}
      {secretBoxClicks >= 6 && secretBoxClicks < 15 && (
        <div
          className="fixed inset-0 z-40 bg-black pointer-events-none"
          style={{ opacity: (secretBoxClicks - 5) / 10 }}
        />
      )}

      {/* 2. Oscuramento totale al 15° click con SOLO la textbox minimale al centro */}
      {secretBoxClicks >= 15 && (
        <div
          onClick={() => secretInputRef.current?.focus()}
          className="fixed inset-0 z-50 bg-black flex items-center justify-center cursor-default select-none animate-in fade-in duration-200"
        >
          <input
            ref={secretInputRef}
            type="text"
            value={secretPassword}
            onChange={(e) => setSecretPassword(e.target.value)}
            onKeyDown={handleSecretKeyDown}
            className={cn(
              "w-72 sm:w-96 text-center text-lg font-mono bg-transparent text-emerald-300 border-b-2 border-zinc-800 focus:border-emerald-500 focus:outline-hidden py-2 px-4 tracking-widest transition-all",
              secretInputShake && "border-red-500 text-red-400 animate-shake"
            )}
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      )}

      {/* 3. Pop-up Dennis Nedry se bloccato o dopo 3 tentativi errati */}
      <NedryLockOverlay isOpen={showNedryModal} onClose={() => setShowNedryModal(false)} />

      {/* 0. Banner / Widget Setup Rapido Primo Avvio (Compare solo se mancano dati o al primo avvio) */}
      <DashboardFirstSetupWidget onSetupCompleted={() => void loadData()} />

      {/* 1. Header Toolbar Dashboard con Metriche Chiave Inline e Tasti su singola riga */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] pb-2 gap-2 flex-wrap min-w-0">
        <DashboardKpiBar
          data={data}
          currentYearNum={currentYearNum}
          hoveredKpi={hoveredKpi}
          onHoverKpi={setHoveredKpi}
        />

        {/* Box vuoto anonimo e staccato per Easter Egg */}
        <div
          onClick={handleSecretBoxClick}
          className="w-7 h-7 rounded-lg bg-[var(--card)]/40 hover:bg-[var(--card)]/80 border border-[var(--border)]/30 hover:border-slate-500/40 hover:shadow-xs transition-colors duration-200 select-none cursor-pointer shrink-0"
        />

        <DashboardHeaderActions
          currentYearNum={currentYearNum}
          availableYears={data?.availableYears}
          selectedYears={selectedYears}
          onToggleYear={handleToggleYear}
          onSelectYears={setSelectedYears}
          ribaInfo={ribaInfo}
          onOpenRibaModal={() => setIsRibaModalOpen(true)}
          onOpenArticleHistory={() => handleOpenArticleHistory("")}
          loading={loading}
          onReload={() => void loadData()}
        />
      </header>

      {/* 2. Griglia Principale a 4 Quadranti (Flex-1, 100% altezza, Zero Scroll di pagina) */}
      <main className="flex-1 min-h-0 grid grid-cols-12 gap-2.5 overflow-hidden">
        <DashboardMultiYearChart
          data={data}
          selectedYears={selectedYears}
          chartMetric={chartMetric}
          onChangeMetric={setChartMetric}
          hoveredMonth={hoveredMonth}
          onHoverMonth={setHoveredMonth}
          chartTicks={chartTicks}
          onSelectMonthDaily={setSelectedMonthForDailyDirect}
        />

        <DashboardMonthlyPerformanceCard
          availableYears={data?.availableYears}
          currentYearNum={currentYearNum}
          currentMonthNum={currentMonthNum}
          performanceYear={performanceYear}
          onChangePerformanceYear={setPerformanceYear}
          performanceCompYear={performanceCompYear}
          onChangePerformanceCompYear={setPerformanceCompYear}
          performanceReport={performanceReport}
          perfTotals={perfTotals}
          loadingPerformance={loadingPerformance}
          onExpandModal={() => setIsMonthlyPerformanceModalOpen(true)}
          onSelectMonthDaily={setSelectedMonthForDailyDirect}
        />

        <DashboardClientMatrixCard
          availableYears={data?.availableYears}
          filteredClients={filteredClients}
          clientSearch={clientSearch}
          onChangeClientSearch={setClientSearch}
          clientSortField={clientSortField}
          onChangeClientSortField={setClientSortField}
          clientYearTotals={clientYearTotals}
          grandTotalTurnover={grandTotalTurnover}
          onExpandModal={() => setIsClientMatrixModalOpen(true)}
          onSelectClient={(clientName) => handleOpenArticleHistory("", clientName)}
        />

        <DashboardMonthDdtsCard
          currentYearNum={currentYearNum}
          selectedMonthForDdts={selectedMonthForDdts}
          onSelectMonthForDdts={(m) => void handleSelectMonthForDdts(m)}
          monthDdtsCount={monthDdts.length}
          filteredMonthDdts={filteredMonthDdts}
          monthDdtSearch={monthDdtSearch}
          onChangeMonthDdtSearch={setMonthDdtSearch}
          onMonthDdtKeyDown={handleMonthDdtKeyDown}
          isCopyingBatch={isCopyingBatch}
          batchProgress={batchProgress}
          onCopyFilteredPdfs={() => void handleCopyFilteredPdfs()}
          selectedQuickDdtId={selectedQuickDdtId}
          onSelectQuickDdtId={setSelectedQuickDdtId}
          onOpenMonthListModal={() => setIsMonthDdtListModalOpen(true)}
        />
      </main>

      {/* POPUP MODALE 1: MATRICE CLIENTI COMPLETA (Esc support) */}
      {isClientMatrixModalOpen && (
        <DashboardClientMatrixModal
          availableYears={data?.availableYears}
          filteredClients={filteredClients}
          clientSearch={clientSearch}
          onChangeClientSearch={setClientSearch}
          clientSortField={clientSortField}
          onChangeClientSortField={setClientSortField}
          clientYearTotals={clientYearTotals}
          grandTotalTurnover={grandTotalTurnover}
          onClose={() => setIsClientMatrixModalOpen(false)}
          onSelectClient={(clientName) => {
            setIsClientMatrixModalOpen(false);
            handleOpenArticleHistory("", clientName);
          }}
        />
      )}

      {/* POPUP MODALE 2: RENDIMENTO MENSILE A 12 SCHEDE (Esc support) */}
      {isMonthlyPerformanceModalOpen && (
        <MonthlyPerformanceModal
          isOpen={isMonthlyPerformanceModalOpen}
          onClose={() => setIsMonthlyPerformanceModalOpen(false)}
          initialYear={currentYearNum}
          availableYears={data?.availableYears}
        />
      )}

      {/* POPUP MODALE 3: DETTAGLIO GIORNALIERO DIRETTO (Esc support) */}
      {selectedMonthForDailyDirect !== null && (
        <MonthDailyModal
          isOpen={selectedMonthForDailyDirect !== null}
          onClose={() => setSelectedMonthForDailyDirect(null)}
          initialMonth={selectedMonthForDailyDirect}
        />
      )}

      {isMonthDdtListModalOpen && (
        <DayDdtListModal
          isOpen={isMonthDdtListModalOpen}
          onClose={() => setIsMonthDdtListModalOpen(false)}
          day={null}
          month={selectedMonthForDdts}
          initialYear={currentYearNum}
          availableYears={data?.availableYears}
        />
      )}

      {/* POPUP MODALE 4: DDT QUICK VIEW (Modal nativo di DDT List!) */}
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

      {/* POPUP MODALE 5: RESOCONTO STORICO ARTICOLI (Esc support) */}
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

      {/* POPUP MODALE 6: AUTORIZZAZIONE RI.BA. BANCA */}
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

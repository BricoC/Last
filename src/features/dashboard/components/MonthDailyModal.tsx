import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  dashboardService,
  MonthDailyBreakdown,
} from "../services/dashboardService";
import {
  Calendar,
  X,
  TrendingUp,
  Award,
  FileText,
} from "lucide-react";
import { DayDdtListModal } from "./DayDdtListModal";
import { cn } from "@/shared/utils/cn";
import { useEscClose } from "@/shared/hooks/useEscClose";

export interface MonthDailyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMonth: number;
}

const MONTH_NAMES = [
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

function formatEur(amount: number): string {
  return `€ ${Math.round(amount).toLocaleString("it-IT")}`;
}

export const MonthDailyModal: React.FC<MonthDailyModalProps> = ({
  isOpen,
  onClose,
  initialMonth,
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth || 1);
  const [breakdown, setBreakdown] = useState<MonthDailyBreakdown | null>(null);
  const [selectedYears, setSelectedYears] = useState<number[]>([2026, 2025, 2024, 2023]);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Popup Lista DDT del Giorno Selezionato
  const [selectedDayForList, setSelectedDayForList] = useState<{ day: number; year?: number | null } | null>(null);

  // Chiusura in cascata con tasto Escape (LIFO stack)
  useEscClose(isOpen, onClose);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardService.getMonthDailyBreakdown(selectedMonth);
      setBreakdown(res);
    } catch (err) {
      console.error("Errore caricamento dettaglio giornaliero:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (isOpen) {
      void loadData();
    }
  }, [isOpen, loadData]);

  const toggleYear = (yr: number) => {
    setSelectedYears((prev) => {
      if (prev.includes(yr)) {
        if (prev.length === 1) return prev;
        return prev.filter((y) => y !== yr);
      }
      return [...prev, yr].sort((a, b) => b - a);
    });
  };

  // Calcolo valori massimi per i due grafici
  const { maxDailyTurnover, maxCumulativeTurnover } = useMemo(() => {
    if (!breakdown) return { maxDailyTurnover: 1000, maxCumulativeTurnover: 10000 };
    let maxD = 0;
    let maxC = 0;
    for (const yr of selectedYears) {
      const list = breakdown.dailyByYear[yr] || [];
      for (const item of list) {
        if (item.turnover > maxD) maxD = item.turnover;
        if (item.cumulative > maxC) maxC = item.cumulative;
      }
    }
    return {
      maxDailyTurnover: maxD > 0 ? maxD * 1.15 : 1000,
      maxCumulativeTurnover: maxC > 0 ? maxC * 1.1 : 10000,
    };
  }, [breakdown, selectedYears]);

  // Genera 4 tick per l'asse Y
  const dailyTicks = useMemo(() => {
    const step = maxDailyTurnover / 4;
    return [maxDailyTurnover, step * 3, step * 2, step, 0];
  }, [maxDailyTurnover]);

  const cumulativeTicks = useMemo(() => {
    const step = maxCumulativeTurnover / 4;
    return [maxCumulativeTurnover, step * 3, step * 2, step, 0];
  }, [maxCumulativeTurnover]);

  if (!isOpen) return null;

  const daysCount = breakdown?.daysInMonth || 31;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-3 backdrop-blur-xs select-none font-sans"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-6xl h-[94vh] rounded-2xl border border-[var(--border)] bg-[var(--card)] flex flex-col overflow-hidden shadow-2xl">
        {/* Header Modal */}
        <div className="px-5 py-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold tracking-tight text-white uppercase">
                  Dettaglio Giornaliero - {MONTH_NAMES[selectedMonth - 1]}
                </h2>
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  (Confronto Pluriennale)
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Andamento giornaliero singolo vs Totale cumulativo progressivo dal giorno 1 al {daysCount}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Selettore Mese Rapido */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-[var(--card)] border border-[var(--border)] text-white font-bold text-xs rounded-lg px-2.5 py-1 outline-none cursor-pointer"
            >
              {MONTH_NAMES.map((m, idx) => (
                <option key={m} value={idx + 1} className="bg-slate-900 text-white">
                  {m}
                </option>
              ))}
            </select>

            {/* Pill Anni */}
            <div className="flex items-center gap-1 bg-[var(--card)] p-0.5 rounded-lg border border-[var(--border)]">
              {(breakdown?.availableYears || [2026, 2025, 2024, 2023]).map((yr) => {
                const isSelected = selectedYears.includes(yr);
                const style = getYearStyle(yr);
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => toggleYear(yr)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer",
                      isSelected
                        ? "bg-[var(--background)] text-white shadow-xs border border-[var(--border)]"
                        : "text-[var(--muted-foreground)] opacity-50"
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full", style.bg)} />
                    <span>{yr}</span>
                  </button>
                );
              })}
            </div>

            {/* Chiudi */}
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

        {/* Barra KPI Totali per Anno del Mese Selezionato */}
        {breakdown && (
          <div className="grid grid-cols-4 gap-2.5 px-5 py-2 bg-[var(--background)]/50 border-b border-[var(--border)] shrink-0">
            {selectedYears.map((yr) => {
              const info = breakdown.totalsByYear[yr];
              const style = getYearStyle(yr);
              return (
                <div
                  key={yr}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <span className={cn("text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1", style.text)}>
                      <span className={cn("w-2 h-2 rounded-full", style.bg)} />
                      Anno {yr}
                    </span>
                    <div className="text-sm font-black text-white font-mono">
                      {info ? formatEur(info.totalTurnover) : "€ 0"}
                    </div>
                    <div className="text-[10px] text-[var(--muted-foreground)] font-mono">
                      {info?.totalDdtCount || 0} DDT emessi
                    </div>
                  </div>
                  {info && info.bestDay.turnover > 0 && (
                    <div className="text-right">
                      <span className="text-[9px] text-[var(--muted-foreground)] uppercase flex items-center justify-end gap-0.5">
                        <Award className="w-2.5 h-2.5 text-amber-400" />
                        Miglior Giorno
                      </span>
                      <div className="text-xs font-bold text-amber-300 font-mono">
                        Gg {info.bestDay.day}
                      </div>
                      <div className="text-[10px] text-[var(--muted-foreground)] font-mono">
                        {formatEur(info.bestDay.turnover)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Dettaglio Giorno in Hover */}
        <div className="h-6 flex items-center justify-between px-5 bg-[var(--background)]/70 border-b border-[var(--border)]/60 text-[11px] shrink-0">
          {hoveredDay && breakdown ? (
            <div className="flex items-center gap-4 w-full">
              <span className="font-extrabold text-[var(--primary)] uppercase shrink-0">
                Giorno {hoveredDay} {MONTH_NAMES[selectedMonth - 1]}:
              </span>
              <div className="flex items-center gap-4 overflow-x-auto no-scrollbar font-mono text-[11px] flex-1">
                {selectedYears.map((yr) => {
                  const dayData = breakdown.dailyByYear[yr]?.[hoveredDay - 1];
                  const style = getYearStyle(yr);
                  return (
                    <span key={yr} className="flex items-center gap-1.5 shrink-0">
                      <span className={cn("w-1.5 h-1.5 rounded-full", style.bg)} />
                      <span className={cn("font-bold", style.text)}>{yr}:</span>
                      <span className="text-white font-semibold">
                        {dayData ? formatEur(dayData.turnover) : "€ 0"}
                      </span>
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        (Cumulativo: {dayData ? formatEur(dayData.cumulative) : "€ 0"})
                      </span>
                    </span>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setSelectedDayForList({ day: hoveredDay, year: currentYear })}
                className="flex items-center gap-1 text-[10px] font-bold text-[var(--primary)] bg-[var(--primary)]/15 border border-[var(--primary)]/30 rounded px-2 py-0.5 hover:bg-[var(--primary)]/25 transition-colors cursor-pointer shrink-0"
                title={`Vedi l'elenco dei DDT emessi il giorno ${hoveredDay}`}
              >
                <FileText className="w-3 h-3" />
                <span>Vedi DDT ({hoveredDay}) ↗</span>
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-[var(--muted-foreground)] italic flex items-center justify-between w-full">
              <span>Passa il mouse sulle colonne per vedere l&apos;incasso giornaliero e cumulativo di ciascun anno.</span>
              <span className="text-[9px] text-[var(--primary)] font-semibold not-italic">Clicca su una colonna/barra per aprire la lista dei DDT ↗</span>
            </span>
          )}
        </div>

        {/* Area dei 2 Grafici Separati (100% Flex, Zero Confusion) */}
        {loading ? (
          <div className="flex-1 min-h-0 flex items-center justify-center text-xs text-[var(--muted-foreground)]">
            Caricamento analisi giornaliera...
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-2 p-3 overflow-hidden">
          {/* ========================================================== */}
          {/* GRAFICO 1: FATTURATO GIORNALIERO (€ per giorno 1..31)     */}
          {/* ========================================================== */}
          <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--background)]/40 p-2.5 overflow-hidden">
            <div className="flex items-center justify-between shrink-0 mb-1">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                1. Incasso Giornaliero per Singolo Giorno
              </span>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                (Importo fatturato giorno per giorno)
              </span>
            </div>

            {/* Container con asse Y + Griglia + Barre */}
            <div className="flex-1 min-h-0 flex relative pt-1">
              {/* Asse Y Sinistra */}
              <div className="w-16 shrink-0 flex flex-col justify-between text-right pr-2 text-[9px] font-mono text-[var(--muted-foreground)] pb-4 select-none">
                {dailyTicks.map((t, idx) => (
                  <span key={idx}>{formatEur(t)}</span>
                ))}
              </div>

              {/* Area Grafico con linee guida orizzontali */}
              <div className="flex-1 min-h-0 flex flex-col relative">
                {/* Linee guida orizzontali */}
                <div className="absolute inset-0 pb-4 flex flex-col justify-between pointer-events-none">
                  {dailyTicks.map((_, idx) => (
                    <div key={idx} className="w-full border-b border-[var(--border)]/30 border-dashed" />
                  ))}
                </div>

                {/* Colonne Giorni */}
                <div className="flex-1 flex items-end gap-1 border-b border-[var(--border)] pb-0.5 z-10">
                  {Array.from({ length: daysCount }, (_, i) => i + 1).map((d) => {
                    const isHovered = hoveredDay === d;
                    return (
                      <div
                        key={d}
                        onMouseEnter={() => setHoveredDay(d)}
                        onMouseLeave={() => setHoveredDay(null)}
                        onClick={() => setSelectedDayForList({ day: d, year: currentYear })}
                        className={cn(
                          "flex-1 h-full flex items-end justify-center gap-0.5 rounded-t transition-colors cursor-pointer group/bar relative",
                          isHovered ? "bg-[var(--card)]/80" : "hover:bg-[var(--card)]/40"
                        )}
                        title={`Giorno ${d} ${MONTH_NAMES[selectedMonth - 1]} - Clicca per vedere i DDT emessi`}
                      >
                        {selectedYears.map((yr) => {
                          const item = breakdown?.dailyByYear[yr]?.[d - 1];
                          const val = item ? item.turnover : 0;
                          const heightPct = Math.max(0, Math.min(100, (val / maxDailyTurnover) * 100));
                          const style = getYearStyle(yr);
                          return (
                            <div
                              key={yr}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDayForList({ day: d, year: yr });
                              }}
                              style={{ height: `${heightPct}%` }}
                              className={cn(
                                "flex-1 max-w-[6px] rounded-t-xs transition-all duration-200 cursor-pointer",
                                style.bg,
                                isHovered ? "brightness-125 ring-1 ring-white/60" : "opacity-85"
                              )}
                              title={`Anno ${yr}: ${formatEur(val)} - Clicca per vedere i DDT del giorno`}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* Etichette giorni X-axis */}
                <div className="flex items-center justify-between text-[8.5px] font-mono text-[var(--muted-foreground)] pt-0.5 shrink-0">
                  {Array.from({ length: daysCount }, (_, i) => i + 1).map((d) => (
                    <span
                      key={d}
                      onClick={() => setSelectedDayForList({ day: d, year: currentYear })}
                      className={cn(
                        "flex-1 text-center transition-colors cursor-pointer hover:text-[var(--primary)] hover:font-bold",
                        hoveredDay === d && "text-[var(--primary)] font-bold scale-110"
                      )}
                      title={`Vedi DDT del ${d} ${MONTH_NAMES[selectedMonth - 1]}`}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================== */}
          {/* GRAFICO 2: FATTURATO PROGRESSIVO CUMULATIVO (€ 1..31)      */}
          {/* ========================================================== */}
          <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--background)]/40 p-2.5 overflow-hidden">
            <div className="flex items-center justify-between shrink-0 mb-1">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                2. Totale Progressivo Cumulativo
              </span>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                (Crescita dell&apos;incasso mese giorno dopo giorno)
              </span>
            </div>

            {/* Container con asse Y + Griglia + Barre Cumulative */}
            <div className="flex-1 min-h-0 flex relative pt-1">
              {/* Asse Y Sinistra */}
              <div className="w-16 shrink-0 flex flex-col justify-between text-right pr-2 text-[9px] font-mono text-[var(--muted-foreground)] pb-4 select-none">
                {cumulativeTicks.map((t, idx) => (
                  <span key={idx}>{formatEur(t)}</span>
                ))}
              </div>

              {/* Area Grafico con linee guida orizzontali */}
              <div className="flex-1 min-h-0 flex flex-col relative">
                {/* Linee guida orizzontali */}
                <div className="absolute inset-0 pb-4 flex flex-col justify-between pointer-events-none">
                  {cumulativeTicks.map((_, idx) => (
                    <div key={idx} className="w-full border-b border-[var(--border)]/30 border-dashed" />
                  ))}
                </div>

                {/* Colonne Giorni Cumulative */}
                <div className="flex-1 flex items-end gap-1 border-b border-[var(--border)] pb-0.5 z-10">
                  {Array.from({ length: daysCount }, (_, i) => i + 1).map((d) => {
                    const isHovered = hoveredDay === d;
                    return (
                      <div
                        key={d}
                        onMouseEnter={() => setHoveredDay(d)}
                        onMouseLeave={() => setHoveredDay(null)}
                        onClick={() => setSelectedDayForList({ day: d, year: currentYear })}
                        className={cn(
                          "flex-1 h-full flex items-end justify-center gap-0.5 rounded-t transition-colors cursor-pointer group/bar relative",
                          isHovered ? "bg-[var(--card)]/80" : "hover:bg-[var(--card)]/40"
                        )}
                        title={`Giorno ${d} ${MONTH_NAMES[selectedMonth - 1]} - Clicca per vedere i DDT emessi`}
                      >
                        {selectedYears.map((yr) => {
                          const item = breakdown?.dailyByYear[yr]?.[d - 1];
                          const val = item ? item.cumulative : 0;
                          const heightPct = Math.max(0, Math.min(100, (val / maxCumulativeTurnover) * 100));
                          const style = getYearStyle(yr);
                          return (
                            <div
                              key={yr}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDayForList({ day: d, year: yr });
                              }}
                              style={{ height: `${heightPct}%` }}
                              className={cn(
                                "flex-1 max-w-[6px] rounded-t-xs transition-all duration-200 cursor-pointer",
                                style.bg,
                                isHovered ? "brightness-125 ring-1 ring-white/60" : "opacity-85"
                              )}
                              title={`Anno ${yr}: Progressivo ${formatEur(val)} - Clicca per vedere i DDT del giorno`}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* Etichette giorni X-axis */}
                <div className="flex items-center justify-between text-[8.5px] font-mono text-[var(--muted-foreground)] pt-0.5 shrink-0">
                  {Array.from({ length: daysCount }, (_, i) => i + 1).map((d) => (
                    <span
                      key={d}
                      onClick={() => setSelectedDayForList({ day: d, year: currentYear })}
                      className={cn(
                        "flex-1 text-center transition-colors cursor-pointer hover:text-[var(--primary)] hover:font-bold",
                        hoveredDay === d && "text-[var(--primary)] font-bold scale-110"
                      )}
                      title={`Vedi DDT del ${d} ${MONTH_NAMES[selectedMonth - 1]}`}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Modal Footer */}
        <div className="px-5 py-2 border-t border-[var(--border)] bg-[var(--background)]/80 flex items-center justify-between text-xs text-[var(--muted-foreground)] shrink-0">
          <span>
            Visualizzazione dei {daysCount} giorni di {MONTH_NAMES[selectedMonth - 1]} per gli anni {selectedYears.join(", ")}. Clicca su un giorno o barra per aprire l&apos;elenco DDT.
          </span>
          <span className="font-sans">
            Premi <kbd className="rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-mono text-white">Esc</kbd> per chiudere
          </span>
        </div>
      </div>

      {/* Modal Elenco DDT del Giorno Selezionato */}
      {selectedDayForList && (
        <DayDdtListModal
          isOpen={Boolean(selectedDayForList)}
          onClose={() => setSelectedDayForList(null)}
          day={selectedDayForList.day}
          month={selectedMonth}
          initialYear={selectedDayForList.year}
          availableYears={breakdown?.availableYears || [2026, 2025, 2024, 2023]}
        />
      )}
    </div>
  );
};

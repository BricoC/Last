import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  X,
  FileText,
  Search,
  Calendar,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { dashboardService, type DdtListViewRow } from "../services/dashboardService";
import { DDTQuickViewModal } from "@/features/ddt-studio/components/DDTQuickViewModal";
import {
  formatDdtMoney,
  formatDdtNumber,
  formatDdtPercent,
  formatDdtViewDate,
} from "@/features/ddt-studio/services/ddtViewFormatting";
import {
  normalizeSearch,
  tokenizeSearch,
  matchesSearchToken,
} from "@/shared/hooks/useFragmentSearch";
import { cn } from "@/shared/utils/cn";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { requestOpenDdt } from "@/features/ddt-studio/services/ddtNavigation";
import { useEscClose } from "@/shared/hooks/useEscClose";

export interface DayDdtListModalProps {
  isOpen: boolean;
  onClose: () => void;
  day: number;
  month: number;
  initialYear?: number | null;
  availableYears?: number[];
}

const MONTH_NAMES = [
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

function getYearStyle(yr: number) {
  switch (yr) {
    case 2026:
      return { bg: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/30" };
    case 2025:
      return { bg: "bg-sky-500", text: "text-sky-400", border: "border-sky-500/30" };
    case 2024:
      return { bg: "bg-amber-500", text: "text-amber-400", border: "border-amber-500/30" };
    case 2023:
      return { bg: "bg-purple-500", text: "text-purple-400", border: "border-purple-500/30" };
    default:
      return { bg: "bg-slate-500", text: "text-slate-400", border: "border-slate-500/30" };
  }
}

export type DayDdtSortField =
  | "docNumber"
  | "year"
  | "date"
  | "client"
  | "destination"
  | "taxableSubunits"
  | "purchaseSubunits"
  | "revenueSubunits"
  | "markupPercent"
  | "discountPercent"
  | "reason"
  | "orderReference"
  | "payment";

export const DayDdtListModal: React.FC<DayDdtListModalProps> = ({
  isOpen,
  onClose,
  day,
  month,
  initialYear = null,
  availableYears = [2026, 2025, 2024, 2023],
}) => {
  const currentYear = new Date().getFullYear();
  // Di default mostra l'anno in corso (es. 2026) a meno che non sia stato richiesto uno specifico anno
  const [selectedYear, setSelectedYear] = useState<number | null>(
    initialYear !== null && initialYear !== undefined ? initialYear : currentYear
  );
  const [rows, setRows] = useState<DdtListViewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedDdtId, setSelectedDdtId] = useState<string | null>(null);

  // Aggiorna l'anno selezionato se cambiano le props
  useEffect(() => {
    if (isOpen) {
      setSelectedYear(
        initialYear !== null && initialYear !== undefined ? initialYear : currentYear
      );
    }
  }, [isOpen, initialYear, currentYear]);

  // Configurazione ordinamento colonne
  const [sortConfig, setSortConfig] = useState<{
    field: DayDdtSortField;
    direction: "asc" | "desc";
  }>({
    field: "docNumber",
    direction: "desc",
  });

  const handleSort = (field: DayDdtSortField) => {
    setSortConfig((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      const defaultDesc: DayDdtSortField[] = [
        "docNumber",
        "year",
        "date",
        "taxableSubunits",
        "purchaseSubunits",
        "revenueSubunits",
        "markupPercent",
        "discountPercent",
      ];
      return {
        field,
        direction: defaultDesc.includes(field) ? "desc" : "asc",
      };
    });
  };

  const openWindow = useWindowStore((state) => state.openWindow);

  // Chiusura in cascata con tasto Escape (LIFO stack)
  useEscClose(isOpen, onClose);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dashboardService.getDdtsForDay(month, day, selectedYear);
      setRows(data);
    } catch (err) {
      console.error("Errore caricamento DDT del giorno:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [month, day, selectedYear]);

  useEffect(() => {
    if (isOpen) {
      void loadData();
    }
  }, [isOpen, loadData]);

  // Indicizzazione e ricerca live
  const searchTokens = useMemo(() => tokenizeSearch(search), [search]);

  const filteredRows = useMemo(() => {
    if (!searchTokens.length) return rows;
    return rows.filter((r) => {
      const targetStr = normalizeSearch(
        `${formatDdtNumber(r.docNumber, r.series)} ${r.date} ${formatDdtViewDate(r.date)} ${r.year} ${r.client} ${r.destination} ${r.orderReference} ${r.operator} ${r.reason} ${r.payment}`
      );
      return searchTokens.every((token) => matchesSearchToken(targetStr, token));
    });
  }, [rows, searchTokens]);

  // Ordinamento effettivo delle righe
  const sortedRows = useMemo(() => {
    const { field, direction } = sortConfig;
    const multiplier = direction === "asc" ? 1 : -1;

    return [...filteredRows].sort((a, b) => {
      let comparison = 0;
      switch (field) {
        case "docNumber": {
          const na = a.docNumber ?? 0;
          const nb = b.docNumber ?? 0;
          comparison = na - nb;
          if (comparison === 0) {
            comparison = (a.series || "").localeCompare(b.series || "");
          }
          break;
        }
        case "year":
          comparison = a.year - b.year;
          break;
        case "date":
          comparison = (a.date || "").localeCompare(b.date || "");
          break;
        case "client":
          comparison = (a.client || "").localeCompare(b.client || "");
          break;
        case "destination":
          comparison = (a.destination || "").localeCompare(b.destination || "");
          break;
        case "taxableSubunits":
          comparison = a.taxableSubunits - b.taxableSubunits;
          break;
        case "purchaseSubunits":
          comparison = a.purchaseSubunits - b.purchaseSubunits;
          break;
        case "revenueSubunits":
          comparison = a.revenueSubunits - b.revenueSubunits;
          break;
        case "markupPercent": {
          const ma = a.markupPercent ?? -999999;
          const mb = b.markupPercent ?? -999999;
          comparison = ma - mb;
          break;
        }
        case "discountPercent": {
          const da = a.discountPercent ?? -999999;
          const db = b.discountPercent ?? -999999;
          comparison = da - db;
          break;
        }
        case "reason":
          comparison = (a.reason || "").localeCompare(b.reason || "");
          break;
        case "orderReference":
          comparison = (a.orderReference || "").localeCompare(b.orderReference || "");
          break;
        case "payment":
          comparison = (a.payment || "").localeCompare(b.payment || "");
          break;
      }
      return comparison * multiplier;
    });
  }, [filteredRows, sortConfig]);

  const renderSortIndicator = (field: DayDdtSortField) => {
    if (sortConfig.field !== field) {
      return (
        <ArrowUpDown className="h-3 w-3 opacity-25 group-hover/th:opacity-85 transition-opacity shrink-0 ml-1" />
      );
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="h-3 w-3 text-[var(--primary)] shrink-0 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[var(--primary)] shrink-0 ml-1" />
    );
  };

  // Calcolo KPI del giorno
  const { totalTaxable, totalCost, totalRevenue, avgMarkup } = useMemo(() => {
    let taxable = 0;
    let cost = 0;
    let revenue = 0;

    for (const r of filteredRows) {
      taxable += r.taxableSubunits;
      cost += r.purchaseSubunits;
      revenue += r.revenueSubunits;
    }

    const markup = cost > 0 ? (revenue / cost) * 100 : null;

    return {
      totalTaxable: taxable,
      totalCost: cost,
      totalRevenue: revenue,
      avgMarkup: markup,
    };
  }, [filteredRows]);

  const handleOpenInStudio = (id: string) => {
    setSelectedDdtId(null);
    openWindow({
      id: "ddt-studio",
      title: "DDT Studio (Pro)",
      componentId: "ddt-studio",
    });
    requestOpenDdt(id);
  };

  if (!isOpen) return null;

  const monthName = MONTH_NAMES[month - 1] || `Mese ${month}`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-2 sm:p-3 backdrop-blur-xs select-none font-sans"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-[98vw] h-[95vh] rounded-2xl border border-[var(--border)] bg-[var(--card)] flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold tracking-tight text-white uppercase">
                  DDT Emessi — {day} {monthName} {selectedYear ? `Anno ${selectedYear}` : "(Tutti gli anni)"}
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/30">
                  {filteredRows.length} {filteredRows.length === 1 ? "documento" : "documenti"}
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Elenco documenti emessi nel giorno selezionato. Clicca sul numero DDT per visualizzare il riepilogo rapido.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Selettore Anno con Pills */}
            <div className="flex items-center gap-1 bg-[var(--card)] p-0.5 rounded-lg border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setSelectedYear(null)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer",
                  selectedYear === null
                    ? "bg-[var(--background)] text-white shadow-xs border border-[var(--border)]"
                    : "text-[var(--muted-foreground)] hover:text-white"
                )}
              >
                Tutti gli anni
              </button>
              {availableYears.map((yr) => {
                const isSelected = selectedYear === yr;
                const style = getYearStyle(yr);
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => setSelectedYear(yr)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer",
                      isSelected
                        ? "bg-[var(--background)] text-white shadow-xs border border-[var(--border)]"
                        : "text-[var(--muted-foreground)] hover:text-white"
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full", style.bg)} />
                    <span>{yr}</span>
                  </button>
                );
              })}
            </div>

            {/* Pulsante Chiudi */}
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

        {/* Toolbar con Ricerca e KPI Riassuntivi del Giorno */}
        <div className="px-5 py-2.5 bg-[var(--background)]/60 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Barra di Ricerca Live */}
          <div className="relative w-80">
            <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per cliente, DDT, destinazione..."
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* KPI Riassuntivi */}
          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--card)] border border-[var(--border)]">
              <span className="text-[10px] text-[var(--muted-foreground)] font-sans uppercase font-bold">Imponibile:</span>
              <span className="font-extrabold text-white">{formatDdtMoney(totalTaxable)}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--card)] border border-[var(--border)]">
              <span className="text-[10px] text-[var(--muted-foreground)] font-sans uppercase font-bold">Costo:</span>
              <span className="font-semibold text-slate-300">{formatDdtMoney(totalCost)}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--card)] border border-[var(--border)]">
              <span className="text-[10px] text-[var(--muted-foreground)] font-sans uppercase font-bold">Ricavo:</span>
              <span className={cn("font-extrabold", totalRevenue >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {formatDdtMoney(totalRevenue)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--card)] border border-[var(--border)]">
              <span className="text-[10px] text-[var(--muted-foreground)] font-sans uppercase font-bold">Ricarico:</span>
              <span className="font-semibold text-sky-400">{formatDdtPercent(avgMarkup)}</span>
            </div>
          </div>
        </div>

        {/* Tabella Stile DDT List */}
        <div className="flex-1 overflow-auto bg-[var(--card)]">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]">
              Caricamento documenti del giorno...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--muted-foreground)] p-8">
              <Layers className="w-10 h-10 stroke-[1.2] mb-2 opacity-40" />
              <p className="text-sm font-semibold">Nessun DDT trovato</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                {search
                  ? `Nessun risultato corrispondente al filtro "${search}"`
                  : `Nessun DDT emesso il ${day} ${monthName} ${selectedYear ? `del ${selectedYear}` : ""}`}
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)] text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider select-none">
                <tr>
                  {/* DDT */}
                  <th
                    onClick={() => handleSort("docNumber")}
                    className="px-3 py-2 text-left w-24 cursor-pointer group/th hover:text-white transition-colors"
                    title="Clicca per ordinare per numero DDT"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>DDT</span>
                      {renderSortIndicator("docNumber")}
                    </div>
                  </th>

                  {/* ANNO */}
                  <th
                    onClick={() => handleSort("year")}
                    className="px-3 py-2 text-center w-16 cursor-pointer group/th hover:text-white transition-colors"
                    title="Clicca per ordinare per anno"
                  >
                    <div className="inline-flex items-center justify-center gap-1 w-full">
                      <span>ANNO</span>
                      {renderSortIndicator("year")}
                    </div>
                  </th>

                  {/* DATA */}
                  <th
                    onClick={() => handleSort("date")}
                    className="px-3 py-2 text-left w-36 cursor-pointer group/th hover:text-white transition-colors"
                    title="Clicca per ordinare per data"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>DATA</span>
                      {renderSortIndicator("date")}
                    </div>
                  </th>

                  {/* CLIENTE */}
                  <th
                    onClick={() => handleSort("client")}
                    className="px-3 py-2 text-left w-52 cursor-pointer group/th hover:text-white transition-colors"
                    title="Clicca per ordinare per cliente"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>CLIENTE</span>
                      {renderSortIndicator("client")}
                    </div>
                  </th>

                  {/* DESTINAZIONE */}
                  <th
                    onClick={() => handleSort("destination")}
                    className="px-3 py-2 text-left cursor-pointer group/th hover:text-white transition-colors"
                    title="Clicca per ordinare per destinazione"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>DESTINAZIONE</span>
                      {renderSortIndicator("destination")}
                    </div>
                  </th>

                  {/* TOT. IMPONIBILE */}
                  <th
                    onClick={() => handleSort("taxableSubunits")}
                    className="px-3 py-2 text-right w-32 cursor-pointer group/th hover:text-white transition-colors"
                    title="Clicca per ordinare per totale imponibile"
                  >
                    <div className="inline-flex items-center justify-end gap-1 w-full">
                      <span>TOT. IMPONIBILE</span>
                      {renderSortIndicator("taxableSubunits")}
                    </div>
                  </th>

                  {/* COSTO ACQUISTO */}
                  <th
                    onClick={() => handleSort("purchaseSubunits")}
                    className="px-3 py-2 text-right w-32 cursor-pointer group/th hover:text-white transition-colors"
                    title="Clicca per ordinare per costo acquisto"
                  >
                    <div className="inline-flex items-center justify-end gap-1 w-full">
                      <span>COSTO ACQUISTO</span>
                      {renderSortIndicator("purchaseSubunits")}
                    </div>
                  </th>

                  {/* RICAVO */}
                  <th
                    onClick={() => handleSort("revenueSubunits")}
                    className="px-3 py-2 text-right w-28 cursor-pointer group/th hover:text-white transition-colors"
                    title="Clicca per ordinare per ricavo / margine"
                  >
                    <div className="inline-flex items-center justify-end gap-1 w-full">
                      <span>RICAVO</span>
                      {renderSortIndicator("revenueSubunits")}
                    </div>
                  </th>

                  {/* RICARICO % */}
                  <th
                    onClick={() => handleSort("markupPercent")}
                    className="px-3 py-2 text-right w-24 cursor-pointer group/th hover:text-white transition-colors"
                    title="Clicca per ordinare per ricarico %"
                  >
                    <div className="inline-flex items-center justify-end gap-1 w-full">
                      <span>RICARICO %</span>
                      {renderSortIndicator("markupPercent")}
                    </div>
                  </th>

                  {/* SCONTO % */}
                  <th
                    onClick={() => handleSort("discountPercent")}
                    className="px-2 py-2 text-center w-20 cursor-pointer group/th hover:text-white transition-colors"
                    title="Clicca per ordinare per sconto %"
                  >
                    <div className="inline-flex items-center justify-center gap-1 w-full">
                      <span>SCONTO %</span>
                      {renderSortIndicator("discountPercent")}
                    </div>
                  </th>

                  {/* CAUSALE */}
                  <th
                    onClick={() => handleSort("reason")}
                    className="px-3 py-2 text-left w-32 cursor-pointer group/th hover:text-white transition-colors"
                    title="Clicca per ordinare per causale trasporto"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>CAUSALE</span>
                      {renderSortIndicator("reason")}
                    </div>
                  </th>

                  {/* ORDINE */}
                  <th
                    onClick={() => handleSort("orderReference")}
                    className="px-3 py-2 text-left w-36 cursor-pointer group/th hover:text-white transition-colors"
                    title="Clicca per ordinare per riferimento ordine"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>ORDINE</span>
                      {renderSortIndicator("orderReference")}
                    </div>
                  </th>

                  {/* PAGAMENTO */}
                  <th
                    onClick={() => handleSort("payment")}
                    className="px-3 py-2 text-left w-40 cursor-pointer group/th hover:text-white transition-colors"
                    title="Clicca per ordinare per modalità di pagamento"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>PAGAMENTO</span>
                      {renderSortIndicator("payment")}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
                {sortedRows.map((row) => {
                  const isPositiveRev = row.revenueSubunits > 0;
                  const isNegativeRev = row.revenueSubunits < 0;
                  const yearStyle = getYearStyle(row.year);

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-[var(--background)]/60 transition-colors group cursor-pointer"
                      onClick={() => setSelectedDdtId(row.id)}
                    >
                      {/* DDT (Link con icona) */}
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDdtId(row.id);
                          }}
                          className="font-bold text-[var(--primary)] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                          title={`Visualizza dettaglio DDT ${formatDdtNumber(row.docNumber, row.series)}`}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span>{formatDdtNumber(row.docNumber, row.series)}</span>
                        </button>
                      </td>

                      {/* ANNO */}
                      <td className="px-3 py-2 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold border",
                            yearStyle.text,
                            yearStyle.border,
                            "bg-[var(--background)]"
                          )}
                        >
                          {row.year}
                        </span>
                      </td>

                      {/* DATA */}
                      <td className="px-3 py-2 font-sans font-medium text-[var(--foreground)] whitespace-nowrap">
                        {formatDdtViewDate(row.date)}
                      </td>

                      {/* CLIENTE */}
                      <td
                        className="px-3 py-2 font-sans font-semibold text-white truncate max-w-[200px]"
                        title={row.client}
                      >
                        {row.client}
                      </td>

                      {/* DESTINAZIONE */}
                      <td
                        className="px-3 py-2 font-sans text-[var(--muted-foreground)] truncate max-w-[220px]"
                        title={row.destination}
                      >
                        {row.destination || "—"}
                      </td>

                      {/* TOTALE IMPONIBILE */}
                      <td className="px-3 py-2 text-right font-bold text-white">
                        {formatDdtMoney(row.taxableSubunits)}
                      </td>

                      {/* PREZZO ACQUISTO */}
                      <td className="px-3 py-2 text-right text-[var(--muted-foreground)]">
                        {formatDdtMoney(row.purchaseSubunits)}
                      </td>

                      {/* RICAVO */}
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-semibold",
                          isPositiveRev
                            ? "text-emerald-400"
                            : isNegativeRev
                            ? "text-rose-400"
                            : "text-[var(--muted-foreground)]"
                        )}
                      >
                        {formatDdtMoney(row.revenueSubunits)}
                      </td>

                      {/* RICARICO % */}
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-medium",
                          isPositiveRev
                            ? "text-emerald-400"
                            : isNegativeRev
                            ? "text-rose-400"
                            : "text-[var(--muted-foreground)]"
                        )}
                      >
                        {formatDdtPercent(row.markupPercent)}
                      </td>

                      {/* SCONTO % */}
                      <td className="px-2 py-2 text-center text-[var(--muted-foreground)]">
                        {row.discountPercent !== null ? `${row.discountPercent.toFixed(1)}%` : "—"}
                      </td>

                      {/* CAUSALE */}
                      <td className="px-3 py-2 font-sans text-[var(--muted-foreground)] truncate max-w-[130px]">
                        {row.reason || "—"}
                      </td>

                      {/* ORDINE */}
                      <td className="px-3 py-2 font-sans text-[var(--muted-foreground)] truncate max-w-[130px]">
                        {row.orderReference || "—"}
                      </td>

                      {/* PAGAMENTO */}
                      <td className="px-3 py-2 font-sans text-[var(--muted-foreground)] truncate max-w-[140px]">
                        {row.payment || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-2.5 border-t border-[var(--border)] bg-[var(--background)]/90 flex items-center justify-between text-xs text-[var(--muted-foreground)] shrink-0">
          <span>
            Mostrati {filteredRows.length} DDT su {rows.length} totali emessi il {day} {monthName}.
          </span>
          <div className="flex items-center gap-2">
            <span>Clicca sul numero DDT per il popup rapido</span>
            <span>•</span>
            <span className="font-sans">
              Premi <kbd className="rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-mono text-white">Esc</kbd> per chiudere
            </span>
          </div>
        </div>
      </div>

      {/* Popup Rapido del DDT selezionato (il popup di DDT List / Dashboard!) */}
      {selectedDdtId && (
        <DDTQuickViewModal
          isOpen={Boolean(selectedDdtId)}
          onClose={() => setSelectedDdtId(null)}
          ddtId={selectedDdtId}
          onOpenInStudio={handleOpenInStudio}
        />
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useState, useDeferredValue, useRef } from "react";
import { X, Search, History, User, Building2, FileText, ArrowUp, ArrowDown, ArrowUpDown, Calendar } from "lucide-react";
import { getClientArticleHistory, type ClientArticleHistoryRow } from "../services/ddtReadModelsRepository";
import { formatDdtMoney, formatDdtNumber, formatDdtPercent, formatDdtViewDate } from "../services/ddtViewFormatting";
import { useAppSettingsStore } from "@/shared/stores/useAppSettingsStore";

export interface DDTClientArticleHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  articleDescription: string;
  articleCode?: string;
  onSelectDdt?: (ddtId: string) => void;
}

const BATCH_SIZE = 150;

type SortField =
  | "date"
  | "docNumber"
  | "client"
  | "destination"
  | "quantity"
  | "unitPrice"
  | "discount"
  | "netPrice"
  | "netAmount"
  | "purchasePrice"
  | "revenue"
  | "markup";

type SortDirection = "asc" | "desc";

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

export const DDTClientArticleHistoryModal: React.FC<DDTClientArticleHistoryModalProps> = ({
  isOpen,
  onClose,
  clientName,
  articleDescription,
  articleCode,
  onSelectDdt,
}) => {
  const [rows, setRows] = useState<ClientArticleHistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyThisClient, setOnlyThisClient] = useState(true);
  const [searchTerm, setSearchTerm] = useState(articleDescription);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "date",
    direction: "desc",
  });
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const { historyModalLimit } = useAppSettingsStore();

  // Inizializza o aggiorna il testo di ricerca quando si apre il modal per un nuovo articolo
  useEffect(() => {
    if (isOpen) {
      setSearchTerm(articleDescription);
      setSelectedYear("all");
      setSortConfig({ field: "date", direction: "desc" });
    }
  }, [isOpen, articleDescription]);

  // Carica i dati quando cambia deferredSearchTerm, il cliente o il toggle onlyThisClient
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getClientArticleHistory({
          clientName,
          description: deferredSearchTerm,
          code: deferredSearchTerm.trim() === articleDescription.trim() ? articleCode : undefined,
          onlyThisClient,
          limit: historyModalLimit === "tutti" ? null : historyModalLimit,
        });
        if (isMounted) setRows(data);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Errore durante il caricamento dello storico.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void fetchHistory();
    return () => {
      isMounted = false;
    };
  }, [isOpen, clientName, deferredSearchTerm, articleDescription, articleCode, onlyThisClient, historyModalLimit]);

  // Anni disponibili ricavati dai dati estratti
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    for (const r of rows) {
      if (r.year) {
        yearsSet.add(r.year);
      } else if (r.date) {
        const parsedYear = new Date(r.date).getFullYear();
        if (!isNaN(parsedYear)) yearsSet.add(parsedYear);
      }
    }
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [rows]);

  // Se l'anno precedentemente selezionato non è più presente nei risultati, torna a "all"
  useEffect(() => {
    if (selectedYear !== "all" && availableYears.length > 0 && !availableYears.includes(Number(selectedYear))) {
      setSelectedYear("all");
    }
  }, [availableYears, selectedYear]);

  // Filtro per anno
  const filteredRows = useMemo(() => {
    if (selectedYear === "all") return rows;
    const yrNum = Number(selectedYear);
    return rows.filter((r) => r.year === yrNum || new Date(r.date).getFullYear() === yrNum);
  }, [rows, selectedYear]);

  // Ordinamento colonne
  const sortedRows = useMemo(() => {
    const { field, direction } = sortConfig;
    const multiplier = direction === "asc" ? 1 : -1;

    return [...filteredRows].sort((a, b) => {
      let comparison = 0;
      switch (field) {
        case "date": {
          const da = a.date || "";
          const db = b.date || "";
          comparison = da.localeCompare(db);
          if (comparison === 0) {
            comparison = (a.docNumber ?? 0) - (b.docNumber ?? 0);
          }
          break;
        }
        case "docNumber": {
          const na = a.docNumber ?? 0;
          const nb = b.docNumber ?? 0;
          comparison = na - nb;
          if (comparison === 0) {
            comparison = (a.series || "").localeCompare(b.series || "");
          }
          break;
        }
        case "client":
          comparison = (a.client || "").localeCompare(b.client || "");
          break;
        case "destination":
          comparison = (a.destination || "").localeCompare(b.destination || "");
          break;
        case "quantity": {
          const qa = parseFloat(a.quantity.replace(",", ".")) || 0;
          const qb = parseFloat(b.quantity.replace(",", ".")) || 0;
          comparison = qa - qb;
          break;
        }
        case "unitPrice":
          comparison = a.unitPriceSubunits - b.unitPriceSubunits;
          break;
        case "discount": {
          const da = parseFloat((a.discountPercent || "0").replace(",", ".")) || 0;
          const db = parseFloat((b.discountPercent || "0").replace(",", ".")) || 0;
          comparison = da - db;
          break;
        }
        case "netPrice": {
          const qa = parseFloat(a.quantity.replace(",", ".")) || 0;
          const qb = parseFloat(b.quantity.replace(",", ".")) || 0;
          const pa = qa > 0 ? a.netAmountSubunits / qa : a.unitPriceSubunits;
          const pb = qb > 0 ? b.netAmountSubunits / qb : b.unitPriceSubunits;
          comparison = pa - pb;
          break;
        }
        case "netAmount":
          comparison = a.netAmountSubunits - b.netAmountSubunits;
          break;
        case "purchasePrice":
          comparison = a.purchasePriceSubunits - b.purchasePriceSubunits;
          break;
        case "revenue":
          comparison = a.revenueSubunits - b.revenueSubunits;
          break;
        case "markup": {
          const ma = a.markupPercent ?? -9999999;
          const mb = b.markupPercent ?? -9999999;
          comparison = ma - mb;
          break;
        }
      }
      return comparison * multiplier;
    });
  }, [filteredRows, sortConfig]);

  // Reset del conteggio visibile e scroll quando cambiano i filtri o l'ordinamento
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [deferredSearchTerm, onlyThisClient, selectedYear, sortConfig]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 350) {
      setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, sortedRows.length));
    }
  };

  const visibleRows = useMemo(() => sortedRows.slice(0, visibleCount), [sortedRows, visibleCount]);

  const handleSort = (field: SortField) => {
    setSortConfig((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return {
        field,
        direction: field === "client" || field === "destination" ? "asc" : "desc",
      };
    });
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortConfig.field !== field) {
      return <ArrowUpDown className="h-3 w-3 opacity-25 group-hover:opacity-75 transition-opacity shrink-0 ml-1" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="h-3 w-3 text-[var(--primary)] shrink-0 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[var(--primary)] shrink-0 ml-1" />
    );
  };

  // Gestione tasto Escape in capture phase per chiudere solo questo popup
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onClose]);

  // Statistiche e totali (basati sui record filtrati per anno)
  const stats = useMemo(() => {
    if (!filteredRows.length) return null;

    let totalQty = 0;
    let totalNetAmount = 0;
    let totalPurchase = 0;
    const unitPrices: number[] = [];

    for (const r of filteredRows) {
      const q = parseFloat(r.quantity.replace(",", ".")) || 0;
      totalQty += q;
      totalNetAmount += r.netAmountSubunits;
      totalPurchase += Math.round(r.purchasePriceSubunits * q);

      const unitNet = q > 0 ? r.netAmountSubunits / q : r.unitPriceSubunits;
      if (unitNet > 0) unitPrices.push(unitNet);
    }

    const totalRevenue = totalNetAmount - totalPurchase;
    const avgMarkup = totalPurchase > 0 ? (totalRevenue / totalPurchase) * 100 : null;
    const minPrice = unitPrices.length ? Math.min(...unitPrices) : 0;
    const maxPrice = unitPrices.length ? Math.max(...unitPrices) : 0;
    const lastRow = filteredRows[0];
    const lastQty = parseFloat(lastRow.quantity.replace(",", ".")) || 0;
    const lastUnitNet = lastQty > 0 ? lastRow.netAmountSubunits / lastQty : lastRow.unitPriceSubunits;

    return {
      totalPurchases: filteredRows.length,
      totalQty,
      unit: filteredRows[0]?.unit || "NR",
      totalNetAmount,
      totalRevenue,
      avgMarkup,
      minPrice,
      maxPrice,
      lastUnitNet,
      lastDate: lastRow.date,
    };
  }, [filteredRows]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-[2px] p-2 sm:p-3 text-[var(--foreground)] animate-in fade-in duration-150"
    >
      <div
        className="flex h-[92vh] w-[98vw] max-w-[1600px] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[var(--primary)]/15 p-2 text-[var(--primary)]">
              <History className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">Storico Articolo</h2>
                {searchTerm && (
                  <span className="rounded bg-[var(--primary)]/15 px-2 py-0.5 font-sans text-xs font-semibold text-[var(--primary)] max-w-md truncate">
                    {searchTerm}
                  </span>
                )}
                {articleCode && (
                  <span className="rounded bg-[var(--primary)]/20 px-2 py-0.5 font-mono text-xs font-semibold text-[var(--primary)]">
                    {articleCode}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)] line-clamp-1 max-w-2xl font-medium">
                {onlyThisClient
                  ? `Storico vendite per ${clientName || "cliente"}`
                  : "Storico vendite su tutti i clienti"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Toggle Filtro Cliente */}
            <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setOnlyThisClient(true)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  onlyThisClient
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
                title={`Visualizza solo per ${clientName}`}
              >
                <User className="h-3.5 w-3.5" />
                <span className="max-w-[150px] truncate">{clientName || "Questo Cliente"}</span>
              </button>
              <button
                type="button"
                onClick={() => setOnlyThisClient(false)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  !onlyThisClient
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
                title="Visualizza per tutti i clienti"
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>Tutti i Clienti</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              title="Chiudi (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Toolbar & KPI bar */}
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--background)]/50 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Ricerca e Filtro Anno */}
          <div className="flex items-center gap-2">
            {/* Article Search Input */}
            <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs w-80 shadow-sm focus-within:border-[var(--primary)] transition-colors">
              <Search className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cerca qualsiasi articolo o codice…"
                className="w-full bg-transparent outline-none font-medium text-[var(--foreground)]"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-0.5 rounded cursor-pointer"
                  title="Svuota ricerca"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Filtro Anno */}
            <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs shadow-sm focus-within:border-[var(--primary)] transition-colors">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
              <select
                aria-label="Filtra per Anno"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-transparent outline-none font-medium text-[var(--foreground)] cursor-pointer pr-1"
              >
                <option value="all" className="bg-[var(--card)] text-[var(--foreground)]">
                  Tutti gli anni {availableYears.length > 0 ? `(${availableYears.length})` : ""}
                </option>
                {availableYears.map((yr) => (
                  <option key={yr} value={String(yr)} className="bg-[var(--card)] text-[var(--foreground)]">
                    Anno {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* KPI metrics */}
          {stats && (
            <div className="flex items-center gap-3 text-xs font-medium">
              <div className="flex items-center gap-1.5 rounded bg-[var(--card)] border border-[var(--border)] px-2.5 py-1">
                <span className="text-[var(--muted-foreground)]">Quantità:</span>
                <span className="font-bold text-[var(--foreground)]">
                  NR. {stats.totalQty.toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center gap-1.5 rounded bg-[var(--card)] border border-[var(--border)] px-2.5 py-1">
                <span className="text-[var(--muted-foreground)]">Documenti:</span>
                <span className="font-bold text-[var(--foreground)]">
                  NR. {stats.totalPurchases.toLocaleString("it-IT")} DDT
                </span>
              </div>

              <div className="flex items-center gap-1.5 rounded bg-[var(--card)] border border-[var(--border)] px-2.5 py-1">
                <span className="text-[var(--muted-foreground)]">Ultimo Netto:</span>
                <span className="font-bold text-sky-400">
                  {formatDdtMoney(Math.round(stats.lastUnitNet))}
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)]">({formatDdtViewDate(stats.lastDate)})</span>
              </div>

              {stats.minPrice !== stats.maxPrice && (
                <div className="flex items-center gap-1.5 rounded bg-[var(--card)] border border-[var(--border)] px-2.5 py-1">
                  <span className="text-[var(--muted-foreground)]">Range Netto:</span>
                  <span className="font-mono text-[11px]">
                    {formatDdtMoney(Math.round(stats.minPrice))} ~ {formatDdtMoney(Math.round(stats.maxPrice))}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1.5 rounded bg-[var(--card)] border border-[var(--border)] px-2.5 py-1">
                <span className="text-[var(--muted-foreground)]">Margine Tot:</span>
                <span className={`font-bold ${stats.totalRevenue >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {formatDdtMoney(stats.totalRevenue)}
                </span>
                {stats.avgMarkup !== null && (
                  <span className="text-[10px] text-[var(--muted-foreground)]">({formatDdtPercent(stats.avgMarkup)})</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Tabella Storico */}
        <div
          ref={tableContainerRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-auto bg-[var(--card)]"
        >
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
              Caricamento storico vendite…
            </div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-400">{error}</div>
          ) : filteredRows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-sm text-[var(--muted-foreground)]">
              <History className="h-10 w-10 opacity-30 mb-2" />
              <p className="font-medium">
                {selectedYear !== "all"
                  ? `Nessun acquisto trovato nell'anno ${selectedYear}${searchTerm ? ` per "${searchTerm}"` : ""}.`
                  : searchTerm
                  ? `Nessun acquisto trovato per "${searchTerm}".`
                  : "Nessun acquisto registrato."}
              </p>
              <p className="text-xs opacity-70 mt-1">
                {onlyThisClient
                  ? `Il cliente ${clientName} non ha DDT corrispondenti ai filtri impostati.`
                  : "Nessun DDT trovato nel database corrispondente ai filtri impostati."}
              </p>
              {onlyThisClient && (
                <button
                  type="button"
                  onClick={() => setOnlyThisClient(false)}
                  className="mt-3 text-xs text-[var(--primary)] hover:underline cursor-pointer font-semibold"
                >
                  Cerca tra tutti i clienti ↗
                </button>
              )}
            </div>
          ) : (
            <table className="w-full min-w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)] text-[11px] font-semibold text-[var(--muted-foreground)] select-none">
                <tr>
                  {/* DATA */}
                  <th
                    onClick={() => handleSort("date")}
                    className="px-4 py-2.5 text-left w-32 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Data"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>DATA</span>
                      {renderSortIndicator("date")}
                    </div>
                  </th>

                  {/* DDT */}
                  <th
                    onClick={() => handleSort("docNumber")}
                    className="px-4 py-2.5 text-left w-32 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Numero DDT"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>DDT</span>
                      {renderSortIndicator("docNumber")}
                    </div>
                  </th>

                  {/* CLIENTE */}
                  {!onlyThisClient && (
                    <th
                      onClick={() => handleSort("client")}
                      className="px-4 py-2.5 text-left w-64 max-w-[240px] cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                      title="Clicca per ordinare per Cliente"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span>CLIENTE</span>
                        {renderSortIndicator("client")}
                      </div>
                    </th>
                  )}

                  {/* DESTINAZIONE - Ridotta del 50% con larghezza controllata */}
                  <th
                    onClick={() => handleSort("destination")}
                    className="px-3 py-2.5 text-left w-44 max-w-[180px] cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Destinazione"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>DESTINAZIONE</span>
                      {renderSortIndicator("destination")}
                    </div>
                  </th>

                  {/* QUANTITÀ */}
                  <th
                    onClick={() => handleSort("quantity")}
                    className="px-4 py-2.5 text-right w-32 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Quantità"
                  >
                    <div className="inline-flex items-center justify-end gap-1 w-full">
                      <span>QUANTITÀ</span>
                      {renderSortIndicator("quantity")}
                    </div>
                  </th>

                  {/* PREZZO LIST. */}
                  <th
                    onClick={() => handleSort("unitPrice")}
                    className="px-4 py-2.5 text-right w-36 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Prezzo Listino"
                  >
                    <div className="inline-flex items-center justify-end gap-1 w-full">
                      <span>PREZZO LIST.</span>
                      {renderSortIndicator("unitPrice")}
                    </div>
                  </th>

                  {/* SCONTO */}
                  <th
                    onClick={() => handleSort("discount")}
                    className="px-3 py-2.5 text-center w-24 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Sconto"
                  >
                    <div className="inline-flex items-center justify-center gap-1 w-full">
                      <span>SCONTO</span>
                      {renderSortIndicator("discount")}
                    </div>
                  </th>

                  {/* PREZZO NETTO */}
                  <th
                    onClick={() => handleSort("netPrice")}
                    className="px-4 py-2.5 text-right w-36 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Prezzo Netto"
                  >
                    <div className="inline-flex items-center justify-end gap-1 w-full">
                      <span>PREZZO NETTO</span>
                      {renderSortIndicator("netPrice")}
                    </div>
                  </th>

                  {/* TOT. NETTO */}
                  <th
                    onClick={() => handleSort("netAmount")}
                    className="px-4 py-2.5 text-right w-36 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Totale Netto"
                  >
                    <div className="inline-flex items-center justify-end gap-1 w-full">
                      <span>TOT. NETTO</span>
                      {renderSortIndicator("netAmount")}
                    </div>
                  </th>

                  {/* COSTO ACQ. */}
                  <th
                    onClick={() => handleSort("purchasePrice")}
                    className="px-4 py-2.5 text-right w-36 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Costo Acquisto"
                  >
                    <div className="inline-flex items-center justify-end gap-1 w-full">
                      <span>COSTO ACQ.</span>
                      {renderSortIndicator("purchasePrice")}
                    </div>
                  </th>

                  {/* MARGINE € */}
                  <th
                    onClick={() => handleSort("revenue")}
                    className="px-4 py-2.5 text-right w-32 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Margine"
                  >
                    <div className="inline-flex items-center justify-end gap-1 w-full">
                      <span>MARGINE €</span>
                      {renderSortIndicator("revenue")}
                    </div>
                  </th>

                  {/* RICARICO % */}
                  <th
                    onClick={() => handleSort("markup")}
                    className="px-4 py-2.5 text-right w-32 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Ricarico %"
                  >
                    <div className="inline-flex items-center justify-end gap-1 w-full">
                      <span>RICARICO %</span>
                      {renderSortIndicator("markup")}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
                {visibleRows.map((row, idx) => {
                  const qty = parseFloat(row.quantity.replace(",", ".")) || 0;
                  const unitNet = qty > 0 ? row.netAmountSubunits / qty : row.unitPriceSubunits;
                  const isPositiveRev = row.revenueSubunits > 0;
                  const isNegativeRev = row.revenueSubunits < 0;

                  return (
                    <tr
                      key={`${row.ddtId}-${idx}`}
                      className="hover:bg-[var(--background)]/60 transition-colors"
                    >
                      {/* Data */}
                      <td className="px-4 py-2.5 font-sans font-medium text-[var(--foreground)]">
                        {formatDdtViewDate(row.date)}
                      </td>

                      {/* DDT */}
                      <td className="px-4 py-2.5">
                        {onSelectDdt ? (
                          <button
                            type="button"
                            onClick={() => onSelectDdt(row.ddtId)}
                            className="font-bold text-[var(--primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                            title={`Apri DDT ${formatDdtNumber(row.docNumber, row.series)}`}
                          >
                            <FileText className="h-3 w-3" />
                            <span>{formatDdtNumber(row.docNumber, row.series)}</span>
                          </button>
                        ) : (
                          <span className="font-bold text-[var(--primary)]">
                            {formatDdtNumber(row.docNumber, row.series)}
                          </span>
                        )}
                      </td>

                      {/* Cliente (se tutti) */}
                      {!onlyThisClient && (
                        <td className="px-4 py-2.5 font-sans font-medium text-[var(--foreground)] truncate max-w-[240px]">
                          {row.client}
                        </td>
                      )}

                      {/* Destinazione - rimpicciolita con max-width e tooltip */}
                      <td
                        className="px-3 py-2.5 font-sans text-[var(--muted-foreground)] truncate max-w-[180px]"
                        title={row.destination || "—"}
                      >
                        {row.destination || "—"}
                      </td>

                      {/* Quantità */}
                      <td className="px-4 py-2.5 text-right font-bold text-[var(--foreground)]">
                        {row.quantity} {row.unit && <span className="text-[10px] text-[var(--muted-foreground)] font-normal">{row.unit}</span>}
                      </td>

                      {/* Prezzo Listino */}
                      <td className="px-4 py-2.5 text-right text-[var(--muted-foreground)]">
                        {formatDdtMoney(row.unitPriceSubunits)}
                      </td>

                      {/* Sconto */}
                      <td className="px-3 py-2.5 text-center text-amber-400">
                        {row.discountPercent ? `${row.discountPercent}%` : "—"}
                      </td>

                      {/* Prezzo Netto Unitario */}
                      <td className="px-4 py-2.5 text-right font-bold text-sky-400">
                        {formatDdtMoney(Math.round(unitNet))}
                      </td>

                      {/* Totale Netto */}
                      <td className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)]">
                        {formatDdtMoney(row.netAmountSubunits)}
                      </td>

                      {/* Costo Acquisto */}
                      <td className="px-4 py-2.5 text-right text-[var(--muted-foreground)]">
                        {row.purchasePriceSubunits > 0 ? formatDdtMoney(row.purchasePriceSubunits) : "—"}
                      </td>

                      {/* Margine € */}
                      <td
                        className={`px-4 py-2.5 text-right font-semibold ${
                          isPositiveRev ? "text-emerald-400" : isNegativeRev ? "text-rose-400" : "text-[var(--muted-foreground)]"
                        }`}
                      >
                        {formatDdtMoney(row.revenueSubunits)}
                      </td>

                      {/* Ricarico % */}
                      <td
                        className={`px-4 py-2.5 text-right font-medium ${
                          isPositiveRev ? "text-emerald-400" : isNegativeRev ? "text-rose-400" : "text-[var(--muted-foreground)]"
                        }`}
                      >
                        {formatDdtPercent(row.markupPercent)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {visibleRows.length < filteredRows.length && (
            <div className="p-3 text-center text-xs text-[var(--muted-foreground)] bg-[var(--background)]/40 border-t border-[var(--border)]/30">
              Visualizzati {visibleRows.length} di {filteredRows.length} movimenti. Scorri verso il basso per caricarne altri.
            </div>
          )}
        </div>

        {/* Footer info tastiera */}
        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--background)] px-5 py-2 text-xs text-[var(--muted-foreground)]">
          <span className="flex items-center gap-1.5">
            <span>
              {filteredRows.length} movimenti trovati
              {selectedYear !== "all" && <span className="font-semibold text-[var(--primary)] ml-1">(Anno {selectedYear})</span>}
            </span>
            {historyModalLimit !== "tutti" && rows.length >= historyModalLimit && (
              <span className="rounded bg-[var(--card)] px-1.5 py-0.5 text-[10px] text-amber-400 border border-amber-500/30">
                limite SQL impostato: {historyModalLimit.toLocaleString("it-IT")} record
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 font-sans">
            Premi <kbd className="rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-mono">Esc</kbd> per chiudere e tornare al DDT
          </span>
        </div>
      </div>
    </div>
  );
};

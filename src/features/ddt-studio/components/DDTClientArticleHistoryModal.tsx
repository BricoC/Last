import React, { useEffect, useMemo, useState, useDeferredValue, useRef } from "react";
import { 
  X, 
  Search, 
  History, 
  User, 
  Building2, 
  Users, 
  FileText, 
  ArrowUp, 
  ArrowDown, 
  ArrowUpDown, 
  Calendar,
  ListFilter,
  BarChart3
} from "lucide-react";
import { getClientArticleHistory, getDdtClientNames, type ClientArticleHistoryRow } from "../services/ddtReadModelsRepository";
import { formatDdtMoney, formatDdtNumber, formatDdtPercent, formatDdtViewDate } from "../services/ddtViewFormatting";
import { useAppSettingsStore } from "@/shared/stores/useAppSettingsStore";
import { DDTArticleResocontoView } from "./DDTArticleResocontoView";
import { DDTClientResocontoView } from "./DDTClientResocontoView";

export type HistoryViewMode = "movements" | "articleResoconto" | "clientResoconto";

export interface DDTClientArticleHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  articleDescription: string;
  articleCode?: string;
  availableClients?: string[];
  onSelectDdt?: (ddtId: string) => void;
}

const BATCH_SIZE = 150;

type SortField =
  | "date"
  | "docNumber"
  | "client"
  | "destination"
  | "quantity"
  | "description"
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
  availableClients,
  onSelectDdt,
}) => {
  const [rows, setRows] = useState<ClientArticleHistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>(clientName);
  const [isAllClients, setIsAllClients] = useState<boolean>(false);
  const [dbClients, setDbClients] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState(articleDescription);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [viewMode, setViewMode] = useState<HistoryViewMode>("movements");
  const [mergeVariants, setMergeVariants] = useState<boolean>(true);

  // Se l'utente torna a visualizzare un singolo cliente mentre era in Resoconto Clienti, reimposta a Resoconto Articoli
  useEffect(() => {
    if (!isAllClients && viewMode === "clientResoconto") {
      setViewMode("articleResoconto");
    }
  }, [isAllClients, viewMode]);

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "date",
    direction: "desc",
  });
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const { historyModalLimit } = useAppSettingsStore();

  // Inizializza o aggiorna lo stato quando si apre il modal per un nuovo articolo o cliente
  useEffect(() => {
    if (isOpen) {
      setSelectedClient(clientName);
      setIsAllClients(false);
      setSearchTerm(articleDescription);
      setSelectedYear("all");
      setSortConfig({ field: "date", direction: "desc" });
    }
  }, [isOpen, clientName, articleDescription]);

  // Carica i clienti dal DB se non forniti tramite props
  useEffect(() => {
    if (availableClients && availableClients.length > 0) return;
    let isMounted = true;
    void getDdtClientNames().then((names) => {
      if (isMounted) setDbClients(names);
    });
    return () => {
      isMounted = false;
    };
  }, [availableClients]);

  // Lista consolidata e ordinata di tutti i clienti
  const allClients = useMemo(() => {
    const base = availableClients && availableClients.length > 0 ? availableClients : dbClients;
    const set = new Set<string>(base);
    if (clientName && clientName.trim()) {
      set.add(clientName.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  }, [availableClients, dbClients, clientName]);

  // Carica i dati quando cambia deferredSearchTerm, il cliente selezionato o la modalità tutti i clienti
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const effectiveClient = isAllClients ? "" : selectedClient.trim();
        const data = await getClientArticleHistory({
          clientName: effectiveClient,
          description: deferredSearchTerm,
          code: deferredSearchTerm.trim() === articleDescription.trim() ? articleCode : undefined,
          onlyThisClient: !isAllClients && Boolean(effectiveClient),
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
  }, [isOpen, selectedClient, isAllClients, deferredSearchTerm, articleDescription, articleCode, historyModalLimit]);

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
        case "description":
          comparison = (a.description || "").localeCompare(b.description || "");
          break;
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
  }, [deferredSearchTerm, selectedClient, isAllClients, selectedYear, sortConfig]);

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
        direction: field === "client" || field === "destination" || field === "description" ? "asc" : "desc",
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
                {!isAllClients
                  ? `Storico vendite per ${selectedClient || clientName || "cliente"}`
                  : "Storico vendite su tutti i clienti"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Switch Modalità: Movimenti / Resoconto Articoli / Resoconto Clienti */}
            <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5 text-xs mr-1 shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode("movements")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors cursor-pointer ${
                  viewMode === "movements"
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
                title="Visualizza i singoli movimenti DDT riga per riga"
              >
                <ListFilter className="h-3.5 w-3.5" />
                <span>Movimenti ({filteredRows.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("articleResoconto")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors cursor-pointer ${
                  viewMode === "articleResoconto"
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
                title="Visualizza il resoconto con aggregazione articoli, medie, min/max e stampa PDF"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Resoconto Articoli</span>
              </button>
              {isAllClients && (
                <button
                  type="button"
                  onClick={() => setViewMode("clientResoconto")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors cursor-pointer ${
                    viewMode === "clientResoconto"
                      ? "bg-[var(--primary)] text-white shadow-sm"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                  title="Visualizza il resoconto aggregato per clienti con ranking e dettaglio articoli"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Resoconto Clienti</span>
                </button>
              )}
            </div>

            {/* Toggle Filtro Cliente */}
            <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setSelectedClient(clientName);
                  setIsAllClients(false);
                }}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  !isAllClients && selectedClient === clientName
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
                title={`Visualizza solo per ${clientName}`}
              >
                <User className="h-3.5 w-3.5" />
                <span className="max-w-[130px] truncate">{clientName || "Questo Cliente"}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAllClients(true)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  isAllClients
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
                title="Visualizza per tutti i clienti"
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>Tutti i Clienti</span>
              </button>
            </div>

            {/* Menù Scelta Cliente */}
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs shadow-sm">
              <Users className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
              <select
                aria-label="Scegli cliente"
                value={isAllClients ? "all" : selectedClient}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "all") {
                    setIsAllClients(true);
                  } else if (val) {
                    setSelectedClient(val);
                    setIsAllClients(false);
                  }
                }}
                className="bg-transparent outline-none font-medium text-[var(--foreground)] cursor-pointer max-w-[200px] truncate"
              >
                <option value="all" className="bg-[var(--card)] text-[var(--foreground)]">
                  Tutti i Clienti
                </option>
                {clientName && (
                  <option value={clientName} className="bg-[var(--card)] text-[var(--foreground)] font-semibold">
                    {clientName} (Corrente)
                  </option>
                )}
                {allClients.map((client) => {
                  if (client === clientName) return null;
                  return (
                    <option key={client} value={client} className="bg-[var(--card)] text-[var(--foreground)]">
                      {client}
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors cursor-pointer ml-1"
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

          {/* KPI metrics (solo in modalità movimenti) */}
          {viewMode === "movements" && stats && (
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

        {/* Contenuto Principale: Resoconto Clienti, Resoconto Articoli o Tabella Movimenti */}
        {isLoading ? (
          <div className="flex flex-1 min-h-0 items-center justify-center gap-2 text-sm text-[var(--muted-foreground)] bg-[var(--card)]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
            Caricamento storico vendite…
          </div>
        ) : error ? (
          <div className="flex-1 min-h-0 p-8 text-center text-sm text-red-400 bg-[var(--card)]">{error}</div>
        ) : viewMode === "clientResoconto" && isAllClients ? (
          <DDTClientResocontoView
            rows={filteredRows}
            selectedYear={selectedYear}
            searchTerm={searchTerm}
            mergeVariants={mergeVariants}
            onToggleMergeVariants={() => setMergeVariants((prev) => !prev)}
            onSelectClient={(targetClient) => {
              setSelectedClient(targetClient);
              setIsAllClients(false);
              setViewMode("articleResoconto");
            }}
          />
        ) : viewMode === "articleResoconto" ? (
          <DDTArticleResocontoView
            rows={filteredRows}
            clientName={selectedClient || clientName}
            isAllClients={isAllClients}
            selectedYear={selectedYear}
            searchTerm={searchTerm}
            mergeVariants={mergeVariants}
            onToggleMergeVariants={() => setMergeVariants((prev) => !prev)}
          />
        ) : (
          <div
            ref={tableContainerRef}
            onScroll={handleScroll}
            className="flex-1 min-h-0 overflow-auto bg-[var(--card)]"
          >
            {filteredRows.length === 0 ? (
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
                {!isAllClients
                  ? `Il cliente ${selectedClient || clientName} non ha DDT corrispondenti ai filtri impostati.`
                  : "Nessun DDT trovato nel database corrispondente ai filtri impostati."}
              </p>
              {!isAllClients && (
                <button
                  type="button"
                  onClick={() => setIsAllClients(true)}
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
                    className="px-3 py-2.5 text-left w-28 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
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
                    className="px-3 py-2.5 text-left w-28 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Numero DDT"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>DDT</span>
                      {renderSortIndicator("docNumber")}
                    </div>
                  </th>

                  {/* CLIENTE */}
                  {isAllClients && (
                    <th
                      onClick={() => handleSort("client")}
                      className="px-3 py-2.5 text-left w-52 max-w-[200px] cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                      title="Clicca per ordinare per Cliente"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span>CLIENTE</span>
                        {renderSortIndicator("client")}
                      </div>
                    </th>
                  )}

                  {/* DESTINAZIONE - Larghezza ridotta */}
                  <th
                    onClick={() => handleSort("destination")}
                    className="px-2.5 py-2.5 text-left w-28 max-w-[120px] cursor-pointer group hover:text-[var(--foreground)] transition-colors"
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
                    className="px-3 py-2.5 text-right w-24 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Quantità"
                  >
                    <div className="inline-flex items-center justify-end gap-1 w-full">
                      <span>QUANTITÀ</span>
                      {renderSortIndicator("quantity")}
                    </div>
                  </th>

                  {/* DESCRIZIONE - Tra quantità e prezzo list */}
                  <th
                    onClick={() => handleSort("description")}
                    className="px-3 py-2.5 text-left min-w-[180px] max-w-[300px] cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                    title="Clicca per ordinare per Descrizione"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>DESCRIZIONE</span>
                      {renderSortIndicator("description")}
                    </div>
                  </th>

                  {/* PREZZO LIST. */}
                  <th
                    onClick={() => handleSort("unitPrice")}
                    className="px-3 py-2.5 text-right w-28 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
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
                    className="px-2 py-2.5 text-center w-20 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
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
                    className="px-3 py-2.5 text-right w-28 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
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
                    className="px-3 py-2.5 text-right w-28 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
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
                    className="px-3 py-2.5 text-right w-28 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
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
                    className="px-3 py-2.5 text-right w-28 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
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
                    className="px-3 py-2.5 text-right w-24 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
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
                      <td className="px-3 py-2 font-sans font-medium text-[var(--foreground)] whitespace-nowrap">
                        {formatDdtViewDate(row.date)}
                      </td>

                      {/* DDT */}
                      <td className="px-3 py-2 whitespace-nowrap">
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
                      {isAllClients && (
                        <td className="px-3 py-2 font-sans font-medium text-[var(--foreground)] truncate max-w-[200px]" title={row.client}>
                          {row.client}
                        </td>
                      )}

                      {/* Destinazione - rimpicciolita con max-width e tooltip */}
                      <td
                        className="px-2.5 py-2 font-sans text-[var(--muted-foreground)] truncate max-w-[120px]"
                        title={row.destination || "—"}
                      >
                        {row.destination || "—"}
                      </td>

                      {/* Quantità */}
                      <td className="px-3 py-2 text-right font-bold text-[var(--foreground)] whitespace-nowrap">
                        {row.quantity} {row.unit && <span className="text-[10px] text-[var(--muted-foreground)] font-normal">{row.unit}</span>}
                      </td>

                      {/* Descrizione (tra Quantità e Prezzo Listino) */}
                      <td
                        className="px-3 py-2 font-sans font-medium text-[var(--foreground)] truncate max-w-[300px]"
                        title={row.description || ""}
                      >
                        {row.description}
                      </td>

                      {/* Prezzo Listino */}
                      <td className="px-3 py-2 text-right text-[var(--muted-foreground)] whitespace-nowrap">
                        {formatDdtMoney(row.unitPriceSubunits)}
                      </td>

                      {/* Sconto */}
                      <td className="px-2 py-2 text-center text-amber-400 whitespace-nowrap">
                        {row.discountPercent ? `${row.discountPercent}%` : "—"}
                      </td>

                      {/* Prezzo Netto Unitario */}
                      <td className="px-3 py-2 text-right font-bold text-sky-400 whitespace-nowrap">
                        {formatDdtMoney(Math.round(unitNet))}
                      </td>

                      {/* Totale Netto */}
                      <td className="px-3 py-2 text-right font-semibold text-[var(--foreground)] whitespace-nowrap">
                        {formatDdtMoney(row.netAmountSubunits)}
                      </td>

                      {/* Costo Acquisto */}
                      <td className="px-3 py-2 text-right text-[var(--muted-foreground)] whitespace-nowrap">
                        {row.purchasePriceSubunits > 0 ? formatDdtMoney(row.purchasePriceSubunits) : "—"}
                      </td>

                      {/* Margine € */}
                      <td
                        className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${
                          isPositiveRev ? "text-emerald-400" : isNegativeRev ? "text-rose-400" : "text-[var(--muted-foreground)]"
                        }`}
                      >
                        {formatDdtMoney(row.revenueSubunits)}
                      </td>

                      {/* Ricarico % */}
                      <td
                        className={`px-3 py-2 text-right font-medium whitespace-nowrap ${
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
        )}

        {/* Footer info tastiera */}
        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--background)] px-5 py-2 text-xs text-[var(--muted-foreground)]">
          <span className="flex items-center gap-1.5">
            <span>
              {viewMode === "clientResoconto" ? (
                <>
                  Modalità Resoconto Clienti attiva
                  {mergeVariants && <span className="text-sky-400 font-semibold ml-1">(Varianti accorpate attive)</span>}
                </>
              ) : viewMode === "articleResoconto" ? (
                <>
                  Modalità Resoconto Articoli attiva
                  {mergeVariants && <span className="text-sky-400 font-semibold ml-1">(Varianti accorpate attive)</span>}
                </>
              ) : (
                <>
                  {filteredRows.length} movimenti trovati
                  {selectedYear !== "all" && <span className="font-semibold text-[var(--primary)] ml-1">(Anno {selectedYear})</span>}
                </>
              )}
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

import { useEffect, useMemo, useRef, useState, useDeferredValue, useCallback } from "react";
import { LoaderCircle, RefreshCw, Search, X, FileText, Mail, ArrowUpDown, ArrowUp, ArrowDown, Calendar } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/cn";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { getDdtListViewRows, type DdtListViewRow } from "./services/ddtReadModelsRepository";
import { requestOpenDdt } from "./services/ddtNavigation";
import { formatDdtMoney, formatDdtNumber, formatDdtPercent, formatDdtViewDate, DDT_MONTH_OPTIONS, getRowMonth } from "./services/ddtViewFormatting";
import { normalizeSearch, tokenizeSearch, matchesSearchToken } from "@/shared/hooks/useFragmentSearch";
import { DDTQuickViewModal } from "./components/DDTQuickViewModal";
import { DDTEmailSendModal } from "./components/DDTEmailSendModal";

type IndexedDdtRow = DdtListViewRow & { _searchIndex: string };

export type DdtListSortField =
  | "date"
  | "docNumber"
  | "client"
  | "destination"
  | "taxableSubunits"
  | "purchaseSubunits"
  | "revenueSubunits"
  | "markupPercent"
  | "discountPercent"
  | "operator"
  | "reason"
  | "orderReference"
  | "payment";

export type SortDirection = "asc" | "desc";

const BATCH_SIZE = 150;

export function DDTListPage() {
  const [rows, setRows] = useState<DdtListViewRow[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [selectedDdtId, setSelectedDdtId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const isKeyboardNavRef = useRef(false);
  const activeRowElementRef = useRef<HTMLTableRowElement | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [sortField, setSortField] = useState<DdtListSortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [filterYear2026, setFilterYear2026] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const previousYears = useMemo(() => [currentYear - 1, currentYear - 2, currentYear - 3], [currentYear]);
  const openWindow = useWindowStore((state) => state.openWindow);

  const handleToggleSelectAll = () => {
    if (filtered.length === 0) return;
    if (selectedIds.size >= filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
    }
  };

  const handleToggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const load = async () => {
    setLoading(true); setError("");
    try { setRows(await getDdtListViewRows()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Impossibile leggere i DDT locali."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  // Aggiornamento reattivo quando la sincronizzazione in background scarica nuovi DDT
  useEffect(() => {
    const handleSyncUpdate = () => {
      void load();
    };
    window.addEventListener("ddt-data-updated", handleSyncUpdate);
    return () => window.removeEventListener("ddt-data-updated", handleSyncUpdate);
  }, []);

  // Scorciatoia F4 per focalizzare la ricerca rapida come in noManV1
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F4") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const indexedRows = useMemo<IndexedDdtRow[]>(() => {
    return rows.map((row) => ({
      ...row,
      _searchIndex: normalizeSearch(
        `${formatDdtNumber(row.docNumber, row.series)} ${row.date} ${formatDdtViewDate(row.date)} ${row.year} ${row.client} ${row.destination} ${row.orderReference} ${row.operator || ""} ${row.reason || ""}`
      ),
    }));
  }, [rows]);

  const yearCounts = useMemo(() => {
    const map: Record<number, number> = {};
    for (const r of rows) {
      if (r.year) {
        map[r.year] = (map[r.year] || 0) + 1;
      }
    }
    return map;
  }, [rows]);

  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  const filtered = useMemo(() => {
    return indexedRows.filter((row) => {
      if (filterYear2026 && row.year !== currentYear) {
        return false;
      }
      if (selectedMonth !== null) {
        const m = getRowMonth(row.date);
        if (m !== selectedMonth) return false;
      }
      if (searchTokens.length > 0) {
        return searchTokens.every((token) => matchesSearchToken(row._searchIndex, token));
      }
      return true;
    });
  }, [indexedRows, filterYear2026, selectedMonth, searchTokens, currentYear]);

  const handleSort = (field: DdtListSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      const defaultDescFields: DdtListSortField[] = [
        "date",
        "docNumber",
        "taxableSubunits",
        "purchaseSubunits",
        "revenueSubunits",
        "markupPercent",
        "discountPercent",
      ];
      setSortDirection(defaultDescFields.includes(field) ? "desc" : "asc");
    }
  };

  const renderSortIndicator = (field: DdtListSortField) => {
    if (sortField !== field) {
      return (
        <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-80 shrink-0 inline ml-1 transition-opacity" />
      );
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3 text-blue-400 shrink-0 inline ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 text-blue-400 shrink-0 inline ml-1" />
    );
  };

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date": {
          cmp = a.date.localeCompare(b.date);
          if (cmp === 0) cmp = (a.docNumber ?? 0) - (b.docNumber ?? 0);
          break;
        }
        case "docNumber": {
          cmp = (a.docNumber ?? 0) - (b.docNumber ?? 0);
          if (cmp === 0 && a.series && b.series) cmp = a.series.localeCompare(b.series);
          break;
        }
        case "client":
          cmp = (a.client || "").localeCompare(b.client || "", "it", { sensitivity: "base" });
          break;
        case "destination":
          cmp = (a.destination || "").localeCompare(b.destination || "", "it", { sensitivity: "base" });
          break;
        case "taxableSubunits":
          cmp = (a.taxableSubunits || 0) - (b.taxableSubunits || 0);
          break;
        case "purchaseSubunits":
          cmp = (a.purchaseSubunits || 0) - (b.purchaseSubunits || 0);
          break;
        case "revenueSubunits":
          cmp = (a.revenueSubunits || 0) - (b.revenueSubunits || 0);
          break;
        case "markupPercent": {
          const valA = a.markupPercent ?? -Infinity;
          const valB = b.markupPercent ?? -Infinity;
          cmp = valA - valB;
          break;
        }
        case "discountPercent": {
          const valA = a.discountPercent ?? -Infinity;
          const valB = b.discountPercent ?? -Infinity;
          cmp = valA - valB;
          break;
        }
        case "operator":
          cmp = (a.operator || "").localeCompare(b.operator || "", "it", { sensitivity: "base" });
          break;
        case "reason":
          cmp = (a.reason || "").localeCompare(b.reason || "", "it", { sensitivity: "base" });
          break;
        case "orderReference":
          cmp = (a.orderReference || "").localeCompare(b.orderReference || "", "it", { sensitivity: "base" });
          break;
        case "payment":
          cmp = (a.payment || "").localeCompare(b.payment || "", "it", { sensitivity: "base" });
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDirection]);

  // Reset del numero di righe visibili al cambio filtri o ordinamento e scroll in cima
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [deferredSearch, filterYear2026, selectedMonth, sortField, sortDirection]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 350) {
      setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, sorted.length));
    }
  };

  const visibleRows = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);

  useEffect(() => {
    if (isKeyboardNavRef.current && activeRowElementRef.current) {
      activeRowElementRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeRowId]);

  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "PageUp" && e.key !== "PageDown") return;
    if (visibleRows.length === 0) return;
    e.preventDefault();

    const currentIndex = activeRowId ? visibleRows.findIndex((r) => r.id === activeRowId) : -1;
    let nextIndex = currentIndex;

    if (e.key === "ArrowDown") {
      nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, visibleRows.length - 1);
    } else if (e.key === "ArrowUp") {
      nextIndex = currentIndex === -1 ? 0 : Math.max(currentIndex - 1, 0);
    } else if (e.key === "PageDown") {
      nextIndex = currentIndex === -1 ? 10 : Math.min(currentIndex + 15, visibleRows.length - 1);
    } else if (e.key === "PageUp") {
      nextIndex = currentIndex === -1 ? 0 : Math.max(currentIndex - 15, 0);
    }

    if (nextIndex !== -1 && nextIndex !== currentIndex) {
      isKeyboardNavRef.current = true;
      setActiveRowId(visibleRows[nextIndex].id);
    }
  };

  const currentQuickDdtIndex = useMemo(() => {
    if (!selectedDdtId) return -1;
    return sorted.findIndex((d) => d.id === selectedDdtId);
  }, [sorted, selectedDdtId]);

  const hasPrevQuickDdt = currentQuickDdtIndex > 0;
  const hasNextQuickDdt =
    currentQuickDdtIndex >= 0 && currentQuickDdtIndex < sorted.length - 1;

  const handlePrevQuickDdt = useCallback(() => {
    if (currentQuickDdtIndex > 0) {
      setSelectedDdtId(sorted[currentQuickDdtIndex - 1].id);
    }
  }, [currentQuickDdtIndex, sorted]);

  const handleNextQuickDdt = useCallback(() => {
    if (currentQuickDdtIndex >= 0 && currentQuickDdtIndex < sorted.length - 1) {
      setSelectedDdtId(sorted[currentQuickDdtIndex + 1].id);
    }
  }, [currentQuickDdtIndex, sorted]);

  const totals = useMemo(() => filtered.reduce((sum, row) => ({
    taxable: sum.taxable + (row.taxableSubunits || 0),
    purchase: sum.purchase + (row.purchaseSubunits || 0),
    revenue: sum.revenue + (row.revenueSubunits || 0),
  }), { taxable: 0, purchase: 0, revenue: 0 }), [filtered]);

  const markupPercent = totals.purchase > 0 ? (totals.revenue / totals.purchase) * 100 : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-[var(--foreground)]">
      {/* Search Input Bar */}
      <label className="flex h-9 w-full shrink-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-xs">
        <Search className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
        <input
          ref={searchInputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cerca numero DDT, data, mese (es. Settembre), cliente, destinazione o ordine… (F4 per cercare)"
          className="w-full bg-transparent outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); searchInputRef.current?.focus(); }}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-0.5 rounded cursor-pointer"
            title="Cancella ricerca"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      {/* Strip Barra Strumenti & Statistiche (Stile Dashboard) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs shadow-sm shrink-0 select-none">
        {/* Gruppo Sinistra: Badges Contatori, Filtri Rapidi & Finanziari */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. DDT Emesse Totale con Popup Hover Ultimi 3 Anni */}
          <div className="group relative flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--background)] border border-[var(--border)] hover:border-blue-500/50 transition-colors cursor-help">
            <span className="text-[10.5px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
              DDT emesse:
            </span>
            <span className="font-mono font-bold text-blue-400 text-xs">
              {rows.length.toLocaleString("it-IT")}
            </span>

            {/* Popup Hover Ultimi 3 Anni */}
            <div className="absolute top-full left-0 mt-1.5 z-50 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-150 p-3 bg-[#15171e] border border-[#2d313d] rounded-lg shadow-2xl text-xs min-w-[210px] pointer-events-none">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#2d313d]">
                <span className="font-bold text-[var(--foreground)] uppercase text-[10px] tracking-wider">
                  DDT Ultimi 3 Anni
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)] font-mono">Storico</span>
              </div>
              <div className="space-y-1.5">
                {previousYears.map((y) => (
                  <div key={y} className="flex items-center justify-between py-0.5">
                    <span className="text-[var(--muted-foreground)] font-mono">Anno {y}:</span>
                    <span className="font-mono font-bold text-blue-400">
                      {(yearCounts[y] || 0).toLocaleString("it-IT")}
                    </span>
                  </div>
                ))}
                <div className="pt-1.5 mt-1 border-t border-[#2d313d]/60 flex items-center justify-between">
                  <span className="text-[var(--muted-foreground)] font-mono text-[11px]">{currentYear} (in corso):</span>
                  <span className="font-mono font-bold text-emerald-400 text-[11px]">
                    {(yearCounts[currentYear] || 0).toLocaleString("it-IT")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. DDT Visibili */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--background)] border border-[var(--border)]">
            <span className="text-[10.5px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
              DDT visibili:
            </span>
            <span className={cn("font-mono font-bold text-xs", filtered.length !== rows.length ? "text-amber-400" : "text-emerald-400")}>
              {filtered.length.toLocaleString("it-IT")}
            </span>
          </div>

          <div className="h-4 w-px bg-[var(--border)] hidden sm:block" />

          {/* 3. Pulsante Anno in Corso (2026) */}
          <button
            type="button"
            onClick={() => setFilterYear2026((prev) => !prev)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer",
              filterYear2026
                ? "bg-blue-600 hover:bg-blue-500 text-white border border-blue-400 shadow-sm shadow-blue-500/20"
                : "bg-[var(--background)] hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
            )}
            title={filterYear2026 ? `Filtro ${currentYear} attivo (clicca per mostrare tutti gli anni)` : `Filtra solo DDT dell'anno ${currentYear}`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{currentYear}</span>
          </button>

          {/* 4. Menù a tendina Mesi */}
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border transition-colors",
            selectedMonth !== null
              ? "bg-blue-500/10 border-blue-500/40 text-blue-300"
              : "bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)]"
          )}>
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Mese:</span>
            <select
              value={selectedMonth ?? "all"}
              onChange={(e) => setSelectedMonth(e.target.value === "all" ? null : parseInt(e.target.value, 10))}
              className="bg-transparent text-xs text-[var(--foreground)] outline-none font-semibold cursor-pointer py-0.5 pr-1"
            >
              <option value="all" className="bg-[#181a20] text-white">Tutti i mesi</option>
              {DDT_MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value} className="bg-[#181a20] text-white">
                  {m.label}
                </option>
              ))}
            </select>
            {selectedMonth !== null && (
              <button
                type="button"
                onClick={() => setSelectedMonth(null)}
                className="text-[var(--muted-foreground)] hover:text-white ml-0.5 cursor-pointer p-0.5"
                title="Azzera filtro mese"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="h-4 w-px bg-[var(--border)] hidden md:block" />

          {/* 5. Totali Finanziari DDT List */}
          <div className="flex flex-wrap items-center gap-2.5 px-2.5 py-1 rounded-md bg-[var(--background)] border border-[var(--border)]">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Tot. Imponibile:</span>
              <span className="font-mono font-bold text-white text-xs">{formatDdtMoney(totals.taxable)}</span>
            </div>
            <div className="h-3 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Acquisto:</span>
              <span className="font-mono font-semibold text-zinc-300 text-xs">{formatDdtMoney(totals.purchase)}</span>
            </div>
            <div className="h-3 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Ricavo:</span>
              <span className="font-mono font-bold text-emerald-400 text-xs">{formatDdtMoney(totals.revenue)}</span>
            </div>
            <div className="h-3 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Ricavo %:</span>
              <span className="font-mono font-bold text-blue-400 text-xs">{formatDdtPercent(markupPercent)}</span>
            </div>
          </div>
        </div>

        {/* Gruppo Destra: Azioni Selezione & Refresh */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-bold text-[11px] border border-blue-500/30">
                {selectedIds.size} selezionat{selectedIds.size === 1 ? "o" : "i"}
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline cursor-pointer"
              >
                Deseleziona
              </button>
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(true)}
                className="h-6 px-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                title="Allega ad email i DDT selezionati e apri Outlook"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Allega ad email ({selectedIds.size})</span>
              </button>
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 px-2.5 cursor-pointer bg-[var(--background)] hover:bg-[var(--accent)] border border-[var(--border)]"
            onClick={() => void load()}
            disabled={loading}
            title="Ricarica elenco DDT"
          >
            {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-[var(--destructive)]">{error}</p>}

      {/* Tabella con stile dei popup (colorata, pulita e reattiva) */}
      {loading && rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />Caricamento DDT…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-md bg-[var(--card)]">
          Nessun DDT trovato per i filtri selezionati.
        </div>
      ) : (
        <div
          ref={tableContainerRef}
          tabIndex={0}
          onKeyDown={handleTableKeyDown}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-auto border border-[var(--border)] rounded-md bg-[var(--card)] outline-none"
        >
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)] text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
              <tr>
                <th className="px-2.5 py-2 text-center w-9">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size >= filtered.length}
                    onChange={handleToggleSelectAll}
                    className="rounded border-[var(--border)] cursor-pointer accent-blue-500"
                    title={selectedIds.size >= filtered.length ? "Deseleziona tutti" : "Seleziona tutti i DDT filtrati"}
                  />
                </th>
                <th
                  onClick={() => handleSort("date")}
                  className="px-3 py-2 text-left w-36 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">DATA {renderSortIndicator("date")}</span>
                </th>
                <th
                  onClick={() => handleSort("docNumber")}
                  className="px-3 py-2 text-left w-28 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">DDT {renderSortIndicator("docNumber")}</span>
                </th>
                <th
                  onClick={() => handleSort("client")}
                  className="px-3 py-2 text-left w-48 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">CLIENTE {renderSortIndicator("client")}</span>
                </th>
                <th
                  onClick={() => handleSort("destination")}
                  className="px-3 py-2 text-left cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">DESTINAZIONE {renderSortIndicator("destination")}</span>
                </th>
                <th
                  onClick={() => handleSort("taxableSubunits")}
                  className="px-3 py-2 text-right w-32 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    TOTALE IMPONIBILE {renderSortIndicator("taxableSubunits")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("purchaseSubunits")}
                  className="px-3 py-2 text-right w-32 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    PREZZO ACQUISTO {renderSortIndicator("purchaseSubunits")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("revenueSubunits")}
                  className="px-3 py-2 text-right w-28 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    RICAVO {renderSortIndicator("revenueSubunits")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("markupPercent")}
                  className="px-3 py-2 text-right w-24 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    RICARICO % {renderSortIndicator("markupPercent")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("discountPercent")}
                  className="px-2 py-2 text-center w-20 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-center">
                    SCONTO % {renderSortIndicator("discountPercent")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("operator")}
                  className="px-3 py-2 text-center w-24 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-center">
                    OPERATORE {renderSortIndicator("operator")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("reason")}
                  className="px-3 py-2 text-left w-32 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">CAUSALE {renderSortIndicator("reason")}</span>
                </th>
                <th
                  onClick={() => handleSort("orderReference")}
                  className="px-3 py-2 text-left w-36 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">ORDINE {renderSortIndicator("orderReference")}</span>
                </th>
                <th
                  onClick={() => handleSort("payment")}
                  className="px-3 py-2 text-left w-40 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">PAGAMENTO {renderSortIndicator("payment")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
              {visibleRows.map((row) => {
                const isPositiveRev = row.revenueSubunits > 0;
                const isNegativeRev = row.revenueSubunits < 0;
                const isSelected = selectedIds.has(row.id);
                const isRowActive = activeRowId === row.id;
                const isHighlighted = isRowActive || isSelected;

                return (
                  <tr
                    key={row.id}
                    ref={isRowActive ? activeRowElementRef : null}
                    onMouseDown={() => {
                      isKeyboardNavRef.current = false;
                      setActiveRowId(row.id);
                    }}
                    className={`group cursor-default ${
                      isHighlighted
                        ? "bg-[#1e5b87] text-white font-medium"
                        : "hover:bg-[var(--background)]/60"
                    }`}
                  >
                    {/* CHECKBOX */}
                    <td className="px-2.5 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleRow(row.id)}
                        className="rounded border-[var(--border)] cursor-pointer accent-sky-200"
                      />
                    </td>

                    {/* DATA */}
                    <td className={`px-3 py-2 font-sans font-medium whitespace-nowrap ${
                      isHighlighted ? "text-white" : "text-[var(--foreground)]"
                    }`}>
                      {formatDdtViewDate(row.date)}
                    </td>

                    {/* DDT (Link al popup) */}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDdtId(row.id);
                        }}
                        className={`font-bold hover:underline inline-flex items-center gap-1.5 cursor-pointer ${
                          isHighlighted ? "text-sky-200 hover:text-white" : "text-[var(--primary)]"
                        }`}
                        title={`Apri dettaglio DDT ${formatDdtNumber(row.docNumber, row.series)}`}
                      >
                        <FileText className="h-3 w-3" />
                        <span>{formatDdtNumber(row.docNumber, row.series)}</span>
                      </button>
                    </td>

                    {/* CLIENTE */}
                    <td
                      className={`px-3 py-2 font-sans font-medium truncate max-w-[200px] ${
                        isHighlighted ? "text-white" : "text-[var(--foreground)]"
                      }`}
                      title={row.client}
                    >
                      {row.client}
                    </td>

                    {/* DESTINAZIONE */}
                    <td
                      className={`px-3 py-2 font-sans truncate max-w-[220px] ${
                        isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]"
                      }`}
                      title={row.destination}
                    >
                      {row.destination || "—"}
                    </td>

                    {/* TOTALE IMPONIBILE */}
                    <td className={`px-3 py-2 text-right font-bold ${
                      isHighlighted ? "text-white" : "text-[var(--foreground)]"
                    }`}>
                      {formatDdtMoney(row.taxableSubunits)}
                    </td>

                    {/* PREZZO ACQUISTO */}
                    <td className={`px-3 py-2 text-right ${
                      isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]"
                    }`}>
                      {formatDdtMoney(row.purchaseSubunits)}
                    </td>

                    {/* RICAVO */}
                    <td
                      className={`px-3 py-2 text-right font-semibold ${
                        isPositiveRev
                          ? (isHighlighted ? "text-emerald-300 font-bold" : "text-emerald-400")
                          : isNegativeRev
                          ? (isHighlighted ? "text-rose-300 font-bold" : "text-rose-400")
                          : (isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]")
                      }`}
                    >
                      {formatDdtMoney(row.revenueSubunits)}
                    </td>

                    {/* RICARICO % */}
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        isPositiveRev
                          ? (isHighlighted ? "text-emerald-300 font-bold" : "text-emerald-400")
                          : isNegativeRev
                          ? (isHighlighted ? "text-rose-300 font-bold" : "text-rose-400")
                          : (isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]")
                      }`}
                    >
                      {formatDdtPercent(row.markupPercent)}
                    </td>

                    {/* SCONTO % */}
                    <td
                      className={`px-2 py-2 text-center font-medium ${
                        row.discountPercent && row.discountPercent > 0
                          ? (isHighlighted ? "text-amber-200 font-bold" : "text-amber-400")
                          : (isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]")
                      }`}
                    >
                      {formatDdtPercent(row.discountPercent)}
                    </td>

                    {/* OPERATORE */}
                    <td className={`px-3 py-2 text-center font-sans ${
                      isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]"
                    }`}>
                      {row.operator || "—"}
                    </td>

                    {/* CAUSALE */}
                    <td
                      className={`px-3 py-2 text-left font-sans truncate max-w-[140px] ${
                        isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]"
                      }`}
                      title={row.reason}
                    >
                      {row.reason || "—"}
                    </td>

                    {/* ORDINE */}
                    <td
                      className={`px-3 py-2 text-left font-sans truncate max-w-[160px] ${
                        isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]"
                      }`}
                      title={row.orderReference}
                    >
                      {row.orderReference || "—"}
                    </td>

                    {/* PAGAMENTO */}
                    <td
                      className={`px-3 py-2 text-left font-sans truncate max-w-[180px] ${
                        isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]"
                      }`}
                      title={row.payment}
                    >
                      {row.payment || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleRows.length < filtered.length && (
            <div className="p-3 text-center text-xs text-[var(--muted-foreground)] bg-[var(--background)]/40 border-t border-[var(--border)]/30">
              Visualizzati {visibleRows.length} di {filtered.length} DDT. Scorri verso il basso per caricarne altri.
            </div>
          )}
        </div>
      )}

      {/* Footer Totali */}
      <div className="flex h-7 shrink-0 items-center justify-end gap-5 border-t border-[var(--border)] px-2 text-[11px] font-semibold">
        <span>Imponibile {formatDdtMoney(totals.taxable)}</span>
        <span>Acquisto {formatDdtMoney(totals.purchase)}</span>
        <span className={totals.revenue >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
          Ricavo {formatDdtMoney(totals.revenue)}
        </span>
      </div>

      {/* Popup Dati Completi DDT con chiusura rapida Esc */}
      <DDTQuickViewModal
        isOpen={selectedDdtId !== null}
        onClose={() => setSelectedDdtId(null)}
        ddtId={selectedDdtId}
        onOpenInStudio={(id) => {
          requestOpenDdt(id);
          openWindow({ id: "ddt-studio", title: "DDT Studio (Pro)", componentId: "ddt-studio" });
        }}
        onNavigatePrev={handlePrevQuickDdt}
        onNavigateNext={handleNextQuickDdt}
        hasPrev={hasPrevQuickDdt}
        hasNext={hasNextQuickDdt}
        currentIndex={currentQuickDdtIndex}
        totalCount={sorted.length}
      />

      {/* Modale invio email con DDT allegati */}
      <DDTEmailSendModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        selectedDdtIds={Array.from(selectedIds)}
      />
    </div>
  );
}


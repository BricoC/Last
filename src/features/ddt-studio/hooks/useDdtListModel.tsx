import { useEffect, useMemo, useRef, useState, useDeferredValue, useCallback } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { getDdtListViewRows, type DdtListViewRow } from "../services/ddtReadModelsRepository";
import { formatDdtNumber, formatDdtViewDate, getRowMonth } from "../services/ddtViewFormatting";
import { normalizeSearch, tokenizeSearch, matchesSearchToken } from "@/shared/hooks/useFragmentSearch";

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

export function useDdtListModel() {
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

  return {
    rows, search, setSearch, searchInputRef, tableContainerRef, loading, error, visibleCount,
    selectedDdtId, setSelectedDdtId, selectedIds, setSelectedIds, activeRowId, setActiveRowId,
    isKeyboardNavRef, activeRowElementRef, isEmailModalOpen, setIsEmailModalOpen,
    filterYear2026, setFilterYear2026, selectedMonth, setSelectedMonth, currentYear, previousYears,
    openWindow, handleToggleSelectAll, handleToggleRow, load, yearCounts, filtered, sorted,
    handleSort, renderSortIndicator, handleScroll, visibleRows, handleTableKeyDown,
    currentQuickDdtIndex, hasPrevQuickDdt, hasNextQuickDdt, handlePrevQuickDdt, handleNextQuickDdt,
    totals, markupPercent,
  };
}

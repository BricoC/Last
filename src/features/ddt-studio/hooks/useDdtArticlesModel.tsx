import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { getDdtArticleViewRows, type DdtArticleViewRow } from "../services/ddtReadModelsRepository";
import { formatDdtNumber, formatDdtViewDate, getRowMonth } from "../services/ddtViewFormatting";
import { normalizeSearch, tokenizeSearch, matchesSearchToken } from "@/shared/hooks/useFragmentSearch";
import { parseDdtQuantity } from "../utils/ddtQuantity";

type IndexedArticleRow = DdtArticleViewRow & { _searchIndex: string };

export type DdtArticleSortField =
  | "date"
  | "docNumber"
  | "client"
  | "destination"
  | "unit"
  | "quantity"
  | "description"
  | "unitPriceSubunits"
  | "discountPercent"
  | "netAmountSubunits"
  | "vatRate";

export type SortDirection = "asc" | "desc";

const BATCH_SIZE = 150;

export function useDdtArticlesModel() {
  const [rows, setRows] = useState<DdtArticleViewRow[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [selectedDdtId, setSelectedDdtId] = useState<string | null>(null);
  const [selectedArticleForHistory, setSelectedArticleForHistory] = useState<DdtArticleViewRow | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const isKeyboardNavRef = useRef(false);
  const activeRowElementRef = useRef<HTMLTableRowElement | null>(null);
  const [sortField, setSortField] = useState<DdtArticleSortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [filterYear2026, setFilterYear2026] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const previousYears = useMemo(() => [currentYear - 1, currentYear - 2, currentYear - 3], [currentYear]);
  const openWindow = useWindowStore((state) => state.openWindow);

  const load = async () => {
    setLoading(true); setError("");
    try { setRows(await getDdtArticleViewRows()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Impossibile leggere le righe DDT locali."); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    void load();
    const handleDdtUpdated = () => {
      void load();
    };
    window.addEventListener("ddt-data-updated", handleDdtUpdated);
    return () => window.removeEventListener("ddt-data-updated", handleDdtUpdated);
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

  const indexedRows = useMemo<IndexedArticleRow[]>(() => {
    return rows.map((row) => ({
      ...row,
      _searchIndex: normalizeSearch(
        `${row.description} ${row.date} ${formatDdtViewDate(row.date)} ${row.year} ${row.client} ${row.destination} ${formatDdtNumber(row.docNumber, row.series)}`
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

  const availableClients = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.client) {
        const trimmed = r.client.trim();
        if (trimmed) set.add(trimmed);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  }, [rows]);

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

  const totalNetAmount = useMemo(() => {
    return filtered.reduce((sum, r) => sum + (r.netAmountSubunits || 0), 0);
  }, [filtered]);

  const handleSort = (field: DdtArticleSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      const defaultDescFields: DdtArticleSortField[] = [
        "date",
        "docNumber",
        "quantity",
        "unitPriceSubunits",
        "discountPercent",
        "netAmountSubunits",
        "vatRate",
      ];
      setSortDirection(defaultDescFields.includes(field) ? "desc" : "asc");
    }
  };

  const renderSortIndicator = (field: DdtArticleSortField) => {
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
        case "unit":
          cmp = (a.unit || "").localeCompare(b.unit || "", "it", { sensitivity: "base" });
          break;
        case "quantity": {
          const valA = parseDdtQuantity(a.quantity) ?? 0;
          const valB = parseDdtQuantity(b.quantity) ?? 0;
          cmp = valA - valB;
          break;
        }
        case "description":
          cmp = (a.description || "").localeCompare(b.description || "", "it", { sensitivity: "base" });
          break;
        case "unitPriceSubunits":
          cmp = (a.unitPriceSubunits || 0) - (b.unitPriceSubunits || 0);
          break;
        case "discountPercent": {
          const valA = parseFloat((a.discountPercent || "0").replace(",", ".")) || 0;
          const valB = parseFloat((b.discountPercent || "0").replace(",", ".")) || 0;
          cmp = valA - valB;
          break;
        }
        case "netAmountSubunits":
          cmp = (a.netAmountSubunits || 0) - (b.netAmountSubunits || 0);
          break;
        case "vatRate":
          cmp = (a.vatRate || 0) - (b.vatRate || 0);
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

  return {
    rows, search, setSearch, searchInputRef, tableContainerRef, loading, error, visibleCount,
    selectedDdtId, setSelectedDdtId, selectedArticleForHistory, setSelectedArticleForHistory,
    activeRowId, setActiveRowId, isKeyboardNavRef, activeRowElementRef, sortField, sortDirection,
    filterYear2026, setFilterYear2026, selectedMonth, setSelectedMonth, currentYear, previousYears,
    openWindow, load, yearCounts, filtered, totalNetAmount, handleSort, renderSortIndicator,
    handleScroll, visibleRows, handleTableKeyDown, availableClients,
  };
}

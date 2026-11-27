import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, Calendar, Plus, Trash2, LoaderCircle, X } from "lucide-react";
import type { DdtArchiveEntry } from "../models/ddt";
import { toDateIT } from "../utils/ddtCalculations";
import { isReturnDdt, matchesMarginFilter, type MarginFilter } from "../utils/ddtArchiveFilters";
import { DdtSidebarCollapsed, SIDEBAR_BATCH_SIZE } from "./DdtSidebarCollapsed";
import { DdtArchiveDeleteDialog } from "./DdtArchiveDeleteDialog";
import { DdtSidebarFilters } from "./DdtSidebarFilters";
import { useDdtArchiveDelete } from "../hooks/useDdtArchiveDelete";

import { cn } from "@/shared/utils/cn";

type ArchiveTab = "ddt" | "drafts";
export interface DDTStudioSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  ddtList: DdtArchiveEntry[];
  currentDdtId?: string;
  loadingDdtId?: string | null;
  onSelectDdt: (id: string) => void;
  onNewDdt: () => void;
  onDeleteDdt: (id: string) => Promise<boolean>;
  selectedYear: number | null;
  setSelectedYear: (y: number | null) => void;
  search: string;
  setSearch: (s: string) => void;
  isLoading?: boolean;
  availableYears?: number[];
}

export const DDTStudioSidebar: React.FC<DDTStudioSidebarProps> = React.memo(({
  sidebarOpen,
  setSidebarOpen,
  ddtList,
  currentDdtId,
  loadingDdtId = null,
  onSelectDdt,
  onNewDdt,
  onDeleteDdt,
  selectedYear,
  setSelectedYear,
  search,
  setSearch,
  isLoading = false,
  availableYears: propAvailableYears = [],
}) => {
  const [marginFilter, setMarginFilter] = useState<MarginFilter>("all");
  const [archiveTab, setArchiveTab] = useState<ArchiveTab>("ddt");
  const [searchTerm, setSearchTerm] = useState(search);
  const [visibleCount, setVisibleCount] = useState(SIDEBAR_BATCH_SIZE);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    pendingDelete,
    setPendingDelete,
    isDeleting,
    deleteError,
    setDeleteError,
    confirmDelete,
    cancelDelete,
  } = useDdtArchiveDelete(onDeleteDdt);

  // Sincronizza stato di ricerca locale quando cambia la prop
  useEffect(() => {
    setSearchTerm(search);
  }, [search]);

  // Debounce ricerca (200ms) per evitare query a raffica a ogni tasto premuto
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== search) {
        setSearch(searchTerm);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm, search, setSearch]);

  const currentYearNum = new Date().getFullYear();
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    if (propAvailableYears && propAvailableYears.length > 0) {
      propAvailableYears.forEach((y) => yearsSet.add(y));
    }
    // Assicuriamo sempre l'anno corrente, gli ultimi anni e almeno fino al 2023
    [currentYearNum, currentYearNum - 1, currentYearNum - 2, currentYearNum - 3, 2026, 2025, 2024, 2023].forEach((y) => {
      if (y >= 2020) yearsSet.add(y);
    });
    ddtList.forEach((doc) => {
      if (doc.year) yearsSet.add(doc.year);
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [propAvailableYears, ddtList, currentYearNum]);
  const drafts = ddtList.filter((doc) => doc.status === "bozza" || doc.doc_number === null);
  const issuedDdts = ddtList.filter((doc) => doc.status !== "bozza" && doc.doc_number !== null);
  const tabDocuments = archiveTab === "drafts" ? drafts : issuedDdts;
  const toPriceCount = tabDocuments.filter((doc) => matchesMarginFilter(doc, "without_margins")).length;
  const filteredDdtList = tabDocuments.filter((doc) => matchesMarginFilter(doc, marginFilter));

  // Resetta il conteggio visibile quando cambiano filtri o ricerca
  useEffect(() => {
    setVisibleCount(SIDEBAR_BATCH_SIZE);
  }, [searchTerm, selectedYear, marginFilter, archiveTab]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 200) {
      setVisibleCount((prev) => Math.min(prev + SIDEBAR_BATCH_SIZE, filteredDdtList.length));
    }
  };

  const displayedDdtList = useMemo(() => {
    return filteredDdtList.slice(0, visibleCount);
  }, [filteredDdtList, visibleCount]);

  // SE LA SIDEBAR È RIDOTTA (COLLAPSED): Mostra la colonnina verticale con i pill dei numeri DDT
  if (!sidebarOpen) {
    return (
      <DdtSidebarCollapsed
        documents={displayedDdtList}
        currentDdtId={currentDdtId}
        loadingDdtId={loadingDdtId}
        onSelectDdt={onSelectDdt}
        onNewDdt={onNewDdt}
        onExpand={() => setSidebarOpen(true)}
        onScroll={handleScroll}
      />
    );
  }
  // SE LA SIDEBAR È APERTA: Vista completa con ricerca, filtri e dettagli
  return (
    <aside className="w-64 border-r border-[var(--border)] bg-[var(--card)] flex flex-col h-full shrink-0 select-none transition-all duration-200 z-10">
      {/* Header Sidebar: Anno & Ricerca */}
      <div className="p-2.5 border-b border-[var(--border)] space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Selettore Anno */}
          <div className="flex items-center space-x-1.5 flex-1 min-w-0">
            <Calendar className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" />
            <select
              value={selectedYear === null ? "all" : selectedYear}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedYear(val === "all" ? null : parseInt(val, 10));
              }}
              className="w-full bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-xs rounded px-1.5 py-1 outline-none font-semibold cursor-pointer"
            >
              <option value="all">Tutti gli anni</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {isLoading && (
            <LoaderCircle className="w-3.5 h-3.5 text-[var(--primary)] animate-spin shrink-0" />
          )}
        </div>

        {/* Input Ricerca con debounce e pulsante clear */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] absolute left-2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cerca numero o cliente..."
            className="w-full pl-7 pr-7 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-medium"
          />
          {searchTerm.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setSearch("");
                searchInputRef.current?.focus();
              }}
              className="absolute right-1.5 p-0.5 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
              title="Cancella ricerca"
              aria-label="Cancella ricerca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <DdtSidebarFilters
        marginFilter={marginFilter}
        archiveTab={archiveTab}
        issuedCount={issuedDdts.length}
        draftCount={drafts.length}
        toPriceCount={toPriceCount}
        onMarginFilterChange={setMarginFilter}
        onArchiveTabChange={setArchiveTab}
      />
      {/* Lista Documenti DDT */}
      <div onScroll={handleScroll} className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/50">
        {filteredDdtList.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
                Caricamento archivio...
              </span>
            ) : archiveTab === "drafts" ? (
              "Nessuna bozza trovata."
            ) : (
              selectedYear ? `Nessun DDT trovato nel ${selectedYear}.` : "Nessun DDT trovato."
            )}
          </div>
        ) : (
          displayedDdtList.map((doc) => {
            const isSelected = currentDdtId === doc.id || loadingDdtId === doc.id;
            const isLoadingCurrent = loadingDdtId === doc.id;
            const isDraft = doc.status === "bozza" || doc.doc_number === null;
            const numberLabel = doc.doc_number === null
              ? "Bozza"
              : `${doc.series ? `${doc.series}/` : ""}${doc.doc_number}`;

            const isReturn = isReturnDdt(doc.transport_reason);
            const hasGreenMargins = !isReturn && doc.has_complete_margins;
            const marginColor = isReturn
              ? "border-purple-400/60 bg-purple-500/20 hover:bg-purple-500/30"
              : hasGreenMargins
              ? "border-[var(--archive-margin-border)] bg-[var(--archive-margin-background)] hover:bg-[var(--archive-margin-hover)]"
              : "border-[var(--border)] bg-[var(--background)]/50 hover:bg-[var(--background)]";
            return (
              <div
                key={doc.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectDdt(doc.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectDdt(doc.id);
                  }
                }}
                title={`DDT ${numberLabel} · ${doc.client_name} · ${toDateIT(doc.doc_date)}${isReturn ? " · Reso" : ""}`}
                className={cn(
                  "group mx-1 my-1 flex h-11 items-center gap-1.5 rounded-md border px-2.5 transition-all cursor-pointer select-none",
                  "active:scale-[0.985] active:brightness-95",
                  marginColor,
                  isSelected && "ring-2 ring-[var(--primary)] shadow-sm"
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 pointer-events-none">
                  <span className={cn(
                    "shrink-0 font-mono text-[11px] font-black",
                    isReturn
                      ? "text-purple-200"
                      : hasGreenMargins
                      ? "text-[var(--archive-margin-text)]"
                      : isDraft
                      ? "text-amber-400"
                      : "text-[var(--primary)]"
                  )}>
                    {isDraft ? "BOZ" : numberLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase text-[var(--foreground)]">
                    {doc.client_name || "Cliente non specificato"}
                  </span>
                  <span className={cn(
                    "shrink-0 font-mono text-[10px]",
                    isReturn
                      ? "text-purple-200/80"
                      : hasGreenMargins
                      ? "text-[var(--archive-margin-muted)]"
                      : "text-[var(--muted-foreground)]"
                  )}>
                    {toDateIT(doc.doc_date)}
                  </span>
                </div>

                {isLoadingCurrent ? (
                  <div className="p-1 shrink-0 flex items-center justify-center">
                    <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" aria-label="Caricamento DDT" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteError(false);
                      setPendingDelete(doc);
                    }}
                    title="Elimina DDT"
                    aria-label={`Elimina DDT ${numberLabel}`}
                    className={cn(
                      "shrink-0 rounded p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--destructive)]/15 hover:text-[var(--destructive)] cursor-pointer",
                      isReturn ? "text-purple-200" : hasGreenMargins && "text-[var(--archive-margin-text)]"
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Sidebar: Pulsante rapido Nuova DDT */}
      <div className="p-2 border-t border-[var(--border)] bg-[var(--card)]">
        <button
          type="button"
          onClick={onNewDdt}
          className="w-full py-1.5 px-3 rounded text-xs font-semibold bg-[var(--background)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--foreground)] flex items-center justify-center space-x-1.5 transition-colors cursor-pointer active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 text-[var(--primary)]" />
          <span>Crea Nuova Bozza</span>
        </button>
      </div>

      <DdtArchiveDeleteDialog document={pendingDelete} isDeleting={isDeleting} deleteError={deleteError} onCancel={cancelDelete} onConfirm={confirmDelete} />
    </aside>
  );
});

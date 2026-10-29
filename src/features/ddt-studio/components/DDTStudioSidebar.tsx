import React, { useState, useEffect, useMemo } from "react";
import { Search, Calendar, Plus, PanelLeftClose, ChevronRight, Trash2, LoaderCircle } from "lucide-react";
import { DdtArchiveEntry } from "../models/ddt";
import { toDateIT } from "../utils/ddtCalculations";
import { cn } from "@/shared/utils/cn";

type ArchiveTab = "ddt" | "drafts";

const SIDEBAR_BATCH_SIZE = 150;

export interface DDTStudioSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  ddtList: DdtArchiveEntry[];
  currentDdtId?: string;
  loadingDdtId?: string | null;
  onSelectDdt: (id: string) => void;
  onNewDdt: () => void;
  onDeleteDdt: (id: string) => Promise<boolean>;
  selectedYear: number;
  setSelectedYear: (y: number) => void;
  search: string;
  setSearch: (s: string) => void;
  isLoading?: boolean;
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
}) => {
  const [marginFilter, setMarginFilter] = useState<"all" | "with_margins" | "without_margins">("all");
  const [archiveTab, setArchiveTab] = useState<ArchiveTab>("ddt");
  const [pendingDelete, setPendingDelete] = useState<DdtArchiveEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [searchTerm, setSearchTerm] = useState(search);
  const [visibleCount, setVisibleCount] = useState(SIDEBAR_BATCH_SIZE);

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
  const availableYears = [currentYearNum, currentYearNum - 1, currentYearNum - 2];
  const drafts = ddtList.filter((doc) => doc.status === "bozza" || doc.doc_number === null);
  const issuedDdts = ddtList.filter((doc) => doc.status !== "bozza" && doc.doc_number !== null);
  const tabDocuments = archiveTab === "drafts" ? drafts : issuedDdts;
  const filteredDdtList = tabDocuments.filter((doc) =>
    marginFilter === "all" || (marginFilter === "with_margins" ? doc.has_complete_margins : !doc.has_complete_margins)
  );

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

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const deleted = await onDeleteDdt(pendingDelete.id);
      if (deleted) {
        setPendingDelete(null);
        setDeleteError(false);
      } else {
        setDeleteError(true);
      }
    } catch {
      setDeleteError(true);
    } finally {
      setIsDeleting(false);
    }
  };

  // SE LA SIDEBAR È RIDOTTA (COLLAPSED): Mostra la colonnina verticale con i pill dei numeri DDT
  if (!sidebarOpen) {
    return (
      <aside className="w-12 shrink-0 border-r border-[#2d3139] bg-[#16181d] flex flex-col items-center select-none transition-all duration-200 z-10">
        {/* Pulsante Espandi in cima */}
        <div className="h-10 border-b border-[#2d3139] w-full flex items-center justify-center">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            title="Espandi Archivio DDT"
            className="p-1.5 hover:bg-[#272a33] rounded text-blue-400 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Lista verticale compatta dei numeri DDT */}
        <div onScroll={handleScroll} className="flex-1 overflow-y-auto no-scrollbar py-1.5 space-y-1 w-full px-1 flex flex-col items-center">
          {displayedDdtList.map((doc) => {
            const isSelected = currentDdtId === doc.id || loadingDdtId === doc.id;
            const isConfirmed = doc.has_complete_margins;
            const numberLabel = doc.doc_number === null
              ? "Bozza"
              : `${doc.series ? `${doc.series}/` : ""}${doc.doc_number}`;

            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => onSelectDdt(doc.id)}
                title={`DDT ${numberLabel} - ${doc.client_name}`}
                className={cn(
                  "w-10 h-6 rounded flex items-center justify-center text-[10.5px] font-mono font-bold transition-all cursor-pointer active:scale-95",
                  isConfirmed
                    ? isSelected
                      ? "bg-[var(--archive-margin-text)] text-slate-950 shadow-md ring-2 ring-[var(--archive-margin-border)]"
                      : "bg-[var(--archive-margin-background)] border border-[var(--archive-margin-border)] text-[var(--archive-margin-text)] hover:bg-[var(--archive-margin-hover)] hover:text-white"
                    : isSelected
                    ? "bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300"
                    : "bg-amber-950/70 border border-amber-500/50 text-amber-300 hover:bg-amber-600 hover:text-white"
                )}
              >
                {loadingDdtId === doc.id ? (
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                ) : doc.doc_number === null ? (
                  "BOZ"
                ) : (
                  numberLabel
                )}
              </button>
            );
          })}
        </div>

        {/* Pulsante rapido Nuova DDT in fondo */}
        <div className="p-1 border-t border-[#2d3139] w-full flex justify-center">
          <button
            type="button"
            onClick={onNewDdt}
            title="Nuovo DDT"
            className="p-1.5 rounded hover:bg-[#272a33] text-zinc-400 hover:text-white transition-colors cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 text-blue-400" />
          </button>
        </div>
      </aside>
    );
  }

  // SE LA SIDEBAR È APERTA: Vista completa con ricerca, filtri e dettagli
  return (
    <aside className="w-64 border-r border-[var(--border)] bg-[var(--card)] flex flex-col h-full shrink-0 select-none transition-all duration-200 z-10">
      {/* Header Sidebar: Ricerca & Anno & Tasto Riduci */}
      <div className="p-2.5 border-b border-[var(--border)] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
              Archivio DDT
            </span>
            {isLoading && (
              <LoaderCircle className="w-3 h-3 text-[var(--primary)] animate-spin" />
            )}
          </div>

          <div className="flex items-center space-x-1">
            {/* Selettore Anno */}
            <div className="flex items-center space-x-1">
              <Calendar className="w-3 h-3 text-[var(--muted-foreground)]" />
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-xs rounded px-1.5 py-0.5 outline-none font-semibold cursor-pointer"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Tasto Riduci */}
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors cursor-pointer"
              title="Riduci a barra compatta"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Input Ricerca con debounce */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] absolute left-2 top-2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cerca numero o cliente..."
            className="w-full pl-7 pr-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-medium"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-0.5 border-b border-[var(--border)] bg-[var(--card)] p-1">
        {([
          ["all", "Tutti"],
          ["with_margins", "Con margini"],
          ["without_margins", "Senza margini"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMarginFilter(value)}
            className={cn(
              "rounded py-1 text-[9px] font-bold transition-colors cursor-pointer active:scale-95",
              marginFilter === value && value === "with_margins" ? "bg-[var(--archive-margin-border)] text-white" :
              marginFilter === value && value === "without_margins" ? "bg-amber-600 text-white" :
              marginFilter === value ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--background)]"
            )}
          >{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1 border-b border-[var(--border)] p-1">
        <button
          type="button"
          onClick={() => setArchiveTab("ddt")}
          className={cn("rounded px-2 py-1 text-[10px] font-bold cursor-pointer active:scale-95 transition-all", archiveTab === "ddt" ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--background)]")}
        >DDT <span className="opacity-75">{issuedDdts.length}</span></button>
        <button
          type="button"
          onClick={() => setArchiveTab("drafts")}
          className={cn("rounded px-2 py-1 text-[10px] font-bold cursor-pointer active:scale-95 transition-all", archiveTab === "drafts" ? "bg-amber-600 text-white" : "text-[var(--muted-foreground)] hover:bg-[var(--background)]")}
        >Bozze <span className="opacity-75">{drafts.length}</span></button>
      </div>

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
              `Nessun DDT trovato nel ${selectedYear}.`
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

            const marginColor = doc.has_complete_margins
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
                title={`DDT ${numberLabel} · ${doc.client_name} · ${toDateIT(doc.doc_date)}`}
                className={cn(
                  "group mx-1 my-1 flex h-11 items-center gap-1.5 rounded-md border px-2.5 transition-all cursor-pointer select-none",
                  "active:scale-[0.985] active:brightness-95",
                  marginColor,
                  isSelected && "ring-2 ring-[var(--primary)] shadow-sm"
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 pointer-events-none">
                  <span className={cn("shrink-0 font-mono text-[11px] font-black", doc.has_complete_margins ? "text-[var(--archive-margin-text)]" : isDraft ? "text-amber-400" : "text-[var(--primary)]")}>
                    {isDraft ? "BOZ" : numberLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase text-[var(--foreground)]">
                    {doc.client_name || "Cliente non specificato"}
                  </span>
                  <span className={cn("shrink-0 font-mono text-[10px]", doc.has_complete_margins ? "text-[var(--archive-margin-muted)]" : "text-[var(--muted-foreground)]")}>
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
                      doc.has_complete_margins && "text-[var(--archive-margin-text)]"
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

      {pendingDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" role="presentation">
          <section role="alertdialog" aria-modal="true" aria-labelledby="ddt-archive-delete-title" className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--foreground)] shadow-2xl">
            <h2 id="ddt-archive-delete-title" className="text-sm font-semibold">Eliminare il DDT?</h2>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">{pendingDelete.doc_number === null ? "La bozza" : `Il DDT n. ${pendingDelete.doc_number}`} di {pendingDelete.client_name || "cliente non specificato"} verrà rimosso dall’archivio.</p>
            <div className="mt-4 flex justify-end gap-2">
              {deleteError && <span className="mr-auto self-center text-[10px] text-red-400">Eliminazione non riuscita.</span>}
              <button type="button" disabled={isDeleting} onClick={() => { setPendingDelete(null); setDeleteError(false); }} className="rounded border border-[var(--border)] px-3 py-1.5 text-xs cursor-pointer">Annulla</button>
              <button type="button" disabled={isDeleting} onClick={confirmDelete} className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer">{isDeleting ? "Eliminazione…" : "Elimina"}</button>
            </div>
          </section>
        </div>
      )}
    </aside>
  );
});

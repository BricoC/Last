import React from "react";
import { Search, Calendar, Plus, PanelLeftClose, ChevronRight } from "lucide-react";
import { DdtDocument } from "../models/ddt";
import { toDateIT } from "../utils/ddtCalculations";
import { cn } from "@/shared/utils/cn";

export interface DDTStudioSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  ddtList: DdtDocument[];
  currentDdtId?: string;
  onSelectDdt: (id: string) => void;
  onNewDdt: () => void;
  selectedYear: number;
  setSelectedYear: (y: number) => void;
  search: string;
  setSearch: (s: string) => void;
  isLoading?: boolean;
}

export const DDTStudioSidebar: React.FC<DDTStudioSidebarProps> = ({
  sidebarOpen,
  setSidebarOpen,
  ddtList,
  currentDdtId,
  onSelectDdt,
  onNewDdt,
  selectedYear,
  setSelectedYear,
  search,
  setSearch,
  isLoading = false,
}) => {
  const currentYearNum = new Date().getFullYear();
  const availableYears = [currentYearNum, currentYearNum - 1, currentYearNum - 2];

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
            className="p-1.5 hover:bg-[#272a33] rounded text-blue-400 hover:text-white transition-colors cursor-default"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Lista verticale compatta dei numeri DDT */}
        <div className="flex-1 overflow-y-auto no-scrollbar py-1.5 space-y-1 w-full px-1 flex flex-col items-center">
          {ddtList.map((doc) => {
            const isSelected = currentDdtId === doc.id;
            const isConfirmed = doc.status === "confermato" && doc.doc_number !== null;

            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => onSelectDdt(doc.id)}
                title={`DDT ${doc.doc_number || "Bozza"} - ${doc.client_name}`}
                className={cn(
                  "w-10 h-6 rounded flex items-center justify-center text-[10.5px] font-mono font-bold transition-all cursor-default",
                  isConfirmed
                    ? isSelected
                      ? "bg-emerald-500 text-slate-950 shadow-md ring-2 ring-emerald-300"
                      : "bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-600 hover:text-white"
                    : isSelected
                    ? "bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300"
                    : "bg-amber-950/70 border border-amber-500/50 text-amber-300 hover:bg-amber-600 hover:text-white"
                )}
              >
                {doc.doc_number ? String(doc.doc_number) : "BOZ"}
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
            className="p-1.5 rounded hover:bg-[#272a33] text-zinc-400 hover:text-white transition-colors"
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
          </div>

          <div className="flex items-center space-x-1">
            {/* Selettore Anno */}
            <div className="flex items-center space-x-1">
              <Calendar className="w-3 h-3 text-[var(--muted-foreground)]" />
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-xs rounded px-1.5 py-0.5 outline-none font-semibold cursor-default"
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
              className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors cursor-default"
              title="Riduci a barra compatta"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Input Ricerca */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] absolute left-2 top-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca numero o cliente..."
            className="w-full pl-7 pr-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-medium"
          />
        </div>
      </div>

      {/* Lista Documenti DDT */}
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/50">
        {isLoading ? (
          <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">
            Caricamento archivio...
          </div>
        ) : ddtList.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">
            Nessun documento trovato nel {selectedYear}.
          </div>
        ) : (
          ddtList.map((doc) => {
            const isSelected = currentDdtId === doc.id;
            const isDraft = doc.status === "bozza" || doc.doc_number === null;

            return (
              <div
                key={doc.id}
                onClick={() => onSelectDdt(doc.id)}
                className={cn(
                  "p-2.5 cursor-default transition-colors flex flex-col space-y-1",
                  isSelected
                    ? "bg-[var(--background)] border-l-2 border-[var(--primary)] shadow-inner"
                    : "hover:bg-[var(--background)]/60"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span
                      className={cn(
                        "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded",
                        isDraft
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      )}
                    >
                      {isDraft ? "BOZZA" : `#${doc.doc_number}`}
                    </span>
                  </div>
                  <span className="text-[10.5px] text-[var(--muted-foreground)]">
                    {toDateIT(doc.doc_date)}
                  </span>
                </div>

                <div className="text-xs truncate text-[var(--foreground)] font-semibold uppercase">
                  {doc.client_name || "Cliente non specificato"}
                </div>

                <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)] pt-0.5">
                  <span className="truncate max-w-[120px]">
                    {doc.destination_city || doc.client_city || "—"}
                  </span>
                  <span className="font-mono text-[var(--foreground)] font-bold">
                    {doc.total_document ? `€ ${doc.total_document.formatIT(false)}` : "€ 0,00000"}
                  </span>
                </div>
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
          className="w-full py-1.5 px-3 rounded text-xs font-semibold bg-[var(--background)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--foreground)] flex items-center justify-center space-x-1.5 transition-colors cursor-default"
        >
          <Plus className="w-3.5 h-3.5 text-[var(--primary)]" />
          <span>Crea Nuova Bozza</span>
        </button>
      </div>
    </aside>
  );
};

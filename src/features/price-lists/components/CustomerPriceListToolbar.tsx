import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Filter,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ColumnVisibilityMenu } from "./ColumnVisibilityMenu";
import { ColumnDefinition } from "../hooks/useColumnVisibility";
import {
  CustomerPriceListTab,
  formatPriceListDateTime,
  NIER_EASTER_EGG_PHRASES,
} from "../utils/customerPriceListViewUtils";

export interface CustomerPriceListToolbarProps {
  search: string;
  onChangeSearch: (value: string) => void;
  onSearchFocus: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  onTriggerNier: () => void;
  trashCount: number;
  onOpenTrashModal: () => void;
  allColumns: ColumnDefinition[];
  visibleColumns: Record<string, boolean>;
  onToggleColumn: (colId: string) => void;
  onResetDefaultColumns: () => void;
  canEdit: boolean;
  undoCount: number;
  onUndo: () => void;
  unsavedCount: number;
  onDiscardAllChanges: () => void;
  isSaving: boolean;
  lastSavedTime: Date | null;
  onSaveAllPendingChanges: () => void;
  distinctClients: string[];
  selectedClientFilter: string;
  onClientFilterChange: (client: string) => void;
  activeTab: CustomerPriceListTab;
  onChangeTab: (tab: CustomerPriceListTab) => void;
  filteredCount: number;
  totalDbCount: number;
  error: string | null;
}

export const CustomerPriceListToolbar: React.FC<CustomerPriceListToolbarProps> = ({
  search,
  onChangeSearch,
  onSearchFocus,
  searchInputRef,
  onTriggerNier,
  trashCount,
  onOpenTrashModal,
  allColumns,
  visibleColumns,
  onToggleColumn,
  onResetDefaultColumns,
  canEdit,
  undoCount,
  onUndo,
  unsavedCount,
  onDiscardAllChanges,
  isSaving,
  lastSavedTime,
  onSaveAllPendingChanges,
  distinctClients,
  selectedClientFilter,
  onClientFilterChange,
  activeTab,
  onChangeTab,
  filteredCount,
  totalDbCount,
  error,
}) => {
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientDropdownSearch, setClientDropdownSearch] = useState("");
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isClientDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setIsClientDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isClientDropdownOpen]);

  const filteredDropdownClients = useMemo(() => {
    if (!clientDropdownSearch.trim()) return distinctClients;
    const term = clientDropdownSearch.toLowerCase();
    return distinctClients.filter((c) => c.toLowerCase().includes(term));
  }, [distinctClients, clientDropdownSearch]);

  return (
    <>
      <div className="p-2.5 border-b border-[var(--border)] bg-[var(--card)] flex items-center space-x-2.5 shrink-0">
        {/* Ricerca F4 a sinistra - flex-1 a tutta larghezza */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onFocus={onSearchFocus}
            onChange={(e) => onChangeSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const q = search.trim().toLowerCase();
                if (NIER_EASTER_EGG_PHRASES.includes(q)) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent?.stopImmediatePropagation?.();
                  onChangeSearch("");
                  onTriggerNier();
                }
              }
            }}
            placeholder="Cerca cliente, fornitore, descrizione, codice... (F4)"
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-medium"
          />
          {search && (
            <button
              type="button"
              onClick={() => onChangeSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Controlli e Filtri a destra */}
        <div className="flex items-center space-x-2 text-xs shrink-0">
          {/* Cestino */}
          <button
            type="button"
            onClick={onOpenTrashModal}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-xs font-semibold text-[var(--foreground)] transition-colors cursor-pointer"
            title="Cestino articoli eliminati"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Cestino</span>
            {trashCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-400 border border-rose-500/30">
                {trashCount}
              </span>
            )}
          </button>

          {/* Menu Colonne */}
          <ColumnVisibilityMenu
            columns={allColumns}
            visibleColumns={visibleColumns}
            onToggleColumn={onToggleColumn}
            onResetDefault={onResetDefaultColumns}
          />

          {/* Annulla Modifiche (Ctrl+Z) & Scarta Tutto */}
          {canEdit && (
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={onUndo}
                disabled={undoCount === 0}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
                  undoCount > 0
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 cursor-pointer shadow-xs"
                    : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] opacity-50 cursor-not-allowed"
                }`}
                title="Annulla ultima modifica (Ctrl+Z)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Annulla {undoCount > 0 ? `(${undoCount})` : ""}</span>
              </button>

              {unsavedCount > 0 && (
                <button
                  type="button"
                  onClick={onDiscardAllChanges}
                  className="px-2 py-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium transition-colors cursor-pointer"
                  title="Scarta tutte le modifiche non salvate"
                >
                  Scarta tutto
                </button>
              )}
            </div>
          )}

          {/* Salva Modifiche / Salvato */}
          {canEdit && (
            <button
              type="button"
              onClick={onSaveAllPendingChanges}
              disabled={unsavedCount === 0 || isSaving}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shadow-xs transition-colors ${
                unsavedCount > 0
                  ? "bg-amber-500 hover:bg-amber-600 text-black cursor-pointer animate-pulse font-bold"
                  : "bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] opacity-70 cursor-default"
              }`}
              title={
                unsavedCount > 0
                  ? `Salva ${unsavedCount} modifiche`
                  : lastSavedTime
                  ? `Salvato ${formatPriceListDateTime(lastSavedTime)}`
                  : "Tutte le modifiche sono salvate"
              }
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvataggio...</span>
                </>
              ) : unsavedCount > 0 ? (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Salva Modifiche ({unsavedCount})</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Salvato</span>
                </>
              )}
            </button>
          )}

          {/* Tendina Clienti Custom con tema scuro e ricerca integrata */}
          <div className="relative" ref={clientDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setIsClientDropdownOpen((prev) => !prev);
                setClientDropdownSearch("");
              }}
              className="flex items-center space-x-2 bg-[#181a20] hover:bg-[#20242c] px-2.5 py-1.5 rounded-md border border-[var(--border)] shadow-xs text-xs font-semibold text-gray-200 transition-colors"
            >
              <Filter className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate max-w-[160px]">
                {selectedClientFilter === "TUTTI"
                  ? `TUTTI I CLIENTI (${distinctClients.length})`
                  : selectedClientFilter}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0 ml-1" />
            </button>

            {isClientDropdownOpen && (
              <div className="absolute right-0 mt-1 w-80 bg-[#16181e] border border-[var(--border)] rounded-lg shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
                <div className="p-2 border-b border-[var(--border)]/70 bg-[#121418]">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      autoFocus
                      type="text"
                      value={clientDropdownSearch}
                      onChange={(e) => setClientDropdownSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsClientDropdownOpen(false);
                        }
                      }}
                      placeholder="Cerca cliente..."
                      className="w-full pl-8 pr-2.5 py-1 text-xs bg-[#1a1d24] border border-[var(--border)]/70 rounded text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto p-1 text-xs space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClientFilterChange("TUTTI");
                      setIsClientDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between font-semibold transition-colors ${
                      selectedClientFilter === "TUTTI"
                        ? "bg-sky-500/20 text-sky-300 font-bold"
                        : "text-gray-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span>TUTTI I CLIENTI ({distinctClients.length})</span>
                    {selectedClientFilter === "TUTTI" && <Check className="w-3.5 h-3.5 text-sky-400" />}
                  </button>

                  {filteredDropdownClients.map((client) => {
                    const isSelected = selectedClientFilter.toLowerCase() === client.toLowerCase();
                    return (
                      <button
                        key={client}
                        type="button"
                        onClick={() => {
                          onClientFilterChange(client);
                          setIsClientDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${
                          isSelected
                            ? "bg-sky-500/20 text-sky-300 font-bold"
                            : "text-gray-300 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span className="truncate">{client}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0 ml-2" />}
                      </button>
                    );
                  })}

                  {filteredDropdownClients.length === 0 && (
                    <div className="px-3 py-3 text-center text-xs text-gray-500 italic">
                      Nessun cliente trovato per &quot;{clientDropdownSearch}&quot;
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Tab */}
          <div className="flex items-center bg-[var(--background)] p-0.5 rounded-md border border-[var(--border)]">
            <button
              type="button"
              onClick={() => onChangeTab("tutti")}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                activeTab === "tutti"
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Tutti
            </button>
            <button
              type="button"
              onClick={() => onChangeTab("duplicati")}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                activeTab === "duplicati"
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Duplicati
            </button>
            <button
              type="button"
              onClick={() => onChangeTab("da_verificare")}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                activeTab === "da_verificare"
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Senza Prezzo
            </button>
          </div>

          {/* Conteggio righe */}
          <span className="px-2.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] font-semibold text-[var(--primary)] whitespace-nowrap">
            {filteredCount !== totalDbCount
              ? `Voci: ${filteredCount} di ${totalDbCount}`
              : `Voci: ${totalDbCount}`}
          </span>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-rose-500/15 border-b border-rose-500/30 flex items-center space-x-2 text-xs text-rose-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </>
  );
};

import React from "react";
import { RefreshCw, RotateCcw, Save, Trash2, X } from "lucide-react";
import { ColumnDefinition } from "../hooks/useColumnVisibility";
import { ColumnVisibilityMenu } from "./ColumnVisibilityMenu";

export interface CustomerEmbeddedHeaderBarProps {
  filteredCount: number;
  clientFilter: string;
  onChangeClientFilter: (value: string) => void;
  currentClientName?: string;
  trashCount: number;
  onOpenTrashModal: () => void;
  columns: ColumnDefinition[];
  visibleColumns: Record<string, boolean>;
  onToggleColumn: (colId: string) => void;
  onResetDefaultColumns: () => void;
  loading: boolean;
  isSaving: boolean;
  onReload: () => void;
  canEdit: boolean;
  undoCount: number;
  onUndo: () => void;
  unsavedCount: number;
  onSaveAllPendingChanges: () => void;
}

export const CustomerEmbeddedHeaderBar: React.FC<CustomerEmbeddedHeaderBarProps> = ({
  filteredCount,
  clientFilter,
  onChangeClientFilter,
  currentClientName,
  trashCount,
  onOpenTrashModal,
  columns,
  visibleColumns,
  onToggleColumn,
  onResetDefaultColumns,
  loading,
  isSaving,
  onReload,
  canEdit,
  undoCount,
  onUndo,
  unsavedCount,
  onSaveAllPendingChanges,
}) => {
  return (
    <div className="px-3 py-1.5 bg-amber-950/40 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-300 shrink-0 gap-2 flex-wrap select-none">
      {/* Sinistra: Titolo e Conteggio Voci */}
      <div className="flex items-center space-x-2">
        <span className="font-bold whitespace-nowrap flex items-center space-x-1.5">
          <span className="text-sm">Listino Clienti</span>
          <span className="text-[11px] opacity-80 font-normal">
            ({filteredCount} voci)
          </span>
        </span>
      </div>

      {/* Centro/Destra: Filtro Cliente + Pulsanti Azione */}
      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
        {/* Filtro Cliente */}
        <div className="flex items-center space-x-1.5">
          <span className="text-xs text-[var(--muted-foreground)] font-semibold">Filtro:</span>
          <div className="relative">
            <input
              type="text"
              value={clientFilter}
              onChange={(e) => onChangeClientFilter(e.target.value)}
              placeholder={currentClientName ? `Filtro: ${currentClientName}` : "Cerca cliente..."}
              className="pl-2.5 pr-6 py-0.5 text-xs bg-[var(--background)] border border-amber-500/40 rounded text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none w-48 font-medium"
            />
            {clientFilter && (
              <button
                type="button"
                onClick={() => onChangeClientFilter("")}
                className="absolute right-1.5 top-1 text-[var(--muted-foreground)] hover:text-white"
                title="Azzera filtro"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="h-4 w-px bg-amber-500/30" />

        {/* 1. Cestino */}
        <button
          type="button"
          onClick={onOpenTrashModal}
          className="flex items-center space-x-1.5 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-xs font-semibold text-[var(--foreground)] transition-colors cursor-pointer"
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

        {/* 2. Menu Colonne */}
        <ColumnVisibilityMenu
          columns={columns}
          visibleColumns={visibleColumns}
          onToggleColumn={onToggleColumn}
          onResetDefault={onResetDefaultColumns}
        />

        {/* 3. Ricarica */}
        <button
          type="button"
          onClick={onReload}
          disabled={loading || isSaving}
          className="p-1 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
          title="Ricarica da database"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>

        {/* 4. Annulla Modifiche */}
        {canEdit && (
          <button
            type="button"
            onClick={onUndo}
            disabled={undoCount === 0}
            className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-xs font-semibold transition-colors ${
              undoCount > 0
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 cursor-pointer"
                : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] opacity-50 cursor-not-allowed"
            }`}
            title="Annulla ultima modifica (Ctrl+Z)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Annulla {undoCount > 0 ? `(${undoCount})` : ""}</span>
          </button>
        )}

        {/* 5. Salva Modifiche */}
        {canEdit && (
          <button
            type="button"
            onClick={onSaveAllPendingChanges}
            disabled={unsavedCount === 0 && !isSaving}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-md border text-xs font-bold transition-all ${
              unsavedCount > 0
                ? "bg-amber-600 hover:bg-amber-500 text-white border-amber-400 shadow-md animate-pulse cursor-pointer"
                : "bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] opacity-60 cursor-not-allowed"
            }`}
            title="Salva tutte le modifiche"
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {isSaving
                ? "Salvataggio..."
                : `Salva Modifiche ${unsavedCount > 0 ? `(${unsavedCount})` : ""}`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

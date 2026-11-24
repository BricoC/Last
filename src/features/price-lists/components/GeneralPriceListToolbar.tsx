import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ALL_GENERAL_COLUMNS } from "../hooks/useColumnVisibility";
import { ColumnVisibilityMenu } from "./ColumnVisibilityMenu";
import { BulkEditToolbar, BulkOperationPayload } from "./BulkEditToolbar";
import { MGS_CODEC_FREQUENCIES } from "../utils/productListViewUtils";

export interface GeneralPriceListToolbarProps {
  search: string;
  onChangeSearch: (value: string) => void;
  onSearchFocus: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  onOpenMgsCodec: (freq: string) => void;
  visibleColumns: Record<string, boolean>;
  onToggleColumn: (colId: string) => void;
  onResetDefaultColumns: () => void;
  canEdit: boolean;
  undoCount: number;
  onUndo: () => void;
  dirtyCount: number;
  onDiscardAllChanges: () => void;
  isSaving: boolean;
  saveButtonTooltip: string;
  onSaveAllPendingChanges: () => void;
  trashCount: number;
  onOpenTrashModal: () => void;
  totalDbCount: number;
  selectedCount: number;
  totalFilteredCount: number;
  onClearSelection: () => void;
  onSelectAllFiltered: () => void;
  onApplyBulkAction: (payload: BulkOperationPayload) => Promise<void>;
  error: string | null;
  onClearError: () => void;
}

export const GeneralPriceListToolbar: React.FC<GeneralPriceListToolbarProps> = ({
  search,
  onChangeSearch,
  onSearchFocus,
  searchInputRef,
  onOpenMgsCodec,
  visibleColumns,
  onToggleColumn,
  onResetDefaultColumns,
  canEdit,
  undoCount,
  onUndo,
  dirtyCount,
  onDiscardAllChanges,
  isSaving,
  saveButtonTooltip,
  onSaveAllPendingChanges,
  trashCount,
  onOpenTrashModal,
  totalDbCount,
  selectedCount,
  totalFilteredCount,
  onClearSelection,
  onSelectAllFiltered,
  onApplyBulkAction,
  error,
  onClearError,
}) => {
  return (
    <>
      <div className="p-2.5 border-b border-[var(--border)] bg-[var(--card)] flex items-center space-x-3 shrink-0">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-2.5" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onFocus={onSearchFocus}
            onChange={(e) => onChangeSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const clean = search.trim();
                if (MGS_CODEC_FREQUENCIES.includes(clean)) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent?.stopImmediatePropagation?.();
                  onChangeSearch("");
                  onOpenMgsCodec(clean);
                }
              }
            }}
            placeholder="Quick Filter (F4 per cercare, Categoria, Codice, Fornitore, Descrizione)..."
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-medium"
          />
          {search && (
            <button
              type="button"
              onClick={() => onChangeSearch("")}
              className="absolute right-2 top-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2 text-xs shrink-0">
          <ColumnVisibilityMenu
            columns={ALL_GENERAL_COLUMNS}
            visibleColumns={visibleColumns}
            onToggleColumn={onToggleColumn}
            onResetDefault={onResetDefaultColumns}
          />

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

              {dirtyCount > 0 && (
                <button
                  type="button"
                  onClick={onDiscardAllChanges}
                  className="px-2 py-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium transition-colors"
                  title="Scarta tutte le modifiche non salvate"
                >
                  Scarta tutto
                </button>
              )}
            </div>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={onSaveAllPendingChanges}
              disabled={dirtyCount === 0 || isSaving}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors ${
                dirtyCount > 0
                  ? "bg-[var(--primary)] hover:opacity-90 text-white cursor-pointer"
                  : "bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] opacity-70 cursor-default"
              }`}
              title={saveButtonTooltip}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvataggio...</span>
                </>
              ) : dirtyCount > 0 ? (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Salva Modifiche ({dirtyCount})</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Salvato</span>
                </>
              )}
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={onOpenTrashModal}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-[var(--muted-foreground)] hover:text-rose-400 transition-colors shadow-sm cursor-pointer"
              title={`Cestino articoli eliminati (${trashCount}/50)`}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500/80" />
              <span className="text-xs font-semibold">Cestino</span>
              {trashCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {trashCount}
                </span>
              )}
            </button>
          )}

          <span className="px-2.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] font-semibold text-[var(--primary)]">
            Articoli: {totalDbCount}
          </span>
        </div>
      </div>

      {canEdit && (
        <BulkEditToolbar
          selectedCount={selectedCount}
          totalFilteredCount={totalFilteredCount}
          onClearSelection={onClearSelection}
          onSelectAllFiltered={onSelectAllFiltered}
          onApplyBulkAction={onApplyBulkAction}
        />
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border-b border-red-500/30 text-red-400 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={onClearError} className="p-1 hover:text-red-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
};

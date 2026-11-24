import React, { memo } from "react";
import { Receipt, RotateCcw, Trash2 } from "lucide-react";
import { ListinoGeneraleRow } from "../models/priceList";
import { calculateCostoMaggiorato } from "../utils/priceFormulas";
import {
  formatCostPrice,
  formatDateAaaaMmGg,
  formatPercentClean,
  formatSellingPrice,
} from "../utils/productListViewUtils";
import { GeneralPriceListEditableCell as EditableCell } from "./GeneralPriceListEditableCell";

export interface GeneralPriceListRowProps {
  item: ListinoGeneraleRow;
  isDirty: boolean;
  isSelected: boolean;
  isRowActive: boolean;
  shouldScroll?: boolean;
  activeColId: string | null;
  editingColId: string | null;
  initialEditChar?: string;
  canEdit: boolean;
  visibleColumns: Record<string, boolean>;
  onToggleSelectRow: (id: string) => void;
  onOpenHistory: (item: ListinoGeneraleRow) => void;
  onOpenInvoices: (item: ListinoGeneraleRow) => void;
  onDeleteRow: (item: ListinoGeneraleRow) => void;
  onSelectCell: (rowId: string, colId: string) => void;
  onStartEdit: (rowId: string, colId: string, char?: string) => void;
  onCommitCell: (rowId: string, colId: string, val: string) => void;
  onCancelEdit: () => void;
  onCellKeyDown: (e: React.KeyboardEvent, rowId: string, colId: string, currentValStr: string) => void;
}

export const GeneralPriceListRow = memo<GeneralPriceListRowProps>(
  ({
    item,
    isDirty,
    isSelected,
    isRowActive,
    shouldScroll = false,
    activeColId,
    editingColId,
    initialEditChar,
    canEdit,
    visibleColumns,
    onToggleSelectRow,
    onOpenHistory,
    onOpenInvoices,
    onDeleteRow,
    onSelectCell,
    onStartEdit,
    onCommitCell,
    onCancelEdit,
    onCellKeyDown,
  }) => {
    const costoMagg =
      item.r2 ?? calculateCostoMaggiorato(item.prezzo_acquisto, item.aumento, item.maga);
    const isHighlighted = isRowActive || isSelected;

    return (
      <tr
        className={`group cursor-default ${
          isHighlighted
            ? "bg-[#1e5b87] text-white font-medium"
            : isDirty
            ? "bg-amber-500/10 hover:bg-amber-500/15"
            : "hover:bg-[var(--background)]/70"
        }`}
      >
        <td
          className={`px-2 py-1 text-center sticky left-0 z-10 ${
            isHighlighted
              ? "bg-[#1e5b87] text-white"
              : isDirty
              ? "bg-amber-500/10"
              : "bg-[var(--card)]"
          }`}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelectRow(item.id)}
            className="rounded border-[var(--border)] accent-sky-200"
          />
        </td>

        {visibleColumns.history !== false && (
          <td className="px-2 py-1 text-center">
            <button
              type="button"
              onClick={() => onOpenHistory(item)}
              className={`p-1 rounded ${
                isHighlighted
                  ? "text-sky-100 hover:text-white hover:bg-sky-800"
                  : "text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--card)]"
              }`}
              title="Visualizza storico modifiche riga (max 15)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </td>
        )}

        {/* Mini colonna Fatture Elettroniche */}
        {visibleColumns.invoices !== false && (
          <td className="px-1.5 py-1 text-center">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onOpenInvoices(item);
              }}
              className={`p-1 rounded transition-colors cursor-pointer ${
                isHighlighted
                  ? "text-amber-200 hover:text-amber-100 hover:bg-amber-400/20"
                  : "text-amber-400/80 hover:text-amber-300 hover:bg-amber-400/10"
              }`}
              title={`Cerca "${item.codice_articolo || item.descrizione}" nelle Fatture Elettroniche`}
            >
              <Receipt className="w-3.5 h-3.5 mx-auto" />
            </button>
          </td>
        )}

        {/* Tasto Cestino Elimina Riga */}
        {visibleColumns.actions !== false && canEdit && (
          <td className="px-1.5 py-1 text-center">
            <button
              type="button"
              onClick={() => onDeleteRow(item)}
              className={`p-1 rounded ${
                isHighlighted
                  ? "text-sky-100 hover:text-red-200 hover:bg-red-600/40"
                  : "text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/15"
              }`}
              title={`Elimina articolo "${item.descrizione || item.codice_articolo || ""}"`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </td>
        )}

        {visibleColumns.cat !== false && (
          <EditableCell
            rowId={item.id}
            colId="cat"
            value={item.cat || ""}
            displayValue={item.cat || "—"}
            align="left"
            isActive={activeColId === "cat"}
            isEditing={editingColId === "cat"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "cat" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-sans font-medium truncate max-w-[90px] ${
              isHighlighted ? "text-white" : "text-[var(--foreground)]"
            }`}
          />
        )}

        {visibleColumns.fornitore !== false && (
          <EditableCell
            rowId={item.id}
            colId="fornitore"
            value={item.fornitore || ""}
            displayValue={item.fornitore || "—"}
            align="left"
            isActive={activeColId === "fornitore"}
            isEditing={editingColId === "fornitore"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "fornitore" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-sans font-medium truncate max-w-[85px] ${
              isHighlighted ? "text-white" : "text-[var(--foreground)]"
            }`}
          />
        )}

        {visibleColumns.codice_articolo !== false && (
          <EditableCell
            rowId={item.id}
            colId="codice_articolo"
            value={item.codice_articolo || ""}
            displayValue={item.codice_articolo || "—"}
            align="left"
            isActive={activeColId === "codice_articolo"}
            isEditing={editingColId === "codice_articolo"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "codice_articolo" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`truncate max-w-[95px] font-bold ${
              isHighlighted ? "text-white font-black" : "text-[var(--primary)]"
            }`}
          />
        )}

        {visibleColumns.data_ref !== false && (
          <EditableCell
            rowId={item.id}
            colId="data_ref"
            value={item.data_ref || ""}
            displayValue={formatDateAaaaMmGg(item.data_ref)}
            align="center"
            isActive={activeColId === "data_ref"}
            isEditing={false}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            canEdit={false}
            onSelectCell={onSelectCell}
            onStartEdit={() => {}}
            onCommit={() => {}}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`cursor-default select-none ${
              isHighlighted ? "text-sky-100 font-medium" : "text-[var(--muted-foreground)] opacity-80"
            }`}
          />
        )}

        {visibleColumns.descrizione !== false && (
          <EditableCell
            rowId={item.id}
            colId="descrizione"
            value={item.descrizione}
            displayValue={item.descrizione}
            align="left"
            isActive={activeColId === "descrizione"}
            isEditing={editingColId === "descrizione"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "descrizione" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-sans font-medium truncate max-w-[420px] ${
              isHighlighted ? "text-white font-medium" : "text-[var(--foreground)]"
            }`}
          />
        )}

        {visibleColumns.um !== false && (
          <EditableCell
            rowId={item.id}
            colId="um"
            value={item.um || "NR."}
            displayValue={item.um || "NR."}
            align="center"
            isActive={activeColId === "um"}
            isEditing={editingColId === "um"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "um" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`w-14 ${isHighlighted ? "text-sky-100 font-medium" : "text-[var(--muted-foreground)]"}`}
          />
        )}

        {visibleColumns.perc_pub !== false && (
          <EditableCell
            rowId={item.id}
            colId="perc_pub"
            value={item.perc_pub ?? ""}
            displayValue={formatPercentClean(item.perc_pub)}
            align="right"
            isActive={activeColId === "perc_pub"}
            isEditing={editingColId === "perc_pub"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "perc_pub" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={isHighlighted ? "text-white font-medium" : "text-[var(--muted-foreground)]"}
          />
        )}

        {visibleColumns.prezzo_pubblico !== false && (
          <EditableCell
            rowId={item.id}
            colId="prezzo_pubblico"
            value={item.prezzo_pubblico ?? ""}
            displayValue={formatSellingPrice(item.prezzo_pubblico)}
            align="right"
            isActive={activeColId === "prezzo_pubblico"}
            isEditing={editingColId === "prezzo_pubblico"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "prezzo_pubblico" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-medium ${isHighlighted ? "text-white font-bold" : "text-[var(--foreground)]"}`}
          />
        )}

        {visibleColumns.perc_prof !== false && (
          <EditableCell
            rowId={item.id}
            colId="perc_prof"
            value={item.perc_prof ?? ""}
            displayValue={formatPercentClean(item.perc_prof)}
            align="right"
            isActive={activeColId === "perc_prof"}
            isEditing={editingColId === "perc_prof"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "perc_prof" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={isHighlighted ? "text-white font-medium" : "text-[var(--muted-foreground)]"}
          />
        )}

        {visibleColumns.prezzo_profess !== false && (
          <EditableCell
            rowId={item.id}
            colId="prezzo_profess"
            value={item.prezzo_profess ?? ""}
            displayValue={formatSellingPrice(item.prezzo_profess)}
            align="right"
            isActive={activeColId === "prezzo_profess"}
            isEditing={editingColId === "prezzo_profess"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "prezzo_profess" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-medium ${isHighlighted ? "text-white font-bold" : "text-[var(--foreground)]"}`}
          />
        )}

        {visibleColumns.perc_fatt !== false && (
          <EditableCell
            rowId={item.id}
            colId="perc_fatt"
            value={item.perc_fatt ?? ""}
            displayValue={formatPercentClean(item.perc_fatt)}
            align="right"
            isActive={activeColId === "perc_fatt"}
            isEditing={editingColId === "perc_fatt"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "perc_fatt" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={isHighlighted ? "text-white font-medium" : "text-[var(--muted-foreground)]"}
          />
        )}

        {visibleColumns.prezzo_fattura !== false && (
          <EditableCell
            rowId={item.id}
            colId="prezzo_fattura"
            value={item.prezzo_fattura ?? ""}
            displayValue={formatSellingPrice(item.prezzo_fattura)}
            align="right"
            isActive={activeColId === "prezzo_fattura"}
            isEditing={editingColId === "prezzo_fattura"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "prezzo_fattura" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-bold border-x ${
              isHighlighted
                ? "bg-[#fef08a] text-slate-950 font-black border-amber-300 shadow-sm"
                : "bg-amber-500/15 text-amber-200 avorio-amber-col border-amber-500/20"
            }`}
          />
        )}

        {visibleColumns.prezzo_acquisto !== false && (
          <EditableCell
            rowId={item.id}
            colId="prezzo_acquisto"
            value={item.prezzo_acquisto ?? ""}
            displayValue={formatCostPrice(item.prezzo_acquisto)}
            align="right"
            isActive={activeColId === "prezzo_acquisto"}
            isEditing={editingColId === "prezzo_acquisto"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "prezzo_acquisto" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-bold border-x ${
              isHighlighted
                ? "bg-sky-800/60 text-white font-black border-sky-400/40"
                : "text-sky-200 font-semibold bg-sky-950/20 avorio-sky-col border-sky-500/20"
            }`}
          />
        )}

        {visibleColumns.perc_iva !== false && (
          <EditableCell
            rowId={item.id}
            colId="perc_iva"
            value={item.perc_iva ?? 0.22}
            displayValue={formatPercentClean(item.perc_iva)}
            align="center"
            isActive={activeColId === "perc_iva"}
            isEditing={editingColId === "perc_iva"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "perc_iva" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={isHighlighted ? "text-sky-100 font-medium" : "text-[var(--muted-foreground)]"}
          />
        )}

        {visibleColumns.aumento !== false && (
          <EditableCell
            rowId={item.id}
            colId="aumento"
            value={item.aumento ?? ""}
            displayValue={formatPercentClean(item.aumento)}
            align="right"
            isActive={activeColId === "aumento"}
            isEditing={editingColId === "aumento"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "aumento" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={
              isHighlighted
                ? "text-sky-100 font-medium bg-sky-800/30"
                : "text-[var(--muted-foreground)] bg-sky-950/10"
            }
          />
        )}

        {visibleColumns.maga !== false && (
          <EditableCell
            rowId={item.id}
            colId="maga"
            value={item.maga ?? ""}
            displayValue={formatPercentClean(item.maga)}
            align="right"
            isActive={activeColId === "maga"}
            isEditing={editingColId === "maga"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "maga" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={
              isHighlighted
                ? "text-sky-100 font-medium bg-sky-800/30"
                : "text-[var(--muted-foreground)] bg-sky-950/10"
            }
          />
        )}

        {visibleColumns.costo_maggiorato !== false && (
          <td
            className={`px-3 py-1 text-right font-bold border-x ${
              isHighlighted
                ? "bg-sky-800/60 text-white font-black border-sky-400/40"
                : "bg-sky-900/20 text-sky-200 avorio-sky-col border-sky-500/20"
            }`}
            title="Prezzo acquisto base maggiorato da aumento e magazzino"
          >
            {formatCostPrice(costoMagg)}
          </td>
        )}
      </tr>
    );
  }
);

import React from "react";
import { Plus } from "lucide-react";
import { ListinoGeneraleRow } from "../models/priceList";
import { calculateCostoMaggiorato } from "../utils/priceFormulas";
import {
  formatCostPrice,
  formatDateAaaaMmGg,
  formatPercentClean,
  formatSellingPrice,
} from "../utils/productListViewUtils";
import { GeneralPriceListEditableCell as EditableCell } from "./GeneralPriceListEditableCell";

export interface GeneralPriceListNewTopRowProps {
  newTopRow: ListinoGeneraleRow;
  activeCell: { rowId: string; colId: string } | null;
  editingCell: { rowId: string; colId: string } | null;
  initialEditChar?: string;
  canEdit: boolean;
  visibleColumns: Record<string, boolean>;
  onSelectCell: (rowId: string, colId: string) => void;
  onStartEdit: (rowId: string, colId: string, char?: string) => void;
  onCommitCell: (rowId: string, colId: string, val: string) => void;
  onCancelEdit: () => void;
  onCellKeyDown: (e: React.KeyboardEvent, rowId: string, colId: string, currentValStr: string) => void;
}

export const GeneralPriceListNewTopRow: React.FC<GeneralPriceListNewTopRowProps> = ({
  newTopRow,
  activeCell,
  editingCell,
  initialEditChar,
  canEdit,
  visibleColumns,
  onSelectCell,
  onStartEdit,
  onCommitCell,
  onCancelEdit,
  onCellKeyDown,
}) => {
  return (
    <tr className="bg-emerald-500/10 hover:bg-emerald-500/15 border-b-2 border-emerald-500/40">
      <td className="px-2 py-1 text-center bg-[var(--card)] sticky left-0 z-10">
        <span className="flex items-center justify-center text-emerald-400 font-bold text-[10px]">
          <Plus className="w-3.5 h-3.5" />
        </span>
      </td>

      {visibleColumns.history !== false && (
        <td className="px-2 py-1 text-center text-emerald-400/60 font-semibold text-[10px]">
          NUOVO
        </td>
      )}

      {visibleColumns.invoices !== false && (
        <td className="px-1.5 py-1 text-center text-[var(--muted-foreground)]/30">—</td>
      )}

      {visibleColumns.actions !== false && canEdit && (
        <td className="px-1.5 py-1 text-center text-[var(--muted-foreground)]/30">—</td>
      )}

      {visibleColumns.cat !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="cat"
          value={newTopRow.cat || ""}
          displayValue={newTopRow.cat || "Categoria..."}
          align="left"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "cat"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "cat"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "cat" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="italic text-emerald-200/70 avorio-emerald-hint"
        />
      )}

      {visibleColumns.fornitore !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="fornitore"
          value={newTopRow.fornitore || ""}
          displayValue={newTopRow.fornitore || "Fornitore..."}
          align="left"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "fornitore"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "fornitore"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "fornitore" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="italic text-emerald-200/70 avorio-emerald-hint"
        />
      )}

      {visibleColumns.codice_articolo !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="codice_articolo"
          value={newTopRow.codice_articolo || ""}
          displayValue={newTopRow.codice_articolo || "Codice..."}
          align="left"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "codice_articolo"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "codice_articolo"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "codice_articolo" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="italic font-bold text-emerald-400"
        />
      )}

      {visibleColumns.data_ref !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="data_ref"
          value={newTopRow.data_ref || ""}
          displayValue={formatDateAaaaMmGg(newTopRow.data_ref)}
          align="center"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "data_ref"}
          isEditing={false}
          canEdit={false}
          onSelectCell={onSelectCell}
          onStartEdit={() => {}}
          onCommit={() => {}}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="text-[var(--muted-foreground)] cursor-default select-none opacity-80"
        />
      )}

      {visibleColumns.descrizione !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="descrizione"
          value={newTopRow.descrizione}
          displayValue={newTopRow.descrizione || "Digita per inserire nuovo articolo..."}
          align="left"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "descrizione"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "descrizione"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "descrizione" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="italic text-emerald-200/80 avorio-emerald-hint font-medium"
        />
      )}

      {visibleColumns.um !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="um"
          value={newTopRow.um || "NR."}
          displayValue={newTopRow.um || "NR."}
          align="center"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "um"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "um"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "um" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
        />
      )}

      {visibleColumns.perc_pub !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="perc_pub"
          value={newTopRow.perc_pub ?? ""}
          displayValue={formatPercentClean(newTopRow.perc_pub)}
          align="right"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_pub"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_pub"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_pub" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
        />
      )}

      {visibleColumns.prezzo_pubblico !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="prezzo_pubblico"
          value={newTopRow.prezzo_pubblico ?? ""}
          displayValue={formatSellingPrice(newTopRow.prezzo_pubblico)}
          align="right"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "prezzo_pubblico"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_pubblico"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_pubblico" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
        />
      )}

      {visibleColumns.perc_prof !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="perc_prof"
          value={newTopRow.perc_prof ?? ""}
          displayValue={formatPercentClean(newTopRow.perc_prof)}
          align="right"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_prof"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_prof"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_prof" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
        />
      )}

      {visibleColumns.prezzo_profess !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="prezzo_profess"
          value={newTopRow.prezzo_profess ?? ""}
          displayValue={formatSellingPrice(newTopRow.prezzo_profess)}
          align="right"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "prezzo_profess"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_profess"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_profess" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
        />
      )}

      {visibleColumns.perc_fatt !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="perc_fatt"
          value={newTopRow.perc_fatt ?? ""}
          displayValue={formatPercentClean(newTopRow.perc_fatt)}
          align="right"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_fatt"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_fatt"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_fatt" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
        />
      )}

      {visibleColumns.prezzo_fattura !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="prezzo_fattura"
          value={newTopRow.prezzo_fattura ?? ""}
          displayValue={formatSellingPrice(newTopRow.prezzo_fattura)}
          align="right"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "prezzo_fattura"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_fattura"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_fattura" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="border-x border-amber-500/20"
        />
      )}

      {visibleColumns.prezzo_acquisto !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="prezzo_acquisto"
          value={newTopRow.prezzo_acquisto ?? ""}
          displayValue={formatCostPrice(newTopRow.prezzo_acquisto)}
          align="right"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "prezzo_acquisto"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_acquisto"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_acquisto" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="border-x border-sky-500/20"
        />
      )}

      {visibleColumns.perc_iva !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="perc_iva"
          value={newTopRow.perc_iva ?? 0.22}
          displayValue={formatPercentClean(newTopRow.perc_iva)}
          align="center"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_iva"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_iva"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_iva" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
        />
      )}

      {visibleColumns.aumento !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="aumento"
          value={newTopRow.aumento ?? ""}
          displayValue={formatPercentClean(newTopRow.aumento)}
          align="right"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "aumento"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "aumento"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "aumento" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
        />
      )}

      {visibleColumns.maga !== false && (
        <EditableCell
          rowId={newTopRow.id}
          colId="maga"
          value={newTopRow.maga ?? ""}
          displayValue={formatPercentClean(newTopRow.maga)}
          align="right"
          isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "maga"}
          isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "maga"}
          initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "maga" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
        />
      )}

      {visibleColumns.costo_maggiorato !== false && (
        <td className="px-3 py-1 text-right font-medium text-sky-200/70 border-x border-sky-500/20">
          {formatCostPrice(
            newTopRow.r2 ??
              calculateCostoMaggiorato(newTopRow.prezzo_acquisto, newTopRow.aumento, newTopRow.maga)
          )}
        </td>
      )}
    </tr>
  );
};

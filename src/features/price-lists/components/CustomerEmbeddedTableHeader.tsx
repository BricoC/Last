import React from "react";
import { ArrowUpDown, Plus } from "lucide-react";
import { ListinoClienteRow } from "../models/priceList";
import {
  CustomerPriceListSortField,
  formatClientEuro,
  getTodayAaaaMmGg,
} from "../utils/customerPriceListViewUtils";
import { formatEmbeddedPercent } from "../utils/customerEmbeddedViewUtils";
import { CustomerEmbeddedEditableCell as EditableCell } from "./CustomerEmbeddedEditableCell";

export interface CustomerEmbeddedTableHeaderProps {
  isVisible: (colId: string) => boolean;
  onToggleSort: (field: CustomerPriceListSortField) => void;
  canEdit: boolean;
  newTopRow: ListinoClienteRow;
  clientFilter: string;
  currentClientName?: string;
  activeCell: { rowId: string; colId: string } | null;
  editingCell: { rowId: string; colId: string } | null;
  initialEditChar?: string;
  onSelectCell: (rowId: string, colId: string) => void;
  onStartEdit: (rowId: string, colId: string, char?: string) => void;
  onCommitCell: (rowId: string, colId: string, val: string) => void;
  onCancelEdit: () => void;
  onCellKeyDown: (e: React.KeyboardEvent, rowId: string, colId: string, currentValStr: string) => void;
}

export const CustomerEmbeddedTableHeader: React.FC<CustomerEmbeddedTableHeaderProps> = ({
  isVisible,
  onToggleSort,
  canEdit,
  newTopRow,
  clientFilter,
  currentClientName,
  activeCell,
  editingCell,
  initialEditChar,
  onSelectCell,
  onStartEdit,
  onCommitCell,
  onCancelEdit,
  onCellKeyDown,
}) => {
  return (
    <thead className="bg-[var(--card)] border-b border-[var(--border)] text-[var(--muted-foreground)] font-mono text-[11px] sticky top-0 z-20 select-none shadow-sm">
      <tr>
        {isVisible("actions") && (
          <th className="px-2 py-1.5 text-center w-14 border-r border-[var(--border)]/40">#</th>
        )}
        {isVisible("cliente") && (
          <th
            className="px-2.5 py-1.5 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-40"
            onClick={() => onToggleSort("cliente")}
          >
            <div className="flex items-center justify-between">
              <span>CLIENTE</span>
              <ArrowUpDown className="w-3 h-3 ml-1" />
            </div>
          </th>
        )}
        {isVisible("fornitore") && (
          <th
            className="px-2.5 py-1.5 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28 text-sky-400"
            onClick={() => onToggleSort("fornitore")}
          >
            <div className="flex items-center justify-between">
              <span>FORNITORE</span>
              <ArrowUpDown className="w-3 h-3 ml-1" />
            </div>
          </th>
        )}
        {isVisible("codice_articolo") && (
          <th
            className="px-2.5 py-1.5 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-32"
            onClick={() => onToggleSort("codice_articolo")}
          >
            <div className="flex items-center justify-between">
              <span>CODICE ART.</span>
              <ArrowUpDown className="w-3 h-3 ml-1" />
            </div>
          </th>
        )}
        {isVisible("data_ref") && (
          <th
            className="px-2.5 py-1.5 text-center cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28 text-amber-300"
            onClick={() => onToggleSort("data_ref")}
          >
            <div className="flex items-center justify-center space-x-1">
              <span>DATA</span>
              <ArrowUpDown className="w-3 h-3" />
            </div>
          </th>
        )}
        {isVisible("descrizione") && (
          <th
            className="px-2.5 py-1.5 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 min-w-[220px]"
            onClick={() => onToggleSort("descrizione")}
          >
            <div className="flex items-center justify-between">
              <span>DESCRIZIONE ARTICOLO</span>
              <ArrowUpDown className="w-3 h-3 ml-1" />
            </div>
          </th>
        )}
        {isVisible("prezzo_fattura") && (
          <th
            className="px-2.5 py-1.5 text-right cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28 bg-emerald-950/15 text-emerald-400"
            onClick={() => onToggleSort("prezzo_fattura")}
          >
            <div className="flex items-center justify-end space-x-1">
              <span>PREZZO VENDITA (€)</span>
              <ArrowUpDown className="w-3 h-3" />
            </div>
          </th>
        )}
        {isVisible("perc_acquisto") && (
          <th
            className="px-2.5 py-1.5 text-right cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-24 bg-sky-950/15 text-sky-400"
            onClick={() => onToggleSort("perc_acquisto")}
          >
            <div className="flex items-center justify-end space-x-1">
              <span>% ACQUISTO</span>
              <ArrowUpDown className="w-3 h-3" />
            </div>
          </th>
        )}
        {isVisible("acquisto_eur") && (
          <th
            className="px-2.5 py-1.5 text-right cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28 bg-blue-950/15 text-blue-400"
            onClick={() => onToggleSort("acquisto_eur")}
          >
            <div className="flex items-center justify-end space-x-1">
              <span>ACQUISTO (€)</span>
              <ArrowUpDown className="w-3 h-3" />
            </div>
          </th>
        )}
        {isVisible("data_acquisto") && (
          <th
            className="px-2.5 py-1.5 text-center cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28"
            onClick={() => onToggleSort("data_acquisto")}
          >
            <div className="flex items-center justify-center space-x-1">
              <span>DATA ACQUISTO</span>
              <ArrowUpDown className="w-3 h-3" />
            </div>
          </th>
        )}
        {isVisible("acquisto_old") && (
          <th
            className="px-2.5 py-1.5 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-32"
            onClick={() => onToggleSort("acquisto_old")}
          >
            <div className="flex items-center justify-between">
              <span>ACQUISTO OLD</span>
              <ArrowUpDown className="w-3 h-3 ml-1" />
            </div>
          </th>
        )}
        {isVisible("ricarico") && (
          <th
            className="px-2.5 py-1.5 text-right cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28"
            onClick={() => onToggleSort("ricarico")}
          >
            <div className="flex items-center justify-end space-x-1">
              <span>RICARICO (%) OLD</span>
              <ArrowUpDown className="w-3 h-3" />
            </div>
          </th>
        )}
        {isVisible("note") && (
          <th className="px-2.5 py-1.5 text-left border-r border-[var(--border)]/40 w-32">NOTE</th>
        )}
        {isVisible("note1") && (
          <th className="px-2.5 py-1.5 text-left border-r border-[var(--border)]/40 w-28">NOTE 1</th>
        )}
        {isVisible("note2") && (
          <th className="px-2.5 py-1.5 text-left border-r border-[var(--border)]/40 w-28">NOTE 2</th>
        )}
      </tr>

      {/* RIGA FISSA SUPERIORE PER NUOVO ARTICOLO (newTopRow) - Solo per Alex o Admin */}
      {canEdit && (
        <tr className="bg-emerald-500/10 border-b-2 border-emerald-500/40 text-[var(--foreground)] font-mono text-[11px]">
          {isVisible("actions") && (
            <td className="px-2 py-1.5 text-center border-r border-[var(--border)]/40">
              <span title="Nuova riga: inserisci i dati per salvare" className="text-emerald-400 font-bold">
                <Plus className="w-4 h-4 mx-auto" />
              </span>
            </td>
          )}
          {isVisible("cliente") && (
            <EditableCell
              rowId={newTopRow.id}
              colId="cliente"
              value={newTopRow.cliente}
              displayValue={newTopRow.cliente || clientFilter.trim() || currentClientName || "+ Cliente..."}
              isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "cliente"}
              isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "cliente"}
              initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "cliente" ? initialEditChar : undefined}
              canEdit={canEdit}
              onSelectCell={onSelectCell}
              onStartEdit={onStartEdit}
              onCommit={onCommitCell}
              onCancel={onCancelEdit}
              onKeyDown={onCellKeyDown}
              className="font-bold text-amber-400 border-r border-[var(--border)]/40"
            />
          )}
          {isVisible("fornitore") && (
            <EditableCell
              rowId={newTopRow.id}
              colId="fornitore"
              value={newTopRow.fornitore}
              displayValue={newTopRow.fornitore || "+ Fornitore"}
              isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "fornitore"}
              isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "fornitore"}
              initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "fornitore" ? initialEditChar : undefined}
              canEdit={canEdit}
              onSelectCell={onSelectCell}
              onStartEdit={onStartEdit}
              onCommit={onCommitCell}
              onCancel={onCancelEdit}
              onKeyDown={onCellKeyDown}
              className="border-r border-[var(--border)]/40 text-sky-400 font-semibold"
            />
          )}
          {isVisible("codice_articolo") && (
            <EditableCell
              rowId={newTopRow.id}
              colId="codice_articolo"
              value={newTopRow.codice_articolo}
              displayValue={newTopRow.codice_articolo || "+ Codice"}
              isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "codice_articolo"}
              isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "codice_articolo"}
              initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "codice_articolo" ? initialEditChar : undefined}
              canEdit={canEdit}
              onSelectCell={onSelectCell}
              onStartEdit={onStartEdit}
              onCommit={onCommitCell}
              onCancel={onCancelEdit}
              onKeyDown={onCellKeyDown}
              className="border-r border-[var(--border)]/40 text-[var(--primary)]"
            />
          )}
          {isVisible("data_ref") && (
            <td className="px-2.5 py-1.5 text-center border-r border-[var(--border)]/40 text-[var(--muted-foreground)] font-mono whitespace-nowrap">
              {newTopRow.data_ref || getTodayAaaaMmGg()}
            </td>
          )}
          {isVisible("descrizione") && (
            <EditableCell
              rowId={newTopRow.id}
              colId="descrizione"
              value={newTopRow.descrizione}
              displayValue={newTopRow.descrizione || "+ Descrizione nuovo articolo..."}
              isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "descrizione"}
              isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "descrizione"}
              initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "descrizione" ? initialEditChar : undefined}
              canEdit={canEdit}
              onSelectCell={onSelectCell}
              onStartEdit={onStartEdit}
              onCommit={onCommitCell}
              onCancel={onCancelEdit}
              onKeyDown={onCellKeyDown}
              className="border-r border-[var(--border)]/40 font-medium"
            />
          )}
          {isVisible("prezzo_fattura") && (
            <EditableCell
              rowId={newTopRow.id}
              colId="prezzo_fattura"
              value={newTopRow.prezzo_fattura}
              displayValue={newTopRow.prezzo_fattura != null ? formatClientEuro(newTopRow.prezzo_fattura) : "0,00 €"}
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
              className="border-r border-[var(--border)]/40 font-bold text-emerald-400 bg-emerald-950/10"
            />
          )}
          {isVisible("perc_acquisto") && (
            <EditableCell
              rowId={newTopRow.id}
              colId="perc_acquisto"
              value={newTopRow.perc_acquisto}
              displayValue={newTopRow.perc_acquisto != null ? formatEmbeddedPercent(newTopRow.perc_acquisto) : "0%"}
              align="right"
              isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_acquisto"}
              isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_acquisto"}
              initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_acquisto" ? initialEditChar : undefined}
              canEdit={canEdit}
              onSelectCell={onSelectCell}
              onStartEdit={onStartEdit}
              onCommit={onCommitCell}
              onCancel={onCancelEdit}
              onKeyDown={onCellKeyDown}
              className="border-r border-[var(--border)]/40 text-sky-400 bg-sky-950/10"
            />
          )}
          {isVisible("acquisto_eur") && (
            <EditableCell
              rowId={newTopRow.id}
              colId="acquisto_eur"
              value={newTopRow.acquisto_eur}
              displayValue={newTopRow.acquisto_eur != null ? formatClientEuro(newTopRow.acquisto_eur) : "0,00 €"}
              align="right"
              isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "acquisto_eur"}
              isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "acquisto_eur"}
              initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "acquisto_eur" ? initialEditChar : undefined}
              canEdit={canEdit}
              onSelectCell={onSelectCell}
              onStartEdit={onStartEdit}
              onCommit={onCommitCell}
              onCancel={onCancelEdit}
              onKeyDown={onCellKeyDown}
              className="border-r border-[var(--border)]/40 font-bold text-blue-400 bg-blue-950/10"
            />
          )}
          {isVisible("data_acquisto") && (
            <EditableCell
              rowId={newTopRow.id}
              colId="data_acquisto"
              value={newTopRow.data_acquisto}
              displayValue={newTopRow.data_acquisto || "—"}
              align="center"
              isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "data_acquisto"}
              isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "data_acquisto"}
              initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "data_acquisto" ? initialEditChar : undefined}
              canEdit={canEdit}
              onSelectCell={onSelectCell}
              onStartEdit={onStartEdit}
              onCommit={onCommitCell}
              onCancel={onCancelEdit}
              onKeyDown={onCellKeyDown}
              className="border-r border-[var(--border)]/40 text-[var(--muted-foreground)] whitespace-nowrap"
            />
          )}
          {isVisible("acquisto_old") && (
            <EditableCell
              rowId={newTopRow.id}
              colId="acquisto_old"
              value={newTopRow.acquisto_old}
              displayValue={newTopRow.acquisto_old || "—"}
              isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "acquisto_old"}
              isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "acquisto_old"}
              initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "acquisto_old" ? initialEditChar : undefined}
              canEdit={canEdit}
              onSelectCell={onSelectCell}
              onStartEdit={onStartEdit}
              onCommit={onCommitCell}
              onCancel={onCancelEdit}
              onKeyDown={onCellKeyDown}
              className="border-r border-[var(--border)]/40 text-amber-400/80 text-xs truncate max-w-[160px]"
            />
          )}
          {isVisible("ricarico") && (
            <td className="px-2.5 py-1.5 text-right border-r border-[var(--border)]/40 text-[var(--muted-foreground)]">
              —
            </td>
          )}
          {isVisible("note") && (
            <EditableCell
              rowId={newTopRow.id}
              colId="note"
              value={newTopRow.note}
              displayValue={newTopRow.note || "+ Note"}
              isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "note"}
              isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "note"}
              initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "note" ? initialEditChar : undefined}
              canEdit={canEdit}
              onSelectCell={onSelectCell}
              onStartEdit={onStartEdit}
              onCommit={onCommitCell}
              onCancel={onCancelEdit}
              onKeyDown={onCellKeyDown}
              className="border-r border-[var(--border)]/40 text-[var(--muted-foreground)]"
            />
          )}
          {isVisible("note1") && (
            <EditableCell
              rowId={newTopRow.id}
              colId="note1"
              value={newTopRow.note1}
              displayValue={newTopRow.note1 || "+ Note 1"}
              isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "note1"}
              isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "note1"}
              initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "note1" ? initialEditChar : undefined}
              canEdit={canEdit}
              onSelectCell={onSelectCell}
              onStartEdit={onStartEdit}
              onCommit={onCommitCell}
              onCancel={onCancelEdit}
              onKeyDown={onCellKeyDown}
              className="border-r border-[var(--border)]/40 text-[var(--muted-foreground)]"
            />
          )}
          {isVisible("note2") && (
            <EditableCell
              rowId={newTopRow.id}
              colId="note2"
              value={newTopRow.note2}
              displayValue={newTopRow.note2 || "+ Note 2"}
              isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "note2"}
              isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "note2"}
              initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "note2" ? initialEditChar : undefined}
              canEdit={canEdit}
              onSelectCell={onSelectCell}
              onStartEdit={onStartEdit}
              onCommit={onCommitCell}
              onCancel={onCancelEdit}
              onKeyDown={onCellKeyDown}
              className="border-r border-[var(--border)]/40 text-[var(--muted-foreground)]"
            />
          )}
        </tr>
      )}
    </thead>
  );
};

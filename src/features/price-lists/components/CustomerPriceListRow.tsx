import React from "react";
import { Trash2 } from "lucide-react";
import { ListinoClienteRow } from "../models/priceList";
import {
  formatClientEuro,
  formatDateAaaaMmGg,
} from "../utils/customerPriceListViewUtils";
import { CustomerPriceListEditableCell as EditableCell } from "./CustomerPriceListEditableCell";

export interface CustomerPriceListRowProps {
  item: ListinoClienteRow;
  isDirty: boolean;
  isRowActive: boolean;
  shouldScrollRow: boolean;
  activeColId: string | null;
  editingColId: string | null;
  initialEditChar?: string;
  canEdit: boolean;
  isVisible: (colId: string) => boolean;
  onDeleteRow: (row: ListinoClienteRow) => void;
  onSelectCell: (rowId: string, colId: string, fromKeyboard?: boolean) => void;
  onStartEdit: (rowId: string, colId: string, char?: string) => void;
  onCommitCell: (rowId: string, colId: string, val: string, richHtml?: string | null) => void;
  onCancelEdit: () => void;
  onCellKeyDown: (
    e: React.KeyboardEvent,
    rowId: string,
    colId: string,
    currentValStr: string,
    currentRichHtml?: string | null
  ) => void;
}

export const CustomerPriceListRow: React.FC<CustomerPriceListRowProps> = ({
  item,
  isDirty,
  isRowActive,
  shouldScrollRow,
  activeColId,
  editingColId,
  initialEditChar,
  canEdit,
  isVisible,
  onDeleteRow,
  onSelectCell,
  onStartEdit,
  onCommitCell,
  onCancelEdit,
  onCellKeyDown,
}) => {
  return (
    <tr
      data-row-active={isRowActive ? "true" : undefined}
      className={`group cursor-default ${
        isRowActive
          ? "bg-[#1e5b87] text-white font-medium"
          : isDirty
          ? "bg-amber-500/10 hover:bg-amber-500/15"
          : "hover:bg-[var(--background)]/70"
      }`}
    >
      {isVisible("actions") && (
        <td
          className={`px-1.5 py-1 text-center border-r border-[var(--border)]/30 ${
            isRowActive ? "bg-[#1e5b87]" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => onDeleteRow(item)}
            className={`p-1 rounded ${
              isRowActive
                ? "text-sky-100 hover:text-white hover:bg-rose-500/40"
                : "text-[var(--muted-foreground)] hover:text-rose-400 hover:bg-rose-500/20"
            }`}
            title="Elimina e sposta nel Cestino"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      )}
      {isVisible("cliente") && (
        <EditableCell
          rowId={item.id}
          colId="cliente"
          value={item.cliente}
          displayValue={item.cliente.replace(/^LIST_/, "")}
          isActive={activeColId === "cliente"}
          isEditing={editingColId === "cliente"}
          shouldScroll={shouldScrollRow}
          initialChar={editingColId === "cliente" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className={`font-sans text-[12px] font-semibold border-r border-[var(--border)]/30 max-w-[170px] truncate ${
            isRowActive ? "text-amber-200" : "text-amber-400"
          }`}
        />
      )}
      {isVisible("fornitore") && (
        <EditableCell
          rowId={item.id}
          colId="fornitore"
          value={item.fornitore}
          displayValue={item.fornitore || "—"}
          isActive={activeColId === "fornitore"}
          isEditing={editingColId === "fornitore"}
          shouldScroll={shouldScrollRow}
          initialChar={editingColId === "fornitore" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className={`font-sans text-[12px] font-medium border-r border-[var(--border)]/30 uppercase truncate max-w-[120px] ${
            isRowActive ? "text-sky-100" : "text-sky-400"
          }`}
        />
      )}
      {isVisible("codice_articolo") && (
        <EditableCell
          rowId={item.id}
          colId="codice_articolo"
          value={item.codice_articolo}
          displayValue={item.codice_articolo || "—"}
          isActive={activeColId === "codice_articolo"}
          isEditing={editingColId === "codice_articolo"}
          shouldScroll={shouldScrollRow}
          initialChar={editingColId === "codice_articolo" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className={`border-r border-[var(--border)]/30 font-bold whitespace-nowrap ${
            isRowActive ? "text-white" : "text-[var(--primary)]"
          }`}
        />
      )}
      {isVisible("data_ref") && (
        <td
          onMouseDown={() => onSelectCell(item.id, "descrizione")}
          className={`px-2.5 py-1.5 text-center border-r border-[var(--border)]/30 font-mono whitespace-nowrap select-none cursor-pointer ${
            isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"
          }`}
          title="Data non modificabile manualmente (aggiornata in automatico alla modifica della riga)"
        >
          {formatDateAaaaMmGg(item.data_ref)}
        </td>
      )}
      {isVisible("descrizione") && (
        <EditableCell
          rowId={item.id}
          colId="descrizione"
          value={item.descrizione}
          displayValue={item.descrizione || "—"}
          richHtml={item.descrizione_rich}
          isActive={activeColId === "descrizione"}
          isEditing={editingColId === "descrizione"}
          shouldScroll={shouldScrollRow}
          initialChar={editingColId === "descrizione" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className={`font-sans text-[12px] border-r border-[var(--border)]/30 truncate max-w-[320px] ${
            isRowActive ? "text-white font-semibold" : "font-medium text-[var(--foreground)]"
          }`}
        />
      )}
      {isVisible("prezzo_fattura") && (
        <EditableCell
          rowId={item.id}
          colId="prezzo_fattura"
          value={item.prezzo_fattura}
          displayValue={formatClientEuro(item.prezzo_fattura)}
          align="right"
          isActive={activeColId === "prezzo_fattura"}
          isEditing={editingColId === "prezzo_fattura"}
          shouldScroll={shouldScrollRow}
          initialChar={editingColId === "prezzo_fattura" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className={`border-r border-[var(--border)]/30 font-bold ${
            isRowActive ? "text-emerald-200 bg-emerald-950/25" : "text-emerald-400 bg-emerald-950/10"
          }`}
        />
      )}
      {isVisible("perc_acquisto") && (
        <EditableCell
          rowId={item.id}
          colId="perc_acquisto"
          value={item.perc_acquisto}
          displayValue={item.perc_acquisto != null ? `${item.perc_acquisto}%` : "—"}
          align="right"
          isActive={activeColId === "perc_acquisto"}
          isEditing={editingColId === "perc_acquisto"}
          shouldScroll={shouldScrollRow}
          initialChar={editingColId === "perc_acquisto" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className={`border-r border-[var(--border)]/30 font-medium ${
            isRowActive ? "text-sky-100 bg-sky-900/30" : "text-sky-400 bg-sky-950/10"
          }`}
        />
      )}
      {isVisible("acquisto_eur") && (
        <EditableCell
          rowId={item.id}
          colId="acquisto_eur"
          value={item.acquisto_eur}
          displayValue={formatClientEuro(item.acquisto_eur)}
          align="right"
          isActive={activeColId === "acquisto_eur"}
          isEditing={editingColId === "acquisto_eur"}
          shouldScroll={shouldScrollRow}
          initialChar={editingColId === "acquisto_eur" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className={`border-r border-[var(--border)]/30 font-bold ${
            isRowActive ? "text-white bg-blue-900/30" : "text-blue-400 bg-blue-950/10"
          }`}
        />
      )}
      {isVisible("data_acquisto") && (
        <EditableCell
          rowId={item.id}
          colId="data_acquisto"
          value={item.data_acquisto}
          displayValue={item.data_acquisto || "—"}
          align="center"
          isActive={activeColId === "data_acquisto"}
          isEditing={editingColId === "data_acquisto"}
          shouldScroll={shouldScrollRow}
          initialChar={editingColId === "data_acquisto" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className={`border-r border-[var(--border)]/30 whitespace-nowrap ${
            isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"
          }`}
        />
      )}
      {isVisible("acquisto_old") && (
        <EditableCell
          rowId={item.id}
          colId="acquisto_old"
          value={item.acquisto_old || (item.prezzo_acquisto ? String(item.prezzo_acquisto) : "")}
          displayValue={item.acquisto_old || (item.prezzo_acquisto ? String(item.prezzo_acquisto) : "—")}
          isActive={activeColId === "acquisto_old"}
          isEditing={editingColId === "acquisto_old"}
          shouldScroll={shouldScrollRow}
          initialChar={editingColId === "acquisto_old" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className={`border-r border-[var(--border)]/30 text-xs font-medium truncate max-w-[180px] ${
            isRowActive ? "text-amber-200" : "text-amber-400/80"
          }`}
        />
      )}
      {isVisible("ricarico") && (
        <td
          onMouseDown={() => onSelectCell(item.id, "descrizione")}
          className={`px-2.5 py-1.5 text-right border-r border-[var(--border)]/30 cursor-pointer text-xs truncate max-w-[140px] ${
            isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"
          }`}
        >
          {item.ricarico != null && String(item.ricarico).trim() !== "" ? String(item.ricarico) : "—"}
        </td>
      )}
      {isVisible("note") && (
        <EditableCell
          rowId={item.id}
          colId="note"
          value={item.note}
          displayValue={item.note || "—"}
          isActive={activeColId === "note"}
          isEditing={editingColId === "note"}
          shouldScroll={shouldScrollRow}
          initialChar={editingColId === "note" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className={`border-r border-[var(--border)]/30 truncate max-w-[160px] ${
            isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"
          }`}
        />
      )}
      {isVisible("note1") && (
        <td
          onMouseDown={() => onSelectCell(item.id, "descrizione")}
          className={`px-2.5 py-1.5 text-left border-r border-[var(--border)]/30 truncate max-w-[120px] cursor-pointer ${
            isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"
          }`}
        >
          {item.note1 || "—"}
        </td>
      )}
      {isVisible("note2") && (
        <td
          onMouseDown={() => onSelectCell(item.id, "descrizione")}
          className={`px-2.5 py-1.5 text-left border-r border-[var(--border)]/30 truncate max-w-[120px] cursor-pointer ${
            isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"
          }`}
        >
          {item.note2 || "—"}
        </td>
      )}
    </tr>
  );
};

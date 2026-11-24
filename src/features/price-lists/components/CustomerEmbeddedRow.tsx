import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { ListinoClienteRow } from "../models/priceList";
import { formatClientEuro } from "../utils/customerPriceListViewUtils";
import { formatEmbeddedPercent } from "../utils/customerEmbeddedViewUtils";
import { CustomerEmbeddedEditableCell as EditableCell } from "./CustomerEmbeddedEditableCell";

export interface CustomerEmbeddedRowProps {
  item: ListinoClienteRow;
  isDirty: boolean;
  isNewlyAdded: boolean;
  activeColId: string | null;
  editingColId: string | null;
  initialEditChar?: string;
  canEdit: boolean;
  hasOnSelectArticle: boolean;
  isVisible: (colId: string) => boolean;
  onDeleteRow: (row: ListinoClienteRow) => void;
  onInsertIntoDdt: (row: ListinoClienteRow) => void;
  onSelectCell: (rowId: string, colId: string) => void;
  onStartEdit: (rowId: string, colId: string, char?: string) => void;
  onCommitCell: (rowId: string, colId: string, val: string) => void;
  onCancelEdit: () => void;
  onCellKeyDown: (e: React.KeyboardEvent, rowId: string, colId: string, currentValStr: string) => void;
}

export const CustomerEmbeddedRow: React.FC<CustomerEmbeddedRowProps> = ({
  item,
  isDirty,
  isNewlyAdded,
  activeColId,
  editingColId,
  initialEditChar,
  canEdit,
  hasOnSelectArticle,
  isVisible,
  onDeleteRow,
  onInsertIntoDdt,
  onSelectCell,
  onStartEdit,
  onCommitCell,
  onCancelEdit,
  onCellKeyDown,
}) => {
  return (
    <tr
      className={`hover:bg-amber-500/10 cursor-pointer transition-colors group ${
        isNewlyAdded
          ? "bg-emerald-500/5 font-semibold"
          : isDirty
          ? "bg-amber-500/5"
          : ""
      }`}
      title="Fai clic o doppio clic su una cella per modificarla"
    >
      {/* # Colonna Azioni: Cestino & Inserisci nel DDT */}
      {isVisible("actions") && (
        <td className="px-1.5 py-1 text-center border-r border-[var(--border)]/30 w-14">
          <div className="flex items-center justify-center space-x-1">
            {canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteRow(item);
                }}
                className="p-1 rounded text-[var(--muted-foreground)] hover:text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
                title="Elimina articolo (sposta nel Cestino)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            {hasOnSelectArticle && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onInsertIntoDdt(item);
                }}
                className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                title="Inserisci articolo nel DDT"
              >
                <Plus className="w-3.5 h-3.5 font-bold" />
              </button>
            )}
          </div>
        </td>
      )}

      {isVisible("cliente") && (
        <EditableCell
          rowId={item.id}
          colId="cliente"
          value={item.cliente}
          displayValue={item.cliente}
          isActive={activeColId === "cliente"}
          isEditing={editingColId === "cliente"}
          initialChar={editingColId === "cliente" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="font-bold text-amber-400 border-r border-[var(--border)]/30 truncate max-w-[140px]"
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
          initialChar={editingColId === "fornitore" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="border-r border-[var(--border)]/30 text-sky-400 font-semibold truncate max-w-[120px]"
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
          initialChar={editingColId === "codice_articolo" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="border-r border-[var(--border)]/30 text-[var(--muted-foreground)] truncate max-w-[110px]"
        />
      )}

      {isVisible("data_ref") && (
        <td className="px-2.5 py-1.5 text-center border-r border-[var(--border)]/30 text-[var(--muted-foreground)] font-mono whitespace-nowrap">
          {item.data_ref || "—"}
        </td>
      )}

      {isVisible("descrizione") && (
        <EditableCell
          rowId={item.id}
          colId="descrizione"
          value={item.descrizione}
          displayValue={item.descrizione}
          isActive={activeColId === "descrizione"}
          isEditing={editingColId === "descrizione"}
          initialChar={editingColId === "descrizione" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="border-r border-[var(--border)]/30 text-[var(--foreground)] truncate max-w-[280px] font-sans text-[12px] font-medium"
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
          initialChar={editingColId === "prezzo_fattura" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="border-r border-[var(--border)]/30 font-bold text-emerald-400 bg-emerald-950/10"
        />
      )}

      {isVisible("perc_acquisto") && (
        <EditableCell
          rowId={item.id}
          colId="perc_acquisto"
          value={item.perc_acquisto}
          displayValue={formatEmbeddedPercent(item.perc_acquisto)}
          align="right"
          isActive={activeColId === "perc_acquisto"}
          isEditing={editingColId === "perc_acquisto"}
          initialChar={editingColId === "perc_acquisto" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="border-r border-[var(--border)]/30 text-sky-400 bg-sky-950/10"
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
          initialChar={editingColId === "acquisto_eur" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="border-r border-[var(--border)]/30 font-bold text-blue-400 bg-blue-950/10"
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
          initialChar={editingColId === "data_acquisto" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="border-r border-[var(--border)]/30 text-[var(--muted-foreground)] whitespace-nowrap"
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
          initialChar={editingColId === "acquisto_old" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="border-r border-[var(--border)]/30 text-amber-400/80 text-xs truncate max-w-[160px]"
        />
      )}

      {isVisible("ricarico") && (
        <td className="px-2.5 py-1.5 text-right border-r border-[var(--border)]/30 text-[var(--muted-foreground)] text-xs truncate max-w-[140px]">
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
          initialChar={editingColId === "note" ? initialEditChar : undefined}
          canEdit={canEdit}
          onSelectCell={onSelectCell}
          onStartEdit={onStartEdit}
          onCommit={onCommitCell}
          onCancel={onCancelEdit}
          onKeyDown={onCellKeyDown}
          className="border-r border-[var(--border)]/30 text-[var(--muted-foreground)] truncate max-w-[140px]"
        />
      )}

      {isVisible("note1") && (
        <td className="px-2.5 py-1.5 text-left border-r border-[var(--border)]/30 text-[var(--muted-foreground)] truncate max-w-[110px]">
          {item.note1 || "—"}
        </td>
      )}

      {isVisible("note2") && (
        <td className="px-2.5 py-1.5 text-left border-r border-[var(--border)]/30 text-[var(--muted-foreground)] truncate max-w-[110px]">
          {item.note2 || "—"}
        </td>
      )}
    </tr>
  );
};

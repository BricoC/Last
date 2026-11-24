import React from "react";
import { ArrowUpDown, Receipt, Trash2 } from "lucide-react";
import { ProductListSortField } from "../utils/productListViewUtils";

export interface GeneralPriceListTableHeaderProps {
  visibleColumns: Record<string, boolean>;
  canEdit: boolean;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onToggleSort: (field: ProductListSortField) => void;
}

export const GeneralPriceListTableHeader: React.FC<GeneralPriceListTableHeaderProps> = ({
  visibleColumns,
  canEdit,
  allSelected,
  onToggleSelectAll,
  onToggleSort,
}) => {
  return (
    <thead className="bg-[var(--background)] sticky top-0 z-20 text-[11px] uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)] shadow-sm">
      <tr>
        <th className="px-2 py-2 w-8 text-center bg-[var(--background)] sticky left-0 z-20">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleSelectAll}
            className="rounded border-[var(--border)]"
          />
        </th>

        {visibleColumns.history !== false && (
          <th className="px-2 py-2 w-10 text-center" title="Storico modifiche riga">
            A...
          </th>
        )}

        {/* Mini colonna Fatture Elettroniche */}
        {visibleColumns.invoices !== false && (
          <th
            className="px-1.5 py-2 w-8 min-w-[32px] max-w-[32px] text-center"
            title="Cerca nelle Fatture Elettroniche (prezzi d'acquisto e storico fornitori)"
          >
            <Receipt className="w-3.5 h-3.5 mx-auto text-amber-400" />
          </th>
        )}

        {/* Colonna Cestino per eliminare riga singola */}
        {visibleColumns.actions !== false && canEdit && (
          <th className="px-1.5 py-2 w-8 text-center" title="Elimina riga articolo">
            <Trash2 className="w-3.5 h-3.5 mx-auto text-[var(--muted-foreground)]" />
          </th>
        )}

        {visibleColumns.cat !== false && (
          <th
            className="px-2 py-2 w-20 max-w-[90px] cursor-pointer hover:text-[var(--foreground)]"
            onClick={() => onToggleSort("cat")}
          >
            <div className="flex items-center space-x-1">
              <span>CAT.</span>
              <ArrowUpDown className="w-3 h-3" />
            </div>
          </th>
        )}

        {visibleColumns.fornitore !== false && (
          <th
            className="px-2.5 py-2 w-20 max-w-[85px] cursor-pointer hover:text-[var(--foreground)]"
            onClick={() => onToggleSort("fornitore")}
          >
            <div className="flex items-center space-x-1">
              <span>FORNITORE</span>
              <ArrowUpDown className="w-3 h-3" />
            </div>
          </th>
        )}

        {visibleColumns.codice_articolo !== false && (
          <th
            className="px-2.5 py-2 w-24 max-w-[95px] cursor-pointer hover:text-[var(--foreground)]"
            onClick={() => onToggleSort("codice_articolo")}
          >
            <div className="flex items-center space-x-1">
              <span>ARTICOLO</span>
              <ArrowUpDown className="w-3 h-3" />
            </div>
          </th>
        )}

        {visibleColumns.data_ref !== false && (
          <th className="px-2 py-2 text-center w-20">DATA</th>
        )}

        {visibleColumns.descrizione !== false && (
          <th
            className="px-3 py-2 cursor-pointer hover:text-[var(--foreground)] min-w-[280px]"
            onClick={() => onToggleSort("descrizione")}
          >
            <div className="flex items-center space-x-1">
              <span>DESCRIZIONE</span>
              <ArrowUpDown className="w-3 h-3 text-[var(--primary)]" />
            </div>
          </th>
        )}

        {visibleColumns.um !== false && (
          <th className="px-2 py-2 text-center w-14">U.M.</th>
        )}

        {visibleColumns.perc_pub !== false && (
          <th className="px-2.5 py-2 text-right w-16">% PUB</th>
        )}

        {visibleColumns.prezzo_pubblico !== false && (
          <th
            className="px-3 py-2 text-right w-24 cursor-pointer hover:text-[var(--foreground)]"
            onClick={() => onToggleSort("prezzo_pubblico")}
          >
            PUBBLICO
          </th>
        )}

        {visibleColumns.perc_prof !== false && (
          <th className="px-2.5 py-2 text-right w-16">% PROF</th>
        )}

        {visibleColumns.prezzo_profess !== false && (
          <th
            className="px-3 py-2 text-right w-24 cursor-pointer hover:text-[var(--foreground)]"
            onClick={() => onToggleSort("prezzo_profess")}
          >
            PROFESS
          </th>
        )}

        {visibleColumns.perc_fatt !== false && (
          <th className="px-2.5 py-2 text-right w-16">% FATT</th>
        )}

        {visibleColumns.prezzo_fattura !== false && (
          <th
            className="px-3 py-2 text-right w-28 bg-amber-500/20 text-amber-300 avorio-amber-col font-bold border-x border-amber-500/30 cursor-pointer"
            onClick={() => onToggleSort("prezzo_fattura")}
          >
            FATTURA
          </th>
        )}

        {/* ACQUISTO BASE (posizionato tra FATTURA ed IVA) */}
        {visibleColumns.prezzo_acquisto !== false && (
          <th
            className="px-3 py-2 text-right w-28 cursor-pointer hover:text-[var(--foreground)] bg-sky-950/30 text-sky-200 avorio-sky-col font-semibold border-x border-sky-500/30"
            onClick={() => onToggleSort("prezzo_acquisto")}
          >
            <div className="flex items-center justify-end space-x-1">
              <span>ACQ. BASE</span>
              <ArrowUpDown className="w-3 h-3" />
            </div>
          </th>
        )}

        {/* IVA */}
        {visibleColumns.perc_iva !== false && (
          <th className="px-2.5 py-2 text-center w-14">IVA</th>
        )}

        {/* Colonne create posizionate DOPO IVA */}
        {visibleColumns.aumento !== false && (
          <th className="px-2.5 py-2 text-right w-16 bg-sky-950/20 avorio-sky-soft">AUMENTO %</th>
        )}

        {visibleColumns.maga !== false && (
          <th className="px-2.5 py-2 text-right w-16 bg-sky-950/20 avorio-sky-soft">MAGAZZINO %</th>
        )}

        {visibleColumns.costo_maggiorato !== false && (
          <th
            className="px-3 py-2 text-right w-28 bg-sky-900/40 text-sky-300 avorio-sky-col font-bold border-x border-sky-500/30 cursor-pointer"
            onClick={() => onToggleSort("costo_maggiorato")}
            title="Costo base + Aumento% + Magazzino% (Riferimento per tutti i prezzi)"
          >
            <div className="flex items-center justify-end space-x-1">
              <span>ACQ. MAGG.</span>
              <ArrowUpDown className="w-3 h-3" />
            </div>
          </th>
        )}
      </tr>
    </thead>
  );
};

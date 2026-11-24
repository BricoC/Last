import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, FileText } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { SupplierInvoiceItem } from "../services/electronicInvoicesService";
import { AddToOrderManagerItem } from "./AddToOrderManagerModal";
import {
  formatInvoiceEuro,
  IndexedItemRow,
  ItemSortField,
  SelectedInvoiceCell,
} from "../utils/invoiceViewUtils";

export interface InvoiceItemsTableProps {
  visibleItems: IndexedItemRow[];
  totalItemsCount: number;
  sortedItemsCount: number;
  showExtendedColumns: boolean;
  sortField: ItemSortField;
  sortAsc: boolean;
  onToggleSort: (field: ItemSortField) => void;
  activeRowKey: string | number | null;
  selectedCell: SelectedInvoiceCell | null;
  activeRowElementRef: React.MutableRefObject<HTMLTableRowElement | null>;
  tableContainerRef: React.RefObject<HTMLDivElement>;
  onSelectRow: (rowKey: string | number) => void;
  onSelectCell: (cell: SelectedInvoiceCell) => void;
  onCopyText: (text: string) => void;
  onOpenDetail: (item: SupplierInvoiceItem) => void;
  onAddToOrder: (item: AddToOrderManagerItem) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const InvoiceItemsTable: React.FC<InvoiceItemsTableProps> = ({
  visibleItems,
  totalItemsCount,
  sortedItemsCount,
  showExtendedColumns,
  sortField,
  sortAsc,
  onToggleSort,
  activeRowKey,
  selectedCell,
  activeRowElementRef,
  tableContainerRef,
  onSelectRow,
  onSelectCell,
  onCopyText,
  onOpenDetail,
  onAddToOrder,
  onKeyDown,
  onScroll,
}) => {
  const renderSortIndicator = (field: ItemSortField) => {
    if (sortField === field) {
      return sortAsc ? (
        <ArrowUp className="w-3 h-3 text-[var(--primary)] shrink-0" />
      ) : (
        <ArrowDown className="w-3 h-3 text-[var(--primary)] shrink-0" />
      );
    }
    return <ArrowUpDown className="w-2.5 h-2.5 opacity-25 group-hover:opacity-75 transition-opacity shrink-0" />;
  };

  if (sortedItemsCount === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-md bg-[var(--card)]">
        {totalItemsCount === 0
          ? "Nessun dato locale trovato. Clicca su 'Sincronizza Cloud' in alto a destra per scaricare l'archivio."
          : "Nessun articolo trovato per i filtri selezionati."}
      </div>
    );
  }

  return (
    <div
      ref={tableContainerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onScroll={onScroll}
      className="min-h-0 flex-1 overflow-auto border border-[var(--border)] rounded-md bg-[var(--card)] select-text outline-none"
    >
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)] text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider select-none">
          <tr>
            <th
              onClick={() => onToggleSort("doc_date")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-left w-32 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per data documento"
            >
              <div className="flex items-center gap-1">
                <span>DATA</span>
                {renderSortIndicator("doc_date")}
              </div>
            </th>
            <th
              onClick={() => onToggleSort("doc_number")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-left w-28 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per numero documento"
            >
              <div className="flex items-center gap-1">
                <span>DOC N.</span>
                {renderSortIndicator("doc_number")}
              </div>
            </th>
            <th
              onClick={() => onToggleSort("supplier_name")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-left w-52 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per fornitore"
            >
              <div className="flex items-center gap-1">
                <span>FORNITORE</span>
                {renderSortIndicator("supplier_name")}
              </div>
            </th>
            <th
              onClick={() => onToggleSort("article_code")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-left w-36 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per codice articolo"
            >
              <div className="flex items-center gap-1">
                <span>CODICE ART.</span>
                {renderSortIndicator("article_code")}
              </div>
            </th>
            {showExtendedColumns && (
              <th
                onClick={() => onToggleSort("unit")}
                style={{ cursor: "pointer" }}
                className="px-2 py-2 text-center w-14 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                title="Ordina per unità di misura"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>UM</span>
                  {renderSortIndicator("unit")}
                </div>
              </th>
            )}
            {showExtendedColumns && (
              <th
                onClick={() => onToggleSort("quantity")}
                style={{ cursor: "pointer" }}
                className="px-3 py-2 text-right w-16 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                title="Ordina per quantità"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Q.TÀ</span>
                  {renderSortIndicator("quantity")}
                </div>
              </th>
            )}
            <th
              onClick={() => onToggleSort("description")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-left group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per descrizione articolo"
            >
              <div className="flex items-center gap-1">
                <span>DESCRIZIONE</span>
                {renderSortIndicator("description")}
              </div>
            </th>
            {showExtendedColumns && (
              <th
                onClick={() => onToggleSort("unit_price")}
                style={{ cursor: "pointer" }}
                className="px-3 py-2 text-right w-24 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                title="Ordina per prezzo di listino"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>LISTINO</span>
                  {renderSortIndicator("unit_price")}
                </div>
              </th>
            )}
            {showExtendedColumns && (
              <th
                onClick={() => onToggleSort("discount_1")}
                style={{ cursor: "pointer" }}
                className="px-2 py-2 text-center w-20 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                title="Ordina per sconti"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>SCONTO</span>
                  {renderSortIndicator("discount_1")}
                </div>
              </th>
            )}
            <th
              onClick={() => onToggleSort("discounted_price")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-right w-28 text-[var(--primary)] font-bold group hover:bg-[var(--card)] transition-colors"
              title="Ordina per costo netto"
            >
              <div className="flex items-center justify-end gap-1">
                <span>COSTO NETTO (€)</span>
                {renderSortIndicator("discounted_price")}
              </div>
            </th>
            {showExtendedColumns && (
              <th
                onClick={() => onToggleSort("total_price")}
                style={{ cursor: "pointer" }}
                className="px-3 py-2 text-right w-24 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                title="Ordina per importo riga"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>IMPORTO</span>
                  {renderSortIndicator("total_price")}
                </div>
              </th>
            )}
            <th
              onClick={() => onToggleSort("vat_rate")}
              style={{ cursor: "pointer" }}
              className="px-2 py-2 text-center w-14 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per aliquota IVA"
            >
              <div className="flex items-center justify-center gap-1">
                <span>IVA</span>
                {renderSortIndicator("vat_rate")}
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
          {visibleItems.map((row) => {
            const discounts = [row.discount_1, row.discount_2, row.discount_3]
              .filter((d) => d > 0)
              .map((d) => `${d}%`)
              .join("+");

            const rowKey = row.id || `${row.doc_number}-${row.line_number}`;
            const isRowActive = activeRowKey === rowKey || selectedCell?.rowKey === rowKey;
            const isCodeSelected = selectedCell?.rowKey === rowKey && selectedCell?.col === "article_code";
            const isDescSelected = selectedCell?.rowKey === rowKey && selectedCell?.col === "description";

            return (
              <tr
                key={row.id}
                ref={isRowActive ? activeRowElementRef : null}
                onMouseDown={() => onSelectRow(rowKey)}
                className={`group cursor-default ${
                  isRowActive
                    ? "bg-[#1e5b87] text-white font-medium"
                    : "hover:bg-[var(--background)]/60"
                }`}
              >
                <td className={`px-3 py-2 font-sans font-medium whitespace-nowrap select-text ${isRowActive ? "text-white" : "text-[var(--foreground)]"}`}>
                  {row.doc_date}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDetail(row);
                    }}
                    className={`font-bold hover:underline inline-flex items-center gap-1.5 cursor-pointer ${
                      isRowActive ? "text-sky-200 hover:text-white" : "text-[var(--primary)]"
                    }`}
                    title="Apri fattura fornitore"
                  >
                    <FileText className="h-3 w-3" />
                    <span>{row.doc_number}</span>
                  </button>
                </td>
                <td
                  className={`px-3 py-2 font-sans font-medium truncate max-w-[200px] select-text ${isRowActive ? "text-white" : "text-[var(--foreground)]"}`}
                  title={row.supplier_name}
                >
                  {row.supplier_name}
                </td>
                <td
                  onMouseDown={() =>
                    onSelectCell({
                      rowKey,
                      col: "article_code",
                      text: row.article_code || "",
                    })
                  }
                  onDoubleClick={() => onCopyText(row.article_code || "")}
                  style={{ userSelect: "text", WebkitUserSelect: "text", cursor: "text" }}
                  title="Fai clic o seleziona per copiare con Ctrl+C"
                  className={cn(
                    "px-3 py-2 select-text cursor-text",
                    isCodeSelected
                      ? "ring-1 ring-sky-300 ring-inset bg-white/10 font-bold"
                      : isRowActive
                      ? "text-sky-100"
                      : "text-[var(--muted-foreground)]"
                  )}
                >
                  {row.article_code || "—"}
                </td>
                {showExtendedColumns && (
                  <td className={`px-2 py-2 text-center uppercase select-text ${isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"}`}>
                    {row.unit || "NR"}
                  </td>
                )}
                {showExtendedColumns && (
                  <td className={`px-3 py-2 text-right font-bold select-text ${isRowActive ? "text-white" : "text-[var(--foreground)]"}`}>
                    {row.quantity > 0 ? row.quantity : "—"}
                  </td>
                )}
                <td
                  onMouseDown={() =>
                    onSelectCell({
                      rowKey,
                      col: "description",
                      text: row.description || "",
                    })
                  }
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onAddToOrder({
                      supplier_name: row.supplier_name,
                      article_code: row.article_code || "",
                      description: row.description,
                      quantity: row.quantity > 0 ? row.quantity : 1,
                      unit_price: row.unit_price,
                      discounted_price: row.discounted_price,
                    });
                  }}
                  style={{ userSelect: "text", WebkitUserSelect: "text", cursor: "text" }}
                  title="Doppio clic per aggiungere a Order Manager • Clic + Ctrl+C per copiare"
                  className={cn(
                    "px-3 py-2 font-sans select-text cursor-text",
                    isDescSelected
                      ? "ring-1 ring-sky-300 ring-inset bg-white/10 font-bold"
                      : isRowActive
                      ? "text-white font-medium"
                      : "text-[var(--foreground)]"
                  )}
                >
                  {row.description}
                </td>
                {showExtendedColumns && (
                  <td className={`px-3 py-2 text-right select-text ${isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"}`}>
                    {row.unit_price > 0 ? formatInvoiceEuro(row.unit_price, 4) : "—"}
                  </td>
                )}
                {showExtendedColumns && (
                  <td className={`px-2 py-2 text-center select-text ${isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"}`}>
                    {discounts || "—"}
                  </td>
                )}
                <td className={`px-3 py-2 text-right font-bold select-text ${isRowActive ? "text-sky-200" : "text-[var(--primary)]"}`}>
                  {row.discounted_price > 0
                    ? formatInvoiceEuro(row.discounted_price, 4)
                    : row.unit_price > 0
                    ? formatInvoiceEuro(row.unit_price, 4)
                    : "—"}
                </td>
                {showExtendedColumns && (
                  <td className={`px-3 py-2 text-right select-text ${isRowActive ? "text-white font-bold" : "text-[var(--foreground)]"}`}>
                    {row.total_price > 0 ? formatInvoiceEuro(row.total_price, 2) : "—"}
                  </td>
                )}
                <td className={`px-2 py-2 text-center select-text ${isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"}`}>
                  {row.vat_rate}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, FileText } from "lucide-react";
import { SupplierInvoice } from "../services/electronicInvoicesService";
import {
  formatInvoiceEuro,
  IndexedInvoiceRow,
  InvoiceSortField,
} from "../utils/invoiceViewUtils";

export interface InvoiceHeadersTableProps {
  visibleInvoices: IndexedInvoiceRow[];
  sortedInvoicesCount: number;
  sortField: InvoiceSortField;
  sortAsc: boolean;
  onToggleSort: (field: InvoiceSortField) => void;
  activeRowKey: string | number | null;
  activeRowElementRef: React.MutableRefObject<HTMLTableRowElement | null>;
  tableContainerRef: React.RefObject<HTMLDivElement>;
  onSelectRow: (rowKey: string | number) => void;
  onOpenDetail: (invoice: SupplierInvoice) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const InvoiceHeadersTable: React.FC<InvoiceHeadersTableProps> = ({
  visibleInvoices,
  sortedInvoicesCount,
  sortField,
  sortAsc,
  onToggleSort,
  activeRowKey,
  activeRowElementRef,
  tableContainerRef,
  onSelectRow,
  onOpenDetail,
  onKeyDown,
  onScroll,
}) => {
  const renderSortIndicator = (field: InvoiceSortField) => {
    if (sortField === field) {
      return sortAsc ? (
        <ArrowUp className="w-3 h-3 text-[var(--primary)] shrink-0" />
      ) : (
        <ArrowDown className="w-3 h-3 text-[var(--primary)] shrink-0" />
      );
    }
    return <ArrowUpDown className="w-2.5 h-2.5 opacity-25 group-hover:opacity-75 transition-opacity shrink-0" />;
  };

  if (sortedInvoicesCount === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-md bg-[var(--card)]">
        Nessuna fattura trovata per i filtri selezionati.
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
                <span>DATA DOC</span>
                {renderSortIndicator("doc_date")}
              </div>
            </th>
            <th
              onClick={() => onToggleSort("doc_number")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-left w-28 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per numero fattura"
            >
              <div className="flex items-center gap-1">
                <span>N° FATTURA</span>
                {renderSortIndicator("doc_number")}
              </div>
            </th>
            <th
              onClick={() => onToggleSort("supplier_name")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-left w-64 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per fornitore"
            >
              <div className="flex items-center gap-1">
                <span>FORNITORE</span>
                {renderSortIndicator("supplier_name")}
              </div>
            </th>
            <th
              onClick={() => onToggleSort("year")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-center w-20 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per anno"
            >
              <div className="flex items-center justify-center gap-1">
                <span>ANNO</span>
                {renderSortIndicator("year")}
              </div>
            </th>
            <th
              onClick={() => onToggleSort("taxable_amount")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-right w-28 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per imponibile"
            >
              <div className="flex items-center justify-end gap-1">
                <span>IMPONIBILE</span>
                {renderSortIndicator("taxable_amount")}
              </div>
            </th>
            <th
              onClick={() => onToggleSort("vat_amount")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-right w-24 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per importo IVA"
            >
              <div className="flex items-center justify-end gap-1">
                <span>IVA</span>
                {renderSortIndicator("vat_amount")}
              </div>
            </th>
            <th
              onClick={() => onToggleSort("total_amount")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-right w-32 font-bold text-[var(--foreground)] group hover:bg-[var(--card)] transition-colors"
              title="Ordina per totale documento"
            >
              <div className="flex items-center justify-end gap-1">
                <span>TOTALE DOC (€)</span>
                {renderSortIndicator("total_amount")}
              </div>
            </th>
            <th
              onClick={() => onToggleSort("payment_method")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-left w-48 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per modalità di pagamento"
            >
              <div className="flex items-center gap-1">
                <span>MODALITÀ PAGAMENTO</span>
                {renderSortIndicator("payment_method")}
              </div>
            </th>
            <th
              onClick={() => onToggleSort("due_date")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-center w-28 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per scadenza"
            >
              <div className="flex items-center justify-center gap-1">
                <span>SCADENZA</span>
                {renderSortIndicator("due_date")}
              </div>
            </th>
            <th
              onClick={() => onToggleSort("notes")}
              style={{ cursor: "pointer" }}
              className="px-3 py-2 text-left group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
              title="Ordina per note / causale"
            >
              <div className="flex items-center gap-1">
                <span>NOTE / CAUSALE</span>
                {renderSortIndicator("notes")}
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
          {visibleInvoices.map((inv) => {
            const invKey = inv.id ?? `${inv.supplier_name}-${inv.doc_number}-${inv.doc_date}`;
            const isInvActive = activeRowKey === invKey;
            return (
              <tr
                key={invKey}
                ref={isInvActive ? activeRowElementRef : null}
                onMouseDown={() => onSelectRow(invKey)}
                className={`group cursor-default ${
                  isInvActive
                    ? "bg-[#1e5b87] text-white font-medium"
                    : "hover:bg-[var(--background)]/60"
                }`}
              >
                <td className={`px-3 py-2 font-sans font-medium whitespace-nowrap select-text ${isInvActive ? "text-white" : "text-[var(--foreground)]"}`}>
                  {inv.doc_date}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDetail(inv);
                    }}
                    className={`font-bold hover:underline inline-flex items-center gap-1.5 cursor-pointer ${
                      isInvActive ? "text-sky-200 hover:text-white" : "text-[var(--primary)]"
                    }`}
                    title="Apri fattura fornitore"
                  >
                    <FileText className="h-3 w-3" />
                    <span>{inv.doc_number}</span>
                  </button>
                </td>
                <td
                  className={`px-3 py-2 font-sans font-medium truncate max-w-[240px] select-text ${isInvActive ? "text-white" : "text-[var(--foreground)]"}`}
                  title={inv.supplier_name}
                >
                  {inv.supplier_name}
                </td>
                <td className={`px-3 py-2 text-center select-text ${isInvActive ? "text-sky-100" : "text-[var(--muted-foreground)]"}`}>
                  {inv.year}
                </td>
                <td className={`px-3 py-2 text-right select-text ${isInvActive ? "text-sky-100" : "text-[var(--muted-foreground)]"}`}>
                  {formatInvoiceEuro(inv.taxable_amount)}
                </td>
                <td className={`px-3 py-2 text-right select-text ${isInvActive ? "text-sky-100" : "text-[var(--muted-foreground)]"}`}>
                  {formatInvoiceEuro(inv.vat_amount)}
                </td>
                <td className={`px-3 py-2 text-right font-bold select-text ${isInvActive ? "text-white font-bold" : "text-[var(--foreground)]"}`}>
                  {formatInvoiceEuro(inv.total_amount)}
                </td>
                <td className={`px-3 py-2 font-sans truncate max-w-[180px] select-text ${isInvActive ? "text-sky-100" : "text-[var(--muted-foreground)]"}`}>
                  {inv.payment_method || "—"}
                </td>
                <td className={`px-3 py-2 text-center font-sans font-semibold select-text ${isInvActive ? "text-amber-200 font-bold" : "text-amber-400"}`}>
                  {inv.due_date || "—"}
                </td>
                <td
                  className={`px-3 py-2 font-sans truncate max-w-[200px] select-text ${isInvActive ? "text-sky-100" : "text-[var(--muted-foreground)]"}`}
                  title={inv.notes}
                >
                  {inv.notes || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

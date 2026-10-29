import React, { useEffect } from "react";
import { SupplierInvoice, SupplierInvoiceItem } from "../services/electronicInvoicesService";
import {
  FileText,
  Building2,
  Calendar,
  CreditCard,
  X,
  Layers,
} from "lucide-react";

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SupplierInvoice | null;
  lines: SupplierInvoiceItem[];
  isLoadingLines?: boolean;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  isOpen,
  onClose,
  invoice,
  lines,
  isLoadingLines,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !invoice) return null;

  const formatEuro = (val: number, decimals = 2) =>
    `€ ${val.toLocaleString("it-IT", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100 select-text">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-[var(--foreground)]">
        {/* HEADER MODALE */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--background)]">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-[var(--card)] border border-[var(--border)] text-[var(--primary)] rounded-md">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[var(--foreground)] tracking-wide">
                  Fattura N. {invoice.doc_number}
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)]">
                  Data: {invoice.doc_date}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/30">
                  Anno {invoice.year}
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Dettaglio Ministeriale SDI / Documento Fornitore
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CONTENUTO SCORREVOLE */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* CARDS TESTATA */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {/* Fornitore */}
            <div className="p-3 bg-[var(--background)] rounded-md border border-[var(--border)] space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--primary)] uppercase tracking-wider">
                <Building2 className="w-3.5 h-3.5" /> Fornitore / Cedente
              </div>
              <p className="text-xs font-bold text-[var(--foreground)] leading-tight">
                {invoice.supplier_name}
              </p>
              <div className="text-[11px] text-[var(--muted-foreground)] space-y-0.5 pt-0.5">
                {invoice.vat_number && (
                  <div>P.IVA: <b className="text-[var(--foreground)]">{invoice.vat_number}</b></div>
                )}
                {invoice.fiscal_code && (
                  <div>C.F.: <b className="text-[var(--foreground)]">{invoice.fiscal_code}</b></div>
                )}
              </div>
            </div>

            {/* Pagamento e Scadenza */}
            <div className="p-3 bg-[var(--background)] rounded-md border border-[var(--border)] space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                <CreditCard className="w-3.5 h-3.5" /> Pagamento & Scadenze
              </div>
              <p className="text-xs font-semibold text-[var(--foreground)]">
                {invoice.payment_method || "Modalità standard"}
              </p>
              <div className="text-[11px] text-[var(--muted-foreground)] space-y-0.5 pt-0.5">
                {invoice.due_date && (
                  <div className="text-amber-400 font-semibold flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Scadenza: {invoice.due_date}
                  </div>
                )}
                {invoice.iban && (
                  <div className="font-mono text-[10px] text-[var(--foreground)] break-all">
                    IBAN: {invoice.iban}
                  </div>
                )}
                {invoice.bank_name && (
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    Banca: {invoice.bank_name}
                  </div>
                )}
              </div>
            </div>

            {/* Totali */}
            <div className="p-3 bg-[var(--background)] rounded-md border border-[var(--border)] space-y-1">
              <div className="text-[11px] font-bold text-[var(--foreground)] uppercase tracking-wider">
                Riepilogo Importi
              </div>
              <div className="text-xs text-[var(--muted-foreground)] space-y-0.5 pt-0.5">
                <div className="flex justify-between">
                  <span>Imponibile:</span>
                  <span className="font-semibold text-[var(--foreground)]">{formatEuro(invoice.taxable_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Imposta IVA:</span>
                  <span className="font-semibold text-[var(--foreground)]">{formatEuro(invoice.vat_amount)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[var(--border)] font-bold text-xs text-[var(--foreground)]">
                  <span>Totale Documento:</span>
                  <span className="text-[var(--primary)]">{formatEuro(invoice.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* NOTE SE PRESENTI */}
          {invoice.notes && (
            <div className="p-2.5 bg-[var(--background)] rounded-md border border-[var(--border)] text-xs text-[var(--foreground)]">
              <span className="font-bold text-[var(--muted-foreground)]">Note / Causale: </span>
              {invoice.notes}
            </div>
          )}

          {/* TABELLA RIGHE ARTICOLO */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--foreground)]">
              <Layers className="w-3.5 h-3.5 text-[var(--primary)]" />
              Linee / Dettaglio Articoli ({lines.length})
            </div>

            <div className="border border-[var(--border)] rounded-md overflow-hidden bg-[var(--card)]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[var(--background)] text-[var(--muted-foreground)] text-[10.5px] font-semibold uppercase tracking-wider border-b border-[var(--border)]">
                  <tr>
                    <th className="py-2 px-3 w-10 text-center">#</th>
                    <th className="py-2 px-3 w-28">Codice</th>
                    <th className="py-2 px-3">Descrizione</th>
                    <th className="py-2 px-3 w-16 text-right">Q.tà</th>
                    <th className="py-2 px-3 w-12 text-center">UM</th>
                    <th className="py-2 px-3 w-24 text-right">Prezzo Unit</th>
                    <th className="py-2 px-3 w-20 text-center">Sconti</th>
                    <th className="py-2 px-3 w-24 text-right text-[var(--primary)] font-bold">Netto</th>
                    <th className="py-2 px-3 w-24 text-right font-bold">Totale</th>
                    <th className="py-2 px-3 w-14 text-center">IVA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11px]">
                  {isLoadingLines ? (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-[var(--muted-foreground)]">
                        Caricamento linee in corso...
                      </td>
                    </tr>
                  ) : lines.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-[var(--muted-foreground)]">
                        Nessuna linea associata a questo documento
                      </td>
                    </tr>
                  ) : (
                    lines.map((line, idx) => {
                      const discountStr = [line.discount_1, line.discount_2, line.discount_3]
                        .filter((d) => d > 0)
                        .map((d) => `${d}%`)
                        .join(" + ");

                      return (
                        <tr
                          key={line.id || idx}
                          className="hover:bg-[var(--background)]/50 transition-colors"
                        >
                          <td className="py-1.5 px-3 text-center text-[var(--muted-foreground)]">
                            {line.line_number || idx + 1}
                          </td>
                          <td className="py-1.5 px-3 text-[var(--muted-foreground)]">
                            {line.article_code || "—"}
                          </td>
                          <td className="py-1.5 px-3 font-sans font-medium text-[var(--foreground)]">
                            {line.description}
                          </td>
                          <td className="py-1.5 px-3 text-right text-[var(--foreground)]">
                            {line.quantity > 0 ? line.quantity : "—"}
                          </td>
                          <td className="py-1.5 px-3 text-center text-[var(--muted-foreground)] uppercase">
                            {line.unit || "NR"}
                          </td>
                          <td className="py-1.5 px-3 text-right text-[var(--muted-foreground)]">
                            {line.unit_price > 0 ? formatEuro(line.unit_price, 4) : "—"}
                          </td>
                          <td className="py-1.5 px-3 text-center text-[var(--muted-foreground)] text-[10px]">
                            {discountStr || "—"}
                          </td>
                          <td className="py-1.5 px-3 text-right font-bold text-[var(--primary)]">
                            {line.discounted_price > 0 ? formatEuro(line.discounted_price, 4) : "—"}
                          </td>
                          <td className="py-1.5 px-3 text-right font-bold text-[var(--foreground)]">
                            {line.total_price > 0 ? formatEuro(line.total_price, 2) : "—"}
                          </td>
                          <td className="py-1.5 px-3 text-center text-[var(--muted-foreground)]">
                            {line.vat_rate}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FOOTER MODALE */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)] bg-[var(--background)]">
          <div className="text-[11px] text-[var(--muted-foreground)]">
            {invoice.file_name && <span>File: {invoice.file_name}</span>}
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-[var(--card)] hover:bg-[var(--border)] text-[var(--foreground)] border border-[var(--border)] rounded text-xs font-semibold transition-colors cursor-pointer"
          >
            Chiudi (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};

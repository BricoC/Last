import React, { useEffect, useState, useMemo } from "react";
import { SupplierInvoice, SupplierInvoiceItem } from "../services/electronicInvoicesService";
import {
  FileText,
  Building2,
  Calendar,
  CreditCard,
  X,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { AddToOrderManagerModal, AddToOrderManagerItem } from "./AddToOrderManagerModal";

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SupplierInvoice | null;
  lines: SupplierInvoiceItem[];
  isLoadingLines?: boolean;
}

type PopupSortField =
  | "line_number"
  | "article_code"
  | "description"
  | "quantity"
  | "unit"
  | "unit_price"
  | "discount_1"
  | "discounted_price"
  | "total_price"
  | "vat_rate";

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  isOpen,
  onClose,
  invoice,
  lines,
  isLoadingLines,
}) => {
  // Ordinamento Colonne
  const [sortField, setSortField] = useState<PopupSortField>("line_number");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Selezione Cella e Feedback Copia
  const [selectedCell, setSelectedCell] = useState<{
    lineKey: string | number;
    col: "article_code" | "description";
    text: string;
  } | null>(null);
  const [copiedToast, setCopiedToast] = useState<string | null>(null);

  // Popup Aggiunta a Order Manager
  const [addToOrderTarget, setAddToOrderTarget] = useState<AddToOrderManagerItem | null>(null);

  const copyText = (text: string) => {
    if (!text || text === "—") return;
    void navigator.clipboard.writeText(text);
    setCopiedToast(`Copiato: "${text.slice(0, 32)}${text.length > 32 ? "..." : ""}"`);
    setTimeout(() => setCopiedToast(null), 2500);
  };

  // Scorciatoie da tastiera (Escape per chiudere, Ctrl+C per copiare)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const mouseSelection = window.getSelection()?.toString();
        if (mouseSelection && mouseSelection.trim().length > 0) {
          void navigator.clipboard.writeText(mouseSelection);
          setCopiedToast(
            `Copiato: "${mouseSelection.slice(0, 32)}${mouseSelection.length > 32 ? "..." : ""}"`
          );
          setTimeout(() => setCopiedToast(null), 2500);
          return;
        }

        if (selectedCell && selectedCell.text && selectedCell.text !== "—") {
          e.preventDefault();
          copyText(selectedCell.text);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, selectedCell]);

  // Reset dello stato quando cambia documento o si riapre
  useEffect(() => {
    if (isOpen) {
      setSortField("line_number");
      setSortAsc(true);
      setSelectedCell(null);
      setCopiedToast(null);
    }
  }, [isOpen, invoice?.id]);

  const handleToggleSort = (field: PopupSortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(field === "article_code" || field === "description" || field === "line_number");
    }
  };

  const sortedLines = useMemo(() => {
    return [...lines].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === "discounted_price") {
        valA = a.discounted_price > 0 ? a.discounted_price : a.unit_price;
        valB = b.discounted_price > 0 ? b.discounted_price : b.unit_price;
      }

      if (valA == null) valA = "";
      if (valB == null) valB = "";

      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }

      return sortAsc
        ? String(valA).localeCompare(String(valB), "it", { numeric: true, sensitivity: "base" })
        : String(valB).localeCompare(String(valA), "it", { numeric: true, sensitivity: "base" });
    });
  }, [lines, sortField, sortAsc]);

  if (!isOpen || !invoice) return null;

  const formatEuro = (val: number, decimals = 2) =>
    `€ ${val.toLocaleString("it-IT", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;

  const renderSortIndicator = (field: PopupSortField) => {
    if (sortField === field) {
      return sortAsc ? (
        <ArrowUp className="w-3 h-3 text-[var(--primary)] shrink-0" />
      ) : (
        <ArrowDown className="w-3 h-3 text-[var(--primary)] shrink-0" />
      );
    }
    return <ArrowUpDown className="w-2.5 h-2.5 opacity-25 group-hover:opacity-75 transition-opacity shrink-0" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100 select-text">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-[var(--foreground)] relative">
        {/* TOAST COPIATO */}
        {copiedToast && (
          <div className="absolute top-3 right-14 z-50 bg-emerald-600 text-white text-[11px] font-semibold px-3 py-1 rounded-md shadow-xl flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
            <Check className="w-3.5 h-3.5" />
            <span>{copiedToast}</span>
          </div>
        )}

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
                Dettaglio Ministeriale SDI / Documento Fornitore &bull; Fai clic su Codice o Descrizione per copiare con <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-300">Ctrl + C</kbd>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ cursor: "pointer" }}
            className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] rounded-md transition-colors"
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
            <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[var(--primary)]" />
                Linee / Dettaglio Articoli ({lines.length})
              </div>
              <span className="text-[11px] font-normal text-[var(--muted-foreground)]">
                Clicca sull'intestazione per ordinare le colonne
              </span>
            </div>

            <div className="border border-[var(--border)] rounded-md overflow-hidden bg-[var(--card)] select-text">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[var(--background)] text-[var(--muted-foreground)] text-[10.5px] font-semibold uppercase tracking-wider border-b border-[var(--border)] select-none">
                  <tr>
                    {/* # */}
                    <th
                      onClick={() => handleToggleSort("line_number")}
                      style={{ cursor: "pointer" }}
                      className="py-2 px-3 w-12 text-center group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                      title="Ordina per numero di riga"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>#</span>
                        {renderSortIndicator("line_number")}
                      </div>
                    </th>

                    {/* Codice */}
                    <th
                      onClick={() => handleToggleSort("article_code")}
                      style={{ cursor: "pointer" }}
                      className="py-2 px-3 w-32 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                      title="Ordina per codice articolo"
                    >
                      <div className="flex items-center gap-1">
                        <span>Codice</span>
                        {renderSortIndicator("article_code")}
                      </div>
                    </th>

                    {/* Descrizione */}
                    <th
                      onClick={() => handleToggleSort("description")}
                      style={{ cursor: "pointer" }}
                      className="py-2 px-3 group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                      title="Ordina per descrizione"
                    >
                      <div className="flex items-center gap-1">
                        <span>Descrizione</span>
                        {renderSortIndicator("description")}
                      </div>
                    </th>

                    {/* Q.tà */}
                    <th
                      onClick={() => handleToggleSort("quantity")}
                      style={{ cursor: "pointer" }}
                      className="py-2 px-3 w-16 text-right group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                      title="Ordina per quantità"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Q.tà</span>
                        {renderSortIndicator("quantity")}
                      </div>
                    </th>

                    {/* UM */}
                    <th
                      onClick={() => handleToggleSort("unit")}
                      style={{ cursor: "pointer" }}
                      className="py-2 px-3 w-12 text-center group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                      title="Ordina per unità di misura"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>UM</span>
                        {renderSortIndicator("unit")}
                      </div>
                    </th>

                    {/* Prezzo Unit */}
                    <th
                      onClick={() => handleToggleSort("unit_price")}
                      style={{ cursor: "pointer" }}
                      className="py-2 px-3 w-24 text-right group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                      title="Ordina per prezzo unitario"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Prezzo Unit</span>
                        {renderSortIndicator("unit_price")}
                      </div>
                    </th>

                    {/* Sconti */}
                    <th
                      onClick={() => handleToggleSort("discount_1")}
                      style={{ cursor: "pointer" }}
                      className="py-2 px-3 w-20 text-center group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                      title="Ordina per sconti"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Sconti</span>
                        {renderSortIndicator("discount_1")}
                      </div>
                    </th>

                    {/* Netto */}
                    <th
                      onClick={() => handleToggleSort("discounted_price")}
                      style={{ cursor: "pointer" }}
                      className="py-2 px-3 w-24 text-right text-[var(--primary)] font-bold group hover:bg-[var(--card)] transition-colors"
                      title="Ordina per prezzo netto"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Netto</span>
                        {renderSortIndicator("discounted_price")}
                      </div>
                    </th>

                    {/* Totale */}
                    <th
                      onClick={() => handleToggleSort("total_price")}
                      style={{ cursor: "pointer" }}
                      className="py-2 px-3 w-24 text-right font-bold group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                      title="Ordina per importo totale riga"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Totale</span>
                        {renderSortIndicator("total_price")}
                      </div>
                    </th>

                    {/* IVA */}
                    <th
                      onClick={() => handleToggleSort("vat_rate")}
                      style={{ cursor: "pointer" }}
                      className="py-2 px-3 w-14 text-center group hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
                      title="Ordina per aliquota IVA"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>IVA</span>
                        {renderSortIndicator("vat_rate")}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11px]">
                  {isLoadingLines ? (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-[var(--muted-foreground)]">
                        Caricamento linee in corso...
                      </td>
                    </tr>
                  ) : sortedLines.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-[var(--muted-foreground)]">
                        Nessuna linea associata a questo documento
                      </td>
                    </tr>
                  ) : (
                    sortedLines.map((line, idx) => {
                      const lineKey = line.id || `${line.line_number}-${idx}`;
                      const discountStr = [line.discount_1, line.discount_2, line.discount_3]
                        .filter((d) => d > 0)
                        .map((d) => `${d}%`)
                        .join(" + ");

                      const isCodeSelected =
                        selectedCell?.lineKey === lineKey && selectedCell?.col === "article_code";
                      const isDescSelected =
                        selectedCell?.lineKey === lineKey && selectedCell?.col === "description";

                      return (
                        <tr
                          key={lineKey}
                          className="hover:bg-[var(--background)]/50 transition-colors"
                        >
                          <td className="py-1.5 px-3 text-center text-[var(--muted-foreground)]">
                            {line.line_number || idx + 1}
                          </td>

                          {/* CODICE (copiabile con selezione mouse o click + Ctrl+C o doppio click) */}
                          <td
                            onClick={() =>
                              setSelectedCell({
                                lineKey,
                                col: "article_code",
                                text: line.article_code || "",
                              })
                            }
                            onDoubleClick={() => copyText(line.article_code || "")}
                            style={{ userSelect: "text", WebkitUserSelect: "text", cursor: "text" }}
                            title="Fai clic o seleziona per copiare con Ctrl+C"
                            className={cn(
                              "py-1.5 px-3 select-text cursor-text transition-colors",
                              isCodeSelected
                                ? "bg-[var(--primary)]/20 text-[var(--foreground)] font-semibold ring-1 ring-inset ring-[var(--primary)]/50 rounded-xs"
                                : "text-[var(--muted-foreground)]"
                            )}
                          >
                            {line.article_code || "—"}
                          </td>

                          {/* DESCRIZIONE (copiabile con Ctrl+C, doppio clic per aggiungere a Order Manager) */}
                          <td
                            onClick={() =>
                              setSelectedCell({
                                lineKey,
                                col: "description",
                                text: line.description || "",
                              })
                            }
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setAddToOrderTarget({
                                supplier_name: invoice.supplier_name,
                                article_code: line.article_code || "",
                                description: line.description,
                                quantity: line.quantity > 0 ? line.quantity : 1,
                                unit_price: line.unit_price,
                                discounted_price: line.discounted_price,
                              });
                            }}
                            style={{ userSelect: "text", WebkitUserSelect: "text", cursor: "text" }}
                            title="Doppio clic per aggiungere a Order Manager &bull; Clic + Ctrl+C per copiare"
                            className={cn(
                              "py-1.5 px-3 font-sans font-medium select-text cursor-text transition-colors",
                              isDescSelected
                                ? "bg-[var(--primary)]/20 text-[var(--foreground)] ring-1 ring-inset ring-[var(--primary)]/50 rounded-xs"
                                : "text-[var(--foreground)]"
                            )}
                          >
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
          <div className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-3">
            {invoice.file_name && <span>File: {invoice.file_name}</span>}
            <span className="text-slate-400">&bull;</span>
            <span className="text-slate-400">
              Doppio clic su Descrizione per aggiungere a Order Manager &bull; <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-300">Ctrl + C</kbd> per copiare
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ cursor: "pointer" }}
            className="px-3 py-1 bg-[var(--card)] hover:bg-[var(--border)] text-[var(--foreground)] border border-[var(--border)] rounded text-xs font-semibold transition-colors"
          >
            Chiudi (Esc)
          </button>
        </div>
      </div>

      {/* MODALE AGGIUNGI A ORDER MANAGER */}
      <AddToOrderManagerModal
        isOpen={Boolean(addToOrderTarget)}
        onClose={() => setAddToOrderTarget(null)}
        item={addToOrderTarget}
        onSuccess={(msg) => {
          setCopiedToast(msg);
          setTimeout(() => setCopiedToast(null), 3000);
        }}
      />
    </div>
  );
};

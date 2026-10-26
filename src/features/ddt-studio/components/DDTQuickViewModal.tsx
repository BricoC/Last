import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  FileText,
  ExternalLink,
  Search,
  User,
  MapPin,
  CreditCard,
  Calendar,
  History,
} from "lucide-react";
import { DdtRepository } from "../services/ddtRepository";
import { DdtDocument, DdtItem } from "../models/ddt";
import { formatDdtMoney, formatDdtPercent, formatDdtViewDate } from "../services/ddtViewFormatting";
import { DDTClientArticleHistoryModal } from "./DDTClientArticleHistoryModal";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";

export interface DDTQuickViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  ddtId: string | null;
  onOpenInStudio?: (ddtId: string) => void;
}

export const DDTQuickViewModal: React.FC<DDTQuickViewModalProps> = ({
  isOpen,
  onClose,
  ddtId,
  onOpenInStudio,
}) => {
  const [doc, setDoc] = useState<DdtDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [historyTarget, setHistoryTarget] = useState<DdtItem | null>(null);

  useEffect(() => {
    if (!isOpen || !ddtId) {
      setDoc(null);
      setHistoryTarget(null);
      setSearchFilter("");
      return;
    }

    let isMounted = true;
    const loadDdt = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const repo = new DdtRepository();
        const loaded = await repo.getDdtById(ddtId);
        if (!isMounted) return;
        if (!loaded) {
          setError("Documento DDT non trovato.");
        } else {
          setDoc(loaded);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Impossibile caricare il DDT.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadDdt();
    return () => {
      isMounted = false;
    };
  }, [isOpen, ddtId]);

  // Gestione tasto Escape: chiude questo modal solo se non è aperto il popup dello storico
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !historyTarget) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, historyTarget, onClose]);

  // Filtra le righe valide (escludendo quelle vuote) e applica eventuale ricerca locale
  const activeItems = useMemo(() => {
    if (!doc?.items) return [];
    const valid = doc.items.filter(
      (it) => it.description?.trim() || it.code?.trim() || (it.unit_price?.toSubunits?.() ?? 0) > 0
    );

    const tokens = tokenizeSearch(searchFilter);
    if (!tokens.length) return valid;

    return valid.filter((it) => {
      const text = `${it.code || ""} ${it.description || ""}`.toLowerCase();
      return tokens.every((t) => text.includes(t));
    });
  }, [doc, searchFilter]);

  // Statistiche e margini di questo DDT
  const totals = useMemo(() => {
    if (!doc?.items) return null;

    let taxableSubunits = 0;
    let purchaseSubunits = 0;

    for (const it of doc.items) {
      if (!it.description?.trim() && !it.code?.trim() && (it.unit_price?.toSubunits?.() ?? 0) <= 0) continue;
      const net = it.net_amount?.toSubunits?.() ?? 0;
      taxableSubunits += net;

      const qty = parseFloat((it.quantity || "0").replace(",", ".")) || 0;
      const purchaseUnit = it.purchase_price?.toSubunits?.() ?? 0;
      purchaseSubunits += Math.round(purchaseUnit * qty);
    }

    const revenueSubunits = taxableSubunits - purchaseSubunits;
    const markupPercent = purchaseSubunits > 0 ? (revenueSubunits / purchaseSubunits) * 100 : null;

    return {
      taxableSubunits,
      purchaseSubunits,
      revenueSubunits,
      markupPercent,
    };
  }, [doc]);

  if (!isOpen) return null;

  const numberLabel = doc?.doc_number === null || doc?.status === "bozza"
    ? "BOZZA"
    : `DDT n. ${doc?.doc_number}${doc?.series ? `/${doc.series}` : ""} · Anno ${doc?.year}`;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-[2px] p-2 sm:p-3 text-[var(--foreground)] animate-in fade-in duration-150"
      >
        <div
          className="flex h-[94vh] w-[98vw] max-w-[1680px] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl overflow-hidden"
        >
          {/* Top Bar Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[var(--primary)]/15 p-2 text-[var(--primary)]">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-base font-bold tracking-tight text-[var(--foreground)]">
                    {numberLabel}
                  </h1>
                  {doc && (
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                        doc.status === "bozza"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {doc.status || "emesso"}
                    </span>
                  )}
                  {doc?.doc_date && (
                    <span className="flex items-center gap-1 font-mono text-xs text-[var(--muted-foreground)]">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDdtViewDate(doc.doc_date)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--muted-foreground)] font-medium">
                  {doc?.client_name || "Cliente non specificato"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onOpenInStudio && doc?.id && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenInStudio(doc.id);
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--primary)]/40 bg-[var(--primary)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-colors cursor-pointer"
                  title="Apri questo documento completo nell'editor DDT Studio"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Modifica in DDT Studio</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                title="Chiudi (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Dati Intestazione DDT (Cliente, Spedizione, Pagamento) */}
          {doc && (
            <div className="shrink-0 border-b border-[var(--border)] bg-[var(--background)]/40 px-5 py-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Box Cliente */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 font-bold text-[var(--primary)] mb-1">
                  <User className="h-3.5 w-3.5" />
                  <span className="uppercase text-[11px] tracking-wide">Intestatario</span>
                </div>
                <div className="font-semibold text-sm text-[var(--foreground)] truncate">
                  {doc.client_name || "—"}
                </div>
                <div className="text-[var(--muted-foreground)] text-[11.5px] mt-0.5">
                  {[doc.client_address, doc.client_city].filter(Boolean).join(", ") || "Indirizzo non presente"}
                </div>
                <div className="font-mono text-[11px] text-[var(--muted-foreground)] mt-1 flex flex-wrap gap-x-3">
                  {doc.client_vat && <span>P.IVA: {doc.client_vat}</span>}
                  {doc.client_fiscal_code && <span>C.F.: {doc.client_fiscal_code}</span>}
                  {doc.client_sdi && <span>SDI: {doc.client_sdi}</span>}
                </div>
              </div>

              {/* Box Destinazione & Logistica */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 font-bold text-[var(--primary)] mb-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="uppercase text-[11px] tracking-wide">Destinazione Merci</span>
                </div>
                <div className="font-semibold text-[13px] text-[var(--foreground)] truncate">
                  {doc.destination_name || "Stesso indirizzo cliente"}
                </div>
                <div className="text-[var(--muted-foreground)] text-[11.5px] mt-0.5">
                  {[doc.destination_address, doc.destination_city].filter(Boolean).join(", ") || "—"}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)] mt-1 flex flex-wrap gap-x-3">
                  {doc.transport_reason && <span>Causale: <strong>{doc.transport_reason}</strong></span>}
                  {doc.carriage_terms && <span>Porto: <strong>{doc.carriage_terms}</strong></span>}
                </div>
              </div>

              {/* Box Info Commerciali & Totali */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 font-bold text-[var(--primary)] mb-1">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span className="uppercase text-[11px] tracking-wide">Riferimenti & Pagamento</span>
                </div>
                <div className="text-[12px] text-[var(--foreground)]">
                  <span>Pagamento: </span>
                  <span className="font-semibold">{doc.payment_method || "—"}</span>
                </div>
                <div className="text-[11.5px] text-[var(--muted-foreground)] flex flex-wrap gap-x-3 mt-0.5">
                  {doc.order_reference && <span>Ord: <strong>{doc.order_reference}</strong></span>}
                  {doc.operator && <span>Op: <strong>{doc.operator}</strong></span>}
                  {doc.packages_count && <span>Colli: <strong>{doc.packages_count}</strong></span>}
                  {doc.weight_kg && <span>Peso: <strong>{doc.weight_kg} kg</strong></span>}
                </div>
                {totals && (
                  <div className="mt-2 pt-1 border-t border-[var(--border)]/60 flex items-center justify-between text-xs">
                    <span className="text-[var(--muted-foreground)] font-medium">Imponibile DDT:</span>
                    <span className="font-bold text-sm text-[var(--foreground)]">
                      {formatDdtMoney(totals.taxableSubunits)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Toolbar ricerca articoli nel DDT */}
          <div className="shrink-0 border-b border-[var(--border)] bg-[var(--background)]/30 px-5 py-2 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 w-80 rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1">
              <Search className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Cerca codice o descrizione nel DDT…"
                className="w-full bg-transparent outline-none"
              />
              {searchFilter && (
                <button type="button" onClick={() => setSearchFilter("")} className="cursor-pointer">
                  <X className="h-3 w-3 text-[var(--muted-foreground)]" />
                </button>
              )}
            </div>

            <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-2">
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--primary)]">
                <History className="h-3.5 w-3.5" />
                Suggerimento:
              </span>
              <span>Clicca su qualsiasi articolo per vedere lo storico prezzi di questo cliente</span>
            </div>
          </div>

          {/* Tabella Articoli del DDT */}
          <div className="flex-1 min-h-0 overflow-auto bg-[var(--card)]">
            {isLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
                Caricamento dati DDT…
              </div>
            ) : error ? (
              <div className="p-8 text-center text-sm text-red-400">{error}</div>
            ) : activeItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
                {searchFilter ? `Nessuna riga corrisponde a "${searchFilter}".` : "Questo DDT non contiene righe con articoli."}
              </div>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)] text-[11px] font-semibold text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-3 py-2 text-center w-12">#</th>
                    <th className="px-3 py-2 text-left w-28">CODICE</th>
                    <th className="px-3 py-2 text-left">DESCRIZIONE (CLICCA PER STORICO)</th>
                    <th className="px-2 py-2 text-center w-14">U.M.</th>
                    <th className="px-3 py-2 text-right w-20">Q.TÀ</th>
                    <th className="px-3 py-2 text-right w-28">PREZZO LIST.</th>
                    <th className="px-2 py-2 text-center w-20">SCONTO</th>
                    <th className="px-3 py-2 text-right w-28">PREZZO NETTO</th>
                    <th className="px-3 py-2 text-right w-28">TOT. NETTO</th>
                    <th className="px-2 py-2 text-center w-16">IVA</th>
                    <th className="px-3 py-2 text-right w-28">COSTO ACQ.</th>
                    <th className="px-3 py-2 text-right w-24">MARGINE €</th>
                    <th className="px-3 py-2 text-right w-24">RICARICO %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
                  {activeItems.map((it, idx) => {
                    const unitPriceSub = it.unit_price?.toSubunits?.() ?? 0;
                    const netSub = it.net_amount?.toSubunits?.() ?? 0;
                    const purchaseSub = it.purchase_price?.toSubunits?.() ?? 0;
                    const qty = parseFloat((it.quantity || "0").replace(",", ".")) || 0;
                    const unitNet = qty > 0 ? netSub / qty : unitPriceSub;
                    const totalPurchase = Math.round(purchaseSub * qty);
                    const revenue = netSub - totalPurchase;
                    const markup = totalPurchase > 0 ? (revenue / totalPurchase) * 100 : null;

                    return (
                      <tr
                        key={it.id || idx}
                        onClick={() => {
                          if (it.description?.trim() || it.code?.trim()) {
                            setHistoryTarget(it);
                          }
                        }}
                        className="group cursor-pointer hover:bg-[var(--primary)]/10 transition-colors"
                        title="Clicca per aprire lo storico acquisti di questo articolo"
                      >
                        {/* Riga */}
                        <td className="px-3 py-2 text-center text-[var(--muted-foreground)] font-sans text-[11px]">
                          {it.row_index || idx + 1}
                        </td>

                        {/* Codice */}
                        <td className="px-3 py-2 font-mono text-[var(--primary)] font-semibold">
                          {it.code || "—"}
                        </td>

                        {/* Descrizione (link evidenziato) */}
                        <td className="px-3 py-2 font-sans font-medium text-[var(--foreground)]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="group-hover:text-[var(--primary)] group-hover:underline transition-colors">
                              {it.description}
                            </span>
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity rounded bg-[var(--primary)]/20 px-1.5 py-0.5 text-[10px] font-sans text-[var(--primary)] font-semibold">
                              Vedi storico ↗
                            </span>
                          </div>
                        </td>

                        {/* U.M. */}
                        <td className="px-2 py-2 text-center uppercase text-[var(--muted-foreground)]">
                          {it.unit || "NR"}
                        </td>

                        {/* Quantità */}
                        <td className="px-3 py-2 text-right font-bold text-[var(--foreground)]">
                          {it.quantity}
                        </td>

                        {/* Prezzo Listino */}
                        <td className="px-3 py-2 text-right text-[var(--muted-foreground)]">
                          {unitPriceSub > 0 ? formatDdtMoney(unitPriceSub) : "—"}
                        </td>

                        {/* Sconto */}
                        <td className="px-2 py-2 text-center text-amber-400 font-medium">
                          {it.discount_pct ? `${it.discount_pct}%` : "—"}
                        </td>

                        {/* Prezzo Netto Unitario */}
                        <td className="px-3 py-2 text-right font-bold text-sky-400">
                          {unitNet > 0 ? formatDdtMoney(Math.round(unitNet)) : "—"}
                        </td>

                        {/* Totale Netto */}
                        <td className="px-3 py-2 text-right font-semibold text-[var(--foreground)]">
                          {formatDdtMoney(netSub)}
                        </td>

                        {/* IVA */}
                        <td className="px-2 py-2 text-center text-[var(--muted-foreground)]">
                          {it.vat_rate !== undefined && it.vat_rate !== null ? `${it.vat_rate}%` : "22%"}
                        </td>

                        {/* Costo Acquisto */}
                        <td className="px-3 py-2 text-right text-[var(--muted-foreground)]">
                          {purchaseSub > 0 ? formatDdtMoney(purchaseSub) : "—"}
                        </td>

                        {/* Margine € */}
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            revenue > 0 ? "text-emerald-400" : revenue < 0 ? "text-rose-400" : "text-[var(--muted-foreground)]"
                          }`}
                        >
                          {revenue !== 0 ? formatDdtMoney(revenue) : "—"}
                        </td>

                        {/* Ricarico % */}
                        <td
                          className={`px-3 py-2 text-right font-medium ${
                            revenue > 0 ? "text-emerald-400" : revenue < 0 ? "text-rose-400" : "text-[var(--muted-foreground)]"
                          }`}
                        >
                          {formatDdtPercent(markup)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer Totali & Scorciatoie */}
          <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--background)] px-5 py-2.5 text-xs">
            <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
              <span>{activeItems.length} articoli presenti</span>
              <span>·</span>
              <span className="flex items-center gap-1 font-sans">
                Premi <kbd className="rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-mono">Esc</kbd> per chiudere
              </span>
            </div>

            {totals && (
              <div className="flex items-center gap-6 font-semibold">
                <div>
                  <span className="text-[var(--muted-foreground)] mr-1.5 font-normal">Tot. Imponibile:</span>
                  <span className="text-sm font-bold text-[var(--foreground)]">{formatDdtMoney(totals.taxableSubunits)}</span>
                </div>
                <div>
                  <span className="text-[var(--muted-foreground)] mr-1.5 font-normal">Tot. Costo:</span>
                  <span className="text-[var(--muted-foreground)]">{formatDdtMoney(totals.purchaseSubunits)}</span>
                </div>
                <div>
                  <span className="text-[var(--muted-foreground)] mr-1.5 font-normal">Ricavo Netto:</span>
                  <span className={totals.revenueSubunits >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                    {formatDdtMoney(totals.revenueSubunits)}
                  </span>
                </div>
                {totals.markupPercent !== null && (
                  <div>
                    <span className="text-[var(--muted-foreground)] mr-1.5 font-normal">Ricarico Medio:</span>
                    <span className={totals.revenueSubunits >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                      {formatDdtPercent(totals.markupPercent)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sotto-popup: Storico Articolo per il Cliente */}
      {historyTarget && doc && (
        <DDTClientArticleHistoryModal
          isOpen={true}
          onClose={() => setHistoryTarget(null)}
          clientName={doc.client_name}
          articleDescription={historyTarget.description}
          articleCode={historyTarget.code}
          onSelectDdt={(otherDdtId) => {
            setHistoryTarget(null);
            if (otherDdtId !== ddtId) {
              setDoc(null);
              setIsLoading(true);
              void new DdtRepository().getDdtById(otherDdtId).then((loaded) => {
                setDoc(loaded);
                setIsLoading(false);
              });
            }
          }}
        />
      )}
    </>
  );
};

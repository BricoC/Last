import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Search,
  X,
  CheckCircle2,
  User,
  Calendar,
  Layers,
  ArrowRight,
} from "lucide-react";
import { quoteItemLibraryService } from "../services/quoteItemLibraryService";
import type { QuoteHistoricalItem } from "../models/quoteLibrary";
import type { QuoteDraftItem } from "../models/quoteDraft";
import { formatQuoteCode } from "../models/quoteDraft";
import { money } from "@/shared/domain/monetaryValue";

export interface QuoteItemSearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentClientName?: string;
  alexMode: boolean;
  suppliers?: string[];
  onInsertItem: (item: Partial<QuoteDraftItem>) => void;
  onShowMessage: (msg: string) => void;
}

export function QuoteItemSearchPanel({
  isOpen,
  onClose,
  currentClientName,
  alexMode,
  suppliers = [],
  onInsertItem,
  onShowMessage,
}: QuoteItemSearchPanelProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const historyModalTableRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("Tutti");
  const [filterCurrentClientOnly, setFilterCurrentClientOnly] = useState(false);

  const [rawHistoryItems, setRawHistoryItems] = useState<QuoteHistoricalItem[]>([]);
  const [selectedRowIdx, setSelectedRowIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  // Modale Cronologia Estesa di un articolo (Tutte le volte che è stato inserito)
  const [selectedArticleForHistory, setSelectedArticleForHistory] = useState<QuoteHistoricalItem | null>(null);
  const [articleOccurrences, setArticleOccurrences] = useState<QuoteHistoricalItem[]>([]);
  const [loadingOccurrences, setLoadingOccurrences] = useState(false);
  const [selectedOccurIdx, setSelectedOccurIdx] = useState(0);

  // Popup finale "INSERIMENTO ARTICOLO" con specifica quantità (Fedele a DDT Studio)
  const [pendingInsert, setPendingInsert] = useState<QuoteHistoricalItem | null>(null);
  const [insertQuantity, setInsertQuantity] = useState("1");
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Focus sul campo ricerca all'apertura
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Caricamento storico da backend con ricerca multi-termine
  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const items = await quoteItemLibraryService.getHistoricalItems({
        search,
        supplier: selectedSupplier,
        clientName: filterCurrentClientOnly && currentClientName ? currentClientName : undefined,
        limit: 500,
      });
      setRawHistoryItems(items);
      setSelectedRowIdx(0);
    } catch (err) {
      console.error("[QuoteItemSearchPanel] Errore caricamento storico:", err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedSupplier, filterCurrentClientOnly, currentClientName]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      void loadHistory();
    }, 80);
    return () => clearTimeout(timer);
  }, [isOpen, loadHistory]);

  // De-duplicazione articoli: visualizza sempre e solo la voce più recente per ogni descrizione
  const recentUniqueItems = useMemo(() => {
    const seen = new Set<string>();
    const unique: QuoteHistoricalItem[] = [];
    for (const item of rawHistoryItems) {
      const key = item.description.trim().toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }
    return unique;
  }, [rawHistoryItems]);

  // Apertura modale cronologia estesa per l'articolo selezionato
  const handleOpenArticleHistory = useCallback(async (item: QuoteHistoricalItem) => {
    setSelectedArticleForHistory(item);
    setSelectedOccurIdx(0);
    setLoadingOccurrences(true);
    try {
      const occs = await quoteItemLibraryService.getHistoryForDescription(item.description);
      // Se dal db ne trova almeno 1 usa quelle, altrimenti usa i dati già in memoria
      if (occs.length > 0) {
        setArticleOccurrences(occs);
      } else {
        const fallback = rawHistoryItems.filter(
          (h) => h.description.trim().toUpperCase() === item.description.trim().toUpperCase()
        );
        setArticleOccurrences(fallback.length > 0 ? fallback : [item]);
      }
    } catch (e) {
      console.warn("Errore caricamento cronologia articolo:", e);
      setArticleOccurrences([item]);
    } finally {
      setLoadingOccurrences(false);
    }
  }, [rawHistoryItems]);

  // Apertura popup quantità per l'occorrenza storica scelta
  const handleOpenQuantityModal = useCallback((occurrence: QuoteHistoricalItem) => {
    setPendingInsert(occurrence);
    setInsertQuantity(occurrence.quantity && Number(occurrence.quantity) > 0 ? String(occurrence.quantity) : "1");
    setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 50);
  }, []);

  // Conferma inserimento nel preventivo
  const handleConfirmInsert = () => {
    if (!pendingInsert) return;

    const qty = insertQuantity.trim() ? insertQuantity.trim() : "1";
    const salePrice = pendingInsert.forced_unit_price
      ? money(pendingInsert.forced_unit_price).toCanonicalString()
      : pendingInsert.base_unit_price
      ? money(pendingInsert.base_unit_price).toCanonicalString()
      : pendingInsert.effective_unit_price
      ? money(pendingInsert.effective_unit_price).toCanonicalString()
      : "";

    onInsertItem({
      description: pendingInsert.description,
      unit: pendingInsert.unit || "NR",
      quantity: qty,
      supplier: pendingInsert.supplier || "",
      supplier_item_code: pendingInsert.supplier_item_code || "",
      code: pendingInsert.code || "",
      purchase_price: pendingInsert.purchase_price ? money(pendingInsert.purchase_price).toCanonicalString() : "0",
      markup_pct: pendingInsert.markup_pct ?? 0,
      base_unit_price: pendingInsert.base_unit_price ? money(pendingInsert.base_unit_price).toCanonicalString() : "",
      forced_unit_price: salePrice,
      discount_pct: pendingInsert.discount_pct ?? 0,
      vat_rate: pendingInsert.vat_rate ?? 22,
      availability: "", // Rimosso autoinserimento disponibilità: si fa sempre a mano
      notes: pendingInsert.notes || "",
    });

    onShowMessage(`✓ Inserito ${qty}x "${pendingInsert.description.slice(0, 30)}..."`);
    setPendingInsert(null);
    setSelectedArticleForHistory(null);
  };

  // Navigazione tastiera nel pannello principale di destra
  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (pendingInsert || selectedArticleForHistory) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedRowIdx((prev) => Math.min(prev + 1, Math.max(0, recentUniqueItems.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedRowIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = recentUniqueItems[selectedRowIdx];
      if (current) {
        void handleOpenArticleHistory(current);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Gestione globale da tastiera (Esc, Invio, Frecce ↑↓) per la modale cronologia estesa
  useEffect(() => {
    if (!selectedArticleForHistory || pendingInsert) return;

    const onGlobalKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedArticleForHistory(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const chosen = articleOccurrences[selectedOccurIdx];
        if (chosen) {
          handleOpenQuantityModal(chosen);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedOccurIdx((prev) => Math.min(prev + 1, Math.max(0, articleOccurrences.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedOccurIdx((prev) => Math.max(prev - 1, 0));
      }
    };

    window.addEventListener("keydown", onGlobalKey, true);
    return () => window.removeEventListener("keydown", onGlobalKey, true);
  }, [selectedArticleForHistory, pendingInsert, articleOccurrences, selectedOccurIdx, handleOpenQuantityModal]);

  // Gestione globale da tastiera per il popup quantità
  useEffect(() => {
    if (!pendingInsert) return;

    const onPendingGlobalKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setPendingInsert(null);
      } else if (e.key === "F4") {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", onPendingGlobalKey, true);
    return () => window.removeEventListener("keydown", onPendingGlobalKey, true);
  }, [pendingInsert]);

  // Focus automatico quando si apre la cronologia estesa
  useEffect(() => {
    if (selectedArticleForHistory) {
      setTimeout(() => historyModalTableRef.current?.focus(), 40);
    }
  }, [selectedArticleForHistory]);

  // Mantieni visibile nello scroll la riga selezionata nel pannello
  useEffect(() => {
    if (!tableContainerRef.current) return;
    const rowEl = tableContainerRef.current.querySelector(`[data-row-index="${selectedRowIdx}"]`);
    if (rowEl instanceof HTMLElement) {
      rowEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selectedRowIdx]);

  // Mantieni visibile nello scroll la riga selezionata nella cronologia estesa
  useEffect(() => {
    if (!historyModalTableRef.current) return;
    const rowEl = historyModalTableRef.current.querySelector(`[data-history-row-index="${selectedOccurIdx}"]`);
    if (rowEl instanceof HTMLElement) {
      rowEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selectedOccurIdx]);

  if (!isOpen) return null;

  return (
    <div
      className="flex h-full w-full flex-col bg-[var(--card)] text-[var(--foreground)] select-none text-xs"
      onKeyDown={handlePanelKeyDown}
    >
      {/* Header pannello */}
      <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 bg-[var(--background)]">
        <div className="flex items-center gap-2 min-w-0">
          <Search className="h-4 w-4 text-[var(--primary)] shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-wide truncate">
            Ricerca Articoli & Storico Preventivi
          </h2>
          <span
            className="rounded-full bg-[var(--card)] px-1.5 py-0.2 text-[10px] font-bold text-[var(--muted-foreground)] border border-[var(--border)] shrink-0"
            title="Articoli unici più recenti"
          >
            {recentUniqueItems.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Chiudi ricerca (F4 / Esc)"
          className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors cursor-pointer shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Barra di Ricerca Multi-Parola */}
      <div className="border-b border-[var(--border)] p-2.5 space-y-2 bg-[var(--background)]/60">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
          <input
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per descrizione, fornitore o cliente (più parole)..."
            className="w-full rounded border border-[var(--border)] bg-[var(--background)] py-1.5 pl-8 pr-7 text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)] placeholder:text-[var(--muted-foreground)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filtri rapidi compatti */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          {currentClientName ? (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={filterCurrentClientOnly}
                onChange={(e) => setFilterCurrentClientOnly(e.target.checked)}
                className="rounded border-[var(--border)] text-[var(--primary)]"
              />
              <span className="flex items-center gap-1 text-[var(--muted-foreground)]">
                <User className="h-3 w-3 text-sky-400" />
                Solo per <strong className="text-[var(--foreground)] truncate max-w-[130px]">{currentClientName}</strong>
              </span>
            </label>
          ) : (
            <span className="text-[10px] text-[var(--muted-foreground)] italic">
              Nessun cliente nel preventivo
            </span>
          )}

          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-[var(--muted-foreground)]">Fornitore:</span>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[10px] text-[var(--foreground)] outline-none"
            >
              <option value="Tutti">Tutti</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabella Compatta dei Risultati (Voci Univoche Più Recenti) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Intestazione Tabella */}
        <div className="grid grid-cols-[1fr_85px_45px_80px_90px] items-center border-b border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] shrink-0">
          <div>Descrizione (Recente)</div>
          <div>Fornitore</div>
          <div className="text-center">UM</div>
          <div className="text-right">Netto €</div>
          <div className="text-right">Ultima Data</div>
        </div>

        {/* Corpo Tabella */}
        <div
          ref={tableContainerRef}
          tabIndex={0}
          className="flex-1 overflow-y-auto scrollbar-thin outline-none focus:ring-1 focus:ring-[var(--primary)]/30"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--muted-foreground)] gap-1.5">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
              <span className="text-[11px]">Ricerca in corso...</span>
            </div>
          ) : recentUniqueItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--muted-foreground)] space-y-1">
              <p className="font-semibold text-[var(--foreground)]">Nessun articolo trovato</p>
              <p className="text-[11px]">
                {search
                  ? "Nessun risultato corrispondente alle parole cercate."
                  : "Le righe compilate nei preventivi appariranno qui automaticamente."}
              </p>
            </div>
          ) : (
            recentUniqueItems.map((item, idx) => {
              const isSelected = idx === selectedRowIdx;
              const salePrice = item.forced_unit_price ?? item.effective_unit_price;
              const quoteCode = formatQuoteCode(item.year, item.quote_number);

              return (
                <div
                  key={item.id}
                  data-row-index={idx}
                  onClick={() => setSelectedRowIdx(idx)}
                  onDoubleClick={() => void handleOpenArticleHistory(item)}
                  className={`grid grid-cols-[1fr_85px_45px_80px_90px] items-center px-2 py-1.5 border-b border-[var(--border)]/50 cursor-pointer transition-colors text-[11px] leading-tight ${
                    isSelected
                      ? "bg-sky-600/25 border-l-2 border-l-sky-400 font-semibold text-white"
                      : idx % 2 === 0
                      ? "bg-[var(--card)] hover:bg-[var(--background)]"
                      : "bg-[var(--background)]/40 hover:bg-[var(--background)]"
                  }`}
                  title="Doppio click o Invio per aprire cronologia completa"
                >
                  {/* Descrizione */}
                  <div className="truncate pr-1 font-medium text-[var(--foreground)]" title={item.description}>
                    {item.description}
                  </div>

                  {/* Fornitore */}
                  <div className="truncate text-[10px] text-[var(--muted-foreground)]" title={item.supplier || ""}>
                    {item.supplier || "—"}
                  </div>

                  {/* UM */}
                  <div className="text-center font-mono text-[10px] text-[var(--muted-foreground)]">
                    {item.unit || "NR"}
                  </div>

                  {/* Prezzo Vendita Netto */}
                  <div className="text-right font-mono font-bold text-sky-400">
                    {salePrice.formatIT(true, 2, 2)}
                  </div>

                  {/* Ultima Data / Preventivo */}
                  <div className="text-right text-[10px] text-[var(--muted-foreground)] truncate pl-1" title={`${quoteCode ? `Prev. ${quoteCode}` : "Prev."} - ${item.quote_date}`}>
                    <span>{item.quote_date || quoteCode}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer Scorciatoie */}
      <footer className="border-t border-[var(--border)] px-3 py-1.5 bg-[var(--background)] flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
        <span>
          <strong>Invio / Doppio Click</strong>: vedi storico • <strong>Frecce ↑↓</strong>: scorri
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-0.5 rounded bg-[var(--card)] hover:bg-[var(--border)] text-[var(--foreground)] font-bold transition-colors cursor-pointer"
        >
          Chiudi (F4/Esc)
        </button>
      </footer>

      {/* MODALE CRONOLOGIA ESTESA: Tutte le volte che l'articolo è stato inserito */}
      {selectedArticleForHistory && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[65] flex items-center justify-center p-4 animate-in fade-in duration-100"
        >
          <div className="w-full max-w-3xl max-h-[85vh] bg-[#0f172a] border border-sky-500/40 rounded-xl shadow-2xl flex flex-col text-white overflow-hidden">
            {/* Header Modale Cronologia */}
            <header className="flex items-center justify-between border-b border-sky-500/30 px-4 py-3 bg-[#1e293b]/70 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  <Layers className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-sky-400">
                      CRONOLOGIA PREVENTIVI ({articleOccurrences.length} OCCORRENZE)
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-amber-300 truncate" title={selectedArticleForHistory.description}>
                    {selectedArticleForHistory.description}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedArticleForHistory(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Chiudi cronologia (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* Sottotitolo Guida */}
            <div className="px-4 py-1.5 bg-slate-900/60 border-b border-slate-800 text-[11px] text-slate-300 flex items-center justify-between shrink-0">
              <span>
                Seleziona la voce con il prezzo / fornitore desiderato (<strong>Doppio click o Invio</strong> per specificare la quantità).
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Frecce ↑↓: scorri • Invio: scegli
              </span>
            </div>

            {/* Tabella Occorrenze Storiche */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="grid grid-cols-[85px_80px_1fr_90px_45px_45px_85px_35px] items-center border-b border-slate-700 bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                <div>Data</div>
                <div>Prev. N°</div>
                <div>Cliente</div>
                <div>Fornitore</div>
                <div className="text-center">UM</div>
                <div className="text-center">Qtà</div>
                <div className="text-right">Netto €</div>
                <div className="text-center">#</div>
              </div>

              <div
                ref={historyModalTableRef}
                tabIndex={0}
                className="flex-1 overflow-y-auto divide-y divide-slate-800 outline-none scrollbar-thin"
              >
                {loadingOccurrences ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                    <span className="text-xs">Caricamento occorrenze passate...</span>
                  </div>
                ) : articleOccurrences.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Nessun'altra occorrenza trovata nei preventivi.
                  </div>
                ) : (
                  articleOccurrences.map((occ, idx) => {
                    const isSelected = idx === selectedOccurIdx;
                    const salePrice = occ.forced_unit_price ?? occ.effective_unit_price;
                    const qCode = formatQuoteCode(occ.year, occ.quote_number);

                    return (
                      <div
                        key={occ.id || idx}
                        data-history-row-index={idx}
                        onClick={() => setSelectedOccurIdx(idx)}
                        onDoubleClick={() => handleOpenQuantityModal(occ)}
                        className={`grid grid-cols-[85px_80px_1fr_90px_45px_45px_85px_35px] items-center px-3 py-2 cursor-pointer transition-colors text-xs ${
                          isSelected
                            ? "bg-sky-600/30 border-l-2 border-l-sky-400 font-semibold text-white"
                            : "hover:bg-slate-800/60 text-slate-200"
                        }`}
                        title="Doppio click o Invio per inserire questa voce nel preventivo"
                      >
                        <div className="font-mono text-[11px] text-slate-300 flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-500 shrink-0" />
                          <span>{occ.quote_date || "—"}</span>
                        </div>
                        <div className="font-mono text-[11px] text-sky-400 font-bold">
                          {qCode ? `#${qCode}` : "—"}
                        </div>
                        <div className="truncate text-slate-300 font-medium" title={occ.client_name || ""}>
                          {occ.client_name || "—"}
                        </div>
                        <div className="truncate text-[11px] text-slate-400" title={occ.supplier || ""}>
                          {occ.supplier || "—"}
                        </div>
                        <div className="text-center font-mono text-[11px] text-slate-400">
                          {occ.unit || "NR"}
                        </div>
                        <div className="text-center font-mono text-[11px] text-slate-300 font-bold">
                          {occ.quantity || "1"}
                        </div>
                        <div className="text-right font-mono font-bold text-emerald-400">
                          {salePrice.formatIT(true, 2, 2)}
                          {alexMode && !occ.purchase_price.isZero() && (
                            <span className="block text-[9px] text-amber-400 font-normal">
                              Acq: {occ.purchase_price.formatIT(true, 2, 2)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenQuantityModal(occ);
                            }}
                            className="p-1 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500 hover:text-white transition-colors cursor-pointer"
                            title="Scegli e inserisci questa voce"
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer Modale Cronologia */}
            <footer className="border-t border-slate-800 px-4 py-2.5 bg-slate-900 flex items-center justify-between text-xs shrink-0">
              <span className="text-slate-400 text-[11px]">
                Totale occorrenze trovate: <strong>{articleOccurrences.length}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedArticleForHistory(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
                >
                  Annulla (Esc)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const chosen = articleOccurrences[selectedOccurIdx];
                    if (chosen) handleOpenQuantityModal(chosen);
                  }}
                  disabled={articleOccurrences.length === 0}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>Scegli Voce (Invio)</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* POPUP FINALE "INSERIMENTO ARTICOLO" CON QUANTITÀ (Fedele a DDT Studio) */}
      {pendingInsert && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[70] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-100"
          onKeyDown={(e) => {
            if (e.key === "F4") {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <div className="w-full max-w-lg bg-[#0f172a] border border-blue-500/40 rounded-xl shadow-2xl p-5 flex flex-col space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-blue-500/30 pb-2.5">
              <div className="flex items-center space-x-2 text-blue-400">
                <CheckCircle2 className="w-5 h-5 text-blue-400" />
                <span className="font-black text-sm tracking-wide text-white uppercase">
                  INSERIMENTO ARTICOLO
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPendingInsert(null)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">Articolo Selezionato:</label>
              <div className="mt-1 p-3 rounded-lg bg-[#1e293b] border border-blue-500/30">
                <p className="font-bold text-sm text-amber-300 leading-snug">
                  {pendingInsert.description}
                </p>
                <div className="mt-1 flex items-center gap-3 text-[11px] font-mono text-slate-400">
                  {pendingInsert.supplier && <span>Fornitore: {pendingInsert.supplier}</span>}
                  <span>UM: {pendingInsert.unit || "NR"}</span>
                  <span className="text-emerald-400 font-bold">
                    Netto: {(pendingInsert.forced_unit_price ?? pendingInsert.effective_unit_price).formatIT(true, 2, 2)}
                  </span>
                  {alexMode && !pendingInsert.purchase_price.isZero() && (
                    <span className="text-amber-400 font-mono">
                      Acq: {pendingInsert.purchase_price.formatIT(true, 2, 2)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <label className="text-sm font-bold text-white">Specifica Quantità:</label>
              <input
                ref={qtyInputRef}
                type="number"
                min="0.001"
                step="any"
                value={insertQuantity}
                onChange={(e) => setInsertQuantity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleConfirmInsert();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setPendingInsert(null);
                  }
                }}
                className="w-28 px-3 py-1.5 text-center text-sm font-black bg-[#1e293b] border border-blue-500 rounded-lg text-white outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-slate-700/50">
              <button
                type="button"
                onClick={() => setPendingInsert(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmInsert}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-500/30 transition-all cursor-pointer"
              >
                ✓ Conferma e Inserisci (Invio)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

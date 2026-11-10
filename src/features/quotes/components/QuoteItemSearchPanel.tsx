import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Search,
  X,
  User,
  Calendar,
  Layers,
  ArrowRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
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

type PanelSortField = "description" | "supplier" | "price" | "date";
type OccurSortField = "date" | "quote_number" | "client_name" | "supplier" | "unit" | "quantity" | "purchase_price" | "markup_pct" | "sale_price";
type SortDirection = "asc" | "desc";

export function QuoteItemSearchPanel({
  isOpen,
  onClose,
  currentClientName,
  alexMode: _alexMode,
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

  // Ordinamento per tabella principale (Pannello ricerca)
  const [panelSortField, setPanelSortField] = useState<PanelSortField>("date");
  const [panelSortDir, setPanelSortDir] = useState<SortDirection>("desc");

  // Ordinamento per tabella modale (Cronologia preventiva estesa)
  const [occurSortField, setOccurSortField] = useState<OccurSortField>("date");
  const [occurSortDir, setOccurSortDir] = useState<SortDirection>("desc");

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

  // De-duplicazione articoli: visualizza la voce più recente per ogni descrizione
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

  // Ordinamento tabella principale del pannello
  const sortedUniqueItems = useMemo(() => {
    const list = [...recentUniqueItems];
    list.sort((a, b) => {
      let cmp = 0;
      if (panelSortField === "description") {
        cmp = a.description.localeCompare(b.description, "it", { sensitivity: "base" });
      } else if (panelSortField === "supplier") {
        cmp = (a.supplier || "").localeCompare(b.supplier || "", "it", { sensitivity: "base" });
      } else if (panelSortField === "price") {
        const priceA = (a.forced_unit_price ?? a.effective_unit_price).toNumber();
        const priceB = (b.forced_unit_price ?? b.effective_unit_price).toNumber();
        cmp = priceA - priceB;
      } else if (panelSortField === "date") {
        const dateA = a.quote_date || "";
        const dateB = b.quote_date || "";
        cmp = dateA.localeCompare(dateB);
        if (cmp === 0) {
          cmp = (a.quote_number || 0) - (b.quote_number || 0);
        }
      }
      return panelSortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [recentUniqueItems, panelSortField, panelSortDir]);

  const handlePanelSortToggle = (field: PanelSortField) => {
    if (panelSortField === field) {
      setPanelSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setPanelSortField(field);
      setPanelSortDir(field === "price" || field === "date" ? "desc" : "asc");
    }
  };

  // Apertura modale cronologia estesa per l'articolo selezionato
  const handleOpenArticleHistory = useCallback(async (item: QuoteHistoricalItem) => {
    setSelectedArticleForHistory(item);
    setSelectedOccurIdx(0);
    setLoadingOccurrences(true);
    try {
      const occs = await quoteItemLibraryService.getHistoryForDescription(item.description);
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

  // Ordinamento occorrenze nella modale
  const sortedOccurrences = useMemo(() => {
    const list = [...articleOccurrences];
    list.sort((a, b) => {
      let cmp = 0;
      if (occurSortField === "date") {
        cmp = (a.quote_date || "").localeCompare(b.quote_date || "");
        if (cmp === 0) cmp = (a.quote_number || 0) - (b.quote_number || 0);
      } else if (occurSortField === "quote_number") {
        cmp = (a.quote_number || 0) - (b.quote_number || 0);
      } else if (occurSortField === "client_name") {
        cmp = (a.client_name || "").localeCompare(b.client_name || "", "it", { sensitivity: "base" });
      } else if (occurSortField === "supplier") {
        cmp = (a.supplier || "").localeCompare(b.supplier || "", "it", { sensitivity: "base" });
      } else if (occurSortField === "unit") {
        cmp = (a.unit || "").localeCompare(b.unit || "", "it", { sensitivity: "base" });
      } else if (occurSortField === "quantity") {
        const qA = Number(a.quantity) || 0;
        const qB = Number(b.quantity) || 0;
        cmp = qA - qB;
      } else if (occurSortField === "purchase_price") {
        cmp = a.purchase_price.toNumber() - b.purchase_price.toNumber();
      } else if (occurSortField === "markup_pct") {
        const pA = a.purchase_price;
        const sA = a.forced_unit_price ?? a.effective_unit_price;
        const pB = b.purchase_price;
        const sB = b.forced_unit_price ?? b.effective_unit_price;
        const mkA = !pA.isZero() ? sA.minus(pA).dividedBy(pA).toNumber() : 0;
        const mkB = !pB.isZero() ? sB.minus(pB).dividedBy(pB).toNumber() : 0;
        cmp = mkA - mkB;
      } else if (occurSortField === "sale_price") {
        const spA = (a.forced_unit_price ?? a.effective_unit_price).toNumber();
        const spB = (b.forced_unit_price ?? b.effective_unit_price).toNumber();
        cmp = spA - spB;
      }
      return occurSortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [articleOccurrences, occurSortField, occurSortDir]);

  const handleOccurSortToggle = (field: OccurSortField) => {
    if (occurSortField === field) {
      setOccurSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setOccurSortField(field);
      setOccurSortDir(
        field === "purchase_price" || field === "markup_pct" || field === "sale_price" || field === "date" || field === "quantity" || field === "quote_number"
          ? "desc"
          : "asc"
      );
    }
  };

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
      availability: "",
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
      setSelectedRowIdx((prev) => Math.min(prev + 1, Math.max(0, sortedUniqueItems.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedRowIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = sortedUniqueItems[selectedRowIdx];
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
        const chosen = sortedOccurrences[selectedOccurIdx];
        if (chosen) {
          handleOpenQuantityModal(chosen);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedOccurIdx((prev) => Math.min(prev + 1, Math.max(0, sortedOccurrences.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedOccurIdx((prev) => Math.max(prev - 1, 0));
      }
    };

    window.addEventListener("keydown", onGlobalKey, true);
    return () => window.removeEventListener("keydown", onGlobalKey, true);
  }, [selectedArticleForHistory, pendingInsert, sortedOccurrences, selectedOccurIdx, handleOpenQuantityModal]);

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

  const renderSortArrow = (active: boolean, dir: SortDirection) => {
    if (!active) return <ArrowUpDown className="inline-block ml-1 h-2.5 w-2.5 opacity-40" />;
    return dir === "asc" ? (
      <ArrowUp className="inline-block ml-1 h-3 w-3 text-sky-400" />
    ) : (
      <ArrowDown className="inline-block ml-1 h-3 w-3 text-sky-400" />
    );
  };

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
            {sortedUniqueItems.length}
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

      {/* Tabella Compatta dei Risultati (Voci Univoche Più Recenti con colonne ordinabili) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Intestazione Tabella con click per ordinare */}
        <div className="grid grid-cols-[1fr_95px_95px_85px] items-center border-b border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] shrink-0">
          <button
            type="button"
            onClick={() => handlePanelSortToggle("description")}
            className="text-left flex items-center hover:text-[var(--foreground)] cursor-pointer truncate"
          >
            <span>Descrizione</span>
            {renderSortArrow(panelSortField === "description", panelSortDir)}
          </button>
          <button
            type="button"
            onClick={() => handlePanelSortToggle("supplier")}
            className="text-left flex items-center hover:text-[var(--foreground)] cursor-pointer truncate"
          >
            <span>Fornitore</span>
            {renderSortArrow(panelSortField === "supplier", panelSortDir)}
          </button>
          <button
            type="button"
            onClick={() => handlePanelSortToggle("price")}
            className="text-right flex items-center justify-end hover:text-[var(--foreground)] cursor-pointer"
            title="Prezzo vendita netto (4 decimali)"
          >
            <span>Netto €</span>
            {renderSortArrow(panelSortField === "price", panelSortDir)}
          </button>
          <button
            type="button"
            onClick={() => handlePanelSortToggle("date")}
            className="text-right flex items-center justify-end hover:text-[var(--foreground)] cursor-pointer"
          >
            <span>Ultima Data</span>
            {renderSortArrow(panelSortField === "date", panelSortDir)}
          </button>
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
          ) : sortedUniqueItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--muted-foreground)] space-y-1">
              <p className="font-semibold text-[var(--foreground)]">Nessun articolo trovato</p>
              <p className="text-[11px]">
                {search
                  ? "Nessun risultato corrispondente alle parole cercate."
                  : "Le righe compilate nei preventivi appariranno qui automaticamente."}
              </p>
            </div>
          ) : (
            sortedUniqueItems.map((item, idx) => {
              const isSelected = idx === selectedRowIdx;
              const salePrice = item.forced_unit_price ?? item.effective_unit_price;
              const quoteCode = formatQuoteCode(item.year, item.quote_number);

              return (
                <div
                  key={item.id}
                  data-row-index={idx}
                  onClick={() => setSelectedRowIdx(idx)}
                  onDoubleClick={() => void handleOpenArticleHistory(item)}
                  className={`grid grid-cols-[1fr_95px_95px_85px] items-center px-2 py-1.5 border-b border-[var(--border)]/50 cursor-pointer transition-colors text-[11px] leading-tight ${
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

                  {/* Prezzo Vendita Netto (4 decimali) */}
                  <div className="text-right font-mono font-bold text-sky-400">
                    {salePrice.formatIT(true, 4, 4)}
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

      {/* MODALE CRONOLOGIA ESTESA: Tutte le volte che l'articolo è stato inserito (GRANDE QUASI A TUTTO SCHERMO) */}
      {selectedArticleForHistory && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[65] flex items-center justify-center p-2 animate-in fade-in duration-100"
        >
          <div className="w-[98vw] max-w-[96rem] h-[92vh] max-h-[96vh] bg-[#0f172a] border border-sky-500/40 rounded-xl shadow-2xl flex flex-col text-white overflow-hidden">
            {/* Header Modale Cronologia */}
            <header className="flex items-center justify-between border-b border-sky-500/30 px-5 py-3.5 bg-[#1e293b]/80 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-sky-400">
                      CRONOLOGIA PREVENTIVI ({sortedOccurrences.length} OCCORRENZE)
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-amber-300 truncate" title={selectedArticleForHistory.description}>
                    {selectedArticleForHistory.description}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedArticleForHistory(null)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Chiudi cronologia (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Sottotitolo Guida */}
            <div className="px-5 py-2 bg-slate-900/70 border-b border-slate-800 text-xs text-slate-300 flex items-center justify-between shrink-0">
              <span>
                Seleziona la voce con il prezzo / fornitore desiderato (<strong>Doppio click o Invio</strong> per specificare la quantità). Clicca sulle intestazioni per ordinare.
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Frecce ↑↓: scorri • Invio: scegli
              </span>
            </div>

            {/* Tabella Occorrenze Storiche con Colonne Acquisto (5 dec), Ricarico % e Netto (4 dec) Suddivise e Ordinabili */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="grid grid-cols-[95px_85px_1fr_130px_50px_60px_110px_90px_110px_40px] items-center border-b border-slate-700 bg-slate-900/90 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOccurSortToggle("date")}
                  className="text-left flex items-center hover:text-white cursor-pointer"
                >
                  <span>Data</span>
                  {renderSortArrow(occurSortField === "date", occurSortDir)}
                </button>
                <button
                  type="button"
                  onClick={() => handleOccurSortToggle("quote_number")}
                  className="text-left flex items-center hover:text-white cursor-pointer"
                >
                  <span>Prev. N°</span>
                  {renderSortArrow(occurSortField === "quote_number", occurSortDir)}
                </button>
                <button
                  type="button"
                  onClick={() => handleOccurSortToggle("client_name")}
                  className="text-left flex items-center hover:text-white cursor-pointer truncate"
                >
                  <span>Cliente</span>
                  {renderSortArrow(occurSortField === "client_name", occurSortDir)}
                </button>
                <button
                  type="button"
                  onClick={() => handleOccurSortToggle("supplier")}
                  className="text-left flex items-center hover:text-white cursor-pointer truncate"
                >
                  <span>Fornitore</span>
                  {renderSortArrow(occurSortField === "supplier", occurSortDir)}
                </button>
                <button
                  type="button"
                  onClick={() => handleOccurSortToggle("unit")}
                  className="text-center flex items-center justify-center hover:text-white cursor-pointer"
                >
                  <span>UM</span>
                  {renderSortArrow(occurSortField === "unit", occurSortDir)}
                </button>
                <button
                  type="button"
                  onClick={() => handleOccurSortToggle("quantity")}
                  className="text-center flex items-center justify-center hover:text-white cursor-pointer"
                >
                  <span>Qtà</span>
                  {renderSortArrow(occurSortField === "quantity", occurSortDir)}
                </button>
                <button
                  type="button"
                  onClick={() => handleOccurSortToggle("purchase_price")}
                  className="text-right flex items-center justify-end hover:text-white cursor-pointer"
                  title="Costo acquisto (5 decimali)"
                >
                  <span>Acq. €</span>
                  {renderSortArrow(occurSortField === "purchase_price", occurSortDir)}
                </button>
                <button
                  type="button"
                  onClick={() => handleOccurSortToggle("markup_pct")}
                  className="text-right flex items-center justify-end hover:text-white cursor-pointer"
                  title="Percentuale di ricarico ((Netto - Acq) / Acq)"
                >
                  <span>Ric. %</span>
                  {renderSortArrow(occurSortField === "markup_pct", occurSortDir)}
                </button>
                <button
                  type="button"
                  onClick={() => handleOccurSortToggle("sale_price")}
                  className="text-right flex items-center justify-end hover:text-white cursor-pointer"
                  title="Prezzo vendita netto (4 decimali)"
                >
                  <span>Netto €</span>
                  {renderSortArrow(occurSortField === "sale_price", occurSortDir)}
                </button>
                <div className="text-center">#</div>
              </div>

              <div
                ref={historyModalTableRef}
                tabIndex={0}
                className="flex-1 overflow-y-auto divide-y divide-slate-800 outline-none scrollbar-thin"
              >
                {loadingOccurrences ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                    <span className="text-xs">Caricamento occorrenze passate...</span>
                  </div>
                ) : sortedOccurrences.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-400">
                    Nessun'altra occorrenza trovata nei preventivi.
                  </div>
                ) : (
                  sortedOccurrences.map((occ, idx) => {
                    const isSelected = idx === selectedOccurIdx;
                    const salePrice = occ.forced_unit_price ?? occ.effective_unit_price;
                    const qCode = formatQuoteCode(occ.year, occ.quote_number);
                    const purchasePrice = occ.purchase_price;
                    let markupPct: number | null = null;
                    if (!purchasePrice.isZero() && !purchasePrice.isNegative()) {
                      markupPct = salePrice.minus(purchasePrice).dividedBy(purchasePrice).times(100).toNumber();
                    } else if (purchasePrice.isZero() && !salePrice.isZero()) {
                      markupPct = 100;
                    }

                    return (
                      <div
                        key={occ.id || idx}
                        data-history-row-index={idx}
                        onClick={() => setSelectedOccurIdx(idx)}
                        onDoubleClick={() => handleOpenQuantityModal(occ)}
                        className={`grid grid-cols-[95px_85px_1fr_130px_50px_60px_110px_90px_110px_40px] items-center px-4 py-2.5 cursor-pointer transition-colors text-xs ${
                          isSelected
                            ? "bg-sky-600/30 border-l-4 border-l-sky-400 font-semibold text-white"
                            : "hover:bg-slate-800/60 text-slate-200"
                        }`}
                        title="Doppio click o Invio per inserire questa voce nel preventivo"
                      >
                        <div className="font-mono text-xs text-slate-300 flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span>{occ.quote_date || "—"}</span>
                        </div>
                        <div className="font-mono text-xs text-sky-400 font-bold">
                          {qCode ? `#${qCode}` : "—"}
                        </div>
                        <div className="truncate text-slate-200 font-medium pr-2" title={occ.client_name || ""}>
                          {occ.client_name || "—"}
                        </div>
                        <div className="truncate text-xs text-slate-300" title={occ.supplier || ""}>
                          {occ.supplier || "—"}
                        </div>
                        <div className="text-center font-mono text-xs text-slate-300">
                          {occ.unit || "NR"}
                        </div>
                        <div className="text-center font-mono text-xs text-white font-bold">
                          {occ.quantity || "1"}
                        </div>
                        {/* Colonna Acquisto con 5 decimali */}
                        <div className="text-right font-mono font-medium text-emerald-300 pr-1" title={`Costo acquisto: ${occ.purchase_price.formatIT(true, 5, 5)}`}>
                          {occ.purchase_price.formatIT(true, 5, 5)}
                        </div>
                        {/* Colonna Ricarico % */}
                        <div className="text-right font-mono font-semibold text-amber-300 pr-1" title={markupPct != null ? `Ricarico: ${markupPct.toFixed(2)}%` : "Nessun costo fornitore"}>
                          {markupPct != null ? `${markupPct.toFixed(2)}%` : "—"}
                        </div>
                        {/* Colonna Netto con 4 decimali */}
                        <div className="text-right font-mono font-bold text-sky-400 pr-1" title={`Prezzo vendita: ${salePrice.formatIT(true, 4, 4)}`}>
                          {salePrice.formatIT(true, 4, 4)}
                        </div>
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenQuantityModal(occ);
                            }}
                            className="p-1.5 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500 hover:text-white transition-colors cursor-pointer"
                            title="Scegli e inserisci questa voce"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer Modale Cronologia */}
            <footer className="border-t border-slate-800 px-5 py-3 bg-slate-900 flex items-center justify-between text-xs shrink-0">
              <span className="text-slate-400 text-xs">
                Totale occorrenze trovate: <strong>{sortedOccurrences.length}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedArticleForHistory(null)}
                  className="px-4 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors cursor-pointer"
                >
                  Annulla (Esc)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const chosen = sortedOccurrences[selectedOccurIdx];
                    if (chosen) handleOpenQuantityModal(chosen);
                  }}
                  disabled={sortedOccurrences.length === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors cursor-pointer shadow-md disabled:opacity-50"
                >
                  <span>Scegli Voce (Invio)</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* POPUP INSERIMENTO ARTICOLO: Specifica Quantità (Stile DDT Studio) */}
      {pendingInsert && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-[70] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-100">
          <div className="w-full max-w-md bg-[#0f172a] border border-blue-500/40 rounded-xl shadow-2xl p-5 text-white flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-xs uppercase tracking-wider">
                <CheckCircle2 className="h-4 w-4" />
                <span>Inserimento Articolo</span>
              </div>
              <button
                type="button"
                onClick={() => setPendingInsert(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">Articolo Selezionato:</span>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-bold text-xs text-amber-300">
                  {pendingInsert.description}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                  {pendingInsert.supplier && <span>Fornitore: <strong className="text-slate-200">{pendingInsert.supplier}</strong></span>}
                  <span>UM: <strong className="text-slate-200">{pendingInsert.unit || "NR"}</strong></span>
                  <span>Netto: <strong className="text-emerald-400">{(pendingInsert.forced_unit_price ?? pendingInsert.effective_unit_price).formatIT(true, 4, 4)}</strong></span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label htmlFor="quote-insert-qty-input" className="text-xs font-bold text-slate-200">
                Specifica Quantità:
              </label>
              <input
                id="quote-insert-qty-input"
                ref={qtyInputRef}
                type="number"
                min="0.01"
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
                className="w-28 px-3 py-1.5 text-sm font-mono font-bold text-center bg-blue-950/60 border border-blue-500 rounded-lg text-white outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPendingInsert(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmInsert}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Conferma e Inserisci (Invio)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

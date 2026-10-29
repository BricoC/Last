import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from "react";
import { Search, X, Check, ShoppingCart, CheckCircle2 } from "lucide-react";
import { ListinoGeneraleRow, ListinoClienteRow } from "@/features/price-lists/models/priceList";
import { priceListRepository } from "@/features/price-lists/services/priceListRepository";
import { getClientArticleHistory, ClientArticleHistoryRow } from "../services/ddtReadModelsRepository";
import { formatDdtViewDate } from "../services/ddtViewFormatting";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";

export interface DDTArticoliSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientName?: string;
  onSelectArticle: (article: {
    code?: string;
    description: string;
    unit?: string;
    quantity: string;
    unit_price: number;
    purchase_price?: number;
    vat_rate?: number;
  }) => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  f3FocusTrigger?: number;
  onReturnToTable?: () => void;
  onPendingInsertChange?: (isOpen: boolean) => void;
}

interface PendingArticleInsert {
  code?: string;
  description: string;
  unit?: string;
  unit_price: number;
  purchase_price?: number;
  vat_rate?: number;
}

// Cache in memoria globale del listino generale per evitare query pesanti ripetute a ogni ri-render
let cachedGeneralList: ListinoGeneraleRow[] | null = null;

export const DDTArticoliSearchModal: React.FC<DDTArticoliSearchModalProps> = React.memo(({
  isOpen,
  onClose,
  clientName,
  onSelectArticle,
  searchQuery,
  onSearchQueryChange,
  f3FocusTrigger,
  onReturnToTable,
  onPendingInsertChange,
}) => {
  const [sourceTab, setSourceTab] = useState<"generale" | "cliente">("generale");
  const [prezziIvaEnabled, setPrezziIvaEnabled] = useState(false);
  const [internalSearch, setInternalSearch] = useState("");
  const search = searchQuery !== undefined ? searchQuery : internalSearch;
  const setSearch = (val: string) => {
    setInternalSearch(val);
    onSearchQueryChange?.(val);
  };
  const deferredSearch = useDeferredValue(search);

  const containerRef = useRef<HTMLDivElement>(null);

  // Dati Listino Generale & Cliente
  const [generalItems, setGeneralItems] = useState<ListinoGeneraleRow[]>(() => cachedGeneralList || []);
  const [clientItems, setClientItems] = useState<ListinoClienteRow[]>([]);
  const [historyItems, setHistoryItems] = useState<ClientArticleHistoryRow[]>([]);

  // Navigazione tastiera & focus ('list' in alto, 'history' in basso)
  const [activePane, setActivePane] = useState<"list" | "history">("list");
  const [selectedListIdx, setSelectedListIdx] = useState(0);
  const [selectedHistIdx, setSelectedHistIdx] = useState(0);

  // Popup "INSERIMENTO ARTICOLO" con specifica quantità
  const [pendingInsert, setPendingInsert] = useState<PendingArticleInsert | null>(null);
  const [insertQuantity, setInsertQuantity] = useState("1");
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const historyContainerRef = useRef<HTMLDivElement>(null);

  // Quando viene premuto F3, sposta il focus immediatamente sulla prima voce della tabella in alto
  useEffect(() => {
    if (!isOpen || pendingInsert) return;

    // Se il listino cliente non ha risultati ma il listino generale sì, passa a Generale
    if (sourceTab === "cliente" && filteredClientItems.length === 0 && filteredGeneralItems.length > 0) {
      setSourceTab("generale");
    }

    setActivePane("list");
    setSelectedListIdx(0);
    inputRef.current?.blur();

    const doFocus = () => {
      if (listContainerRef.current) {
        listContainerRef.current.focus();
      } else if (containerRef.current) {
        containerRef.current.focus();
      }
    };

    doFocus();
    const t1 = setTimeout(doFocus, 30);
    const t2 = setTimeout(doFocus, 100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [f3FocusTrigger, isOpen, pendingInsert]);

  // Notifica lo stato di apertura/chiusura del popup quantità al genitore per bloccare shortcut F3/F4
  useEffect(() => {
    onPendingInsertChange?.(Boolean(pendingInsert));
    return () => {
      onPendingInsertChange?.(false);
    };
  }, [pendingInsert, onPendingInsertChange]);

  // Auto-scroll automatico della visuale quando si naviga tra i record con le frecce
  useEffect(() => {
    if (activePane === "list") {
      const activeEl = listContainerRef.current?.querySelector(`[data-active="true"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedListIdx, activePane]);

  useEffect(() => {
    if (activePane === "history") {
      const activeEl = historyContainerRef.current?.querySelector(`[data-active="true"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedHistIdx, activePane]);

  // Focus automatico sul popup quantità
  useEffect(() => {
    if (pendingInsert) {
      setTimeout(() => {
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
      }, 50);
    }
  }, [pendingInsert]);

  // Inizializzazione dati
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const init = async () => {
      // 1. Carica listino generale se non già in cache
      if (!cachedGeneralList) {
        setIsLoading(true);
        try {
          const genRows = await priceListRepository.searchGeneral("", 50000);
          if (active) {
            cachedGeneralList = genRows;
            setGeneralItems(genRows);
          }
        } catch (e) {
          console.error("Errore caricamento listino generale:", e);
        } finally {
          if (active) setIsLoading(false);
        }
      } else {
        setGeneralItems(cachedGeneralList);
      }

      // 2. Carica listino specifico cliente se presente
      if (clientName && clientName.trim()) {
        const cleanName = clientName.trim().replace(/^LIST_/, "");
        try {
          const cliRows = await priceListRepository.searchClientPrices("", cleanName, 5000);
          if (active) {
            setClientItems(cliRows);
            if (cliRows.length > 0) {
              setSourceTab("cliente");
            }
          }
        } catch (e) {
          console.error("Errore caricamento listino cliente:", e);
        }
      } else {
        if (active) {
          setClientItems([]);
          setSourceTab("generale");
        }
      }
    };

    void init();
    return () => {
      active = false;
    };
  }, [isOpen, clientName]);

  // Caricamento storico vendite per il cliente corrente
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    const timer = setTimeout(async () => {
      if (!clientName || !clientName.trim()) {
        if (isMounted) setHistoryItems([]);
        return;
      }

      try {
        const cleanClient = clientName.trim().replace(/^LIST_/, "");
        const hist = await getClientArticleHistory({
          clientName: cleanClient,
          description: deferredSearch,
          onlyThisClient: true,
          limit: 100,
        });
        if (isMounted) {
          setHistoryItems(hist);
          setSelectedHistIdx(0);
        }
      } catch (err) {
        console.error("Errore caricamento storico prezzi praticati cliente:", err);
      }
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [deferredSearch, clientName, isOpen]);

  // Filtraggio tokenizzato lista superiore
  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  const filteredClientItems = useMemo(() => {
    if (searchTokens.length === 0) return clientItems;
    return clientItems.filter((item) => {
      const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.cliente}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }, [clientItems, searchTokens]);

  const filteredGeneralItems = useMemo(() => {
    if (searchTokens.length === 0) return generalItems;
    return generalItems.filter((item) => {
      const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }, [generalItems, searchTokens]);

  const filteredListItems = sourceTab === "generale" ? filteredGeneralItems : filteredClientItems;
  // Limitazione a max 80 elementi nel DOM: elimina all'istante qualsiasi lag o scatto
  const visibleListItems = useMemo(() => filteredListItems.slice(0, 80), [filteredListItems]);
  const visibleHistoryItems = useMemo(() => historyItems.slice(0, 40), [historyItems]);

  // Gestione tastiera fluida tra tabella sopra e tabella sotto
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (pendingInsert) {
      if (e.key === "F3" || e.key === "F4") {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    // Se si preme di nuovo F3 dentro la ricerca, torna immediatamente alla tabella DDT
    if (e.key === "F3") {
      e.preventDefault();
      e.stopPropagation();
      onReturnToTable?.();
      return;
    }

    // Tasto TAB: passa istantaneamente da tabella listino (sopra) a storico (sotto) e viceversa
    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      if (activePane === "list") {
        setActivePane("history");
        setSelectedHistIdx(0);
        setTimeout(() => historyContainerRef.current?.focus(), 10);
      } else {
        setActivePane("list");
        setSelectedListIdx(0);
        setTimeout(() => listContainerRef.current?.focus(), 10);
      }
      return;
    }

    // Frecce Su e Giù: spostamento rigoroso di 1 solo record alla volta
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (activePane === "list") {
        setSelectedListIdx((prev) => Math.min(prev + 1, Math.max(0, visibleListItems.length - 1)));
      } else {
        setSelectedHistIdx((prev) => Math.min(prev + 1, Math.max(0, visibleHistoryItems.length - 1)));
      }
      return;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (activePane === "history") {
        setSelectedHistIdx((prev) => Math.max(prev - 1, 0));
      } else {
        setSelectedListIdx((prev) => Math.max(prev - 1, 0));
      }
      return;
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      if (activePane === "list" && visibleHistoryItems.length > 0) {
        setActivePane("history");
      } else {
        setActivePane("list");
      }
      return;
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleOpenQuantityModal();
      return;
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
  };

  // Apertura popup quantità articolo
  const handleOpenQuantityModal = () => {
    if (activePane === "list") {
      const selected = visibleListItems[selectedListIdx];
      if (!selected) return;

      if (sourceTab === "generale") {
        const item = selected as ListinoGeneraleRow;
        setPendingInsert({
          code: item.codice_articolo || undefined,
          description: item.descrizione,
          unit: item.um || "NR.",
          unit_price: prezziIvaEnabled ? (item.prezzo_fattura || 0) : 0,
          purchase_price: item.prezzo_acquisto || 0,
          vat_rate: prezziIvaEnabled && item.perc_iva ? Math.round(item.perc_iva * 100) : undefined,
        });
      } else {
        const item = selected as ListinoClienteRow;
        setPendingInsert({
          code: item.codice_articolo || undefined,
          description: item.descrizione,
          unit: "NR.",
          unit_price: prezziIvaEnabled ? (item.prezzo_fattura || 0) : 0,
          purchase_price: item.prezzo_acquisto || 0,
          vat_rate: undefined,
        });
      }
      setInsertQuantity("1");
    } else {
      const hist = visibleHistoryItems[selectedHistIdx];
      if (!hist) return;
      setPendingInsert({
        code: hist.code || undefined,
        description: hist.description,
        unit: hist.unit || "NR.",
        unit_price: prezziIvaEnabled ? hist.unitPriceSubunits / 100000 : 0,
        purchase_price: hist.purchasePriceSubunits ? hist.purchasePriceSubunits / 100000 : 0,
        vat_rate: prezziIvaEnabled && hist.vatRate ? hist.vatRate : undefined,
      });
      setInsertQuantity(hist.quantity || "1");
    }
  };

  // Conferma inserimento nel DDT
  const handleConfirmInsert = () => {
    if (!pendingInsert) return;
    onSelectArticle({
      ...pendingInsert,
      quantity: insertQuantity.trim() || "1",
    });
    setPendingInsert(null);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  };

  const formatEuro = (val: number | null | undefined, digits: number = 2) => {
    if (val == null || isNaN(val)) return "0,00 €";
    return `${val.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: digits,
    })} €`;
  };

  if (!isOpen) return null;

  const displayClientName = clientName ? clientName.trim().replace(/^LIST_/, "") : "";

  return (
    <div
      id="ddt-search-modal-container"
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="w-full h-full flex flex-col bg-[var(--card)] select-none overflow-hidden outline-none"
    >
      {/* 1. Header Pannello: Titolo Ricerca Articoli - CLIENTE + Tasti Listino e Chiusura */}
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)] shrink-0 gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="p-1 rounded bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20 shrink-0">
            <Search className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-xs text-[var(--foreground)] truncate block">
              Ricerca Articoli —{" "}
              <span className="text-[var(--primary)] font-black">
                {displayClientName ? displayClientName.toUpperCase() : "NESSUN CLIENTE"}
              </span>
            </span>
          </div>
        </div>

        {/* Pillole selezione Listino & Toggle Prezzi */}
        <div className="flex items-center space-x-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSourceTab("cliente");
              setActivePane("list");
              setSelectedListIdx(0);
            }}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center space-x-1 transition-all ${
              sourceTab === "cliente"
                ? "bg-amber-500 text-black font-bold shadow-sm"
                : "bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
            }`}
            title="Visualizza Listino Cliente"
          >
            <span>Cliente</span>
            <span className="px-1 py-0.1 rounded-full text-[9px] bg-black/20 font-bold">
              {search.trim() ? filteredClientItems.length : clientItems.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSourceTab("generale");
              setActivePane("list");
              setSelectedListIdx(0);
            }}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center space-x-1 transition-all ${
              sourceTab === "generale"
                ? "bg-[var(--primary)] text-white font-bold shadow-sm"
                : "bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
            }`}
            title="Visualizza Listino Generale"
          >
            <span>Generale</span>
            <span className="px-1 py-0.1 rounded-full text-[9px] bg-white/20 font-bold">
              {search.trim() ? filteredGeneralItems.length : generalItems.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setPrezziIvaEnabled(!prezziIvaEnabled)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
              prezziIvaEnabled
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-bold"
                : "bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)]"
            }`}
            title="Attiva o disattiva l'inserimento di Prezzo & IVA nel DDT"
          >
            €: {prezziIvaEnabled ? "ON" : "OFF"}
          </button>

          {/* Tasto Chiudi Pannello */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--border)] transition-colors ml-1"
            title="Nascondi pannello cerca articoli (F4)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Barra di Ricerca Multi-Termine */}
      <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--card)] shrink-0">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedListIdx(0);
              setSelectedHistIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                e.stopPropagation();
                setActivePane("list");
                setSelectedListIdx(0);
                containerRef.current?.focus();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActivePane("list");
                setSelectedListIdx(0);
                containerRef.current?.focus();
              } else if (e.key === "Enter") {
                e.preventDefault();
                handleOpenQuantityModal();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Cerca per descrizione, codice o parole chiave..."
            className="w-full pl-8 pr-7 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
          />
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[var(--muted-foreground)]" />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Sezione Dati Split (Tabella Listino sopra + Tabella Storico sotto a uguale altezza 50/50) */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* TABELLA 1: LISTINO GENERALE O CLIENTE (50% altezza) */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden border-b border-[var(--border)]">
          <div className="px-3 py-1 bg-[var(--background)]/80 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)] flex justify-between items-center shrink-0">
            <div className="flex items-center space-x-2">
              <span>{sourceTab === "generale" ? "Listino Generale Articoli" : `Listino Cliente (${displayClientName})`}</span>
              {activePane === "list" && (
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                  ATTIVO ↑↓
                </span>
              )}
            </div>
            <span className="font-mono text-[10px]">
              {visibleListItems.length < filteredListItems.length
                ? `Mostrati ${visibleListItems.length} di ${filteredListItems.length}`
                : `${filteredListItems.length} voci trovate`}
            </span>
          </div>

          <div
            ref={listContainerRef}
            tabIndex={0}
            className={`flex-1 overflow-y-auto overflow-x-hidden outline-none ${activePane === "list" ? "ring-1 ring-blue-500/40" : ""}`}
          >
            {isLoading ? (
              <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">
                Caricamento listini in corso...
              </div>
            ) : visibleListItems.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">
                Nessun articolo trovato {sourceTab === "cliente" ? "nel listino cliente" : "nel listino generale"}.
                {sourceTab === "cliente" && filteredGeneralItems.length > 0 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSourceTab("generale");
                        setActivePane("list");
                        setSelectedListIdx(0);
                      }}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-[var(--primary)] text-white font-bold text-xs hover:opacity-90 shadow-sm transition-all"
                    >
                      <span>Mostra {filteredGeneralItems.length} nel Listino Generale →</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[var(--card)] z-10 text-[10px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)] font-semibold">
                  <tr>
                    <th className="px-2 py-1 text-left">Descrizione</th>
                    <th className="px-2.5 py-1 text-right w-28 whitespace-nowrap">Prezzo Fattura (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11px]">
                  {visibleListItems.map((item, idx) => {
                    const isSelected = activePane === "list" && selectedListIdx === idx;
                    const priceVal =
                      sourceTab === "generale"
                        ? (item as ListinoGeneraleRow).prezzo_fattura || 0
                        : (item as ListinoClienteRow).prezzo_fattura || 0;

                    return (
                      <tr
                        key={`${item.id}_${idx}`}
                        data-active={isSelected ? "true" : undefined}
                        onClick={() => {
                          setActivePane("list");
                          setSelectedListIdx(idx);
                        }}
                        onDoubleClick={handleOpenQuantityModal}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[var(--primary)] text-white font-bold"
                            : "hover:bg-[var(--background)]/60 text-[var(--foreground)]"
                        }`}
                      >
                        <td className="px-2 py-1 font-sans truncate max-w-[280px]" title={item.descrizione}>
                          <span className="text-[var(--foreground)]">{item.descrizione}</span>
                        </td>
                        <td
                          className={`px-2.5 py-1 text-right font-bold whitespace-nowrap ${
                            isSelected ? "text-white" : "text-amber-400"
                          }`}
                        >
                          {formatEuro(priceVal, 2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* TABELLA 2: STORICO PREZZI PRATICATI AL CLIENTE (50% altezza) */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--background)]/40">
          <div className="px-3 py-1 bg-[var(--background)] text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)] flex justify-between items-center shrink-0">
            <div className="flex items-center space-x-2">
              <span className="text-emerald-400 font-bold">
                Storico Prezzi Praticati {displayClientName && `a ${displayClientName}`}
              </span>
              {activePane === "history" && (
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  ATTIVO ↑↓
                </span>
              )}
            </div>
            <span className="font-mono text-[10px]">
              {visibleHistoryItems.length < historyItems.length
                ? `Mostrati ${visibleHistoryItems.length} di ${historyItems.length}`
                : `${historyItems.length} ddt precedenti`}
            </span>
          </div>

          <div
            ref={historyContainerRef}
            tabIndex={0}
            className={`flex-1 overflow-y-auto overflow-x-hidden outline-none ${activePane === "history" ? "ring-1 ring-emerald-500/40" : ""}`}
          >
            {visibleHistoryItems.length === 0 ? (
              <div className="p-3 text-center text-xs text-[var(--muted-foreground)]">
                Nessun prezzo storico trovato nei DDT precedenti per questo cliente.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[var(--card)] z-10 text-[10px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)] font-semibold">
                  <tr>
                    <th className="px-2 py-1 text-left w-20">Data</th>
                    <th className="px-2 py-1 text-left">Descrizione</th>
                    <th className="px-2.5 py-1 text-right w-24">Prezzo (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11px]">
                  {visibleHistoryItems.map((h, idx) => {
                    const isSelected = activePane === "history" && selectedHistIdx === idx;
                    const priceVal = h.unitPriceSubunits / 100000;

                    return (
                      <tr
                        key={`${h.ddtId}_${idx}`}
                        data-active={isSelected ? "true" : undefined}
                        onClick={() => {
                          setActivePane("history");
                          setSelectedHistIdx(idx);
                        }}
                        onDoubleClick={handleOpenQuantityModal}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-emerald-600 text-white font-bold"
                            : "hover:bg-[var(--card)] text-[var(--foreground)]"
                        }`}
                      >
                        <td className="px-2 py-1 text-[var(--muted-foreground)] whitespace-nowrap text-[10.5px]">
                          {formatDdtViewDate(h.date)}
                        </td>
                        <td className="px-2 py-1 font-sans truncate max-w-[200px]" title={h.description}>
                          <span className="text-[var(--foreground)]">{h.description}</span>
                        </td>
                        <td
                          className={`px-2.5 py-1 text-right font-bold whitespace-nowrap ${
                            isSelected ? "text-white" : "text-emerald-400"
                          }`}
                        >
                          {formatEuro(priceVal, 2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* 4. Footer Pannello con Azioni Rapide */}
      <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-xs shrink-0">
        <div className="text-[10px] text-[var(--muted-foreground)] font-medium">
          <span>Invio / DblClick inserisce • Frecce ↑↓ scorrono</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            tabIndex={-1}
            onClick={onClose}
            className="px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--background)] text-[var(--foreground)] font-medium text-xs transition-colors"
          >
            Chiudi (F4/Esc)
          </button>

          <button
            type="button"
            onClick={handleOpenQuantityModal}
            className="flex items-center space-x-1.5 px-3 py-1 rounded-md bg-[var(--primary)] text-white hover:opacity-95 font-bold text-xs shadow-md transition-all"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Inserisci</span>
          </button>
        </div>
      </div>

      {/* POPUP "INSERIMENTO ARTICOLO" CON QUANTITA' */}
      {pendingInsert && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-100"
          onKeyDown={(e) => {
            if (e.key === "F3" || e.key === "F4") {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <div className="w-full max-w-lg bg-[#0f172a] border border-blue-500/40 rounded-xl shadow-2xl p-5 flex flex-col space-y-4">
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
                className="p-1 text-slate-400 hover:text-white rounded"
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
                {pendingInsert.code && (
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    Codice: {pendingInsert.code}
                  </p>
                )}
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
                  if (e.key === "F3" || e.key === "F4") {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
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
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmInsert}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-lg shadow-blue-500/20 transition-all flex items-center space-x-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Conferma e Inserisci (Invio)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

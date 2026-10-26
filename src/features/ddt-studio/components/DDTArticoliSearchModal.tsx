import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from "react";
import { Search, X, ShoppingCart, ArrowLeftRight } from "lucide-react";
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
}

export const DDTArticoliSearchModal: React.FC<DDTArticoliSearchModalProps> = ({
  isOpen,
  onClose,
  clientName,
  onSelectArticle,
}) => {
  const [sourceTab, setSourceTab] = useState<"generale" | "cliente">("generale");
  const [prezziIvaEnabled, setPrezziIvaEnabled] = useState(true);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [quantity, setQuantity] = useState("1");

  // Dati Listino Generale & Cliente
  const [generalItems, setGeneralItems] = useState<ListinoGeneraleRow[]>([]);
  const [clientItems, setClientItems] = useState<ListinoClienteRow[]>([]);
  const [historyItems, setHistoryItems] = useState<ClientArticleHistoryRow[]>([]);

  // Navigazione tastiera & focus (sinistra: 'list', destra: 'history')
  const [activePane, setActivePane] = useState<"list" | "history">("list");
  const [selectedListIdx, setSelectedListIdx] = useState(0);
  const [selectedHistIdx, setSelectedHistIdx] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inizializzazione all'apertura
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      void loadInitialData();
    }
  }, [isOpen, clientName]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      // 1. Carica articoli listino generale (o primi 2000 per fluidità estrema)
      const genRows = await priceListRepository.searchGeneral("", 3000);
      setGeneralItems(genRows);

      // 2. Se c'è un cliente, carica i suoi listini personalizzati
      if (clientName && clientName.trim()) {
        const cleanName = clientName.trim().replace(/^LIST_/, "");
        const cliRows = await priceListRepository.searchClientPrices("", cleanName, 2000);
        setClientItems(cliRows);
        if (cliRows.length > 0) {
          setSourceTab("cliente");
        } else {
          setSourceTab("generale");
        }
      } else {
        setClientItems([]);
        setSourceTab("generale");
      }
    } catch (e) {
      console.error("Errore caricamento dati modale F3:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Caricamento storico vendite per il cliente corrente in base alla ricerca o all'articolo
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
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [deferredSearch, clientName, isOpen]);

  // Filtraggio tokenizzato lista sinistra
  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  const filteredListItems = useMemo(() => {
    if (sourceTab === "generale") {
      if (searchTokens.length === 0) return generalItems;
      return generalItems.filter((item) => {
        const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""}`.toLowerCase();
        return searchTokens.every((token) => text.includes(token));
      });
    } else {
      if (searchTokens.length === 0) return clientItems;
      return clientItems.filter((item) => {
        const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.cliente}`.toLowerCase();
        return searchTokens.every((token) => text.includes(token));
      });
    }
  }, [sourceTab, generalItems, clientItems, searchTokens]);

  // Gestione tastiera per frecce su/giù e cambio colonna sinistra/destra
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (activePane === "list") {
        setSelectedListIdx((prev) => Math.min(prev + 1, Math.max(0, filteredListItems.length - 1)));
      } else {
        setSelectedHistIdx((prev) => Math.min(prev + 1, Math.max(0, historyItems.length - 1)));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (activePane === "list") {
        setSelectedListIdx((prev) => Math.max(prev - 1, 0));
      } else {
        setSelectedHistIdx((prev) => Math.max(prev - 1, 0));
      }
    } else if (e.key === "ArrowRight") {
      if (historyItems.length > 0) {
        setActivePane("history");
      }
    } else if (e.key === "ArrowLeft") {
      setActivePane("list");
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleConfirmCurrent();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Conferma inserimento dell'articolo selezionato (da sinistra o destra)
  const handleConfirmCurrent = () => {
    const qStr = quantity.trim() || "1";

    if (activePane === "list") {
      const selected = filteredListItems[selectedListIdx];
      if (!selected) return;

      if (sourceTab === "generale") {
        const item = selected as ListinoGeneraleRow;
        onSelectArticle({
          code: item.codice_articolo || undefined,
          description: item.descrizione,
          unit: item.um || "NR.",
          quantity: qStr,
          unit_price: prezziIvaEnabled ? (item.prezzo_fattura || item.prezzo_pubblico || 0) : 0,
          purchase_price: item.prezzo_acquisto || 0,
          vat_rate: prezziIvaEnabled ? Math.round((item.perc_iva || 0.22) * 100) : 22,
        });
      } else {
        const item = selected as ListinoClienteRow;
        onSelectArticle({
          code: item.codice_articolo || undefined,
          description: item.descrizione,
          unit: "NR.",
          quantity: qStr,
          unit_price: prezziIvaEnabled ? (item.prezzo_fattura || 0) : 0,
          purchase_price: item.prezzo_acquisto || 0,
          vat_rate: 22,
        });
      }
      onClose();
    } else {
      const hist = historyItems[selectedHistIdx];
      if (!hist) return;
      onSelectArticle({
        code: hist.code || undefined,
        description: hist.description,
        unit: hist.unit || "NR.",
        quantity: qStr,
        unit_price: prezziIvaEnabled ? hist.unitPriceSubunits / 100000 : 0,
        purchase_price: hist.purchasePriceSubunits ? hist.purchasePriceSubunits / 100000 : 0,
        vat_rate: hist.vatRate || 22,
      });
      onClose();
    }
  };

  const formatEuro = (val: number | null | undefined, digits: number = 4) => {
    if (val == null || isNaN(val)) return "0,0000 €";
    return `${val.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: digits,
    })} €`;
  };

  if (!isOpen) return null;

  const displayClientName = clientName ? clientName.trim().replace(/^LIST_/, "") : "";

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-3 select-none animate-in fade-in duration-100"
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-6xl bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col h-[85vh] max-h-[850px] overflow-hidden">
        {/* 1. Header Modale fedele a noManV1 */}
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-[var(--foreground)]">
                  Ricerca Articoli —{" "}
                  <span className="text-[var(--primary)] font-black">
                    {displayClientName ? displayClientName.toUpperCase() : "NESSUN CLIENTE SELEZIONATO"}
                  </span>
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Frecce ← → cambia colonna • Esc per chiudere
              </p>
            </div>
          </div>

          {/* Toggle pillole in alto a destra */}
          <div className="flex items-center space-x-2">
            {/* Pillola Listino Cliente */}
            <button
              type="button"
              onClick={() => {
                setSourceTab("cliente");
                setActivePane("list");
                setSelectedListIdx(0);
              }}
              className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center space-x-1 transition-all ${
                sourceTab === "cliente"
                  ? "bg-amber-500 text-black shadow-sm"
                  : "bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
              }`}
            >
              <span>Listino Cliente</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-bold">
                {clientItems.length}
              </span>
            </button>

            {/* Pillola Listino Generale */}
            <button
              type="button"
              onClick={() => {
                setSourceTab("generale");
                setActivePane("list");
                setSelectedListIdx(0);
              }}
              className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center space-x-1 transition-all ${
                sourceTab === "generale"
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
              }`}
            >
              <span>Listino Generale</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-bold">
                {generalItems.length}
              </span>
            </button>

            {/* Toggle Prezzi & IVA */}
            <button
              type="button"
              onClick={() => setPrezziIvaEnabled(!prezziIvaEnabled)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                prezziIvaEnabled
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-bold"
                  : "bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)]"
              }`}
              title="Abilita o disabilita il caricamento automatico di Prezzi & IVA nel DDT"
            >
              € Prezzi & IVA: {prezziIvaEnabled ? "ON" : "OFF"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] transition-colors ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Barra Ricerca & Quantità */}
        <div className="p-3 border-b border-[var(--border)] bg-[var(--card)] flex items-center space-x-3 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-2.5" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedListIdx(0);
              }}
              placeholder="CERCA IN LISTINO GENERALE O STORICO..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-bold tracking-wide uppercase"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quantità */}
          <div className="flex items-center space-x-1.5 shrink-0 bg-[var(--background)] border border-[var(--border)] px-2.5 py-1 rounded-md">
            <span className="text-xs font-bold text-[var(--muted-foreground)]">Q.TÀ:</span>
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-12 text-center text-xs font-black bg-transparent text-[var(--foreground)] outline-none"
            />
          </div>

          {/* Badge conteggi */}
          <div className="text-[11px] font-mono text-[var(--muted-foreground)] shrink-0 px-2">
            <span className="font-semibold text-[var(--primary)]">{filteredListItems.length}</span> list. {sourceTab === "generale" ? "gen" : "cli"} •{" "}
            <span className="font-semibold text-emerald-400">{historyItems.length}</span> storico
          </div>
        </div>

        {/* 3. Sezione a 2 Colonne Affiancate: Listino a Sinistra, Storico Cliente a Destra */}
        <div className="flex-1 flex overflow-hidden divide-x divide-[var(--border)]">
          {/* PANNELLO SINISTRO (50%): Articoli del Listino */}
          <div
            className={`w-1/2 flex flex-col overflow-hidden ${
              activePane === "list" ? "ring-1 ring-inset ring-[var(--primary)]/40" : ""
            }`}
            onClick={() => setActivePane("list")}
          >
            {/* Header Colonna Sinistra */}
            <div className="px-3 py-1.5 bg-[var(--background)] border-b border-[var(--border)] flex items-center justify-between text-[11px] font-bold text-[var(--muted-foreground)] uppercase">
              <span>
                DESCRIZIONE ARTICOLO ({sourceTab === "generale" ? "LISTINO GENERALE" : "LISTINO CLIENTE"})
              </span>
              <span className="w-28 text-right">PREZZO FATT. (€)</span>
            </div>

            {/* Elenco Articoli */}
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/30">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
                  Caricamento articoli in corso...
                </div>
              ) : filteredListItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
                  Nessun articolo trovato per "{search}".
                </div>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11px]">
                    {filteredListItems.slice(0, 300).map((row, idx) => {
                      const isSelected = activePane === "list" && selectedListIdx === idx;
                      const priceVal =
                        sourceTab === "generale"
                          ? (row as ListinoGeneraleRow).prezzo_fattura
                          : (row as ListinoClienteRow).prezzo_fattura;

                      return (
                        <tr
                          key={row.id}
                          onClick={() => {
                            setActivePane("list");
                            setSelectedListIdx(idx);
                          }}
                          onDoubleClick={handleConfirmCurrent}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-[var(--primary)] text-white font-bold"
                              : "hover:bg-[var(--background)] text-[var(--foreground)]"
                          }`}
                        >
                          <td className="px-3 py-1.5 font-sans truncate max-w-sm" title={row.descrizione}>
                            {row.descrizione}
                          </td>
                          <td
                            className={`px-3 py-1.5 text-right w-28 whitespace-nowrap font-bold ${
                              isSelected ? "text-white" : "text-amber-400"
                            }`}
                          >
                            {formatEuro(priceVal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* PANNELLO DESTRO (50%): Storico Prezzi Praticati al Cliente */}
          <div
            className={`w-1/2 flex flex-col overflow-hidden bg-[var(--background)]/30 ${
              activePane === "history" ? "ring-1 ring-inset ring-emerald-500/40" : ""
            }`}
            onClick={() => setActivePane("history")}
          >
            {/* Header Colonna Destra */}
            <div className="px-3 py-1.5 bg-[var(--background)] border-b border-[var(--border)] flex items-center justify-between text-[11px] font-bold text-emerald-400 uppercase">
              <div className="flex items-center space-x-1.5">
                <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  STORICO PREZZI PRATICATI A:{" "}
                  <span className="text-[var(--foreground)]">{displayClientName || "—"}</span>
                </span>
              </div>
              <span className="text-[var(--muted-foreground)] font-mono text-[10px]">
                {historyItems.length} mov.
              </span>
            </div>

            {/* Elenco Storico DDT */}
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/30">
              {!clientName || !clientName.trim() ? (
                <div className="p-12 text-center text-xs text-[var(--muted-foreground)]">
                  Seleziona un cliente nel DDT per visualizzare il suo storico prezzi praticati.
                </div>
              ) : historyItems.length === 0 ? (
                <div className="p-12 text-center text-xs text-[var(--muted-foreground)]">
                  Nessuna vendita precedente registrata per "{search || displayClientName}".
                </div>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-[var(--background)] sticky top-0 text-[10px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="px-2.5 py-1 text-left w-24">Data</th>
                      <th className="px-1.5 py-1 text-center w-12">U.M.</th>
                      <th className="px-2 py-1 text-left">Descrizione / Rif. Doc</th>
                      <th className="px-2.5 py-1 text-right w-24">Prezzo (€)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11px]">
                    {historyItems.map((h, idx) => {
                      const isSelected = activePane === "history" && selectedHistIdx === idx;
                      const priceVal = h.unitPriceSubunits / 100000;

                      return (
                        <tr
                          key={`${h.ddtId}_${idx}`}
                          onClick={() => {
                            setActivePane("history");
                            setSelectedHistIdx(idx);
                          }}
                          onDoubleClick={handleConfirmCurrent}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-emerald-600 text-white font-bold"
                              : "hover:bg-[var(--card)] text-[var(--foreground)]"
                          }`}
                        >
                          <td className="px-2.5 py-1.5 text-[var(--muted-foreground)] whitespace-nowrap">
                            {formatDdtViewDate(h.date)}
                          </td>
                          <td className="px-1.5 py-1.5 text-center text-[var(--muted-foreground)]">
                            {h.unit || "NR."}
                          </td>
                          <td className="px-2 py-1.5 font-sans truncate max-w-xs" title={h.description}>
                            <div className="truncate">{h.description}</div>
                            <div className="text-[10px] text-[var(--muted-foreground)] truncate">
                              DDT #{h.series ? `${h.series}/` : ""}{h.docNumber} ({h.year})
                            </div>
                          </td>
                          <td
                            className={`px-2.5 py-1.5 text-right font-bold whitespace-nowrap ${
                              isSelected ? "text-white" : "text-emerald-400"
                            }`}
                          >
                            {formatEuro(priceVal)}
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

        {/* 4. Footer Modale */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-xs shrink-0">
          <div className="text-[11px] text-[var(--muted-foreground)]">
            <span className="font-semibold text-[var(--foreground)]">Doppio clic o Invio inserisce</span>
            {" • "}
            <span>
              Inserimento prezzi & IVA {prezziIvaEnabled ? "abilitato" : "disabilitato"}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--background)] text-[var(--foreground)] font-medium transition-colors"
            >
              Chiudi (Esc)
            </button>

            <button
              type="button"
              onClick={handleConfirmCurrent}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-md bg-[var(--primary)] text-white hover:opacity-95 font-bold shadow-md transition-all"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Aggiungi al DDT</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

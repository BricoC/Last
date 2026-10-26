import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from "react";
import { Search, X, Check, ShoppingCart, ArrowLeftRight, CheckCircle2 } from "lucide-react";
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

interface PendingArticleInsert {
  code?: string;
  description: string;
  unit?: string;
  unit_price: number;
  purchase_price?: number;
  vat_rate?: number;
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

  // Dati Listino Generale & Cliente
  const [generalItems, setGeneralItems] = useState<ListinoGeneraleRow[]>([]);
  const [clientItems, setClientItems] = useState<ListinoClienteRow[]>([]);
  const [historyItems, setHistoryItems] = useState<ClientArticleHistoryRow[]>([]);

  // Navigazione tastiera & focus (sinistra: 'list', destra: 'history')
  const [activePane, setActivePane] = useState<"list" | "history">("list");
  const [selectedListIdx, setSelectedListIdx] = useState(0);
  const [selectedHistIdx, setSelectedHistIdx] = useState(0);

  // Popup "INSERIMENTO ARTICOLO" con specifica quantità
  const [pendingInsert, setPendingInsert] = useState<PendingArticleInsert | null>(null);
  const [insertQuantity, setInsertQuantity] = useState("1");
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listener globale ESC per chiudere senza blocchi
  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (pendingInsert) {
          setPendingInsert(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown, true);
  }, [isOpen, pendingInsert, onClose]);

  // Focus automatico sul popup quantità
  useEffect(() => {
    if (pendingInsert) {
      setTimeout(() => {
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
      }, 50);
    }
  }, [pendingInsert]);

  // Inizializzazione all'apertura
  useEffect(() => {
    if (isOpen) {
      setPendingInsert(null);
      setInsertQuantity("1");
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
      // 1. Carica TUTTI i 9.763 articoli del listino generale (senza limiti arbitrari)
      const genRows = await priceListRepository.searchGeneral("", 10000);
      setGeneralItems(genRows);

      // 2. Se c'è un cliente, carica i suoi listini dedicati (con matching robusto)
      if (clientName && clientName.trim()) {
        const cleanName = clientName.trim().replace(/^LIST_/, "");
        const cliRows = await priceListRepository.searchClientPrices("", cleanName, 10000);
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
    if (pendingInsert) return;

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
      handleOpenQuantityModal();
    }
  };

  // Apre il popup "INSERIMENTO ARTICOLO" come da screenshot 2
  const handleOpenQuantityModal = () => {
    if (activePane === "list") {
      const selected = filteredListItems[selectedListIdx];
      if (!selected) return;

      if (sourceTab === "generale") {
        const item = selected as ListinoGeneraleRow;
        setPendingInsert({
          code: item.codice_articolo || undefined,
          description: item.descrizione,
          unit: item.um || "NR.",
          unit_price: prezziIvaEnabled ? (item.prezzo_fattura || item.prezzo_pubblico || 0) : 0,
          purchase_price: item.prezzo_acquisto || 0,
          vat_rate: prezziIvaEnabled ? Math.round((item.perc_iva || 0.22) * 100) : 22,
        });
      } else {
        const item = selected as ListinoClienteRow;
        setPendingInsert({
          code: item.codice_articolo || undefined,
          description: item.descrizione,
          unit: "NR.",
          unit_price: prezziIvaEnabled ? (item.prezzo_fattura || 0) : 0,
          purchase_price: item.prezzo_acquisto || 0,
          vat_rate: 22,
        });
      }
      setInsertQuantity("1");
    } else {
      const hist = historyItems[selectedHistIdx];
      if (!hist) return;
      setPendingInsert({
        code: hist.code || undefined,
        description: hist.description,
        unit: hist.unit || "NR.",
        unit_price: prezziIvaEnabled ? hist.unitPriceSubunits / 100000 : 0,
        purchase_price: hist.purchasePriceSubunits ? hist.purchasePriceSubunits / 100000 : 0,
        vat_rate: hist.vatRate || 22,
      });
      setInsertQuantity(hist.quantity || "1");
    }
  };

  // Conferma finale inserimento articolo nel DDT
  const handleConfirmInsert = () => {
    if (!pendingInsert) return;
    onSelectArticle({
      ...pendingInsert,
      quantity: insertQuantity.trim() || "1",
    });
    setPendingInsert(null);
    // Il popup rimane aperto per inserimenti successivi: si chiude solo con Esc o X!
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
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
    <>
      {/* 
        Contenitore Modale F3: Largo esattamente quanto la tabella di lavoro (left-2 right-2),
        posizionato in alto sopra la card testata, lasciando le righe DDT sotto visibili e scrivibili!
      */}
      <div
        className="absolute top-1 left-2 right-2 z-50 pointer-events-auto select-none animate-in fade-in duration-100"
        onKeyDown={handleKeyDown}
      >
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex flex-col h-[380px] overflow-hidden">
          {/* 1. Header Modale */}
          <div className="px-4 py-2 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)] shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="p-1 rounded bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
                <Search className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-bold text-xs text-[var(--foreground)]">
                  Ricerca Articoli —{" "}
                  <span className="text-[var(--primary)] font-black">
                    {displayClientName ? displayClientName.toUpperCase() : "NESSUN CLIENTE SELEZIONATO"}
                  </span>
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)] ml-2">
                  Frecce ← → cambia colonna • Esc per chiudere
                </span>
              </div>
            </div>

            {/* Toggle pillole in alto a destra */}
            <div className="flex items-center space-x-1.5">
              {/* Pillola Listino Cliente */}
              <button
                type="button"
                onClick={() => {
                  setSourceTab("cliente");
                  setActivePane("list");
                  setSelectedListIdx(0);
                }}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition-all ${
                  sourceTab === "cliente"
                    ? "bg-amber-500 text-black shadow-sm font-bold"
                    : "bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
                }`}
              >
                <span>Listino Cliente</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-bold">
                  {clientItems.length}
                </span>
              </button>

              {/* Pillola Listino Generale (mostra 9763) */}
              <button
                type="button"
                onClick={() => {
                  setSourceTab("generale");
                  setActivePane("list");
                  setSelectedListIdx(0);
                }}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition-all ${
                  sourceTab === "generale"
                    ? "bg-[var(--primary)] text-white shadow-sm font-bold"
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
                className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                  prezziIvaEnabled
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-bold"
                    : "bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)]"
                }`}
              >
                € Prezzi & IVA: {prezziIvaEnabled ? "ON" : "OFF"}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] transition-colors ml-1"
                title="Chiudi (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2. Barra Ricerca */}
          <div className="p-2 border-b border-[var(--border)] bg-[var(--card)] flex items-center space-x-3 shrink-0">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-2" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedListIdx(0);
                }}
                placeholder={
                  sourceTab === "cliente"
                    ? "CERCA IN LISTINO CLIENTE O STORICO..."
                    : "CERCA IN LISTINO GENERALE O STORICO..."
                }
                className="w-full pl-9 pr-8 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-bold tracking-wide uppercase"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Badge conteggi */}
            <div className="text-[11px] font-mono text-[var(--muted-foreground)] shrink-0 px-2">
              <span className="font-semibold text-[var(--primary)]">{filteredListItems.length}</span> list. {sourceTab === "generale" ? "gen" : "cli"} •{" "}
              <span className="font-semibold text-emerald-400">{historyItems.length}</span> storico
            </div>
          </div>

          {/* 3. Sezione a 2 Colonne Affiancate (50% / 50%) */}
          <div className="flex-1 flex overflow-hidden divide-x divide-[var(--border)]">
            {/* PANNELLO SINISTRO (50%): Articoli del Listino */}
            <div
              className={`w-1/2 flex flex-col overflow-hidden ${
                activePane === "list" ? "ring-1 ring-inset ring-[var(--primary)]/40" : ""
              }`}
              onClick={() => setActivePane("list")}
            >
              <div className="px-3 py-1 bg-[var(--background)] border-b border-[var(--border)] flex items-center justify-between text-[10.5px] font-bold text-[var(--muted-foreground)] uppercase shrink-0">
                <span>
                  DESCRIZIONE ARTICOLO ({sourceTab === "generale" ? "LISTINO GENERALE" : `LISTINO CLIENTE: ${displayClientName}`})
                </span>
                <span className="w-24 text-right">PREZZO FATT. (€)</span>
              </div>

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
                            onDoubleClick={handleOpenQuantityModal}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-[var(--primary)] text-white font-bold"
                                : "hover:bg-[var(--background)] text-[var(--foreground)]"
                            }`}
                          >
                            <td className="px-3 py-1 font-sans truncate max-w-sm" title={row.descrizione}>
                              {row.descrizione}
                            </td>
                            <td
                              className={`px-3 py-1 text-right w-24 whitespace-nowrap font-bold ${
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
              className={`w-1/2 flex flex-col overflow-hidden bg-[var(--background)]/20 ${
                activePane === "history" ? "ring-1 ring-inset ring-emerald-500/40" : ""
              }`}
              onClick={() => setActivePane("history")}
            >
              <div className="px-3 py-1 bg-[var(--background)] border-b border-[var(--border)] flex items-center justify-between text-[10.5px] font-bold text-emerald-400 uppercase shrink-0">
                <div className="flex items-center space-x-1.5">
                  <ArrowLeftRight className="w-3 h-3 text-emerald-400" />
                  <span>
                    STORICO PREZZI PRATICATI A:{" "}
                    <span className="text-[var(--foreground)]">{displayClientName || "—"}</span>
                  </span>
                </div>
                <span className="text-[var(--muted-foreground)] font-mono text-[10px]">
                  {historyItems.length} mov.
                </span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/30">
                {!clientName || !clientName.trim() ? (
                  <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
                    Seleziona un cliente nel DDT per visualizzare il suo storico prezzi.
                  </div>
                ) : historyItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
                    Nessuna vendita precedente registrata per "{search || displayClientName}".
                  </div>
                ) : (
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-[var(--background)] sticky top-0 text-[10px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)]">
                      <tr>
                        <th className="px-2 py-1 text-left w-20">Data</th>
                        <th className="px-1.5 py-1 text-center w-10">U.M.</th>
                        <th className="px-2 py-1 text-left">Descrizione</th>
                        <th className="px-2.5 py-1 text-right w-20">Prezzo (€)</th>
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
                            <td className="px-1.5 py-1 text-center text-[var(--muted-foreground)]">
                              {h.unit || "NR."}
                            </td>
                            <td className="px-2 py-1 font-sans truncate max-w-sm" title={h.description}>
                              <span className="text-[var(--foreground)]">{h.description}</span>
                            </td>
                            <td
                              className={`px-2.5 py-1 text-right font-bold whitespace-nowrap ${
                                isSelected ? "text-white" : "text-emerald-400"
                              }`}
                            >
                              {formatEuro(priceVal, 4)}
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
          <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-xs shrink-0">
            <div className="text-[10.5px] text-[var(--muted-foreground)]">
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
                className="px-3 py-1 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--background)] text-[var(--foreground)] font-medium text-xs transition-colors"
              >
                Chiudi (Esc)
              </button>

              <button
                type="button"
                onClick={handleOpenQuantityModal}
                className="flex items-center space-x-1.5 px-3 py-1 rounded-md bg-[var(--primary)] text-white hover:opacity-95 font-bold text-xs shadow-md transition-all"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Aggiungi al DDT</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 
        POPUP DEDICATO "INSERIMENTO ARTICOLO" (Esattamente come Screenshot 2 di noManV1)
      */}
      {pendingInsert && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-100">
          <div className="w-full max-w-lg bg-[#0f172a] border border-blue-500/40 rounded-xl shadow-2xl p-5 flex flex-col space-y-4">
            {/* Header Popup Inserimento */}
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

            {/* Articolo Selezionato */}
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

            {/* Specifica Quantità */}
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

            {/* Pulsanti Azione */}
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
    </>
  );
};

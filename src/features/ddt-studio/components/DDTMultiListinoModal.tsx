import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from "react";
import {
  Search,
  X,
  RefreshCw,
  LayoutGrid,
  Columns,
  Rows,
  CheckCircle2,
  Check,
} from "lucide-react";
import { ListinoGeneraleRow, ListinoClienteRow } from "@/features/price-lists/models/priceList";
import { priceListRepository } from "@/features/price-lists/services/priceListRepository";
import { getDdtArticleViewRows, DdtArticleViewRow } from "../services/ddtReadModelsRepository";
import { DdtItem } from "../models/ddt";
import { formatDdtViewDate } from "../services/ddtViewFormatting";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";

export interface DDTMultiListinoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentClientName?: string;
  currentDdtItems: DdtItem[];
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
  quantity?: string;
  unit_price: number;
  purchase_price?: number;
  vat_rate?: number;
}

export const DDTMultiListinoModal: React.FC<DDTMultiListinoModalProps> = ({
  isOpen,
  onClose,
  currentClientName,
  currentDdtItems,
  onSelectArticle,
}) => {
  // Modalità disposizione: 'horizontal' (4 fasce orizzontali sovrapposte come Foto 3) o 'vertical' (4 colonne affiancate)
  const [layoutMode, setLayoutMode] = useState<"horizontal" | "vertical">("horizontal");

  // Ricerca globale sincronizzata su tutte le finestre
  const [globalSearch, setGlobalSearch] = useState("");
  const deferredSearch = useDeferredValue(globalSearch);

  // Toggle visibilità finestre (List. Gen, List. Clienti, Storico DDT, Articoli DDT)
  const [showGen, setShowGen] = useState(true);
  const [showCli, setShowCli] = useState(true);
  const [showHistory, setShowHistory] = useState(true);
  const [showCurrentDdt, setShowCurrentDdt] = useState(true);

  // Filtro cliente dedicato per Listini Clienti (supporta ricerca multi-parola!)
  const [clientFilter, setClientFilter] = useState<string>("");

  // Dati delle 4 finestre
  const [generalItems, setGeneralItems] = useState<ListinoGeneraleRow[]>([]);
  const [clientItems, setClientItems] = useState<ListinoClienteRow[]>([]);
  const [historyRows, setHistoryRows] = useState<DdtArticleViewRow[]>([]);

  // Filtra DDT corrente con ricerca
  const [filterCurrentWithSearch, setFilterCurrentWithSearch] = useState(false);

  // Popup quantita inserimento
  const [pendingInsert, setPendingInsert] = useState<PendingArticleInsert | null>(null);
  const [insertQuantity, setInsertQuantity] = useState("1");
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Caricamento dati iniziali
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [gen, cli, hist] = await Promise.all([
        priceListRepository.searchGeneral("", 10000),
        priceListRepository.searchClientPrices("", undefined, 20000),
        getDdtArticleViewRows(),
      ]);

      setGeneralItems(gen);
      setClientItems(cli);
      setHistoryRows(hist);

      if (currentClientName && currentClientName.trim()) {
        const clean = currentClientName.trim().replace(/^LIST_/, "");
        setClientFilter(clean);
      }
    } catch (err) {
      console.error("Errore caricamento dati Alex Multi-Listino:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setPendingInsert(null);
      setInsertQuantity("1");
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
      void loadData();
    }
  }, [isOpen]);

  // Gestione tasto ESC globale
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
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
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
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

  // Token ricerca unificata
  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  // 1. Filtraggio Finestra Listino Generale (9763)
  const filteredGeneral = useMemo(() => {
    if (searchTokens.length === 0) return generalItems;
    return generalItems.filter((item) => {
      const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }, [generalItems, searchTokens]);

  // 2. Filtraggio Finestra Listini Clienti con ricerca multi-parola sul cliente!
  const filteredClients = useMemo(() => {
    let result = clientItems;

    // Filtro multi-parola sul cliente
    if (clientFilter.trim()) {
      const clientTokens = tokenizeSearch(clientFilter);
      result = result.filter((item) => {
        // Normalizza rimuovendo punteggiatura così 'MO.VI' matcha 'mo vi' o 'movi'
        const rawCli = item.cliente.toLowerCase();
        const cleanCli = item.cliente.replace(/^LIST_/, "").toLowerCase();
        const normCli = `${rawCli} ${cleanCli} ${rawCli.replace(/[^a-z0-9]/g, " ")} ${cleanCli.replace(/[^a-z0-9]/g, " ")}`;
        return clientTokens.every((tok) => normCli.includes(tok));
      });
    }

    // Filtro globale
    if (searchTokens.length > 0) {
      result = result.filter((item) => {
        const text = `${item.cliente} ${item.descrizione} ${item.codice_articolo || ""}`.toLowerCase();
        return searchTokens.every((token) => text.includes(token));
      });
    }
    return result;
  }, [clientItems, clientFilter, searchTokens]);

  // 3. Filtraggio Finestra Storico DDT (~31k vendite)
  const filteredHistory = useMemo(() => {
    if (searchTokens.length === 0) return historyRows;
    return historyRows.filter((row) => {
      const text = `${row.description} ${row.client} ${row.docNumber || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }, [historyRows, searchTokens]);

  // 4. Filtraggio Finestra Articoli nel DDT attuale
  const nonBlankCurrentItems = useMemo(() => {
    const list = currentDdtItems.filter(
      (it) => it.description?.trim().length > 0 || (it.unit_price && it.unit_price.isPositive())
    );
    if (!filterCurrentWithSearch || searchTokens.length === 0) return list;
    return list.filter((it) => {
      const text = `${it.description} ${it.code || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }, [currentDdtItems, filterCurrentWithSearch, searchTokens]);

  const handleOpenInsert = (article: PendingArticleInsert) => {
    setPendingInsert(article);
    setInsertQuantity(article.quantity || "1");
  };

  const handleConfirmInsert = () => {
    if (!pendingInsert) return;
    onSelectArticle({
      ...pendingInsert,
      quantity: insertQuantity.trim() || "1",
    });
    setPendingInsert(null);
  };

  const formatEuro = (val: number | null | undefined, digits: number = 3) => {
    if (val == null || isNaN(val)) return "—";
    return `€ ${val.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: digits,
    })}`;
  };

  const formatPercent = (val: number | null | undefined) => {
    if (val == null) return "—";
    return `${Math.round(val * 100)}%`;
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 select-none animate-in fade-in duration-100">
        <div className="w-full h-[95vh] max-w-[99vw] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* 1. Header Globale Barra Alex */}
          <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--background)] flex items-center justify-between gap-3 shrink-0">
            {/* Titolo e Icona */}
            <div className="flex items-center space-x-2 shrink-0">
              <div className="p-1 rounded bg-purple-600/20 text-purple-400 border border-purple-500/30">
                <LayoutGrid className="w-4 h-4" />
              </div>
              <span className="font-black text-xs tracking-wider text-[var(--foreground)] uppercase">
                RICERCA MULTI-LISTINO
              </span>
              {currentClientName && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  {currentClientName.replace(/^LIST_/, "")}
                </span>
              )}
            </div>

            {/* Ricerca Unificata al centro */}
            <div className="relative flex-1 max-w-xl">
              <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-2" />
              <input
                ref={searchInputRef}
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Cerca in tutte le finestre attive..."
                className="w-full pl-9 pr-8 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-bold tracking-wide"
              />
              {globalSearch && (
                <button
                  type="button"
                  onClick={() => setGlobalSearch("")}
                  className="absolute right-2.5 top-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Pulsanti Attivazione / Disattivazione Finestre + Switch Layout */}
            <div className="flex items-center space-x-1.5 shrink-0">
              {/* Pillola List. Gen */}
              <button
                type="button"
                onClick={() => setShowGen(!showGen)}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                  showGen
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] opacity-60"
                }`}
              >
                <span>List. Gen</span>
              </button>

              {/* Pillola List. Clienti */}
              <button
                type="button"
                onClick={() => setShowCli(!showCli)}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                  showCli
                    ? "bg-amber-500 text-black shadow-sm"
                    : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] opacity-60"
                }`}
              >
                <span>List. Clienti</span>
              </button>

              {/* Pillola Storico DDT */}
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                  showHistory
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] opacity-60"
                }`}
              >
                <span>Storico DDT</span>
              </button>

              {/* Pillola Articoli nel DDT */}
              <button
                type="button"
                onClick={() => setShowCurrentDdt(!showCurrentDdt)}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                  showCurrentDdt
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] opacity-60"
                }`}
              >
                <span>Articoli DDT ({nonBlankCurrentItems.length})</span>
              </button>

              {/* Tasto Cambio Layout: Orizzontale (Fasce) vs Verticale (Colonne) */}
              <div className="flex items-center bg-[var(--card)] border border-[var(--border)] rounded-md p-0.5 ml-1">
                <button
                  type="button"
                  onClick={() => setLayoutMode("horizontal")}
                  className={`p-1 rounded transition-colors ${
                    layoutMode === "horizontal"
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                  title="Disposizione Orizzontale (4 fasce sovrapposte come noManV1)"
                >
                  <Rows className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("vertical")}
                  className={`p-1 rounded transition-colors ${
                    layoutMode === "vertical"
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                  title="Disposizione Verticale (4 colonne affiancate)"
                >
                  <Columns className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Refresh */}
              <button
                type="button"
                onClick={loadData}
                disabled={isLoading}
                className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] transition-colors"
                title="Ricarica dati"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </button>

              {/* Chiusura */}
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Chiudi modale (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 
            2. Area delle 4 Finestre
            Disposta in fasce orizzontali (se layoutMode === 'horizontal') o in colonne (se 'vertical')
          */}
          <div
            className={`flex-1 overflow-hidden bg-[var(--background)] ${
              layoutMode === "horizontal"
                ? "flex flex-col divide-y divide-[var(--border)]"
                : "flex divide-x divide-[var(--border)]"
            }`}
          >
            {/* FINESTRA 1: Listino Generale (Blu) */}
            {showGen && (
              <div
                className={`flex flex-col overflow-hidden bg-[var(--card)] ${
                  layoutMode === "horizontal" ? "flex-1 min-h-[140px]" : "flex-1 min-w-[280px]"
                }`}
              >
                <div className="px-3 py-1 bg-blue-950/40 border-b border-blue-500/30 flex items-center justify-between text-xs text-blue-300 shrink-0">
                  <span className="font-bold flex items-center space-x-1">
                    <span>Listino Generale</span>
                    <span className="text-[10px] opacity-80">({filteredGeneral.length} voci)</span>
                  </span>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse text-xs whitespace-nowrap">
                    <thead className="bg-[var(--background)] sticky top-0 text-[11.5px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)] font-bold">
                      <tr>
                        <th className="px-2.5 py-1.5 text-left w-20">Fornit</th>
                        <th className="px-2.5 py-1.5 text-left w-24">Art</th>
                        <th className="px-2 py-1.5 text-center w-16">Data</th>
                        <th className="px-3 py-1.5 text-left">Descrizione</th>
                        <th className="px-2 py-1.5 text-center w-12">UM</th>
                        <th className="px-2.5 py-1.5 text-right w-16">% Pub</th>
                        <th className="px-3 py-1.5 text-right w-24">Pubblico</th>
                        <th className="px-2.5 py-1.5 text-right w-16">% Prof</th>
                        <th className="px-3 py-1.5 text-right w-24">Profess</th>
                        <th className="px-2.5 py-1.5 text-right w-16">% Fatt</th>
                        <th className="px-3 py-1.5 text-right w-24 bg-blue-500/10 text-amber-300 font-bold">Fattura</th>
                        <th className="px-3 py-1.5 text-right w-24">Acquisto</th>
                        <th className="px-2 py-1.5 text-center w-12">IVA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]/30 font-mono text-xs">
                      {filteredGeneral.slice(0, 200).map((item) => (
                        <tr
                          key={item.id}
                          onDoubleClick={() => {
                            handleOpenInsert({
                              code: item.codice_articolo || undefined,
                              description: item.descrizione,
                              unit: item.um || "NR.",
                              unit_price: item.prezzo_fattura || item.prezzo_pubblico || 0,
                              purchase_price: item.prezzo_acquisto || 0,
                              vat_rate: Math.round((item.perc_iva || 0.22) * 100),
                            });
                          }}
                          className="hover:bg-blue-600/15 cursor-pointer transition-colors group"
                          title="Doppio clic per inserire nel DDT"
                        >
                          <td className="px-2.5 py-1.5 text-[var(--muted-foreground)] truncate max-w-[75px]">{item.fornitore || "—"}</td>
                          <td className="px-2.5 py-1.5 font-bold text-blue-400 truncate max-w-[90px]">{item.codice_articolo || "—"}</td>
                          <td className="px-2 py-1.5 text-center text-[var(--muted-foreground)] text-[11px]">{item.data_ref || "—"}</td>
                          <td className="px-3 py-1.5 font-sans text-[var(--foreground)] truncate max-w-[320px] text-[12.5px] font-medium" title={item.descrizione}>{item.descrizione}</td>
                          <td className="px-2 py-1.5 text-center text-[var(--muted-foreground)]">{item.um || "NR"}</td>
                          <td className="px-2.5 py-1.5 text-right text-[var(--muted-foreground)]">{formatPercent(item.perc_pub)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatEuro(item.prezzo_pubblico, 2)}</td>
                          <td className="px-2.5 py-1.5 text-right text-[var(--muted-foreground)]">{formatPercent(item.perc_prof)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatEuro(item.prezzo_profess, 2)}</td>
                          <td className="px-2.5 py-1.5 text-right text-[var(--muted-foreground)]">{formatPercent(item.perc_fatt)}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-amber-300 bg-blue-500/10">{formatEuro(item.prezzo_fattura, 2)}</td>
                          <td className="px-3 py-1.5 text-right text-[var(--muted-foreground)]">{formatEuro(item.prezzo_acquisto, 2)}</td>
                          <td className="px-2 py-1.5 text-center text-[var(--muted-foreground)]">{formatPercent(item.perc_iva)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* FINESTRA 2: Listino Clienti (Giallo/Ambra) */}
            {showCli && (
              <div
                className={`flex flex-col overflow-hidden bg-[var(--card)] ${
                  layoutMode === "horizontal" ? "flex-1 min-h-[140px]" : "flex-1 min-w-[280px]"
                }`}
              >
                <div className="px-3 py-1.5 bg-amber-950/40 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-300 shrink-0 gap-2">
                  <span className="font-bold whitespace-nowrap flex items-center space-x-1.5">
                    <span className="text-sm">Listino Clienti</span>
                    <span className="text-[11px] opacity-80 font-normal">({filteredClients.length} voci)</span>
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs text-[var(--muted-foreground)] font-semibold">Filtro:</span>
                    <div className="relative">
                      <input
                        type="text"
                        value={clientFilter}
                        onChange={(e) => setClientFilter(e.target.value)}
                        placeholder="Cerca cliente (multi-parola)..."
                        className="pl-2.5 pr-6 py-0.5 text-xs bg-[var(--background)] border border-amber-500/40 rounded text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none w-52 font-medium"
                      />
                      {clientFilter && (
                        <button
                          type="button"
                          onClick={() => setClientFilter("")}
                          className="absolute right-1.5 top-1 text-[var(--muted-foreground)] hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse text-xs whitespace-nowrap">
                    <thead className="bg-[var(--background)] sticky top-0 text-[11.5px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)] font-bold">
                      <tr>
                        <th className="px-3 py-1.5 text-left w-40">Cliente</th>
                        <th className="px-3 py-1.5 text-left">Descrizione</th>
                        <th className="px-3 py-1.5 text-right w-24">Fattura</th>
                        <th className="px-3 py-1.5 text-right w-24">Acquisto</th>
                        <th className="px-2.5 py-1.5 text-right w-20">Ricarico</th>
                        <th className="px-3 py-1.5 text-left w-28">Note</th>
                        <th className="px-3 py-1.5 text-left w-24">Note1</th>
                        <th className="px-3 py-1.5 text-left w-24">Note2</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]/30 font-mono text-xs">
                      {filteredClients.slice(0, 200).map((item) => (
                        <tr
                          key={item.id}
                          onDoubleClick={() => {
                            handleOpenInsert({
                              code: item.codice_articolo || undefined,
                              description: item.descrizione,
                              unit: "NR.",
                              unit_price: item.prezzo_fattura || 0,
                              purchase_price: item.prezzo_acquisto || 0,
                              vat_rate: 22,
                            });
                          }}
                          className="hover:bg-amber-500/15 cursor-pointer transition-colors group"
                          title="Doppio clic per inserire nel DDT"
                        >
                          <td className="px-3 py-1.5 font-bold text-amber-400 truncate max-w-[140px]" title={item.cliente}>{item.cliente}</td>
                          <td className="px-3 py-1.5 font-sans text-[var(--foreground)] truncate max-w-[340px] text-[12.5px] font-medium" title={item.descrizione}>{item.descrizione}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-[var(--foreground)]">{formatEuro(item.prezzo_fattura, 2)}</td>
                          <td className="px-3 py-1.5 text-right text-[var(--muted-foreground)]">{formatEuro(item.prezzo_acquisto, 2)}</td>
                          <td className="px-2.5 py-1.5 text-right text-[var(--muted-foreground)]">{item.ricarico ? `${item.ricarico.toFixed(1)}%` : "—"}</td>
                          <td className="px-3 py-1.5 font-sans text-xs text-[var(--muted-foreground)] truncate max-w-[120px]">{item.note || ""}</td>
                          <td className="px-3 py-1.5 font-sans text-xs text-[var(--muted-foreground)] truncate max-w-[100px]">{item.note1 || ""}</td>
                          <td className="px-3 py-1.5 font-sans text-xs text-[var(--muted-foreground)] truncate max-w-[100px]">{item.note2 || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* FINESTRA 3: Storico Articoli Già Dati (Smeraldo) */}
            {showHistory && (
              <div
                className={`flex flex-col overflow-hidden bg-[var(--card)] ${
                  layoutMode === "horizontal" ? "flex-1 min-h-[140px]" : "flex-1 min-w-[280px]"
                }`}
              >
                <div className="px-3 py-1.5 bg-emerald-950/40 border-b border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300 shrink-0">
                  <span className="font-bold flex items-center space-x-1.5">
                    <span className="text-sm">Storico Articoli Già Dati</span>
                    <span className="text-[11px] opacity-80 font-normal">({filteredHistory.length} vendite)</span>
                  </span>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse text-xs whitespace-nowrap">
                    <thead className="bg-[var(--background)] sticky top-0 text-[11.5px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)] font-bold">
                      <tr>
                        <th className="px-2.5 py-1.5 text-left w-24">Data</th>
                        <th className="px-2.5 py-1.5 text-center w-16">Nr. DDT</th>
                        <th className="px-3 py-1.5 text-left w-36">Cliente</th>
                        <th className="px-3 py-1.5 text-left">Descrizione</th>
                        <th className="px-3 py-1.5 text-right w-28">Prezzo Vendita</th>
                        <th className="px-3 py-1.5 text-right w-24">Prezzo Acq.</th>
                        <th className="px-3 py-1.5 text-right w-24">% Ricarico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]/30 font-mono text-xs">
                      {filteredHistory.slice(0, 200).map((row) => {
                        const priceVal = row.unitPriceSubunits / 100000;
                        const acqVal = (row.purchasePriceSubunits || 0) / 100000;
                        const ricaricoPct = acqVal > 0 ? ((priceVal - acqVal) / acqVal) * 100 : null;

                        return (
                          <tr
                            key={row.id}
                            onDoubleClick={() => {
                              handleOpenInsert({
                                description: row.description,
                                unit: row.unit || "NR.",
                                quantity: "1",
                                unit_price: priceVal,
                                purchase_price: acqVal,
                                vat_rate: row.vatRate || 22,
                              });
                            }}
                            className="hover:bg-emerald-600/15 cursor-pointer transition-colors group"
                            title="Doppio clic per inserire nel DDT"
                          >
                            <td className="px-2.5 py-1.5 text-[var(--muted-foreground)] text-xs">{formatDdtViewDate(row.date)}</td>
                            <td className="px-2.5 py-1.5 text-center font-bold text-emerald-400 text-xs">{row.series ? `${row.series}/` : ""}{row.docNumber}</td>
                            <td className="px-3 py-1.5 font-bold text-[var(--foreground)] truncate max-w-[130px] text-xs" title={row.client}>{row.client}</td>
                            <td className="px-3 py-1.5 font-sans text-[var(--foreground)] truncate max-w-[340px] text-[12.5px] font-medium" title={row.description}>{row.description}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-emerald-400 text-xs">{formatEuro(priceVal, 4)}</td>
                            <td className="px-3 py-1.5 text-right text-[var(--muted-foreground)] text-xs">{formatEuro(acqVal, 4)}</td>
                            <td className={`px-3 py-1.5 text-right font-bold text-xs ${ricaricoPct !== null && ricaricoPct >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                              {ricaricoPct !== null ? `${ricaricoPct >= 0 ? "+" : ""}${Math.round(ricaricoPct)}%` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* FINESTRA 4: Articoli nel DDT attuale (Viola) */}
            {showCurrentDdt && (
              <div
                className={`flex flex-col overflow-hidden bg-[var(--card)] ${
                  layoutMode === "horizontal" ? "flex-1 min-h-[140px]" : "flex-1 min-w-[280px]"
                }`}
              >
                <div className="px-3 py-1.5 bg-purple-950/40 border-b border-purple-500/30 flex items-center justify-between text-xs text-purple-300 shrink-0">
                  <span className="font-bold flex items-center space-x-1.5">
                    <span className="text-sm">Articoli nel DDT</span>
                    <span className="text-[11px] opacity-80 font-normal">({nonBlankCurrentItems.length} righe)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilterCurrentWithSearch(!filterCurrentWithSearch)}
                    className={`px-2.5 py-1 rounded text-xs font-bold border transition-colors ${
                      filterCurrentWithSearch
                        ? "bg-purple-600 text-white border-purple-400"
                        : "bg-purple-900/30 text-purple-300 border-purple-500/30 hover:bg-purple-800/40"
                    }`}
                  >
                    Filtra con ricerca: {filterCurrentWithSearch ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse text-xs whitespace-nowrap">
                    <thead className="bg-[var(--background)] sticky top-0 text-[11.5px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)] font-bold">
                      <tr>
                        <th className="px-2.5 py-1.5 text-center w-10">#</th>
                        <th className="px-2.5 py-1.5 text-center w-12">U.M.</th>
                        <th className="px-2.5 py-1.5 text-center w-14">Q.tà</th>
                        <th className="px-3 py-1.5 text-left">Descrizione Articolo *</th>
                        <th className="px-3 py-1.5 text-right w-24">Prezzo €</th>
                        <th className="px-2 py-1.5 text-right w-16">Sc.%</th>
                        <th className="px-3 py-1.5 text-right w-24">Importo €</th>
                        <th className="px-2 py-1.5 text-center w-14">IVA</th>
                        <th className="px-3 py-1.5 text-right w-24">Acq €</th>
                        <th className="px-3 py-1.5 text-right w-20">Ric.%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]/30 font-mono text-xs">
                      {nonBlankCurrentItems.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-6 text-center text-xs text-[var(--muted-foreground)]">
                            Nessun articolo inserito finora nel DDT.
                          </td>
                        </tr>
                      ) : (
                        nonBlankCurrentItems.map((item, idx) => {
                          const unitPrice = item.unit_price ? item.unit_price.toNumber() : 0;
                          const netAmount = item.net_amount ? item.net_amount.toNumber() : 0;
                          const purchasePrice = item.purchase_price ? item.purchase_price.toNumber() : 0;
                          const ricPct = purchasePrice > 0 ? ((unitPrice - purchasePrice) / purchasePrice) * 100 : null;

                          return (
                            <tr key={item.id} className="hover:bg-purple-600/15 cursor-default transition-colors">
                              <td className="px-2.5 py-1.5 text-center font-bold text-purple-400">{idx + 1}</td>
                              <td className="px-2.5 py-1.5 text-center text-[var(--muted-foreground)]">{item.unit || "NR"}</td>
                              <td className="px-2.5 py-1.5 text-center font-bold text-[var(--foreground)]">{item.quantity}</td>
                              <td className="px-3 py-1.5 font-sans text-[var(--foreground)] truncate max-w-[340px] text-[12.5px] font-medium" title={item.description}>
                                {item.description}
                              </td>
                              <td className="px-3 py-1.5 text-right font-medium text-[var(--foreground)]">
                                {formatEuro(unitPrice, 4)}
                              </td>
                              <td className="px-2 py-1.5 text-right text-[var(--muted-foreground)]">
                                {item.discount_pct && parseFloat(item.discount_pct) > 0 ? `${item.discount_pct}%` : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-bold text-purple-300">
                                {formatEuro(netAmount, 4)}
                              </td>
                              <td className="px-2 py-1.5 text-center text-[var(--muted-foreground)]">
                                {item.vat_rate !== null && item.vat_rate !== undefined && String(item.vat_rate) !== "" ? `${item.vat_rate}%` : "22%"}
                              </td>
                              <td className="px-3 py-1.5 text-right text-emerald-400 font-medium">
                                {purchasePrice > 0 ? formatEuro(purchasePrice, 4) : "—"}
                              </td>
                              <td className={`px-3 py-1.5 text-right font-bold ${ricPct !== null && ricPct >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                                {ricPct !== null ? `${ricPct >= 0 ? "+" : ""}${ricPct.toFixed(1)}%` : "—"}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* 3. Footer Modale Alex */}
          <div className="px-4 py-1.5 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-xs text-[var(--muted-foreground)] shrink-0">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-[var(--foreground)]">
                Doppio clic su qualsiasi articolo di qualsiasi finestra per inserirlo all'istante nel DDT!
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--background)] text-[var(--foreground)] font-bold text-xs transition-colors"
            >
              Chiudi (Esc)
            </button>
          </div>
        </div>
      </div>

      {/* Popup Quantità anche per Alex */}
      {pendingInsert && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-100">
          <div className="w-full max-w-lg bg-[#0f172a] border border-purple-500/40 rounded-xl shadow-2xl p-5 flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-purple-500/30 pb-2.5">
              <div className="flex items-center space-x-2 text-purple-400">
                <CheckCircle2 className="w-5 h-5 text-purple-400" />
                <span className="font-black text-sm tracking-wide text-white uppercase">
                  INSERIMENTO ARTICOLO NEL DDT
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
              <div className="mt-1 p-3 rounded-lg bg-[#1e293b] border border-purple-500/30">
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
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleConfirmInsert();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setPendingInsert(null);
                  }
                }}
                className="w-28 px-3 py-1.5 text-center text-sm font-black bg-[#1e293b] border border-purple-500 rounded-lg text-white outline-none focus:ring-2 focus:ring-purple-400"
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
                className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-black text-xs shadow-lg shadow-purple-500/20 transition-all flex items-center space-x-1.5"
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

import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from "react";
import {
  Search,
  X,
  RefreshCw,
  LayoutGrid,
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

export const DDTMultiListinoModal: React.FC<DDTMultiListinoModalProps> = ({
  isOpen,
  onClose,
  currentClientName,
  currentDdtItems,
  onSelectArticle,
}) => {
  // Ricerca globale sincronizzata su tutte le finestre
  const [globalSearch, setGlobalSearch] = useState("");
  const deferredSearch = useDeferredValue(globalSearch);

  // Toggle visibilità finestre (List. Gen, List. Clienti, Storico DDT, Articoli DDT)
  const [showGen, setShowGen] = useState(true);
  const [showCli, setShowCli] = useState(true);
  const [showHistory, setShowHistory] = useState(true);
  const [showCurrentDdt, setShowCurrentDdt] = useState(true);

  // Filtro cliente dedicato per Listini Clienti
  const [clientFilter, setClientFilter] = useState<string>("");
  const [distinctClients, setDistinctClients] = useState<string[]>([]);

  // Dati delle 4 finestre
  const [generalItems, setGeneralItems] = useState<ListinoGeneraleRow[]>([]);
  const [clientItems, setClientItems] = useState<ListinoClienteRow[]>([]);
  const [historyRows, setHistoryRows] = useState<DdtArticleViewRow[]>([]);

  // Filtra DDT corrente con ricerca
  const [filterCurrentWithSearch, setFilterCurrentWithSearch] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Caricamento dati iniziali
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [gen, cli, hist, clients] = await Promise.all([
        priceListRepository.searchGeneral("", 5000),
        priceListRepository.searchClientPrices("", undefined, 10000),
        getDdtArticleViewRows(),
        priceListRepository.getDistinctClients(),
      ]);

      setGeneralItems(gen);
      setClientItems(cli);
      setHistoryRows(hist);
      setDistinctClients(clients);

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
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
      void loadData();
    }
  }, [isOpen]);

  // Gestione tasto ESC
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

  // Token ricerca unificata
  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  // 1. Filtraggio Finestra Listino Generale
  const filteredGeneral = useMemo(() => {
    if (searchTokens.length === 0) return generalItems;
    return generalItems.filter((item) => {
      const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }, [generalItems, searchTokens]);

  // 2. Filtraggio Finestra Listini Clienti
  const filteredClients = useMemo(() => {
    let result = clientItems;
    if (clientFilter.trim()) {
      const cLower = clientFilter.toLowerCase();
      result = result.filter((item) => item.cliente.toLowerCase().includes(cLower));
    }
    if (searchTokens.length > 0) {
      result = result.filter((item) => {
        const text = `${item.cliente} ${item.descrizione} ${item.codice_articolo || ""}`.toLowerCase();
        return searchTokens.every((token) => text.includes(token));
      });
    }
    return result;
  }, [clientItems, clientFilter, searchTokens]);

  // 3. Filtraggio Finestra Storico DDT (31k vendite)
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

  const formatEuro = (val: number | null | undefined, digits: number = 3) => {
    if (val == null || isNaN(val)) return "—";
    return `€ ${val.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: digits,
    })}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 select-none animate-in fade-in duration-100">
      <div className="w-full h-[92vh] max-w-[98vw] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* 1. Header Globale Barra Alex fedele allo screenshot */}
        <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--background)] flex items-center justify-between gap-3 shrink-0">
          {/* Titolo e Icona */}
          <div className="flex items-center space-x-2 shrink-0">
            <div className="p-1 rounded bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <LayoutGrid className="w-4 h-4" />
            </div>
            <span className="font-black text-xs tracking-wider text-[var(--foreground)] uppercase">
              RICERCA MULTI-LISTINO
            </span>
          </div>

          {/* Ricerca Unificata al centro */}
          <div className="relative flex-1 max-w-2xl">
            <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-2.5" />
            <input
              ref={searchInputRef}
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Cerca in tutte le finestre attive..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-[var(--card)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-bold tracking-wide"
            />
            {globalSearch && (
              <button
                type="button"
                onClick={() => setGlobalSearch("")}
                className="absolute right-2.5 top-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Pulsanti Attivazione / Disattivazione Finestre */}
          <div className="flex items-center space-x-1.5 shrink-0">
            {/* Pillola List. Gen (Blu) */}
            <button
              type="button"
              onClick={() => setShowGen(!showGen)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center space-x-1 ${
                showGen
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] opacity-60"
              }`}
            >
              <span>List. Gen</span>
            </button>

            {/* Pillola List. Clienti (Giallo/Ambra) */}
            <button
              type="button"
              onClick={() => setShowCli(!showCli)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center space-x-1 ${
                showCli
                  ? "bg-amber-500 text-black shadow-sm"
                  : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] opacity-60"
              }`}
            >
              <span>List. Clienti</span>
            </button>

            {/* Pillola Storico DDT (Smeraldo) */}
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center space-x-1 ${
                showHistory
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] opacity-60"
              }`}
            >
              <span>Storico DDT</span>
            </button>

            {/* Pillola Articoli nel DDT (Viola) */}
            <button
              type="button"
              onClick={() => setShowCurrentDdt(!showCurrentDdt)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center space-x-1 ${
                showCurrentDdt
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] opacity-60"
              }`}
            >
              <span>Articoli DDT ({nonBlankCurrentItems.length})</span>
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] transition-colors ml-1"
              title="Ricarica dati"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>

            {/* Chiusura */}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 transition-colors ml-1"
              title="Chiudi modale (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Area 4 Finestre Sincronizzate Affiancate */}
        <div className="flex-1 flex overflow-hidden divide-x divide-[var(--border)] bg-[var(--background)]">
          {/* FINESTRA 1: Listino Generale (Blu) */}
          {showGen && (
            <div className="flex-1 flex flex-col min-w-[280px] overflow-hidden bg-[var(--card)]">
              {/* Header Finestra */}
              <div className="px-3 py-1.5 bg-blue-950/40 border-b border-blue-500/30 flex items-center justify-between text-xs text-blue-300 shrink-0">
                <span className="font-bold flex items-center space-x-1">
                  <span>Listino Generale</span>
                  <span className="text-[10px] opacity-80">({filteredGeneral.length} voci)</span>
                </span>
              </div>

              {/* Tabella Listino Generale */}
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-[var(--background)] sticky top-0 text-[10px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="px-2 py-1.5 text-left w-16">Fornit</th>
                      <th className="px-2 py-1.5 text-left w-20">Art</th>
                      <th className="px-2 py-1.5 text-center w-14">Data</th>
                      <th className="px-3 py-1.5 text-left">Descrizione</th>
                      <th className="px-2.5 py-1.5 text-right w-20">Fattura</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11px]">
                    {filteredGeneral.slice(0, 200).map((item) => (
                      <tr
                        key={item.id}
                        onDoubleClick={() => {
                          onSelectArticle({
                            code: item.codice_articolo || undefined,
                            description: item.descrizione,
                            unit: item.um || "NR.",
                            quantity: "1",
                            unit_price: item.prezzo_fattura || item.prezzo_pubblico || 0,
                            purchase_price: item.prezzo_acquisto || 0,
                            vat_rate: Math.round((item.perc_iva || 0.22) * 100),
                          });
                        }}
                        className="hover:bg-blue-600/15 cursor-pointer transition-colors group"
                        title="Doppio clic per inserire nel DDT"
                      >
                        <td className="px-2 py-1 text-[var(--muted-foreground)] truncate max-w-[65px]">
                          {item.fornitore || "—"}
                        </td>
                        <td className="px-2 py-1 font-bold text-blue-400 truncate max-w-[80px]">
                          {item.codice_articolo || "—"}
                        </td>
                        <td className="px-2 py-1 text-center text-[var(--muted-foreground)] text-[10px]">
                          {item.data_ref || "—"}
                        </td>
                        <td className="px-3 py-1 font-sans text-[var(--foreground)] truncate max-w-[200px]" title={item.descrizione}>
                          {item.descrizione}
                        </td>
                        <td className="px-2.5 py-1 text-right font-bold text-amber-300">
                          {formatEuro(item.prezzo_fattura, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* FINESTRA 2: Listino Clienti (Giallo/Ambra) */}
          {showCli && (
            <div className="flex-1 flex flex-col min-w-[280px] overflow-hidden bg-[var(--card)]">
              {/* Header Finestra con input Cerca cliente */}
              <div className="px-3 py-1.5 bg-amber-950/40 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-300 shrink-0 gap-2">
                <span className="font-bold whitespace-nowrap">
                  Listino Clienti <span className="text-[10px] opacity-80">({filteredClients.length})</span>
                </span>
                <input
                  type="text"
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  placeholder="Cerca cliente..."
                  list="alex-clients-list"
                  className="px-2 py-0.5 text-[11px] bg-[var(--background)] border border-amber-500/40 rounded text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none max-w-[130px]"
                />
                <datalist id="alex-clients-list">
                  {distinctClients.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              {/* Tabella Listino Clienti */}
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-[var(--background)] sticky top-0 text-[10px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="px-2 py-1.5 text-left w-24">Cliente</th>
                      <th className="px-3 py-1.5 text-left">Descrizione</th>
                      <th className="px-2.5 py-1.5 text-right w-20">Vendita</th>
                      <th className="px-2 py-1.5 text-right w-16">Acquisto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11px]">
                    {filteredClients.slice(0, 200).map((item) => (
                      <tr
                        key={item.id}
                        onDoubleClick={() => {
                          onSelectArticle({
                            code: item.codice_articolo || undefined,
                            description: item.descrizione,
                            unit: "NR.",
                            quantity: "1",
                            unit_price: item.prezzo_fattura || 0,
                            purchase_price: item.prezzo_acquisto || 0,
                            vat_rate: 22,
                          });
                        }}
                        className="hover:bg-amber-500/15 cursor-pointer transition-colors group"
                        title="Doppio clic per inserire nel DDT"
                      >
                        <td className="px-2 py-1 font-bold text-amber-400 truncate max-w-[90px]" title={item.cliente}>
                          {item.cliente}
                        </td>
                        <td className="px-3 py-1 font-sans text-[var(--foreground)] truncate max-w-[200px]" title={item.descrizione}>
                          {item.descrizione}
                        </td>
                        <td className="px-2.5 py-1 text-right font-bold text-[var(--foreground)]">
                          {formatEuro(item.prezzo_fattura, 2)}
                        </td>
                        <td className="px-2 py-1 text-right text-[var(--muted-foreground)]">
                          {formatEuro(item.prezzo_acquisto, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* FINESTRA 3: Storico Articoli Già Dati (Smeraldo) */}
          {showHistory && (
            <div className="flex-1 flex flex-col min-w-[280px] overflow-hidden bg-[var(--card)]">
              {/* Header Finestra */}
              <div className="px-3 py-1.5 bg-emerald-950/40 border-b border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300 shrink-0">
                <span className="font-bold flex items-center space-x-1">
                  <span>Storico Articoli Già Dati</span>
                  <span className="text-[10px] opacity-80">({filteredHistory.length} vendite)</span>
                </span>
              </div>

              {/* Tabella Storico Vendite DDT */}
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-[var(--background)] sticky top-0 text-[10px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="px-2 py-1.5 text-left w-20">Data</th>
                      <th className="px-2 py-1.5 text-center w-14">Nr. DDT</th>
                      <th className="px-3 py-1.5 text-left">Descrizione</th>
                      <th className="px-2.5 py-1.5 text-right w-20">Prezzo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11px]">
                    {filteredHistory.slice(0, 200).map((row) => {
                      const priceVal = row.unitPriceSubunits / 100000;
                      return (
                        <tr
                          key={row.id}
                          onDoubleClick={() => {
                            onSelectArticle({
                              description: row.description,
                              unit: row.unit || "NR.",
                              quantity: "1",
                              unit_price: priceVal,
                              vat_rate: row.vatRate || 22,
                            });
                          }}
                          className="hover:bg-emerald-600/15 cursor-pointer transition-colors group"
                          title="Doppio clic per inserire nel DDT"
                        >
                          <td className="px-2 py-1 text-[var(--muted-foreground)] text-[10px]">
                            {formatDdtViewDate(row.date)}
                          </td>
                          <td className="px-2 py-1 text-center font-bold text-emerald-400">
                            {row.series ? `${row.series}/` : ""}{row.docNumber}
                          </td>
                          <td className="px-3 py-1 font-sans text-[var(--foreground)] truncate max-w-[200px]" title={row.description}>
                            <div>{row.description}</div>
                            <div className="text-[9.5px] text-[var(--muted-foreground)] truncate">{row.client}</div>
                          </td>
                          <td className="px-2.5 py-1 text-right font-bold text-emerald-400">
                            {formatEuro(priceVal, 2)}
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
            <div className="flex-1 flex flex-col min-w-[260px] overflow-hidden bg-[var(--card)]">
              {/* Header Finestra con toggle Filtra con ricerca */}
              <div className="px-3 py-1.5 bg-purple-950/40 border-b border-purple-500/30 flex items-center justify-between text-xs text-purple-300 shrink-0">
                <span className="font-bold flex items-center space-x-1">
                  <span>Articoli nel DDT</span>
                  <span className="text-[10px] opacity-80">({nonBlankCurrentItems.length} righe)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setFilterCurrentWithSearch(!filterCurrentWithSearch)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                    filterCurrentWithSearch
                      ? "bg-purple-600 text-white border-purple-400"
                      : "bg-purple-900/30 text-purple-300 border-purple-500/30 hover:bg-purple-800/40"
                  }`}
                >
                  Filtra con ricerca: {filterCurrentWithSearch ? "ON" : "OFF"}
                </button>
              </div>

              {/* Tabella Articoli Correnti nel DDT */}
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-[var(--background)] sticky top-0 text-[10px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="px-2 py-1.5 text-center w-8">#</th>
                      <th className="px-2 py-1.5 text-center w-10">U.M.</th>
                      <th className="px-2 py-1.5 text-center w-12">Q.tà</th>
                      <th className="px-3 py-1.5 text-left">Descrizione</th>
                      <th className="px-2.5 py-1.5 text-right w-20">Prezzo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11px]">
                    {nonBlankCurrentItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-xs text-[var(--muted-foreground)]">
                          Nessun articolo inserito finora nel DDT.
                        </td>
                      </tr>
                    ) : (
                      nonBlankCurrentItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-purple-600/15 cursor-default transition-colors">
                          <td className="px-2 py-1 text-center font-bold text-purple-400">{idx + 1}</td>
                          <td className="px-2 py-1 text-center text-[var(--muted-foreground)]">{item.unit || "NR"}</td>
                          <td className="px-2 py-1 text-center font-bold text-[var(--foreground)]">{item.quantity}</td>
                          <td className="px-3 py-1 font-sans text-[var(--foreground)] truncate max-w-[200px]" title={item.description}>
                            {item.description}
                          </td>
                          <td className="px-2.5 py-1 text-right font-medium text-[var(--foreground)]">
                            {formatEuro(item.unit_price ? item.unit_price.toNumber() : 0, 2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 3. Footer Modale Alex */}
        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-xs text-[var(--muted-foreground)] shrink-0">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-[var(--foreground)]">
              Doppio clic su qualsiasi articolo di qualsiasi finestra per inserirlo all'istante nel DDT!
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--background)] text-[var(--foreground)] font-bold transition-colors"
          >
            Chiudi (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};

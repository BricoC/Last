import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import {
  Search,
  RefreshCw,
  X,
  ArrowUpDown,
  Tag,
  AlertCircle,
  Filter,
} from "lucide-react";
import { ListinoClienteRow } from "./models/priceList";
import { priceListRepository } from "./services/priceListRepository";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";

const BATCH_SIZE = 150;

type ClientTab = "tutti" | "duplicati" | "da_verificare";

type SortField =
  | "cliente"
  | "descrizione"
  | "prezzo_fattura"
  | "prezzo_acquisto"
  | "ricarico";

export const CustomerPriceListPage: React.FC = () => {
  const [items, setItems] = useState<ListinoClienteRow[]>([]);
  const [totalDbCount, setTotalDbCount] = useState<number>(0);
  const [distinctClients, setDistinctClients] = useState<string[]>([]);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>("TUTTI");
  const [activeTab, setActiveTab] = useState<ClientTab>("tutti");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [sortField, setSortField] = useState<SortField>("cliente");
  const [sortAsc, setSortAsc] = useState(true);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const count = await priceListRepository.getClientPriceCount();
      setTotalDbCount(count);
      const clients = await priceListRepository.getDistinctClients();
      setDistinctClients(clients);
      const rows = await priceListRepository.searchClientPrices("", undefined, 20000);
      setItems(rows);
    } catch (err) {
      console.error("Errore caricamento listini clienti da SQLite:", err);
      setError(err instanceof Error ? err.message : "Errore lettura database locale.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Scorciatoia F4 per ricerca
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F4") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filtraggio tokenizzato istantaneo
  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  const filteredItems = useMemo(() => {
    let result = items;

    // Filtro per cliente selezionato da tendina (confrontando il nome pulito senza LIST_)
    if (selectedClientFilter !== "TUTTI") {
      result = result.filter(
        (item) => item.cliente.toLowerCase() === selectedClientFilter.toLowerCase()
      );
    }

    // Filtro tab: Duplicati (stesso cliente e stessa descrizione)
    if (activeTab === "duplicati") {
      const seen = new Map<string, number>();
      for (const it of items) {
        const key = `${it.cliente}__${it.descrizione}`.toLowerCase();
        seen.set(key, (seen.get(key) || 0) + 1);
      }
      result = result.filter(
        (it) => (seen.get(`${it.cliente}__${it.descrizione}`.toLowerCase()) || 0) > 1
      );
    } else if (activeTab === "da_verificare") {
      // Articoli con prezzo vendita 0 o acquisto 0
      result = result.filter((it) => !it.prezzo_fattura || it.prezzo_fattura <= 0);
    }

    if (searchTokens.length > 0) {
      result = result.filter((item) => {
        const text = `${item.cliente} ${item.descrizione} ${item.codice_articolo || ""} ${item.note || ""}`.toLowerCase();
        return searchTokens.every((token) => text.includes(token));
      });
    }

    return [...result].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (valA == null) valA = "";
      if (valB == null) valB = "";

      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }

      return sortAsc
        ? String(valA).localeCompare(String(valB), "it", { numeric: true })
        : String(valB).localeCompare(String(valA), "it", { numeric: true });
    });
  }, [items, selectedClientFilter, activeTab, searchTokens, sortField, sortAsc]);

  // Gestione scroll infinito
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 300) {
      setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filteredItems.length));
    }
  };

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const formatEuro = (val: number | null | undefined, digits: number = 2) => {
    if (val == null) return "€ 0.00";
    return `€ ${val.toLocaleString("it-IT", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })}`;
  };

  const formatPercent = (val: number | null | undefined) => {
    if (val == null || val === 0) return "0.0%";
    return `${val.toFixed(1)}%`;
  };

  return (
    <div className="flex flex-col h-full bg-[var(--background)] text-[var(--foreground)] select-none">
      {/* 1. Header Toolbar: Quickfilter estesa fino alla fine con tendina clienti e refresh */}
      <div className="p-2.5 border-b border-[var(--border)] bg-[var(--card)] flex items-center space-x-3 shrink-0">
        {/* Ricerca Rapida F4 estesa a tutta la larghezza disponibile */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-2.5" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(BATCH_SIZE);
            }}
            placeholder="Quick Filter (F4 per cercare)..."
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-medium"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtro Cliente dedicato a tendina (nomi puliti) */}
        <div className="flex items-center space-x-1 shrink-0">
          <Filter className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
          <select
            value={selectedClientFilter}
            onChange={(e) => {
              setSelectedClientFilter(e.target.value);
              setVisibleCount(BATCH_SIZE);
            }}
            className="px-2 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] outline-none focus:border-[var(--primary)] max-w-[200px]"
          >
            <option value="TUTTI">Tutti i Clienti ({distinctClients.length})</option>
            {distinctClients.map((cli) => (
              <option key={cli} value={cli}>
                {cli}
              </option>
            ))}
          </select>
        </div>

        {/* Azioni destra */}
        <div className="flex items-center space-x-2 text-xs shrink-0">
          {/* Ricarica Locale */}
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            title="Ricarica lista da SQLite locale"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          {/* Badge Visualizzati */}
          <span className="px-2.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] font-semibold text-[var(--foreground)]">
            Visualizzati: {totalDbCount}
          </span>
        </div>
      </div>

      {/* 2. Schede Tab: Tutti, Duplicati, Prezzi da Verificare */}
      <div className="px-3 py-2 bg-[var(--card)] border-b border-[var(--border)] flex items-center space-x-2 text-xs shrink-0">
        <span className="font-bold text-sm text-[var(--foreground)] mr-2">Listini Clienti</span>

        <button
          type="button"
          onClick={() => {
            setActiveTab("tutti");
            setVisibleCount(BATCH_SIZE);
          }}
          className={`px-3 py-1 rounded-full font-medium transition-all ${
            activeTab === "tutti"
              ? "bg-[var(--primary)] text-white shadow-sm font-semibold"
              : "bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
          }`}
        >
          Tutti ({totalDbCount})
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("duplicati");
            setVisibleCount(BATCH_SIZE);
          }}
          className={`px-3 py-1 rounded-full font-medium transition-all flex items-center space-x-1 ${
            activeTab === "duplicati"
              ? "bg-amber-500 text-black font-semibold shadow-sm"
              : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30"
          }`}
        >
          <span>⚠ Duplicati</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("da_verificare");
            setVisibleCount(BATCH_SIZE);
          }}
          className={`px-3 py-1 rounded-full font-medium transition-all ${
            activeTab === "da_verificare"
              ? "bg-red-500 text-white font-semibold shadow-sm"
              : "bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
          }`}
        >
          Prezzi da Verificare (€ 0)
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border-b border-red-500/30 text-red-400 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-1 hover:text-red-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. Tabella Listini Clienti: Colonna Cliente ingrandita */}
      <div
        className="flex-1 overflow-auto bg-[var(--card)] divide-y divide-[var(--border)]/40"
        onScroll={handleScroll}
      >
        <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
          <thead className="bg-[var(--background)] sticky top-0 z-10 text-[11px] uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)] shadow-sm">
            <tr>
              <th className="px-2.5 py-2 w-8 text-center">
                <input type="checkbox" className="rounded border-[var(--border)]" />
              </th>
              <th className="px-2 py-2 w-10 text-center">A...</th>
              {/* Colonna CLIENTE ingrandita come richiesto */}
              <th
                className="px-3 py-2 cursor-pointer hover:text-[var(--foreground)] w-72 min-w-[260px] max-w-[340px]"
                onClick={() => handleToggleSort("cliente")}
              >
                <div className="flex items-center space-x-1">
                  <span>CLIENTE</span>
                  <ArrowUpDown className="w-3 h-3 text-[var(--primary)]" />
                </div>
              </th>
              <th
                className="px-3 py-2 cursor-pointer hover:text-[var(--foreground)] min-w-[340px]"
                onClick={() => handleToggleSort("descrizione")}
              >
                <div className="flex items-center space-x-1">
                  <span>DESCRIZIONE</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="px-3 py-2 text-right w-32 cursor-pointer hover:text-[var(--foreground)]"
                onClick={() => handleToggleSort("prezzo_fattura")}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>PREZZO VENDITA (€)</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="px-3 py-2 text-right w-28 cursor-pointer hover:text-[var(--foreground)]"
                onClick={() => handleToggleSort("prezzo_acquisto")}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>ACQUISTO (€)</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="px-2.5 py-2 text-right w-24 cursor-pointer hover:text-[var(--foreground)]"
                onClick={() => handleToggleSort("ricarico")}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>RICARICO (%)</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="px-3 py-2 w-32">NOTE</th>
              <th className="px-3 py-2 w-28">NOTE1</th>
              <th className="px-3 py-2 w-28">NOTE2</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11.5px]">
            {filteredItems.slice(0, visibleCount).map((item) => {
              return (
                <tr
                  key={item.id}
                  className="hover:bg-[var(--background)] transition-colors group cursor-default"
                >
                  <td className="px-2.5 py-1.5 text-center">
                    <input type="checkbox" className="rounded border-[var(--border)]" />
                  </td>
                  <td className="px-2 py-1.5 text-center text-[var(--muted-foreground)] group-hover:text-[var(--primary)]">
                    <Tag className="w-3.5 h-3.5 inline" />
                  </td>
                  {/* Nome Cliente senza LIST_ e con larghezza generosa */}
                  <td
                    className="px-3 py-1.5 font-bold text-[var(--primary)] truncate w-72 min-w-[260px] max-w-[340px]"
                    title={item.cliente}
                  >
                    {item.cliente}
                  </td>
                  <td
                    className="px-3 py-1.5 font-sans font-medium text-[var(--foreground)] truncate max-w-[480px]"
                    title={item.descrizione}
                  >
                    {item.descrizione}
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-[var(--foreground)]">
                    {formatEuro(item.prezzo_fattura, 2)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[var(--muted-foreground)]">
                    {formatEuro(item.prezzo_acquisto, 2)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-[var(--muted-foreground)]">
                    {formatPercent(item.ricarico)}
                  </td>
                  <td className="px-3 py-1.5 font-sans text-xs text-[var(--muted-foreground)] truncate max-w-[140px]">
                    {item.note || ""}
                  </td>
                  <td className="px-3 py-1.5 font-sans text-xs text-[var(--muted-foreground)] truncate max-w-[120px]">
                    {item.note1 || ""}
                  </td>
                  <td className="px-3 py-1.5 font-sans text-xs text-[var(--muted-foreground)] truncate max-w-[120px]">
                    {item.note2 || ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredItems.length === 0 && !loading && (
          <div className="p-12 text-center text-xs text-[var(--muted-foreground)]">
            Nessun articolo cliente corrispondente ai criteri di ricerca.
          </div>
        )}
      </div>

      {/* 4. Footer con conteggio visualizzati */}
      <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-[11px] text-[var(--muted-foreground)] font-mono">
        <span>
          Visualizzati: {Math.min(visibleCount, filteredItems.length)} su {filteredItems.length} filtrati (Totale Reali: {totalDbCount})
        </span>
        <span>Listini Personalizzati per Cliente</span>
      </div>
    </div>
  );
};

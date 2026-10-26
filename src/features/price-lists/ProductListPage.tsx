import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import {
  Search,
  RefreshCw,
  AlertCircle,
  X,
  ArrowUpDown,
  RotateCcw,
} from "lucide-react";
import { ListinoGeneraleRow } from "./models/priceList";
import { priceListRepository } from "./services/priceListRepository";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { ItemPriceHistoryModal } from "./components/ItemPriceHistoryModal";

const BATCH_SIZE = 150;

type SortField =
  | "descrizione"
  | "codice_articolo"
  | "fornitore"
  | "data_ref"
  | "prezzo_fattura"
  | "prezzo_pubblico"
  | "prezzo_acquisto";

export const ProductListPage: React.FC = () => {
  const [items, setItems] = useState<ListinoGeneraleRow[]>([]);
  const [totalDbCount, setTotalDbCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [sortField, setSortField] = useState<SortField>("descrizione");
  const [sortAsc, setSortAsc] = useState(true);

  // Modale Storico Variazioni Riga (Colonna A...)
  const [historyModalItem, setHistoryModalItem] = useState<ListinoGeneraleRow | null>(null);

  // Caricamento iniziale da SQLite locale
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const count = await priceListRepository.getGeneralCount();
      setTotalDbCount(count);
      const rows = await priceListRepository.searchGeneral("", 10000);
      setItems(rows);
    } catch (err) {
      console.error("Errore caricamento listino generale da SQLite:", err);
      setError(err instanceof Error ? err.message : "Errore lettura database locale.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Scorciatoia F4 per ricerca rapida
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

    if (searchTokens.length > 0) {
      result = result.filter((item) => {
        const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""} ${item.cat || ""}`.toLowerCase();
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
  }, [items, searchTokens, sortField, sortAsc]);

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

  const formatEuro = (val: number | null | undefined, digits: number = 3) => {
    if (val == null) return "—";
    return `€ ${val.toLocaleString("it-IT", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })}`;
  };

  // Corretta formattazione percentuale es. 1.06 -> 106%, 0.89 -> 89%, 1.01 -> 101%
  const formatPercent = (val: number | null | undefined) => {
    if (val == null) return "—";
    return `${Math.round(val * 100)}%`;
  };

  return (
    <div className="flex flex-col h-full bg-[var(--background)] text-[var(--foreground)] select-none">
      {/* 1. Header Toolbar: Quick Filter estesa fino alla fine dei tasti */}
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

          {/* Badge Articoli Presenti (9763) */}
          <span className="px-2.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] font-semibold text-[var(--primary)]">
            Articoli presenti: {totalDbCount}
          </span>
        </div>
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

      {/* 2. Tabella Listino Generale */}
      <div
        className="flex-1 overflow-auto bg-[var(--card)] divide-y divide-[var(--border)]/40"
        onScroll={handleScroll}
      >
        <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
          <thead className="bg-[var(--background)] sticky top-0 z-10 text-[11px] uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)] shadow-sm">
            <tr>
              <th className="px-2 py-2 w-8 text-center">
                <input type="checkbox" className="rounded border-[var(--border)]" />
              </th>
              {/* Colonna A... con icona storico modifiche */}
              <th className="px-2 py-2 w-10 text-center" title="Storico modifiche riga">
                A...
              </th>
              {/* Fornitore più piccolo di larghezza */}
              <th
                className="px-2.5 py-2 w-20 max-w-[85px] cursor-pointer hover:text-[var(--foreground)]"
                onClick={() => handleToggleSort("fornitore")}
              >
                <div className="flex items-center space-x-1">
                  <span>FORNITORE</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              {/* Articolo più piccolo di larghezza */}
              <th
                className="px-2.5 py-2 w-24 max-w-[95px] cursor-pointer hover:text-[var(--foreground)]"
                onClick={() => handleToggleSort("codice_articolo")}
              >
                <div className="flex items-center space-x-1">
                  <span>ARTICOLO</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="px-2 py-2 text-center w-20">DATA</th>
              <th
                className="px-3 py-2 cursor-pointer hover:text-[var(--foreground)] min-w-[280px]"
                onClick={() => handleToggleSort("descrizione")}
              >
                <div className="flex items-center space-x-1">
                  <span>DESCRIZIONE</span>
                  <ArrowUpDown className="w-3 h-3 text-[var(--primary)]" />
                </div>
              </th>
              <th className="px-2 py-2 text-center w-14">U.M.</th>
              <th className="px-2.5 py-2 text-right w-16">% PUB</th>
              <th className="px-3 py-2 text-right w-24">PUBBLICO</th>
              <th className="px-2.5 py-2 text-right w-16">% PROF</th>
              <th className="px-3 py-2 text-right w-24">PROFESS</th>
              <th className="px-2.5 py-2 text-right w-16">% FATT</th>
              {/* Colonna FATTURA evidenziata in giallino tenue */}
              <th className="px-3 py-2 text-right w-28 bg-amber-500/20 text-amber-300 font-bold border-x border-amber-500/30">
                FATTURA
              </th>
              <th className="px-3 py-2 text-right w-24">ACQUISTO</th>
              <th className="px-2.5 py-2 text-center w-14">IVA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11.5px]">
            {filteredItems.slice(0, visibleCount).map((item) => {
              return (
                <tr
                  key={item.id}
                  className="hover:bg-[var(--background)] transition-colors group cursor-default"
                >
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" className="rounded border-[var(--border)]" />
                  </td>
                  {/* Tasto A... per visualizzare storico modifiche (massimo 15) */}
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => setHistoryModalItem(item)}
                      className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--card)] transition-colors"
                      title="Visualizza storico modifiche riga (max 15)"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </td>
                  <td
                    className="px-2.5 py-1.5 font-sans font-medium text-[var(--foreground)] truncate w-20 max-w-[85px]"
                    title={item.fornitore || ""}
                  >
                    {item.fornitore || "—"}
                  </td>
                  <td
                    className="px-2.5 py-1.5 font-bold text-[var(--primary)] truncate w-24 max-w-[95px]"
                    title={item.codice_articolo || ""}
                  >
                    {item.codice_articolo || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center text-[var(--muted-foreground)]">
                    {item.data_ref || "—"}
                  </td>
                  <td
                    className="px-3 py-1.5 font-sans font-medium text-[var(--foreground)] truncate max-w-[420px]"
                    title={item.descrizione}
                  >
                    {item.descrizione}
                  </td>
                  <td className="px-2 py-1.5 text-center text-[var(--muted-foreground)]">
                    {item.um || "NR."}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-[var(--muted-foreground)]">
                    {formatPercent(item.perc_pub)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium text-[var(--foreground)]">
                    {formatEuro(item.prezzo_pubblico)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-[var(--muted-foreground)]">
                    {formatPercent(item.perc_prof)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium text-[var(--foreground)]">
                    {formatEuro(item.prezzo_profess)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-[var(--muted-foreground)]">
                    {formatPercent(item.perc_fatt)}
                  </td>
                  {/* Cella Prezzo Fattura Evidenziata in giallino tenue */}
                  <td className="px-3 py-1.5 text-right font-bold bg-amber-500/15 text-amber-200 border-x border-amber-500/20">
                    {formatEuro(item.prezzo_fattura)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[var(--muted-foreground)]">
                    {formatEuro(item.prezzo_acquisto, 4)}
                  </td>
                  <td className="px-2.5 py-1.5 text-center text-[var(--muted-foreground)]">
                    {formatPercent(item.perc_iva)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredItems.length === 0 && !loading && (
          <div className="p-12 text-center text-xs text-[var(--muted-foreground)]">
            Nessun articolo corrispondente ai criteri di ricerca.
          </div>
        )}
      </div>

      {/* 3. Footer con conteggio visualizzati */}
      <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-[11px] text-[var(--muted-foreground)] font-mono">
        <span>
          Visualizzati: {Math.min(visibleCount, filteredItems.length)} su {filteredItems.length} filtrati (Totale DB: {totalDbCount})
        </span>
        <span>Listino Generale + Listini Vari (Unificati)</span>
      </div>

      {/* Modale Storico Modifiche Riga */}
      <ItemPriceHistoryModal
        isOpen={Boolean(historyModalItem)}
        onClose={() => setHistoryModalItem(null)}
        item={historyModalItem}
      />
    </div>
  );
};

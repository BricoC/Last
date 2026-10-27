import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { LoaderCircle, RefreshCw, Search, X, FileText } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { getDdtArticleViewRows, type DdtArticleViewRow } from "./services/ddtReadModelsRepository";
import { requestOpenDdt } from "./services/ddtNavigation";
import { formatDdtMoney, formatDdtNumber, formatDdtViewDate } from "./services/ddtViewFormatting";
import { normalizeSearch, tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { DDTQuickViewModal } from "./components/DDTQuickViewModal";
import { DDTClientArticleHistoryModal } from "./components/DDTClientArticleHistoryModal";

type IndexedArticleRow = DdtArticleViewRow & { _searchIndex: string };

const BATCH_SIZE = 150;

export function DDTArticlesPage() {
  const [rows, setRows] = useState<DdtArticleViewRow[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [selectedDdtId, setSelectedDdtId] = useState<string | null>(null);
  const [selectedArticleForHistory, setSelectedArticleForHistory] = useState<DdtArticleViewRow | null>(null);
  const openWindow = useWindowStore((state) => state.openWindow);

  const load = async () => {
    setLoading(true); setError("");
    try { setRows(await getDdtArticleViewRows()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Impossibile leggere le righe DDT locali."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  // Scorciatoia F4 per focalizzare la ricerca rapida come in noManV1
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

  const indexedRows = useMemo<IndexedArticleRow[]>(() => {
    return rows.map((row) => ({
      ...row,
      _searchIndex: normalizeSearch(
        `${row.description} ${row.date} ${formatDdtViewDate(row.date)} ${row.year} ${row.client} ${row.destination} ${formatDdtNumber(row.docNumber, row.series)}`
      ),
    }));
  }, [rows]);

  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  const availableClients = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.client) {
        const trimmed = r.client.trim();
        if (trimmed) set.add(trimmed);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  }, [rows]);

  const filtered = useMemo(() => {
    if (!searchTokens.length) return indexedRows;
    return indexedRows.filter((row) => {
      return searchTokens.every((token) => row._searchIndex.includes(token));
    });
  }, [indexedRows, searchTokens]);

  // Reset del numero di righe visibili al cambio filtri e scroll in cima
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [deferredSearch]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 350) {
      setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filtered.length));
    }
  };

  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-[var(--foreground)]">
      {/* Search Input Bar */}
      <label className="flex h-9 w-full shrink-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-xs">
        <Search className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
        <input
          ref={searchInputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cerca descrizione, data, mese (es. Settembre), cliente, destinazione o numero DDT… (F4 per cercare)"
          className="w-full bg-transparent outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); searchInputRef.current?.focus(); }}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-0.5 rounded cursor-pointer"
            title="Cancella ricerca"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      {/* Toolbar / Header */}
      <div className="flex h-7 shrink-0 items-center justify-between gap-3 px-1 text-xs">
        <div className="flex items-center gap-2 font-semibold">
          <h1 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">Articoli DDT</h1>
          <span className="text-[var(--muted-foreground)] text-[11px] font-normal">
            ({rows.length.toLocaleString("it-IT")} totali)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span>Righe visibili: {filtered.length.toLocaleString("it-IT")}</span>
          <Button type="button" size="sm" variant="secondary" className="h-6 px-2 cursor-pointer" onClick={() => void load()} disabled={loading}>
            {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-[var(--destructive)]">{error}</p>}

      {/* Tabella con stile dei popup (colorata, pulita e reattiva) */}
      {loading && rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />Caricamento righe…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-md bg-[var(--card)]">
          Nessuna voce trovata per i filtri selezionati.
        </div>
      ) : (
        <div
          ref={tableContainerRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-auto border border-[var(--border)] rounded-md bg-[var(--card)]"
        >
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)] text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left w-36">DATA</th>
                <th className="px-3 py-2 text-left w-24">DDT</th>
                <th className="px-3 py-2 text-left w-48">CLIENTE</th>
                <th className="px-3 py-2 text-left w-48">DESTINAZIONE</th>
                <th className="px-2 py-2 text-center w-14">UM</th>
                <th className="px-3 py-2 text-right w-20">QUANTITÀ</th>
                <th className="px-3 py-2 text-left">DESCRIZIONE</th>
                <th className="px-3 py-2 text-right w-28">PREZZO UNIT.</th>
                <th className="px-2 py-2 text-center w-20">SCONTO</th>
                <th className="px-3 py-2 text-right w-28">IMPORTO</th>
                <th className="px-2 py-2 text-center w-16">IVA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
              {visibleRows.map((row) => {
                const informational = row.rowKind === "note";

                return (
                  <tr
                    key={row.id}
                    className="hover:bg-[var(--background)]/60 transition-colors"
                  >
                    {/* DATA */}
                    <td className="px-3 py-2 font-sans font-medium text-[var(--foreground)] whitespace-nowrap">
                      {formatDdtViewDate(row.date)}
                    </td>

                    {/* DDT (Link al popup del DDT) */}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedDdtId(row.ddtId)}
                        className="font-bold text-[var(--primary)] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                        title={`Apri dettaglio DDT ${formatDdtNumber(row.docNumber, row.series)}`}
                      >
                        <FileText className="h-3 w-3" />
                        <span>{formatDdtNumber(row.docNumber, row.series)}</span>
                      </button>
                    </td>

                    {/* CLIENTE */}
                    <td className="px-3 py-2 font-sans font-medium text-[var(--foreground)] truncate max-w-[200px]" title={row.client}>
                      {row.client}
                    </td>

                    {/* DESTINAZIONE */}
                    <td className="px-3 py-2 font-sans text-[var(--muted-foreground)] truncate max-w-[200px]" title={row.destination}>
                      {row.destination || "—"}
                    </td>

                    {/* UM */}
                    <td className="px-2 py-2 text-center uppercase text-[var(--muted-foreground)]">
                      {informational ? "" : (row.unit || "NR")}
                    </td>

                    {/* QUANTITÀ */}
                    <td className="px-3 py-2 text-right font-bold text-[var(--foreground)]">
                      {informational ? "" : row.quantity}
                    </td>

                    {/* DESCRIZIONE (Link al popup storico articolo del cliente) */}
                    <td className="px-3 py-2 font-sans">
                      <button
                        type="button"
                        onClick={() => setSelectedArticleForHistory(row)}
                        className="group text-left w-full hover:text-[var(--primary)] transition-colors cursor-pointer inline-flex items-center justify-between gap-2"
                        title="Clicca per aprire lo storico acquisti di questo articolo"
                      >
                        <span className="truncate group-hover:underline font-semibold text-[var(--foreground)]">
                          {row.description}
                        </span>
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity rounded bg-[var(--primary)]/20 px-1.5 py-0.5 text-[10px] font-sans text-[var(--primary)] shrink-0 font-semibold">
                          Storico ↗
                        </span>
                      </button>
                    </td>

                    {/* PREZZO UNIT. */}
                    <td className="px-3 py-2 text-right text-[var(--muted-foreground)]">
                      {informational ? "" : (row.unitPriceSubunits > 0 ? formatDdtMoney(row.unitPriceSubunits) : "—")}
                    </td>

                    {/* SCONTO */}
                    <td
                      className={`px-2 py-2 text-center font-medium ${
                        row.discountPercent && row.discountPercent !== "0"
                          ? "text-amber-400"
                          : "text-[var(--muted-foreground)]"
                      }`}
                    >
                      {informational ? "" : (row.discountPercent ? `${row.discountPercent}%` : "—")}
                    </td>

                    {/* IMPORTO */}
                    <td className="px-3 py-2 text-right font-bold text-sky-400">
                      {informational ? "" : formatDdtMoney(row.netAmountSubunits)}
                    </td>

                    {/* IVA */}
                    <td className="px-2 py-2 text-center text-[var(--muted-foreground)]">
                      {informational || row.vatRate === 0 ? "—" : `${row.vatRate}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleRows.length < filtered.length && (
            <div className="p-3 text-center text-xs text-[var(--muted-foreground)] bg-[var(--background)]/40 border-t border-[var(--border)]/30">
              Visualizzati {visibleRows.length} di {filtered.length} articoli. Scorri verso il basso per caricarne altri.
            </div>
          )}
        </div>
      )}

      {/* Footer Totali */}
      <div className="flex h-7 shrink-0 items-center justify-end border-t border-[var(--border)] px-2 text-[11px] font-semibold">
        <span>Totale importi visibili: </span>
        <span className="ml-1.5 font-bold text-sky-400">
          {formatDdtMoney(filtered.reduce((sum, row) => sum + row.netAmountSubunits, 0))}
        </span>
      </div>

      {/* Popup Dettaglio DDT con chiusura rapida Esc */}
      <DDTQuickViewModal
        isOpen={selectedDdtId !== null}
        onClose={() => setSelectedDdtId(null)}
        ddtId={selectedDdtId}
        onOpenInStudio={(id) => {
          requestOpenDdt(id);
          openWindow({ id: "ddt-studio", title: "DDT Studio (Pro)", componentId: "ddt-studio" });
        }}
      />

      {/* Popup Storico Articolo per il cliente */}
      {selectedArticleForHistory && (
        <DDTClientArticleHistoryModal
          isOpen={true}
          onClose={() => setSelectedArticleForHistory(null)}
          clientName={selectedArticleForHistory.client}
          articleDescription={selectedArticleForHistory.description}
          availableClients={availableClients}
          onSelectDdt={(otherDdtId) => {
            setSelectedArticleForHistory(null);
            setSelectedDdtId(otherDdtId);
          }}
        />
      )}
    </div>
  );
}


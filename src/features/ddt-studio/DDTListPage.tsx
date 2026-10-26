import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { LoaderCircle, RefreshCw, Search, X, FileText } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { getDdtListViewRows, type DdtListViewRow } from "./services/ddtReadModelsRepository";
import { requestOpenDdt } from "./services/ddtNavigation";
import { formatDdtMoney, formatDdtNumber, formatDdtPercent, formatDdtViewDate } from "./services/ddtViewFormatting";
import { normalizeSearch, tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { DDTQuickViewModal } from "./components/DDTQuickViewModal";

type IndexedDdtRow = DdtListViewRow & { _searchIndex: string };

const BATCH_SIZE = 150;

export function DDTListPage() {
  const [rows, setRows] = useState<DdtListViewRow[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [selectedDdtId, setSelectedDdtId] = useState<string | null>(null);
  const openWindow = useWindowStore((state) => state.openWindow);

  const load = async () => {
    setLoading(true); setError("");
    try { setRows(await getDdtListViewRows()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Impossibile leggere i DDT locali."); }
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

  const years = useMemo(() => [...new Set(rows.map((row) => row.year))].sort((a, b) => b - a), [rows]);

  const indexedRows = useMemo<IndexedDdtRow[]>(() => {
    return rows.map((row) => ({
      ...row,
      _searchIndex: normalizeSearch(
        `${formatDdtNumber(row.docNumber, row.series)} ${row.client} ${row.destination} ${row.orderReference} ${row.operator || ""} ${row.reason || ""}`
      ),
    }));
  }, [rows]);

  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  const filtered = useMemo(() => {
    const targetYear = year === "all" ? null : Number(year);
    if (!searchTokens.length && targetYear === null) return indexedRows;
    return indexedRows.filter((row) => {
      if (targetYear !== null && row.year !== targetYear) return false;
      if (!searchTokens.length) return true;
      return searchTokens.every((token) => row._searchIndex.includes(token));
    });
  }, [indexedRows, searchTokens, year]);

  // Reset del numero di righe visibili al cambio filtri e scroll in cima
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [deferredSearch, year]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 350) {
      setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filtered.length));
    }
  };

  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const totals = useMemo(() => filtered.reduce((sum, row) => ({
    taxable: sum.taxable + row.taxableSubunits,
    purchase: sum.purchase + row.purchaseSubunits,
    revenue: sum.revenue + row.revenueSubunits,
  }), { taxable: 0, purchase: 0, revenue: 0 }), [filtered]);
  const yearCount = year === "all" ? rows.length : rows.filter((row) => row.year === Number(year)).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-[var(--foreground)]">
      {/* Search Input Bar */}
      <label className="flex h-9 w-full shrink-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-xs">
        <Search className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
        <input
          ref={searchInputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cerca numero DDT, cliente, destinazione o ordine… (F4 per cercare)"
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
          <span>Totale DDT {year === "all" ? "archivio" : year}: {yearCount.toLocaleString("it-IT")}</span>
          <select aria-label="Anno DDT" value={year} onChange={(event) => setYear(event.target.value)} className="h-6 rounded border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-normal cursor-pointer">
            {years.map((value) => <option key={value} value={String(value)}>{value}</option>)}<option value="all">Tutti</option>
          </select>
        </div>
        <h1 className="hidden font-semibold sm:block">DDT EMESSE</h1>
        <div className="flex items-center gap-3">
          <span>Visibili: {filtered.length.toLocaleString("it-IT")}</span>
          <span>Totale DDT presenti: {rows.length.toLocaleString("it-IT")}</span>
          <Button type="button" size="sm" variant="secondary" className="h-6 px-2 cursor-pointer" onClick={() => void load()} disabled={loading}>
            {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-[var(--destructive)]">{error}</p>}

      {/* Tabella con stile dei popup (colorata, pulita e reattiva) */}
      {loading && rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />Caricamento DDT…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-md bg-[var(--card)]">
          Nessun DDT trovato per i filtri selezionati.
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
                <th className="px-3 py-2 text-left w-24">DATA</th>
                <th className="px-3 py-2 text-left w-28">DDT</th>
                <th className="px-3 py-2 text-left w-48">CLIENTE</th>
                <th className="px-3 py-2 text-left">DESTINAZIONE</th>
                <th className="px-3 py-2 text-right w-32">TOTALE IMPONIBILE</th>
                <th className="px-3 py-2 text-right w-32">PREZZO ACQUISTO</th>
                <th className="px-3 py-2 text-right w-28">RICAVO</th>
                <th className="px-3 py-2 text-right w-24">RICARICO %</th>
                <th className="px-2 py-2 text-center w-20">SCONTO %</th>
                <th className="px-3 py-2 text-center w-24">OPERATORE</th>
                <th className="px-3 py-2 text-left w-32">CAUSALE</th>
                <th className="px-3 py-2 text-left w-36">ORDINE</th>
                <th className="px-3 py-2 text-left w-40">PAGAMENTO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
              {visibleRows.map((row) => {
                const isPositiveRev = row.revenueSubunits > 0;
                const isNegativeRev = row.revenueSubunits < 0;

                return (
                  <tr
                    key={row.id}
                    className="hover:bg-[var(--background)]/60 transition-colors"
                  >
                    {/* DATA */}
                    <td className="px-3 py-2 font-sans font-medium text-[var(--foreground)] whitespace-nowrap">
                      {formatDdtViewDate(row.date)}
                    </td>

                    {/* DDT (Link al popup) */}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedDdtId(row.id)}
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
                    <td className="px-3 py-2 font-sans text-[var(--muted-foreground)] truncate max-w-[220px]" title={row.destination}>
                      {row.destination || "—"}
                    </td>

                    {/* TOTALE IMPONIBILE */}
                    <td className="px-3 py-2 text-right font-bold text-[var(--foreground)]">
                      {formatDdtMoney(row.taxableSubunits)}
                    </td>

                    {/* PREZZO ACQUISTO */}
                    <td className="px-3 py-2 text-right text-[var(--muted-foreground)]">
                      {formatDdtMoney(row.purchaseSubunits)}
                    </td>

                    {/* RICAVO */}
                    <td
                      className={`px-3 py-2 text-right font-semibold ${
                        isPositiveRev
                          ? "text-emerald-400"
                          : isNegativeRev
                          ? "text-rose-400"
                          : "text-[var(--muted-foreground)]"
                      }`}
                    >
                      {formatDdtMoney(row.revenueSubunits)}
                    </td>

                    {/* RICARICO % */}
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        isPositiveRev
                          ? "text-emerald-400"
                          : isNegativeRev
                          ? "text-rose-400"
                          : "text-[var(--muted-foreground)]"
                      }`}
                    >
                      {formatDdtPercent(row.markupPercent)}
                    </td>

                    {/* SCONTO % */}
                    <td
                      className={`px-2 py-2 text-center font-medium ${
                        row.discountPercent && row.discountPercent > 0
                          ? "text-amber-400"
                          : "text-[var(--muted-foreground)]"
                      }`}
                    >
                      {formatDdtPercent(row.discountPercent)}
                    </td>

                    {/* OPERATORE */}
                    <td className="px-3 py-2 text-center text-[var(--muted-foreground)] font-sans">
                      {row.operator || "—"}
                    </td>

                    {/* CAUSALE */}
                    <td className="px-3 py-2 text-left font-sans text-[var(--muted-foreground)] truncate max-w-[140px]" title={row.reason}>
                      {row.reason || "—"}
                    </td>

                    {/* ORDINE */}
                    <td className="px-3 py-2 text-left font-sans text-[var(--muted-foreground)] truncate max-w-[160px]" title={row.orderReference}>
                      {row.orderReference || "—"}
                    </td>

                    {/* PAGAMENTO */}
                    <td className="px-3 py-2 text-left font-sans text-[var(--muted-foreground)] truncate max-w-[180px]" title={row.payment}>
                      {row.payment || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleRows.length < filtered.length && (
            <div className="p-3 text-center text-xs text-[var(--muted-foreground)] bg-[var(--background)]/40 border-t border-[var(--border)]/30">
              Visualizzati {visibleRows.length} di {filtered.length} DDT. Scorri verso il basso per caricarne altri.
            </div>
          )}
        </div>
      )}

      {/* Footer Totali */}
      <div className="flex h-7 shrink-0 items-center justify-end gap-5 border-t border-[var(--border)] px-2 text-[11px] font-semibold">
        <span>Imponibile {formatDdtMoney(totals.taxable)}</span>
        <span>Acquisto {formatDdtMoney(totals.purchase)}</span>
        <span className={totals.revenue >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
          Ricavo {formatDdtMoney(totals.revenue)}
        </span>
      </div>

      {/* Popup Dati Completi DDT con chiusura rapida Esc */}
      <DDTQuickViewModal
        isOpen={selectedDdtId !== null}
        onClose={() => setSelectedDdtId(null)}
        ddtId={selectedDdtId}
        onOpenInStudio={(id) => {
          requestOpenDdt(id);
          openWindow({ id: "ddt-studio", title: "DDT Studio (Pro)", componentId: "ddt-studio" });
        }}
      />
    </div>
  );
}


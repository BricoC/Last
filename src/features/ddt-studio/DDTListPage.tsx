import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { GridCell, GridCellKind, GridColumn, Item } from "@glideapps/glide-data-grid";
import { LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { ExcelGrid } from "@/shared/components/data-grid/ExcelGrid";
import { Button } from "@/shared/components/ui/button";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { getDdtListViewRows, type DdtListViewRow } from "./services/ddtReadModelsRepository";
import { requestOpenDdt } from "./services/ddtNavigation";
import { formatDdtMoney, formatDdtNumber, formatDdtPercent, formatDdtViewDate } from "./services/ddtViewFormatting";
import { normalizeSearch, tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { DDTQuickViewModal } from "./components/DDTQuickViewModal";

const columns: GridColumn[] = [
  { title: "DATA", width: 125 }, { title: "DDT", width: 85 }, { title: "CLIENTE", width: 210 },
  { title: "DESTINAZIONE", width: 190 }, { title: "TOTALE IMPONIBILE", width: 135 },
  { title: "PREZZO ACQUISTO", width: 135 }, { title: "RICAVO", width: 120 },
  { title: "RICARICO %", width: 105 }, { title: "SCONTO %", width: 95 },
  { title: "OPERATORE", width: 105 }, { title: "CAUSALE", width: 135 },
  { title: "ORDINE", width: 170 }, { title: "PAGAMENTO", width: 180 },
];

const asText = (value: string): GridCell => ({ kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true });

type IndexedDdtRow = DdtListViewRow & { _searchIndex: string };

export function DDTListPage() {
  const [rows, setRows] = useState<DdtListViewRow[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  const getCellContent = (cell: Item): GridCell => {
    const row = filtered[cell[1]];
    if (!row) return asText("");
    const isDdtColumn = columns[cell[0]]?.title === "DDT";
    const values = [
      formatDdtViewDate(row.date), formatDdtNumber(row.docNumber, row.series), row.client, row.destination,
      formatDdtMoney(row.taxableSubunits), formatDdtMoney(row.purchaseSubunits), formatDdtMoney(row.revenueSubunits),
      formatDdtPercent(row.markupPercent), formatDdtPercent(row.discountPercent), row.operator || "—",
      row.reason, row.orderReference, row.payment,
    ];
    const text = values[cell[0]] ?? "";
    if (isDdtColumn) {
      return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: false,
        themeOverride: {
          textDark: "#38bdf8",
          baseFontStyle: "bold 13px",
        },
      };
    }
    return asText(text);
  };

  const [selectedDdtId, setSelectedDdtId] = useState<string | null>(null);

  const openSelectedDdt = (cell: Item) => {
    const column = columns[cell[0]];
    if (column?.title !== "DDT") return;
    const row = filtered[cell[1]];
    if (!row) return;
    setSelectedDdtId(row.id);
  };

  const totals = useMemo(() => filtered.reduce((sum, row) => ({
    taxable: sum.taxable + row.taxableSubunits,
    purchase: sum.purchase + row.purchaseSubunits,
    revenue: sum.revenue + row.revenueSubunits,
  }), { taxable: 0, purchase: 0, revenue: 0 }), [filtered]);
  const yearCount = year === "all" ? rows.length : rows.filter((row) => row.year === Number(year)).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-[var(--foreground)]">
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
      {loading && rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />Caricamento DDT…
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden border border-[var(--border)] bg-[var(--card)]">
          <ExcelGrid columns={columns} rows={filtered.length} getCellContent={getCellContent} onCellClicked={openSelectedDdt} />
        </div>
      )}
      <div className="flex h-7 shrink-0 items-center justify-end gap-5 border-t border-[var(--border)] px-2 text-[11px] font-semibold">
        <span>Imponibile {formatDdtMoney(totals.taxable)}</span><span>Acquisto {formatDdtMoney(totals.purchase)}</span><span>Ricavo {formatDdtMoney(totals.revenue)}</span>
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

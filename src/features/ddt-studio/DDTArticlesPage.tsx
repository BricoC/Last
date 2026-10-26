import { useEffect, useMemo, useRef, useState } from "react";
import { GridCell, GridCellKind, GridColumn, Item } from "@glideapps/glide-data-grid";
import { LoaderCircle, RefreshCw, Search } from "lucide-react";
import { ExcelGrid } from "@/shared/components/data-grid/ExcelGrid";
import { Button } from "@/shared/components/ui/button";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { getDdtArticleViewRows, type DdtArticleViewRow } from "./services/ddtReadModelsRepository";
import { requestOpenDdt } from "./services/ddtNavigation";
import { formatDdtMoney, formatDdtNumber, formatDdtViewDate } from "./services/ddtViewFormatting";
import { matchesFragmentSearch } from "@/shared/hooks/useFragmentSearch";

const columns: GridColumn[] = [
  { title: "CLIENTE", width: 210 }, { title: "DESTINAZIONE", width: 190 },
  { title: "DDT", width: 85 }, { title: "DATA", width: 125 }, { title: "UM", width: 75 },
  { title: "QUANTITÀ", width: 100 }, { title: "DESCRIZIONE", width: 360 },
  { title: "PREZZO UNIT.", width: 125 }, { title: "SCONTO", width: 95 },
  { title: "IMPORTO", width: 125 }, { title: "IVA", width: 75 },
];

const asText = (value: string): GridCell => ({ kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true });

export function DDTArticlesPage() {
  const [rows, setRows] = useState<DdtArticleViewRow[]>([]);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("all");
  const [filtering, setFiltering] = useState(false);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const openWindow = useWindowStore((state) => state.openWindow);

  const load = async () => {
    setLoading(true); setError("");
    try { setRows(await getDdtArticleViewRows()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Impossibile leggere le righe DDT locali."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const years = useMemo(() => [...new Set(rows.map((row) => row.year))].sort((a, b) => b - a), [rows]);
  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (year !== "all" && row.year !== Number(year)) return false;
      return matchesFragmentSearch([
        row.description, row.date, formatDdtViewDate(row.date), row.client, row.destination,
        formatDdtNumber(row.docNumber, row.series),
      ], search);
    });
  }, [rows, search, year]);

  const getCellContent = (cell: Item): GridCell => {
    const row = filtered[cell[1]];
    if (!row) return asText("");
    const informational = row.rowKind === "note";
    const values = [
      row.client, row.destination, formatDdtNumber(row.docNumber, row.series), formatDdtViewDate(row.date),
      informational ? "" : row.unit, informational ? "" : row.quantity, row.description,
      informational ? "" : formatDdtMoney(row.unitPriceSubunits), informational ? "" : row.discountPercent,
      informational ? "" : formatDdtMoney(row.netAmountSubunits), informational || row.vatRate === 0 ? "" : `${row.vatRate}%`,
    ];
    return asText(values[cell[0]] ?? "");
  };

  const openSelectedDdt = (cell: Item) => {
    const row = filtered[cell[1]];
    if (!row) return;
    requestOpenDdt(row.ddtId);
    openWindow({ id: "ddt-studio", title: "DDT Studio (Pro)", componentId: "ddt-studio" });
  };

  const updateSearch = (value: string) => {
    setSearch(value);
    setFiltering(true);
    if (filterTimer.current) clearTimeout(filterTimer.current);
    filterTimer.current = setTimeout(() => setFiltering(false), 120);
  };
  useEffect(() => () => { if (filterTimer.current) clearTimeout(filterTimer.current); }, []);

  return <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-[var(--foreground)]">
    <label className="flex h-9 w-full shrink-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-xs">
        <Search className="h-4 w-4 text-[var(--muted-foreground)]" />
        <input value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Cerca descrizione, data, cliente, destinazione o numero DDT…" className="w-full bg-transparent outline-none" />
    </label>
    <div className="flex h-7 shrink-0 items-center justify-between gap-3 px-1 text-xs">
      <div className="flex items-center gap-2 font-semibold"><h1>Articoli DDT</h1>
        <select aria-label="Anno DDT" value={year} onChange={(event) => setYear(event.target.value)} className="h-6 rounded border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-normal">
          <option value="all">Tutti gli anni</option>{years.map((value) => <option key={value} value={String(value)}>{value}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <span>Righe visibili: {filtered.length.toLocaleString("it-IT")}</span><span>Totale voci presenti: {rows.length.toLocaleString("it-IT")}</span>
        <Button type="button" size="sm" variant="secondary" className="h-6 px-2" onClick={() => void load()} disabled={loading}>
          {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
    {error && <p role="alert" className="text-xs text-[var(--destructive)]">{error}</p>}
    {loading && rows.length === 0 ? <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]"><LoaderCircle className="h-4 w-4 animate-spin" />Caricamento righe…</div>
      : <div className="min-h-0 flex-1 overflow-hidden border border-[var(--border)] transition-[opacity,transform] duration-150 ease-out" style={{ opacity: filtering ? 0.72 : 1, transform: filtering ? "translateY(2px)" : "translateY(0)" }}><ExcelGrid columns={columns} rows={filtered.length} getCellContent={getCellContent} onCellClicked={openSelectedDdt} /></div>}
    <div className="flex h-7 shrink-0 items-center justify-end border-t border-[var(--border)] px-2 text-[11px] font-semibold">Totale importi visibili: {formatDdtMoney(filtered.reduce((sum, row) => sum + row.netAmountSubunits, 0))}</div>
  </div>;
}

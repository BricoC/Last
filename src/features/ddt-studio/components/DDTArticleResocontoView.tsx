import React, { useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { 
  FileDown, 
  Printer, 
  Layers, 
  ArrowUp, 
  ArrowDown, 
  ArrowUpDown, 
  ChevronDown, 
  ChevronRight,
  Sparkles,
  Check
} from "lucide-react";
import { type ClientArticleHistoryRow } from "../services/ddtReadModelsRepository";
import { formatDdtMoney, formatDdtPercent, formatDdtViewDate } from "../services/ddtViewFormatting";
import { normalizeArticleDescription } from "../utils/articleDescriptionNormalizer";
import { exportResocontoPdfToDesktop } from "../utils/resocontoExportManager";

export interface DDTArticleResocontoViewProps {
  rows: ClientArticleHistoryRow[];
  clientName: string;
  isAllClients: boolean;
  selectedYear: string;
  searchTerm: string;
  mergeVariants: boolean;
  onToggleMergeVariants: () => void;
}

export interface ArticleResocontoGroup {
  key: string;
  canonicalDescription: string;
  originalDescriptions: string[];
  unit: string;
  totalQuantity: number;
  docCount: number;
  // Prezzo Netto
  netPriceAvg: number;
  netPriceMin: number;
  netPriceMax: number;
  lastNetPrice: number;
  lastDate: string;
  // Costo Acquisto
  purchasePriceAvg: number;
  purchasePriceMin: number;
  purchasePriceMax: number;
  // Margine & Ricarico
  totalNetAmount: number;
  totalPurchaseAmount: number;
  totalRevenue: number;
  markupAvgPercent: number | null;
  markupMinPercent: number | null;
  markupMaxPercent: number | null;
}

type ResocontoSortField =
  | "description"
  | "quantity"
  | "docCount"
  | "netPriceAvg"
  | "lastNetPrice"
  | "purchasePriceAvg"
  | "markupAvg"
  | "totalRevenue"
  | "totalNetAmount";

export const DDTArticleResocontoView: React.FC<DDTArticleResocontoViewProps> = ({
  rows,
  clientName,
  isAllClients,
  selectedYear,
  searchTerm,
  mergeVariants,
  onToggleMergeVariants,
}) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<ResocontoSortField>("totalNetAmount");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const pagesContainerRef = useRef<HTMLDivElement>(null);

  // Raggruppamento dati
  const groups = useMemo<ArticleResocontoGroup[]>(() => {
    const map = new Map<
      string,
      {
        key: string;
        canonicalDescription: string;
        originalDescSet: Set<string>;
        unit: string;
        totalQuantity: number;
        docCount: number;
        totalNetAmount: number;
        totalPurchaseAmount: number;
        netPrices: number[];
        purchasePrices: number[];
        markupPercents: number[];
        lastDate: string;
        lastNetPrice: number;
      }
    >();

    for (const r of rows) {
      const canonical = mergeVariants
        ? normalizeArticleDescription(r.description) || r.description.trim().toUpperCase()
        : r.description.trim().toUpperCase();

      const key = canonical || "SENZA DESCRIZIONE";

      let group = map.get(key);
      if (!group) {
        group = {
          key,
          canonicalDescription: canonical,
          originalDescSet: new Set<string>(),
          unit: r.unit || "NR",
          totalQuantity: 0,
          docCount: 0,
          totalNetAmount: 0,
          totalPurchaseAmount: 0,
          netPrices: [],
          purchasePrices: [],
          markupPercents: [],
          lastDate: r.date,
          lastNetPrice: 0,
        };
        map.set(key, group);
      }

      if (r.description) group.originalDescSet.add(r.description.trim());

      const qty = parseFloat(r.quantity.replace(",", ".")) || 0;
      const unitNet = qty > 0 ? r.netAmountSubunits / qty : r.unitPriceSubunits;
      const purchaseUnit = r.purchasePriceSubunits || 0;

      group.totalQuantity += qty;
      group.docCount += 1;
      group.totalNetAmount += r.netAmountSubunits;
      group.totalPurchaseAmount += Math.round(purchaseUnit * qty);

      if (unitNet > 0) group.netPrices.push(unitNet);
      if (purchaseUnit > 0) group.purchasePrices.push(purchaseUnit);
      if (r.markupPercent !== null && r.markupPercent !== undefined) {
        group.markupPercents.push(r.markupPercent);
      }

      // Se riga più recente aggiorna lastDate e lastNetPrice
      if (!group.lastDate || (r.date && r.date >= group.lastDate)) {
        group.lastDate = r.date;
        group.lastNetPrice = unitNet;
      }
    }

    return Array.from(map.values()).map((g) => {
      const netPriceAvg = g.totalQuantity > 0 ? g.totalNetAmount / g.totalQuantity : 0;
      const netPriceMin = g.netPrices.length ? Math.min(...g.netPrices) : 0;
      const netPriceMax = g.netPrices.length ? Math.max(...g.netPrices) : 0;

      const purchasePriceAvg = g.totalQuantity > 0 ? g.totalPurchaseAmount / g.totalQuantity : 0;
      const purchasePriceMin = g.purchasePrices.length ? Math.min(...g.purchasePrices) : 0;
      const purchasePriceMax = g.purchasePrices.length ? Math.max(...g.purchasePrices) : 0;

      const totalRevenue = g.totalNetAmount - g.totalPurchaseAmount;
      const markupAvgPercent =
        g.totalPurchaseAmount > 0 ? (totalRevenue / g.totalPurchaseAmount) * 100 : null;
      const markupMinPercent = g.markupPercents.length ? Math.min(...g.markupPercents) : null;
      const markupMaxPercent = g.markupPercents.length ? Math.max(...g.markupPercents) : null;

      return {
        key: g.key,
        canonicalDescription: g.canonicalDescription,
        originalDescriptions: Array.from(g.originalDescSet),
        unit: g.unit,
        totalQuantity: g.totalQuantity,
        docCount: g.docCount,
        netPriceAvg,
        netPriceMin,
        netPriceMax,
        lastNetPrice: g.lastNetPrice,
        lastDate: g.lastDate,
        purchasePriceAvg,
        purchasePriceMin,
        purchasePriceMax,
        totalNetAmount: g.totalNetAmount,
        totalPurchaseAmount: g.totalPurchaseAmount,
        totalRevenue,
        markupAvgPercent,
        markupMinPercent,
        markupMaxPercent,
      };
    });
  }, [rows, mergeVariants]);

  // Ordinamento
  const sortedGroups = useMemo(() => {
    const mult = sortDirection === "asc" ? 1 : -1;
    return [...groups].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "description":
          cmp = a.canonicalDescription.localeCompare(b.canonicalDescription);
          break;
        case "quantity":
          cmp = a.totalQuantity - b.totalQuantity;
          break;
        case "docCount":
          cmp = a.docCount - b.docCount;
          break;
        case "netPriceAvg":
          cmp = a.netPriceAvg - b.netPriceAvg;
          break;
        case "lastNetPrice":
          cmp = a.lastNetPrice - b.lastNetPrice;
          break;
        case "purchasePriceAvg":
          cmp = a.purchasePriceAvg - b.purchasePriceAvg;
          break;
        case "markupAvg":
          cmp = (a.markupAvgPercent ?? -999999) - (b.markupAvgPercent ?? -999999);
          break;
        case "totalRevenue":
          cmp = a.totalRevenue - b.totalRevenue;
          break;
        case "totalNetAmount":
          cmp = a.totalNetAmount - b.totalNetAmount;
          break;
      }
      return cmp * mult;
    });
  }, [groups, sortField, sortDirection]);

  // Statistiche globali del resoconto
  const overallTotals = useMemo(() => {
    let totalQty = 0;
    let totalNet = 0;
    let totalPurchase = 0;
    let totalDocs = 0;

    for (const g of groups) {
      totalQty += g.totalQuantity;
      totalNet += g.totalNetAmount;
      totalPurchase += g.totalPurchaseAmount;
      totalDocs += g.docCount;
    }

    const totalRevenue = totalNet - totalPurchase;
    const avgMarkup = totalPurchase > 0 ? (totalRevenue / totalPurchase) * 100 : null;

    return {
      articlesCount: groups.length,
      totalQty,
      totalNet,
      totalPurchase,
      totalRevenue,
      avgMarkup,
      totalDocs,
    };
  }, [groups]);

  const handleSort = (field: ResocontoSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "description" ? "asc" : "desc");
    }
  };

  const renderSortIndicator = (field: ResocontoSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 opacity-25 group-hover:opacity-75 transition-opacity shrink-0 ml-1" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3 text-[var(--primary)] shrink-0 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[var(--primary)] shrink-0 ml-1" />
    );
  };

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Suddivisione dinamica in pagine A4 Portrait (verticali)
  const pageChunks = useMemo(() => {
    if (sortedGroups.length <= 20) {
      return [sortedGroups];
    }
    const chunks: ArticleResocontoGroup[][] = [];
    chunks.push(sortedGroups.slice(0, 20));
    let start = 20;
    const PER_PAGE = 26;
    while (start < sortedGroups.length) {
      chunks.push(sortedGroups.slice(start, start + PER_PAGE));
      start += PER_PAGE;
    }
    return chunks;
  }, [sortedGroups]);

  const handleExportPdf = async () => {
    const pageElements = Array.from(
      pagesContainerRef.current?.querySelectorAll(".resoconto-a4-page") || []
    ) as HTMLElement[];

    if (pageElements.length === 0) return;
    setIsExporting(true);
    setExportNotice(null);
    try {
      const clientTitle = isAllClients ? "Tutti_i_Clienti" : clientName || "Cliente";
      const yearTitle = selectedYear !== "all" ? `Anno_${selectedYear}` : "Tutti_gli_Anni";
      const res = await exportResocontoPdfToDesktop({
        pageElements,
        clientTitle,
        yearTitle,
      });
      setExportNotice(
        `PDF verticale generato (${res.totalPages} ${res.totalPages === 1 ? "pagina" : "pagine"}) sul Desktop: ${res.filename}`
      );
      setTimeout(() => setExportNotice(null), 7000);
    } catch (err) {
      console.error("Errore esportazione PDF resoconto:", err);
      setExportNotice(err instanceof Error ? err.message : "Errore durante il salvataggio del PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[var(--card)] text-[var(--foreground)]">
      {/* Toolbar specifica del Resoconto */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--background)]/75 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Pulsante Toggle Accorpa Varianti */}
          <button
            type="button"
            onClick={onToggleMergeVariants}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shadow-sm ${
              mergeVariants
                ? "border-sky-500/50 bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 ring-1 ring-sky-500/30"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]"
            }`}
            title="Unifica le descrizioni con variazioni minori, sinonimi (ZN/Zincata, BR/Bronzata, TROP) e sigle di imballo"
          >
            <Sparkles className="h-3.5 w-3.5 text-sky-400" />
            <span>Accorpa varianti simili</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${mergeVariants ? "bg-sky-500/30 text-white" : "bg-zinc-800 text-zinc-400"}`}>
              {mergeVariants ? "ATTIVO" : "DISATTIVO"}
            </span>
          </button>

          <span className="text-xs text-[var(--muted-foreground)] border-l border-[var(--border)] pl-2.5">
            {groups.length} {groups.length === 1 ? "articolo distinto" : "articoli distinti"}
            {mergeVariants && (
              <span className="text-sky-400/80 ml-1 font-medium">
                (da {rows.length} movimenti grezzi)
              </span>
            )}
          </span>
        </div>

        {/* Pulsanti Azione: Esporta PDF e Stampa */}
        <div className="flex items-center gap-2">
          {exportNotice && (
            <div className="flex items-center gap-1.5 rounded bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs text-emerald-400 animate-in fade-in">
              <Check className="h-3.5 w-3.5" />
              <span className="font-medium max-w-xs truncate">{exportNotice}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting || groups.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--primary)]/40 bg-[var(--primary)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-all cursor-pointer shadow-sm disabled:opacity-40"
            title="Genera ed esporta il PDF del resoconto sul Desktop"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>{isExporting ? "Generazione PDF…" : "Esporta PDF Resoconto"}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={groups.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-all cursor-pointer shadow-sm"
            title="Stampa il resoconto su stampante"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Stampa</span>
          </button>
        </div>
      </div>

      {/* KPI Globali del Resoconto */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--background)]/40 px-5 py-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
        <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="text-[10px] text-[var(--muted-foreground)] font-medium">Voci Articolo</div>
          <div className="text-base font-bold text-[var(--foreground)]">{overallTotals.articlesCount}</div>
        </div>

        <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="text-[10px] text-[var(--muted-foreground)] font-medium">Quantità Totale</div>
          <div className="text-base font-bold text-sky-400">
            {overallTotals.totalQty.toLocaleString("it-IT", { maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="text-[10px] text-[var(--muted-foreground)] font-medium">Fatturato Netto</div>
          <div className="text-base font-bold text-[var(--foreground)]">
            {formatDdtMoney(overallTotals.totalNet)}
          </div>
        </div>

        <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="text-[10px] text-[var(--muted-foreground)] font-medium">Costo Acquisto Tot.</div>
          <div className="text-base font-bold text-[var(--muted-foreground)]">
            {formatDdtMoney(overallTotals.totalPurchase)}
          </div>
        </div>

        <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="text-[10px] text-[var(--muted-foreground)] font-medium">Margine Totale €</div>
          <div className={`text-base font-bold ${overallTotals.totalRevenue >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {formatDdtMoney(overallTotals.totalRevenue)}
          </div>
        </div>

        <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="text-[10px] text-[var(--muted-foreground)] font-medium">Ricarico Medio Tot.</div>
          <div className={`text-base font-bold ${overallTotals.totalRevenue >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {formatDdtPercent(overallTotals.avgMarkup)}
          </div>
        </div>
      </div>

      {/* Tabella interattiva Resoconto */}
      <div className="flex-1 min-h-0 overflow-auto bg-[var(--card)]">
        {groups.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-[var(--muted-foreground)]">
            Nessun articolo corrispondente ai filtri impostati.
          </div>
        ) : (
          <table className="w-full min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)] text-[11px] font-semibold text-[var(--muted-foreground)] select-none">
              <tr>
                {/* DESCRIZIONE */}
                <th
                  onClick={() => handleSort("description")}
                  className="px-4 py-2.5 text-left cursor-pointer group hover:text-[var(--foreground)] transition-colors min-w-[280px]"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>DESCRIZIONE ARTICOLO</span>
                    {renderSortIndicator("description")}
                  </div>
                </th>

                {/* QUANTITÀ TOT. */}
                <th
                  onClick={() => handleSort("quantity")}
                  className="px-3 py-2.5 text-right w-28 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                >
                  <div className="inline-flex items-center justify-end gap-1 w-full">
                    <span>Q.TÀ TOT.</span>
                    {renderSortIndicator("quantity")}
                  </div>
                </th>

                {/* N° DDT */}
                <th
                  onClick={() => handleSort("docCount")}
                  className="px-2 py-2.5 text-center w-20 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                >
                  <div className="inline-flex items-center justify-center gap-1 w-full">
                    <span>N° DDT</span>
                    {renderSortIndicator("docCount")}
                  </div>
                </th>

                {/* PREZZO NETTO (MEDIO, MIN, MAX) */}
                <th
                  onClick={() => handleSort("netPriceAvg")}
                  className="px-3 py-2.5 text-right w-44 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                >
                  <div className="inline-flex items-center justify-end gap-1 w-full">
                    <span>PREZZO NETTO (MED / MIN-MAX)</span>
                    {renderSortIndicator("netPriceAvg")}
                  </div>
                </th>

                {/* ULTIMO PREZZO */}
                <th
                  onClick={() => handleSort("lastNetPrice")}
                  className="px-3 py-2.5 text-right w-36 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                >
                  <div className="inline-flex items-center justify-end gap-1 w-full">
                    <span>ULTIMO NETTO</span>
                    {renderSortIndicator("lastNetPrice")}
                  </div>
                </th>

                {/* COSTO ACQUISTO (MEDIO, MIN, MAX) */}
                <th
                  onClick={() => handleSort("purchasePriceAvg")}
                  className="px-3 py-2.5 text-right w-40 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                >
                  <div className="inline-flex items-center justify-end gap-1 w-full">
                    <span>COSTO ACQ. (MED / MIN-MAX)</span>
                    {renderSortIndicator("purchasePriceAvg")}
                  </div>
                </th>

                {/* RICARICO % (MEDIO, MIN, MAX) */}
                <th
                  onClick={() => handleSort("markupAvg")}
                  className="px-3 py-2.5 text-right w-36 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                >
                  <div className="inline-flex items-center justify-end gap-1 w-full">
                    <span>RICARICO % (MED / RANGE)</span>
                    {renderSortIndicator("markupAvg")}
                  </div>
                </th>

                {/* MARGINE € */}
                <th
                  onClick={() => handleSort("totalRevenue")}
                  className="px-3 py-2.5 text-right w-32 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                >
                  <div className="inline-flex items-center justify-end gap-1 w-full">
                    <span>MARGINE €</span>
                    {renderSortIndicator("totalRevenue")}
                  </div>
                </th>

                {/* FATTURATO NETTO */}
                <th
                  onClick={() => handleSort("totalNetAmount")}
                  className="px-4 py-2.5 text-right w-36 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                >
                  <div className="inline-flex items-center justify-end gap-1 w-full">
                    <span>TOT. NETTO</span>
                    {renderSortIndicator("totalNetAmount")}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
              {sortedGroups.map((g) => {
                const isExpanded = expandedKeys.has(g.key);
                const hasMultipleVariants = g.originalDescriptions.length > 1;
                const isPositiveRev = g.totalRevenue > 0;
                const isNegativeRev = g.totalRevenue < 0;

                return (
                  <React.Fragment key={g.key}>
                    <tr className="hover:bg-[var(--background)]/60 transition-colors">
                      {/* Descrizione Articolo */}
                      <td className="px-4 py-2.5 font-sans font-medium text-[var(--foreground)]">
                        <div className="flex items-start gap-2">
                          {hasMultipleVariants && (
                            <button
                              type="button"
                              onClick={() => toggleExpand(g.key)}
                              className="text-[var(--muted-foreground)] hover:text-[var(--primary)] mt-0.5 cursor-pointer"
                              title="Mostra varianti originali accorpate"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          <div>
                            <div className="font-semibold text-[var(--foreground)]">
                              {g.canonicalDescription}
                            </div>
                            {hasMultipleVariants && (
                              <div className="text-[10px] text-sky-400 font-sans mt-0.5 flex items-center gap-1">
                                <Layers className="h-3 w-3" />
                                <span>{g.originalDescriptions.length} varianti accorpate</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Quantità Totale */}
                      <td className="px-3 py-2.5 text-right font-bold text-[var(--foreground)] whitespace-nowrap">
                        {g.totalQuantity.toLocaleString("it-IT", { maximumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-[var(--muted-foreground)] font-normal">{g.unit}</span>
                      </td>

                      {/* N° DDT */}
                      <td className="px-2 py-2.5 text-center font-semibold text-[var(--muted-foreground)]">
                        {g.docCount}
                      </td>

                      {/* Prezzo Netto (Medio / Min - Max) */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="font-bold text-sky-400">
                          {formatDdtMoney(Math.round(g.netPriceAvg))}
                        </div>
                        {g.netPriceMin !== g.netPriceMax && (
                          <div className="text-[10px] text-[var(--muted-foreground)] font-sans">
                            {formatDdtMoney(Math.round(g.netPriceMin))} ~ {formatDdtMoney(Math.round(g.netPriceMax))}
                          </div>
                        )}
                      </td>

                      {/* Ultimo Prezzo Netto */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="font-semibold text-[var(--foreground)]">
                          {formatDdtMoney(Math.round(g.lastNetPrice))}
                        </div>
                        <div className="text-[10px] text-[var(--muted-foreground)] font-sans">
                          {formatDdtViewDate(g.lastDate)}
                        </div>
                      </td>

                      {/* Costo Acquisto (Medio / Min - Max) */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="text-[var(--muted-foreground)] font-medium">
                          {g.purchasePriceAvg > 0 ? formatDdtMoney(Math.round(g.purchasePriceAvg)) : "—"}
                        </div>
                        {g.purchasePriceMin > 0 && g.purchasePriceMin !== g.purchasePriceMax && (
                          <div className="text-[10px] text-[var(--muted-foreground)]/70 font-sans">
                            {formatDdtMoney(Math.round(g.purchasePriceMin))} ~ {formatDdtMoney(Math.round(g.purchasePriceMax))}
                          </div>
                        )}
                      </td>

                      {/* Ricarico % (Medio / Range) */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div
                          className={`font-semibold ${
                            isPositiveRev ? "text-emerald-400" : isNegativeRev ? "text-rose-400" : "text-[var(--muted-foreground)]"
                          }`}
                        >
                          {formatDdtPercent(g.markupAvgPercent)}
                        </div>
                        {g.markupMinPercent !== null && g.markupMinPercent !== g.markupMaxPercent && (
                          <div className="text-[10px] text-[var(--muted-foreground)] font-sans">
                            {formatDdtPercent(g.markupMinPercent)} ~ {formatDdtPercent(g.markupMaxPercent)}
                          </div>
                        )}
                      </td>

                      {/* Margine € */}
                      <td
                        className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${
                          isPositiveRev ? "text-emerald-400" : isNegativeRev ? "text-rose-400" : "text-[var(--muted-foreground)]"
                        }`}
                      >
                        {formatDdtMoney(g.totalRevenue)}
                      </td>

                      {/* Fatturato Netto */}
                      <td className="px-4 py-2.5 text-right font-bold text-[var(--foreground)] whitespace-nowrap">
                        {formatDdtMoney(g.totalNetAmount)}
                      </td>
                    </tr>

                    {/* Riga dettagli espandibile con le varianti originali grezze */}
                    {isExpanded && hasMultipleVariants && (
                      <tr className="bg-[var(--background)]/30">
                        <td colSpan={9} className="px-6 py-2 border-l-2 border-sky-500/60 font-sans text-xs">
                          <div className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                            Descrizioni originali presenti nei DDT per questa voce:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {g.originalDescriptions.map((desc, i) => (
                              <span
                                key={i}
                                className="rounded bg-[var(--card)] border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--foreground)] font-medium"
                              >
                                {desc}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ELEMENTI MULTIPAGINA A4 PORTRAIT NEL PORTALE DEDICATO ALLA STAMPA (PORTAL SU BODY) */}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            id="resoconto-print-portal"
            ref={pagesContainerRef}
            style={{
              position: "fixed",
              left: "-99999px",
              top: 0,
              width: "210mm",
              pointerEvents: "none",
              zIndex: -99999,
            }}
          >
            {pageChunks.map((chunk, pageIndex) => {
              const isFirstPage = pageIndex === 0;
              const isLastPage = pageIndex === pageChunks.length - 1;
              const totalPages = pageChunks.length;

              return (
                <div
                  key={pageIndex}
                  className="resoconto-a4-page"
                  style={{
                    width: "210mm",
                    minHeight: "297mm",
                    height: "297mm",
                    maxHeight: "297mm",
                    backgroundColor: "#ffffff",
                    color: "#111827",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    padding: "7mm 10mm 8mm 10mm",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    marginBottom: "20px",
                  }}
                >
              {/* Contenuto Superiore */}
              <div>
                {/* Intestazione */}
                {isFirstPage ? (
                  <>
                    <div className="flex items-center justify-between border-b-2 border-zinc-800 pb-3 mb-3">
                      <div>
                        <div className="text-xl font-black uppercase tracking-tight text-zinc-900">
                          Resoconto Storico Articoli
                        </div>
                        <div className="text-[11px] text-zinc-600 mt-0.5 font-medium">
                          Cliente: <strong className="text-zinc-900">{isAllClients ? "TUTTI I CLIENTI" : clientName || "Generale"}</strong>
                          {" | "}
                          Periodo: <strong className="text-zinc-900">{selectedYear !== "all" ? `Anno ${selectedYear}` : "Tutti gli anni"}</strong>
                          {searchTerm && (
                            <>
                              {" | "}
                              Filtro: <strong className="text-zinc-900">{searchTerm}</strong>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-[10px] text-zinc-500">
                        <div>Data emissione: <strong>{new Date().toLocaleDateString("it-IT")}</strong></div>
                        <div>Modalità: <strong>{mergeVariants ? "Varianti Accorpate" : "Descrizioni Esatte"}</strong></div>
                      </div>
                    </div>

                    {/* Riquadri KPI compatti in testata su pagina 1 */}
                    <div className="grid grid-cols-5 gap-2 mb-4 text-xs">
                      <div className="border border-zinc-200 rounded p-2 bg-zinc-50">
                        <div className="text-zinc-500 text-[9px] uppercase font-bold">Articoli Unificati</div>
                        <div className="text-base font-black text-zinc-900">{overallTotals.articlesCount}</div>
                      </div>
                      <div className="border border-zinc-200 rounded p-2 bg-zinc-50">
                        <div className="text-zinc-500 text-[9px] uppercase font-bold">Quantità Totale</div>
                        <div className="text-base font-black text-zinc-900">
                          {overallTotals.totalQty.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                        </div>
                      </div>
                      <div className="border border-zinc-200 rounded p-2 bg-zinc-50">
                        <div className="text-zinc-500 text-[9px] uppercase font-bold">Fatturato Netto</div>
                        <div className="text-base font-black text-zinc-900">{formatDdtMoney(overallTotals.totalNet)}</div>
                      </div>
                      <div className="border border-zinc-200 rounded p-2 bg-zinc-50">
                        <div className="text-zinc-500 text-[9px] uppercase font-bold">Margine Totale €</div>
                        <div className="text-base font-black text-emerald-700">{formatDdtMoney(overallTotals.totalRevenue)}</div>
                      </div>
                      <div className="border border-zinc-200 rounded p-2 bg-zinc-50">
                        <div className="text-zinc-500 text-[9px] uppercase font-bold">Ricarico Medio %</div>
                        <div className="text-base font-black text-emerald-700">{formatDdtPercent(overallTotals.avgMarkup)}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between border-b border-zinc-400 pb-2 mb-3 text-[11px] text-zinc-600">
                    <span className="font-bold uppercase tracking-wider text-zinc-800">
                      Resoconto Storico Articoli — {isAllClients ? "Tutti i Clienti" : clientName} (Seguito)
                    </span>
                    <span className="font-medium text-zinc-500">
                      Pagina {pageIndex + 1} di {totalPages}
                    </span>
                  </div>
                )}

                {/* Tabella stampabile a piena larghezza per questo chunk di pagina */}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b-2 border-zinc-700 bg-zinc-100 text-zinc-800 text-left font-bold text-[9.5px]">
                      <th className="py-1.5 px-2">Descrizione Articolo</th>
                      <th className="py-1.5 px-1.5 text-right w-16">Q.tà Tot.</th>
                      <th className="py-1.5 px-1 text-center w-10">DDT</th>
                      <th className="py-1.5 px-1.5 text-right w-18">Netto Med.</th>
                      <th className="py-1.5 px-1.5 text-right w-24">Range Netto</th>
                      <th className="py-1.5 px-1.5 text-right w-18">Ultimo Netto</th>
                      <th className="py-1.5 px-1.5 text-right w-16">Costo Acq.</th>
                      <th className="py-1.5 px-1 text-right w-12">Ric. %</th>
                      <th className="py-1.5 px-1.5 text-right w-16">Margine €</th>
                      <th className="py-1.5 px-2 text-right w-20">Tot. Netto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {chunk.map((g, idx) => (
                      <tr key={idx} className={idx % 2 === 1 ? "bg-zinc-50/70" : ""}>
                        <td className="py-1.5 px-2 font-semibold text-zinc-900 leading-tight">
                          {g.canonicalDescription}
                          {g.originalDescriptions.length > 1 && (
                            <span className="text-[8.5px] text-zinc-500 font-normal ml-1">
                              ({g.originalDescriptions.length} var.)
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-1.5 text-right font-bold text-zinc-900 whitespace-nowrap">
                          {g.totalQuantity.toLocaleString("it-IT", { maximumFractionDigits: 1 })} {g.unit}
                        </td>
                        <td className="py-1.5 px-1 text-center text-zinc-600 font-mono">{g.docCount}</td>
                        <td className="py-1.5 px-1.5 text-right font-bold text-zinc-900 whitespace-nowrap">
                          {formatDdtMoney(Math.round(g.netPriceAvg))}
                        </td>
                        <td className="py-1.5 px-1.5 text-right text-zinc-500 text-[9px] whitespace-nowrap">
                          {formatDdtMoney(Math.round(g.netPriceMin))}~{formatDdtMoney(Math.round(g.netPriceMax))}
                        </td>
                        <td className="py-1.5 px-1.5 text-right font-medium text-zinc-700 whitespace-nowrap">
                          {formatDdtMoney(Math.round(g.lastNetPrice))}
                        </td>
                        <td className="py-1.5 px-1.5 text-right text-zinc-600 whitespace-nowrap">
                          {g.purchasePriceAvg > 0 ? formatDdtMoney(Math.round(g.purchasePriceAvg)) : "—"}
                        </td>
                        <td className="py-1.5 px-1 text-right font-medium text-zinc-800 whitespace-nowrap">
                          {formatDdtPercent(g.markupAvgPercent)}
                        </td>
                        <td className="py-1.5 px-1.5 text-right font-bold text-emerald-700 whitespace-nowrap">
                          {formatDdtMoney(g.totalRevenue)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-black text-zinc-900 whitespace-nowrap">
                          {formatDdtMoney(g.totalNetAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totali in calce solo sull'ultima pagina */}
                  {isLastPage && (
                    <tfoot>
                      <tr className="border-t-2 border-zinc-800 bg-zinc-100 font-bold text-zinc-900 text-[10px]">
                        <td className="py-1.5 px-2">TOTALI GENERALI</td>
                        <td className="py-1.5 px-1.5 text-right">
                          {overallTotals.totalQty.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                        </td>
                        <td className="py-1.5 px-1 text-center">{overallTotals.totalDocs}</td>
                        <td colSpan={5} className="py-1.5 px-1 text-right text-zinc-500 text-[9px]">
                          Margine Totale:
                        </td>
                        <td className="py-1.5 px-1.5 text-right text-emerald-800 font-black">
                          {formatDdtMoney(overallTotals.totalRevenue)}
                        </td>
                        <td className="py-1.5 px-2 text-right text-zinc-950 font-black">
                          {formatDdtMoney(overallTotals.totalNet)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Piè di pagina fisso per ciascuna pagina A4 */}
              <div className="pt-2 border-t border-zinc-300 text-[9px] text-zinc-500 flex justify-between items-center">
                <span>Gestionale Last — Modulo Storico Articoli DDT</span>
                <span>
                  Pagina <strong className="text-zinc-700">{pageIndex + 1}</strong> di <strong className="text-zinc-700">{totalPages}</strong>
                </span>
                <span>Emesso il {new Date().toLocaleString("it-IT")}</span>
              </div>
            </div>
          );
        })}
      </div>,
      document.body
    )}
    </div>
  );
};

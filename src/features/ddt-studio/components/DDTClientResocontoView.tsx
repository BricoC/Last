import React, { useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { 
  FileDown, 
  Printer, 
  ArrowUp, 
  ArrowDown, 
  ArrowUpDown, 
  ChevronDown, 
  ChevronRight,
  Sparkles,
  Check,
  Package,
  UserCheck,
  Eye,
  EyeOff,
  ChevronsUpDown,
  RotateCcw
} from "lucide-react";
import { type ClientArticleHistoryRow } from "../services/ddtReadModelsRepository";
import { formatDdtMoney, formatDdtPercent, formatDdtViewDate } from "../services/ddtViewFormatting";
import { normalizeArticleDescription } from "../utils/articleDescriptionNormalizer";
import { exportResocontoPdfToDesktop } from "../utils/resocontoExportManager";

export interface DDTClientResocontoViewProps {
  rows: ClientArticleHistoryRow[];
  selectedYear: string;
  searchTerm: string;
  mergeVariants: boolean;
  onToggleMergeVariants: () => void;
  onSelectClient?: (clientName: string) => void;
}

export interface ClientArticleItem {
  canonicalDescription: string;
  originalDescriptions: string[];
  unit: string;
  quantity: number;
  docCount: number;
  netPriceAvg: number;
  netPriceMin: number;
  netPriceMax: number;
  lastNetPrice: number;
  lastDate: string;
  totalNetAmount: number;
  totalPurchaseAmount: number;
  totalRevenue: number;
  markupAvgPercent: number | null;
  percentageOfClientTotal: number;
}

export interface ClientResocontoGroup {
  clientName: string;
  totalQuantity: number;
  docCount: number;
  articlesCount: number;
  lastDate: string;
  totalNetAmount: number;
  totalPurchaseAmount: number;
  totalRevenue: number;
  markupAvgPercent: number | null;
  articles: ClientArticleItem[];
}

type ClientSortField =
  | "clientName"
  | "totalQuantity"
  | "docCount"
  | "articlesCount"
  | "totalRevenue"
  | "totalNetAmount"
  | "markupAvgPercent"
  | "lastDate";

export const DDTClientResocontoView: React.FC<DDTClientResocontoViewProps> = ({
  rows,
  selectedYear,
  searchTerm,
  mergeVariants,
  onToggleMergeVariants,
  onSelectClient,
}) => {
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [excludedClients, setExcludedClients] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<ClientSortField>("totalNetAmount");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const pagesContainerRef = useRef<HTMLDivElement>(null);

  const toggleExclude = (client: string) => {
    setExcludedClients((prev) => {
      const next = new Set(prev);
      if (next.has(client)) next.delete(client);
      else next.add(client);
      return next;
    });
  };

  const resetExclusions = () => setExcludedClients(new Set());

  // Raggruppamento per Cliente
  const clientGroups = useMemo<ClientResocontoGroup[]>(() => {
    const clientMap = new Map<
      string,
      {
        clientName: string;
        totalQuantity: number;
        docCount: number;
        totalNetAmount: number;
        totalPurchaseAmount: number;
        lastDate: string;
        articlesMap: Map<
          string,
          {
            canonicalDescription: string;
            originalDescSet: Set<string>;
            unit: string;
            quantity: number;
            docCount: number;
            totalNetAmount: number;
            totalPurchaseAmount: number;
            netPrices: number[];
            purchasePrices: number[];
            markupPercents: number[];
            lastDate: string;
            lastNetPrice: number;
          }
        >;
      }
    >();

    for (const r of rows) {
      const clientName = (r.client || "CLIENTE SCONOSCIUTO").trim();
      let cGroup = clientMap.get(clientName);
      if (!cGroup) {
        cGroup = {
          clientName,
          totalQuantity: 0,
          docCount: 0,
          totalNetAmount: 0,
          totalPurchaseAmount: 0,
          lastDate: r.date,
          articlesMap: new Map(),
        };
        clientMap.set(clientName, cGroup);
      }

      const canonical = mergeVariants
        ? normalizeArticleDescription(r.description) || r.description.trim().toUpperCase()
        : r.description.trim().toUpperCase();

      const artKey = canonical || "SENZA DESCRIZIONE";

      let aItem = cGroup.articlesMap.get(artKey);
      if (!aItem) {
        aItem = {
          canonicalDescription: canonical,
          originalDescSet: new Set(),
          unit: r.unit || "NR",
          quantity: 0,
          docCount: 0,
          totalNetAmount: 0,
          totalPurchaseAmount: 0,
          netPrices: [],
          purchasePrices: [],
          markupPercents: [],
          lastDate: r.date,
          lastNetPrice: 0,
        };
        cGroup.articlesMap.set(artKey, aItem);
      }

      if (r.description) aItem.originalDescSet.add(r.description.trim());

      const qty = parseFloat(r.quantity.replace(",", ".")) || 0;
      const unitNet = qty > 0 ? r.netAmountSubunits / qty : r.unitPriceSubunits;
      const purchaseUnit = r.purchasePriceSubunits || 0;

      // Aggiorna totali cliente
      cGroup.totalQuantity += qty;
      cGroup.docCount += 1;
      cGroup.totalNetAmount += r.netAmountSubunits;
      cGroup.totalPurchaseAmount += Math.round(purchaseUnit * qty);
      if (!cGroup.lastDate || (r.date && r.date >= cGroup.lastDate)) {
        cGroup.lastDate = r.date;
      }

      // Aggiorna totali articolo per questo cliente
      aItem.quantity += qty;
      aItem.docCount += 1;
      aItem.totalNetAmount += r.netAmountSubunits;
      aItem.totalPurchaseAmount += Math.round(purchaseUnit * qty);
      if (unitNet > 0) aItem.netPrices.push(unitNet);
      if (purchaseUnit > 0) aItem.purchasePrices.push(purchaseUnit);
      if (r.markupPercent !== null && r.markupPercent !== undefined) {
        aItem.markupPercents.push(r.markupPercent);
      }
      if (!aItem.lastDate || (r.date && r.date >= aItem.lastDate)) {
        aItem.lastDate = r.date;
        aItem.lastNetPrice = unitNet;
      }
    }

    return Array.from(clientMap.values()).map((c) => {
      const totalRevenue = c.totalNetAmount - c.totalPurchaseAmount;
      const markupAvgPercent =
        c.totalPurchaseAmount > 0 ? (totalRevenue / c.totalPurchaseAmount) * 100 : null;

      const articles: ClientArticleItem[] = Array.from(c.articlesMap.values()).map((a) => {
        const netPriceAvg = a.quantity > 0 ? a.totalNetAmount / a.quantity : 0;
        const netPriceMin = a.netPrices.length ? Math.min(...a.netPrices) : 0;
        const netPriceMax = a.netPrices.length ? Math.max(...a.netPrices) : 0;
        const aRevenue = a.totalNetAmount - a.totalPurchaseAmount;
        const aMarkup = a.totalPurchaseAmount > 0 ? (aRevenue / a.totalPurchaseAmount) * 100 : null;
        const percentageOfClientTotal =
          c.totalNetAmount > 0 ? (a.totalNetAmount / c.totalNetAmount) * 100 : 0;

        return {
          canonicalDescription: a.canonicalDescription,
          originalDescriptions: Array.from(a.originalDescSet),
          unit: a.unit,
          quantity: a.quantity,
          docCount: a.docCount,
          netPriceAvg,
          netPriceMin,
          netPriceMax,
          lastNetPrice: a.lastNetPrice,
          lastDate: a.lastDate,
          totalNetAmount: a.totalNetAmount,
          totalPurchaseAmount: a.totalPurchaseAmount,
          totalRevenue: aRevenue,
          markupAvgPercent: aMarkup,
          percentageOfClientTotal,
        };
      });

      // Ordina gli articoli del cliente per fatturato decrescente
      articles.sort((a, b) => b.totalNetAmount - a.totalNetAmount);

      return {
        clientName: c.clientName,
        totalQuantity: c.totalQuantity,
        docCount: c.docCount,
        articlesCount: articles.length,
        lastDate: c.lastDate,
        totalNetAmount: c.totalNetAmount,
        totalPurchaseAmount: c.totalPurchaseAmount,
        totalRevenue,
        markupAvgPercent,
        articles,
      };
    });
  }, [rows, mergeVariants]);

  // Ordinamento clienti
  const sortedClients = useMemo(() => {
    const mult = sortDirection === "asc" ? 1 : -1;
    return [...clientGroups].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "clientName":
          cmp = a.clientName.localeCompare(b.clientName);
          break;
        case "totalQuantity":
          cmp = a.totalQuantity - b.totalQuantity;
          break;
        case "docCount":
          cmp = a.docCount - b.docCount;
          break;
        case "articlesCount":
          cmp = a.articlesCount - b.articlesCount;
          break;
        case "totalRevenue":
          cmp = a.totalRevenue - b.totalRevenue;
          break;
        case "totalNetAmount":
          cmp = a.totalNetAmount - b.totalNetAmount;
          break;
        case "markupAvgPercent":
          cmp = (a.markupAvgPercent ?? -999999) - (b.markupAvgPercent ?? -999999);
          break;
        case "lastDate":
          cmp = a.lastDate.localeCompare(b.lastDate);
          break;
      }
      return cmp * mult;
    });
  }, [clientGroups, sortField, sortDirection]);

  // Clienti attivi (escludendo le righe disattivate dall'utente)
  const activeClients = useMemo(() => {
    return clientGroups.filter((c) => !excludedClients.has(c.clientName));
  }, [clientGroups, excludedClients]);

  const activeSortedClients = useMemo(() => {
    return sortedClients.filter((c) => !excludedClients.has(c.clientName));
  }, [sortedClients, excludedClients]);

  // Totali globali calcolati esclusivamente sui clienti attivi
  const totals = useMemo(() => {
    let totalQty = 0;
    let totalNet = 0;
    let totalPurchase = 0;
    let totalDocs = 0;

    for (const c of activeClients) {
      totalQty += c.totalQuantity;
      totalNet += c.totalNetAmount;
      totalPurchase += c.totalPurchaseAmount;
      totalDocs += c.docCount;
    }

    const totalRevenue = totalNet - totalPurchase;
    const avgMarkup = totalPurchase > 0 ? (totalRevenue / totalPurchase) * 100 : null;

    return {
      clientsCount: activeClients.length,
      totalQty,
      totalNet,
      totalPurchase,
      totalRevenue,
      avgMarkup,
      totalDocs,
    };
  }, [activeClients]);

  const allExpanded = clientGroups.length > 0 && clientGroups.every((c) => expandedClients.has(c.clientName));
  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedClients(new Set());
    } else {
      setExpandedClients(new Set(clientGroups.map((c) => c.clientName)));
    }
  };

  // Paginazione A4 Portrait per PDF/stampa con tabelle articoli APERTE
  const pageChunks = useMemo(() => {
    if (activeSortedClients.length === 0) return [[]];

    const chunks: ClientResocontoGroup[][] = [];
    let currentChunk: ClientResocontoGroup[] = [];
    let currentUnits = 0;
    let isFirstPage = true;
    const PAGE1_LIMIT = 20;
    const PAGE_LIMIT = 26;

    for (const c of activeSortedClients) {
      const articlesCount = c.articles.length;
      // Costo: riga cliente + testata articoli + righe articoli
      const itemUnits = Math.max(2, 2.2 + articlesCount * 0.85);
      const limit = isFirstPage ? PAGE1_LIMIT : PAGE_LIMIT;

      if (currentChunk.length > 0 && currentUnits + itemUnits > limit) {
        chunks.push(currentChunk);
        currentChunk = [c];
        currentUnits = itemUnits;
        isFirstPage = false;
      } else {
        currentChunk.push(c);
        currentUnits += itemUnits;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [[]];
  }, [activeSortedClients]);

  const handleSort = (field: ClientSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "clientName" ? "asc" : "desc");
    }
  };

  const renderSortIndicator = (field: ClientSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 opacity-25 group-hover:opacity-75 transition-opacity shrink-0 ml-1" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3 text-[var(--primary)] shrink-0 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[var(--primary)] shrink-0 ml-1" />
    );
  };

  const toggleExpand = (client: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(client)) next.delete(client);
      else next.add(client);
      return next;
    });
  };

  const handleExportPdf = async () => {
    const pageElements = Array.from(
      pagesContainerRef.current?.querySelectorAll(".resoconto-a4-page") || []
    ) as HTMLElement[];

    if (pageElements.length === 0) return;
    setIsExporting(true);
    setExportNotice(null);
    try {
      const yearTitle = selectedYear !== "all" ? `Anno_${selectedYear}` : "Tutti_gli_Anni";
      const res = await exportResocontoPdfToDesktop({
        pageElements,
        clientTitle: "Riepilogo_Vendite_per_Cliente",
        yearTitle,
      });
      setExportNotice(
        `PDF Clienti generato (${res.totalPages} ${res.totalPages === 1 ? "pagina" : "pagine"}) sul Desktop: ${res.filename}`
      );
      setTimeout(() => setExportNotice(null), 7000);
    } catch (err) {
      console.error("Errore esportazione PDF resoconto clienti:", err);
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
      {/* Toolbar specifica del Resoconto Clienti */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--background)]/75 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Toggle Accorpa Varianti */}
          <button
            type="button"
            onClick={onToggleMergeVariants}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shadow-sm ${
              mergeVariants
                ? "border-sky-500/50 bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 ring-1 ring-sky-500/30"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]"
            }`}
            title="Unifica le descrizioni degli articoli per ciascun cliente"
          >
            <Sparkles className="h-3.5 w-3.5 text-sky-400" />
            <span>Accorpa varianti simili</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${mergeVariants ? "bg-sky-500/30 text-white" : "bg-zinc-800 text-zinc-400"}`}>
              {mergeVariants ? "ATTIVO" : "DISATTIVO"}
            </span>
          </button>

          {/* Toggle Espandi / Chiudi tutto */}
          <button
            type="button"
            onClick={toggleExpandAll}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-all cursor-pointer shadow-sm"
            title={allExpanded ? "Comprimi tutte le sezioni" : "Espandi tutte le tabelle"}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
            <span>{allExpanded ? "Chiudi tutte" : "Espandi tutte"}</span>
          </button>

          {/* Badge Clienti Esclusi con Ripristina */}
          {excludedClients.size > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs text-amber-400">
              <EyeOff className="h-3.5 w-3.5" />
              <span className="font-semibold">
                {excludedClients.size} {excludedClients.size === 1 ? "cliente escluso" : "clienti esclusi"}
              </span>
              <button
                type="button"
                onClick={resetExclusions}
                className="flex items-center gap-1 text-[11px] font-bold text-amber-300 hover:text-white underline cursor-pointer ml-1"
                title="Ripristina tutti i clienti esclusi nel calcolo e nella stampa"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Ripristina</span>
              </button>
            </div>
          )}

          <span className="text-xs text-[var(--muted-foreground)] border-l border-[var(--border)] pl-2.5">
            <strong>{activeClients.length}</strong> / {clientGroups.length} clienti attivi
            {excludedClients.size > 0 && (
              <span className="text-amber-400/80 ml-1 font-medium">({excludedClients.size} esclusi)</span>
            )}
          </span>
        </div>

        {/* Pulsanti Azione */}
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
            disabled={isExporting || clientGroups.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--primary)]/40 bg-[var(--primary)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-all cursor-pointer shadow-sm disabled:opacity-40"
            title="Genera ed esporta il PDF della classifica clienti sul Desktop"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>{isExporting ? "Generazione PDF…" : "Esporta PDF Clienti"}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={clientGroups.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-all cursor-pointer shadow-sm"
            title="Stampa il resoconto su stampante"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Stampa</span>
          </button>
        </div>
      </div>

      {/* KPI Globali Clienti */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--background)]/40 px-5 py-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
        <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="text-[10px] text-[var(--muted-foreground)] font-medium">Clienti Totali</div>
          <div className="text-base font-bold text-[var(--foreground)]">{totals.clientsCount}</div>
        </div>

        <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="text-[10px] text-[var(--muted-foreground)] font-medium">Quantità Complessiva</div>
          <div className="text-base font-bold text-sky-400">
            {totals.totalQty.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
          </div>
        </div>

        <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="text-[10px] text-[var(--muted-foreground)] font-medium">Fatturato Netto</div>
          <div className="text-base font-bold text-[var(--foreground)]">
            {formatDdtMoney(totals.totalNet)}
          </div>
        </div>

        <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="text-[10px] text-[var(--muted-foreground)] font-medium">Costo Acquisto Tot.</div>
          <div className="text-base font-bold text-[var(--muted-foreground)]">
            {formatDdtMoney(totals.totalPurchase)}
          </div>
        </div>

        <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="text-[10px] text-[var(--muted-foreground)] font-medium">Margine Totale €</div>
          <div className={`text-base font-bold ${totals.totalRevenue >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {formatDdtMoney(totals.totalRevenue)}
          </div>
        </div>

        <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="text-[10px] text-[var(--muted-foreground)] font-medium">Ricarico Medio Tot.</div>
          <div className={`text-base font-bold ${totals.totalRevenue >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {formatDdtPercent(totals.avgMarkup)}
          </div>
        </div>
      </div>

      {/* Tabella Resoconto per Cliente */}
      <div className="flex-1 min-h-0 overflow-auto bg-[var(--card)]">
        {clientGroups.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-[var(--muted-foreground)]">
            Nessun cliente corrispondente ai filtri impostati.
          </div>
        ) : (
          <table className="w-full min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)] text-[11px] font-semibold text-[var(--muted-foreground)] select-none">
              <tr>
                {/* CLIENTE */}
                <th
                  onClick={() => handleSort("clientName")}
                  className="px-4 py-2.5 text-left cursor-pointer group hover:text-[var(--foreground)] transition-colors min-w-[240px]"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>CLIENTE</span>
                    {renderSortIndicator("clientName")}
                  </div>
                </th>

                {/* QUANTITÀ TOT. */}
                <th
                  onClick={() => handleSort("totalQuantity")}
                  className="px-3 py-2.5 text-right w-28 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                >
                  <div className="inline-flex items-center justify-end gap-1 w-full">
                    <span>Q.TÀ TOT.</span>
                    {renderSortIndicator("totalQuantity")}
                  </div>
                </th>

                {/* % SUL TOTALE */}
                <th className="px-2 py-2.5 text-center w-20">
                  <span>% FATT.</span>
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

                {/* ARTICOLI DISTINTI */}
                <th
                  onClick={() => handleSort("articlesCount")}
                  className="px-3 py-2.5 text-center w-28 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                >
                  <div className="inline-flex items-center justify-center gap-1 w-full">
                    <span>ARTICOLI</span>
                    {renderSortIndicator("articlesCount")}
                  </div>
                </th>

                {/* ULTIMO ACQUISTO */}
                <th
                  onClick={() => handleSort("lastDate")}
                  className="px-3 py-2.5 text-center w-32 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                >
                  <div className="inline-flex items-center justify-center gap-1 w-full">
                    <span>ULTIMO ACQ.</span>
                    {renderSortIndicator("lastDate")}
                  </div>
                </th>

                {/* RICARICO % */}
                <th
                  onClick={() => handleSort("markupAvgPercent")}
                  className="px-3 py-2.5 text-right w-28 cursor-pointer group hover:text-[var(--foreground)] transition-colors"
                >
                  <div className="inline-flex items-center justify-end gap-1 w-full">
                    <span>RICARICO %</span>
                    {renderSortIndicator("markupAvgPercent")}
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

                {/* STATO */}
                <th className="px-2 py-2.5 text-center w-14 text-[10px] text-[var(--muted-foreground)] font-semibold">
                  STATO
                </th>

                {/* AZIONE */}
                {onSelectClient && (
                  <th className="px-3 py-2.5 text-center w-24">
                    <span>FILTRA</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
              {sortedClients.map((c) => {
                const isExpanded = expandedClients.has(c.clientName);
                const isExcluded = excludedClients.has(c.clientName);
                const isPositiveRev = c.totalRevenue > 0;
                const isNegativeRev = c.totalRevenue < 0;
                const pctOfTotal = totals.totalNet > 0 ? (c.totalNetAmount / totals.totalNet) * 100 : 0;

                return (
                  <React.Fragment key={c.clientName}>
                    <tr
                      className={`transition-colors ${
                        isExcluded
                          ? "opacity-40 bg-zinc-900/40 line-through select-none"
                          : "hover:bg-[var(--background)]/60"
                      }`}
                    >
                      {/* Cliente */}
                      <td className="px-4 py-2.5 font-sans font-medium text-[var(--foreground)]">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleExpand(c.clientName)}
                            className="text-[var(--muted-foreground)] hover:text-[var(--primary)] cursor-pointer p-0.5 no-underline"
                            title="Espandi per vedere gli articoli acquistati da questo cliente"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          <div>
                            <div className="font-bold text-[var(--foreground)] text-xs flex items-center gap-1.5 flex-wrap">
                              <span>{c.clientName}</span>
                              {isExcluded && (
                                <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-bold font-sans tracking-wide no-underline">
                                  ESCLUSO
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[var(--muted-foreground)] font-sans">
                              {c.articles.length} {c.articles.length === 1 ? "articolo" : "articoli differenti"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Quantità Totale */}
                      <td className="px-3 py-2.5 text-right font-bold text-[var(--foreground)] whitespace-nowrap">
                        {c.totalQuantity.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                      </td>

                      {/* % sul Fatturato Totale */}
                      <td className="px-2 py-2.5 text-center font-sans font-bold text-sky-400">
                        {pctOfTotal.toFixed(1)}%
                      </td>

                      {/* N° DDT */}
                      <td className="px-2 py-2.5 text-center font-semibold text-[var(--muted-foreground)]">
                        {c.docCount}
                      </td>

                      {/* Articoli Distinti */}
                      <td className="px-3 py-2.5 text-center">
                        <span className="rounded bg-[var(--background)] border border-[var(--border)] px-2 py-0.5 font-sans text-xs font-semibold">
                          {c.articlesCount}
                        </span>
                      </td>

                      {/* Ultimo Acquisto (Data) */}
                      <td className="px-3 py-2.5 text-center font-sans font-medium text-[var(--muted-foreground)]">
                        {formatDdtViewDate(c.lastDate)}
                      </td>

                      {/* Ricarico % Medio */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            isPositiveRev ? "text-emerald-400" : isNegativeRev ? "text-rose-400" : "text-[var(--muted-foreground)]"
                          }`}
                        >
                          {formatDdtPercent(c.markupAvgPercent)}
                        </span>
                      </td>

                      {/* Margine € Totale */}
                      <td
                        className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${
                          isPositiveRev ? "text-emerald-400" : isNegativeRev ? "text-rose-400" : "text-[var(--muted-foreground)]"
                        }`}
                      >
                        {formatDdtMoney(c.totalRevenue)}
                      </td>

                      {/* Fatturato Netto */}
                      <td className="px-4 py-2.5 text-right font-bold text-[var(--foreground)] whitespace-nowrap">
                        {formatDdtMoney(c.totalNetAmount)}
                      </td>

                      {/* Azione Escludi / Includi */}
                      <td className="px-2 py-2.5 text-center no-underline">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExclude(c.clientName);
                          }}
                          className={`p-1.5 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center ${
                            isExcluded
                              ? "text-amber-400 bg-amber-500/20 hover:bg-amber-500/30 ring-1 ring-amber-500/40"
                              : "text-[var(--muted-foreground)]/50 hover:text-rose-400 hover:bg-rose-500/15"
                          }`}
                          title={
                            isExcluded
                              ? "Reincludi questo cliente nel resoconto e nella stampa"
                              : "Escludi questo cliente dal resoconto e dalla stampa"
                          }
                        >
                          {isExcluded ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                      </td>

                      {/* Tasto Filtra solo questo cliente */}
                      {onSelectClient && (
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => onSelectClient(c.clientName)}
                            className="rounded border border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)] hover:text-[var(--primary)] px-2 py-1 text-[10.5px] font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
                            title={`Filtra lo storico esclusivamente per ${c.clientName}`}
                          >
                            <UserCheck className="h-3 w-3" />
                            <span>Vedi</span>
                          </button>
                        </td>
                      )}
                    </tr>

                    {/* SOTTO-TABELLA ESPANDIBILE: ARTICOLI ACQUISTATI DA QUESTO CLIENTE */}
                    {isExpanded && (
                      <tr className="bg-[var(--background)]/30">
                        <td colSpan={onSelectClient ? 11 : 10} className="px-6 py-3 border-l-2 border-[var(--primary)]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5" />
                              Articoli acquistati da {c.clientName} ({c.articles.length})
                            </span>
                            <span className="text-[11px] text-[var(--muted-foreground)] font-sans">
                              Ordinati per fatturato decrescente
                            </span>
                          </div>

                          <div className="rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--card)]">
                            <table className="w-full text-xs">
                              <thead className="bg-[var(--background)]/90 text-[10.5px] font-semibold text-[var(--muted-foreground)] border-b border-[var(--border)]">
                                <tr>
                                  <th className="px-3 py-1.5 text-left">Descrizione Articolo</th>
                                  <th className="px-3 py-1.5 text-right w-24">Quantità</th>
                                  <th className="px-2 py-1.5 text-center w-16">% Spesa</th>
                                  <th className="px-2 py-1.5 text-center w-14">N° DDT</th>
                                  <th className="px-3 py-1.5 text-right w-28">Netto Medio</th>
                                  <th className="px-3 py-1.5 text-right w-28">Range Netto</th>
                                  <th className="px-3 py-1.5 text-right w-32">Ultimo Netto (Data)</th>
                                  <th className="px-2 py-1.5 text-right w-20">Ric. %</th>
                                  <th className="px-3 py-1.5 text-right w-24">Margine €</th>
                                  <th className="px-3 py-1.5 text-right w-28">Fatturato</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11px]">
                                {c.articles.map((art, aIdx) => (
                                  <tr key={aIdx} className="hover:bg-[var(--background)]/50 transition-colors">
                                    <td className="px-3 py-1.5 font-sans font-semibold text-[var(--foreground)]">
                                      {art.canonicalDescription}
                                      {art.originalDescriptions.length > 1 && (
                                        <span className="text-[9px] text-zinc-500 font-normal ml-1">
                                          ({art.originalDescriptions.length} var.)
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-bold text-sky-400">
                                      {art.quantity.toLocaleString("it-IT", { maximumFractionDigits: 1 })} {art.unit}
                                    </td>
                                    <td className="px-2 py-1.5 text-center font-sans font-semibold text-zinc-300">
                                      {art.percentageOfClientTotal.toFixed(1)}%
                                    </td>
                                    <td className="px-2 py-1.5 text-center text-[var(--muted-foreground)]">{art.docCount}</td>
                                    <td className="px-3 py-1.5 text-right font-semibold text-zinc-200">
                                      {formatDdtMoney(Math.round(art.netPriceAvg))}
                                    </td>
                                    <td className="px-3 py-1.5 text-right text-[10px] text-[var(--muted-foreground)] font-sans">
                                      {formatDdtMoney(Math.round(art.netPriceMin))} ~ {formatDdtMoney(Math.round(art.netPriceMax))}
                                    </td>
                                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                                      <span className="font-medium text-[var(--foreground)]">{formatDdtMoney(Math.round(art.lastNetPrice))}</span>
                                      <span className="text-[10px] text-[var(--muted-foreground)] ml-1 font-sans">({formatDdtViewDate(art.lastDate)})</span>
                                    </td>
                                    <td className="px-2 py-1.5 text-right font-medium text-emerald-400">
                                      {formatDdtPercent(art.markupAvgPercent)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-semibold text-emerald-400">
                                      {formatDdtMoney(art.totalRevenue)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-bold text-[var(--foreground)]">
                                      {formatDdtMoney(art.totalNetAmount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
                              Classifica Clienti per Materiale
                            </div>
                            <div className="text-[11px] text-zinc-600 mt-0.5 font-medium">
                              Periodo: <strong className="text-zinc-900">{selectedYear !== "all" ? `Anno ${selectedYear}` : "Tutti gli anni"}</strong>
                              {searchTerm && (
                                <>
                                  {" | "}
                                  Filtro materiale: <strong className="text-zinc-900">{searchTerm}</strong>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-[10px] text-zinc-500">
                            <div>Data emissione: <strong>{new Date().toLocaleDateString("it-IT")}</strong></div>
                            <div>Modalità: <strong>Riepilogo per Cliente</strong></div>
                          </div>
                        </div>

                        {/* Riquadri KPI */}
                        <div className="grid grid-cols-5 gap-2 mb-4 text-xs">
                          <div className="border border-zinc-200 rounded p-2 bg-zinc-50">
                            <div className="text-zinc-500 text-[9px] uppercase font-bold">Clienti Acquirenti</div>
                            <div className="text-base font-black text-zinc-900">{totals.clientsCount}</div>
                          </div>
                          <div className="border border-zinc-200 rounded p-2 bg-zinc-50">
                            <div className="text-zinc-500 text-[9px] uppercase font-bold">Quantità Totale</div>
                            <div className="text-base font-black text-zinc-900">
                              {totals.totalQty.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                            </div>
                          </div>
                          <div className="border border-zinc-200 rounded p-2 bg-zinc-50">
                            <div className="text-zinc-500 text-[9px] uppercase font-bold">Fatturato Netto</div>
                            <div className="text-base font-black text-zinc-900">{formatDdtMoney(totals.totalNet)}</div>
                          </div>
                          <div className="border border-zinc-200 rounded p-2 bg-zinc-50">
                            <div className="text-zinc-500 text-[9px] uppercase font-bold">Margine Totale €</div>
                            <div className="text-base font-black text-emerald-700">{formatDdtMoney(totals.totalRevenue)}</div>
                          </div>
                          <div className="border border-zinc-200 rounded p-2 bg-zinc-50">
                            <div className="text-zinc-500 text-[9px] uppercase font-bold">Ricarico Medio %</div>
                            <div className="text-base font-black text-emerald-700">{formatDdtPercent(totals.avgMarkup)}</div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between border-b border-zinc-400 pb-2 mb-3 text-[11px] text-zinc-600">
                        <span className="font-bold uppercase tracking-wider text-zinc-800">
                          Classifica Clienti — Seguito
                        </span>
                        <span className="font-medium text-zinc-500">
                          Pagina {pageIndex + 1} di {totalPages}
                        </span>
                      </div>
                    )}

                    {/* Tabella stampabile per questo chunk di pagina */}
                    <table className="w-full text-[10px] border-collapse">
                      <thead>
                        <tr className="border-b-2 border-zinc-700 bg-zinc-100 text-zinc-800 text-left font-bold text-[9.5px]">
                          <th className="py-1.5 px-2">Cliente</th>
                          <th className="py-1.5 px-1.5 text-right w-20">Q.tà Tot.</th>
                          <th className="py-1.5 px-1 text-center w-14">% Fatt.</th>
                          <th className="py-1.5 px-1 text-center w-12">DDT</th>
                          <th className="py-1.5 px-1 text-center w-14">Articoli</th>
                          <th className="py-1.5 px-2 text-center w-24">Ultimo Acq.</th>
                          <th className="py-1.5 px-1.5 text-right w-16">Ric. %</th>
                          <th className="py-1.5 px-2 text-right w-24">Margine €</th>
                          <th className="py-1.5 px-2 text-right w-28">Fatturato</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200">
                        {chunk.map((c, idx) => {
                          const pct = totals.totalNet > 0 ? (c.totalNetAmount / totals.totalNet) * 100 : 0;
                          return (
                            <React.Fragment key={idx}>
                              <tr className="bg-zinc-100/90 font-bold">
                                <td className="py-1.5 px-2 font-bold text-zinc-900 leading-tight">
                                  {c.clientName}
                                </td>
                                <td className="py-1.5 px-1.5 text-right font-bold text-zinc-900 whitespace-nowrap">
                                  {c.totalQuantity.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                                </td>
                                <td className="py-1.5 px-1 text-center font-bold text-zinc-700">{pct.toFixed(1)}%</td>
                                <td className="py-1.5 px-1 text-center text-zinc-600 font-mono">{c.docCount}</td>
                                <td className="py-1.5 px-1 text-center text-zinc-700 font-mono">{c.articlesCount}</td>
                                <td className="py-1.5 px-2 text-center text-zinc-600 font-sans">{formatDdtViewDate(c.lastDate)}</td>
                                <td className="py-1.5 px-1.5 text-right font-medium text-zinc-800 whitespace-nowrap">
                                  {formatDdtPercent(c.markupAvgPercent)}
                                </td>
                                <td className="py-1.5 px-2 text-right font-bold text-emerald-700 whitespace-nowrap">
                                  {formatDdtMoney(c.totalRevenue)}
                                </td>
                                <td className="py-1.5 px-2 text-right font-black text-zinc-900 whitespace-nowrap">
                                  {formatDdtMoney(c.totalNetAmount)}
                                </td>
                              </tr>

                              {/* SOTTO-TABELLA ARTICOLI CLIENTE APERTA IN STAMPA */}
                              {c.articles && c.articles.length > 0 && (
                                <tr>
                                  <td colSpan={9} className="p-0 pb-1.5 border-b-2 border-zinc-300">
                                    <div className="bg-white px-2 py-1 border-l-4 border-zinc-700 ml-2 mr-1">
                                      <div className="text-[8px] font-bold uppercase tracking-wider text-zinc-600 mb-0.5 flex justify-between">
                                        <span>Articoli acquistati da {c.clientName} ({c.articles.length})</span>
                                        <span>Ordinati per spesa decrescente</span>
                                      </div>
                                      <table className="w-full text-[8.5px] border-collapse border border-zinc-200">
                                        <thead>
                                          <tr className="bg-zinc-50 text-zinc-700 font-bold border-b border-zinc-200 text-left">
                                            <th className="py-0.5 px-1.5">Descrizione Articolo</th>
                                            <th className="py-0.5 px-1.5 text-right w-20">Quantità</th>
                                            <th className="py-0.5 px-1 text-center w-12">% Quota</th>
                                            <th className="py-0.5 px-1 text-center w-8">DDT</th>
                                            <th className="py-0.5 px-1.5 text-right w-24">Netto Med. (Range)</th>
                                            <th className="py-0.5 px-1.5 text-right w-24">Ultimo Netto (Data)</th>
                                            <th className="py-0.5 px-1 text-right w-12">Ric. %</th>
                                            <th className="py-0.5 px-1.5 text-right w-16">Margine €</th>
                                            <th className="py-0.5 px-1.5 text-right w-20">Fatturato</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-200 font-mono text-[8px]">
                                          {c.articles.map((art, aIdx) => (
                                            <tr key={aIdx} className={aIdx % 2 === 1 ? "bg-zinc-50/50" : ""}>
                                              <td className="py-0.5 px-1.5 font-sans font-semibold text-zinc-900">
                                                {art.canonicalDescription}
                                                {art.originalDescriptions.length > 1 && (
                                                  <span className="text-[7px] text-zinc-500 font-normal ml-0.5">
                                                    ({art.originalDescriptions.length} var.)
                                                  </span>
                                                )}
                                              </td>
                                              <td className="py-0.5 px-1.5 text-right font-bold text-zinc-900">
                                                {art.quantity.toLocaleString("it-IT", { maximumFractionDigits: 1 })} {art.unit}
                                              </td>
                                              <td className="py-0.5 px-1 text-center text-zinc-600 font-sans">
                                                {art.percentageOfClientTotal.toFixed(1)}%
                                              </td>
                                              <td className="py-0.5 px-1 text-center text-zinc-600">{art.docCount}</td>
                                              <td className="py-0.5 px-1.5 text-right text-zinc-800">
                                                {formatDdtMoney(Math.round(art.netPriceAvg))}
                                                {art.netPriceMin !== art.netPriceMax && (
                                                  <span className="text-[7px] text-zinc-500 ml-0.5">
                                                    ({formatDdtMoney(Math.round(art.netPriceMin))}~{formatDdtMoney(Math.round(art.netPriceMax))})
                                                  </span>
                                                )}
                                              </td>
                                              <td className="py-0.5 px-1.5 text-right text-zinc-800">
                                                {formatDdtMoney(Math.round(art.lastNetPrice))}
                                                <span className="text-[7px] text-zinc-500 ml-0.5 font-sans">
                                                  ({formatDdtViewDate(art.lastDate)})
                                                </span>
                                              </td>
                                              <td className="py-0.5 px-1 text-right font-medium text-zinc-800">
                                                {formatDdtPercent(art.markupAvgPercent)}
                                              </td>
                                              <td className="py-0.5 px-1.5 text-right font-bold text-emerald-800">
                                                {formatDdtMoney(art.totalRevenue)}
                                              </td>
                                              <td className="py-0.5 px-1.5 text-right font-black text-zinc-900">
                                                {formatDdtMoney(art.totalNetAmount)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                      {/* Totali in calce solo sull'ultima pagina */}
                      {isLastPage && (
                        <tfoot>
                          <tr className="border-t-2 border-zinc-800 bg-zinc-100 font-bold text-zinc-900 text-[10px]">
                            <td className="py-1.5 px-2">TOTALI GENERALI</td>
                            <td className="py-1.5 px-1.5 text-right">
                              {totals.totalQty.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                            </td>
                            <td className="py-1.5 px-1 text-center">100%</td>
                            <td className="py-1.5 px-1 text-center">{totals.totalDocs}</td>
                            <td colSpan={2} className="py-1.5 px-1 text-right text-zinc-500 text-[9px]">
                              Margine Totale:
                            </td>
                            <td className="py-1.5 px-1.5 text-right text-emerald-800 font-black">
                              {formatDdtPercent(totals.avgMarkup)}
                            </td>
                            <td className="py-1.5 px-2 text-right text-emerald-800 font-black">
                              {formatDdtMoney(totals.totalRevenue)}
                            </td>
                            <td className="py-1.5 px-2 text-right text-zinc-950 font-black">
                              {formatDdtMoney(totals.totalNet)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>

                  {/* Piè di pagina fisso per ciascuna pagina A4 */}
                  <div className="pt-2 border-t border-zinc-300 text-[9px] text-zinc-500 flex justify-between items-center">
                    <span>Gestionale Last — Modulo Storico Articoli DDT (Classifica Clienti)</span>
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

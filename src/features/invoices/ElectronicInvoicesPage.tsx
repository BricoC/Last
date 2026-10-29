import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import {
  electronicInvoicesService,
  SupplierInvoice,
  SupplierInvoiceItem,
} from "./services/electronicInvoicesService";
import { InvoiceDetailModal } from "./components/InvoiceDetailModal";
import { Button } from "@/shared/components/ui/button";
import {
  normalizeSearch,
  tokenizeSearch,
  matchesSearchToken,
} from "@/shared/hooks/useFragmentSearch";
import {
  Search,
  X,
  RefreshCw,
  LoaderCircle,
  CloudDownload,
  FileText,
  Eye,
  EyeOff,
  Upload,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";

type IndexedItemRow = SupplierInvoiceItem & { _searchIndex: string };
type IndexedInvoiceRow = SupplierInvoice & { _searchIndex: string };

type ItemSortField =
  | "doc_date"
  | "doc_number"
  | "supplier_name"
  | "article_code"
  | "unit"
  | "quantity"
  | "description"
  | "unit_price"
  | "discount_1"
  | "discounted_price"
  | "total_price"
  | "vat_rate";

type InvoiceSortField =
  | "doc_date"
  | "doc_number"
  | "supplier_name"
  | "year"
  | "taxable_amount"
  | "vat_amount"
  | "total_amount"
  | "payment_method"
  | "due_date"
  | "notes";

const BATCH_SIZE = 150;

export const ElectronicInvoicesPage: React.FC = () => {
  // Vista attiva: "items" (Storico Articoli) o "invoices" (Elenco Documenti)
  const [activeTab, setActiveTab] = useState<"items" | "invoices">("items");

  // Dati grezzi caricati una sola volta in memoria per performance 60fps istantanee
  const [items, setItems] = useState<SupplierInvoiceItem[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Ricerca con useDeferredValue per non bloccare mai la digitazione
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Filtri
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [onlyWithPrice, setOnlyWithPrice] = useState(true);
  const [showExtendedColumns, setShowExtendedColumns] = useState(false);

  // Ordinamento Colonne
  const [itemSortField, setItemSortField] = useState<ItemSortField>("doc_date");
  const [itemSortAsc, setItemSortAsc] = useState(false);

  const [invSortField, setInvSortField] = useState<InvoiceSortField>("doc_date");
  const [invSortAsc, setInvSortAsc] = useState(false);

  // Paginazione virtuale progressiva (infinite scroll)
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  // Sincronizzazione Supabase
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ msg: string; pct: number }>({
    msg: "",
    pct: 0,
  });

  // Modale Dettaglio Fattura
  const [selectedInvoice, setSelectedInvoice] = useState<SupplierInvoice | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<SupplierInvoiceItem[]>([]);
  const [isLoadingLines, setIsLoadingLines] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Importazione XML & Drag and Drop
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ msg: string; pct: number }>({
    msg: "",
    pct: 0,
  });
  const [importNotification, setImportNotification] = useState<{
    type: "success" | "warning" | "error";
    message: string;
  } | null>(null);

  // Scorciatoia F4 per focalizzare la ricerca rapida (come in DDT Articoli e noManV1)
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

  // Caricamento rapido iniziale di tutte le righe (richiede ~80ms una sola volta)
  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [itemsData, invsData] = await Promise.all([
        electronicInvoicesService.getAllItems(),
        electronicInvoicesService.getAllInvoices(),
      ]);
      setItems(itemsData);
      setInvoices(invsData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore lettura dati locali.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Pre-indicizzazione in memoria delle righe articoli (fatta una volta sola)
  const indexedItems = useMemo<IndexedItemRow[]>(() => {
    return items.map((r) => ({
      ...r,
      _searchIndex: normalizeSearch(
        `${r.description} ${r.article_code || ""} ${r.supplier_name} ${r.doc_number} ${r.year} ${r.doc_date}`
      ),
    }));
  }, [items]);

  // Pre-indicizzazione in memoria delle testate fattura
  const indexedInvoices = useMemo<IndexedInvoiceRow[]>(() => {
    return invoices.map((inv) => ({
      ...inv,
      _searchIndex: normalizeSearch(
        `${inv.supplier_name} ${inv.doc_number} ${inv.doc_date} ${inv.year} ${inv.iban || ""} ${inv.notes || ""}`
      ),
    }));
  }, [invoices]);

  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  // Filtraggio ISTANTANEO in memoria (0-2 ms)
  const filteredItems = useMemo(() => {
    return indexedItems.filter((row) => {
      if (selectedYear !== null && row.year !== selectedYear) return false;
      if (onlyWithPrice && row.discounted_price <= 0 && row.unit_price <= 0 && row.total_price <= 0) {
        return false;
      }
      if (!searchTokens.length) return true;
      return searchTokens.every((token) => matchesSearchToken(row._searchIndex, token));
    });
  }, [indexedItems, selectedYear, onlyWithPrice, searchTokens]);

  const filteredInvoices = useMemo(() => {
    return indexedInvoices.filter((inv) => {
      if (selectedYear !== null && inv.year !== selectedYear) return false;
      if (!searchTokens.length) return true;
      return searchTokens.every((token) => matchesSearchToken(inv._searchIndex, token));
    });
  }, [indexedInvoices, selectedYear, searchTokens]);

  // Ordinamento Articoli
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let valA: any = a[itemSortField];
      let valB: any = b[itemSortField];

      if (valA == null) valA = "";
      if (valB == null) valB = "";

      if (typeof valA === "number" && typeof valB === "number") {
        return itemSortAsc ? valA - valB : valB - valA;
      }

      return itemSortAsc
        ? String(valA).localeCompare(String(valB), "it", { numeric: true, sensitivity: "base" })
        : String(valB).localeCompare(String(valA), "it", { numeric: true, sensitivity: "base" });
    });
  }, [filteredItems, itemSortField, itemSortAsc]);

  // Ordinamento Fatture
  const sortedInvoices = useMemo(() => {
    return [...filteredInvoices].sort((a, b) => {
      let valA: any = a[invSortField];
      let valB: any = b[invSortField];

      if (valA == null) valA = "";
      if (valB == null) valB = "";

      if (typeof valA === "number" && typeof valB === "number") {
        return invSortAsc ? valA - valB : valB - valA;
      }

      return invSortAsc
        ? String(valA).localeCompare(String(valB), "it", { numeric: true, sensitivity: "base" })
        : String(valB).localeCompare(String(valA), "it", { numeric: true, sensitivity: "base" });
    });
  }, [filteredInvoices, invSortField, invSortAsc]);

  // Toggle Ordinamento
  const handleToggleItemSort = (field: ItemSortField) => {
    if (itemSortField === field) {
      setItemSortAsc(!itemSortAsc);
    } else {
      setItemSortField(field);
      setItemSortAsc(field === "description" || field === "supplier_name" || field === "article_code");
    }
  };

  const handleToggleInvSort = (field: InvoiceSortField) => {
    if (invSortField === field) {
      setInvSortAsc(!invSortAsc);
    } else {
      setInvSortField(field);
      setInvSortAsc(field === "supplier_name");
    }
  };

  // Reset del batch visibile quando cambia la ricerca o i filtri o l'ordinamento
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [deferredSearch, selectedYear, onlyWithPrice, activeTab, itemSortField, itemSortAsc, invSortField, invSortAsc]);

  // Infinite scroll fluido ad alte prestazioni
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const maxLen = activeTab === "items" ? sortedItems.length : sortedInvoices.length;
    if (scrollTop + clientHeight >= scrollHeight - 350) {
      setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, maxLen));
    }
  };

  const visibleItems = useMemo(() => sortedItems.slice(0, visibleCount), [sortedItems, visibleCount]);
  const visibleInvoices = useMemo(() => sortedInvoices.slice(0, visibleCount), [sortedInvoices, visibleCount]);

  // Apertura Dettaglio Fattura da Riga Articolo
  const handleOpenDetailFromItem = async (item: SupplierInvoiceItem) => {
    setIsLoadingLines(true);
    setIsDetailOpen(true);
    try {
      const found = invoices.find(
        (d) =>
          d.doc_number.trim().toUpperCase() === item.doc_number.trim().toUpperCase() &&
          d.doc_date.trim() === item.doc_date.trim()
      );

      setSelectedInvoice(
        found || {
          supplier_name: item.supplier_name,
          doc_number: item.doc_number,
          doc_date: item.doc_date,
          year: item.year,
          total_amount: item.total_price || 0,
          taxable_amount: item.total_price || 0,
          vat_amount: 0,
        }
      );

      const lines = await electronicInvoicesService.getInvoiceLines(
        item.supplier_name,
        item.doc_number,
        item.doc_date
      );
      setInvoiceLines(lines.length > 0 ? lines : [item]);
    } catch (err) {
      console.warn("Errore caricamento linee documento:", err);
    } finally {
      setIsLoadingLines(false);
    }
  };

  // Apertura Dettaglio da Testata
  const handleOpenDetailFromInvoice = async (inv: SupplierInvoice) => {
    setSelectedInvoice(inv);
    setIsLoadingLines(true);
    setIsDetailOpen(true);
    try {
      const lines = await electronicInvoicesService.getInvoiceLines(
        inv.supplier_name,
        inv.doc_number,
        inv.doc_date
      );
      setInvoiceLines(lines);
    } catch (err) {
      console.warn("Errore caricamento linee:", err);
    } finally {
      setIsLoadingLines(false);
    }
  };

  // Sincronizzazione da Supabase Cloud
  const handleSyncCloud = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setError("");
    try {
      await electronicInvoicesService.syncFromSupabase((msg, pct) => {
        setSyncProgress({ msg, pct });
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sincronizzazione non riuscita.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Processamento file XML importati (da Drag & Drop o da Pulsante File Picker)
  const handleProcessFiles = async (fileList: File[]) => {
    const xmlFiles = fileList.filter((f) => {
      const name = f.name.toLowerCase();
      return name.endsWith(".xml") || name.endsWith(".p7m");
    });

    if (xmlFiles.length === 0) {
      setImportNotification({
        type: "error",
        message: "Nessun file XML trovato. Seleziona o trascina file con estensione .xml o .p7m.",
      });
      return;
    }

    setIsImporting(true);
    setImportNotification(null);
    setImportProgress({ msg: "Lettura file...", pct: 5 });

    try {
      const payload: { name: string; content: string }[] = [];
      for (let i = 0; i < xmlFiles.length; i++) {
        const file = xmlFiles[i];
        setImportProgress({
          msg: `Lettura ${file.name} (${i + 1}/${xmlFiles.length})...`,
          pct: Math.round(((i + 1) / xmlFiles.length) * 20),
        });
        const content = await file.text();
        payload.push({ name: file.name, content });
      }

      const res = await electronicInvoicesService.importXmlFiles(
        payload,
        (msg, pct) => setImportProgress({ msg, pct })
      );

      // Ricarica i dati locali in memoria per ricerca immediata
      await loadData();

      if (res.importedInvoices > 0) {
        let msg = `Importate con successo ${res.importedInvoices} fattur${res.importedInvoices === 1 ? "a" : "e"} (${res.totalLines} righe articolo).`;
        if (res.skippedDuplicates > 0) {
          msg += ` ${res.skippedDuplicates} fattur${res.skippedDuplicates === 1 ? "a" : "e"} già present${res.skippedDuplicates === 1 ? "e" : "i"} saltat${res.skippedDuplicates === 1 ? "a" : "e"}.`;
        }
        if (res.cloudSynced) {
          msg += ` Sincronizzato con Supabase Cloud.`;
        } else if (res.cloudError) {
          msg += ` (Salvate localmente; Cloud non sincronizzato).`;
        }
        setImportNotification({
          type: "success",
          message: msg,
        });
      } else if (res.skippedDuplicates > 0) {
        setImportNotification({
          type: "warning",
          message: `Nessuna nuova fattura: ${res.skippedDuplicates === 1 ? "la fattura selezionata è già presente" : `tutte le ${res.skippedDuplicates} fatture sono già presenti`} nell'archivio.`,
        });
      } else if (res.errors.length > 0) {
        setImportNotification({
          type: "error",
          message: `Errore durante il parsing di ${res.errors.length} file: ${res.errors.map((e) => e.fileName).join(", ")}`,
        });
      }
    } catch (err) {
      setImportNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Errore durante l'importazione dei file.",
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      await handleProcessFiles(droppedFiles);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      await handleProcessFiles(selectedFiles);
    }
  };

  const formatEuro = (val: number, decimals = 2) =>
    `€ ${val.toLocaleString("it-IT", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;

  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    invoices.forEach((inv) => {
      if (inv.year) yearsSet.add(inv.year);
    });
    items.forEach((item) => {
      if (item.year) yearsSet.add(item.year);
    });
    [2026, 2025, 2024, 2023].forEach((y) => yearsSet.add(y));
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [invoices, items]);

  // Calcolo totali complessivi degli elementi filtrati / visualizzati
  const summaryTotals = useMemo(() => {
    if (activeTab === "invoices") {
      let taxable = 0;
      let vat = 0;
      let total = 0;
      for (let i = 0; i < filteredInvoices.length; i++) {
        const inv = filteredInvoices[i];
        taxable += inv.taxable_amount || 0;
        vat += inv.vat_amount || 0;
        total += inv.total_amount || 0;
      }
      return {
        count: filteredInvoices.length,
        taxable,
        vat,
        total,
      };
    } else {
      let taxable = 0;
      let vat = 0;
      let total = 0;
      for (let i = 0; i < filteredItems.length; i++) {
        const it = filteredItems[i];
        const lineTotal = it.total_price || 0;
        taxable += lineTotal;
        const lineVat = lineTotal * ((it.vat_rate || 22) / 100);
        vat += lineVat;
        total += lineTotal + lineVat;
      }
      return {
        count: filteredItems.length,
        taxable,
        vat,
        total,
      };
    }
  }, [activeTab, filteredInvoices, filteredItems]);

  return (
    <div
      className="relative flex h-full w-full flex-col gap-2 p-2 overflow-hidden text-[var(--foreground)]"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* File input nascosto per il pulsante Importa XML */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".xml,.p7m"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Drop overlay visivo quando si trascinano i file sopra l'applicazione */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--background)]/85 backdrop-blur-xs border-2 border-dashed border-[var(--primary)] rounded-lg p-6 pointer-events-none animate-in fade-in duration-100">
          <div className="flex flex-col items-center gap-3 p-8 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-2xl text-center">
            <div className="p-4 rounded-full bg-[var(--primary)]/15 text-[var(--primary)]">
              <Upload className="w-10 h-10 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--foreground)]">Rilascia qui i file XML</h3>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Trascina una o più fatture elettroniche (.xml) per importarle automaticamente
              </p>
            </div>
          </div>
        </div>
      )}
      {/* ─── 1. BARRA DI RICERCA (STESSO IDENTICO STILE DI DDT ARTICOLI) ─── */}
      <label className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-xs text-[var(--foreground)]">
        <Search className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
        <input
          ref={searchInputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            activeTab === "items"
              ? "Cerca fornitore, codice articolo, descrizione, numero documento o anno... (F4 per cercare)"
              : "Cerca fornitore, numero fattura, IBAN, note... (F4 per cercare)"
          }
          className="w-full bg-transparent outline-none text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              searchInputRef.current?.focus();
            }}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-0.5 rounded cursor-pointer"
            title="Cancella ricerca"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      {/* ─── 2. TOOLBAR / HEADER (STESSO IDENTICO STILE DI DDT ARTICOLI) ─── */}
      <div className="flex h-7 shrink-0 items-center justify-between gap-3 px-1 text-xs">
        {/* Titolo, Tabs e Filtri */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <h1 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
              {activeTab === "items" ? "Fatture Elettroniche (Articoli)" : "Fatture Fornitori"}
            </h1>
            <span className="text-[var(--muted-foreground)] text-[11px] font-normal">
              ({(activeTab === "items" ? items.length : invoices.length).toLocaleString("it-IT")} totali)
            </span>
          </div>

          {/* Switch Vista Schede */}
          <div className="flex items-center bg-[var(--card)] border border-[var(--border)] rounded p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("items")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                activeTab === "items"
                  ? "bg-[var(--primary)] text-white font-semibold"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Articoli & Prezzi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("invoices")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                activeTab === "invoices"
                  ? "bg-[var(--primary)] text-white font-semibold"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Fatture ({invoices.length})
            </button>
          </div>

          {/* Menù a tendina Selezione Anno */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <label htmlFor="year-select" className="text-[var(--muted-foreground)] font-semibold shrink-0">
              Anno:
            </label>
            <select
              id="year-select"
              value={selectedYear === null ? "ALL" : String(selectedYear)}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedYear(val === "ALL" ? null : parseInt(val, 10));
              }}
              className="h-6 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-0 text-[11px] font-medium text-[var(--foreground)] outline-none cursor-pointer hover:border-[var(--primary)] transition-colors"
            >
              <option value="ALL">Tutti gli anni</option>
              {availableYears.map((yr) => (
                <option key={yr} value={String(yr)}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Switch Colonne Estese */}
          {activeTab === "items" && (
            <button
              type="button"
              onClick={() => setShowExtendedColumns(!showExtendedColumns)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                showExtendedColumns
                  ? "border-lime-500/50 bg-lime-500/10 text-lime-400"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
              title="Mostra/Nascondi UM, Quantità, Listino e Sconti"
            >
              {showExtendedColumns ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>Show</span>
            </button>
          )}

          {/* Filtro Solo con Prezzo */}
          {activeTab === "items" && (
            <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer">
              <input
                type="checkbox"
                checked={onlyWithPrice}
                onChange={(e) => setOnlyWithPrice(e.target.checked)}
                className="rounded border-[var(--border)] bg-[var(--card)] text-[var(--primary)] cursor-pointer"
              />
              <span>Solo con prezzo</span>
            </label>
          )}
        </div>

        {/* Info Destra: Totali Elementi Filtrati + Pulsante Importa XML + Pulsante Sync + Refresh */}
        <div className="flex items-center gap-2">
          {/* Badge Riepilogo: N. Elementi - Imponibile - IVA - Totale Documento */}
          <div className="flex items-center gap-2 px-2.5 py-0.5 rounded border border-[var(--border)] bg-[var(--card)] text-[11px] whitespace-nowrap shadow-xs">
            <div className="flex items-center gap-1">
              <span className="text-[var(--muted-foreground)]">Elementi:</span>
              <span className="font-bold text-[var(--foreground)]">
                {summaryTotals.count.toLocaleString("it-IT")}
              </span>
            </div>
            <span className="text-[var(--border)] select-none">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[var(--muted-foreground)]">Imponibile:</span>
              <span className="font-semibold text-[var(--foreground)]">
                {formatEuro(summaryTotals.taxable)}
              </span>
            </div>
            <span className="text-[var(--border)] select-none">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[var(--muted-foreground)]">IVA:</span>
              <span className="font-semibold text-[var(--foreground)]">
                {formatEuro(summaryTotals.vat)}
              </span>
            </div>
            <span className="text-[var(--border)] select-none">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[var(--muted-foreground)]">Totale:</span>
              <span className="font-bold text-[var(--primary)]">
                {formatEuro(summaryTotals.total)}
              </span>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            variant="primary"
            className="h-6 px-2.5 text-[11px] gap-1.5 cursor-pointer bg-[var(--primary)] text-white hover:opacity-90 font-medium shadow-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || isSyncing}
            title="Importa file XML di fatture elettroniche (o trascina i file qui)"
          >
            <Upload className={`h-3 w-3 ${isImporting ? "animate-bounce" : ""}`} />
            <span>{isImporting ? "Importando..." : "Importa XML"}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-6 px-2 text-[11px] gap-1.5 cursor-pointer"
            onClick={handleSyncCloud}
            disabled={isSyncing || isImporting}
            title="Scarica e allinea con Supabase Cloud"
          >
            <CloudDownload className={`h-3 w-3 ${isSyncing ? "animate-bounce" : ""}`} />
            <span>{isSyncing ? "Sync..." : "Sincronizza Cloud"}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-6 px-2 cursor-pointer"
            onClick={() => void loadData()}
            disabled={loading || isImporting || isSyncing}
            title="Ricarica elenco"
          >
            {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* NOTIFICA ERRORE O SYNC */}
      {error && (
        <p role="alert" className="text-xs text-[var(--destructive)] px-1">
          {error}
        </p>
      )}

      {isSyncing && (
        <div className="flex items-center justify-between p-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--primary)]">
          <span>{syncProgress.msg}</span>
          <span className="font-bold">{syncProgress.pct}%</span>
        </div>
      )}

      {/* PROGRESSO IMPORTAZIONE XML */}
      {isImporting && (
        <div className="flex items-center justify-between p-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--primary)]">
          <div className="flex items-center gap-2">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span>{importProgress.msg}</span>
          </div>
          <span className="font-bold">{importProgress.pct}%</span>
        </div>
      )}

      {/* BANNER NOTIFICA RISULTATO IMPORTAZIONE */}
      {importNotification && (
        <div
          className={`flex items-center justify-between p-2 rounded-md border text-xs ${
            importNotification.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : importNotification.type === "warning"
              ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
              : "border-rose-500/40 bg-rose-500/10 text-rose-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {importNotification.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {importNotification.type === "warning" && <AlertTriangle className="h-4 w-4 shrink-0" />}
            {importNotification.type === "error" && <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{importNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportNotification(null)}
            className="p-1 hover:opacity-80 rounded cursor-pointer ml-2"
            title="Chiudi notifica"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ─── 3. TABELLA PRINCIPALE CON CELLE COPIABILI E ORDINABILI ─── */}
      {loading && items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Caricamento righe...
        </div>
      ) : activeTab === "items" ? (
        /* VISTA ARTICOLI */
        sortedItems.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8 text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-md bg-[var(--card)]">
            {items.length === 0
              ? "Nessun dato locale trovato. Clicca su 'Sincronizza Cloud' in alto a destra per scaricare l'archivio."
              : "Nessun articolo trovato per i filtri selezionati."}
          </div>
        ) : (
          <div
            ref={tableContainerRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-auto border border-[var(--border)] rounded-md bg-[var(--card)] select-text"
          >
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)] text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider select-none">
                <tr>
                  <th
                    onClick={() => handleToggleItemSort("doc_date")}
                    className="px-3 py-2 text-left w-32 cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>DATA</span>
                      {itemSortField === "doc_date" && (
                        <span className="text-[var(--primary)] text-[10px]">{itemSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleItemSort("doc_number")}
                    className="px-3 py-2 text-left w-28 cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>DOC N.</span>
                      {itemSortField === "doc_number" && (
                        <span className="text-[var(--primary)] text-[10px]">{itemSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleItemSort("supplier_name")}
                    className="px-3 py-2 text-left w-52 cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>FORNITORE</span>
                      {itemSortField === "supplier_name" && (
                        <span className="text-[var(--primary)] text-[10px]">{itemSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleItemSort("article_code")}
                    className="px-3 py-2 text-left w-36 cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>CODICE ART.</span>
                      {itemSortField === "article_code" && (
                        <span className="text-[var(--primary)] text-[10px]">{itemSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  {showExtendedColumns && (
                    <th
                      onClick={() => handleToggleItemSort("unit")}
                      className="px-2 py-2 text-center w-14 cursor-pointer hover:bg-[var(--card)] transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>UM</span>
                        {itemSortField === "unit" && (
                          <span className="text-[var(--primary)] text-[10px]">{itemSortAsc ? "▲" : "▼"}</span>
                        )}
                      </div>
                    </th>
                  )}
                  {showExtendedColumns && (
                    <th
                      onClick={() => handleToggleItemSort("quantity")}
                      className="px-3 py-2 text-right w-16 cursor-pointer hover:bg-[var(--card)] transition-colors"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Q.TÀ</span>
                        {itemSortField === "quantity" && (
                          <span className="text-[var(--primary)] text-[10px]">{itemSortAsc ? "▲" : "▼"}</span>
                        )}
                      </div>
                    </th>
                  )}
                  <th
                    onClick={() => handleToggleItemSort("description")}
                    className="px-3 py-2 text-left cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>DESCRIZIONE</span>
                      {itemSortField === "description" && (
                        <span className="text-[var(--primary)] text-[10px]">{itemSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  {showExtendedColumns && (
                    <th
                      onClick={() => handleToggleItemSort("unit_price")}
                      className="px-3 py-2 text-right w-24 cursor-pointer hover:bg-[var(--card)] transition-colors"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>LISTINO</span>
                        {itemSortField === "unit_price" && (
                          <span className="text-[var(--primary)] text-[10px]">{itemSortAsc ? "▲" : "▼"}</span>
                        )}
                      </div>
                    </th>
                  )}
                  {showExtendedColumns && (
                    <th
                      onClick={() => handleToggleItemSort("discount_1")}
                      className="px-2 py-2 text-center w-20 cursor-pointer hover:bg-[var(--card)] transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>SCONTO</span>
                        {itemSortField === "discount_1" && (
                          <span className="text-[var(--primary)] text-[10px]">{itemSortAsc ? "▲" : "▼"}</span>
                        )}
                      </div>
                    </th>
                  )}
                  <th
                    onClick={() => handleToggleItemSort("discounted_price")}
                    className="px-3 py-2 text-right w-28 text-[var(--primary)] font-bold cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>COSTO NETTO (€)</span>
                      {itemSortField === "discounted_price" && (
                        <span className="text-[var(--primary)] text-[10px]">{itemSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  {showExtendedColumns && (
                    <th
                      onClick={() => handleToggleItemSort("total_price")}
                      className="px-3 py-2 text-right w-24 cursor-pointer hover:bg-[var(--card)] transition-colors"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>IMPORTO</span>
                        {itemSortField === "total_price" && (
                          <span className="text-[var(--primary)] text-[10px]">{itemSortAsc ? "▲" : "▼"}</span>
                        )}
                      </div>
                    </th>
                  )}
                  <th
                    onClick={() => handleToggleItemSort("vat_rate")}
                    className="px-2 py-2 text-center w-14 cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>IVA</span>
                      {itemSortField === "vat_rate" && (
                        <span className="text-[var(--primary)] text-[10px]">{itemSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
                {visibleItems.map((row) => {
                  const discounts = [row.discount_1, row.discount_2, row.discount_3]
                    .filter((d) => d > 0)
                    .map((d) => `${d}%`)
                    .join("+");

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-[var(--background)]/60 transition-colors"
                    >
                      {/* DATA (copiabile) */}
                      <td className="px-3 py-2 font-sans font-medium text-[var(--foreground)] whitespace-nowrap select-text">
                        {row.doc_date}
                      </td>

                      {/* DOC N. (SOLO QUESTO TASTO APRE LA FATTURA) */}
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleOpenDetailFromItem(row)}
                          className="font-bold text-[var(--primary)] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                          title="Apri fattura fornitore"
                        >
                          <FileText className="h-3 w-3" />
                          <span>{row.doc_number}</span>
                        </button>
                      </td>

                      {/* FORNITORE (copiabile) */}
                      <td className="px-3 py-2 font-sans font-medium text-[var(--foreground)] truncate max-w-[200px] select-text" title={row.supplier_name}>
                        {row.supplier_name}
                      </td>

                      {/* CODICE ART. (copiabile) */}
                      <td className="px-3 py-2 text-[var(--muted-foreground)] select-text">
                        {row.article_code || "—"}
                      </td>

                      {/* UM (copiabile) */}
                      {showExtendedColumns && (
                        <td className="px-2 py-2 text-center uppercase text-[var(--muted-foreground)] select-text">
                          {row.unit || "NR"}
                        </td>
                      )}

                      {/* QUANTITÀ (copiabile) */}
                      {showExtendedColumns && (
                        <td className="px-3 py-2 text-right font-bold text-[var(--foreground)] select-text">
                          {row.quantity > 0 ? row.quantity : "—"}
                        </td>
                      )}

                      {/* DESCRIZIONE (copiabile) */}
                      <td className="px-3 py-2 font-sans text-[var(--foreground)] select-text">
                        {row.description}
                      </td>

                      {/* PREZZO LISTINO (copiabile) */}
                      {showExtendedColumns && (
                        <td className="px-3 py-2 text-right text-[var(--muted-foreground)] select-text">
                          {row.unit_price > 0 ? formatEuro(row.unit_price, 4) : "—"}
                        </td>
                      )}

                      {/* SCONTO (copiabile) */}
                      {showExtendedColumns && (
                        <td className="px-2 py-2 text-center text-[var(--muted-foreground)] select-text">
                          {discounts || "—"}
                        </td>
                      )}

                      {/* COSTO NETTO (EVIDENZIATO, copiabile) */}
                      <td className="px-3 py-2 text-right font-bold text-[var(--primary)] select-text">
                        {row.discounted_price > 0
                          ? formatEuro(row.discounted_price, 4)
                          : row.unit_price > 0
                          ? formatEuro(row.unit_price, 4)
                          : "—"}
                      </td>

                      {/* IMPORTO (copiabile) */}
                      {showExtendedColumns && (
                        <td className="px-3 py-2 text-right text-[var(--foreground)] select-text">
                          {row.total_price > 0 ? formatEuro(row.total_price, 2) : "—"}
                        </td>
                      )}

                      {/* IVA (copiabile) */}
                      <td className="px-2 py-2 text-center text-[var(--muted-foreground)] select-text">
                        {row.vat_rate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* VISTA TESTATE FATTURE */
        sortedInvoices.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8 text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-md bg-[var(--card)]">
            Nessuna fattura trovata per i filtri selezionati.
          </div>
        ) : (
          <div
            ref={tableContainerRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-auto border border-[var(--border)] rounded-md bg-[var(--card)] select-text"
          >
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)] text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider select-none">
                <tr>
                  <th
                    onClick={() => handleToggleInvSort("doc_date")}
                    className="px-3 py-2 text-left w-32 cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>DATA DOC</span>
                      {invSortField === "doc_date" && (
                        <span className="text-[var(--primary)] text-[10px]">{invSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleInvSort("doc_number")}
                    className="px-3 py-2 text-left w-28 cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>N° FATTURA</span>
                      {invSortField === "doc_number" && (
                        <span className="text-[var(--primary)] text-[10px]">{invSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleInvSort("supplier_name")}
                    className="px-3 py-2 text-left w-64 cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>FORNITORE</span>
                      {invSortField === "supplier_name" && (
                        <span className="text-[var(--primary)] text-[10px]">{invSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleInvSort("year")}
                    className="px-3 py-2 text-center w-20 cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>ANNO</span>
                      {invSortField === "year" && (
                        <span className="text-[var(--primary)] text-[10px]">{invSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleInvSort("taxable_amount")}
                    className="px-3 py-2 text-right w-28 cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>IMPONIBILE</span>
                      {invSortField === "taxable_amount" && (
                        <span className="text-[var(--primary)] text-[10px]">{invSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleInvSort("vat_amount")}
                    className="px-3 py-2 text-right w-24 cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>IVA</span>
                      {invSortField === "vat_amount" && (
                        <span className="text-[var(--primary)] text-[10px]">{invSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleInvSort("total_amount")}
                    className="px-3 py-2 text-right w-32 font-bold text-[var(--foreground)] cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>TOTALE DOC (€)</span>
                      {invSortField === "total_amount" && (
                        <span className="text-[var(--primary)] text-[10px]">{invSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleInvSort("payment_method")}
                    className="px-3 py-2 text-left w-48 cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>MODALITÀ PAGAMENTO</span>
                      {invSortField === "payment_method" && (
                        <span className="text-[var(--primary)] text-[10px]">{invSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleInvSort("due_date")}
                    className="px-3 py-2 text-center w-28 cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>SCADENZA</span>
                      {invSortField === "due_date" && (
                        <span className="text-[var(--primary)] text-[10px]">{invSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleInvSort("notes")}
                    className="px-3 py-2 text-left cursor-pointer hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>NOTE / CAUSALE</span>
                      {invSortField === "notes" && (
                        <span className="text-[var(--primary)] text-[10px]">{invSortAsc ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
                {visibleInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-[var(--background)]/60 transition-colors"
                  >
                    <td className="px-3 py-2 font-sans font-medium text-[var(--foreground)] whitespace-nowrap select-text">
                      {inv.doc_date}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleOpenDetailFromInvoice(inv)}
                        className="font-bold text-[var(--primary)] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                        title="Apri fattura fornitore"
                      >
                        <FileText className="h-3 w-3" />
                        <span>{inv.doc_number}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2 font-sans font-medium text-[var(--foreground)] truncate max-w-[240px] select-text" title={inv.supplier_name}>
                      {inv.supplier_name}
                    </td>
                    <td className="px-3 py-2 text-center text-[var(--muted-foreground)] select-text">
                      {inv.year}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--muted-foreground)] select-text">
                      {formatEuro(inv.taxable_amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--muted-foreground)] select-text">
                      {formatEuro(inv.vat_amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-[var(--foreground)] select-text">
                      {formatEuro(inv.total_amount)}
                    </td>
                    <td className="px-3 py-2 font-sans text-[var(--muted-foreground)] truncate max-w-[180px] select-text">
                      {inv.payment_method || "—"}
                    </td>
                    <td className="px-3 py-2 text-center font-sans font-semibold text-amber-400 select-text">
                      {inv.due_date || "—"}
                    </td>
                    <td className="px-3 py-2 font-sans text-[var(--muted-foreground)] truncate max-w-[200px] select-text" title={inv.notes}>
                      {inv.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ─── 4. SUMMARY FOOTER (STESSO IDENTICO STILE DI DDT ARTICOLI) ─── */}
      <div className="shrink-0 flex items-center justify-between px-1 text-[11px] text-[var(--muted-foreground)]">
        <div>
          <span>Archivio locale: </span>
          <strong className="text-[var(--foreground)]">{items.length.toLocaleString("it-IT")}</strong> righe articolo in{" "}
          <strong className="text-[var(--foreground)]">{invoices.length.toLocaleString("it-IT")}</strong> fatture
        </div>
        <div>
          <span>Clicca sul numero fattura per aprire il documento ministeriale completo</span>
        </div>
      </div>

      {/* ─── MODALE DETTAGLIO FATTURA ─── */}
      <InvoiceDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        invoice={selectedInvoice}
        lines={invoiceLines}
        isLoadingLines={isLoadingLines}
      />
    </div>
  );
};

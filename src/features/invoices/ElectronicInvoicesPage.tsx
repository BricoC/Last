import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import {
  electronicInvoicesService,
  SupplierInvoice,
  SupplierInvoiceItem,
} from "./services/electronicInvoicesService";
import { InvoiceDetailModal } from "./components/InvoiceDetailModal";
import { AddToOrderManagerModal, AddToOrderManagerItem } from "./components/AddToOrderManagerModal";
import { ElectronicInvoicesToolbar } from "./components/ElectronicInvoicesToolbar";
import { InvoiceItemsTable } from "./components/InvoiceItemsTable";
import { InvoiceHeadersTable } from "./components/InvoiceHeadersTable";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { X, LoaderCircle, Upload, Check, Receipt } from "lucide-react";
import {
  computeAvailableInvoiceYears,
  computeInvoiceSummaryTotals,
  filterInvoiceItems,
  filterInvoices,
  getInvoiceRowKey,
  ImportNotificationState,
  indexInvoiceItems,
  indexInvoices,
  InvoiceSortField,
  ItemSortField,
  SelectedInvoiceCell,
  sortInvoiceItems,
  sortInvoices,
} from "./utils/invoiceViewUtils";

const BATCH_SIZE = 150;

export interface ElectronicInvoicesPageProps {
  initialSearch?: string;
  isModal?: boolean;
  onClose?: () => void;
}

export const ElectronicInvoicesPage: React.FC<ElectronicInvoicesPageProps> = ({
  initialSearch,
  isModal = false,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"items" | "invoices">("items");
  const [items, setItems] = useState<SupplierInvoiceItem[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState(initialSearch || "");
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [onlyWithPrice, setOnlyWithPrice] = useState(true);
  const [showExtendedColumns, setShowExtendedColumns] = useState(false);

  const [itemSortField, setItemSortField] = useState<ItemSortField>("doc_date");
  const [itemSortAsc, setItemSortAsc] = useState(false);
  const [invSortField, setInvSortField] = useState<InvoiceSortField>("doc_date");
  const [invSortAsc, setInvSortAsc] = useState(false);

  const [selectedCell, setSelectedCell] = useState<SelectedInvoiceCell | null>(null);
  const [activeRowKey, setActiveRowKey] = useState<string | number | null>(null);
  const isKeyboardNavRef = useRef(false);
  const activeRowElementRef = useRef<HTMLTableRowElement | null>(null);
  const [copiedToast, setCopiedToast] = useState<string | null>(null);
  const [addToOrderTarget, setAddToOrderTarget] = useState<AddToOrderManagerItem | null>(null);

  const copyText = (text: string) => {
    if (!text || text === "—") return;
    void navigator.clipboard.writeText(text);
    setCopiedToast(`Copiato: "${text.slice(0, 32)}${text.length > 32 ? "..." : ""}"`);
    setTimeout(() => setCopiedToast(null), 2500);
  };

  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ msg: string; pct: number }>({ msg: "", pct: 0 });

  const [selectedInvoice, setSelectedInvoice] = useState<SupplierInvoice | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<SupplierInvoiceItem[]>([]);
  const [isLoadingLines, setIsLoadingLines] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ msg: string; pct: number }>({ msg: "", pct: 0 });
  const [importNotification, setImportNotification] = useState<ImportNotificationState | null>(null);

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

  useEffect(() => {
    if (initialSearch !== undefined) setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    if (!isModal || !onClose) return;
    const handleEscKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isDetailOpen || Boolean(addToOrderTarget)) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscKeyDown);
    return () => window.removeEventListener("keydown", handleEscKeyDown);
  }, [isModal, onClose, isDetailOpen, addToOrderTarget]);

  useEffect(() => {
    const handleCopyKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const mouseSelection = window.getSelection()?.toString();
        if (mouseSelection && mouseSelection.trim().length > 0) {
          void navigator.clipboard.writeText(mouseSelection);
          setCopiedToast(`Copiato: "${mouseSelection.slice(0, 32)}${mouseSelection.length > 32 ? "..." : ""}"`);
          setTimeout(() => setCopiedToast(null), 2500);
          return;
        }
        if (selectedCell && selectedCell.text && selectedCell.text !== "—") {
          e.preventDefault();
          copyText(selectedCell.text);
        }
      }
    };
    window.addEventListener("keydown", handleCopyKeyDown);
    return () => window.removeEventListener("keydown", handleCopyKeyDown);
  }, [selectedCell]);

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

  const indexedItems = useMemo(() => indexInvoiceItems(items), [items]);
  const indexedInvoices = useMemo(() => indexInvoices(invoices), [invoices]);
  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  const filteredItems = useMemo(
    () => filterInvoiceItems(indexedItems, selectedYear, onlyWithPrice, searchTokens),
    [indexedItems, selectedYear, onlyWithPrice, searchTokens]
  );
  const filteredInvoices = useMemo(
    () => filterInvoices(indexedInvoices, selectedYear, searchTokens),
    [indexedInvoices, selectedYear, searchTokens]
  );
  const sortedItems = useMemo(
    () => sortInvoiceItems(filteredItems, itemSortField, itemSortAsc),
    [filteredItems, itemSortField, itemSortAsc]
  );
  const sortedInvoices = useMemo(
    () => sortInvoices(filteredInvoices, invSortField, invSortAsc),
    [filteredInvoices, invSortField, invSortAsc]
  );

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

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
    if (tableContainerRef.current) tableContainerRef.current.scrollTop = 0;
  }, [deferredSearch, selectedYear, onlyWithPrice, activeTab, itemSortField, itemSortAsc, invSortField, invSortAsc]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const maxLen = activeTab === "items" ? sortedItems.length : sortedInvoices.length;
    if (scrollTop + clientHeight >= scrollHeight - 350) {
      setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, maxLen));
    }
  };

  const visibleItems = useMemo(() => sortedItems.slice(0, visibleCount), [sortedItems, visibleCount]);
  const visibleInvoices = useMemo(() => sortedInvoices.slice(0, visibleCount), [sortedInvoices, visibleCount]);

  useEffect(() => {
    if (isKeyboardNavRef.current && activeRowElementRef.current) {
      activeRowElementRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeRowKey]);

  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "PageUp" && e.key !== "PageDown") return;
    const currentList = activeTab === "items" ? visibleItems : visibleInvoices;
    if (currentList.length === 0) return;
    e.preventDefault();

    const currentIndex = activeRowKey != null ? currentList.findIndex((r) => getInvoiceRowKey(r) === activeRowKey) : -1;
    let nextIndex = currentIndex;
    if (e.key === "ArrowDown") nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, currentList.length - 1);
    else if (e.key === "ArrowUp") nextIndex = currentIndex === -1 ? 0 : Math.max(currentIndex - 1, 0);
    else if (e.key === "PageDown") nextIndex = currentIndex === -1 ? 10 : Math.min(currentIndex + 15, currentList.length - 1);
    else if (e.key === "PageUp") nextIndex = currentIndex === -1 ? 0 : Math.max(currentIndex - 15, 0);

    if (nextIndex !== -1 && nextIndex !== currentIndex) {
      isKeyboardNavRef.current = true;
      const nextKey = getInvoiceRowKey(currentList[nextIndex]);
      setActiveRowKey(nextKey);
      if (activeTab === "items") {
        const row = currentList[nextIndex] as SupplierInvoiceItem;
        setSelectedCell({
          rowKey: nextKey,
          col: selectedCell?.col || "article_code",
          text: (selectedCell?.col === "description" ? row.description : row.article_code) || "",
        });
      }
    }
  };

  const handleOpenDetailFromItem = async (item: SupplierInvoiceItem) => {
    setIsLoadingLines(true);
    setIsDetailOpen(true);
    try {
      const found = item.invoice_id == null ? undefined : await electronicInvoicesService.getInvoiceById(item.invoice_id);
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
        item.doc_date,
        item.invoice_id
      );
      setInvoiceLines(lines.length > 0 ? lines : [item]);
    } catch (err) {
      console.warn("Errore caricamento linee documento:", err);
    } finally {
      setIsLoadingLines(false);
    }
  };

  const handleOpenDetailFromInvoice = async (inv: SupplierInvoice) => {
    setSelectedInvoice(inv);
    setIsLoadingLines(true);
    setIsDetailOpen(true);
    try {
      const lines = await electronicInvoicesService.getInvoiceLines(
        inv.supplier_name,
        inv.doc_number,
        inv.doc_date,
        inv.id
      );
      setInvoiceLines(lines);
    } catch (err) {
      console.warn("Errore caricamento linee:", err);
    } finally {
      setIsLoadingLines(false);
    }
  };

  const handleSyncCloud = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setError("");
    try {
      await electronicInvoicesService.syncFromSupabase((msg, pct) => setSyncProgress({ msg, pct }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sincronizzazione non riuscita.");
    } finally {
      setIsSyncing(false);
    }
  };

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
      const payload: { name: string; content: string | ArrayBuffer }[] = [];
      for (let i = 0; i < xmlFiles.length; i++) {
        const file = xmlFiles[i];
        setImportProgress({
          msg: `Lettura ${file.name} (${i + 1}/${xmlFiles.length})...`,
          pct: Math.round(((i + 1) / xmlFiles.length) * 20),
        });
        payload.push({ name: file.name, content: await file.arrayBuffer() });
      }
      const res = await electronicInvoicesService.importXmlFiles(payload, (msg, pct) =>
        setImportProgress({ msg, pct })
      );
      await loadData();

      if (res.importedInvoices > 0) {
        let msg = `Importate con successo ${res.importedInvoices} fattur${res.importedInvoices === 1 ? "a" : "e"} (${res.totalLines} righe articolo).`;
        if (res.skippedDuplicates > 0) {
          msg += ` ${res.skippedDuplicates} fattur${res.skippedDuplicates === 1 ? "a" : "e"} già present${res.skippedDuplicates === 1 ? "e" : "i"} saltat${res.skippedDuplicates === 1 ? "a" : "e"}.`;
        }
        if (res.cloudSynced) msg += ` Sincronizzato con Supabase Cloud.`;
        else if (res.cloudError) msg += ` (Salvate localmente; Cloud non sincronizzato).`;
        setImportNotification({ type: "success", message: msg });
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDraggingOver(true);
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
      await handleProcessFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleProcessFiles(Array.from(e.target.files));
    }
  };

  const availableYears = useMemo(() => computeAvailableInvoiceYears(invoices, items), [invoices, items]);
  const summaryTotals = useMemo(
    () => computeInvoiceSummaryTotals(activeTab, filteredInvoices, filteredItems),
    [activeTab, filteredInvoices, filteredItems]
  );

  return (
    <div
      className="relative flex h-full w-full flex-col gap-2 p-2 overflow-hidden text-[var(--foreground)]"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".xml,.p7m"
        onChange={handleFileInputChange}
        className="hidden"
      />

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

      {isModal && (
        <div className="flex h-10 shrink-0 items-center justify-between rounded-md bg-slate-900 border border-slate-800 px-3 text-xs text-slate-200 shadow-sm">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <Receipt className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-bold text-xs sm:text-sm tracking-wide text-white truncate">
              Fatture Elettroniche Fornitori
            </span>
            <span className="hidden md:inline text-[11px] text-slate-400 border-l border-slate-700 pl-2.5">
              Ricerca rapida prezzi e storico acquisti
            </span>
            {initialSearch && (
              <span className="hidden sm:inline px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 font-mono text-[11px] truncate max-w-xs">
                Filtro: {initialSearch}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white border border-slate-700 hover:border-rose-500 transition-colors cursor-pointer shrink-0"
            title="Chiudi popup (ESC)"
          >
            <span>Chiudi</span>
            <span className="text-[10px] font-mono opacity-65">(ESC)</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <ElectronicInvoicesToolbar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        itemsTotalCount={items.length}
        invoicesTotalCount={invoices.length}
        search={search}
        onChangeSearch={setSearch}
        searchInputRef={searchInputRef}
        selectedYear={selectedYear}
        onChangeYear={setSelectedYear}
        availableYears={availableYears}
        showExtendedColumns={showExtendedColumns}
        onToggleExtendedColumns={() => setShowExtendedColumns(!showExtendedColumns)}
        onlyWithPrice={onlyWithPrice}
        onChangeOnlyWithPrice={setOnlyWithPrice}
        summaryTotals={summaryTotals}
        loading={loading}
        isSyncing={isSyncing}
        syncProgress={syncProgress}
        isImporting={isImporting}
        importProgress={importProgress}
        importNotification={importNotification}
        onDismissImportNotification={() => setImportNotification(null)}
        error={error}
        onTriggerImportXml={() => fileInputRef.current?.click()}
        onSyncCloud={handleSyncCloud}
        onReload={() => void loadData()}
      />

      {loading && items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Caricamento righe...
        </div>
      ) : activeTab === "items" ? (
        <InvoiceItemsTable
          visibleItems={visibleItems}
          totalItemsCount={items.length}
          sortedItemsCount={sortedItems.length}
          showExtendedColumns={showExtendedColumns}
          sortField={itemSortField}
          sortAsc={itemSortAsc}
          onToggleSort={handleToggleItemSort}
          activeRowKey={activeRowKey}
          selectedCell={selectedCell}
          activeRowElementRef={activeRowElementRef}
          tableContainerRef={tableContainerRef}
          onSelectRow={(rowKey) => {
            isKeyboardNavRef.current = false;
            setActiveRowKey(rowKey);
          }}
          onSelectCell={(cell) => {
            isKeyboardNavRef.current = false;
            setActiveRowKey(cell.rowKey);
            setSelectedCell(cell);
          }}
          onCopyText={copyText}
          onOpenDetail={(row) => void handleOpenDetailFromItem(row)}
          onAddToOrder={setAddToOrderTarget}
          onKeyDown={handleTableKeyDown}
          onScroll={handleScroll}
        />
      ) : (
        <InvoiceHeadersTable
          visibleInvoices={visibleInvoices}
          sortedInvoicesCount={sortedInvoices.length}
          sortField={invSortField}
          sortAsc={invSortAsc}
          onToggleSort={handleToggleInvSort}
          activeRowKey={activeRowKey}
          activeRowElementRef={activeRowElementRef}
          tableContainerRef={tableContainerRef}
          onSelectRow={(rowKey) => {
            isKeyboardNavRef.current = false;
            setActiveRowKey(rowKey);
          }}
          onOpenDetail={(inv) => void handleOpenDetailFromInvoice(inv)}
          onKeyDown={handleTableKeyDown}
          onScroll={handleScroll}
        />
      )}

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

      <InvoiceDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        invoice={selectedInvoice}
        lines={invoiceLines}
        isLoadingLines={isLoadingLines}
      />

      <AddToOrderManagerModal
        isOpen={Boolean(addToOrderTarget)}
        onClose={() => setAddToOrderTarget(null)}
        item={addToOrderTarget}
        onSuccess={(msg) => {
          setCopiedToast(msg);
          setTimeout(() => setCopiedToast(null), 3500);
        }}
      />

      {copiedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150 pointer-events-none">
          <Check className="w-4 h-4" />
          <span>{copiedToast}</span>
        </div>
      )}
    </div>
  );
};

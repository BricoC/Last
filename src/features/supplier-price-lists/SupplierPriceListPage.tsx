import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams, CellKeyDownEvent } from "ag-grid-community";
import {
  Search,
  RefreshCw,
  FolderOpen,
  Truck,
  ExternalLink,
  Trash2,
  Calendar,
  X,
  Database,
} from "lucide-react";
import { SupplierPriceListService } from "./services/supplierPriceListService";
import type {
  SupplierPriceListItem,
  SupplierDistinctInfo,
} from "./models/supplierPriceList";
import { invoke } from "@tauri-apps/api/core";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

export const SupplierPriceListPage: React.FC = () => {
  const [items, setItems] = useState<SupplierPriceListItem[]>([]);
  const [totalDbCount, setTotalDbCount] = useState(0);
  const [suppliers, setSuppliers] = useState<SupplierDistinctInfo[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const copyToastTimerRef = useRef<number | null>(null);

  // Stato sincronizzazione scansione cartella
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    text: string;
    pct?: number;
  } | null>(null);

  // Modal impostazioni cartella
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderInput, setFolderInput] = useState(
    SupplierPriceListService.getFolderPath()
  );

  // Modal gestione/eliminazione rapida listini
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);

  const gridRef = useRef<AgGridReact<SupplierPriceListItem>>(null);

  // Chiusura dei popup con tasto ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFolderModalOpen) setIsFolderModalOpen(false);
        if (isManageModalOpen) setIsManageModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFolderModalOpen, isManageModalOpen]);

  // Caricamento elenco fornitori e conteggio totale
  const loadSuppliers = useCallback(async () => {
    try {
      const distinct = await SupplierPriceListService.getDistinctSuppliers();
      setSuppliers(distinct);
      const total = distinct.reduce((sum, s) => sum + s.items_count, 0);
      setTotalDbCount(total);
    } catch (err) {
      console.error("[SupplierPriceListPage] Errore caricamento fornitori:", err);
    }
  }, []);

  // Esecuzione ricerca con Virtual Scrolling (fino a 10.000 righe in memoria virtuale)
  const performSearch = useCallback(
    async (query: string, supplier: string) => {
      setIsLoading(true);
      try {
        const res = await SupplierPriceListService.searchItems({
          query,
          supplier: supplier === "ALL" ? undefined : supplier,
          limit: 10000,
          offset: 0,
        });
        setItems(res.items);
      } catch (err) {
        console.error("[SupplierPriceListPage] Errore ricerca articoli:", err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void (async () => {
      await loadSuppliers();
      await performSearch("", "ALL");
    })();
  }, [loadSuppliers, performSearch]);

  // Debounce ricerca testo
  const searchTimeoutRef = useRef<number | null>(null);
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = window.setTimeout(() => {
      void performSearch(val, selectedSupplier);
    }, 200);
  };

  const handleSupplierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const supp = e.target.value;
    setSelectedSupplier(supp);
    void performSearch(searchQuery, supp);
  };

  // Sincronizzazione automatica da cartella:
  // - Rileva file nuovi o modificati
  // - Elimina automaticamente i listini dei file rimossi dalla cartella
  // - ZERO voci doppie
  const handleStartSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncProgress({ text: "Verifica e pulizia file cartella...", pct: 0 });

    try {
      const result = await SupplierPriceListService.scanAndSync((info) => {
        setSyncProgress({
          text: info.progressText,
          pct: info.pct,
        });
      }, true);

      await loadSuppliers();
      await performSearch(searchQuery, selectedSupplier);

      alert(
        `Scansione completata con successo!\n\n` +
          `- File caricati/aggiornati: ${result.updatedFiles}\n` +
          `- File rimossi cancellati dall'archivio: ${result.deletedFiles}\n` +
          `- File già sincronizzati: ${result.skippedFiles}\n` +
          `- Totale articoli in archivio: ${result.totalItems.toLocaleString()}`
      );
    } catch (err) {
      alert(`Errore scansione cartella listini: ${err}`);
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleDeleteSupplier = async (supplierName: string) => {
    if (!supplierName || supplierName === "ALL") return;
    if (
      !window.confirm(
        `Vuoi eliminare completamente il listino del fornitore "${supplierName}" dall'archivio locale?`
      )
    ) {
      return;
    }

    try {
      await SupplierPriceListService.deleteSupplier(supplierName);
      if (selectedSupplier === supplierName) {
        setSelectedSupplier("ALL");
      }
      await loadSuppliers();
      await performSearch(searchQuery, "ALL");
    } catch (err) {
      alert(`Errore eliminazione fornitore: ${err}`);
    }
  };

  // Estrazione valore pulito della cella per copia con Ctrl+C
  const extractSupplierCellValue = useCallback(
    (colId: string, data: SupplierPriceListItem): string => {
      switch (colId) {
        case "code":
          return data.code || "";
        case "extra_code":
          return data.extra_code || "";
        case "description":
          return data.description || "";
        case "supplier_name":
          return data.supplier_name || "";
        case "price":
          return data.price > 0
            ? data.price.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 3 })
            : "";
        case "net_price":
          return data.net_price && data.net_price > 0
            ? data.net_price.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 3 })
            : "";
        case "unit":
          return data.unit || "";
        case "barcode":
          return data.barcode || "";
        case "brand":
          return data.brand || "";
        case "notes":
          return data.notes || "";
        case "list_date":
          return data.list_date || "";
        default:
          return String((data as any)[colId] || "");
      }
    },
    []
  );

  const copyCellValue = useCallback(
    (colId: string, data: SupplierPriceListItem) => {
      const val = extractSupplierCellValue(colId, data);
      if (!val) return;
      void navigator.clipboard.writeText(val);
      setCopyToast(`Copiato: "${val}"`);
      if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
      copyToastTimerRef.current = window.setTimeout(() => setCopyToast(null), 2000);
    },
    [extractSupplierCellValue]
  );

  // Gestore scorciatoia Ctrl+C da cella AG-Grid
  const handleCellKeyDown = useCallback(
    (e: CellKeyDownEvent<SupplierPriceListItem>) => {
      const keyEvt = e.event as KeyboardEvent | undefined;
      if (!keyEvt) return;
      const isCtrlOrMeta = keyEvt.ctrlKey || keyEvt.metaKey;
      if (isCtrlOrMeta && keyEvt.key.toLowerCase() === "c") {
        // Se l'utente ha selezionato del testo col mouse, lascia fare la copia nativa al browser
        const sel = window.getSelection()?.toString();
        if (sel && sel.trim().length > 0) return;

        if (e.data && e.column) {
          keyEvt.preventDefault();
          copyCellValue(e.column.getColId(), e.data);
        }
      }
    },
    [copyCellValue]
  );

  // Gestore contenitore per catturare Ctrl+C anche da wrapper tabella
  const handleGridContainerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const sel = window.getSelection()?.toString();
        if (sel && sel.trim().length > 0) return;

        const focusedCell = gridRef.current?.api?.getFocusedCell();
        if (!focusedCell) return;
        const rowNode = gridRef.current?.api?.getDisplayedRowAtIndex(focusedCell.rowIndex);
        if (!rowNode?.data) return;

        const colId =
          typeof focusedCell.column === "string"
            ? focusedCell.column
            : focusedCell.column.getColId();
        e.preventDefault();
        copyCellValue(colId, rowNode.data);
      }
    },
    [copyCellValue]
  );

  const currentFolder = SupplierPriceListService.getFolderPath();

  const handleOpenFolderExplorer = async () => {
    try {
      await invoke("open_folder_in_explorer", { folderPath: currentFolder });
    } catch (err) {
      alert(`Impossibile aprire la cartella in Esplora Risorse: ${err}`);
    }
  };

  const handleSaveFolderPath = () => {
    if (!folderInput.trim()) return;
    SupplierPriceListService.setFolderPath(folderInput);
    setIsFolderModalOpen(false);
    void handleStartSync();
  };

  // Comparatori per ordinamento naturale (alfanumerico stile Excel e numerico per prezzi)
  const stringComparator = useCallback(
    (a: string | null | undefined, b: string | null | undefined) => {
      return (a || "").localeCompare(b || "", "it", { numeric: true, sensitivity: "base" });
    },
    []
  );

  const numberComparator = useCallback(
    (a: number | null | undefined, b: number | null | undefined) => {
      return (a ?? 0) - (b ?? 0);
    },
    []
  );

  // Colonne AG-Grid con Virtual DOM nativo, ordinamento completo e selezione/copia stile Excel
  const columnDefs = useMemo<ColDef<SupplierPriceListItem>[]>(
    () => [
      {
        headerName: "FORNITORE",
        field: "supplier_name",
        width: 125,
        sortable: true,
        comparator: stringComparator,
        cellRenderer: (p: ICellRendererParams<SupplierPriceListItem>) => (
          <div className="flex items-center h-full">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-zinc-800 text-zinc-300 border border-zinc-700 select-text">
              {p.value}
            </span>
          </div>
        ),
      },
      {
        headerName: "CODICE ARTICOLO",
        field: "code",
        width: 160,
        sortable: true,
        comparator: stringComparator,
        cellRenderer: (p: ICellRendererParams<SupplierPriceListItem>) => (
          <div className="flex items-center w-full h-full font-mono font-bold text-white tracking-wide">
            <span className="select-text truncate">{p.value || "—"}</span>
          </div>
        ),
      },
      {
        headerName: "COD. VECCHIO / RIF.",
        field: "extra_code",
        width: 155,
        sortable: true,
        comparator: stringComparator,
        headerClass: "bg-amber-950/20 text-amber-300",
        cellRenderer: (p: ICellRendererParams<SupplierPriceListItem>) => {
          if (!p.data || !p.data.extra_code) {
            return (
              <div className="flex items-center h-full">
                <span className="text-zinc-600 font-mono">—</span>
              </div>
            );
          }
          return (
            <div className="flex items-center w-full h-full font-mono text-[11px] text-amber-300/90 tracking-wide">
              <span className="select-text truncate">{p.data.extra_code}</span>
            </div>
          );
        },
      },
      {
        headerName: "DESCRIZIONE PRODOTTO",
        field: "description",
        minWidth: 280,
        flex: 1,
        sortable: true,
        comparator: stringComparator,
        cellRenderer: (p: ICellRendererParams<SupplierPriceListItem>) => (
          <div className="flex items-center h-full">
            <span className="select-text font-sans text-xs text-zinc-200 truncate">
              {p.value}
            </span>
          </div>
        ),
      },
      {
        headerName: "LISTINO € (LORDO)",
        field: "price",
        width: 135,
        sortable: true,
        comparator: numberComparator,
        headerClass: "text-sky-300 font-bold",
        cellClass: "!text-right !font-mono !font-bold !text-sky-400 select-text",
        valueFormatter: (p) => {
          if (!p.value || Number(p.value) === 0) return "—";
          return (
            Number(p.value).toLocaleString("it-IT", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 3,
            }) + " €"
          );
        },
      },
      {
        headerName: "NETTO € (ACQ.)",
        field: "net_price",
        width: 135,
        sortable: true,
        comparator: numberComparator,
        headerClass: "text-emerald-300 font-bold",
        cellClass: "!text-right !font-mono !font-bold !text-emerald-400 select-text",
        valueFormatter: (p) => {
          if (!p.value || Number(p.value) === 0) return "—";
          return (
            Number(p.value).toLocaleString("it-IT", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 3,
            }) + " €"
          );
        },
      },
      {
        headerName: "U.M.",
        field: "unit",
        width: 65,
        sortable: true,
        comparator: stringComparator,
        cellClass: "!text-center !text-zinc-400 select-text",
      },
      {
        headerName: "BARCODE / EAN",
        field: "barcode",
        width: 135,
        sortable: true,
        comparator: stringComparator,
        cellClass: "!font-mono !text-[11px] !text-zinc-400 select-text",
        valueFormatter: (p) => p.value || "—",
      },
      {
        headerName: "DATA LISTINO",
        field: "list_date",
        width: 115,
        sortable: true,
        comparator: stringComparator,
        cellRenderer: (p: ICellRendererParams<SupplierPriceListItem>) => (
          <div className="flex items-center justify-center h-full gap-1 text-[11px] font-semibold text-blue-300 select-text">
            <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
            <span>{p.value || "2026"}</span>
          </div>
        ),
      },
      {
        headerName: "BRAND",
        field: "brand",
        width: 105,
        sortable: true,
        comparator: stringComparator,
        cellClass: "!text-zinc-400 !text-[11px] select-text",
        valueFormatter: (p) => p.value || "—",
      },
      {
        headerName: "NOTE / RIFERIMENTI",
        field: "notes",
        width: 170,
        sortable: true,
        comparator: stringComparator,
        cellClass: "!text-zinc-400 !text-[11px] select-text",
        valueFormatter: (p) => p.value || "—",
      },
    ],
    [stringComparator, numberComparator]
  );

  return (
    <div className="flex flex-col w-full h-full bg-[#18181b] text-zinc-100 select-none overflow-hidden">
      {/* 1. TOPBAR FILTRI & RICERCA (Textbox dinamica a tutta larghezza disponibile) */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#202024] border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 shrink-0">
            <Truck className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold tracking-wide uppercase">
              Listini Fornitori
            </span>
          </div>

          {/* Ricerca multi-parola lunga tutto lo spazio vuoto della riga */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleQueryChange}
              placeholder="Cerca multi-parola in tempo reale (es. INECO 007, vite 8.8, FERMEC giravite, FACOM, barcode EAN)..."
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-zinc-900 border border-zinc-700 rounded-md text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  void performSearch("", selectedSupplier);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtro Fornitore con Cestino Rapido Sempre Visibile */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-zinc-400 font-medium">Fornitore:</span>
            <select
              value={selectedSupplier}
              onChange={handleSupplierChange}
              className="text-xs bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 text-white font-medium focus:outline-none focus:border-blue-500 max-w-[200px]"
            >
              <option value="ALL">
                Tutti i Fornitori ({totalDbCount.toLocaleString()})
              </option>
              {suppliers.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.items_count.toLocaleString()})
                </option>
              ))}
            </select>

            {/* Cestino rapido fornitore:
                - Se è selezionato un fornitore singolo, elimina subito quel listino
                - Se è selezionato "Tutti i Fornitori", apre la finestra di gestione per scegliere quale fornitore cancellare */}
            <button
              onClick={() => {
                if (selectedSupplier !== "ALL") {
                  void handleDeleteSupplier(selectedSupplier);
                } else {
                  setIsManageModalOpen(true);
                }
              }}
              className="p-1.5 bg-zinc-800 hover:bg-rose-950/60 hover:text-rose-400 text-zinc-400 rounded border border-zinc-700 transition-colors cursor-pointer"
              title={
                selectedSupplier !== "ALL"
                  ? `Elimina listino "${selectedSupplier}" dall'archivio locale`
                  : "Gestisci / Elimina listini fornitori"
              }
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Azioni destra: Aggiorna e Cartella */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleStartSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 text-white text-xs font-semibold rounded-md shadow-sm transition-colors cursor-pointer"
            title="Scansiona la cartella: carica nuovi, aggiorna modificati ed elimina i file cancellati"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-white" : ""}`}
            />
            <span>{isSyncing ? "Scansione..." : "Aggiorna Listini"}</span>
          </button>

          <button
            onClick={() => setIsFolderModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-md border border-zinc-700 transition-colors cursor-pointer"
            title="Visualizza o cambia il percorso della cartella listini"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Cartella</span>
          </button>
        </div>
      </div>

      {/* BARRA DI STATO SCANSIONE (QUANDO ATTIVA) */}
      {isSyncing && syncProgress && (
        <div className="px-4 py-2 bg-blue-950/70 border-b border-blue-800/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-blue-300 font-medium">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
            <span>{syncProgress.text}</span>
          </div>
          {syncProgress.pct !== undefined && (
            <div className="w-48 bg-zinc-800 rounded-full h-2 overflow-hidden shrink-0">
              <div
                className="bg-blue-500 h-2 transition-all duration-300"
                style={{ width: `${syncProgress.pct}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* 2. TABELLA ARTICOLI AD ALTE PRESTAZIONI CON VIRTUAL DOM SCROLLING (AG-GRID) */}
      <div
        onKeyDown={handleGridContainerKeyDown}
        className="supplier-price-lists-grid ag-theme-alpine flex-1 min-h-0 w-full overflow-hidden relative"
      >
        <style>{`
          .supplier-price-lists-grid.ag-theme-alpine {
            --ag-background-color: #18181b;
            --ag-header-background-color: #202024;
            --ag-odd-row-background-color: #18181b;
            --ag-row-hover-color: #27272a;
            --ag-foreground-color: #f4f4f5;
            --ag-border-color: #27272a;
            --ag-header-foreground-color: #a1a1aa;
            --ag-font-size: 12px;
            --ag-secondary-foreground-color: #38bdf8;
          }
          .supplier-price-lists-grid.ag-theme-alpine .ag-header-cell {
            font-weight: 700;
            font-size: 10px;
            letter-spacing: 0.05em;
            cursor: pointer !important;
            user-select: none !important;
          }
          .supplier-price-lists-grid.ag-theme-alpine .ag-header-cell:hover {
            background-color: #27272a !important;
          }
          .supplier-price-lists-grid.ag-theme-alpine .ag-header-icon,
          .supplier-price-lists-grid.ag-theme-alpine .ag-sort-indicator-icon,
          .supplier-price-lists-grid.ag-theme-alpine .ag-sort-indicator-container {
            color: #38bdf8 !important;
            opacity: 1 !important;
          }
          .supplier-price-lists-grid.ag-theme-alpine .ag-row {
            border-bottom: 1px solid #27272a;
          }
          .supplier-price-lists-grid.ag-theme-alpine .ag-cell {
            display: flex;
            align-items: center;
          }
          /* Evidenziazione cella attiva STILE LISTINO GENERALE */
          .supplier-price-lists-grid.ag-theme-alpine .ag-cell.ag-cell-focus {
            outline: 2px solid #38bdf8 !important;
            outline-offset: -2px !important;
            background-color: rgba(56, 189, 248, 0.18) !important;
            box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.85) !important;
            z-index: 2 !important;
          }
          .supplier-price-lists-grid.ag-theme-alpine .ag-row.ag-row-focus {
            background-color: rgba(56, 189, 248, 0.06) !important;
          }
        `}</style>

        {items.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-zinc-500">
            <Database className="w-10 h-10 text-zinc-600 mb-2" />
            <span className="font-semibold text-zinc-300 text-sm">
              Nessun articolo trovato
            </span>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">
              {totalDbCount === 0
                ? "L'archivio è vuoto. Clicca su 'Aggiorna Listini' in alto per indicizzare automaticamente la cartella dei listini."
                : "Nessun articolo corrisponde ai filtri impostati."}
            </p>
            {totalDbCount === 0 && (
              <button
                onClick={handleStartSync}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold text-xs transition-colors cursor-pointer"
              >
                Avvia Indicizzazione Listini
              </button>
            )}
          </div>
        ) : (
          <AgGridReact<SupplierPriceListItem>
            ref={gridRef}
            rowData={items}
            columnDefs={columnDefs}
            rowHeight={36}
            headerHeight={34}
            animateRows={false}
            enableCellTextSelection={true}
            ensureDomOrder={true}
            suppressScrollOnNewData={true}
            onCellKeyDown={handleCellKeyDown}
            defaultColDef={{
              resizable: true,
              sortable: true,
              unSortIcon: true,
              suppressMovable: false,
              filter: false,
            }}
          />
        )}
      </div>

      {/* MODAL CONFIGURAZIONE CARTELLA CONDIVISA (ESC support) */}
      {isFolderModalOpen && (
        <div
          onClick={() => setIsFolderModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#242428] border border-zinc-700 rounded-xl shadow-2xl w-full max-w-lg p-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-700 mb-4">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">
                  Cartella Condivisa Listini Fornitori
                </h3>
              </div>
              <button
                onClick={() => setIsFolderModalOpen(false)}
                className="text-zinc-400 hover:text-white"
                title="Chiudi (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed mb-4">
              I file Excel dei listini vengono cercati in questa cartella (es. su OneDrive o una cartella di rete condivisa).
              Quando cancelli o sostituisci un file nella cartella, premendo <strong>&quot;Aggiorna Listini&quot;</strong> il programma rimuove le vecchie voci e carica quelle aggiornate in automatico, senza duplicati.
            </p>

            <div className="mb-4">
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Percorso Cartella:
              </label>
              <input
                type="text"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-900 border border-zinc-700 rounded-md text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <button
                onClick={handleOpenFolderExplorer}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-medium transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Apri in Esplora Risorse</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFolderModalOpen(false)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-medium transition-colors cursor-pointer"
                >
                  Annulla (Esc)
                </button>
                <button
                  onClick={handleSaveFolderPath}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                >
                  Salva e Scansiona
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GESTIONE ED ELIMINAZIONE LISTINI FORNITORI (ESC support) */}
      {isManageModalOpen && (
        <div
          onClick={() => setIsManageModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#242428] border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md p-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-700 mb-3">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-400" />
                <h3 className="text-sm font-bold text-white">
                  Gestione &amp; Eliminazione Listini
                </h3>
              </div>
              <button
                onClick={() => setIsManageModalOpen(false)}
                className="text-zinc-400 hover:text-white"
                title="Chiudi (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 mb-3">
              Fai clic sull&apos;icona del cestino accanto al fornitore che desideri rimuovere dall&apos;archivio locale:
            </p>

            <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800 pr-1">
              {suppliers.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between py-2 px-1 hover:bg-zinc-800/50 rounded transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white tracking-wide">
                      {s.name}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {s.items_count.toLocaleString()} articoli
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      await handleDeleteSupplier(s.name);
                    }}
                    className="p-1.5 bg-zinc-800 hover:bg-rose-950/60 hover:text-rose-400 text-zinc-400 rounded border border-zinc-700 transition-colors cursor-pointer"
                    title={`Elimina ${s.name} dall'archivio`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-800 mt-3">
              <button
                onClick={() => setIsManageModalOpen(false)}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-xs font-medium transition-colors cursor-pointer"
              >
                Chiudi (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifica rapida Ctrl+C */}
      {copyToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-sky-950/95 border border-sky-400 text-sky-200 px-3.5 py-2 rounded-lg shadow-2xl text-xs font-semibold flex items-center gap-2 pointer-events-none transition-all">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <span className="truncate max-w-md">{copyToast}</span>
        </div>
      )}
    </div>
  );
};

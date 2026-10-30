import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  CellValueChangedEvent,
  CellKeyDownEvent,
} from "ag-grid-community";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { OrderItem, Supplier } from "@/features/orders/types/order";
import { orderRepository } from "@/features/orders/services/orderRepository";
import { orderEmailService } from "@/features/orders/services/orderEmailService";
import { orderExcelService } from "@/features/orders/services/orderExcelService";
import { getFornitoreColor } from "@/features/orders/utils/constants";
import {
  Package,
  Archive,
  Trash2,
  Highlighter,
  Download,
  Mail,
  RotateCcw,
  CheckCircle2,
  Plus,
  X,
  Search,
} from "lucide-react";

interface OrderGlobalSearchTabProps {
  searchQuery: string;
  suppliers: Supplier[];
  currentUser?: string;
  onClearSearch: () => void;
  onRefreshSuppliers?: () => void;
}

export const OrderGlobalSearchTab: React.FC<OrderGlobalSearchTabProps> = ({
  searchQuery,
  suppliers,
  currentUser = "Operatore",
  onClearSearch,
}) => {
  const activeGridRef = useRef<AgGridReact<OrderItem>>(null);
  const otherGridRef = useRef<AgGridReact<OrderItem>>(null);
  const focusedSupplierRef = useRef<string | null>(null);

  const [activeOrders, setActiveOrders] = useState<OrderItem[]>([]);
  const [otherOrders, setOtherOrders] = useState<OrderItem[]>([]);
  const [selectedActiveRows, setSelectedActiveRows] = useState<OrderItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Esegue la ricerca multi-parola e divide tra attivi e altri
  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setActiveOrders([]);
      setOtherOrders([]);
      return;
    }
    try {
      const res = await orderRepository.searchAll(query);
      const active = res.orders.filter((o) => !o.is_archived && !o.is_deleted);
      const others = res.orders.filter((o) => o.is_archived || o.is_deleted);
      setActiveOrders(active);
      setOtherOrders(others);
    } catch {
      // Ignora errori minori
    }
  }, []);

  useEffect(() => {
    void runSearch(searchQuery);
  }, [searchQuery, runSearch]);

  // Gestione modifica celle nella griglia in alto (Ordini Attivi)
  const onActiveCellValueChanged = useCallback(
    async (event: CellValueChangedEvent) => {
      if (event.oldValue === event.newValue) return;
      const { data, node } = event;
      if (!data) return;

      const itemToSave: OrderItem = {
        ...data,
        description: (data.description || "").toUpperCase(),
      };

      try {
        await orderRepository.upsertOrder(itemToSave, currentUser);
        if (node) node.setData(itemToSave);
        setActiveOrders((prev) => prev.map((r) => (r.id === itemToSave.id ? itemToSave : r)));
        showToast("Modifica salvata");
      } catch {
        showToast("Errore durante il salvataggio");
      }
    },
    [currentUser]
  );

  // Stop propagazione frecce verso finestra esterna e svuotamento cella con Delete/Backspace
  const onCellKeyDown = useCallback((e: CellKeyDownEvent) => {
    const ev = e.event as KeyboardEvent;
    if (!ev) return;

    if (
      (ev.key === "Delete" || ev.key === "Backspace") &&
      !window.__isOrderCellEditing &&
      e.column.isCellEditable(e.node)
    ) {
      const colId = e.column.getColId();
      if (e.value !== "" && e.value !== null && e.value !== undefined) {
        ev.preventDefault();
        e.node.setDataValue(colId, "");
      }
      return;
    }

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"].includes(ev.key)) {
      ev.stopPropagation();
    }
  }, []);

  // Ripristina elemento dall'archivio o cestino negli attivi
  const handleRestoreFromOthers = async (ord: OrderItem) => {
    try {
      if (ord.is_deleted) {
        await orderRepository.restoreFromTrash([ord.id], currentUser);
      } else {
        await orderRepository.restoreFromArchive([ord.id], currentUser);
      }
      showToast(`Ordine "${ord.article_code || ord.description}" ripristinato negli Attivi!`);
      void runSearch(searchQuery);
    } catch {
      showToast("Errore durante il ripristino");
    }
  };

  // Riordina: clona elemento e crea nuovo ordine attivo con data odierna
  const handleReorderFromOthers = async (ord: OrderItem) => {
    try {
      await orderRepository.reorderArticles(
        [
          {
            supplier_name: ord.supplier_name,
            article_code: ord.article_code,
            description: ord.description,
            price: ord.price,
            quantity: ord.quantity || "1",
            notes: "Riordinato da ricerca",
          },
        ],
        currentUser
      );
      showToast(`Articolo "${ord.article_code || ord.description}" inserito negli Ordini Attivi!`);
      void runSearch(searchQuery);
    } catch {
      showToast("Errore durante il riordino");
    }
  };

  // Evidenzia Cella
  const handleHighlightActiveCell = async () => {
    if (!activeGridRef.current?.api) return;
    const cell = activeGridRef.current.api.getFocusedCell();
    if (!cell) {
      showToast("Seleziona prima una cella da evidenziare");
      return;
    }
    const node = activeGridRef.current.api.getDisplayedRowAtIndex(cell.rowIndex);
    if (!node || !node.data) return;

    const colId = cell.column.getColId();
    try {
      const newHighlights = await orderRepository.toggleCellHighlight(node.data.id, colId);
      node.setData({ ...node.data, highlights: newHighlights });
      activeGridRef.current.api.redrawRows({ rowNodes: [node] });
      showToast("Evidenziazione aggiornata");
    } catch {
      showToast("Errore evidenziazione");
    }
  };

  // Invia ordine per fornitore selezionato
  const handleSendOrderEmail = async () => {
    let targetSupplier: string | null = focusedSupplierRef.current;
    if (!targetSupplier && activeGridRef.current?.api) {
      const cell = activeGridRef.current.api.getFocusedCell();
      if (cell) {
        const node = activeGridRef.current.api.getDisplayedRowAtIndex(cell.rowIndex);
        if (node?.data?.supplier_name) {
          targetSupplier = node.data.supplier_name;
        }
      }
    }

    if (!targetSupplier) {
      showToast("Seleziona una riga con il fornitore da ordinare");
      return;
    }

    const itemsForSupplier = activeOrders.filter(
      (r) =>
        (r.supplier_name || "").trim().toLowerCase() === targetSupplier!.trim().toLowerCase() &&
        !r.ordered_date
    );

    if (itemsForSupplier.length === 0) {
      showToast(`Nessun articolo in sospeso per ${targetSupplier}`);
      return;
    }

    const supData = suppliers.find(
      (s) => (s.name || "").toLowerCase() === targetSupplier!.toLowerCase()
    );

    const res = await orderEmailService.sendOrderEmail({
      supplierName: targetSupplier,
      items: itemsForSupplier,
      supplier: supData,
      currentUser,
    });

    if (res.success) {
      showToast(`Anteprima Outlook aperta per ${targetSupplier}`);
      void runSearch(searchQuery);
    } else {
      showToast(`Errore invio: ${res.error}`);
    }
  };

  // Sposta selezionati nel cestino
  const handleDeleteSelected = async () => {
    if (selectedActiveRows.length === 0) return;
    const ids = selectedActiveRows.map((r) => r.id);
    await orderRepository.moveToTrash(ids, currentUser);
    showToast(`${ids.length} ordini spostati nel cestino`);
    setSelectedActiveRows([]);
    void runSearch(searchQuery);
  };

  // Esporta tabella superiore in Excel
  const handleExportActiveExcel = async () => {
    const res = await orderExcelService.exportOrdersToExcel(activeOrders, "attivi");
    if (res.success) {
      showToast("File salvato sul Desktop con successo");
    } else {
      showToast(`Errore esportazione: ${res.error}`);
    }
  };

  // Colonne Tabella in Alto (Ordini Attivi - Esattamente identica alla principale)
  const activeColumnDefs: ColDef<OrderItem>[] = useMemo(
    () => [
      {
        headerName: "",
        width: 42,
        minWidth: 42,
        pinned: "left",
        checkboxSelection: true,
        headerCheckboxSelection: true,
        headerCheckboxSelectionFilteredOnly: true,
        suppressMenu: true,
        sortable: false,
        filter: false,
        resizable: false,
        cellClass: "centered-cell",
      },
      { field: "order_date", headerName: "Data", width: 105, editable: true },
      {
        field: "supplier_name",
        headerName: "Fornitore",
        width: 175,
        editable: true,
        cellRenderer: (p: any) => {
          if (!p.value) return "";
          const color = getFornitoreColor(p.value);
          if (!color) return p.value;
          return (
            <div className="flex items-center h-full">
              <span
                style={{
                  backgroundColor: color.bg,
                  color: color.text,
                  border: `1px solid ${color.border}`,
                }}
                className="px-2 py-0.5 rounded text-[11px] font-semibold truncate max-w-[155px]"
              >
                {p.value}
              </span>
            </div>
          );
        },
      },
      { field: "article_code", headerName: "Codice Articolo", width: 145, editable: true },
      {
        field: "description",
        headerName: "Descrizione Articolo",
        flex: 2,
        minWidth: 220,
        editable: true,
        valueFormatter: (p) => (p.value ? String(p.value).toUpperCase() : ""),
        valueSetter: (p) => {
          const val = p.newValue ? String(p.newValue).toUpperCase() : "";
          if (p.data.description !== val) {
            p.data.description = val;
            return true;
          }
          return false;
        },
      },
      { field: "quantity", headerName: "Quantità", width: 105, editable: true, cellClass: "centered-cell" },
      { field: "price", headerName: "Prezzo (€)", width: 120, editable: true },
      {
        field: "ordered_date",
        headerName: "Data Ordine",
        width: 115,
        editable: true,
        cellRenderer: (p: any) => {
          if (!p.value) return "";
          return (
            <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              {p.value}
            </span>
          );
        },
      },
      { field: "notes", headerName: "Note", flex: 1, minWidth: 160, editable: true },
      {
        headerName: "",
        width: 50,
        sortable: false,
        filter: false,
        cellClass: "centered-cell",
        cellRenderer: (p: any) => (
          <button
            onClick={() => {
              void orderRepository.moveToTrash([p.data.id], currentUser);
              void runSearch(searchQuery);
              showToast("Spostato nel cestino");
            }}
            title="Sposta nel cestino"
            className="text-red-400 hover:text-red-300 p-1 hover:bg-red-500/10 rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ),
      },
    ],
    [currentUser, runSearch, searchQuery]
  );

  // Colonne Tabella in Basso (Altri elementi: Archiviati, Cestino)
  const otherColumnDefs: ColDef<OrderItem>[] = useMemo(
    () => [
      {
        field: "is_deleted",
        headerName: "Stato",
        width: 115,
        pinned: "left",
        cellRenderer: (p: any) => {
          const isDeleted = Boolean(p.data?.is_deleted);
          return isDeleted ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
              <Trash2 className="w-2.5 h-2.5" />
              Cestino
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1">
              <Archive className="w-2.5 h-2.5" />
              Archiviato
            </span>
          );
        },
      },
      { field: "order_date", headerName: "Data Inserimento", width: 120 },
      {
        field: "supplier_name",
        headerName: "Fornitore",
        width: 165,
        cellRenderer: (p: any) => {
          if (!p.value) return "";
          const color = getFornitoreColor(p.value);
          if (!color) return p.value;
          return (
            <div className="flex items-center h-full">
              <span
                style={{
                  backgroundColor: color.bg,
                  color: color.text,
                  border: `1px solid ${color.border}`,
                }}
                className="px-2 py-0.5 rounded text-[11px] font-semibold border truncate max-w-[145px]"
              >
                {p.value}
              </span>
            </div>
          );
        },
      },
      { field: "article_code", headerName: "Codice Articolo", width: 140 },
      { field: "description", headerName: "Descrizione Articolo", flex: 2, minWidth: 200 },
      { field: "quantity", headerName: "Quantità", width: 95, cellClass: "centered-cell" },
      { field: "price", headerName: "Prezzo (€)", width: 110 },
      {
        field: "ordered_date",
        headerName: "Data Ordine",
        width: 120,
        cellRenderer: (p: any) => {
          if (!p.value) return "-";
          return (
            <span className="text-emerald-400 font-semibold text-[11px]">
              {p.value}
            </span>
          );
        },
      },
      { field: "notes", headerName: "Note", flex: 1, minWidth: 140 },
      {
        headerName: "Azioni",
        width: 175,
        pinned: "right",
        sortable: false,
        filter: false,
        cellClass: "centered-cell",
        cellRenderer: (p: any) => (
          <div className="flex items-center gap-1.5 h-full">
            {/* Tasto Ripristina */}
            <button
              onClick={() => handleRestoreFromOthers(p.data)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 cursor-pointer transition-colors"
              title="Ripristina questo record esatto negli Ordini Attivi"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Ripristina</span>
            </button>

            {/* Tasto Riordina */}
            <button
              onClick={() => handleReorderFromOthers(p.data)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 cursor-pointer transition-colors"
              title="Clona l'articolo e crea un nuovo ordine attivo con data odierna"
            >
              <Plus className="w-3 h-3" />
              <span>Riordina</span>
            </button>
          </div>
        ),
      },
    ],
    []
  );

  const defaultColDef: ColDef = useMemo(
    () => ({
      resizable: true,
      sortable: true,
      filter: true,
      cellStyle: (p: any) => {
        const colId = p.column.getColId();
        if (
          !colId ||
          colId === "col_select" ||
          colId === "col_actions" ||
          colId === "0" ||
          colId === "1" ||
          !isNaN(Number(colId))
        ) {
          return null;
        }
        if (
          p.data?.highlights &&
          typeof p.data.highlights === "object" &&
          !Array.isArray(p.data.highlights) &&
          p.data.highlights[colId] === true
        ) {
          return { backgroundColor: "#ef4444", color: "#ffffff", fontWeight: "bold" };
        }
        return null;
      },
    }),
    []
  );

  return (
    <div className="flex flex-col h-full w-full text-[var(--foreground)] bg-[var(--background)] overflow-hidden">
      {/* 1. Header Ricerca con Tasto Esci */}
      <div className="px-4 py-2 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--foreground)]">
            <Search className="w-4 h-4 text-yellow-400" />
            <span>Filtro di ricerca:</span>
            <span className="text-yellow-400 font-mono bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">
              "{searchQuery}"
            </span>
          </div>

          {toastMessage && (
            <span className="px-2.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-semibold animate-pulse">
              {toastMessage}
            </span>
          )}
        </div>

        <button
          onClick={onClearSearch}
          className="flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
          title="Esci dalla ricerca (Esc)"
        >
          <X className="w-3.5 h-3.5" />
          <span>Esci dalla Ricerca (Esc)</span>
        </button>
      </div>

      {/* 2. Schermata Divisa in Due (Alto: Ordini Attivi / Basso: Altri Voci) */}
      <div className="flex-1 w-full h-full overflow-hidden">
        <PanelGroup direction="vertical" className="w-full h-full">
          {/* PANNELLO IN ALTO: TABELLA ORDINI ATTIVI FILTRATA */}
          <Panel defaultSize={54} minSize={25} className="flex flex-col overflow-hidden bg-[var(--background)]">
            {/* Header / Toolbar Tabella in Alto */}
            <div className="px-4 py-1.5 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-[var(--foreground)]">
                  ORDINI ATTIVI ({activeOrders.length})
                </span>

                <div className="h-4 w-px bg-[var(--border)] mx-1" />

                <button
                  onClick={handleSendOrderEmail}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-xs"
                >
                  <Mail className="w-3 h-3" />
                  <span>Invia Ordine</span>
                </button>

                <button
                  onClick={handleHighlightActiveCell}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-red-600/20 text-red-300 hover:bg-red-600/30 border border-red-500/30 cursor-pointer"
                >
                  <Highlighter className="w-3 h-3" />
                  <span>Evidenzia</span>
                </button>

                {selectedActiveRows.length > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-red-600 text-white hover:bg-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Cestina ({selectedActiveRows.length})</span>
                  </button>
                )}

                <button
                  onClick={handleExportActiveExcel}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-white"
                >
                  <Download className="w-3 h-3 text-emerald-400" />
                  <span>Excel</span>
                </button>
              </div>

              <span className="text-[11px] text-[var(--muted-foreground)]">
                Fai clic su una cella per modificarla subito a 0ms.
              </span>
            </div>

            {/* Griglia AG Grid Ordini Attivi */}
            <div className="flex-1 w-full h-full overflow-hidden p-1">
              <div className="ag-theme-alpine orders-modern-grid w-full h-full">
                <AgGridReact<OrderItem>
                  ref={activeGridRef}
                  rowData={activeOrders}
                  getRowId={(p) => p.data.id}
                  columnDefs={activeColumnDefs}
                  defaultColDef={defaultColDef}
                  onCellValueChanged={onActiveCellValueChanged}
                  onCellKeyDown={onCellKeyDown}
                  rowSelection="multiple"
                  suppressRowClickSelection={true}
                  suppressMovableColumns={true}
                  singleClickEdit={true}
                  stopEditingWhenCellsLoseFocus={true}
                  enterNavigatesVertically={true}
                  enterNavigatesVerticallyAfterEdit={true}
                  navigateToNextCell={(params) => params.nextCellPosition}
                  onSelectionChanged={(e) => setSelectedActiveRows(e.api.getSelectedRows())}
                  onCellFocused={(e) => {
                    const node = e.api?.getDisplayedRowAtIndex(e.rowIndex ?? -1);
                    focusedSupplierRef.current = node?.data?.supplier_name || null;
                  }}
                />
              </div>
            </div>
          </Panel>

          {/* Divisore Trascinabile col mouse */}
          <PanelResizeHandle className="h-1.5 hover:h-2 bg-[var(--border)] hover:bg-[var(--primary)] transition-all cursor-row-resize select-none flex items-center justify-center">
            <div className="w-12 h-0.5 rounded-full bg-[var(--muted-foreground)]/40" />
          </PanelResizeHandle>

          {/* PANNELLO IN BASSO: ALTRE VOCI (ARCHIVIO / CESTINO) */}
          <Panel defaultSize={46} minSize={20} className="flex flex-col overflow-hidden bg-[var(--card)]">
            {/* Header Tabella in Basso */}
            <div className="px-4 py-1.5 bg-[var(--background)] border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Archive className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wide">
                  ALTRE VOCI TROVATE — ARCHIVIATE / CESTINO ({otherOrders.length})
                </span>
              </div>
              <span className="text-[11px] text-[var(--muted-foreground)]">
                Usa <strong>Ripristina</strong> per rimettere negli attivi, oppure <strong>Riordina</strong> per creare un nuovo ordine con data odierna.
              </span>
            </div>

            {/* Griglia AG Grid Altre Voci */}
            <div className="flex-1 w-full h-full overflow-hidden p-1">
              <div className="ag-theme-alpine orders-modern-grid w-full h-full">
                <AgGridReact<OrderItem>
                  ref={otherGridRef}
                  rowData={otherOrders}
                  getRowId={(p) => p.data.id}
                  columnDefs={otherColumnDefs}
                  defaultColDef={defaultColDef}
                  onCellKeyDown={onCellKeyDown}
                  suppressRowClickSelection={true}
                  singleClickEdit={false}
                />
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};

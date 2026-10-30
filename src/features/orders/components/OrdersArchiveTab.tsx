import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { ColDef } from "ag-grid-community";
import { OrderItem } from "@/features/orders/types/order";
import { orderRepository } from "@/features/orders/services/orderRepository";
import { orderExcelService } from "@/features/orders/services/orderExcelService";
import { getFornitoreColor } from "@/features/orders/utils/constants";
import {
  RotateCcw,
  Trash2,
  Download,
  RefreshCw,
  CheckCircle2,
  Archive,
} from "lucide-react";

interface OrdersArchiveTabProps {
  currentUser?: string;
  onRefreshData?: () => void;
  targetOrderId?: string | null;
  clearTargetOrder?: () => void;
}

export const OrdersArchiveTab: React.FC<OrdersArchiveTabProps> = ({
  currentUser = "Operatore",
  onRefreshData,
  targetOrderId,
  clearTargetOrder,
}) => {
  const gridRef = useRef<AgGridReact<OrderItem>>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRows, setSelectedRows] = useState<OrderItem[]>([]);
  const [quickFilterText, setQuickFilterText] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadArchive = useCallback(async () => {
    setLoading(true);
    try {
      const data = await orderRepository.getOrders("archiviati");
      setOrders(data);
    } catch (err) {
      console.error("[OrdersArchiveTab] Errore:", err);
      showToast("Errore caricamento archivio");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  useEffect(() => {
    if (targetOrderId && gridRef.current?.api && orders.length > 0) {
      const api = gridRef.current.api;
      let targetNode: any = null;
      api.forEachNode((node) => {
        if (node.data?.id === targetOrderId) {
          node.setSelected(true, true);
          targetNode = node;
        }
      });
      if (targetNode) {
        api.ensureNodeVisible(targetNode, "middle");
      }
      if (clearTargetOrder) clearTargetOrder();
    }
  }, [targetOrderId, orders, clearTargetOrder]);

  const handleRestoreSelected = async () => {
    if (selectedRows.length === 0) return;
    const ids = selectedRows.map((r) => r.id);
    await orderRepository.restoreFromArchive(ids, currentUser);
    gridRef.current?.api?.applyTransaction({ remove: selectedRows });
    setSelectedRows([]);
    showToast(`${ids.length} ordini ripristinati negli Attivi`);
    if (onRefreshData) onRefreshData();
  };

  const handleDeleteSelected = async () => {
    if (selectedRows.length === 0) return;
    const ids = selectedRows.map((r) => r.id);
    await orderRepository.moveToTrash(ids, currentUser);
    gridRef.current?.api?.applyTransaction({ remove: selectedRows });
    setSelectedRows([]);
    showToast(`${ids.length} ordini spostati nel cestino`);
    if (onRefreshData) onRefreshData();
  };

  const handleExportExcel = async () => {
    const res = await orderExcelService.exportOrdersToExcel(orders, "archiviati");
    if (res.success) {
      showToast("Archivio salvato sul Desktop con successo");
    } else {
      showToast(`Errore esportazione: ${res.error}`);
    }
  };

  const columnDefs: ColDef<OrderItem>[] = useMemo(
    () => [
      {
        headerName: "",
        width: 42,
        pinned: "left",
        checkboxSelection: true,
        headerCheckboxSelection: true,
        headerCheckboxSelectionFilteredOnly: true,
        suppressMenu: true,
        sortable: false,
        filter: false,
        cellClass: "centered-cell",
      },
      { field: "order_date", headerName: "Data", width: 105 },
      {
        field: "supplier_name",
        headerName: "Fornitore",
        width: 175,
        cellRenderer: (p: any) => {
          if (!p.value) return "";
          const color = getFornitoreColor(p.value);
          return (
            <div className="flex items-center h-full">
              <span
                style={{
                  backgroundColor: color?.bg || "rgba(59,130,246,0.15)",
                  color: color?.text || "#93c5fd",
                  borderColor: color?.border || "#3b82f6",
                }}
                className="px-2 py-0.5 rounded text-[11px] font-semibold border truncate max-w-[155px]"
              >
                {p.value}
              </span>
            </div>
          );
        },
      },
      { field: "article_code", headerName: "Codice Articolo", width: 145 },
      { field: "description", headerName: "Descrizione Articolo", flex: 2, minWidth: 220 },
      { field: "quantity", headerName: "Quantità", width: 105, cellClass: "centered-cell" },
      { field: "price", headerName: "Prezzo (€)", width: 120 },
      {
        field: "ordered_date",
        headerName: "Data Ordine",
        width: 125,
        cellRenderer: (p: any) => {
          if (!p.value) return "-";
          return (
            <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              {p.value}
            </span>
          );
        },
      },
      { field: "notes", headerName: "Note", flex: 1, minWidth: 160 },
      {
        headerName: "",
        width: 80,
        sortable: false,
        filter: false,
        cellClass: "centered-cell",
        cellRenderer: (p: any) => (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                void orderRepository.restoreFromArchive([p.data.id], currentUser);
                gridRef.current?.api?.applyTransaction({ remove: [p.data] });
                showToast("Ripristinato negli attivi");
                if (onRefreshData) onRefreshData();
              }}
              title="Ripristina tra gli Attivi"
              className="p-1 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                void orderRepository.moveToTrash([p.data.id], currentUser);
                gridRef.current?.api?.applyTransaction({ remove: [p.data] });
                showToast("Spostato nel cestino");
                if (onRefreshData) onRefreshData();
              }}
              title="Sposta nel cestino"
              className="p-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ),
      },
    ],
    [currentUser, onRefreshData]
  );

  return (
    <div className="flex flex-col h-full w-full select-none text-[var(--foreground)]">
      {/* Toolbar */}
      <div className="px-4 py-2.5 bg-[var(--background)] border-b border-[var(--border)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {selectedRows.length > 0 && (
            <>
              <button
                onClick={handleRestoreSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 cursor-pointer shadow-xs transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Ripristina Negli Attivi ({selectedRows.length})</span>
              </button>

              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600/20 text-red-300 hover:bg-red-600/30 border border-red-500/30 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Cestina</span>
              </button>
            </>
          )}

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--card)] hover:bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Esporta Archivio Excel</span>
          </button>

          <button
            onClick={loadArchive}
            className="p-1.5 rounded-md bg-[var(--card)] hover:bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
            title="Ricarica archivio"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {toastMessage && (
            <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium">
              {toastMessage}
            </span>
          )}
          <span className="px-2.5 py-1 rounded-full bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)]">
            <Archive className="w-3 h-3 inline mr-1 text-purple-400" />
            {orders.length} ordini archiviati
          </span>
        </div>
      </div>

      {/* Quick filter */}
      <div className="px-4 py-1.5 bg-[var(--background)] border-b border-[var(--border)] flex items-center gap-2">
        <input
          type="text"
          placeholder="Filtro rapido nell'archivio..."
          value={quickFilterText}
          onChange={(e) => {
            setQuickFilterText(e.target.value);
            gridRef.current?.api?.setQuickFilter(e.target.value);
          }}
          className="w-80 px-2.5 py-1 text-xs bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded outline-none focus:border-[var(--primary)] font-medium"
        />
      </div>

      {/* Grid */}
      <div className="flex-1 w-full h-full overflow-hidden p-2">
        <div className="ag-theme-alpine orders-modern-grid w-full h-full">
          <AgGridReact<OrderItem>
            ref={gridRef}
            rowData={orders}
            getRowId={(p) => p.data.id}
            columnDefs={columnDefs}
            rowSelection="multiple"
            suppressRowClickSelection={true}
            onSelectionChanged={(e) => setSelectedRows(e.api.getSelectedRows())}
          />
        </div>
      </div>
    </div>
  );
};

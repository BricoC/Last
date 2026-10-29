import React, { useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { AgGridReact } from "ag-grid-react";
import { Trash2 } from "lucide-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { DdtItem } from "../models/ddt";
import { calculateRowAmounts, formatCascadeDiscountDisplay } from "../utils/ddtCalculations";
import { money, safeMoney, isPositivePrice } from "@/shared/domain/monetaryValue";
import DDTTextEditor from "./DDTTextEditor";

export interface DDTArticoliTableHandle {
  clearFocusedCell: () => void;
  focusCell: (rowIndex: number, colId: string, startEdit?: boolean) => void;
}

export function isTextOnlyRow(item?: Partial<DdtItem> | null): boolean {
  if (!item) return false;
  if (item.row_kind === "note") return true;
  const hasDesc = Boolean(item.description && String(item.description).trim().length > 0);
  const hasPrice = isPositivePrice(item.unit_price);
  const hasCost = isPositivePrice(item.purchase_price);
  const hasCode = Boolean(item.code && String(item.code).trim().length > 0);
  const rawQ = item.quantity ? String(item.quantity).trim().replace(",", ".") : "";
  const hasQta = Boolean(rawQ && parseFloat(rawQ) > 0);
  return hasDesc && !hasPrice && !hasCost && !hasCode && !hasQta;
}

export interface DDTArticoliTableProps {
  items: DdtItem[];
  setItems: React.Dispatch<React.SetStateAction<DdtItem[]>>;
  showMargini: boolean;
  globalDiscount?: string;
  globalMarkup?: string;
  onOpenSearchModal: () => void;
  onDescriptionTyping?: (val: string) => void;
  onDescriptionEditingStopped?: () => void;
  onActiveRowChange?: (rowIndex: number | null) => void;
  onActiveCellChange?: (rowIndex: number, colId: string) => void;
}

export const DDTArticoliTable = forwardRef<DDTArticoliTableHandle, DDTArticoliTableProps>(({
  items,
  setItems,
  showMargini,
  globalDiscount = "",
  globalMarkup = "",
  onOpenSearchModal,
  onDescriptionTyping,
  onDescriptionEditingStopped,
  onActiveRowChange,
  onActiveCellChange,
}, ref) => {
  const gridRef = useRef<AgGridReact<DdtItem>>(null);

  useImperativeHandle(ref, () => ({
    clearFocusedCell: () => {
      if (gridRef.current?.api) {
        gridRef.current.api.stopEditing(false);
        gridRef.current.api.clearFocusedCell();
      }
    },
    focusCell: (rowIndex: number, colId: string, startEdit: boolean = true) => {
      if (gridRef.current?.api) {
        gridRef.current.api.ensureIndexVisible(rowIndex, null);
        gridRef.current.api.setFocusedCell(rowIndex, colId);
        if (startEdit) {
          setTimeout(() => {
            gridRef.current?.api.startEditingCell({ rowIndex, colKey: colId });
          }, 30);
        }
      }
    },
  }));

  // Shortcut globale F1 per posizionarsi con focus sulla prima cella della prima riga (U.M.)
  useEffect(() => {
    const handleGlobalF1 = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        e.stopPropagation();
        if (gridRef.current?.api) {
          gridRef.current.api.stopEditing(false);
          gridRef.current.api.ensureIndexVisible(0, "top");
          gridRef.current.api.setFocusedCell(0, "unit");
        }
      }
    };
    window.addEventListener("keydown", handleGlobalF1);
    return () => window.removeEventListener("keydown", handleGlobalF1);
  }, []);

  // Gestione modifica cella con sincronizzazione in tempo reale e conservazione posizione
  const handleCellValueChanged = useCallback(
    (params: any) => {
      const rowIndex = params.node.rowIndex;
      const colId = params.column.getColId();
      const updatedData: DdtItem = {
        ...params.data,
        row_kind: params.data.row_kind === "note" && colId !== "description" ? "item" : params.data.row_kind,
      };

      if (colId === "unit" && updatedData.unit) {
        updatedData.unit = String(updatedData.unit).trim().toUpperCase();
      }
      if (colId === "description" && updatedData.description) {
        updatedData.description = String(updatedData.description).toUpperCase();
      }

      // Se la riga ha solo testo nella descrizione (nessun prezzo, importo o costo), è una nota informativa
      if (isTextOnlyRow(updatedData)) {
        updatedData.row_kind = "note";
        updatedData.unit = "";
        updatedData.quantity = "";
        updatedData.vat_rate = "";
        updatedData.discount_pct = "";
        updatedData.unit_price = money(0);
        updatedData.purchase_price = money(0);
        updatedData.net_amount = money(0);
        updatedData.vat_amount = money(0);
      } else if (colId !== "description" && (isPositivePrice(updatedData.unit_price) || isPositivePrice(updatedData.purchase_price) || (updatedData.quantity && updatedData.quantity !== ""))) {
        updatedData.row_kind = "item";
      }

      if (colId === "unit_price") {
        const parsedPrice = safeMoney(params.newValue);
        const cleanMarkup = (globalMarkup || "").trim().replace("%", "").replace(",", ".");
        const markupNum = parseFloat(cleanMarkup);
        if (!isNaN(markupNum) && markupNum !== 0) {
          updatedData.base_price = parsedPrice;
          updatedData.unit_price = parsedPrice.times(1 + markupNum / 100);
        } else {
          updatedData.unit_price = parsedPrice;
          updatedData.base_price = parsedPrice;
        }
      } else {
        updatedData.unit_price = safeMoney(updatedData.unit_price);
      }

      if (colId === "purchase_price") {
        updatedData.purchase_price = safeMoney(params.newValue);
      } else if (updatedData.purchase_price) {
        updatedData.purchase_price = safeMoney(updatedData.purchase_price);
      }

      if (colId === "ric_pct") {
        const clean = String(params.newValue ?? "")
          .replace("%", "")
          .replace("+", "")
          .replace(",", ".")
          .trim();
        const ricNum = parseFloat(clean);
        const pp = isPositivePrice(updatedData.purchase_price)
          ? safeMoney(updatedData.purchase_price).toNumber()
          : 0;

        if (!isNaN(ricNum) && pp > 0) {
          const newUpNum = pp * (1 + ricNum / 100);
          const newUnitPrice = money(newUpNum);
          updatedData.unit_price = newUnitPrice;
          updatedData.base_price = newUnitPrice;
        }
      }

      if (colId === "vat_rate") {
        if (params.newValue === "" || params.newValue === null || params.newValue === undefined) {
          updatedData.vat_rate = "";
        } else {
          const parsed = parseInt(String(params.newValue).replace("%", "").trim(), 10);
          updatedData.vat_rate = isNaN(parsed) ? "" : parsed;
        }
      }

      if (colId === "discount_pct") {
        const parsedDisc = params.newValue ? String(params.newValue).trim() : "";
        updatedData.discount_pct = parsedDisc;
        updatedData.base_discount_pct = parsedDisc;
      } else if (!updatedData.discount_pct && globalDiscount?.trim()) {
        updatedData.discount_pct = globalDiscount.trim();
      }

      // Ricalcola importo netto e IVA riga
      const { netAmount, vatAmount } = calculateRowAmounts(
        updatedData.quantity || (isPositivePrice(updatedData.unit_price) ? "1" : ""),
        updatedData.unit_price,
        updatedData.discount_pct || (globalDiscount?.trim() || "0"),
        updatedData.vat_rate
      );
      updatedData.net_amount = netAmount;
      updatedData.vat_amount = vatAmount;

      setItems((prev) => {
        const copy = [...prev];
        copy[rowIndex] = { ...updatedData, row_index: rowIndex + 1 };
        return copy;
      });

      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ rowNodes: [params.node], force: true });
      }
    },
    [setItems]
  );

  // Eliminazione effettiva della riga (scalano quelle sotto e ne crea una vuota a fine array mantenendo 500)
  const handleDeleteRow = useCallback(
    (rowIndex: number) => {
      setItems((prev) => {
        const copy = [...prev];
        copy.splice(rowIndex, 1);
        copy.push({
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: "system",
          deleted_at: null,
          sync_status: "pending",
          ddt_id: "",
          row_index: 500,
          description: "",
          unit: "",
          quantity: "",
          unit_price: money(0),
          base_price: money(0),
          discount_pct: globalDiscount?.trim() || "",
          net_amount: money(0),
          vat_rate: "",
          vat_amount: money(0),
          purchase_price: money(0),
        });
        return copy.map((r, i) => ({ ...r, row_index: i + 1 }));
      });
    },
    [setItems, globalDiscount]
  );

  // Spostamento e riordinamento righe tramite trascinamento (drag & drop)
  const handleRowDragEnd = useCallback(() => {
    if (!gridRef.current?.api) return;
    const newItems: DdtItem[] = [];
    gridRef.current.api.forEachNode((node) => {
      if (node.data) newItems.push(node.data);
    });
    const reindexed = newItems.map((r, i) => ({ ...r, row_index: i + 1 }));
    setItems(reindexed);
  }, [setItems]);

  // Gestione tastiera celle (Copia, Svuota Delete/Backspace stile Excel puro)
  const handleCellKeyDown = useCallback(
    async (e: any) => {
      if (!e.event) return;

      // Tasto Canc o Backspace su cella evidenziata (non in edit mode): svuota la cella stile Excel
      if (
        (e.event.key === "Delete" || e.event.key === "Backspace") &&
        !window.__isDDTCellEditing
      ) {
        if (e.column?.isCellEditable(e.node)) {
          const colId = e.column.getColId();
          const rowIndex = e.node.rowIndex;
          const updatedRow = { ...e.node.data };

          if (colId === "unit_price") {
            updatedRow.unit_price = money(0);
            updatedRow.base_price = money(0);
          } else if (colId === "purchase_price") {
            updatedRow[colId] = money(0);
          } else if (colId === "discount_pct") {
            updatedRow.discount_pct = "";
            updatedRow.base_discount_pct = "";
          } else if (colId === "vat_rate") {
            updatedRow[colId] = "";
          } else {
            updatedRow[colId] = "";
          }

          const { netAmount, vatAmount } = calculateRowAmounts(
            updatedRow.quantity || (isPositivePrice(updatedRow.unit_price) ? "1" : ""),
            safeMoney(updatedRow.unit_price),
            updatedRow.discount_pct || "0",
            updatedRow.vat_rate
          );
          updatedRow.net_amount = netAmount;
          updatedRow.vat_amount = vatAmount;

          e.node.setData(updatedRow);
          setItems((prev) => {
            const copy = [...prev];
            copy[rowIndex] = { ...updatedRow, row_index: rowIndex + 1 };
            return copy;
          });
          if (gridRef.current?.api) {
            gridRef.current.api.refreshCells({ rowNodes: [e.node], force: true });
          }
        }
      }
    },
    [onOpenSearchModal, setItems]
  );

  // Navigazione Tab in avanti e indietro solo sulle colonne editabili (con a capo su riga successiva)
  const tabToNextCell = useCallback(
    (params: any) => {
      const { previousCellPosition, backwards } = params;
      const editableCols = [
        "unit",
        "quantity",
        "description",
        "unit_price",
        "discount_pct",
        "vat_rate",
      ];
      if (showMargini) {
        editableCols.push("purchase_price");
        editableCols.push("ric_pct");
      }

      const currentColId = previousCellPosition.column.getColId();
      let colIdx = editableCols.indexOf(currentColId);
      let rowIndex = previousCellPosition.rowIndex;

      if (colIdx === -1) {
        colIdx = backwards ? editableCols.length - 1 : 0;
      } else if (backwards) {
        colIdx--;
        if (colIdx < 0) {
          if (rowIndex > 0) {
            rowIndex--;
            colIdx = editableCols.length - 1;
          } else {
            return null;
          }
        }
      } else {
        colIdx++;
        if (colIdx >= editableCols.length) {
          if (rowIndex < items.length - 1) {
            rowIndex++;
            colIdx = 0;
          } else {
            return null;
          }
        }
      }

      const nextCol = params.api.getColumn(editableCols[colIdx]);
      return {
        rowIndex,
        column: nextCol,
        rowPinned: previousCellPosition.rowPinned ?? null,
      };
    },
    [showMargini, items.length]
  );

  // Navigazione con frecce stile Excel naturale
  const navigateToNextCell = useCallback((params: any) => {
    const { nextCellPosition, key } = params;
    if (!nextCellPosition) return null;

    const targetColId = nextCellPosition.column.getColId();

    if (key === "ArrowRight" || key === 39) {
      if (targetColId === "net_amount") {
        const vatCol = params.api.getColumn("vat_rate");
        return { ...nextCellPosition, column: vatCol };
      }
      if (targetColId === "azioni") {
        return null;
      }
    }

    if (key === "ArrowLeft" || key === 37) {
      if (targetColId === "net_amount") {
        const scCol = params.api.getColumn("discount_pct");
        return { ...nextCellPosition, column: scCol };
      }
      if (targetColId === "row_index") {
        const unitCol = params.api.getColumn("unit");
        return { ...nextCellPosition, column: unitCol };
      }
    }

    return nextCellPosition;
  }, []);

  // Definizione Colonne AG Grid con supporto Drag & Drop e DDTTextEditor
  const columnDefs = useMemo(() => {
    const cols: any[] = [
      {
        headerName: "#",
        field: "row_index",
        width: 44,
        minWidth: 38,
        maxWidth: 50,
        pinned: "left",
        rowDrag: true,
        editable: false,
        sortable: false,
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "monospace",
          fontSize: "11px",
          fontWeight: 700,
          cursor: "grab",
        },
      },
      {
        headerName: "U.M.",
        field: "unit",
        width: 56,
        minWidth: 48,
        maxWidth: 65,
        editable: true,
        cellEditor: DDTTextEditor,
        valueParser: (p: any) => (p.newValue ? String(p.newValue).trim().toUpperCase() : ""),
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          return p.value ? String(p.value).trim().toUpperCase() : "";
        },
        cellStyle: {
          textAlign: "center",
          fontWeight: 700,
          fontSize: "11px",
          textTransform: "uppercase",
        },
      },
      {
        headerName: "Q.TA'",
        field: "quantity",
        width: 68,
        minWidth: 58,
        maxWidth: 78,
        editable: true,
        cellEditor: DDTTextEditor,
        valueParser: (p: any) => (p.newValue === "" ? "" : p.newValue),
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          return p.value !== "" && p.value !== null && p.value !== undefined ? String(p.value).trim() : "";
        },
        cellStyle: {
          textAlign: "center",
          fontWeight: 700,
          fontFamily: "monospace",
          fontSize: "12px",
        },
      },
      {
        headerName: "DESCRIZIONE ARTICOLO / PRESTAZIONE *",
        field: "description",
        flex: 2,
        minWidth: 260,
        editable: true,
        cellEditor: DDTTextEditor,
        cellEditorParams: {
          onDescriptionTyping,
        },
        valueParser: (p: any) => (p.newValue ? String(p.newValue).toUpperCase().slice(0, 55) : ""),
        valueFormatter: (p: any) => (p.value ? String(p.value).toUpperCase() : ""),
        cellStyle: {
          fontSize: "12px",
          fontWeight: 500,
          textTransform: "uppercase",
        },
      },
      {
        headerName: "PREZZO €",
        field: "unit_price",
        width: 105,
        minWidth: 95,
        editable: true,
        cellEditor: DDTTextEditor,
        valueParser: (p: any) => safeMoney(p.newValue),
        cellStyle: {
          textAlign: "right",
          fontFamily: "monospace",
          fontSize: "12px",
        },
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          if (!p.value) return "";
          const m = safeMoney(p.value);
          return m.isZero() ? "" : m.formatIT(false);
        },
      },
      {
        headerName: "SC.%",
        field: "discount_pct",
        width: 75,
        minWidth: 65,
        maxWidth: 85,
        editable: true,
        cellEditor: DDTTextEditor,
        cellStyle: {
          textAlign: "center",
          fontFamily: "monospace",
          fontSize: "11px",
        },
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          const hasRowContent = Boolean(
            isPositivePrice(p.data?.unit_price) ||
            (p.data?.quantity && String(p.data?.quantity).trim().length > 0)
          );
          if (!hasRowContent) {
            return "";
          }
          return formatCascadeDiscountDisplay(p.value);
        },
      },
      {
        headerName: "IMPORTO €",
        field: "net_amount",
        width: 125,
        minWidth: 110,
        editable: false,
        sortable: false,
        cellStyle: {
          textAlign: "right",
          fontWeight: 800,
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#059669",
        },
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          if (!p.value) return "";
          const m = safeMoney(p.value);
          return m.isZero() ? "" : `€ ${m.formatIT(false)}`;
        },
      },
      {
        headerName: "IVA",
        field: "vat_rate",
        width: 55,
        minWidth: 48,
        maxWidth: 65,
        editable: true,
        cellEditor: DDTTextEditor,
        valueParser: (p: any) => {
          if (p.newValue === "" || p.newValue === null || p.newValue === undefined) return "";
          const parsed = parseInt(String(p.newValue).replace("%", "").trim(), 10);
          return isNaN(parsed) ? "" : parsed;
        },
        cellStyle: {
          textAlign: "center",
          fontFamily: "monospace",
          fontSize: "11px",
        },
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          if (p.value !== "" && p.value !== null && p.value !== undefined) {
            return `${p.value}%`;
          }
          return "";
        },
      },
    ];

    if (showMargini) {
      cols.push({
        headerName: "ACQ. €",
        field: "purchase_price",
        width: 95,
        minWidth: 85,
        editable: true,
        cellEditor: DDTTextEditor,
        headerClass: "ddt-col-acq-header",
        cellClass: "ddt-col-acq-cell",
        valueParser: (p: any) => safeMoney(p.newValue),
        cellStyle: {
          textAlign: "right",
          fontFamily: "monospace",
          fontSize: "12px",
          fontWeight: 700,
          color: "var(--grid-sheet-acquisition-text)",
          backgroundColor: "var(--grid-sheet-acquisition)",
        },
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          if (!p.value) return "";
          const m = safeMoney(p.value);
          return m.isZero() ? "" : m.formatIT(false);
        },
      });

      cols.push({
        headerName: "RIC. %",
        field: "ric_pct",
        width: 85,
        minWidth: 78,
        editable: true,
        cellEditor: DDTTextEditor,
        headerClass: "ddt-col-ric-header",
        cellClass: "ddt-col-ric-cell",
        valueGetter: (p: any) => {
          if (isTextOnlyRow(p.data)) return null;
          const up = isPositivePrice(p.data?.unit_price) ? safeMoney(p.data?.unit_price).toNumber() : 0;
          const pp = isPositivePrice(p.data?.purchase_price) ? safeMoney(p.data?.purchase_price).toNumber() : 0;
          if (pp > 0 && up > 0) {
            return ((up - pp) / pp) * 100;
          }
          return null;
        },
        valueSetter: (params: any) => {
          const clean = String(params.newValue ?? "")
            .replace("%", "")
            .replace("+", "")
            .replace(",", ".")
            .trim();
          const ricNum = parseFloat(clean);
          const pp = isPositivePrice(params.data?.purchase_price)
            ? safeMoney(params.data?.purchase_price).toNumber()
            : 0;

          if (!isNaN(ricNum) && pp > 0) {
            const newUpNum = pp * (1 + ricNum / 100);
            params.data.unit_price = money(newUpNum);
            params.data.base_price = money(newUpNum);
          }
          return true;
        },
        valueParser: (p: any) => {
          if (p.newValue === "" || p.newValue === null || p.newValue === undefined) return null;
          const clean = String(p.newValue).replace("%", "").replace("+", "").replace(",", ".").trim();
          const parsed = parseFloat(clean);
          return isNaN(parsed) ? null : parsed;
        },
        valueFormatter: (p: any) => {
          if (p.value === null || p.value === undefined || p.value === "") return "";
          const num = typeof p.value === "number" ? p.value : parseFloat(p.value);
          if (isNaN(num)) return "";
          return `${num >= 0 ? "+" : ""}${num.toFixed(1)}%`;
        },
        cellStyle: (p: any) => {
          const num = typeof p.value === "number" ? p.value : parseFloat(p.value);
          const isPos = !isNaN(num) && num >= 0;
          return {
            textAlign: "right",
            fontFamily: "monospace",
            fontSize: "12px",
            fontWeight: 700,
            color: isPos ? "#10b981" : "#f59e0b",
            backgroundColor: "rgba(16, 185, 129, 0.05)",
          };
        },
      });
    }

    cols.push({
      headerName: "",
      field: "azioni",
      width: 45,
      minWidth: 40,
      maxWidth: 50,
      pinned: "right",
      editable: false,
      sortable: false,
      cellRenderer: (p: any) => {
        const hasContent = Boolean(
          p.data?.description?.trim() ||
          isPositivePrice(p.data?.unit_price) ||
          isPositivePrice(p.data?.purchase_price) ||
          (p.data?.vat_rate !== "" && p.data?.vat_rate !== null && p.data?.vat_rate !== undefined)
        );
        if (!hasContent) return null;

        return (
          <button
            type="button"
            onClick={() => handleDeleteRow(p.node.rowIndex)}
            title="Elimina riga (scala quelle sotto mantenendo 500)"
            className="w-full h-full flex items-center justify-center text-zinc-400 hover:text-red-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        );
      },
    });

    return cols;
  }, [showMargini, handleDeleteRow, onDescriptionTyping]);

  return (
    <div className="ddt-items-grid ag-theme-alpine w-full h-full flex-1 min-h-0 overflow-hidden relative border border-zinc-300">
      <style>{`
        /* Focus chiaro e visibile sull'intera riga (solo tabella DDT principale) */
        .ddt-items-grid.ag-theme-alpine .ag-row.ag-row-focus {
          background-color: #dbeafe !important;
        }
        .ddt-items-grid.ag-theme-alpine .ag-row.ag-row-focus .ag-cell:not(.ddt-col-acq-cell) {
          background-color: #dbeafe !important;
        }
        .ddt-items-grid.ag-theme-alpine .ag-row-hover {
          background-color: #eff6ff !important;
        }
        .ddt-items-grid.ag-theme-alpine .ag-row-even {
          background-color: #ffffff;
        }
        .ddt-items-grid.ag-theme-alpine .ag-row-odd {
          background-color: #f8f9fa;
        }
        /* Intestazione tabella non selezionabile con mouse o drag */
        .ddt-items-grid.ag-theme-alpine .ag-header,
        .ddt-items-grid.ag-theme-alpine .ag-header-cell,
        .ddt-items-grid.ag-theme-alpine .ag-header-cell-label,
        .ddt-items-grid.ag-theme-alpine .ag-header-cell-text,
        .ddt-items-grid.ag-theme-alpine .ag-header-group-cell,
        .ddt-items-grid.ag-theme-alpine .ag-header-row {
          user-select: none !important;
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          cursor: default !important;
        }
        .ddt-items-grid.ag-theme-alpine .ag-header-cell-label {
          justify-content: center;
          font-weight: 700;
          font-size: 11px;
          color: #334155;
        }
        .ddt-items-grid.ag-theme-alpine .ddt-col-acq-header {
          background-color: var(--grid-sheet-acquisition-header) !important;
        }
        .ddt-items-grid.ag-theme-alpine .ddt-col-ric-header {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #047857 !important;
        }
        .ddt-items-grid.ag-theme-alpine .ag-cell-focus {
          outline: 2px solid #2563eb !important;
          outline-offset: -2px !important;
        }
      `}</style>

      <AgGridReact<DdtItem>
        ref={gridRef}
        rowData={items}
        getRowId={(params) => params.data.id || String(params.data.row_index)}
        suppressScrollOnNewData={true}
        rowDragManaged={true}
        onRowDragEnd={handleRowDragEnd}
        animateRows={true}
        columnDefs={columnDefs}
        rowHeight={32}
        headerHeight={34}
        onCellKeyDown={handleCellKeyDown}
        tabToNextCell={tabToNextCell}
        navigateToNextCell={navigateToNextCell}
        onCellFocused={(p) => {
          if (p.rowIndex !== null && p.rowIndex !== undefined) {
            onActiveRowChange?.(p.rowIndex);
            if (p.column) {
              const colId = typeof p.column === "string" ? p.column : p.column?.getColId?.() || "description";
              onActiveCellChange?.(p.rowIndex, colId);
            }
          }
        }}
        onCellEditingStarted={(p) => {
          window.__isDDTCellEditing = true;
          if (p.rowIndex !== null && p.rowIndex !== undefined) {
            onActiveRowChange?.(p.rowIndex);
            if (p.column) {
              const colId = typeof p.column === "string" ? p.column : p.column?.getColId?.() || "description";
              onActiveCellChange?.(p.rowIndex, colId);
            }
          }
        }}
        onCellEditingStopped={(p) => {
          setTimeout(() => {
            window.__isDDTCellEditing = false;
          }, 200);
          if (p.column?.getColId() === "description" || p.column?.getColId() === "descrizione") {
            onDescriptionEditingStopped?.();
          }
        }}
        stopEditingWhenCellsLoseFocus={true}
        enterNavigatesVertically={true}
        enterNavigatesVerticallyAfterEdit={true}
        onCellValueChanged={handleCellValueChanged}
        suppressMovableColumns={true}
        defaultColDef={{
          resizable: true,
          sortable: false,
          filter: false,
          headerClass: "select-none !cursor-default",
        }}
      />
    </div>
  );
});

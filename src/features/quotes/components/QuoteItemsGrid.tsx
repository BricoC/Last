import { useCallback, useEffect, useMemo, useRef } from "react";
import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import type { ColDef, ICellRendererParams, RowDragEndEvent } from "ag-grid-community";
import { Trash2 } from "lucide-react";
import { money } from "@/shared/domain/monetaryValue";
import DDTTextEditor from "@/features/ddt-studio/components/DDTTextEditor";
import type { QuoteDraftItem } from "../models/quoteDraft";
import { isCellInRange, parseTsv, formatTsv, normalizeExcelRowCells, type CellRange } from "@/shared/utils/gridClipboardHelper";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

interface QuoteGridRow extends QuoteDraftItem { row_index: number }
type GridProps = AgGridReactProps<QuoteGridRow>;
type TabParams = Parameters<NonNullable<GridProps["tabToNextCell"]>>[0];
type NavigateParams = Parameters<NonNullable<GridProps["navigateToNextCell"]>>[0];

export function QuoteItemsGrid({ items, alexMode, globalDiscount, suppliers = [], onUpdateRow, onReorder, onDeleteRow }: {
  items: QuoteDraftItem[]; alexMode: boolean; globalDiscount: number;
  suppliers?: string[];
  onUpdateRow: (index: number, row: QuoteDraftItem) => void;
  onReorder: (rows: QuoteDraftItem[]) => void;
  onDeleteRow: (index: number) => void;
}) {
  const gridRef = useRef<AgGridReact<QuoteGridRow>>(null);
  const rowData = useMemo(() => items.map((item, index) => ({ ...item, row_index: index + 1 })), [items]);
  const activeColumns = useMemo(() => [
    ...(alexMode ? ["supplier", "supplier_item_code", "purchase_price", "markup_pct", "base_unit_price"] : []),
    "unit", "quantity", "description", "unit_price", "discount_pct", "availability", "vat_rate",
  ], [alexMode]);

  const allVisibleCols = useMemo(() => [
    ...(alexMode ? ["supplier", "supplier_item_code", "purchase_price", "markup_pct", "base_unit_price"] : []),
    "unit", "quantity", "description", "unit_price", "discount_pct", "net_amount", "availability", "vat_rate",
  ], [alexMode]);

  const isMouseDownRef = useRef(false);
  const selectionRangeRef = useRef<CellRange | null>(null);

  useEffect(() => {
    const onGlobalMouseUp = () => {
      isMouseDownRef.current = false;
    };
    window.addEventListener("mouseup", onGlobalMouseUp);
    return () => window.removeEventListener("mouseup", onGlobalMouseUp);
  }, []);

  const handleCellMouseDown = useCallback((e: any) => {
    if (window.__isDDTCellEditing) return;
    if (!e.event || e.event.button !== 0) return;
    const colId = e.column?.getColId();
    const rowIndex = e.rowIndex;
    if (rowIndex === null || rowIndex === undefined || !colId || colId === "delete" || colId === "row_index") return;

    if (e.event.shiftKey && selectionRangeRef.current) {
      selectionRangeRef.current = {
        start: selectionRangeRef.current.start,
        end: { rowIndex, colId },
      };
      gridRef.current?.api?.refreshCells({ force: true });
    } else {
      isMouseDownRef.current = true;
      selectionRangeRef.current = {
        start: { rowIndex, colId },
        end: { rowIndex, colId },
      };
      gridRef.current?.api?.refreshCells({ force: true });
    }
  }, []);

  const handleCellMouseOver = useCallback((e: any) => {
    if (!isMouseDownRef.current || window.__isDDTCellEditing) return;
    const colId = e.column?.getColId();
    const rowIndex = e.rowIndex;
    if (rowIndex === null || rowIndex === undefined || !colId || colId === "delete" || colId === "row_index") return;

    if (selectionRangeRef.current) {
      if (
        selectionRangeRef.current.end.rowIndex !== rowIndex ||
        selectionRangeRef.current.end.colId !== colId
      ) {
        selectionRangeRef.current = {
          start: selectionRangeRef.current.start,
          end: { rowIndex, colId },
        };
        gridRef.current?.api?.refreshCells({ force: true });
      }
    }
  }, []);

  useEffect(() => {
    const focusFirstRow = (event: KeyboardEvent) => {
      if (event.key !== "F1") return;
      event.preventDefault(); event.stopPropagation();
      gridRef.current?.api.ensureIndexVisible(0, "top");
      gridRef.current?.api.setFocusedCell(0, "unit");
    };
    window.addEventListener("keydown", focusFirstRow);
    return () => window.removeEventListener("keydown", focusFirstRow);
  }, []);

  const update = useCallback((rowIndex: number, row: QuoteGridRow) => {
    const { row_index: _rowIndex, ...draftRow } = row;
    if (!draftRow.quantity && rowHasPrice(draftRow)) draftRow.quantity = "1";
    onUpdateRow(rowIndex, draftRow);
    gridRef.current?.api.refreshCells({ rowNodes: [gridRef.current.api.getDisplayedRowAtIndex(rowIndex)!], force: true });
  }, [onUpdateRow]);

  const handleCellChanged: NonNullable<GridProps["onCellValueChanged"]> = (event) => {
    if (!event.data || event.rowIndex === null) return;
    const row = { ...event.data };
    const field = event.column.getColId();
    const value = event.newValue;
    if (field === "unit") row.unit = String(value ?? "").trim().toUpperCase();
    else if (field === "description") row.description = String(value ?? "").trim().toUpperCase();
    else if (field === "purchase_price") {
      row.purchase_price = money(value).toCanonicalString();
      if (row.base_unit_price) row.markup_pct = calculateMarkup(row.base_unit_price, row.purchase_price);
    }
    else if (field === "markup_pct") {
      row.markup_pct = parseNumber(value); row.base_unit_price = ""; row.forced_unit_price = "";
    } else if (field === "base_unit_price") {
      row.base_unit_price = money(value).toCanonicalString(); row.forced_unit_price = "";
      row.markup_pct = calculateMarkup(row.base_unit_price, row.purchase_price);
    } else if (field === "unit_price") {
      row.forced_unit_price = money(value).toCanonicalString(); row.discount_pct = 0;
    } else if (field === "discount_pct") {
      row.discount_pct = parseNumber(value); row.forced_unit_price = "";
    } else if (field === "vat_rate") row.vat_rate = parseVatRate(value);
    else if (field === "quantity") row.quantity = String(value ?? "");
    else if (field === "supplier" || field === "supplier_item_code" || field === "availability") row[field] = String(value ?? "");
    update(event.rowIndex, row);
  };

  const applyPasteToGrid = useCallback(
    (startRowIndex: number, startColId: string, clipText: string) => {
      if (!clipText || startRowIndex < 0) return;

      const matrix = parseTsv(clipText);
      if (matrix.length === 0) return;

      const editableColsOrder = [
        ...(alexMode ? ["supplier", "supplier_item_code", "purchase_price", "markup_pct", "base_unit_price"] : []),
        "unit",
        "quantity",
        "description",
        "unit_price",
        "discount_pct",
        "availability",
        "vat_rate",
      ];

      const startColIdx = editableColsOrder.indexOf(startColId);
      if (startColIdx === -1) return;

      const updated = [...items];
      let hasChanges = false;

      matrix.forEach((cellsRaw, lineOffset) => {
        const cells = normalizeExcelRowCells(cellsRaw, startColIdx, editableColsOrder);
        const targetRowIndex = startRowIndex + lineOffset;
        while (targetRowIndex >= updated.length) {
          updated.push({
            description: "",
            code: "",
            unit: "NR",
            quantity: "",
            purchase_price: "0",
            markup_pct: 0,
            base_unit_price: "",
            forced_unit_price: "",
            discount_pct: 0,
            vat_rate: 22,
          });
        }

        const targetRow = { ...updated[targetRowIndex] };

        cells.forEach((cellVal, cellOffset) => {
          const targetColIdx = startColIdx + cellOffset;
          if (targetColIdx >= editableColsOrder.length) return;

          const colId = editableColsOrder[targetColIdx];
          const val = cellVal.trim();

          if (colId === "supplier") {
            targetRow.supplier = val.toUpperCase();
            hasChanges = true;
          } else if (colId === "supplier_item_code") {
            targetRow.supplier_item_code = val.toUpperCase();
            hasChanges = true;
          } else if (colId === "purchase_price") {
            targetRow.purchase_price = money(val).toCanonicalString();
            if (targetRow.base_unit_price) {
              targetRow.markup_pct = calculateMarkup(targetRow.base_unit_price, targetRow.purchase_price);
            }
            hasChanges = true;
          } else if (colId === "markup_pct") {
            targetRow.markup_pct = parseNumber(val);
            targetRow.base_unit_price = "";
            targetRow.forced_unit_price = "";
            hasChanges = true;
          } else if (colId === "base_unit_price") {
            targetRow.base_unit_price = money(val).toCanonicalString();
            targetRow.forced_unit_price = "";
            targetRow.markup_pct = calculateMarkup(targetRow.base_unit_price, targetRow.purchase_price);
            hasChanges = true;
          } else if (colId === "unit") {
            targetRow.unit = val.toUpperCase();
            hasChanges = true;
          } else if (colId === "quantity") {
            targetRow.quantity = val.toUpperCase();
            hasChanges = true;
          } else if (colId === "description") {
            targetRow.description = val.toUpperCase();
            hasChanges = true;
          } else if (colId === "unit_price") {
            targetRow.forced_unit_price = money(val).toCanonicalString();
            targetRow.discount_pct = 0;
            hasChanges = true;
          } else if (colId === "discount_pct") {
            targetRow.discount_pct = parseNumber(val);
            targetRow.forced_unit_price = "";
            hasChanges = true;
          } else if (colId === "availability") {
            targetRow.availability = val;
            hasChanges = true;
          } else if (colId === "vat_rate") {
            targetRow.vat_rate = parseVatRate(val);
            hasChanges = true;
          }
        });

        updated[targetRowIndex] = targetRow;
      });

      if (hasChanges) {
        onReorder(updated);
        selectionRangeRef.current = null;
        if (gridRef.current?.api) {
          setTimeout(() => {
            gridRef.current?.api?.refreshCells({ force: true });
          }, 0);
        }
      }
    },
    [alexMode, items, onReorder]
  );

  const handleContainerPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (window.__isDDTCellEditing) return;
      const focusedCell = gridRef.current?.api?.getFocusedCell();
      if (!focusedCell) return;
      const clipText = e.clipboardData?.getData("text/plain");
      if (!clipText) return;
      e.preventDefault();
      const colId = typeof focusedCell.column === "string" ? focusedCell.column : focusedCell.column.getColId();
      applyPasteToGrid(focusedCell.rowIndex, colId, clipText);
    },
    [applyPasteToGrid]
  );

  const handleKeyDown: NonNullable<GridProps["onCellKeyDown"]> = (event) => {
    const keyEvent = event.event;
    if (!(keyEvent instanceof KeyboardEvent) || !event.data || event.rowIndex === null || !("column" in event)) return;

    const isCtrlOrMeta = keyEvent.ctrlKey || keyEvent.metaKey;
    const keyLower = keyEvent.key.toLowerCase();

    // 1. Shift + Frecce: espansione della selezione a intervallo rettangolare stile Excel
    if (
      keyEvent.shiftKey &&
      (keyEvent.key === "ArrowDown" ||
        keyEvent.key === "ArrowUp" ||
        keyEvent.key === "ArrowLeft" ||
        keyEvent.key === "ArrowRight") &&
      !window.__isDDTCellEditing
    ) {
      keyEvent.preventDefault();
      const focusedCell = gridRef.current?.api?.getFocusedCell();
      if (!focusedCell) return;
      const colId =
        typeof focusedCell.column === "string"
          ? focusedCell.column
          : focusedCell.column.getColId();
      const currentRange = selectionRangeRef.current || {
        start: { rowIndex: focusedCell.rowIndex, colId },
        end: { rowIndex: focusedCell.rowIndex, colId },
      };

      let nextRow = currentRange.end.rowIndex;
      let nextColId = currentRange.end.colId;
      const currentColIdx = allVisibleCols.indexOf(nextColId);

      if (keyEvent.key === "ArrowDown") {
        nextRow = Math.min(items.length - 1, nextRow + 1);
      } else if (keyEvent.key === "ArrowUp") {
        nextRow = Math.max(0, nextRow - 1);
      } else if (keyEvent.key === "ArrowRight" && currentColIdx !== -1) {
        const nextIdx = Math.min(allVisibleCols.length - 1, currentColIdx + 1);
        nextColId = allVisibleCols[nextIdx];
      } else if (keyEvent.key === "ArrowLeft" && currentColIdx !== -1) {
        const prevIdx = Math.max(0, currentColIdx - 1);
        nextColId = allVisibleCols[prevIdx];
      }

      selectionRangeRef.current = {
        start: currentRange.start,
        end: { rowIndex: nextRow, colId: nextColId },
      };
      gridRef.current?.api?.ensureIndexVisible(nextRow, null);
      gridRef.current?.api?.refreshCells({ force: true });
      return;
    }

    // 2. Frecce senza Shift o Escape: reset selezione range
    if (
      !keyEvent.shiftKey &&
      (keyEvent.key === "ArrowDown" ||
        keyEvent.key === "ArrowUp" ||
        keyEvent.key === "ArrowLeft" ||
        keyEvent.key === "ArrowRight" ||
        keyEvent.key === "Escape") &&
      !window.__isDDTCellEditing
    ) {
      if (
        selectionRangeRef.current &&
        (selectionRangeRef.current.start.rowIndex !== selectionRangeRef.current.end.rowIndex ||
          selectionRangeRef.current.start.colId !== selectionRangeRef.current.end.colId)
      ) {
        selectionRangeRef.current = null;
        gridRef.current?.api?.refreshCells({ force: true });
      }
    }

    // 3. COPIA: Ctrl+C singola cella o intervallo multi-cella compatibile Excel (TSV)
    if (isCtrlOrMeta && keyLower === "c" && !window.__isDDTCellEditing) {
      keyEvent.preventDefault();
      const range = selectionRangeRef.current;

      if (
        range &&
        (range.start.rowIndex !== range.end.rowIndex ||
          range.start.colId !== range.end.colId)
      ) {
        const minRow = Math.min(range.start.rowIndex, range.end.rowIndex);
        const maxRow = Math.max(range.start.rowIndex, range.end.rowIndex);
        const startColIdx = allVisibleCols.indexOf(range.start.colId);
        const endColIdx = allVisibleCols.indexOf(range.end.colId);

        if (startColIdx !== -1 && endColIdx !== -1) {
          const minCol = Math.min(startColIdx, endColIdx);
          const maxCol = Math.max(startColIdx, endColIdx);
          const matrix: string[][] = [];

          for (let r = minRow; r <= maxRow; r++) {
            const rowNode = gridRef.current?.api?.getDisplayedRowAtIndex(r);
            const row = rowNode?.data;
            if (!row) continue;
            const rowCells: string[] = [];
            for (let c = minCol; c <= maxCol; c++) {
              const cid = allVisibleCols[c];
              rowCells.push(extractQuoteCellValue(row, cid, globalDiscount));
            }
            matrix.push(rowCells);
          }

          if (matrix.length > 0) {
            void navigator.clipboard.writeText(formatTsv(matrix));
          }
          return;
        }
      }

      // Fallback su cella singola attiva
      const colId = event.column?.getColId();
      const rowData = event.node?.data;
      if (rowData && colId) {
        const textToCopy = extractQuoteCellValue(rowData, colId, globalDiscount);
        try {
          void navigator.clipboard.writeText(textToCopy);
        } catch (err) {
          console.warn("[QuoteItemsGrid] Errore copia clipboard:", err);
        }
      }
      return;
    }

    // 4. INCOLLA: Ctrl+V sulla cella attiva (singola o multi-cella/colonna da Excel)
    if (isCtrlOrMeta && keyLower === "v" && !window.__isDDTCellEditing) {
      if (event.column?.isCellEditable(event.node)) {
        keyEvent.preventDefault();
        void (async () => {
          try {
            const clipText = await navigator.clipboard.readText();
            if (clipText && event.rowIndex !== null) {
              applyPasteToGrid(event.rowIndex, event.column.getColId(), clipText);
            }
          } catch (err) {
            console.warn("[QuoteItemsGrid] Errore incolla clipboard:", err);
          }
        })();
      }
      return;
    }

    if ((keyEvent.key === "Delete" || keyEvent.key === "Backspace") && !window.__isDDTCellEditing) {
      if (!event.column.isCellEditable(event.node)) return;
      const row = { ...event.data };
      const field = event.column.getColId();
      if (!activeColumns.includes(field)) return;
      clearQuoteField(row, field);
      keyEvent.preventDefault();
      update(event.rowIndex, row);
    }
  };

  const handleRowDragEnd = (event: RowDragEndEvent<QuoteGridRow>) => {
    const reordered: QuoteDraftItem[] = [];
    event.api.forEachNode((node) => { if (node.data) { const { row_index: _index, ...row } = node.data; reordered.push(row); } });
    onReorder(reordered);
  };

  const handleDelete = useCallback((rowIndex: number) => onDeleteRow(rowIndex), [onDeleteRow]);
  const columnDefs = useMemo<ColDef<QuoteGridRow>[]>(
    () => createColumns(alexMode, globalDiscount, handleDelete, suppliers),
    [alexMode, globalDiscount, handleDelete, suppliers]
  );
  const tabToNextCell = (params: TabParams) => getNextEditableCell(params, activeColumns, items.length);
  const navigateToNextCell = (params: NavigateParams) => getNextCell(params);

  return <div onPaste={handleContainerPaste} className="ag-theme-alpine quote-items-grid h-full min-h-0 w-full flex-1 overflow-hidden">
    <style>{`
      .quote-items-grid .ag-header-cell-label { justify-content:center; font-weight:700; font-size:11px; color:var(--grid-sheet-text); }
      .quote-items-grid .ag-header, .quote-items-grid .ag-header-cell { user-select:none; cursor:default; }
      .quote-items-grid .ag-row-even { background:var(--grid-sheet-background); }
      .quote-items-grid .ag-row-odd { background:var(--grid-sheet-stripe); }
      .quote-items-grid .ag-row-hover { background:var(--grid-sheet-hover) !important; }
      .quote-items-grid .ag-row.ag-row-focus, .quote-items-grid .ag-row.ag-row-focus .ag-cell { background:var(--grid-sheet-selected) !important; }
      .quote-items-grid .ag-cell-focus { outline:2px solid var(--primary) !important; outline-offset:-2px; }
      .quote-items-grid .quote-cost-cell { background:var(--grid-sheet-acquisition); color:var(--grid-sheet-cost-text); font-weight:700; }
    `}</style>
    <AgGridReact<QuoteGridRow> ref={gridRef} rowData={rowData} getRowId={(params) => params.data.id || String(params.data.row_index)}
      columnDefs={columnDefs}
      defaultColDef={{
        resizable: true,
        sortable: false,
        filter: false,
        headerClass: "select-none",
        cellClassRules: {
          "custom-range-selected": (params) =>
            isCellInRange(params.rowIndex, params.column?.getColId(), selectionRangeRef.current, allVisibleCols),
        },
      }}
      onCellMouseDown={handleCellMouseDown}
      onCellMouseOver={handleCellMouseOver}
      rowDragManaged onRowDragEnd={handleRowDragEnd} animateRows suppressScrollOnNewData
      rowHeight={34} headerHeight={36} stopEditingWhenCellsLoseFocus
      enterNavigatesVertically enterNavigatesVerticallyAfterEdit tabToNextCell={tabToNextCell}
      navigateToNextCell={navigateToNextCell} onCellValueChanged={handleCellChanged} onCellKeyDown={handleKeyDown}
      onCellEditingStarted={() => { window.__isDDTCellEditing = true; selectionRangeRef.current = null; }}
      onCellEditingStopped={() => { window.setTimeout(() => { window.__isDDTCellEditing = false; }, 200); }}
      suppressMovableColumns />
  </div>;
}

function extractQuoteCellValue(rowData: QuoteGridRow, colId: string, globalDiscount: number): string {
  if (colId === "purchase_price") {
    const m = money(rowData.purchase_price || 0);
    return m.isZero() ? "" : m.formatIT(false);
  } else if (colId === "base_unit_price") {
    const m = calculateBase(rowData);
    return m.isZero() ? "" : m.formatIT(false);
  } else if (colId === "unit_price" || colId === "forced_unit_price") {
    const m = calculateEffectivePrice(rowData, globalDiscount);
    return m.isZero() ? "" : m.formatIT(false);
  } else if (colId === "net_amount") {
    const m = calculateAmount(rowData, globalDiscount);
    return m.isZero() ? "" : m.formatIT(false);
  } else if (colId === "markup_pct") {
    return rowData.markup_pct !== null && rowData.markup_pct !== undefined && Number(rowData.markup_pct) !== 0
      ? String(rowData.markup_pct)
      : "";
  } else if (colId === "discount_pct") {
    return rowData.discount_pct ? String(rowData.discount_pct) : "";
  } else if (colId === "vat_rate") {
    return rowData.vat_rate ? String(rowData.vat_rate) : "";
  } else if (colId === "unit") {
    return rowData.unit || "";
  } else if (colId === "quantity") {
    return String(rowData.quantity ?? "");
  } else if (colId === "description") {
    return rowData.description || "";
  } else if (colId === "supplier") {
    return rowData.supplier || "";
  } else if (colId === "supplier_item_code") {
    return rowData.supplier_item_code || "";
  } else if (colId === "availability") {
    return rowData.availability || "";
  }
  return String((rowData as any)[colId] ?? "");
}

function createColumns(
  alexMode: boolean,
  discount: number,
  onDelete: (index: number) => void,
  suppliers: string[] = []
): ColDef<QuoteGridRow>[] {
  const internal: ColDef<QuoteGridRow>[] = alexMode ? [
    textColumn("FORNITORE", "supplier", 140, true, suppliers), textColumn("ART. FORN.", "supplier_item_code", 115),
    priceColumn("ACQ. €", "purchase_price", 115, true),
    { headerName: "RIC.%", field: "markup_pct", colId: "markup_pct", width: 95, editable: true, cellEditor: DDTTextEditor,
      valueFormatter: (params) => isBlankRow(params.data) && !params.value ? "" : `${parseNumber(params.value).toFixed(2)}%`,
      valueParser: (params) => parseNumber(params.newValue), cellStyle: { textAlign: "right" } },
    { headerName: "BASE €", field: "base_unit_price", colId: "base_unit_price", width: 105, editable: true, cellEditor: DDTTextEditor,
      valueGetter: (params) => params.data ? calculateBase(params.data).toCanonicalString() : "",
      valueSetter: (params) => { if (!params.data) return false; params.data.base_unit_price = money(params.newValue).toCanonicalString(); return true; },
      valueParser: (params) => money(params.newValue).toCanonicalString(),
      valueFormatter: (params) => formatMoney(params.value), cellStyle: { textAlign: "right" } },
  ] : [];
  return [
    { headerName: "#", field: "row_index", width: 58, minWidth: 50, maxWidth: 68, pinned: "left", rowDrag: true, editable: false,
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontWeight: 700, cursor: "grab" } },
    ...internal,
    textColumn("U.M.", "unit", 70, true), textColumn("Q.TÀ", "quantity", 75, true),
    { ...textColumn("DESCRIZIONE ARTICOLO / PRESTAZIONE", "description", 260, true), flex: 1,
      valueParser: (params) => String(params.newValue ?? "").trim().toUpperCase(),
      valueFormatter: (params) => String(params.value ?? "").toUpperCase() },
    { headerName: "NETTO €", field: "forced_unit_price", colId: "unit_price", width: 118, editable: true, cellEditor: DDTTextEditor,
      valueGetter: (params) => params.data ? calculateEffectivePrice(params.data, discount).toCanonicalString() : "",
      valueSetter: (params) => { if (!params.data) return false; params.data.forced_unit_price = money(params.newValue).toCanonicalString(); params.data.discount_pct = 0; return true; },
      valueParser: (params) => money(params.newValue).toCanonicalString(), valueFormatter: (params) => formatMoney(params.value),
      cellStyle: { textAlign: "right" } },
    { headerName: "SC.%", field: "discount_pct", width: 78, editable: true, cellEditor: DDTTextEditor,
      valueFormatter: (params) => isBlankRow(params.data) && !params.value ? "" : `${parseNumber(params.value).toFixed(2)}%`,
      valueParser: (params) => parseNumber(params.newValue), cellStyle: { textAlign: "center" } },
    { headerName: "IMPORTO €", colId: "net_amount", width: 125, editable: false,
      valueGetter: (params) => params.data ? calculateAmount(params.data, discount).toCanonicalString() : "",
      valueFormatter: (params) => formatMoney(params.value), cellStyle: { textAlign: "right", fontWeight: 800, color: "var(--primary)" } },
    textColumn("DISP.", "availability", 92, true),
    { headerName: "IVA", field: "vat_rate", width: 70, editable: true, cellEditor: DDTTextEditor,
      valueFormatter: (params) => isBlankRow(params.data) ? "" : `${params.value}%`,
      valueParser: (params) => parseVatRate(params.newValue), cellStyle: { textAlign: "center" } },
    {
      headerName: "",
      colId: "actions",
      width: 44,
      minWidth: 40,
      maxWidth: 48,
      pinned: "right",
      editable: false,
      cellRenderer: (params: ICellRendererParams<QuoteGridRow>) =>
        isBlankRow(params.data) ? null : (
          <button
            type="button"
            title="Elimina riga"
            onClick={() => onDelete(params.node.rowIndex ?? 0)}
            className="flex h-full w-full items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ),
    },
  ];
}

function textColumn(title: string, field: keyof QuoteDraftItem, width: number, editable = true, options?: string[]): ColDef<QuoteGridRow> {
  return {
    headerName: title,
    field: field as keyof QuoteGridRow & string,
    width,
    editable,
    cellEditor: editable ? DDTTextEditor : undefined,
    cellEditorParams: options ? { options } : undefined,
    ...(field === "supplier" ? {
      valueParser: (params) => String(params.newValue ?? "").trim().toUpperCase(),
      valueFormatter: (params) => String(params.value ?? "").toUpperCase(),
    } : field === "quantity" ? {
      valueParser: (params) => String(params.newValue ?? "").toUpperCase(),
      valueFormatter: (params) => String(params.value ?? "").toUpperCase(),
    } : {}),
    cellStyle: field === "unit" || field === "quantity" ? { textAlign: "center", fontWeight: 700 } : undefined,
  };
}

function priceColumn(title: string, field: "purchase_price", width: number, cost = false): ColDef<QuoteGridRow> {
  return {
    headerName: title,
    field,
    width,
    editable: true,
    cellEditor: DDTTextEditor,
    valueParser: (params) => money(params.newValue).toCanonicalString(),
    valueFormatter: (params) => formatMoney(params.value, 5, 5),
    cellClass: cost ? "quote-cost-cell" : undefined,
    cellStyle: { textAlign: "right" },
  };
}

function calculateBase(row: QuoteDraftItem) {
  return row.base_unit_price ? money(row.base_unit_price) : money(row.purchase_price).plus(money(row.purchase_price).times(parseNumber(row.markup_pct)).dividedBy(100));
}

function calculateMarkup(basePrice: string, costPrice: string): number | null {
  const cost = money(costPrice);
  return cost.isZero() ? null : money(basePrice).minus(cost).dividedBy(cost).times(100).toNumber();
}

function calculateEffectivePrice(row: QuoteDraftItem, globalDiscount: number) {
  if (row.forced_unit_price) return money(row.forced_unit_price);
  return calculateBase(row).applyDiscount(parseNumber(row.discount_pct)).applyDiscount(globalDiscount);
}

function calculateAmount(row: QuoteDraftItem, globalDiscount: number) {
  const rawQuantity = String(row.quantity || (rowHasPrice(row) ? "1" : "")).trim();
  if (!rawQuantity) return money(0);
  const normalizedQuantity = rawQuantity.replace(/\s/g, "").replace(",", ".");
  // During free typing a quantity can temporarily contain non-numeric text.
  // Keep the editor responsive and suppress the amount until it is valid.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalizedQuantity)) return money(0);
  const quantity = Number(normalizedQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return money(0);
  return calculateEffectivePrice(row, globalDiscount).times(quantity);
}

function rowHasPrice(row: QuoteDraftItem): boolean {
  return !money(row.purchase_price).isZero() || !money(row.base_unit_price || 0).isZero() || !money(row.forced_unit_price || 0).isZero();
}

function isBlankRow(row?: QuoteDraftItem): boolean {
  return !row || !(
    (row.description && row.description.trim() !== "") ||
    (row.supplier && row.supplier.trim() !== "") ||
    (row.supplier_item_code && row.supplier_item_code.trim() !== "") ||
    (row.code && row.code.trim() !== "") ||
    (row.unit && row.unit.trim() !== "") ||
    (row.quantity && String(row.quantity).trim() !== "") ||
    (row.discount_pct && Number(row.discount_pct) !== 0) ||
    (row.availability && row.availability.trim() !== "") ||
    (row.notes && row.notes.trim() !== "") ||
    rowHasPrice(row)
  );
}

function formatMoney(value: unknown, minDec = 4, maxDec = 4): string {
  if (value === null || value === undefined || value === "") return "";
  const result = money(String(value));
  return result.isZero() ? "" : result.formatIT(true, minDec, maxDec);
}

function parseNumber(value: unknown): number {
  const parsed = Number(String(value ?? "0").replace("%", "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseVatRate(value: unknown): QuoteDraftItem["vat_rate"] {
  const parsed = Number.parseInt(String(value ?? "22").replace("%", "").trim(), 10);
  return ([0, 4, 10, 22].includes(parsed) ? parsed : 22) as QuoteDraftItem["vat_rate"];
}

function clearQuoteField(row: QuoteGridRow, field: string): void {
  if (field === "purchase_price") row.purchase_price = "0";
  else if (field === "base_unit_price") row.base_unit_price = "";
  else if (field === "unit_price") row.forced_unit_price = "";
  else if (field === "markup_pct") { row.markup_pct = 0; row.base_unit_price = ""; row.forced_unit_price = ""; }
  else if (field === "discount_pct") { row.discount_pct = 0; row.forced_unit_price = ""; }
  else if (field === "vat_rate") row.vat_rate = 22;
  else if (field === "quantity") row.quantity = "";
  else if (field === "unit" || field === "description" || field === "supplier" || field === "supplier_item_code" || field === "availability") row[field] = "";
}

function getNextEditableCell(params: TabParams, columns: string[], rowCount: number) {
  const { previousCellPosition, backwards } = params;
  const current = columns.indexOf(previousCellPosition.column.getColId());
  const next = current + (backwards ? -1 : 1);
  if (next < 0) return previousCellPosition.rowIndex > 0
    ? { rowIndex: previousCellPosition.rowIndex - 1, column: params.api.getColumn(columns[columns.length - 1])!, rowPinned: null }
    : null;
  if (next >= columns.length) return previousCellPosition.rowIndex < rowCount - 1
    ? { rowIndex: previousCellPosition.rowIndex + 1, column: params.api.getColumn(columns[0])!, rowPinned: null }
    : null;
  return { rowIndex: previousCellPosition.rowIndex, column: params.api.getColumn(columns[next])!, rowPinned: null };
}

function getNextCell(params: NavigateParams) {
  return params.nextCellPosition ?? null;
}

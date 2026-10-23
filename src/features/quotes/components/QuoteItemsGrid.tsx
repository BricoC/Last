import { useCallback, useEffect, useMemo, useRef } from "react";
import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import type { ColDef, ICellRendererParams, RowDragEndEvent } from "ag-grid-community";
import { Trash2 } from "lucide-react";
import { money } from "@/shared/domain/monetaryValue";
import DDTTextEditor from "@/features/ddt-studio/components/DDTTextEditor";
import type { QuoteDraftItem } from "../models/quoteDraft";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

interface QuoteGridRow extends QuoteDraftItem { row_index: number }
type GridProps = AgGridReactProps<QuoteGridRow>;
type TabParams = Parameters<NonNullable<GridProps["tabToNextCell"]>>[0];
type NavigateParams = Parameters<NonNullable<GridProps["navigateToNextCell"]>>[0];

export function QuoteItemsGrid({ items, alexMode, globalDiscount, onUpdateRow, onReorder, onDeleteRow }: {
  items: QuoteDraftItem[]; alexMode: boolean; globalDiscount: number;
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

  const handleKeyDown: NonNullable<GridProps["onCellKeyDown"]> = (event) => {
    const keyEvent = event.event;
    if (!(keyEvent instanceof KeyboardEvent) || !event.data || event.rowIndex === null || !("column" in event)) return;
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
  const columnDefs = useMemo<ColDef<QuoteGridRow>[]>(() => createColumns(alexMode, globalDiscount, handleDelete), [alexMode, globalDiscount, handleDelete]);
  const tabToNextCell = (params: TabParams) => getNextEditableCell(params, activeColumns, items.length);
  const navigateToNextCell = (params: NavigateParams) => getNextCell(params);

  return <div className="ag-theme-alpine quote-items-grid h-full min-h-0 w-full flex-1 overflow-hidden">
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
      columnDefs={columnDefs} defaultColDef={{ resizable: true, sortable: false, filter: false, headerClass: "select-none" }}
      rowDragManaged onRowDragEnd={handleRowDragEnd} animateRows suppressScrollOnNewData
      rowHeight={34} headerHeight={36} stopEditingWhenCellsLoseFocus
      enterNavigatesVertically enterNavigatesVerticallyAfterEdit tabToNextCell={tabToNextCell}
      navigateToNextCell={navigateToNextCell} onCellValueChanged={handleCellChanged} onCellKeyDown={handleKeyDown}
      onCellEditingStarted={() => { window.__isDDTCellEditing = true; }}
      onCellEditingStopped={() => { window.setTimeout(() => { window.__isDDTCellEditing = false; }, 200); }}
      suppressMovableColumns />
  </div>;
}

function createColumns(alexMode: boolean, discount: number, onDelete: (index: number) => void): ColDef<QuoteGridRow>[] {
  const internal: ColDef<QuoteGridRow>[] = alexMode ? [
    textColumn("FORNITORE", "supplier", 140), textColumn("ART. FORN.", "supplier_item_code", 115),
    priceColumn("ACQ. €", "purchase_price", 98, true),
    { headerName: "RIC.%", field: "markup_pct", colId: "markup_pct", width: 74, editable: true, cellEditor: DDTTextEditor,
      valueFormatter: (params) => isBlankRow(params.data) && !params.value ? "" : `${parseNumber(params.value).toFixed(2)}%`,
      valueParser: (params) => parseNumber(params.newValue), cellStyle: { textAlign: "right" } },
    { headerName: "BASE €", field: "base_unit_price", colId: "base_unit_price", width: 95, editable: true, cellEditor: DDTTextEditor,
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
    { headerName: "NETTO €", field: "forced_unit_price", colId: "unit_price", width: 112, editable: true, cellEditor: DDTTextEditor,
      valueGetter: (params) => params.data ? calculateEffectivePrice(params.data, discount).toCanonicalString() : "",
      valueSetter: (params) => { if (!params.data) return false; params.data.forced_unit_price = money(params.newValue).toCanonicalString(); params.data.discount_pct = 0; return true; },
      valueParser: (params) => money(params.newValue).toCanonicalString(), valueFormatter: (params) => formatMoney(params.value),
      cellStyle: { textAlign: "right" } },
    { headerName: "SC.%", field: "discount_pct", width: 78, editable: true, cellEditor: DDTTextEditor,
      valueFormatter: (params) => isBlankRow(params.data) && !params.value ? "" : `${parseNumber(params.value).toFixed(2)}%`,
      valueParser: (params) => parseNumber(params.newValue), cellStyle: { textAlign: "center" } },
    { headerName: "IMPORTO €", colId: "net_amount", width: 120, editable: false,
      valueGetter: (params) => params.data ? calculateAmount(params.data, discount).toCanonicalString() : "",
      valueFormatter: (params) => formatMoney(params.value), cellStyle: { textAlign: "right", fontWeight: 800, color: "var(--primary)" } },
    textColumn("DISP.", "availability", 92, true),
    { headerName: "IVA", field: "vat_rate", width: 70, editable: true, cellEditor: DDTTextEditor,
      valueFormatter: (params) => isBlankRow(params.data) ? "" : `${params.value}%`,
      valueParser: (params) => parseVatRate(params.newValue), cellStyle: { textAlign: "center" } },
    { headerName: "", colId: "actions", width: 44, maxWidth: 48, pinned: "right", editable: false,
      cellRenderer: (params: ICellRendererParams<QuoteGridRow>) => isBlankRow(params.data) ? null : <button type="button" title="Elimina riga" onClick={() => onDelete(params.node.rowIndex ?? 0)}
        className="flex h-full w-full items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--destructive)]"><Trash2 className="h-3.5 w-3.5" /></button> },
  ];
}

function textColumn(title: string, field: keyof QuoteDraftItem, width: number, editable = true): ColDef<QuoteGridRow> {
  return { headerName: title, field: field as keyof QuoteGridRow & string, width, editable, cellEditor: editable ? DDTTextEditor : undefined,
    ...(field === "quantity" ? {
      valueParser: (params) => String(params.newValue ?? "").toUpperCase(),
      valueFormatter: (params) => String(params.value ?? "").toUpperCase(),
    } : {}),
    cellStyle: field === "unit" || field === "quantity" ? { textAlign: "center", fontWeight: 700 } : undefined };
}

function priceColumn(title: string, field: "purchase_price", width: number, cost = false): ColDef<QuoteGridRow> {
  return { headerName: title, field, width, editable: true, cellEditor: DDTTextEditor, valueParser: (params) => money(params.newValue).toCanonicalString(),
    valueFormatter: (params) => formatMoney(params.value), cellClass: cost ? "quote-cost-cell" : undefined, cellStyle: { textAlign: "right" } };
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
  return !row || !(row.description.trim() || row.supplier || row.supplier_item_code || rowHasPrice(row) || row.quantity);
}

function formatMoney(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const result = money(String(value));
  return result.isZero() ? "" : result.formatIT2();
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

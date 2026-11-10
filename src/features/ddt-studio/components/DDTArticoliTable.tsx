import React, { useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { AgGridReact } from "ag-grid-react";
import { Trash2 } from "lucide-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { DdtItem } from "../models/ddt";
import { calculateRowAmounts, formatCascadeDiscountDisplay } from "../utils/ddtCalculations";
import { money, safeMoney, isPositivePrice } from "@/shared/domain/monetaryValue";
import DDTTextEditor from "./DDTTextEditor";
import { isCellInRange, parseTsv, formatTsv, normalizeExcelRowCells, type CellRange } from "@/shared/utils/gridClipboardHelper";

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
  isSearchModalOpen?: boolean;
  onFocusSearchModal?: () => void;
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
  isSearchModalOpen = false,
  onFocusSearchModal,
}, ref) => {
  const gridRef = useRef<AgGridReact<DdtItem>>(null);

  const allVisibleCols = useMemo(
    () => [
      "unit",
      "quantity",
      "description",
      "unit_price",
      "discount_pct",
      "net_amount",
      "vat_rate",
      ...(showMargini ? ["purchase_price", "ric_pct"] : []),
    ],
    [showMargini]
  );

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
    if (rowIndex === null || rowIndex === undefined || !colId || colId === "azioni" || colId === "row_index") return;

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
    if (rowIndex === null || rowIndex === undefined || !colId || colId === "azioni" || colId === "row_index") return;

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

  // Gestione incolla multi-cella o singola cella (da Excel o appunti)
  const applyPasteToGrid = useCallback(
    (startRowIndex: number, startColId: string, clipText: string) => {
      if (!clipText || startRowIndex < 0) return;

      const matrix = parseTsv(clipText);
      if (matrix.length === 0) return;

      const editableColsOrder = [
        "unit",
        "quantity",
        "description",
        "unit_price",
        "discount_pct",
        "vat_rate",
        ...(showMargini ? ["purchase_price", "ric_pct"] : []),
      ];

      const startColIdx = editableColsOrder.indexOf(startColId);
      if (startColIdx === -1) return;

      setItems((prevItems) => {
        const newItems = [...prevItems];
        let hasChanges = false;

        matrix.forEach((cellsRaw, lineOffset) => {
          const cells = normalizeExcelRowCells(cellsRaw, startColIdx, editableColsOrder);
          const targetRowIndex = startRowIndex + lineOffset;
          while (targetRowIndex >= newItems.length) {
            newItems.push({
              id: crypto.randomUUID(),
              ddt_id: "",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              updated_by: "system",
              deleted_at: null,
              sync_status: "pending",
              row_index: newItems.length + 1,
              row_kind: "item",
              unit: "",
              quantity: "",
              description: "",
              unit_price: money(0),
              base_price: money(0),
              discount_pct: "",
              net_amount: money(0),
              vat_rate: 22,
              vat_amount: money(0),
              purchase_price: money(0),
            });
          }

          const targetRow = { ...newItems[targetRowIndex] };

          cells.forEach((cellRaw, cellOffset) => {
            const targetColIdx = startColIdx + cellOffset;
            if (targetColIdx >= editableColsOrder.length) return;

            const colId = editableColsOrder[targetColIdx];
            const val = cellRaw.trim();

            if (colId === "unit") {
              targetRow.unit = val.toUpperCase();
              hasChanges = true;
            } else if (colId === "quantity") {
              targetRow.quantity = val;
              hasChanges = true;
            } else if (colId === "description") {
              targetRow.description = val.toUpperCase();
              hasChanges = true;
            } else if (colId === "unit_price") {
              const parsed = safeMoney(val);
              targetRow.unit_price = parsed;
              targetRow.base_price = parsed;
              hasChanges = true;
            } else if (colId === "discount_pct") {
              targetRow.discount_pct = val;
              targetRow.base_discount_pct = val;
              hasChanges = true;
            } else if (colId === "vat_rate") {
              const parsed = parseInt(val.replace("%", "").trim(), 10);
              targetRow.vat_rate = isNaN(parsed) ? "" : parsed;
              hasChanges = true;
            } else if (colId === "purchase_price") {
              targetRow.purchase_price = safeMoney(val);
              hasChanges = true;
            } else if (colId === "ric_pct") {
              const ricNum = parseFloat(val.replace("%", "").replace(",", "."));
              const pp = isPositivePrice(targetRow.purchase_price)
                ? safeMoney(targetRow.purchase_price).toNumber()
                : 0;
              if (!isNaN(ricNum) && pp > 0) {
                const newUp = money(pp * (1 + ricNum / 100));
                targetRow.unit_price = newUp;
                targetRow.base_price = newUp;
                hasChanges = true;
              }
            }
          });

          // Ricalcolo importi riga
          const { netAmount, vatAmount } = calculateRowAmounts(
            targetRow.quantity || (isPositivePrice(targetRow.unit_price) ? "1" : ""),
            safeMoney(targetRow.unit_price),
            targetRow.discount_pct || "0",
            targetRow.vat_rate
          );
          targetRow.net_amount = netAmount;
          targetRow.vat_amount = vatAmount;

          newItems[targetRowIndex] = targetRow;
        });

        selectionRangeRef.current = null;
        if (hasChanges && gridRef.current?.api) {
          setTimeout(() => {
            gridRef.current?.api?.refreshCells({ force: true });
          }, 0);
        }

        return hasChanges ? newItems : prevItems;
      });
    },
    [showMargini, setItems]
  );

  // Gestione tastiera celle (Copia Ctrl+C, Taglia Ctrl+X, Incolla Ctrl+V, Svuota Delete/Backspace stile Excel puro)
  const handleCellKeyDown = useCallback(
    async (e: any) => {
      if (!e.event) return;

      const isCtrlOrMeta = e.event.ctrlKey || e.event.metaKey;
      const keyLower = e.event.key?.toLowerCase();

      // 1. Shift + Frecce: espansione o contrazione della selezione rettangolare da tastiera stile Excel
      if (
        e.event.shiftKey &&
        (e.event.key === "ArrowDown" ||
          e.event.key === "ArrowUp" ||
          e.event.key === "ArrowLeft" ||
          e.event.key === "ArrowRight") &&
        !window.__isDDTCellEditing
      ) {
        e.event.preventDefault();
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

        if (e.event.key === "ArrowDown") {
          nextRow = Math.min(items.length - 1, nextRow + 1);
        } else if (e.event.key === "ArrowUp") {
          nextRow = Math.max(0, nextRow - 1);
        } else if (e.event.key === "ArrowRight" && currentColIdx !== -1) {
          const nextIdx = Math.min(allVisibleCols.length - 1, currentColIdx + 1);
          nextColId = allVisibleCols[nextIdx];
        } else if (e.event.key === "ArrowLeft" && currentColIdx !== -1) {
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
        !e.event.shiftKey &&
        (e.event.key === "ArrowDown" ||
          e.event.key === "ArrowUp" ||
          e.event.key === "ArrowLeft" ||
          e.event.key === "ArrowRight" ||
          e.event.key === "Escape") &&
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

      // 3. COPIA: Ctrl+C (quando non in edit mode) - Supporto singola cella o intervallo multi-cella per Excel
      if (isCtrlOrMeta && keyLower === "c" && !window.__isDDTCellEditing) {
        e.event.preventDefault();
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
                rowCells.push(extractDdtCellValue(row, cid));
              }
              matrix.push(rowCells);
            }

            if (matrix.length > 0) {
              void navigator.clipboard.writeText(formatTsv(matrix));
            }
            return;
          }
        }

        // Copia singola cella attiva
        const colId = e.column?.getColId();
        const rowData = e.node?.data;
        if (rowData && colId) {
          const textToCopy = extractDdtCellValue(rowData, colId);
          try {
            await navigator.clipboard.writeText(textToCopy);
          } catch (err) {
            console.warn("[DDTArticoliTable] Errore copia clipboard:", err);
          }
        }
        return;
      }

      // TAGLIA: Ctrl+X (quando non in edit mode)
      if (isCtrlOrMeta && keyLower === "x" && !window.__isDDTCellEditing) {
        if (e.column?.isCellEditable(e.node)) {
          const colId = e.column.getColId();
          const rowIndex = e.node.rowIndex;
          const updatedRow = { ...e.node.data };
          let textToCopy = "";

          if (colId === "unit_price") {
            const m = safeMoney(updatedRow.unit_price);
            textToCopy = isPositivePrice(m) ? m.formatIT(false) : "";
            updatedRow.unit_price = money(0);
            updatedRow.base_price = money(0);
          } else if (colId === "purchase_price") {
            const m = safeMoney(updatedRow.purchase_price);
            textToCopy = isPositivePrice(m) ? m.formatIT(false) : "";
            updatedRow.purchase_price = money(0);
          } else if (colId === "discount_pct") {
            textToCopy = String(updatedRow.discount_pct ?? "");
            updatedRow.discount_pct = "";
            updatedRow.base_discount_pct = "";
          } else if (colId === "vat_rate") {
            textToCopy = String(updatedRow.vat_rate ?? "");
            updatedRow.vat_rate = "";
          } else {
            textToCopy = String(updatedRow[colId] ?? "");
            updatedRow[colId] = "";
          }

          e.event.preventDefault();
          try {
            await navigator.clipboard.writeText(textToCopy);
          } catch (err) {
            console.warn("[DDTArticoliTable] Errore taglia clipboard:", err);
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
        return;
      }

      // INCOLLA: Ctrl+V (quando non in edit mode)
      if (isCtrlOrMeta && keyLower === "v" && !window.__isDDTCellEditing) {
        if (e.column?.isCellEditable(e.node)) {
          e.event.preventDefault();
          try {
            const clipText = await navigator.clipboard.readText();
            if (clipText) {
              applyPasteToGrid(e.node.rowIndex, e.column.getColId(), clipText);
            }
          } catch (err) {
            console.warn("[DDTArticoliTable] Errore incolla clipboard:", err);
          }
        }
        return;
      }

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
    [applyPasteToGrid, onOpenSearchModal, setItems]
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

      // Se siamo sulla descrizione e premiamo TAB in avanti con il pannello cerca articoli aperto, spostiamo il focus sulla ricerca articoli
      const searchContainer = document.getElementById("ddt-search-modal-container");
      if (
        (currentColId === "description" || currentColId === "descrizione") &&
        !backwards &&
        (isSearchModalOpen || searchContainer)
      ) {
        setTimeout(() => {
          gridRef.current?.api?.clearFocusedCell?.();
          onFocusSearchModal?.();
          const target =
            (document.querySelector("#ddt-search-modal-container [data-list-container='true']") as HTMLElement) ||
            document.getElementById("ddt-search-modal-container");
          target?.focus();
        }, 50);
        return null;
      }

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
          if (p.data?.row_kind === "note" && isTextOnlyRow(p.data)) return "";
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
          if (p.data?.row_kind === "note" && isTextOnlyRow(p.data)) return "";
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
          isSearchModalOpen,
          onFocusSearchModal,
        },
        valueParser: (p: any) => (p.newValue ? String(p.newValue).toUpperCase() : ""),
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
        const d = p.data;
        const hasContent = Boolean(
          (d?.description && String(d.description).trim() !== "") ||
          (d?.code && String(d.code).trim() !== "") ||
          (d?.unit && String(d.unit).trim() !== "") ||
          (d?.quantity && String(d.quantity).trim() !== "") ||
          (d?.discount_pct && String(d.discount_pct).trim() !== "") ||
          (d?.vat_rate !== "" && d?.vat_rate !== null && d?.vat_rate !== undefined) ||
          isPositivePrice(d?.unit_price) ||
          isPositivePrice(d?.base_price) ||
          isPositivePrice(d?.purchase_price) ||
          (d?.notes && String(d.notes).trim() !== "")
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
  }, [showMargini, handleDeleteRow, onDescriptionTyping, isSearchModalOpen, onFocusSearchModal]);

  // Gestione incolla nativo su contenitore griglia
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

  return (
    <div
      onPaste={handleContainerPaste}
      className="ddt-items-grid ag-theme-alpine w-full h-full flex-1 min-h-0 overflow-hidden relative border border-zinc-300"
    >
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
        onCellMouseDown={handleCellMouseDown}
        onCellMouseOver={handleCellMouseOver}
        onCellEditingStarted={(p) => {
          window.__isDDTCellEditing = true;
          selectionRangeRef.current = null;
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
          cellClassRules: {
            "custom-range-selected": (params) =>
              isCellInRange(
                params.rowIndex,
                params.column?.getColId(),
                selectionRangeRef.current,
                allVisibleCols
              ),
          },
        }}
      />
    </div>
  );
});

function extractDdtCellValue(rowData: DdtItem, colId: string): string {
  if (colId === "unit_price" || colId === "purchase_price") {
    const m = safeMoney((rowData as any)[colId]);
    return isPositivePrice(m) ? m.formatIT(false) : "";
  } else if (colId === "net_amount" || colId === "vat_amount") {
    const m = safeMoney((rowData as any)[colId]);
    return m.formatIT(false);
  } else if (colId === "ric_pct") {
    const up = isPositivePrice(rowData.unit_price) ? safeMoney(rowData.unit_price).toNumber() : 0;
    const pp = isPositivePrice(rowData.purchase_price) ? safeMoney(rowData.purchase_price).toNumber() : 0;
    if (pp > 0 && up > 0) {
      const ric = ((up - pp) / pp) * 100;
      return ric.toFixed(2) + "%";
    }
    return "";
  } else {
    return String((rowData as any)[colId] ?? "");
  }
}

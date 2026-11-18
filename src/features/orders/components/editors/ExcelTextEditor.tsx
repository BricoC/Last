import React, { useState, useEffect, useLayoutEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { ICellEditorParams } from "ag-grid-community";

declare global {
  interface Window {
    __isOrderCellEditing?: boolean;
  }
}

export const ExcelTextEditor = forwardRef((props: ICellEditorParams, ref) => {
  const colId = props.column?.getColId();
  const isUppercaseCol = colId === "description" || colId === "descrizione";

  const isTypedChar = Boolean(props.eventKey && props.eventKey.length === 1);
  const isDelete = props.eventKey === "Backspace" || props.eventKey === "Delete";

  let startValue = props.value ?? "";
  if (isTypedChar && props.eventKey) startValue = props.eventKey;
  if (isDelete) startValue = "";
  if (isUppercaseCol && typeof startValue === "string") {
    startValue = startValue.toUpperCase();
  }

  const [value, setValue] = useState<string>(String(startValue));
  const valueRef = useRef<string>(String(startValue));
  const inputRef = useRef<HTMLInputElement>(null);
  const propsRef = useRef<ICellEditorParams>(props);
  propsRef.current = props;
  const selectionRef = useRef<{ start: number | null; end: number | null }>({ start: null, end: null });

  // Quick edit vs Deep edit:
  // Se l'utente digita un carattere o cancella, le frecce muovono la cella stile Excel.
  // Se fa doppio clic, F2 o Invio, le frecce muovono il cursore all'interno del testo.
  const isDeepEdit = !isTypedChar && !isDelete && (!props.eventKey || props.eventKey === "F2" || props.eventKey === "Enter");
  const isQuickEdit = useRef(!isDeepEdit);

  // Ripristina la posizione esatta del cursore dopo la trasformazione uppercase e il re-render di React
  useLayoutEffect(() => {
    if (selectionRef.current.start !== null && inputRef.current) {
      inputRef.current.setSelectionRange(
        selectionRef.current.start,
        selectionRef.current.end ?? selectionRef.current.start
      );
      selectionRef.current = { start: null, end: null };
    }
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const caretStart = e.target.selectionStart;
    const caretEnd = e.target.selectionEnd;
    const next = isUppercaseCol ? rawVal.toUpperCase() : rawVal;

    selectionRef.current = { start: caretStart, end: caretEnd };
    valueRef.current = next;
    setValue(next);
  };

  useImperativeHandle(ref, () => ({
    getValue: () =>
      isUppercaseCol && typeof valueRef.current === "string"
        ? valueRef.current.toUpperCase()
        : valueRef.current,
    isPopup: () => false,
    afterGuiAttached: () => {
      if (inputRef.current) {
        inputRef.current.focus();
        if (isTypedChar || props.eventKey === "F2") {
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        } else if (props.eventKey === "Enter" || !props.eventKey) {
          inputRef.current.select();
        }
      }
    },
    focusIn: () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    },
  }));

  useEffect(() => {
    window.__isOrderCellEditing = true;
    const focusInput = () => {
      if (!inputRef.current) return;
      inputRef.current.focus();
      if (isTypedChar || props.eventKey === "F2") {
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      } else if (props.eventKey === "Enter" || !props.eventKey) {
        inputRef.current.select();
      }
    };

    focusInput();
    const rafId = requestAnimationFrame(focusInput);

    const el = inputRef.current;
    const handleNativeKeyDown = (e: KeyboardEvent) => {
      const currentProps = propsRef.current;

      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const api = currentProps.api;
        const targetNode = currentProps.node;
        const currentColId = currentProps.column?.getColId();
        if (!api || !targetNode || !currentColId) return;

        const backwards = e.shiftKey;
        api.stopEditing(false);

        setTimeout(() => {
          const rowCount = api.getDisplayedRowCount?.() || 0;
          const currentRowIndex = targetNode.rowIndex;
          if (currentRowIndex === null || currentRowIndex === undefined || currentRowIndex < 0 || rowCount === 0) {
            return;
          }

          const editableCols = api
            .getAllDisplayedColumns()
            .filter((c) => c.isCellEditable(targetNode))
            .map((c) => c.getColId());
          if (editableCols.length === 0) return;

          const colIdx = editableCols.indexOf(currentColId);
          let nextRow = currentRowIndex;
          let nextColIdx = colIdx === -1 ? (backwards ? editableCols.length - 1 : 0) : colIdx + (backwards ? -1 : 1);

          if (nextColIdx < 0) {
            if (nextRow > 0) {
              nextRow--;
              nextColIdx = editableCols.length - 1;
            } else {
              nextColIdx = 0;
            }
          } else if (nextColIdx >= editableCols.length) {
            if (nextRow < rowCount - 1) {
              nextRow++;
              nextColIdx = 0;
            } else {
              nextColIdx = editableCols.length - 1;
            }
          }

          const targetCol = editableCols[nextColIdx];
          const targetNextNode = api.getDisplayedRowAtIndex(nextRow);
          if (!targetCol || !targetNextNode) return;

          api.setFocusedCell(nextRow, targetCol);
          const resolvedRow = targetNextNode.rowIndex ?? nextRow;
          api.ensureIndexVisible(resolvedRow, null);
          api.ensureColumnVisible(targetCol);
          api.startEditingCell({ rowIndex: resolvedRow, colKey: targetCol });
        }, 15);
        return;
      }

      if (isQuickEdit.current && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const rowIndex = currentProps.node?.rowIndex;
        if (rowIndex === null || rowIndex === undefined || !currentProps.api) return;

        const columns = currentProps.api.getAllDisplayedColumns();
        const currentIdx = columns.findIndex((c) => c.getColId() === currentProps.column?.getColId());
        if (currentIdx === -1) return;

        let nextRow = rowIndex;
        let nextCol = currentIdx;

        if (e.key === "ArrowRight") nextCol++;
        if (e.key === "ArrowLeft") nextCol--;
        if (e.key === "ArrowDown") nextRow++;
        if (e.key === "ArrowUp") nextRow--;

        currentProps.api.stopEditing();

        setTimeout(() => {
          if (
            nextCol >= 0 &&
            nextCol < columns.length &&
            nextRow >= 0 &&
            nextRow < (currentProps.api?.getDisplayedRowCount?.() || 0)
          ) {
            const nextColId = columns[nextCol].getColId();
            currentProps.api?.setFocusedCell(nextRow, nextColId);
          }
        }, 10);
      }
    };

    el?.addEventListener("keydown", handleNativeKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      el?.removeEventListener("keydown", handleNativeKeyDown);
      window.__isOrderCellEditing = false;
    };
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={handleInputChange}
      style={{
        width: "100%",
        height: "100%",
        padding: "0 8px",
        boxSizing: "border-box",
        border: "none",
        background: "#1e293b",
        color: "#f8fafc",
        outline: "2px solid #3b82f6",
        fontSize: "11px",
        fontWeight: 500,
      }}
    />
  );
});

ExcelTextEditor.displayName = "ExcelTextEditor";

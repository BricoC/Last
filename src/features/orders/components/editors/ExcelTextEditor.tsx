import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
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

  // Quick edit vs Deep edit:
  // Se l'utente digita un carattere o cancella, le frecce muovono la cella stile Excel.
  // Se fa doppio clic, F2 o Invio, le frecce muovono il cursore all'interno del testo.
  const isDeepEdit = !isTypedChar && !isDelete && (!props.eventKey || props.eventKey === "F2" || props.eventKey === "Enter");
  const isQuickEdit = useRef(!isDeepEdit);

  const updateValue = (v: string) => {
    const next = isUppercaseCol ? v.toUpperCase() : v;
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
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
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
    if (inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
    return () => {
      window.__isOrderCellEditing = false;
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isQuickEdit.current && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();

      const rowIndex = props.node?.rowIndex;
      if (rowIndex === null || rowIndex === undefined || !props.api) return;

      const columns = props.api.getAllDisplayedColumns();
      const currentIdx = columns.findIndex((c) => c.getColId() === props.column?.getColId());
      if (currentIdx === -1) return;

      let nextRow = rowIndex;
      let nextCol = currentIdx;

      if (e.key === "ArrowRight") nextCol++;
      if (e.key === "ArrowLeft") nextCol--;
      if (e.key === "ArrowDown") nextRow++;
      if (e.key === "ArrowUp") nextRow--;

      props.api.stopEditing();

      setTimeout(() => {
        if (
          nextCol >= 0 &&
          nextCol < columns.length &&
          nextRow >= 0 &&
          nextRow < (props.api?.getDisplayedRowCount?.() || 0)
        ) {
          const nextColId = columns[nextCol].getColId();
          props.api?.setFocusedCell(nextRow, nextColId);
        }
      }, 10);
    }
  };

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => updateValue(e.target.value)}
      onKeyDown={onKeyDown}
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

import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { ICellEditorParams } from "ag-grid-community";

export const ExcelTextEditor = forwardRef((props: ICellEditorParams, ref) => {
  const isTypedChar = Boolean(props.eventKey && props.eventKey.length === 1);
  const isDelete = props.eventKey === "Backspace" || props.eventKey === "Delete";

  let startValue = props.value || "";
  if (isTypedChar && props.eventKey) startValue = props.eventKey;
  if (isDelete) startValue = "";

  const [value, setValue] = useState(startValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // "Deep edit" (dove le frecce muovono il cursore interno) si attiva SOLO 
  // con Doppio Clic (nessun eventKey), con F2 o con Invio.
  const isDeepEdit = !isTypedChar && !isDelete && (!props.eventKey || props.eventKey === "F2" || props.eventKey === "Enter");
  const isQuickEdit = useRef(!isDeepEdit);

  useImperativeHandle(ref, () => ({
    getValue: () => value,
    isPopup: () => false,
  }));

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.setSelectionRange(startValue.length, startValue.length);
    }
  }, [startValue]);

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
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      style={{
        width: "100%",
        height: "100%",
        padding: "0 8px",
        boxSizing: "border-box",
        border: "none",
        background: "#1e293b",
        color: "#e2e8f0",
        outline: "2px solid #3b82f6",
        fontSize: "12px",
      }}
    />
  );
});

ExcelTextEditor.displayName = "ExcelTextEditor";
export default ExcelTextEditor;

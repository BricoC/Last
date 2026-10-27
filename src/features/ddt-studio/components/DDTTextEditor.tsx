import React, { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import { ICellEditorParams } from "ag-grid-community";
import { safeMoney, isPositivePrice } from "@/shared/domain/monetaryValue";

const STANDARD_UM = [
  "NR.", "PZ.", "MT.", "KG.", "LT.", "MQ.", "MC.", "CF.", "BL.", "ROT.", "PAIO", "ORA", "CORPO", "SET", "Q.LI", "NR", "PZ", "MT", "KG", "LT", "MQ"
];

declare global {
  interface Window {
    __isDDTCellEditing?: boolean;
  }
}

export const DDTTextEditor = forwardRef((props: ICellEditorParams, ref) => {
  const isTypedChar = Boolean(props.eventKey && props.eventKey.length === 1);
  const isDelete = props.eventKey === "Backspace" || props.eventKey === "Delete";

  const colId = props.column?.getColId();
  const isUppercaseCol = colId === "unit" || colId === "um" || colId === "description" || colId === "descrizione" || colId === "code" || colId === "quantity" || colId === "quantita";

  let startValue = "";
  if (props.value !== null && props.value !== undefined) {
    if (colId === "unit_price" || colId === "purchase_price" || colId === "base_unit_price") {
      if (isPositivePrice(props.value)) {
        startValue = safeMoney(props.value).formatIT(false);
      } else {
        startValue = "";
      }
    } else if (colId === "vat_rate" || colId === "iva_pct") {
      const vStr = String(props.value).trim();
      startValue = vStr === "" || vStr === "null" || vStr === "undefined" ? "" : vStr;
    } else if (colId === "quantity" || colId === "quantita") {
      const qStr = String(props.value).trim();
      startValue = qStr === "0" || qStr === "" ? "" : qStr;
    } else if (colId === "ric_pct") {
      if (props.value !== null && props.value !== undefined && props.value !== "") {
        const num = typeof props.value === "number" ? props.value : parseFloat(String(props.value));
        startValue = isNaN(num) ? "" : num.toFixed(1);
      } else {
        startValue = "";
      }
    } else {
      startValue = String(props.value);
    }
  }
  if (isTypedChar && props.eventKey) startValue = props.eventKey;
  if (isDelete) startValue = "";
  if (isUppercaseCol && typeof startValue === "string") startValue = startValue.toUpperCase();

  const [value, setValue] = useState(startValue);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  const isBackspaceOrDeleteRef = useRef(isDelete);
  const lastTypedLengthRef = useRef(startValue.length);

  const isNumericCol = [
      "discount_pct", "sconto_pct", "unit_price", "prezzo", "purchase_price", "prezzo_acquisto", "base_unit_price", "markup_pct", "vat_rate", "iva_pct", "ric_pct"
  ].includes(colId || "");

  const candidates = useMemo(() => {
    if (!props.api || !colId || isNumericCol) return [];
    const set = new Set<string>();
    const list: string[] = [];
    const currentRowIdx = props.node?.rowIndex ?? Infinity;

    const aboveNodes: any[] = [];
    const belowNodes: any[] = [];

    props.api.forEachNode((node) => {
      if (node.rowIndex !== null && node.rowIndex !== undefined) {
        if (node.rowIndex < currentRowIdx) aboveNodes.push(node);
        else if (node.rowIndex > currentRowIdx) belowNodes.push(node);
      }
    });

    aboveNodes.reverse();

    [...aboveNodes, ...belowNodes].forEach((node) => {
      const cellVal = node.data?.[colId];
      if (cellVal !== undefined && cellVal !== null) {
        const strVal = String(cellVal).trim();
        const upperStr = isUppercaseCol ? strVal.toUpperCase() : strVal;
        if (upperStr && !set.has(upperStr)) {
          set.add(upperStr);
          list.push(upperStr);
        }
      }
    });

    if (colId === "unit" || colId === "um") {
      STANDARD_UM.forEach((u) => {
        if (!set.has(u)) {
          set.add(u);
          list.push(u);
        }
      });
    }

    return list;
  }, [props.api, colId, isUppercaseCol, props.node?.rowIndex, isNumericCol]);

  const matchedSuggestions = useMemo(() => {
    if (!value || !value.trim()) return [];
    const query = value.trim().toUpperCase();

    const prefixMatches = candidates.filter((c) => c.toUpperCase().startsWith(query) && c.toUpperCase() !== query);
    const containsMatches = candidates.filter((c) => !c.toUpperCase().startsWith(query) && c.toUpperCase().includes(query));

    return [...prefixMatches, ...containsMatches].slice(0, 7);
  }, [candidates, value]);

  useImperativeHandle(ref, () => ({
    getValue: () => (isUppercaseCol && typeof value === "string" ? value.toUpperCase() : value),
    isPopup: () => false,
  }));

  useEffect(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, colId === "unit" || colId === "um" ? 140 : 280),
      });
    }
  }, [value, showSuggestions, colId]);

  useEffect(() => {
    window.__isDDTCellEditing = true;
    if (inputRef.current) {
      inputRef.current.focus();

      if (isTypedChar && startValue.trim().length >= 1) {
        const query = startValue.toUpperCase();
        const bestMatch = candidates.find((c) => c.toUpperCase().startsWith(query));

        if (bestMatch && bestMatch.length > startValue.length) {
          setValue(bestMatch);
          setShowSuggestions(true);
          setSelectedSuggestionIdx(0);
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.setSelectionRange(startValue.length, bestMatch.length);
            }
          }, 0);
          return;
        }
      }

      inputRef.current.setSelectionRange(String(startValue).length, String(startValue).length);
    }
    return () => {
      setTimeout(() => {
        window.__isDDTCellEditing = false;
      }, 200);
    };
  }, [startValue, candidates, isTypedChar]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const nextVal = isUppercaseCol ? rawVal.toUpperCase() : rawVal;
    const isForwardTyping = !isBackspaceOrDeleteRef.current && nextVal.length > lastTypedLengthRef.current;
    lastTypedLengthRef.current = nextVal.length;
    isBackspaceOrDeleteRef.current = false;

    if (isForwardTyping && nextVal.trim().length >= 1) {
      const query = nextVal.toUpperCase();
      const bestMatch = candidates.find((c) => c.toUpperCase().startsWith(query));

      if (bestMatch && bestMatch.length > nextVal.length) {
        setValue(bestMatch);
        setShowSuggestions(true);
        setSelectedSuggestionIdx(0);

        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(nextVal.length, bestMatch.length);
          }
        }, 0);
        return;
      }
    }

    setValue(nextVal);
    setShowSuggestions(nextVal.trim().length >= 1 && matchedSuggestions.length > 0);
    setSelectedSuggestionIdx(-1);
  };

  const applySuggestion = (suggestedText: string) => {
    setValue(suggestedText);
    setShowSuggestions(false);
    if (inputRef.current) {
      inputRef.current.focus();
      const len = suggestedText.length;
      inputRef.current.setSelectionRange(len, len);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" || e.key === "Delete") {
      isBackspaceOrDeleteRef.current = true;
      setShowSuggestions(false);
    }

    if (e.key === "Escape") {
      if (showSuggestions) {
        setShowSuggestions(false);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      window.__isDDTCellEditing = true;
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent?.stopImmediatePropagation?.();
      setValue(props.value !== null && props.value !== undefined ? props.value : "");
      props.api?.stopEditing(true);
      setTimeout(() => {
        window.__isDDTCellEditing = false;
      }, 200);
      return;
    }

    if (showSuggestions && matchedSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedSuggestionIdx((prev) => (prev < matchedSuggestions.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedSuggestionIdx((prev) => (prev > 0 ? prev - 1 : matchedSuggestions.length - 1));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && selectedSuggestionIdx >= 0)) {
        if (selectedSuggestionIdx >= 0 && selectedSuggestionIdx < matchedSuggestions.length) {
          e.preventDefault();
          e.stopPropagation();
          applySuggestion(matchedSuggestions[selectedSuggestionIdx]);
          return;
        }
      }
    }

    // 1. Tasto Tab / Shift+Tab (movimento orizzontale a capo stile Excel)
    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      setShowSuggestions(false);
      props.api?.stopEditing(false);

      const displayed = props.api?.getAllDisplayedColumns ? props.api.getAllDisplayedColumns() : [];
      const editableCols = displayed
        .filter((column) => column.isCellEditable(props.node))
        .map((column) => column.getColId());

      const currentColId = props.column.getColId();
      const colIdx = editableCols.indexOf(currentColId);
      let nextRow = props.node.rowIndex ?? 0;
      let nextColIdx = colIdx;

      if (e.shiftKey) {
        nextColIdx--;
        if (nextColIdx < 0) {
          if (nextRow > 0) {
            nextRow--;
            nextColIdx = editableCols.length - 1;
          } else {
            nextColIdx = 0;
          }
        }
      } else {
        nextColIdx++;
        if (nextColIdx >= editableCols.length) {
          if (nextRow < (props.api?.getDisplayedRowCount?.() || 500) - 1) {
            nextRow++;
            nextColIdx = 0;
          } else {
            nextColIdx = editableCols.length - 1;
          }
        }
      }

      setTimeout(() => {
        const targetCol = editableCols[nextColIdx];
        if (targetCol && props.api) {
          const first = props.api.getFirstDisplayedRowIndex ? props.api.getFirstDisplayedRowIndex() : 0;
          const last = props.api.getLastDisplayedRowIndex ? props.api.getLastDisplayedRowIndex() : 15;
          if (nextRow <= first || nextRow >= last) {
            props.api.ensureIndexVisible(nextRow, null);
          }
          props.api.setFocusedCell(nextRow, targetCol);
          props.api.startEditingCell({ rowIndex: nextRow, colKey: targetCol });
        }
      }, 15);
      return;
    }

    // 2. Tasto Invio / Shift+Invio (conferma e scende/sale di riga stile Excel)
    if (e.key === "Enter") {
      if (showSuggestions && selectedSuggestionIdx >= 0 && selectedSuggestionIdx < matchedSuggestions.length) {
        e.preventDefault();
        e.stopPropagation();
        applySuggestion(matchedSuggestions[selectedSuggestionIdx]);
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent?.stopImmediatePropagation?.();
      setShowSuggestions(false);
      props.api?.stopEditing(false);

      const currentColId = props.column.getColId();
      let nextRow = props.node.rowIndex ?? 0;
      const totalRows = props.api?.getDisplayedRowCount?.() || 500;

      if (e.shiftKey) {
        if (nextRow > 0) nextRow--;
      } else {
        if (nextRow < totalRows - 1) nextRow++;
      }

      setTimeout(() => {
        if (props.api) {
          const first = props.api.getFirstDisplayedRowIndex ? props.api.getFirstDisplayedRowIndex() : 0;
          const last = props.api.getLastDisplayedRowIndex ? props.api.getLastDisplayedRowIndex() : 15;
          if (nextRow <= first || nextRow >= last) {
            props.api.ensureIndexVisible(nextRow, null);
          }
          props.api.setFocusedCell(nextRow, currentColId);
          props.api.startEditingCell({ rowIndex: nextRow, colKey: currentColId });
        }
      }, 15);
      return;
    }

    // 3. Frecce Su / Giù
    if (e.key === "ArrowDown" && !showSuggestions) {
      e.preventDefault();
      e.stopPropagation();
      props.api?.stopEditing(false);
      const currentColId = props.column.getColId();
      const totalRows = props.api?.getDisplayedRowCount?.() || 500;
      const nextRow = Math.min((props.node.rowIndex ?? 0) + 1, totalRows - 1);

      setTimeout(() => {
        if (props.api) {
          const first = props.api.getFirstDisplayedRowIndex ? props.api.getFirstDisplayedRowIndex() : 0;
          const last = props.api.getLastDisplayedRowIndex ? props.api.getLastDisplayedRowIndex() : 15;
          if (nextRow <= first || nextRow >= last) {
            props.api.ensureIndexVisible(nextRow, null);
          }
          props.api.setFocusedCell(nextRow, currentColId);
        }
      }, 15);
      return;
    }

    if (e.key === "ArrowUp" && !showSuggestions) {
      e.preventDefault();
      e.stopPropagation();
      props.api?.stopEditing(false);
      const currentColId = props.column.getColId();
      const nextRow = Math.max((props.node.rowIndex ?? 0) - 1, 0);

      setTimeout(() => {
        if (props.api) {
          const first = props.api.getFirstDisplayedRowIndex ? props.api.getFirstDisplayedRowIndex() : 0;
          const last = props.api.getLastDisplayedRowIndex ? props.api.getLastDisplayedRowIndex() : 15;
          if (nextRow <= first || nextRow >= last) {
            props.api.ensureIndexVisible(nextRow, null);
          }
          props.api.setFocusedCell(nextRow, currentColId);
        }
      }, 15);
      return;
    }

    // 4. Frecce Sinistra / Destra
    const inputEl = inputRef.current;
    const isAtStart = inputEl && inputEl.selectionStart === 0 && inputEl.selectionEnd === 0;
    const isAtEnd = inputEl && inputEl.selectionStart === inputEl.value.length && inputEl.selectionEnd === inputEl.value.length;
    const isAllSelected = inputEl && inputEl.selectionStart === 0 && inputEl.selectionEnd === inputEl.value.length;

    if (e.key === "ArrowLeft" && (isAtStart || isAllSelected) && !showSuggestions) {
      const displayed = props.api?.getAllDisplayedColumns ? props.api.getAllDisplayedColumns() : [];
      const editableCols = displayed
        .filter((column) => column.isCellEditable(props.node))
        .map((column) => column.getColId());

      const currentColId = props.column.getColId();
      const colIdx = editableCols.indexOf(currentColId);
      if (colIdx > 0) {
        e.preventDefault();
        e.stopPropagation();
        props.api?.stopEditing(false);
        const prevCol = editableCols[colIdx - 1];
        const curRow = props.node.rowIndex ?? 0;
        setTimeout(() => {
          if (props.api) {
            props.api.setFocusedCell(curRow, prevCol);
          }
        }, 15);
        return;
      }
    }

    if (e.key === "ArrowRight" && (isAtEnd || isAllSelected) && !showSuggestions) {
      const displayed = props.api?.getAllDisplayedColumns ? props.api.getAllDisplayedColumns() : [];
      const editableCols = displayed
        .filter((column) => column.isCellEditable(props.node))
        .map((column) => column.getColId());

      const currentColId = props.column.getColId();
      const colIdx = editableCols.indexOf(currentColId);
      if (colIdx >= 0 && colIdx < editableCols.length - 1) {
        e.preventDefault();
        e.stopPropagation();
        props.api?.stopEditing(false);
        const nextCol = editableCols[colIdx + 1];
        const curRow = props.node.rowIndex ?? 0;
        setTimeout(() => {
          if (props.api) {
            props.api.setFocusedCell(curRow, nextCol);
          }
        }, 15);
        return;
      }
    }
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <input
        ref={inputRef}
        value={value}
        maxLength={colId === "description" || colId === "descrizione" ? 55 : undefined}
        onChange={handleInputChange}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setTimeout(() => setShowSuggestions(false), 200);
        }}
        style={{
          width: "100%",
          height: "100%",
          padding: "0 8px",
          boxSizing: "border-box",
          border: "none",
          background: "#ffffff",
          color: "#000000",
          outline: "2px solid #2563eb",
          fontSize: "12px",
          fontWeight: 600,
          textTransform: isUppercaseCol ? "uppercase" : "none",
        }}
      />

      {showSuggestions && matchedSuggestions.length > 0 && (
        <div
          style={{
            position: "fixed",
            top: `${dropdownPos.top}px`,
            left: `${dropdownPos.left}px`,
            minWidth: `${dropdownPos.width}px`,
            maxWidth: "450px",
            zIndex: 99999,
            backgroundColor: "#0f172a",
            border: "1px solid #3b82f6",
            borderRadius: "8px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.7)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "3px 8px",
              backgroundColor: "#1e293b",
              borderBottom: "1px solid #334155",
              fontSize: "10px",
              fontWeight: 700,
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              textTransform: "uppercase",
            }}
          >
            <span>💡 Suggerimenti da righe sopra</span>
            <span style={{ fontSize: "9px", color: "#60a5fa", fontFamily: "monospace" }}>Tab / Invio</span>
          </div>

          <div style={{ maxHeight: "180px", overflowY: "auto" }}>
            {matchedSuggestions.map((item, idx) => {
              const isSelected = idx === selectedSuggestionIdx;
              return (
                <div
                  key={idx}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySuggestion(item);
                  }}
                  onMouseEnter={() => setSelectedSuggestionIdx(idx)}
                  style={{
                    padding: "6px 10px",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    color: isSelected ? "#ffffff" : "#cbd5e1",
                    backgroundColor: isSelected ? "#2563eb" : "transparent",
                    borderBottom: idx < matchedSuggestions.length - 1 ? "1px solid #1e293b" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item}
                  </span>
                  {isSelected && (
                    <span
                      style={{
                        fontSize: "9px",
                        backgroundColor: "rgba(255,255,255,0.2)",
                        padding: "1px 4px",
                        borderRadius: "3px",
                        fontFamily: "monospace",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      INVIO ↵
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

DDTTextEditor.displayName = "DDTTextEditor";
export default DDTTextEditor;

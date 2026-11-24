import React, { useEffect, useLayoutEffect, useRef, useState, memo } from "react";
import { getFormattedInitValue } from "../utils/productListViewUtils";

interface CellInputEditorProps {
  rowId: string;
  colId: string;
  initialValue: string;
  isInitialCharTyped?: boolean;
  alignClass: string;
  className: string;
  onCommit: (rowId: string, colId: string, val: string) => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent, rowId: string, colId: string, currentValStr: string) => void;
}

const CellInputEditor: React.FC<CellInputEditorProps> = ({
  rowId,
  colId,
  initialValue,
  isInitialCharTyped,
  alignClass,
  className,
  onCommit,
  onCancel,
  onKeyDown,
}) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (isInitialCharTyped) {
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      } else {
        inputRef.current.select();
      }
    }
  }, [isInitialCharTyped]);

  const datalistId = colId === "fornitore" ? "general-suppliers-autocomplete" : undefined;

  return (
    <td className={`p-0 relative ${alignClass} ${className}`}>
      <input
        ref={inputRef}
        autoFocus
        type="text"
        list={datalistId}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => onCommit(rowId, colId, localValue)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
            return;
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            onKeyDown(e, rowId, colId, localValue);
            return;
          }
          onKeyDown(e, rowId, colId, localValue);
        }}
        className={`w-full h-full px-2 py-1 bg-[var(--background)] text-[var(--foreground)] outline-none border-2 border-[var(--primary)] text-[11.5px] font-mono shadow-inner ${alignClass}`}
      />
    </td>
  );
};

export interface GeneralPriceListEditableCellProps {
  rowId: string;
  colId: string;
  value: any;
  displayValue: string;
  align?: "left" | "center" | "right";
  isActive: boolean;
  isEditing: boolean;
  isRowActive?: boolean;
  shouldScroll?: boolean;
  initialChar?: string;
  canEdit: boolean;
  onSelectCell: (rowId: string, colId: string) => void;
  onStartEdit: (rowId: string, colId: string, char?: string) => void;
  onCommit: (rowId: string, colId: string, val: string) => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent, rowId: string, colId: string, currentValStr: string) => void;
  className?: string;
}

export const GeneralPriceListEditableCell: React.FC<GeneralPriceListEditableCellProps> = memo(
  ({
    rowId,
    colId,
    value,
    displayValue,
    align = "left",
    isActive,
    isEditing,
    isRowActive: _isRowActive,
    shouldScroll = false,
    initialChar,
    canEdit,
    onSelectCell,
    onStartEdit,
    onCommit,
    onCancel,
    onKeyDown,
    className = "",
  }) => {
    const tdRef = useRef<HTMLTableCellElement>(null);
    const alignClass =
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

    useEffect(() => {
      if (isActive && !isEditing && tdRef.current) {
        const activeEl = typeof document !== "undefined" ? document.activeElement : null;
        if (
          activeEl &&
          (activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            activeEl.getAttribute("contenteditable") === "true")
        ) {
          return;
        }
        tdRef.current.focus({ preventScroll: true });
        if (shouldScroll) {
          tdRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }
    }, [isActive, isEditing, shouldScroll]);

    if (isEditing) {
      return (
        <CellInputEditor
          rowId={rowId}
          colId={colId}
          initialValue={getFormattedInitValue(value, colId, initialChar)}
          isInitialCharTyped={initialChar !== undefined}
          alignClass={alignClass}
          className={className}
          onCommit={onCommit}
          onCancel={onCancel}
          onKeyDown={onKeyDown}
        />
      );
    }

    return (
      <td
        ref={tdRef}
        onMouseDown={(e) => {
          if (e.button === 0) {
            onSelectCell(rowId, colId);
            tdRef.current?.focus();
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onDoubleClick={() => {
          if (canEdit && colId !== "data_ref") onStartEdit(rowId, colId);
        }}
        onKeyDown={(e) => onKeyDown(e, rowId, colId, displayValue)}
        tabIndex={canEdit ? 0 : -1}
        className={`px-2.5 py-1.5 outline-none cursor-pointer select-none ${alignClass} ${className} ${
          isActive
            ? "ring-1 ring-sky-300 ring-inset bg-white/10 font-bold shadow-sm"
            : ""
        }`}
        title={displayValue}
      >
        {displayValue}
      </td>
    );
  }
);

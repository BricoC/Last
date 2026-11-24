import React, { useEffect, useRef, useState, memo } from "react";
import { getClientFormattedInitValue } from "../utils/customerPriceListViewUtils";
import { getEffectiveDescriptionRichHtml } from "../utils/descriptionRichText";
import { DescriptionRichEditorCell } from "./DescriptionRichEditorCell";

interface CellInputEditorProps {
  rowId: string;
  colId: string;
  initialValue: string;
  isInitialCharTyped: boolean;
  alignClass: string;
  className?: string;
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
  className = "",
  onCommit,
  onCancel,
  onKeyDown,
}) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      if (isInitialCharTyped) {
        inputRef.current.selectionStart = inputRef.current.value.length;
        inputRef.current.selectionEnd = inputRef.current.value.length;
      } else {
        inputRef.current.select();
      }
    }
  }, [isInitialCharTyped]);

  const datalistId =
    colId === "cliente"
      ? "distinct-clients-autocomplete"
      : colId === "fornitore"
      ? "order-suppliers-autocomplete"
      : undefined;

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

export interface CustomerPriceListEditableCellProps {
  rowId: string;
  colId: string;
  value: any;
  displayValue: string;
  richHtml?: string | null;
  align?: "left" | "center" | "right";
  isActive: boolean;
  isEditing: boolean;
  shouldScroll?: boolean;
  initialChar?: string;
  canEdit: boolean;
  onSelectCell: (rowId: string, colId: string, fromKeyboard?: boolean) => void;
  onStartEdit: (rowId: string, colId: string, char?: string) => void;
  onCommit: (rowId: string, colId: string, val: string, richHtml?: string | null) => void;
  onCancel: () => void;
  onKeyDown: (
    e: React.KeyboardEvent,
    rowId: string,
    colId: string,
    currentValStr: string,
    currentRichHtml?: string | null
  ) => void;
  className?: string;
}

export const CustomerPriceListEditableCell: React.FC<CustomerPriceListEditableCellProps> = memo(
  ({
    rowId,
    colId,
    value,
    displayValue,
    richHtml,
    align = "left",
    isActive,
    isEditing,
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
    const effectiveRichHtml =
      colId === "descrizione" ? getEffectiveDescriptionRichHtml(value, richHtml) : null;

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
      if (colId === "descrizione" && canEdit) {
        return (
          <DescriptionRichEditorCell
            rowId={rowId}
            colId={colId}
            initialPlainValue={getClientFormattedInitValue(value, colId, initialChar)}
            initialRichHtml={initialChar !== undefined ? null : effectiveRichHtml}
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
        <CellInputEditor
          rowId={rowId}
          colId={colId}
          initialValue={getClientFormattedInitValue(value, colId, initialChar)}
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
        onKeyDown={(e) => onKeyDown(e, rowId, colId, displayValue, effectiveRichHtml)}
        tabIndex={canEdit ? 0 : -1}
        className={`px-2.5 py-1.5 outline-none cursor-pointer select-none ${alignClass} ${className} ${
          isActive
            ? "ring-1 ring-sky-300 ring-inset bg-white/10 font-bold shadow-sm"
            : ""
        }`}
        title={displayValue}
      >
        {effectiveRichHtml ? (
          <span className="pl-rich-text" dangerouslySetInnerHTML={{ __html: effectiveRichHtml }} />
        ) : (
          displayValue
        )}
      </td>
    );
  }
);

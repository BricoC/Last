import React, { memo, useEffect, useRef, useState } from "react";
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
  const isCancelledRef = useRef(false);

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
        onBlur={() => {
          if (isCancelledRef.current) return;
          onCommit(rowId, colId, localValue);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            isCancelledRef.current = true;
            onCancel();
            return;
          }
          onKeyDown(e, rowId, colId, localValue);
        }}
        className="w-full h-full px-2.5 py-1 text-xs font-mono bg-blue-900/30 text-[var(--foreground)] border-2 border-blue-500 rounded-none outline-none shadow-inner"
      />
    </td>
  );
};

export interface CustomerEmbeddedEditableCellProps {
  rowId: string;
  colId: string;
  value: any;
  displayValue: string;
  richHtml?: string | null;
  align?: "left" | "center" | "right";
  isActive?: boolean;
  isEditing?: boolean;
  initialChar?: string;
  canEdit?: boolean;
  className?: string;
  onSelectCell: (rowId: string, colId: string) => void;
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
}

export const CustomerEmbeddedEditableCell: React.FC<CustomerEmbeddedEditableCellProps> = memo(
  ({
    rowId,
    colId,
    value,
    displayValue,
    richHtml,
    align = "left",
    isActive = false,
    isEditing = false,
    initialChar,
    canEdit = true,
    className = "",
    onSelectCell,
    onStartEdit,
    onCommit,
    onCancel,
    onKeyDown,
  }) => {
    const alignClass =
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
    const effectiveRichHtml =
      colId === "descrizione" ? getEffectiveDescriptionRichHtml(value, richHtml) : null;

    if (isEditing) {
      if (colId === "descrizione" && canEdit) {
        return (
          <DescriptionRichEditorCell
            rowId={rowId}
            colId={colId}
            initialPlainValue={initialChar !== undefined ? initialChar : value != null ? String(value) : ""}
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
          initialValue={initialChar !== undefined ? initialChar : value != null ? String(value) : ""}
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
        tabIndex={0}
        onClick={() => onSelectCell(rowId, colId)}
        onDoubleClick={() => {
          if (canEdit) onStartEdit(rowId, colId);
        }}
        onKeyDown={(e) => onKeyDown(e, rowId, colId, value != null ? String(value) : "", effectiveRichHtml)}
        className={`px-2.5 py-1.5 transition-colors relative outline-none cursor-pointer ${alignClass} ${
          isActive
            ? "ring-2 ring-blue-500 ring-inset bg-blue-500/10 font-bold"
            : "hover:bg-[var(--accent)]/30"
        } ${className}`}
      >
        {effectiveRichHtml ? (
          <span
            className="truncate block pl-rich-text"
            dangerouslySetInnerHTML={{ __html: effectiveRichHtml }}
          />
        ) : (
          <span className="truncate block">{displayValue}</span>
        )}
      </td>
    );
  }
);

CustomerEmbeddedEditableCell.displayName = "CustomerEmbeddedEditableCell";

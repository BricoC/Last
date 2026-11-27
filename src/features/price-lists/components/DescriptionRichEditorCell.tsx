import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bold, Check, Eraser, GripHorizontal, Highlighter, Italic, Type } from "lucide-react";
import {
  extractPlainTextFromRichHtml,
  PRICE_LIST_HIGHLIGHT_COLORS,
  PRICE_LIST_TEXT_COLORS,
  PriceListHighlightToken,
  PriceListTextColorToken,
  sanitizeDescriptionRichHtml,
} from "../utils/descriptionRichText";

export interface DescriptionRichEditorCellProps {
  rowId: string;
  colId: string;
  initialPlainValue: string;
  initialRichHtml?: string | null;
  isInitialCharTyped?: boolean;
  alignClass: string;
  className?: string;
  onCommit: (rowId: string, colId: string, plainVal: string, richHtml?: string | null) => void;
  onCancel: () => void;
  onKeyDown: (
    e: React.KeyboardEvent,
    rowId: string,
    colId: string,
    currentValStr: string,
    currentRichHtml?: string | null
  ) => void;
}

function escapeHtmlText(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unwrapTagWithAttr(root: HTMLElement, tagName: string, attrName: string) {
  const nodes = Array.from(root.querySelectorAll(`${tagName}[${attrName}]`));
  for (const el of nodes) {
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
  }
}

export const DescriptionRichEditorCell: React.FC<DescriptionRichEditorCellProps> = ({
  rowId,
  colId,
  initialPlainValue,
  initialRichHtml,
  isInitialCharTyped = false,
  alignClass,
  className = "",
  onCommit,
  onCancel,
  onKeyDown,
}) => {
  const tdRef = useRef<HTMLTableCellElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const isCancelledRef = useRef(false);
  const isCommittedRef = useRef(false);
  const isInteractingWithPopupRef = useRef(false);

  const [popupPos, setPopupPos] = useState<{ left: number; top: number } | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
  } | null>(null);

  const readCurrentValues = useCallback(() => {
    const el = editorRef.current;
    if (!el) return { plain: initialPlainValue, rich: initialRichHtml ?? null };
    const rawHtml = el.innerHTML;
    const plain = extractPlainTextFromRichHtml(rawHtml);
    const rich = sanitizeDescriptionRichHtml(rawHtml);
    return { plain, rich };
  }, [initialPlainValue, initialRichHtml]);

  const commitNow = useCallback(() => {
    if (isCancelledRef.current || isCommittedRef.current) return;
    isCommittedRef.current = true;
    const { plain, rich } = readCurrentValues();
    onCommit(rowId, colId, plain, rich);
  }, [colId, onCommit, readCurrentValues, rowId]);

  // Inizializza contenuto, focus, selezione e posizione iniziale del popup
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (isInitialCharTyped) {
      editor.textContent = initialPlainValue;
    } else if (initialRichHtml) {
      editor.innerHTML = sanitizeDescriptionRichHtml(initialRichHtml) || escapeHtmlText(initialPlainValue);
    } else {
      editor.innerHTML = escapeHtmlText(initialPlainValue);
    }

    editor.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      if (isInitialCharTyped) {
        range.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(range);
    }

    if (tdRef.current) {
      const rect = tdRef.current.getBoundingClientRect();
      const popupWidth = 390;
      const popupHeight = 38;
      const margin = 8;
      let left = rect.left;
      if (left + popupWidth > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - popupWidth - margin);
      }
      let top = rect.top - popupHeight - 6;
      if (top < margin) {
        top = rect.bottom + 6;
      }
      setPopupPos({ left, top });
    }
  }, [initialPlainValue, initialRichHtml, isInitialCharTyped]);

  // Drag del popup volante
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const nextLeft = Math.max(
        4,
        Math.min(window.innerWidth - 120, drag.origLeft + (e.clientX - drag.startX))
      );
      const nextTop = Math.max(
        4,
        Math.min(window.innerHeight - 44, drag.origTop + (e.clientY - drag.startY))
      );
      setPopupPos({ left: nextLeft, top: nextTop });
    };

    const handlePointerUp = () => {
      if (dragStateRef.current) {
        dragStateRef.current = null;
        isInteractingWithPopupRef.current = false;
        editorRef.current?.focus();
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const ensureEditorRange = (): Range | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    editor.focus();
    const sel = window.getSelection();
    if (!sel) return null;

    if (sel.rangeCount > 0) {
      const current = sel.getRangeAt(0);
      if (editor.contains(current.commonAncestorContainer) && !current.collapsed) {
        return current;
      }
    }

    // Se non c'è selezione parziale, applica all'intero testo della cella
    const fullRange = document.createRange();
    fullRange.selectNodeContents(editor);
    sel.removeAllRanges();
    sel.addRange(fullRange);
    return fullRange;
  };

  const applyWrapTag = (tagName: "span" | "mark", attrName: string, attrValue: string | null) => {
    const editor = editorRef.current;
    if (!editor) return;
    const range = ensureEditorRange();
    if (!range) return;

    const fragment = range.extractContents();
    const temp = document.createElement("div");
    temp.appendChild(fragment);
    // Rimuove eventuali tag dello stesso tipo già presenti nella selezione per evitare annidamenti inutili
    unwrapTagWithAttr(temp, tagName, attrName);

    let insertedNode: Node;
    if (attrValue) {
      const wrapper = document.createElement(tagName);
      wrapper.setAttribute(attrName, attrValue);
      while (temp.firstChild) {
        wrapper.appendChild(temp.firstChild);
      }
      range.insertNode(wrapper);
      insertedNode = wrapper;
    } else {
      const docFrag = document.createDocumentFragment();
      const first = temp.firstChild;
      const last = temp.lastChild;
      while (temp.firstChild) {
        docFrag.appendChild(temp.firstChild);
      }
      range.insertNode(docFrag);
      if (first && last) {
        const sel = window.getSelection();
        if (sel) {
          const newRange = document.createRange();
          newRange.setStartBefore(first);
          newRange.setEndAfter(last);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
      }
      return;
    }

    const sel = window.getSelection();
    if (sel) {
      const newRange = document.createRange();
      newRange.selectNodeContents(insertedNode);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  };

  const handleToggleBold = () => {
    ensureEditorRange();
    document.execCommand("bold");
  };

  const handleToggleItalic = () => {
    ensureEditorRange();
    document.execCommand("italic");
  };

  const handleTextColor = (token: PriceListTextColorToken | null) => {
    applyWrapTag("span", "data-pl-color", token);
  };

  const handleHighlight = (token: PriceListHighlightToken | null) => {
    applyWrapTag("mark", "data-pl-hl", token);
  };

  const handleClearFormatting = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const plain = extractPlainTextFromRichHtml(editor.innerHTML);
    editor.textContent = plain;
    editor.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const popup =
    popupPos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popupRef}
            data-pl-rich-popup="true"
            style={{ left: popupPos.left, top: popupPos.top }}
            onMouseDown={(e) => {
              e.preventDefault();
              isInteractingWithPopupRef.current = true;
            }}
            onMouseUp={() => {
              if (!dragStateRef.current) {
                isInteractingWithPopupRef.current = false;
              }
            }}
            className="fixed z-[300] flex items-center gap-1 px-1.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-xl select-none"
          >
            {/* Maniglia per trascinare il popup */}
            <div
              title="Trascina barra formattazione"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                isInteractingWithPopupRef.current = true;
                dragStateRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  origLeft: popupPos.left,
                  origTop: popupPos.top,
                };
              }}
              className="px-0.5 py-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-grab active:cursor-grabbing flex items-center"
            >
              <GripHorizontal className="w-3.5 h-3.5" />
            </div>

            {/* Grassetto & Corsivo */}
            <button
              type="button"
              onClick={handleToggleBold}
              title="Grassetto (Ctrl+B)"
              className="p-1 rounded hover:bg-[var(--secondary)] text-[var(--foreground)] transition-colors"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleToggleItalic}
              title="Corsivo (Ctrl+I)"
              className="p-1 rounded hover:bg-[var(--secondary)] text-[var(--foreground)] transition-colors"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>

            <span className="w-px h-4 bg-[var(--border)] mx-0.5" />

            {/* Palette colore testo */}
            <span className="flex items-center gap-1" title="Colore testo">
              <Type className="w-3 h-3 text-[var(--muted-foreground)] mr-0.5" />
              {PRICE_LIST_TEXT_COLORS.map((c) => (
                <button
                  key={c.token}
                  type="button"
                  onClick={() => handleTextColor(c.token)}
                  title={`Testo ${c.label}`}
                  className="w-4 h-4 rounded-full border border-black/25 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.swatch }}
                />
              ))}
              <button
                type="button"
                onClick={() => handleTextColor(null)}
                title="Rimuovi colore testo"
                className="w-4 h-4 rounded-full border border-[var(--border)] bg-[var(--background)] text-[9px] font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center justify-center"
              >
                ×
              </button>
            </span>

            <span className="w-px h-4 bg-[var(--border)] mx-0.5" />

            {/* Palette evidenziatore */}
            <span className="flex items-center gap-1" title="Evidenziatore">
              <Highlighter className="w-3 h-3 text-[var(--muted-foreground)] mr-0.5" />
              {PRICE_LIST_HIGHLIGHT_COLORS.map((h) => (
                <button
                  key={h.token}
                  type="button"
                  onClick={() => handleHighlight(h.token)}
                  title={h.label}
                  className="w-4 h-4 rounded border border-black/25 hover:scale-110 transition-transform"
                  style={{ backgroundColor: h.swatch }}
                />
              ))}
              <button
                type="button"
                onClick={() => handleHighlight(null)}
                title="Rimuovi evidenziatore"
                className="w-4 h-4 rounded border border-[var(--border)] bg-[var(--background)] text-[9px] font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center justify-center"
              >
                ×
              </button>
            </span>

            <span className="w-px h-4 bg-[var(--border)] mx-0.5" />

            {/* Pulisci tutto + Conferma */}
            <button
              type="button"
              onClick={handleClearFormatting}
              title="Rimuovi tutta la formattazione"
              className="p-1 rounded hover:bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={commitNow}
              title="Conferma modifica (Invio)"
              className="p-1 rounded bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-500 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <td ref={tdRef} className={`p-0 relative ${alignClass} ${className}`}>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={(e) => {
          if (isCancelledRef.current || isCommittedRef.current) return;
          if (isInteractingWithPopupRef.current) return;
          const nextFocused = e.relatedTarget as Node | null;
          if (nextFocused && popupRef.current?.contains(nextFocused)) return;
          commitNow();
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain").replace(/\r?\n/g, " ");
          document.execCommand("insertText", false, text);
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
            e.preventDefault();
            e.stopPropagation();
            handleToggleBold();
            return;
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
            e.preventDefault();
            e.stopPropagation();
            handleToggleItalic();
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            isCancelledRef.current = true;
            onCancel();
            return;
          }
          if (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            if (isCommittedRef.current) return;
            isCommittedRef.current = true;
            const { plain, rich } = readCurrentValues();
            onKeyDown(e, rowId, colId, plain, rich);
            return;
          }
        }}
        className={`pl-rich-text w-full h-full px-2 py-1 bg-[var(--background)] text-[var(--foreground)] outline-none border-2 border-[var(--primary)] text-[12px] font-sans whitespace-nowrap overflow-x-auto no-scrollbar shadow-inner ${alignClass}`}
      />
      {popup}
    </td>
  );
};

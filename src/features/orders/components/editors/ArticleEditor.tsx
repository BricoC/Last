import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { ICellEditorParams } from "ag-grid-community";
import { orderRepository } from "@/features/orders/services/orderRepository";

export const ArticleEditor = forwardRef((props: ICellEditorParams, ref) => {
  const initialValue = (props as any).charPress || props.eventKey || props.value || "";
  const [value, setValue] = useState(String(initialValue));
  const valueRef = useRef(String(initialValue));
  const [suggestions, setSuggestions] = useState<Array<{ article_code: string; description: string; price: string }>>([]);
  const [showList, setShowList] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const supplierName = props.node?.data?.supplier_name || "";

  useImperativeHandle(ref, () => ({
    getValue: () => valueRef.current,
    isPopup: () => true,
  }));

  const fetchSuggestions = async (val: string) => {
    if (!val || val.length < 1) {
      setSuggestions([]);
      setShowList(false);
      return;
    }
    try {
      const results = await orderRepository.getArticleSuggestions(supplierName, val);
      setSuggestions(results);
      setShowList(results.length > 0);
      setSelectedIndex(0);
    } catch {
      setSuggestions([]);
      setShowList(false);
    }
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
    if (valueRef.current) {
      void fetchSuggestions(valueRef.current);
    }

    const captureHandler = (e: KeyboardEvent) => {
      if (!showList || suggestions.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        const sel = suggestions[selectedIndex];
        if (sel) {
          applySuggestion(sel);
        }
      } else if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setShowList(false);
      }
    };

    document.addEventListener("keydown", captureHandler, true);
    return () => document.removeEventListener("keydown", captureHandler, true);
  }, [showList, suggestions, selectedIndex]);

  const applySuggestion = (item: { article_code: string; description: string; price: string }) => {
    valueRef.current = item.article_code;
    setValue(item.article_code);
    setShowList(false);

    // Compila automaticamente anche descrizione e prezzo nella riga
    if (props.node && props.node.data) {
      props.node.setDataValue("description", item.description);
      if (item.price) {
        props.node.setDataValue("price", item.price);
      }
    }

    props.stopEditing ? props.stopEditing() : props.api?.stopEditing();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    valueRef.current = val;
    setValue(val);
    void fetchSuggestions(val);
  };

  return (
    <div className="relative w-80 bg-[var(--background)] border border-[var(--border)] rounded-md shadow-xl p-1 z-50">
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        placeholder="Codice articolo o descrizione..."
        className="w-full px-2 py-1.5 text-xs bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded outline-none focus:border-[var(--primary)] font-medium"
      />

      {showList && suggestions.length > 0 && (
        <div className="max-h-56 overflow-y-auto mt-1 border-t border-[var(--border)] pt-1 space-y-0.5">
          {suggestions.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={item.article_code + idx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(item);
                }}
                className={`flex flex-col px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-[var(--accent)] text-white font-semibold"
                    : "hover:bg-[var(--card)] text-[var(--foreground)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold">{item.article_code}</span>
                  {item.price && (
                    <span className="text-[11px] opacity-80 font-mono">
                      € {item.price}
                    </span>
                  )}
                </div>
                <span className="text-[10px] opacity-75 truncate">{item.description}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

ArticleEditor.displayName = "ArticleEditor";

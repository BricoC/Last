import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { ICellEditorParams } from "ag-grid-community";
import { Supplier } from "@/features/orders/types/order";
import { getFornitoreColor } from "@/features/orders/utils/constants";

interface SupplierEditorParams extends ICellEditorParams {
  suppliers?: Supplier[];
}

export const SupplierEditor = forwardRef((props: SupplierEditorParams, ref) => {
  const suppliers: Supplier[] = props.suppliers || (props.colDef?.cellEditorParams as any)?.suppliers || [];
  
  const isTypedChar = Boolean(props.eventKey && props.eventKey.length === 1);
  const isDelete = props.eventKey === "Backspace" || props.eventKey === "Delete";

  let startValue = props.value ?? "";
  if (isTypedChar && props.eventKey) startValue = props.eventKey;
  if (isDelete) startValue = "";

  const [value, setValue] = useState(String(startValue));
  const valueRef = useRef(String(startValue));
  const [filtered, setFiltered] = useState<Supplier[]>([]);
  const [showList, setShowList] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredRef = useRef<Supplier[]>([]);
  const showListRef = useRef(false);
  const selectedIndexRef = useRef(0);

  const syncValue = (v: string) => {
    valueRef.current = v;
    setValue(v);
  };
  const syncFiltered = (f: Supplier[]) => {
    filteredRef.current = f;
    setFiltered(f);
  };
  const syncShow = (v: boolean) => {
    showListRef.current = v;
    setShowList(v);
  };
  const syncIndex = (updater: number | ((prev: number) => number)) => {
    const next = typeof updater === "function" ? updater(selectedIndexRef.current) : updater;
    selectedIndexRef.current = next;
    setSelectedIndex(next);
  };

  useImperativeHandle(ref, () => ({
    getValue: () => valueRef.current,
    isPopup: () => false,
    afterGuiAttached: () => {
      if (inputRef.current) {
        inputRef.current.focus();
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      }
      if (props.eGridCell) {
        const rect = props.eGridCell.getBoundingClientRect();
        setDropdownStyle({
          position: "fixed",
          top: rect.bottom + 1,
          left: rect.left,
          minWidth: Math.max(rect.width, 240),
          zIndex: 99999,
        });
      }
    },
    focusIn: () => {
      if (inputRef.current) inputRef.current.focus();
    },
  }));

  const openList = (v?: string) => {
    const src = (v !== undefined ? v : valueRef.current).trim().toLowerCase();
    const f =
      src.length === 0
        ? suppliers
        : suppliers.filter((s) => s.name?.toLowerCase().includes(src));
    syncFiltered(f);
    syncShow(f.length > 0);
    syncIndex(0);
  };

  useEffect(() => {
    window.__isOrderCellEditing = true;
    if (inputRef.current) {
      inputRef.current.focus();
      if (isTypedChar) {
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      } else {
        inputRef.current.select();
      }
    }
    if (props.eGridCell) {
      const rect = props.eGridCell.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 1,
        left: rect.left,
        minWidth: Math.max(rect.width, 240),
        zIndex: 99999,
      });
    }
    openList(valueRef.current);

    const captureHandler = (e: KeyboardEvent) => {
      if (!showListRef.current || filteredRef.current.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopImmediatePropagation();
        syncIndex((prev) => Math.min(prev + 1, filteredRef.current.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopImmediatePropagation();
        syncIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        const selected = filteredRef.current[selectedIndexRef.current]?.name || valueRef.current;
        syncValue(selected);
        syncShow(false);
        props.stopEditing ? props.stopEditing() : props.api?.stopEditing();
      } else if (e.key === "Escape") {
        e.stopImmediatePropagation();
        syncShow(false);
      }
    };

    document.addEventListener("keydown", captureHandler, true);
    return () => {
      window.__isOrderCellEditing = false;
      document.removeEventListener("keydown", captureHandler, true);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    syncValue(e.target.value);
    openList(e.target.value);
  };

  const handleSelect = (name: string) => {
    syncValue(name);
    syncShow(false);
    props.stopEditing ? props.stopEditing() : props.api?.stopEditing();
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onFocus={() => openList()}
        placeholder="Fornitore..."
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
      {showList && filtered.length > 0 && (
        <div
          style={dropdownStyle}
          className="bg-[#0f172a] border border-[#334155] rounded-md shadow-2xl p-1 max-h-56 overflow-y-auto"
        >
          {filtered.slice(0, 20).map((item, idx) => {
            const isSelected = idx === selectedIndex;
            const col = getFornitoreColor(item.name);
            return (
              <div
                key={item.id || item.name}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(item.name);
                }}
                className={`flex items-center justify-between px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-blue-600 text-white font-semibold"
                    : "hover:bg-slate-800 text-slate-200"
                }`}
              >
                <div className="flex items-center gap-1.5 overflow-hidden">
                  {col && (
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: col.border }}
                    />
                  )}
                  <span className="truncate">{item.name}</span>
                </div>
                {item.representative && (
                  <span className="text-[10px] opacity-60 ml-2 truncate">
                    {item.representative}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

SupplierEditor.displayName = "SupplierEditor";

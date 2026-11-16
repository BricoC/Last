import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import { ICellEditorParams } from "ag-grid-community";
import { Supplier } from "@/features/orders/types/order";
import { getFornitoreColor } from "@/features/orders/utils/constants";

interface SupplierEditorParams extends ICellEditorParams {
  suppliers?: Supplier[];
}

export const SupplierEditor = forwardRef((props: SupplierEditorParams, ref) => {
  // Raccoglie fornitori sia dai parametri che dai nodi esistenti nella griglia
  const suppliers: Supplier[] = useMemo(() => {
    const map = new Map<string, Supplier>();
    const propList = (props.suppliers || (props.colDef?.cellEditorParams as any)?.suppliers || []) as Supplier[];
    propList.forEach((s) => {
      if (s?.name?.trim()) {
        map.set(s.name.trim().toUpperCase(), s);
      }
    });

    // Dinamico: include tutti i fornitori già digitati nelle righe della griglia attiva
    props.api?.forEachNode?.((node) => {
      const name = node.data?.supplier_name?.trim();
      if (name && !map.has(name.toUpperCase())) {
        map.set(name.toUpperCase(), {
          id: `dyn_${name.replace(/\s+/g, "_")}`,
          name: name,
          representative: "",
          email: "",
          phone: "",
          address: "",
          vat_number: "",
          notes: "",
          created_at: "",
          updated_at: "",
          sync_status: "synced",
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [props.suppliers, props.colDef, props.api]);

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

  const updateDropdownPosition = () => {
    const el = inputRef.current || (props.eGridCell as HTMLElement | null);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < 220 && rect.top > 220;

    setDropdownStyle({
      position: "fixed",
      top: showAbove ? undefined : rect.bottom + 2,
      bottom: showAbove ? window.innerHeight - rect.top + 2 : undefined,
      left: Math.max(8, rect.left),
      minWidth: Math.max(rect.width, 260),
      maxWidth: 380,
      zIndex: 99999,
    });
  };

  useImperativeHandle(ref, () => ({
    getValue: () => valueRef.current,
    isPopup: () => false,
    afterGuiAttached: () => {
      if (inputRef.current) {
        inputRef.current.focus();
        if (isTypedChar) {
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        } else {
          inputRef.current.select();
        }
      }
      updateDropdownPosition();
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
    updateDropdownPosition();
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
    updateDropdownPosition();
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
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filteredRef.current[selectedIndexRef.current]) {
          const selected = filteredRef.current[selectedIndexRef.current]?.name || valueRef.current;
          syncValue(selected);
          syncShow(false);
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopImmediatePropagation();
            props.stopEditing ? props.stopEditing() : props.api?.stopEditing();
          }
        }
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
  }, [suppliers]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    syncValue(e.target.value);
    openList(e.target.value);
  };

  const handleSelect = (name: string) => {
    syncValue(name);
    syncShow(false);
    props.stopEditing ? props.stopEditing() : props.api?.stopEditing();
  };

  const dropdownPortal =
    showList && filtered.length > 0 && typeof document !== "undefined"
      ? createPortal(
          <div
            style={dropdownStyle}
            onMouseDown={(e) => {
              // Non toglie il focus dall'input
              e.preventDefault();
            }}
            className="bg-[#0f172a] border border-[#334155] rounded-md shadow-2xl p-1 max-h-56 overflow-y-auto animate-in fade-in duration-100"
          >
            <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-700/60 mb-1 flex items-center justify-between">
              <span>🏢 Fornitori ({filtered.length})</span>
              <span className="text-[9px] text-blue-400 font-mono">Invio / Tab</span>
            </div>
            {filtered.slice(0, 30).map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const col = getFornitoreColor(item.name);
              return (
                <div
                  key={item.id || item.name}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(item.name);
                  }}
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-blue-600 text-white font-semibold"
                      : "hover:bg-slate-800 text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    {col && (
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
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
          </div>,
          document.body
        )
      : null;

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
      {dropdownPortal}
    </div>
  );
});

SupplierEditor.displayName = "SupplierEditor";

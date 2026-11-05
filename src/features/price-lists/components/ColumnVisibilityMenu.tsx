import React, { useState, useRef, useEffect } from "react";
import { Columns3, RotateCcw, X } from "lucide-react";
import { ColumnDefinition } from "../hooks/useColumnVisibility";

interface ColumnVisibilityMenuProps {
  columns: ColumnDefinition[];
  visibleColumns: Record<string, boolean>;
  onToggleColumn: (colId: string) => void;
  onResetDefault: () => void;
}

export const ColumnVisibilityMenu: React.FC<ColumnVisibilityMenuProps> = ({
  columns,
  visibleColumns,
  onToggleColumn,
  onResetDefault,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const categories = [
    { key: "anagrafica", label: "Dati Articolo" },
    { key: "costi", label: "Costi & Maggiorazioni" },
    { key: "ricarichi", label: "Ricarichi & Prezzi Vendita" },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Personalizza colonne visibili"
        className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-xs font-semibold text-[var(--foreground)] transition-colors cursor-pointer"
      >
        <Columns3 className="w-3.5 h-3.5 text-[var(--primary)]" />
        <span>Colonne</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-40 w-72 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-100 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)] mb-2">
            <span className="font-bold text-[var(--foreground)]">Colonne Visibili</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded text-[var(--muted-foreground)] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
            {categories.map((cat) => {
              const catCols = columns.filter((c) => c.category === cat.key);
              if (catCols.length === 0) return null;

              return (
                <div key={cat.key} className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] block">
                    {cat.label}
                  </span>
                  <div className="space-y-0.5">
                    {catCols.map((col) => {
                      const isChecked = visibleColumns[col.id] !== false;
                      return (
                        <label
                          key={col.id}
                          className="flex items-center space-x-2 px-2 py-1 rounded-md hover:bg-[var(--background)] cursor-pointer select-none transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => onToggleColumn(col.id)}
                            className="rounded border-[var(--border)] text-[var(--primary)] focus:ring-0"
                          />
                          <span className={isChecked ? "text-[var(--foreground)] font-medium" : "text-[var(--muted-foreground)]"}>
                            {col.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[var(--border)] mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={onResetDefault}
              className="flex items-center space-x-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Ripristina Default</span>
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1 rounded bg-[var(--primary)] text-[var(--primary-foreground)] text-[11px] font-bold hover:opacity-90 cursor-pointer"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

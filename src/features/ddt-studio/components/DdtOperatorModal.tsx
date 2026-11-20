import React, { useEffect } from "react";
import { UserCheck, X } from "lucide-react";
import { OPERATORI } from "../utils/ddtCalculations";

export interface DdtOperatorModalProps {
  isOpen: boolean;
  actionMode: "emit" | "the_one";
  onSelect: (operator: string) => void;
  onCancel: () => void;
}

const OPERATOR_OPTIONS = [
  { keyNum: "1", value: OPERATORI[0], shortLabel: "Alex" },
  { keyNum: "2", value: OPERATORI[1], shortLabel: "Nico" },
  { keyNum: "3", value: OPERATORI[2], shortLabel: "Sam" },
] as const;

export const DdtOperatorModal: React.FC<DdtOperatorModalProps> = ({
  isOpen,
  actionMode,
  onSelect,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }
      const match = OPERATOR_OPTIONS.find((opt) => opt.keyNum === e.key);
      if (match) {
        e.preventDefault();
        e.stopPropagation();
        onSelect(match.value);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onSelect, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--background)]/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--primary)]/15 border border-[var(--primary)]/30 flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-[var(--primary)]" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-[var(--foreground)]">
                Seleziona Operatore
              </h3>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {actionMode === "the_one"
                  ? "Richiesto prima di emettere e stampare (The One)"
                  : "Richiesto prima di confermare e salvare il DDT"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
            title="Chiudi (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Opzioni Operatore con scorciatoia numerica */}
        <div className="p-4 space-y-2">
          {OPERATOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/10 flex items-center justify-between transition-all group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-md bg-[var(--card)] border border-[var(--border)] group-hover:border-[var(--primary)] group-hover:text-[var(--primary)] font-mono text-xs font-bold flex items-center justify-center shadow-xs">
                  {opt.keyNum}
                </span>
                <div className="text-left">
                  <div className="text-xs font-bold text-[var(--foreground)]">
                    {opt.shortLabel}
                  </div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">
                    {opt.value}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono text-[var(--muted-foreground)] group-hover:text-[var(--primary)]">
                Premi {opt.keyNum}
              </span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[var(--border)] bg-[var(--background)]/50 flex items-center justify-between">
          <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
            Tasti rapidi: 1 · 2 · 3 · ESC
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
};

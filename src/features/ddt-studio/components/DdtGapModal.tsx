import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, FilePlus2, Ban, FastForward, X } from "lucide-react";

export interface DdtGapModalProps {
  isOpen: boolean;
  year: number;
  missingNumbers: number[];
  nextSequentialNumber: number | null;
  mode: "new_ddt" | "inspect";
  onClose: () => void;
  onRecoverNumber: (docNumber: number) => void;
  onCreatePlaceholder: (docNumber: number) => Promise<void>;
  onIgnoreAndContinue?: (missingNumbers: number[]) => void;
}

export const DdtGapModal: React.FC<DdtGapModalProps> = ({
  isOpen,
  year,
  missingNumbers,
  nextSequentialNumber,
  mode,
  onClose,
  onRecoverNumber,
  onCreatePlaceholder,
  onIgnoreAndContinue,
}) => {
  const [selectedNum, setSelectedNum] = useState<number | null>(null);
  const [isCreatingPlaceholder, setIsCreatingPlaceholder] = useState(false);

  if (!isOpen || missingNumbers.length === 0) return null;

  const activeNum =
    selectedNum !== null && missingNumbers.includes(selectedNum)
      ? selectedNum
      : missingNumbers[missingNumbers.length - 1];

  const handlePlaceholder = async () => {
    setIsCreatingPlaceholder(true);
    try {
      await onCreatePlaceholder(activeNum);
    } finally {
      setIsCreatingPlaceholder(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border border-amber-500/40 bg-[var(--card)] text-[var(--foreground)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-amber-500/10">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 className="text-sm font-bold text-amber-100">
              {missingNumbers.length === 1
                ? `Numero DDT mancante nel ${year}: #${activeNum}`
                : `${missingNumbers.length} numeri DDT mancanti nel ${year}`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]"
            title="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 text-xs">
          <p className="text-[var(--muted-foreground)] leading-relaxed">
            La numerazione dell&apos;anno <strong className="text-[var(--foreground)]">{year}</strong> presenta{" "}
            {missingNumbers.length === 1 ? "un buco" : "dei buchi"}. Scegli come procedere prima di continuare:
          </p>

          {/* Lista numeri mancanti */}
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 rounded-lg bg-[var(--background)] border border-[var(--border)]">
            {missingNumbers.map((num) => {
              const isSelected = num === activeNum;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSelectedNum(num)}
                  className={`px-2 py-0.5 rounded font-mono font-bold text-xs border transition-colors ${
                    isSelected
                      ? "bg-amber-500 text-slate-950 border-amber-400"
                      : "bg-[var(--card)] text-amber-300 border-amber-500/30 hover:border-amber-400"
                  }`}
                >
                  #{num}
                </button>
              );
            })}
          </div>

          {/* Azioni */}
          <div className="grid grid-cols-1 gap-2 pt-1">
            <button
              type="button"
              disabled={isCreatingPlaceholder}
              onClick={() => onRecoverNumber(activeNum)}
              className="w-full px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-between transition-colors disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <FilePlus2 className="w-4 h-4" />
                Recupera e crea nuovo DDT con N° #{activeNum}
              </span>
              <CheckCircle2 className="w-3.5 h-3.5 opacity-80" />
            </button>

            <button
              type="button"
              disabled={isCreatingPlaceholder}
              onClick={handlePlaceholder}
              className="w-full px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold flex items-center justify-between transition-colors disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <Ban className="w-4 h-4 text-rose-300" />
                {isCreatingPlaceholder
                  ? "Creazione placeholder..."
                  : `Inserisci Placeholder (DDT Annullato) per N° #${activeNum}`}
              </span>
            </button>

            {mode === "new_ddt" && onIgnoreAndContinue && (
              <button
                type="button"
                disabled={isCreatingPlaceholder}
                onClick={() => onIgnoreAndContinue(missingNumbers)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--background)] hover:bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] font-semibold flex items-center justify-between transition-colors disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  <FastForward className="w-4 h-4 text-sky-400" />
                  Ignora questo avviso e prosegui con N° #{nextSequentialNumber ?? "successivo"}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

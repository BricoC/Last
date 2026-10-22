import React, { useState, useEffect, useRef } from "react";
import { Printer, X } from "lucide-react";

export interface DDTPrintCopiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (copies: number) => void;
  isPrinting?: boolean;
}

export const DDTPrintCopiesModal: React.FC<DDTPrintCopiesModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isPrinting = false,
}) => {
  const [copies, setCopies] = useState<number>(1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Al momento dell'apertura reimposta a 1 e seleziona il testo per digitazione immediata
  useEffect(() => {
    if (isOpen) {
      setCopies(1);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const num = Math.max(1, copies || 1);
      onConfirm(num);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const handleConfirmClick = () => {
    const num = Math.max(1, copies || 1);
    onConfirm(num);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden select-none animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header Modale */}
        <div className="p-3.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]">
          <div className="flex items-center space-x-2">
            <Printer className="w-4 h-4 text-blue-500" />
            <span className="font-bold text-sm text-[var(--foreground)]">Stampa DDT</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo Modale */}
        <div className="p-5 flex flex-col items-center">
          <label className="text-xs font-semibold text-[var(--muted-foreground)] mb-3">
            Quante copie desideri stampare?
          </label>

          <input
            ref={inputRef}
            type="number"
            min={1}
            max={99}
            value={copies}
            onChange={(e) => setCopies(parseInt(e.target.value, 10) || 1)}
            onFocus={(e) => e.target.select()}
            disabled={isPrinting}
            className="w-24 h-12 text-center text-2xl font-bold font-mono rounded-lg border-2 border-blue-500 bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-4 focus:ring-blue-500/20"
          />

          <p className="text-[11px] text-[var(--muted-foreground)] text-center mt-3">
            Stampa su <strong>lato singolo</strong> (no fronte/retro) alla stampante predefinita.
          </p>
        </div>

        {/* Footer Azioni */}
        <div className="p-3 bg-[var(--background)] border-t border-[var(--border)] flex items-center justify-end space-x-2">
          <button
            type="button"
            disabled={isPrinting}
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Annulla (Esc)
          </button>
          <button
            type="button"
            disabled={isPrinting}
            onClick={handleConfirmClick}
            className="px-4 py-1.5 rounded text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{isPrinting ? "Invio in corso..." : "Stampa (Invio)"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

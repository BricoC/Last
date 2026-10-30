import React, { useEffect } from "react";
import { X, Keyboard } from "lucide-react";

interface OrderShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OrderShortcutsModal: React.FC<OrderShortcutsModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[9999] select-none p-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--foreground)]">
            <Keyboard className="w-4 h-4 text-[var(--primary)]" />
            <span>Scorciatoie da Tastiera — Order Manager</span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
            <kbd className="px-2 py-1 font-mono text-xs font-bold rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
              F4
            </kbd>
            <div className="flex-1">
              <strong className="text-[var(--foreground)] block text-xs">Reset Rapido Filtri & Ordinamento</strong>
              <p className="text-[var(--muted-foreground)] mt-0.5">
                Ripristina immediatamente tutti i filtri di colonna e l'ordinamento predefinito della griglia.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
            <kbd className="px-2 py-1 font-mono text-xs font-bold rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 whitespace-nowrap">
              Shift + Clic
            </kbd>
            <div className="flex-1">
              <strong className="text-[var(--foreground)] block text-xs">Filtro Rapido Cella</strong>
              <p className="text-[var(--muted-foreground)] mt-0.5">
                Tenendo premuto Shift e cliccando su una qualsiasi cella, la tabella filtra al volo tutte le righe contenenti lo stesso valore.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
            <kbd className="px-2 py-1 font-mono text-xs font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Frecce / Invio
            </kbd>
            <div className="flex-1">
              <strong className="text-[var(--foreground)] block text-xs">Navigazione Rapida Excel</strong>
              <p className="text-[var(--muted-foreground)] mt-0.5">
                Sposta il cursore direttamente alla cella successiva, salvando automaticamente il valore digitato a 0ms.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
            <kbd className="px-2 py-1 font-mono text-xs font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Esc
            </kbd>
            <div className="flex-1">
              <strong className="text-[var(--foreground)] block text-xs">Chiudi Ricerca Globale</strong>
              <p className="text-[var(--muted-foreground)] mt-0.5">
                Se la barra di ricerca in testata è attiva, premendo Esc si chiude istantaneamente e si torna alla scheda attiva.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--background)] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-md bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
          >
            Ho Capito
          </button>
        </div>
      </div>
    </div>
  );
};


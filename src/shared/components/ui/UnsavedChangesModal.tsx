 import React, { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

export interface UnsavedChangesModalProps {
  isOpen: boolean;
  title: string;
  message?: string;
  onCancel: () => void;
  onDiscard: () => void;
  onSave?: () => void;
  saveLabel?: string;
  discardLabel?: string;
  cancelLabel?: string;
  isSaving?: boolean;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  title,
  message = "Attenzione: sono presenti modifiche non salvate. Se non le salvi, le modifiche apportate verranno cancellate definitivamente.",
  onCancel,
  onDiscard,
  onSave,
  saveLabel = "Salva",
  discardLabel = "Non salvare",
  cancelLabel = "Annulla",
  isSaving = false,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter" && onSave && !isSaving) {
        e.preventDefault();
        e.stopPropagation();
        onSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel, onSave, isSaving]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100"
      role="presentation"
      onClick={onCancel}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-modal-title"
        aria-describedby="unsaved-modal-desc"
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-[var(--foreground)] shadow-2xl overflow-hidden select-none animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center justify-between gap-2">
              <h2 id="unsaved-modal-title" className="text-base font-semibold text-[var(--foreground)]">
                {title}
              </h2>
              <button
                type="button"
                onClick={onCancel}
                className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
                title="Annulla"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p id="unsaved-modal-desc" className="mt-2 text-sm text-[var(--muted-foreground)] leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-md border border-[var(--border)] bg-transparent px-3.5 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onDiscard}
            disabled={isSaving}
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3.5 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20 hover:border-red-500/60 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {discardLabel}
          </button>

          {onSave && (
            <button
              type="button"
              disabled={isSaving}
              onClick={onSave}
              className="rounded-md bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? "Salvataggio..." : saveLabel}
            </button>
          )}
        </div>
      </section>
    </div>
  );
};

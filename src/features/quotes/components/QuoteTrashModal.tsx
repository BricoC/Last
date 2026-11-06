import React, { useEffect, useState } from "react";
import { Trash2, RotateCcw, X, Loader2, AlertCircle, Check, FileText } from "lucide-react";
import type { Quote, TrashQuoteRow } from "../models/quote";
import { quoteRepository } from "../services/quoteRepository";
import { MonetaryValue } from "@/shared/domain/monetaryValue";

interface QuoteTrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuoteRestored: (quote: Quote) => void;
}

export const QuoteTrashModal: React.FC<QuoteTrashModalProps> = ({
  isOpen,
  onClose,
  onQuoteRestored,
}) => {
  const [trashItems, setTrashItems] = useState<TrashQuoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadTrash = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await quoteRepository.getTrashQuotes();
      setTrashItems(rows);
    } catch (err) {
      console.error("[QuoteTrashModal] Errore caricamento cestino:", err);
      setError("Impossibile caricare i preventivi nel cestino.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadTrash();
    } else {
      setFeedback(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRestore = async (row: TrashQuoteRow) => {
    setRestoringId(row.id);
    setError(null);
    try {
      const restored = await quoteRepository.restoreQuoteFromTrash(row.id);
      if (restored) {
        setTrashItems((prev) => prev.filter((item) => item.id !== row.id));
        setFeedback(
          `Preventivo ${row.numero || row.client_name || ""} ripristinato con successo nell'archivio!`
        );
        onQuoteRestored(restored);
        setTimeout(() => setFeedback(null), 4000);
      } else {
        setError("Impossibile completare il ripristino del preventivo.");
      }
    } catch (err) {
      console.error("[QuoteTrashModal] Errore ripristino preventivo:", err);
      setError("Errore durante il ripristino del preventivo.");
    } finally {
      setRestoringId(null);
    }
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return "—";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cestino Preventivi"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="relative flex flex-col w-full max-w-3xl max-h-[85vh] bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--background)]/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 text-red-500 rounded-lg">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base text-[var(--foreground)]">
                  Cestino Preventivi
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 font-medium">
                  {trashItems.length} / 5 preventivi
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                Capacità massima: 5 preventivi memorizzati e sincronizzati su Supabase Cloud.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-md transition-colors"
            title="Chiudi (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="px-6 py-2.5 bg-blue-500/5 border-b border-blue-500/10 flex items-center gap-2 text-xs text-blue-400">
          <AlertCircle className="w-4 h-4 shrink-0 text-blue-400" />
          <span>
            <strong>Numero univoco garantito:</strong> il progressivo di un preventivo cancellato non viene mai riutilizzato. Ripristinandolo, il preventivo conserva il suo codice originario.
          </span>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--muted-foreground)] gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
              <span className="text-xs">Caricamento cestino...</span>
            </div>
          ) : trashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--muted-foreground)] gap-2">
              <Trash2 className="w-8 h-8 opacity-40" />
              <span className="text-sm font-medium">Il cestino preventivi è vuoto</span>
              <span className="text-xs text-[var(--muted-foreground)]">
                I preventivi eliminati compariranno qui e potranno essere ripristinati in ogni momento (fino a 5).
              </span>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--background)]/30">
              {trashItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3.5 hover:bg-[var(--card)]/50 transition-colors gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 bg-[var(--card)] rounded border border-[var(--border)] text-[var(--muted-foreground)] shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-[var(--primary)]">
                          {item.numero || `Anno ${item.year}`}
                        </span>
                        <span className="text-xs font-semibold text-[var(--foreground)] truncate">
                          {item.client_name || "Senza cliente"}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)] truncate mt-0.5">
                        {item.subject || "Nessun oggetto specificato"}
                      </p>
                      <div className="flex items-center gap-3 text-[10px] text-[var(--muted-foreground)] mt-1">
                        <span>Eliminato il: {formatDateTime(item.deleted_at)}</span>
                        <span>•</span>
                        <span>Totale: <strong className="text-[var(--foreground)]">{MonetaryValue.fromSubunits(item.total_document_subunits).formatIT2()}</strong></span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRestore(item)}
                    disabled={restoringId === item.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors shrink-0"
                    title="Ripristina preventivo nell'archivio attivo"
                  >
                    {restoringId === item.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>Ripristina</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--border)] bg-[var(--background)]/50">
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {trashItems.length === 5
              ? "Cestino al completo (5/5). Eliminando un ulteriore preventivo, il più vecchio verrà rimosso definitivamente."
              : `Spazio residuo cestino: ${5 - trashItems.length} slot liberi.`}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--card)] transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};

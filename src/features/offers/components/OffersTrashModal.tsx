import React, { useEffect, useState } from "react";
import { Trash2, RotateCcw, X, Loader2, AlertCircle, Check } from "lucide-react";
import type { OfferRecord, TrashOfferRow } from "../types/offer";
import { offersRepository } from "../services/offersRepository";

interface OffersTrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOfferRestored: (offer: OfferRecord) => void;
}

export const OffersTrashModal: React.FC<OffersTrashModalProps> = ({
  isOpen,
  onClose,
  onOfferRestored,
}) => {
  const [trashItems, setTrashItems] = useState<TrashOfferRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadTrash = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await offersRepository.getTrashOffers();
      setTrashItems(rows);
    } catch (err) {
      console.error("[OffersTrashModal] Errore caricamento cestino:", err);
      setError("Impossibile caricare le offerte nel cestino.");
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

  const handleRestore = async (row: TrashOfferRow) => {
    setRestoringId(row.id);
    setError(null);
    try {
      const restored = await offersRepository.restoreFromTrash(row.id);
      if (restored) {
        setTrashItems((prev) => prev.filter((item) => item.id !== row.id));
        setFeedback(`Offerta per "${row.requester}" ripristinata con successo!`);
        onOfferRestored(restored);
        setTimeout(() => setFeedback(null), 3500);
      } else {
        setError("Impossibile completare il ripristino dell'offerta.");
      }
    } catch (err) {
      console.error("[OffersTrashModal] Errore ripristino offerta:", err);
      setError("Errore durante il ripristino dell'offerta.");
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
      aria-label="Cestino Offerte"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none"
    >
      <div className="relative flex flex-col w-full max-w-2xl max-h-[85vh] bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden text-[var(--foreground)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--background)]/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wide">Cestino Offerte</h2>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Ultime 10 offerte eliminate (a scorrimento FIFO)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] transition-colors"
            title="Chiudi (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback / Alert */}
        {feedback && (
          <div className="flex items-center space-x-2 px-4 py-2 bg-emerald-950/60 border-b border-emerald-500/30 text-emerald-300 text-xs">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}
        {error && (
          <div className="flex items-center space-x-2 px-4 py-2 bg-red-950/60 border-b border-red-500/30 text-red-300 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Contenuto Lista Cestino */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-2 text-[var(--muted-foreground)] text-xs">
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
              <span>Caricamento elementi cestino...</span>
            </div>
          ) : trashItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--muted-foreground)] italic">
              Il cestino è vuoto. Nessuna offerta presente.
            </div>
          ) : (
            trashItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]/40 hover:bg-[var(--background)]/80 transition-colors gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold truncate">
                      {item.requester}
                    </span>
                    {item.contact && (
                      <span className="text-[11px] text-[var(--muted-foreground)] truncate">
                        ({item.contact})
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-1 mt-0.5 font-normal">
                    {item.items_text || "Nessun articolo indicato"}
                  </p>
                  <div className="flex items-center space-x-2 text-[10px] text-[var(--muted-foreground)] mt-1 font-mono">
                    <span>Data offerta: {item.offer_date}</span>
                    <span>• Eliminata: {formatDateTime(item.deleted_at)}</span>
                    {item.deleted_by && <span>• Da: {item.deleted_by}</span>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRestore(item)}
                  disabled={restoringId === item.id}
                  className="px-2.5 py-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center space-x-1 transition-all shrink-0 cursor-pointer disabled:opacity-50"
                  title="Ripristina offerta"
                >
                  {restoringId === item.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  <span>Ripristina</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)] bg-[var(--background)]/40 text-xs">
          <span className="text-[11px] text-[var(--muted-foreground)] font-medium">
            Capienza: {trashItems.length} / 10 offerte
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-[var(--card)] hover:bg-[var(--border)] text-[var(--foreground)] text-xs font-medium transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};


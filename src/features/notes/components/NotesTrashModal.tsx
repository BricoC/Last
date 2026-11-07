import React, { useEffect, useState } from "react";
import { Trash2, RotateCcw, X, Loader2, AlertCircle, Check } from "lucide-react";
import type { NoteRecord, TrashNoteRow } from "../types/note";
import { notesRepository } from "../services/notesRepository";

interface NotesTrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNoteRestored: (note: NoteRecord) => void;
}

export const NotesTrashModal: React.FC<NotesTrashModalProps> = ({
  isOpen,
  onClose,
  onNoteRestored,
}) => {
  const [trashItems, setTrashItems] = useState<TrashNoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadTrash = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await notesRepository.getTrashNotes();
      setTrashItems(rows);
    } catch (err) {
      console.error("[NotesTrashModal] Errore caricamento cestino:", err);
      setError("Impossibile caricare le note nel cestino.");
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

  const handleRestore = async (row: TrashNoteRow) => {
    setRestoringId(row.id);
    setError(null);
    try {
      const restored = await notesRepository.restoreFromTrash(row.id);
      if (restored) {
        setTrashItems((prev) => prev.filter((item) => item.id !== row.id));
        setFeedback(`Nota "${row.title || "Senza titolo"}" ripristinata con successo!`);
        onNoteRestored(restored);
        setTimeout(() => setFeedback(null), 3500);
      } else {
        setError("Impossibile completare il ripristino della nota.");
      }
    } catch (err) {
      console.error("[NotesTrashModal] Errore ripristino nota:", err);
      setError("Errore durante il ripristino della nota.");
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
      aria-label="Cestino Note"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none"
    >
      <div className="relative flex flex-col w-full max-w-2xl max-h-[85vh] bg-[#0f172a] rounded-xl border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">Cestino Note</h2>
              <p className="text-[11px] text-slate-400">
                Ultime 10 note eliminate (a scorrimento FIFO)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
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
            <div className="py-12 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
              <span>Caricamento elementi cestino...</span>
            </div>
          ) : trashItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 italic">
              Il cestino è vuoto. Nessuna nota presente.
            </div>
          ) : (
            trashItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 transition-colors gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-200 truncate">
                      {item.title || "Senza titolo"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 font-normal">
                    {item.content_text || "Nota vuota"}
                  </p>
                  <div className="flex items-center space-x-2 text-[10px] text-slate-500 mt-1 font-mono">
                    <span>Eliminata: {formatDateTime(item.deleted_at)}</span>
                    {item.deleted_by && <span>• Da: {item.deleted_by}</span>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRestore(item)}
                  disabled={restoringId === item.id}
                  className="px-2.5 py-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center space-x-1 transition-all shrink-0 cursor-pointer disabled:opacity-50"
                  title="Ripristina nota"
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
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-900/40 text-xs">
          <span className="text-[11px] text-slate-400 font-medium">
            Capienza: {trashItems.length} / 10 note
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};


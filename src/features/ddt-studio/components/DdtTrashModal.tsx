import React, { useEffect, useState } from "react";
import { Trash2, RotateCcw, X, Loader2, AlertCircle, Check, AlertTriangle } from "lucide-react";
import { ddtRepository } from "../services/ddtRepository";
import { formatDdtMoney, formatDdtViewDate } from "../services/ddtViewFormatting";

interface TrashItem {
  id: string;
  doc_number: number | null;
  series: string;
  year: number;
  doc_date: string;
  status: string;
  client_name: string;
  total_document_subunits: number;
  deleted_at: string;
  items_count: number;
}

interface DdtTrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDdtRestored: () => void;
}

export const DdtTrashModal: React.FC<DdtTrashModalProps> = ({
  isOpen,
  onClose,
  onDdtRestored,
}) => {
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Conflitto di numerazione durante il ripristino
  const [conflictItem, setConflictItem] = useState<{
    id: string;
    docNumber: number;
    year: number;
  } | null>(null);

  const loadTrash = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await ddtRepository.getTrashDdts();
      setTrashItems(rows);
    } catch (err) {
      console.error("[DdtTrashModal] Errore caricamento cestino:", err);
      setError("Impossibile caricare gli elementi nel Cestino.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadTrash();
    } else {
      setFeedback(null);
      setError(null);
      setConflictItem(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (conflictItem) {
          setConflictItem(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, conflictItem, onClose]);

  if (!isOpen) return null;

  const handleRestore = async (row: TrashItem, mode: "original" | "draft" | "new_number" = "original") => {
    setRestoringId(row.id);
    setError(null);
    try {
      const res = await ddtRepository.restoreDdt(row.id, mode);
      if (res.conflict) {
        setConflictItem({
          id: row.id,
          docNumber: res.docNumber || row.doc_number || 0,
          year: res.year || row.year,
        });
        return;
      }

      if (res.success) {
        setConflictItem(null);
        const label =
          res.restoredAs === "bozza"
            ? "come Bozza"
            : res.restoredAs === "new_number"
            ? `con nuovo numero DDT ${res.docNumber}`
            : `DDT ${res.docNumber ?? ""}`;
        setFeedback(`DDT ripristinato con successo (${label})`);
        setTimeout(() => setFeedback(null), 3000);
        await loadTrash();
        onDdtRestored();
      } else {
        setError(res.error || "Errore durante il ripristino del DDT.");
      }
    } catch (err) {
      console.error("[DdtTrashModal] Errore ripristino:", err);
      setError("Impossibile completare il ripristino del DDT.");
    } finally {
      setRestoringId(null);
    }
  };

  const handleEmptyTrash = async () => {
    if (!confirm("Sei sicuro di voler svuotare definitivamente il Cestino DDT? I documenti eliminati non potranno più essere recuperati.")) {
      return;
    }
    setLoading(true);
    try {
      await ddtRepository.emptyTrash();
      setFeedback("Cestino svuotato.");
      setTimeout(() => setFeedback(null), 2500);
      await loadTrash();
      onDdtRestored();
    } catch (err) {
      console.error("[DdtTrashModal] Errore svuotamento cestino:", err);
      setError("Impossibile svuotare il Cestino.");
    } finally {
      setLoading(false);
    }
  };

  const formatDeletedAt = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] animate-in zoom-in-95 duration-150 text-[var(--foreground)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Cestino DDT Studio"
      >
        {/* Header Modale */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-slate-900/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                Cestino DDT Studio
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {trashItems.length} / 15 voci
                </span>
              </h2>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Conservate automaticamente le ultime 15 voci eliminate con possibilità di ripristino
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Chiudi (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notifiche feedback o errore */}
        {feedback && (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-300 text-xs font-semibold animate-in fade-in duration-150">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{feedback}</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 border-b border-rose-500/30 text-rose-300 text-xs font-semibold animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Modalità Conflitto Numerazione */}
        {conflictItem && (
          <div className="p-4 bg-amber-950/40 border-b border-amber-500/40 text-amber-200 text-xs space-y-3 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-300 text-sm">
                  Numero DDT già occupato!
                </p>
                <p className="mt-1 text-slate-300">
                  Il DDT n. <span className="font-mono font-bold text-white">{conflictItem.docNumber}/{conflictItem.year}</span> risulta attualmente già assegnato a un altro documento attivo.
                </p>
                <p className="mt-1 text-[11px] text-amber-300/80">
                  Come desideri ripristinare questo documento?
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-7">
              <button
                type="button"
                onClick={() => {
                  const target = trashItems.find((r) => r.id === conflictItem.id);
                  if (target) void handleRestore(target, "draft");
                }}
                className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Ripristina come Bozza
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = trashItems.find((r) => r.id === conflictItem.id);
                  if (target) void handleRestore(target, "new_number");
                }}
                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Assegna Nuovo Numero Libero
              </button>
              <button
                type="button"
                onClick={() => setConflictItem(null)}
                className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
              >
                Annulla
              </button>
            </div>
          </div>
        )}

        {/* Contenuto Lista Cestino */}
        <div className="flex-1 overflow-y-auto p-3 divide-y divide-[var(--border)]/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
              <span className="text-xs">Caricamento Cestino DDT...</span>
            </div>
          ) : trashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-[var(--muted-foreground)]">
              <Trash2 className="w-8 h-8 stroke-1 text-slate-600 mb-2" />
              <p className="text-xs font-semibold text-slate-400">Il Cestino DDT è vuoto.</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Nessun DDT o bozza eliminata di recente.
              </p>
            </div>
          ) : (
            trashItems.map((item) => {
              const isRestoring = restoringId === item.id;
              const isDraft = item.status === "bozza" || item.doc_number == null;
              const formattedTotal = formatDdtMoney(item.total_document_subunits);

              return (
                <div
                  key={item.id}
                  className="py-2.5 px-3 flex items-center justify-between gap-3 hover:bg-[var(--background)]/40 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold shrink-0 ${
                        isDraft
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      }`}
                    >
                      {isDraft ? "Bozza" : `DDT ${item.doc_number}`}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate max-w-xs">
                          {item.client_name || "Cliente non specificato"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          del {formatDdtViewDate(item.doc_date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                        <span className="font-semibold text-slate-300 font-mono">
                          Totale: {formattedTotal}
                        </span>
                        <span>•</span>
                        <span>{item.items_count} {item.items_count === 1 ? "riga" : "righe"}</span>
                        <span>•</span>
                        <span className="text-[10px] text-slate-500">
                          Eliminato: {formatDeletedAt(item.deleted_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleRestore(item, "original")}
                    disabled={isRestoring}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 hover:border-emerald-500 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                    title="Ripristina DDT"
                  >
                    {isRestoring ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>Ripristina</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Modale */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)] bg-slate-900/60 text-xs">
          <div>
            {trashItems.length > 0 && (
              <button
                type="button"
                onClick={handleEmptyTrash}
                disabled={loading}
                className="text-[11px] text-rose-400 hover:text-rose-300 hover:underline cursor-pointer transition-colors"
              >
                Svuota Cestino definitivamente
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};

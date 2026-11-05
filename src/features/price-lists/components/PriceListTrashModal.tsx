import React, { useEffect, useState } from "react";
import { Trash2, RotateCcw, X, Loader2, AlertCircle, Check } from "lucide-react";
import { TrashListinoRow, ListinoGeneraleRow } from "../models/priceList";
import { priceListRepository } from "../services/priceListRepository";

interface PriceListTrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemRestored: (restoredItem: ListinoGeneraleRow) => void;
}

export const PriceListTrashModal: React.FC<PriceListTrashModalProps> = ({
  isOpen,
  onClose,
  onItemRestored,
}) => {
  const [trashItems, setTrashItems] = useState<TrashListinoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Caricamento elementi cestino
  const loadTrash = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await priceListRepository.getTrashItems();
      setTrashItems(rows);
    } catch (err: any) {
      console.error("Errore caricamento cestino:", err);
      setError("Impossibile caricare gli elementi del cestino.");
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

  // Chiusura con Esc
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

  const handleRestore = async (row: TrashListinoRow) => {
    setRestoringId(row.id);
    setError(null);
    try {
      const restored = await priceListRepository.restoreFromTrash(row.id);
      if (restored) {
        setTrashItems((prev) => prev.filter((item) => item.id !== row.id));
        setFeedback(`"${row.descrizione || row.codice_articolo || 'Articolo'}" ripristinato con successo nel listino!`);
        onItemRestored(restored);
        setTimeout(() => setFeedback(null), 4000);
      }
    } catch (err: any) {
      console.error("Errore ripristino articolo:", err);
      setError("Errore durante il ripristino dell'articolo.");
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
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  };

  const formatEuro = (val: number | null | undefined) => {
    if (val == null || isNaN(val)) return "—";
    return `€ ${val.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })}`;
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-[94vw] max-w-6xl max-h-[88vh] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100">
        
        {/* Header Modale */}
        <div className="p-3.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-sm text-[var(--foreground)]">
                  Cestino Articoli Eliminati
                </h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  {trashItems.length} / 30 elementi
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Conservazione temporanea a rotazione automatica (FIFO). Puoi ripristinare qualsiasi elemento nel listino generale attivo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            title="Chiudi (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback / Avvisi */}
        {feedback && (
          <div className="px-4 py-2 bg-emerald-500/15 border-b border-emerald-500/30 flex items-center space-x-2 text-xs text-emerald-400">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{feedback}</span>
          </div>
        )}
        {error && (
          <div className="px-4 py-2 bg-rose-500/15 border-b border-rose-500/30 flex items-center space-x-2 text-xs text-rose-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Corpo Tabella */}
        <div className="flex-1 overflow-auto p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-[var(--muted-foreground)] space-y-2">
              <Loader2 className="w-7 h-7 animate-spin text-[var(--primary)]" />
              <span className="text-xs">Caricamento cestino...</span>
            </div>
          ) : trashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-[var(--muted-foreground)] space-y-2">
              <Trash2 className="w-10 h-10 stroke-[1.2] opacity-40 text-muted-foreground" />
              <span className="text-sm font-medium">Il cestino è vuoto</span>
              <p className="text-xs text-[var(--muted-foreground)] max-w-sm">
                Nessun articolo eliminato di recente. Quando elimini una voce dal listino, verrà conservata qui per consentirne il recupero.
              </p>
            </div>
          ) : (
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-[var(--background)] border-b border-[var(--border)] text-[var(--muted-foreground)] font-mono text-[11px] sticky top-0 z-10 select-none shadow-sm">
                <tr>
                  <th className="px-3 py-2 text-left w-36">Eliminato Il</th>
                  <th className="px-3 py-2 text-left w-28">Operatore</th>
                  <th className="px-3 py-2 text-left w-24">Fornitore</th>
                  <th className="px-3 py-2 text-left w-28">Codice Art.</th>
                  <th className="px-3 py-2 text-left">Descrizione</th>
                  <th className="px-2 py-2 text-center w-12">U.M.</th>
                  <th className="px-3 py-2 text-right w-24">Acquisto</th>
                  <th className="px-3 py-2 text-right w-24">Fattura</th>
                  <th className="px-3 py-2 text-right w-24">Pubblico</th>
                  <th className="px-3 py-2 text-center w-28">Azione</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
                {trashItems.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-[var(--accent)]/30 transition-colors group"
                  >
                    <td className="px-3 py-2 text-[var(--muted-foreground)] whitespace-nowrap text-[11px]">
                      {formatDateTime(row.deleted_at)}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)] font-sans text-xs truncate max-w-[110px]" title={row.deleted_by || "Operatore"}>
                      {row.deleted_by || "Operatore"}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)] uppercase truncate max-w-[100px]" title={row.fornitore || ""}>
                      {row.fornitore || "—"}
                    </td>
                    <td className="px-3 py-2 font-bold text-[var(--primary)] whitespace-nowrap">
                      {row.codice_articolo || "—"}
                    </td>
                    <td className="px-3 py-2 font-sans font-medium text-[var(--foreground)] truncate max-w-[280px]" title={row.descrizione}>
                      {row.descrizione || "—"}
                    </td>
                    <td className="px-2 py-2 text-center text-[var(--muted-foreground)]">
                      {row.um || "NR."}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--muted-foreground)]">
                      {formatEuro(row.prezzo_acquisto)}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-500/90 font-semibold">
                      {formatEuro(row.prezzo_fattura)}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--foreground)] font-semibold">
                      {formatEuro(row.prezzo_pubblico)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRestore(row)}
                        disabled={restoringId === row.id}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-sans text-xs font-semibold shadow-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 cursor-pointer"
                        title="Ripristina questo articolo nel Listino Generale attivo"
                      >
                        {restoringId === row.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3 h-3" />
                        )}
                        <span>Ripristina</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span className="font-mono text-[11px]">
            * Le voci vengono rimosse automaticamente a scorrimento solo al superamento della soglia di 30 elementi.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--card)] text-[var(--foreground)] text-xs font-medium transition-colors"
          >
            Chiudi (Esc)
          </button>
        </div>

      </div>
    </div>
  );
};


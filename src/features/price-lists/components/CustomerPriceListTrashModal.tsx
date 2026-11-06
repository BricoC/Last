import React, { useEffect, useState } from "react";
import { Trash2, RotateCcw, X, Loader2, AlertCircle, Check } from "lucide-react";
import { TrashListinoClienteRow, ListinoClienteRow } from "../models/priceList";
import { priceListRepository } from "../services/priceListRepository";
import { priceListSyncService } from "../services/priceListSyncService";

interface CustomerPriceListTrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemRestored: (restoredItem: ListinoClienteRow) => void;
}

export const CustomerPriceListTrashModal: React.FC<CustomerPriceListTrashModalProps> = ({
  isOpen,
  onClose,
  onItemRestored,
}) => {
  const [trashItems, setTrashItems] = useState<TrashListinoClienteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadTrash = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await priceListRepository.getClientTrashItems();
      setTrashItems(rows);
    } catch (err: any) {
      console.error("Errore caricamento cestino clienti:", err);
      setError("Impossibile caricare gli elementi del cestino clienti.");
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

  const handleRestore = async (row: TrashListinoClienteRow) => {
    setRestoringId(row.id);
    setError(null);
    try {
      const restored = await priceListRepository.restoreFromClientTrash(row.id);
      if (restored) {
        setTrashItems((prev) => prev.filter((item) => item.id !== row.id));
        setFeedback(`"${row.descrizione || row.codice_articolo || 'Articolo'}" (${row.cliente}) ripristinato con successo!`);
        onItemRestored(restored);
        void priceListSyncService.deleteClientTrashFromSupabase(row.id);
        setTimeout(() => setFeedback(null), 4000);
      }
    } catch (err: any) {
      console.error("Errore ripristino articolo cliente:", err);
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
      <div className="w-[95vw] max-w-6xl max-h-[88vh] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100">
        {/* Header Modale */}
        <div className="p-3.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-sm text-[var(--foreground)]">
                  Cestino Listini Clienti
                </h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  {trashItems.length} / 50 elementi
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Conservazione temporanea a rotazione automatica (FIFO max 50). Puoi ripristinare qualsiasi elemento nel listino del rispettivo cliente.
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
              <span className="text-xs">Caricamento cestino clienti...</span>
            </div>
          ) : trashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-[var(--muted-foreground)] space-y-2">
              <Trash2 className="w-10 h-10 stroke-[1.2] opacity-40 text-muted-foreground" />
              <span className="text-sm font-medium">Il cestino clienti è vuoto</span>
              <p className="text-xs text-[var(--muted-foreground)] max-w-sm">
                Nessun articolo cliente eliminato di recente. Quando elimini una voce, viene conservata qui per consentirne il ripristino.
              </p>
            </div>
          ) : (
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-[var(--background)] border-b border-[var(--border)] text-[var(--muted-foreground)] font-mono text-[11px] sticky top-0 z-10 select-none shadow-sm">
                <tr>
                  <th className="px-3 py-2 text-left w-36">Eliminato Il</th>
                  <th className="px-3 py-2 text-left w-24">Operatore</th>
                  <th className="px-3 py-2 text-left w-36">Cliente</th>
                  <th className="px-3 py-2 text-left w-28">Codice Art.</th>
                  <th className="px-3 py-2 text-left">Descrizione</th>
                  <th className="px-3 py-2 text-right w-24">Vendita (€)</th>
                  <th className="px-3 py-2 text-right w-24">Acquisto (€)</th>
                  <th className="px-3 py-2 text-right w-20">% Acq.</th>
                  <th className="px-3 py-2 text-center w-24">Data Acq.</th>
                  <th className="px-3 py-2 text-left w-32">Acquisto OLD</th>
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
                    <td className="px-3 py-2 font-bold text-amber-400 truncate max-w-[140px]" title={row.cliente}>
                      {row.cliente.replace(/^LIST_/, "")}
                    </td>
                    <td className="px-3 py-2 font-bold text-[var(--primary)] whitespace-nowrap">
                      {row.codice_articolo || "—"}
                    </td>
                    <td className="px-3 py-2 font-sans font-medium text-[var(--foreground)] truncate max-w-[240px]" title={row.descrizione}>
                      {row.descrizione || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-400">
                      {formatEuro(row.prezzo_fattura)}
                    </td>
                    <td className="px-3 py-2 text-right text-blue-400">
                      {formatEuro(row.acquisto_eur)}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--muted-foreground)]">
                      {row.perc_acquisto != null ? `${row.perc_acquisto}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-center text-[var(--muted-foreground)] whitespace-nowrap">
                      {row.data_acquisto || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--muted-foreground)] truncate max-w-[130px]" title={row.acquisto_old || ""}>
                      {row.acquisto_old || "—"}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleRestore(row)}
                        disabled={restoringId === row.id}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-[11px] font-sans font-semibold transition-all disabled:opacity-50"
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
          <span>Capienza massima: 50 voci (le più datate vengono scartate automaticamente).</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--accent)] text-[var(--foreground)] font-medium text-xs transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};

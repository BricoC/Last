import React, { useEffect, useState } from "react";
import { X, History, ArrowRight, LoaderCircle } from "lucide-react";
import { ListinoGeneraleRow, PriceListLogEntry } from "../models/priceList";
import { priceListRepository } from "../services/priceListRepository";

interface ItemPriceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ListinoGeneraleRow | null;
}

export const ItemPriceHistoryModal: React.FC<ItemPriceHistoryModalProps> = ({
  isOpen,
  onClose,
  item,
}) => {
  const [logs, setLogs] = useState<PriceListLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !item || !item.codice_articolo) {
      setLogs([]);
      return;
    }

    let isMounted = true;
    setLoading(true);

    void (async () => {
      try {
        const history = await priceListRepository.getItemPriceHistory(item.codice_articolo!);
        if (isMounted) setLogs(history);
      } catch (e) {
        console.error("Errore lettura storico variazioni articolo:", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, item]);

  // Gestione tasto ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const formatDate = (isoString: string) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString("it-IT")} ${d.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100">
        {/* Header Modale */}
        <div className="p-3.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
              <History className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-[var(--foreground)]">
                  Storico Modifiche Articolo
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--primary)]/20 text-[var(--primary)]">
                  {item.codice_articolo || "SENZA CODICE"}
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] truncate max-w-xl">
                {item.descrizione}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabella Storico */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="p-12 text-center text-xs text-[var(--muted-foreground)] flex items-center justify-center space-x-2">
              <LoaderCircle className="w-4 h-4 animate-spin text-[var(--primary)]" />
              <span>Caricamento storico modifiche...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-xs text-[var(--muted-foreground)] space-y-1">
              <History className="w-8 h-8 mx-auto text-[var(--muted-foreground)]/40 mb-2" />
              <p className="font-medium text-[var(--foreground)]">Nessuna modifica registrata</p>
              <p>Non ci sono ancora variazioni di prezzo o dati archiviate per questo articolo.</p>
              {item.updated_at && (
                <p className="text-[11px] text-[var(--muted-foreground)] mt-2">
                  Ultimo aggiornamento registrato: {formatDate(item.updated_at)}
                </p>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="bg-[var(--background)] sticky top-0 text-[10.5px] uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-3 py-2 text-left">Data e Ora</th>
                  <th className="px-3 py-2 text-left">Campo Modificato</th>
                  <th className="px-3 py-2 text-right">Vecchio</th>
                  <th className="px-2 py-2 text-center"></th>
                  <th className="px-3 py-2 text-left">Nuovo</th>
                  <th className="px-3 py-2 text-right">Variazione %</th>
                  <th className="px-3 py-2 text-left">Operatore</th>
                  <th className="px-3 py-2 text-left">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
                {logs.map((log) => {
                  const isPositive = (log.variazione_pct ?? 0) > 0;
                  const isNegative = (log.variazione_pct ?? 0) < 0;

                  return (
                    <tr key={log.id} className="hover:bg-[var(--background)] transition-colors">
                      <td className="px-3 py-2 text-[var(--muted-foreground)]">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-3 py-2 font-bold text-[var(--primary)] font-sans">
                        {log.campo_modificato}
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--muted-foreground)]">
                        {log.vecchio_valore ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-center text-[var(--muted-foreground)]">
                        <ArrowRight className="w-3 h-3 inline text-[var(--muted-foreground)]" />
                      </td>
                      <td className="px-3 py-2 text-left font-bold text-[var(--foreground)]">
                        {log.nuovo_valore ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {log.variazione_pct != null ? (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold ${
                              isPositive
                                ? "bg-emerald-500/15 text-emerald-400"
                                : isNegative
                                ? "bg-red-500/15 text-red-400"
                                : "text-[var(--muted-foreground)]"
                            }`}
                          >
                            {isPositive ? `+${log.variazione_pct}%` : `${log.variazione_pct}%`}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-[var(--muted-foreground)] font-sans text-xs">
                        {log.operatore || "Banco"}
                      </td>
                      <td className="px-3 py-2 text-[var(--muted-foreground)] font-sans text-xs truncate max-w-[140px]" title={log.motivo || ""}>
                        {log.motivo || "Modifica diretta"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>Massimo 15 modifiche storiche per riga</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-md bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background)] font-medium"
          >
            Chiudi (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};

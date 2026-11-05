import React, { useEffect, useState } from "react";
import { X, History, ArrowRight, LoaderCircle } from "lucide-react";
import { ListinoGeneraleRow, PriceListLogEntry } from "../models/priceList";
import { priceListRepository } from "../services/priceListRepository";

interface ItemPriceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ListinoGeneraleRow | null;
  originalItem?: ListinoGeneraleRow;
  pendingItem?: ListinoGeneraleRow;
}

function round5(num: number): number {
  return Math.round((num + Number.EPSILON) * 100000) / 100000;
}

export const ItemPriceHistoryModal: React.FC<ItemPriceHistoryModalProps> = ({
  isOpen,
  onClose,
  item,
  originalItem,
  pendingItem,
}) => {
  const [logs, setLogs] = useState<PriceListLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !item) {
      setLogs([]);
      return;
    }

    let isMounted = true;
    setLoading(true);

    void (async () => {
      try {
        const history = await priceListRepository.getItemPriceHistory(
          item.codice_articolo,
          item.id,
          item.descrizione
        );
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

  // Rileva modifiche non ancora salvate nella sessione attiva
  const pendingDifferences = React.useMemo(() => {
    if (!item || !originalItem) return [];
    const sourceItem = pendingItem || item;

    const diffs: PriceListLogEntry[] = [];
    const numFields: { key: keyof ListinoGeneraleRow; label: string }[] = [
      { key: "prezzo_acquisto", label: "Prezzo Acquisto" },
      { key: "prezzo_fattura", label: "Prezzo Fattura" },
      { key: "prezzo_pubblico", label: "Prezzo Pubblico" },
      { key: "prezzo_profess", label: "Prezzo Profess" },
      { key: "perc_pub", label: "% Pubblico" },
      { key: "perc_prof", label: "% Profess" },
      { key: "perc_fatt", label: "% Fattura" },
      { key: "aumento", label: "Aumento %" },
      { key: "maga", label: "Magazzino %" },
      { key: "perc_iva", label: "IVA" },
    ];

    for (const f of numFields) {
      const oldV = (originalItem[f.key] as number | null) ?? null;
      const newV = (sourceItem[f.key] as number | null) ?? null;
      if (oldV !== newV) {
        const oldNum = oldV ?? 0;
        const newNum = newV ?? 0;
        const pct = oldNum > 0 ? ((newNum - oldNum) / oldNum) * 100 : 0;
        diffs.push({
          id: -Math.floor(Math.random() * 10000) - 1,
          created_at: new Date().toISOString(),
          tipo_listino: "generale",
          cliente: "",
          codice_articolo: item.codice_articolo || item.id,
          descrizione: item.descrizione,
          campo_modificato: f.label,
          vecchio_valore: oldV,
          nuovo_valore: newV,
          variazione_pct: round5(pct),
          operatore: "Sessione (Non salvato)",
          motivo: "Modifica in corso non ancora salvata",
        });
      }
    }

    const textFields: { key: keyof ListinoGeneraleRow; label: string }[] = [
      { key: "descrizione", label: "Descrizione" },
      { key: "codice_articolo", label: "Codice Articolo" },
      { key: "fornitore", label: "Fornitore" },
      { key: "cat", label: "Categoria" },
      { key: "um", label: "U.M." },
    ];

    for (const f of textFields) {
      const oldT = (originalItem[f.key] as string | null) ?? "";
      const newT = (sourceItem[f.key] as string | null) ?? "";
      if (oldT !== newT) {
        diffs.push({
          id: -Math.floor(Math.random() * 10000) - 1,
          created_at: new Date().toISOString(),
          tipo_listino: "generale",
          cliente: "",
          codice_articolo: item.codice_articolo || item.id,
          descrizione: item.descrizione,
          campo_modificato: f.label,
          vecchio_valore: null,
          nuovo_valore: null,
          variazione_pct: null,
          operatore: "Sessione (Non salvato)",
          motivo: `Modifica da "${oldT || '—'}" a "${newT || '—'}"`,
        });
      }
    }

    return diffs;
  }, [item, originalItem, pendingItem]);

  const allLogs = React.useMemo(() => {
    return [...pendingDifferences, ...logs];
  }, [pendingDifferences, logs]);

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

  const formatVal = (val: number | null | undefined, campo: string) => {
    if (val == null) return "—";
    const c = campo.toLowerCase();
    if (c.includes("%") || c.includes("iva") || c.includes("aumento") || c.includes("magazzino")) {
      const pct = val > 2 ? val : val * 100;
      return `${round5(pct)}%`;
    }
    if (c.includes("prezzo") || c.includes("costo") || c.includes("acquisto") || c.includes("fattura") || c.includes("pubblico") || c.includes("profess")) {
      return `€ ${round5(val).toLocaleString("it-IT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 5,
      })}`;
    }
    return String(round5(val));
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
          ) : allLogs.length === 0 ? (
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
                {allLogs.map((log) => {
                  const isPositive = (log.variazione_pct ?? 0) > 0;
                  const isNegative = (log.variazione_pct ?? 0) < 0;
                  const isPending = (log.id ?? 0) < 0;

                  return (
                    <tr
                      key={log.id}
                      className={`transition-colors ${
                        isPending
                          ? "bg-amber-500/15 hover:bg-amber-500/20 text-amber-200"
                          : "hover:bg-[var(--background)]"
                      }`}
                    >
                      <td className="px-3 py-2 text-[var(--muted-foreground)]">
                        {isPending ? (
                          <span className="font-bold text-amber-400">ADESSO (In corso)</span>
                        ) : (
                          formatDate(log.created_at)
                        )}
                      </td>
                      <td className="px-3 py-2 font-bold text-[var(--primary)] font-sans">
                        {log.campo_modificato}
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--muted-foreground)]">
                        {formatVal(log.vecchio_valore, log.campo_modificato)}
                      </td>
                      <td className="px-2 py-2 text-center text-[var(--muted-foreground)]">
                        <ArrowRight className="w-3 h-3 inline text-[var(--muted-foreground)]" />
                      </td>
                      <td className="px-3 py-2 text-left font-bold text-[var(--foreground)]">
                        {formatVal(log.nuovo_valore, log.campo_modificato)}
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

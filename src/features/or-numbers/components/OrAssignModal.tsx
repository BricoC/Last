import React, { useState, useEffect } from "react";
import { X, Hash, Percent, Check, Loader2, FileText } from "lucide-react";
import { OrRow } from "../types/orNumbers";
import { OrNumbersRepository } from "../services/orNumbersRepository";

interface OrAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  row: OrRow | null;
  availableRows?: OrRow[];
}

export const OrAssignModal: React.FC<OrAssignModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  row,
  availableRows = [],
}) => {
  const [selectedId, setSelectedId] = useState<string>("");
  const [orderRef, setOrderRef] = useState<string>("");
  const [discount, setDiscount] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      setError("");
      setSaving(false);
      if (row) {
        setSelectedId(row.id);
        setOrderRef(row.orderReference || "");
        setDiscount(row.discountPercent !== undefined ? String(row.discountPercent) : "");
      } else if (availableRows.length > 0) {
        // Seleziona il primo senza ordine
        const firstWithoutOr = availableRows.find((r) => !r.orderReference) || availableRows[0];
        setSelectedId(firstWithoutOr.id);
        setOrderRef(firstWithoutOr.orderReference || "");
        setDiscount("");
      }
    }
  }, [isOpen, row, availableRows]);

  if (!isOpen) return null;

  const activeRow = row || availableRows.find((r) => r.id === selectedId) || null;

  const handleSave = async () => {
    if (!selectedId) {
      setError("Seleziona prima un documento DDT.");
      return;
    }
    if (!orderRef.trim()) {
      setError("Inserisci il numero d'ordine (es. 4500123456 del 14.10.2026).");
      return;
    }

    let parsedDiscount: number | undefined = undefined;
    if (discount.trim()) {
      const cleanDisc = discount.replace("%", "").replace(",", ".").trim();
      const num = parseFloat(cleanDisc);
      if (!isNaN(num)) {
        parsedDiscount = num;
      }
    }

    setSaving(true);
    setError("");

    try {
      await OrNumbersRepository.assignOrderReference(selectedId, orderRef.trim(), parsedDiscount);
      onSaved();
      onClose();
    } catch (e: any) {
      console.error("Errore salvataggio OR:", e);
      setError(e?.message || "Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="bg-[#0f172a] border border-[#1e3a5f] rounded-2xl shadow-2xl p-6 max-w-md w-full text-white relative flex flex-col gap-5 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.stopPropagation();
            void handleSave();
          }
        }}
      >
        {/* Header Modale */}
        <div className="flex items-center justify-between border-b border-[#1e3a5f] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold text-sm">
              <Hash className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Assegna Numero Ordine & Sconto
              </h3>
              <p className="text-[11px] text-slate-400">
                Aggiorna il DDT locale e sincronizza con il database aziendale
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Chiudi (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info Documento / Selezione DDT */}
        {!row && availableRows.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Seleziona DDT da assegnare
            </label>
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                const found = availableRows.find((r) => r.id === e.target.value);
                if (found) {
                  setOrderRef(found.orderReference || "");
                }
              }}
              className="w-full bg-[#1e293b] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              {availableRows.map((r) => (
                <option key={r.id} value={r.id}>
                  DDT {r.docNumber ?? "Bozza"} del {r.date} — {r.client} ({r.destination})
                  {r.orderReference ? ` [OR: ${r.orderReference}]` : " [🔴 Da Assegnare]"}
                </option>
              ))}
            </select>
          </div>
        ) : activeRow ? (
          <div className="bg-[#1e293b]/80 border border-slate-700/80 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <span className="font-bold text-white">
                  DDT {activeRow.docNumber ?? "Bozza"}
                </span>{" "}
                <span className="text-slate-400">del {activeRow.date}</span>
                <div className="text-[11px] text-slate-300 font-medium">
                  {activeRow.client} &bull; {activeRow.destination}
                </div>
              </div>
            </div>
            {activeRow.orderReference && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                OR Assegnato
              </span>
            )}
          </div>
        ) : null}

        {/* Campi di Input */}
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <span>Numero ordine e data</span>
              <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                autoFocus
                placeholder="Es. 4500123456 del 14.10.2026"
                value={orderRef}
                onChange={(e) => setOrderRef(e.target.value)}
                className="w-full bg-[#1e293b] border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 font-medium outline-none transition-all"
              />
            </div>
            <span className="text-[10px] text-slate-400">
              Verrà salvato nel DDT e mostrato in verde nella colonna Ordine
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-slate-400" />
              <span>Sconto % aggiuntivo sulle righe (opzionale)</span>
            </label>
            <input
              type="text"
              placeholder="Es. 10% oppure 5"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="w-full bg-[#1e293b] border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 font-medium outline-none transition-all"
            />
            <span className="text-[10px] text-slate-400">
              Se specificato, aggiorna la percentuale sconto su tutte le righe del DDT
            </span>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Footer Azioni */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1e3a5f]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 transition-all cursor-pointer"
          >
            Annulla (Esc)
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Salvataggio...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Salva Assegnazione</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

import React from "react";
import { AlertTriangle, ArrowRight, Check, FileText, X } from "lucide-react";
import { formatDdtMoney, formatDdtViewDate } from "../services/ddtViewFormatting";

export interface DdtConflictDetail {
  year: number;
  docNumber: number;
  localDoc: {
    id: string;
    client_name: string;
    doc_date: string;
    total_document_subunits: number;
    items_count?: number;
    status: string;
  };
  incomingDoc: {
    id: string;
    client_name: string;
    doc_date: string;
    total_document_subunits: number;
    items_count?: number;
    source?: string;
    rawHeader: any;
    rawLines: any[];
  };
}

interface DdtConflictModalProps {
  isOpen: boolean;
  conflict: DdtConflictDetail | null;
  currentIndex?: number;
  totalConflicts?: number;
  onResolve: (action: "replace" | "draft" | "new_number" | "ignore") => void;
  onClose: () => void;
}

export const DdtConflictModal: React.FC<DdtConflictModalProps> = ({
  isOpen,
  conflict,
  currentIndex = 1,
  totalConflicts = 1,
  onResolve,
  onClose,
}) => {
  if (!isOpen || !conflict) return null;

  const localTotal = formatDdtMoney(conflict.localDoc.total_document_subunits);
  const incomingTotal = formatDdtMoney(conflict.incomingDoc.total_document_subunits);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] animate-in zoom-in-95 duration-150 text-[var(--foreground)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Risoluzione Conflitto DDT"
      >
        {/* Header Modale */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-amber-950/40">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                Conflitto Numerazione DDT: {conflict.docNumber}/{conflict.year}
                {totalConflicts > 1 && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-amber-500/30">
                    {currentIndex} di {totalConflicts}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-amber-200/80">
                Il DDT numero {conflict.docNumber} esiste già su questa postazione. Scegli come procedere:
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

        {/* Confronto Affiancato delle due versioni */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 bg-[var(--background)]/50">
          {/* Card DDT Locale Attuale */}
          <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-950/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-400">
                1. Versione Attuale (Locale)
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono">
                {conflict.localDoc.status === "bozza" ? "Bozza" : "Attivo in Last"}
              </span>
            </div>
            <div className="text-sm font-bold text-white truncate">
              {conflict.localDoc.client_name || "Cliente non indicato"}
            </div>
            <div className="space-y-1 text-xs text-slate-300 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Data:</span>
                <span>{formatDdtViewDate(conflict.localDoc.doc_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Totale:</span>
                <span className="font-bold text-white">{localTotal}</span>
              </div>
              {conflict.localDoc.items_count !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Righe:</span>
                  <span>{conflict.localDoc.items_count}</span>
                </div>
              )}
            </div>
          </div>

          {/* Card DDT in Arrivo (Importata) */}
          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                2. In Arrivo (Importata / Cloud)
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                {conflict.incomingDoc.source || "Gestionale / File"}
              </span>
            </div>
            <div className="text-sm font-bold text-white truncate">
              {conflict.incomingDoc.client_name || "Cliente non indicato"}
            </div>
            <div className="space-y-1 text-xs text-slate-300 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Data:</span>
                <span>{formatDdtViewDate(conflict.incomingDoc.doc_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Totale:</span>
                <span className="font-bold text-white">{incomingTotal}</span>
              </div>
              {conflict.incomingDoc.items_count !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Righe:</span>
                  <span>{conflict.incomingDoc.items_count}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Opzioni di Risoluzione */}
        <div className="p-4 space-y-2.5">
          <p className="text-xs font-semibold text-slate-300">
            Seleziona l'azione da intraprendere:
          </p>

          <button
            type="button"
            onClick={() => onResolve("replace")}
            className="w-full p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/40 text-left transition-colors flex items-start gap-3 cursor-pointer group"
          >
            <div className="p-1 rounded bg-emerald-500/20 text-emerald-400 mt-0.5 group-hover:scale-110 transition-transform">
              <Check className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold text-emerald-300">
                Sostituisci con quella importata (Consigliato per fase transitoria)
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                La DDT importata diventa la n. {conflict.docNumber}. La versione locale corrente viene spostata al sicuro nel <strong>Cestino</strong>.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onResolve("draft")}
            className="w-full p-3 rounded-lg border border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/40 text-left transition-colors flex items-start gap-3 cursor-pointer group"
          >
            <div className="p-1 rounded bg-amber-500/20 text-amber-400 mt-0.5 group-hover:scale-110 transition-transform">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold text-amber-300">
                Mantieni locale e importa la nuova come Bozza
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                La tua DDT locale mantiene il numero {conflict.docNumber}. Quella in arrivo viene salvata tra le Bozze per controllo manuale.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onResolve("new_number")}
            className="w-full p-3 rounded-lg border border-blue-500/40 bg-blue-950/30 hover:bg-blue-900/40 text-left transition-colors flex items-start gap-3 cursor-pointer group"
          >
            <div className="p-1 rounded bg-blue-500/20 text-blue-400 mt-0.5 group-hover:scale-110 transition-transform">
              <ArrowRight className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold text-blue-300">
                Mantieni locale e assegna un nuovo numero progressivo all'importata
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                La tua DDT locale resta intatta, mentre la DDT in arrivo riceverà il prossimo numero libero disponibile.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onResolve("ignore")}
            className="w-full p-2.5 rounded-lg border border-slate-700 bg-slate-900/40 hover:bg-slate-800 text-left transition-colors flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <span>Ignora e scarta la DDT in arrivo (mantieni solo la locale)</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

import React from "react";
import { DdtFieldConflict } from "../services/ddtMergeUtils";

export interface DdtMergeConflictState {
  docId: string;
  year: number;
  docNumber: number | null;
  conflicts: DdtFieldConflict[];
}

export interface DdtMergeConflictModalProps {
  mergeConflict: DdtMergeConflictState | null;
  resolvingMerge: boolean;
  onUseRemote: () => void;
  onKeepLocal: () => void;
}

export const DdtMergeConflictModal: React.FC<DdtMergeConflictModalProps> = ({
  mergeConflict,
  resolvingMerge,
  onUseRemote,
  onKeepLocal,
}) => {
  if (!mergeConflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-lg border border-amber-500/40 bg-[#1e2129] p-5 shadow-2xl space-y-4 text-xs text-slate-200">
        <h3 className="text-sm font-bold text-amber-400">
          Conflitto di modifica sul DDT #{mergeConflict.docNumber}/{mergeConflict.year}
        </h3>
        <p className="text-slate-300">
          {mergeConflict.conflicts.length > 0
            ? "Due postazioni hanno modificato contemporaneamente lo stesso campo. Scegli quale versione mantenere:"
            : "Versione di base del DDT assente su questa postazione: non è possibile unire automaticamente i singoli campi. Scegli quale versione mantenere:"}
        </p>
        {mergeConflict.conflicts.length > 0 && (
          <div className="max-h-52 overflow-y-auto space-y-2 rounded border border-slate-700 bg-[#14161c] p-2.5">
            {mergeConflict.conflicts.map((c, idx) => (
              <div
                key={`${c.scope}-${c.field}-${idx}`}
                className="border-b border-slate-800 pb-1.5 last:border-b-0 last:pb-0"
              >
                <div className="font-semibold text-white">{c.label}</div>
                <div className="text-sky-300">Questo PC: {c.localValue}</div>
                <div className="text-emerald-300">Altra postazione (Cloud): {c.remoteValue}</div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={resolvingMerge}
            onClick={onUseRemote}
            className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50"
          >
            Usa versione del Cloud
          </button>
          <button
            type="button"
            disabled={resolvingMerge}
            onClick={onKeepLocal}
            className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold disabled:opacity-50"
          >
            Mantieni modifiche di questo PC
          </button>
        </div>
      </div>
    </div>
  );
};

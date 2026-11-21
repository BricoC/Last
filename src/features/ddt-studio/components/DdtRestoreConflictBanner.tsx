import { AlertTriangle } from "lucide-react";

export interface DdtRestoreConflict {
  id: string;
  docNumber: number;
  year: number;
}

interface DdtRestoreConflictBannerProps {
  conflict: DdtRestoreConflict | null;
  onRestoreAsDraft: () => void;
  onAssignNewNumber: () => void;
  onCancel: () => void;
}

export function DdtRestoreConflictBanner({ conflict, onRestoreAsDraft, onAssignNewNumber, onCancel }: DdtRestoreConflictBannerProps) {
  if (!conflict) return null;
  return (
    <div className="p-4 bg-amber-950/40 border-b border-amber-500/40 text-amber-200 text-xs space-y-3 animate-in slide-in-from-top-2 duration-150">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-amber-300 text-sm">Numero DDT già occupato!</p>
          <p className="mt-1 text-slate-300">
            Il DDT n. <span className="font-mono font-bold text-white">{conflict.docNumber}/{conflict.year}</span> risulta attualmente già assegnato a un altro documento attivo.
          </p>
          <p className="mt-1 text-[11px] text-amber-300/80">Come desideri ripristinare questo documento?</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-7">
        <button type="button" onClick={onRestoreAsDraft} className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-colors cursor-pointer">Ripristina come Bozza</button>
        <button type="button" onClick={onAssignNewNumber} className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors cursor-pointer">Assegna Nuovo Numero Libero</button>
        <button type="button" onClick={onCancel} className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer">Annulla</button>
      </div>
    </div>
  );
}

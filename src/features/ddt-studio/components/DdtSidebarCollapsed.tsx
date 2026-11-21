import { ChevronRight, LoaderCircle, Plus } from "lucide-react";
import type { DdtArchiveEntry } from "../models/ddt";
import { cn } from "@/shared/utils/cn";
import { isReturnDdt } from "../utils/ddtArchiveFilters";

export const SIDEBAR_BATCH_SIZE = 150;

interface DdtSidebarCollapsedProps {
  documents: DdtArchiveEntry[];
  currentDdtId?: string;
  loadingDdtId?: string | null;
  onSelectDdt: (id: string) => void;
  onNewDdt: () => void;
  onExpand: () => void;
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
}

export function DdtSidebarCollapsed({
  documents,
  currentDdtId,
  loadingDdtId,
  onSelectDdt,
  onNewDdt,
  onExpand,
  onScroll,
}: DdtSidebarCollapsedProps) {
  return (
    <aside className="w-12 shrink-0 border-r border-[#2d3139] bg-[#16181d] flex flex-col items-center select-none transition-all duration-200 z-10">
      <div className="h-10 border-b border-[#2d3139] w-full flex items-center justify-center">
        <button type="button" onClick={onExpand} title="Espandi Archivio DDT" className="p-1.5 hover:bg-[#272a33] rounded text-blue-400 hover:text-white transition-colors cursor-pointer">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div onScroll={onScroll} className="flex-1 overflow-y-auto no-scrollbar py-1.5 space-y-1 w-full px-1 flex flex-col items-center">
        {documents.map((doc) => {
          const isSelected = currentDdtId === doc.id || loadingDdtId === doc.id;
          const isReturn = isReturnDdt(doc.transport_reason);
          const isConfirmed = !isReturn && doc.has_complete_margins;
          const numberLabel = doc.doc_number === null ? "Bozza" : `${doc.series ? `${doc.series}/` : ""}${doc.doc_number}`;
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => onSelectDdt(doc.id)}
              title={`DDT ${numberLabel} - ${doc.client_name}${isReturn ? " (Reso)" : ""}`}
              className={cn(
                "w-10 h-6 rounded flex items-center justify-center text-[10.5px] font-mono font-bold transition-all cursor-pointer active:scale-95",
                isReturn
                  ? isSelected ? "bg-purple-300 text-slate-950 shadow-md ring-2 ring-purple-300" : "bg-purple-500/20 border border-purple-400/60 text-purple-200 hover:bg-purple-500/35 hover:text-white"
                  : isConfirmed
                    ? isSelected ? "bg-[var(--archive-margin-text)] text-slate-950 shadow-md ring-2 ring-[var(--archive-margin-border)]" : "bg-[var(--archive-margin-background)] border border-[var(--archive-margin-border)] text-[var(--archive-margin-text)] hover:bg-[var(--archive-margin-hover)] hover:text-white"
                    : isSelected ? "bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300" : "bg-amber-950/70 border border-amber-500/50 text-amber-300 hover:bg-amber-600 hover:text-white"
              )}
            >
              {loadingDdtId === doc.id ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : doc.doc_number === null ? "BOZ" : numberLabel}
            </button>
          );
        })}
      </div>
      <div className="p-1 border-t border-[#2d3139] w-full flex justify-center">
        <button type="button" onClick={onNewDdt} title="Nuovo DDT" className="p-1.5 rounded hover:bg-[#272a33] text-zinc-400 hover:text-white transition-colors cursor-pointer active:scale-95">
          <Plus className="w-4 h-4 text-blue-400" />
        </button>
      </div>
    </aside>
  );
}

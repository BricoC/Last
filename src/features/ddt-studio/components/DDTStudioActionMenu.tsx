import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, FileSpreadsheet, Sparkles, Trash2 } from "lucide-react";
import { DDTMonthlyReportModal } from "./DDTMonthlyReportModal";
import { useEasterEggStore } from "@/shared/easter-eggs/useEasterEggStore";

interface DDTStudioActionMenuProps {
  currentYear: number;
  documentId?: string;
  onGenerateTest48?: () => void;
  onDuplicateDdt: () => void;
  onDeleteDdt: () => void;
}

export function DDTStudioActionMenu({ currentYear, documentId, onGenerateTest48, onDuplicateDdt, onDeleteDdt }: DDTStudioActionMenuProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { triggerMetalSlug } = useEasterEggStore();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button type="button" onClick={() => setDropdownOpen((open) => !open)} className="h-7 px-2 rounded text-xs font-semibold bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--card)] text-[var(--foreground)] flex items-center space-x-1 transition-colors cursor-default">
          <span>Altre Azioni</span>
          <ChevronDown className="w-3 h-3 text-[var(--muted-foreground)]" />
        </button>
        {dropdownOpen && (
          <div className="absolute right-0 mt-1 w-52 rounded-md shadow-lg bg-[var(--card)] border border-[var(--border)] py-1 z-50">
            <button type="button" onClick={() => { setDropdownOpen(false); setIsReportModalOpen(true); }} className="w-full text-left px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 flex items-center space-x-2 transition-colors">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Report Excel Mesi ({currentYear})</span>
            </button>
            <div className="my-1 border-t border-[var(--border)]" />
            {onGenerateTest48 && (
              <button type="button" onClick={() => { setDropdownOpen(false); onGenerateTest48(); }} className="w-full text-left px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 flex items-center space-x-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Popola Test 48 Righe</span>
              </button>
            )}
            <button type="button" onClick={(event) => { setDropdownOpen(false); if (event.shiftKey || event.altKey) triggerMetalSlug(); else onDuplicateDdt(); }} className="w-full text-left px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--background)] flex items-center space-x-2" title="Shift+Click per Easter Egg Metal Slug">
              <Copy className="w-3.5 h-3.5 text-blue-400" />
              <span>Duplica DDT</span>
            </button>
            {documentId && (
              <button type="button" onClick={() => { setDropdownOpen(false); onDeleteDdt(); }} className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 flex items-center space-x-2">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Elimina DDT</span>
              </button>
            )}
          </div>
        )}
      </div>
      <DDTMonthlyReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} year={currentYear} />
    </>
  );
}

import { Eye, FileSpreadsheet } from "lucide-react";
import { cn } from "@/shared/utils/cn";

interface DdtStudioViewSwitchProps {
  activeView: "editor" | "a4";
  onChange: (view: "editor" | "a4") => void;
}

export function DdtStudioViewSwitch({ activeView, onChange }: DdtStudioViewSwitchProps) {
  return (
    <div className="flex items-center bg-[var(--background)] p-0.5 rounded-lg border border-[var(--border)] shadow-inner shrink-0">
      <button
        type="button"
        onClick={() => onChange("editor")}
        className={cn(
          "h-7 px-3 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-default",
          activeView === "editor"
            ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm border border-[var(--border)]"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        )}
      >
        <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--primary)]" />
        <span>Editor</span>
      </button>
      <button
        type="button"
        onClick={() => onChange(activeView === "a4" ? "editor" : "a4")}
        className={cn(
          "h-7 px-3 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-default",
          activeView === "a4"
            ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-400"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        )}
      >
        <Eye className="w-3.5 h-3.5" />
        <span>{activeView === "a4" ? "Foglio A4 ESC" : "Foglio A4"}</span>
      </button>
    </div>
  );
}

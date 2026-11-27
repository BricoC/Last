import { cn } from "@/shared/utils/cn";
import type { MarginFilter } from "../utils/ddtArchiveFilters";

interface DdtSidebarFiltersProps {
  marginFilter: MarginFilter;
  archiveTab: "ddt" | "drafts";
  issuedCount: number;
  draftCount: number;
  toPriceCount?: number;
  onMarginFilterChange: (filter: MarginFilter) => void;
  onArchiveTabChange: (tab: "ddt" | "drafts") => void;
}

export function DdtSidebarFilters({
  marginFilter,
  archiveTab,
  issuedCount,
  draftCount,
  toPriceCount,
  onMarginFilterChange,
  onArchiveTabChange,
}: DdtSidebarFiltersProps) {
  const filters: [MarginFilter, string][] = [
    ["all", "Tutti"],
    ["without_margins", "Da prezzare"],
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-0.5 border-b border-[var(--border)] bg-[var(--card)] p-1">
        {filters.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onMarginFilterChange(value)}
            className={cn(
              "rounded py-1 text-[9px] font-bold transition-colors cursor-pointer active:scale-95",
              marginFilter === value && value === "with_margins" ? "bg-[var(--archive-margin-border)] text-white" :
              marginFilter === value && value === "without_margins" ? "bg-amber-600 text-white" :
              marginFilter === value ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--background)]"
            )}
          >{label}{value === "without_margins" && typeof toPriceCount === "number" ? <> <span className="opacity-75">{toPriceCount}</span></> : null}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1 border-b border-[var(--border)] p-1">
        <button
          type="button"
          onClick={() => onArchiveTabChange("ddt")}
          className={cn("rounded px-2 py-1 text-[10px] font-bold cursor-pointer active:scale-95 transition-all", archiveTab === "ddt" ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--background)]")}
        >DDT <span className="opacity-75">{issuedCount}</span></button>
        <button
          type="button"
          onClick={() => onArchiveTabChange("drafts")}
          className={cn("rounded px-2 py-1 text-[10px] font-bold cursor-pointer active:scale-95 transition-all", archiveTab === "drafts" ? "bg-amber-600 text-white" : "text-[var(--muted-foreground)] hover:bg-[var(--background)]")}
        >Bozze <span className="opacity-75">{draftCount}</span></button>
      </div>
    </>
  );
}

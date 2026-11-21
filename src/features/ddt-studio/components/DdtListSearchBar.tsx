import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Search, X } from "lucide-react";

type Props = { search: string; setSearch: Dispatch<SetStateAction<string>>; searchInputRef: MutableRefObject<HTMLInputElement | null> };

export function DdtListSearchBar({ search, setSearch, searchInputRef }: Props) {
 return (
  <>
      {/* Search Input Bar */}
      <label className="flex h-9 w-full shrink-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-xs">
        <Search className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
        <input
          ref={searchInputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cerca numero DDT, data, mese (es. Settembre), cliente, destinazione o ordine… (F4 per cercare)"
          className="w-full bg-transparent outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); searchInputRef.current?.focus(); }}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-0.5 rounded cursor-pointer"
            title="Cancella ricerca"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>
  </>
 );
}

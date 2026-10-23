import { useEffect, useRef } from "react";
import { Copy, Folder, Search, Trash2, X } from "lucide-react";
import type { Quote } from "../models/quote";

export function QuoteArchiveSidebar({ quotes, search, onSearch, onClose, onOpen, onCopy, onDelete }: {
  quotes: Quote[]; search: string; onSearch: (value: string) => void; onClose: () => void;
  onOpen: (id: string) => void; onCopy: (id: string) => void; onDelete: (id: string) => void;
}) {
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !sidebarRef.current?.contains(event.target)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return <aside ref={sidebarRef} className="absolute inset-y-0 right-0 z-40 flex w-[min(380px,94%)] flex-col border-l border-[var(--border)] bg-[var(--card)] shadow-[var(--document-shadow)]">
    <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-3">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase"><Folder className="h-4 w-4 text-[var(--primary)]" />Archivio Preventivi <span className="text-[var(--muted-foreground)]">({quotes.length})</span></h2>
      <button type="button" aria-label="Chiudi archivio" onClick={onClose} className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"><X className="h-4 w-4" /></button>
    </header>
    <div className="border-b border-[var(--border)] p-2.5">
      <div className="relative"><Search className="absolute left-2 top-2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        <input type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Cerca per cliente, oggetto, data..."
          className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] py-1.5 pl-7 pr-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]" />
      </div>
    </div>
    <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
      {quotes.length === 0 ? <p className="p-4 text-center text-xs text-[var(--muted-foreground)]">Nessun preventivo trovato.</p> : quotes.map((quote) =>
        <article key={quote.id} className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 hover:border-[var(--primary)]/50">
          <button type="button" onClick={() => onOpen(quote.id)} className="w-full text-left">
            <div className="flex items-start justify-between gap-2">
              <span className="truncate text-xs font-bold uppercase text-[var(--foreground)]">{quote.client_name || "Senza cliente"}</span>
              <span className="shrink-0 text-[10px] font-semibold text-[var(--muted-foreground)]">{quote.totals.total.formatIT2()}</span>
            </div>
            <span className="mt-1 block truncate text-[11px] text-[var(--muted-foreground)]">{quote.subject}</span>
          </button>
          <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-1.5">
            <span className="text-[10px] text-[var(--muted-foreground)]">Preventivo {formatDate(quote.quote_date)}</span>
            <span className="flex gap-1">
              <button type="button" title="Copia preventivo" aria-label={`Copia preventivo di ${quote.client_name || "cliente"}`} onClick={() => onCopy(quote.id)} className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--primary)]"><Copy className="h-3.5 w-3.5" /></button>
              <button type="button" title="Cancella preventivo" aria-label={`Cancella preventivo di ${quote.client_name || "cliente"}`} onClick={() => onDelete(quote.id)} className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--destructive)]"><Trash2 className="h-3.5 w-3.5" /></button>
            </span>
          </div>
        </article>
      )}
    </div>
  </aside>;
}

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("it-IT");
}

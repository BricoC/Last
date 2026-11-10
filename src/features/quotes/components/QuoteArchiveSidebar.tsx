import { useEffect, useRef } from "react";
import { Copy, Folder, Search, Trash2, X } from "lucide-react";
import type { Quote } from "../models/quote";
import { formatQuoteCode } from "../models/quoteDraft";
import { cn } from "@/shared/utils/cn";

export function QuoteArchiveSidebar({
  quotes,
  activeQuoteId,
  search,
  trashCount = 0,
  onSearch,
  onClose,
  onOpen,
  onCopy,
  onDelete,
  onOpenTrash,
}: {
  quotes: Quote[];
  activeQuoteId?: string | null;
  search: string;
  trashCount?: number;
  onSearch: (value: string) => void;
  onClose: () => void;
  onOpen: (id: string) => void;
  onCopy: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenTrash?: () => void;
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
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <aside
      ref={sidebarRef}
      className="absolute inset-y-0 right-0 z-40 flex w-[min(380px,94%)] flex-col border-l border-[var(--border)] bg-[var(--card)] shadow-[var(--document-shadow)]"
    >
      <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase">
          <Folder className="h-4 w-4 text-[var(--primary)]" />
          Archivio Preventivi <span className="text-[var(--muted-foreground)]">({quotes.length})</span>
        </h2>
        <button
          type="button"
          aria-label="Chiudi archivio"
          onClick={onClose}
          className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="border-b border-[var(--border)] p-2.5">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Cerca per cliente, oggetto, data..."
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] py-1.5 pl-7 pr-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          />
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
        {quotes.length === 0 ? (
          <p className="p-4 text-center text-xs text-[var(--muted-foreground)]">Nessun preventivo trovato.</p>
        ) : (
          quotes.map((quote) => {
            const isActive = quote.id === activeQuoteId;
            const code = formatQuoteCode(quote.year, quote.quote_number);
            const netPrice = quote.totals?.taxable ?? quote.totals?.total;
            const markupPct = quote.totals?.markup_pct;

            return (
              <article
                key={quote.id}
                className={cn(
                  "rounded-lg border px-2.5 py-2 transition-all",
                  isActive
                    ? "border-sky-500 bg-sky-950/30 ring-1 ring-sky-500/50"
                    : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)]/50"
                )}
              >
                <button
                  type="button"
                  onClick={() => onOpen(quote.id)}
                  className="w-full text-left cursor-pointer"
                >
                  {/* 1. Cliente e oggetto/titolo sulla stessa riga in alto */}
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="truncate text-xs font-bold uppercase text-[var(--foreground)]"
                      title={quote.client_name || "Senza cliente"}
                    >
                      {quote.client_name || "Senza cliente"}
                    </span>
                    {quote.subject && (
                      <span
                        className="shrink-0 max-w-[50%] truncate text-[11px] text-[var(--muted-foreground)] font-normal text-right"
                        title={quote.subject}
                      >
                        {quote.subject}
                      </span>
                    )}
                  </div>

                  {/* 2. Prezzo netto e % ricarico globale (dove prima era l'oggetto) */}
                  <div className="mt-1.5 flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-emerald-400">
                      Netto: {netPrice ? netPrice.formatIT(true, 4, 4) : "0,0000 €"}
                    </span>
                    <span className="text-[11px] font-semibold text-sky-300">
                      Ric: {markupPct != null ? `${markupPct.toFixed(2)}%` : "0.00%"}
                    </span>
                  </div>
                </button>

                {/* 3. Sotto la linea: rif. preventivo e data creazione */}
                <div className="mt-2 flex items-center justify-between border-t border-[var(--border)]/70 pt-1.5 text-[10px] text-[var(--muted-foreground)]">
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="font-bold text-sky-400">
                      {code ? `#${code}` : "Bozza"}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-300 font-medium">{formatDate(quote.quote_date)}</span>
                  </div>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      title="Copia preventivo"
                      aria-label={`Copia preventivo di ${quote.client_name || "cliente"}`}
                      onClick={() => onCopy(quote.id)}
                      className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--primary)] cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Cancella preventivo"
                      aria-label={`Cancella preventivo di ${quote.client_name || "cliente"}`}
                      onClick={() => onDelete(quote.id)}
                      className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--destructive)] cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              </article>
            );
          })
        )}
      </div>
      {onOpenTrash && (
        <footer className="border-t border-[var(--border)] p-2.5 bg-[var(--card)]">
          <button
            type="button"
            onClick={onOpenTrash}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Apri Cestino Preventivi ({trashCount})</span>
          </button>
        </footer>
      )}
    </aside>
  );
}

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("it-IT");
}

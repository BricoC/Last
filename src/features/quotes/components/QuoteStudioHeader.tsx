import { useEffect, useRef, useState } from "react";
import { Archive, Check, ChevronDown, Copy, Eye, FileText, Plus, Save, Search, Sparkles, Trash2, Truck } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/cn";
import type { QuoteStatus } from "../models/quote";

export function QuoteStudioHeader(props: {
  status: QuoteStatus;
  viewMode: "calculation" | "customer";
  alexMode: boolean;
  saving: boolean;
  isDirty?: boolean;
  archiveCount: number;
  trashCount?: number;
  quoteDate: string;
  quoteCode?: string | null;
  copyingPdf?: boolean;
  copySuccess?: boolean;
  onStatusChange: (status: QuoteStatus) => void;
  onViewChange: (mode: "calculation" | "customer") => void;
  onAlexToggle: () => void;
  onArchive: () => void;
  onOpenLibrary?: () => void;
  onOpenTrash?: () => void;
  onSave: () => void;
  onNew: () => void;
  onPdf: () => void;
  onCopyPdf?: () => void;
  onConvert: () => void;
  onFillRandomRows: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[var(--border)] pb-2.5">
      {/* Sinistra: Solo Icona, Stato, Nuovo, Salva (verde se dirty), Finestrella Preventivo */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--primary)] shrink-0 shadow-xs"
          title="Studio Preventivi"
        >
          <FileText className="h-4 w-4" />
        </div>

        <select
          aria-label="Stato preventivo"
          value={props.status}
          onChange={(event) => props.onStatusChange(event.target.value as QuoteStatus)}
          className="h-8 rounded-md border border-[var(--primary)] bg-[var(--card)] px-2.5 text-xs font-bold uppercase text-[var(--primary)] outline-none cursor-pointer"
        >
          <option value="bozza">Bozza</option>
          <option value="inviato">Inviato</option>
          <option value="confermato">Confermato</option>
          <option value="rifiutato">Rifiutato</option>
        </select>

        <Button size="sm" variant="outline" onClick={props.onNew} title="Nuovo preventivo" className="h-8">
          <Plus className="mr-1 h-3.5 w-3.5" />
          Nuovo
        </Button>

        {/* Tasto Salva: accanto a Nuovo, verde acceso se ci sono modifiche da salvare */}
        <button
          type="button"
          disabled={props.saving}
          onClick={props.onSave}
          title={props.isDirty ? "Modifiche non salvate presenti: clicca per salvare" : "Salva preventivo"}
          className={cn(
            "h-8 px-3 rounded-md flex items-center justify-center text-xs font-semibold transition-all cursor-pointer border shadow-xs select-none",
            props.isDirty
              ? "border-emerald-500 bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-[0_0_12px_rgba(16,185,129,0.4)] active:scale-95"
              : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--background)] text-[var(--foreground)]"
          )}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          <span>{props.saving ? "Salva…" : "Salva"}</span>
        </button>

        {/* Finestrella a parte del Preventivo Attivo */}
        <div className="flex h-8 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-xs shadow-xs font-mono select-none">
          <span className="text-[10px] uppercase font-bold text-[var(--muted-foreground)] font-sans">Preventivo</span>
          <span className="font-bold text-sky-400">
            {props.quoteCode ? `#${props.quoteCode}` : "Bozza"}
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-300 font-medium">{formatDate(props.quoteDate)}</span>
        </div>
      </div>

      {/* Destra: Switch Vista, Alex, Archivio, Cerca Articoli (F4), Cestino, PDF, Copia PDF, Trasforma in DDT */}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <div className="flex h-8 items-center rounded-lg border border-[var(--border)] p-0.5 bg-[var(--background)]">
          <button
            type="button"
            onClick={() => props.onViewChange("calculation")}
            className={cn(
              "h-full px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
              props.viewMode === "calculation"
                ? "bg-[var(--primary)] text-white shadow-xs"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
          >
            Vista Calcolo
          </button>
          <button
            type="button"
            onClick={() => props.onViewChange("customer")}
            className={cn(
              "h-full px-2.5 rounded-md text-xs font-medium flex items-center transition-colors cursor-pointer",
              props.viewMode === "customer"
                ? "bg-[var(--primary)] text-white shadow-xs"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
          >
            <Eye className="mr-1 h-3.5 w-3.5" />
            Anteprima Cliente
          </button>
        </div>

        <Button size="sm" variant={props.alexMode ? "secondary" : "outline"} onClick={props.onAlexToggle} className="h-8">
          ✦ Alex
        </Button>

        <Button size="sm" variant="outline" onClick={props.onArchive} className="h-8">
          <Archive className="mr-1 h-3.5 w-3.5" />
          Archivio <span className="ml-1 rounded-full bg-[var(--background)] px-1.5 text-[10px]">{props.archiveCount}</span>
        </Button>

        {props.onOpenLibrary && (
          <Button size="sm" variant="outline" onClick={props.onOpenLibrary} title="Ricerca articoli e storico preventivi (F4)" className="h-8">
            <Search className="mr-1 h-3.5 w-3.5 text-sky-400" />
            Cerca Articoli (F4)
          </Button>
        )}

        {props.onOpenTrash && (
          <Button size="sm" variant="outline" onClick={props.onOpenTrash} title="Cestino preventivi eliminati (max 5)" className="h-8">
            <Trash2 className="mr-1 h-3.5 w-3.5 text-red-400" />
            Cestino <span className="ml-1 rounded-full bg-[var(--background)] px-1.5 text-[10px]">{props.trashCount ?? 0}</span>
          </Button>
        )}

        <Button size="sm" variant="danger" onClick={props.onPdf} className="h-8">
          PDF
        </Button>

        {props.onCopyPdf && (
          <button
            type="button"
            onClick={props.onCopyPdf}
            disabled={props.copyingPdf}
            className={cn(
              "h-8 flex items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-all cursor-pointer",
              props.copySuccess
                ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-xs"
                : "border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 hover:text-white"
            )}
            title="Genera e copia il PDF del preventivo negli appunti di Windows per incollarlo in un'email o cartella"
          >
            {props.copyingPdf ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                <span>Copia PDF…</span>
              </>
            ) : props.copySuccess ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>PDF Copiato! (Ctrl+V)</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copia PDF</span>
              </>
            )}
          </button>
        )}

        <div className="relative flex h-8" ref={menuRef}>
          <Button size="sm" variant="secondary" disabled={props.saving} title="Crea una bozza DDT dal preventivo" onClick={props.onConvert} className="h-8 rounded-r-none">
            <Truck className="mr-1 h-3.5 w-3.5" />
            Trasforma in DDT
          </Button>
          <Button
            size="sm"
            variant="secondary"
            aria-label="Altre azioni preventivo"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="h-8 rounded-l-none border-l border-[var(--border)] px-2"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  props.onFillRandomRows();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--foreground)] hover:bg-[var(--background)]"
              >
                <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
                <span>Popola 15–60 righe test</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

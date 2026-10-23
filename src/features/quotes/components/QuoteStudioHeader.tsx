import { useEffect, useRef, useState } from "react";
import { Archive, ChevronDown, Eye, FileText, Plus, Save, Sparkles, Truck } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import type { QuoteStatus } from "../models/quote";

export function QuoteStudioHeader(props: {
  status: QuoteStatus; viewMode: "calculation" | "customer"; alexMode: boolean;
  saving: boolean; archiveCount: number; quoteDate: string;
  onStatusChange: (status: Exclude<QuoteStatus, "confermato">) => void;
  onViewChange: (mode: "calculation" | "customer") => void;
  onAlexToggle: () => void; onArchive: () => void; onSave: () => void;
  onNew: () => void; onPdf: () => void; onConvert: () => void; onFillRandomRows: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", closeMenu);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
    <div className="flex min-w-[260px] items-start gap-3">
      <span className="mt-1 rounded-lg bg-[var(--card)] p-2 text-[var(--primary)]"><FileText className="h-5 w-5" /></span>
      <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-base font-bold tracking-wide">STUDIO PREVENTIVI</h1>
        {props.status === "confermato" ? <span className="rounded-full border border-[var(--primary)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--primary)]">Confermato</span> : <select aria-label="Stato preventivo" value={props.status}
          onChange={(event) => props.onStatusChange(event.target.value as Exclude<QuoteStatus, "confermato">)}
          className="rounded-full border border-[var(--primary)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--primary)]">
          <option value="bozza">Bozza</option><option value="inviato">Inviato</option><option value="rifiutato">Rifiutato</option>
        </select>}</div>
        <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">Preventivo {formatDate(props.quoteDate)}</p>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <div className="flex rounded-lg border border-[var(--border)] p-0.5">
        <Button size="sm" variant={props.viewMode === "calculation" ? "primary" : "ghost"} onClick={() => props.onViewChange("calculation")}>Vista Calcolo</Button>
        <Button size="sm" variant={props.viewMode === "customer" ? "primary" : "ghost"} onClick={() => props.onViewChange("customer")}><Eye className="mr-1 h-3.5 w-3.5" />Anteprima Cliente</Button>
      </div>
      <Button size="sm" variant={props.alexMode ? "secondary" : "outline"} onClick={props.onAlexToggle}>✦ Alex</Button>
      <Button size="sm" variant="outline" onClick={props.onArchive}><Archive className="mr-1 h-3.5 w-3.5" />Archivio <span className="ml-1 rounded-full bg-[var(--background)] px-1.5">{props.archiveCount}</span></Button>
      <Button size="sm" variant="outline" onClick={props.onNew}><Plus className="mr-1 h-3.5 w-3.5" />Nuovo</Button>
      <Button size="sm" variant="outline" disabled={props.saving} onClick={props.onSave}><Save className="mr-1 h-3.5 w-3.5" />{props.saving ? "Salva…" : "Salva"}</Button>
      <Button size="sm" variant="danger" onClick={props.onPdf}>PDF</Button>
      <div className="relative flex" ref={menuRef}>
        <Button size="sm" variant="secondary" disabled={props.saving || props.status === "confermato"} title={props.status === "confermato" ? "Preventivo già convertito" : "Crea una bozza DDT dal preventivo"} onClick={props.onConvert} className="rounded-r-none"><Truck className="mr-1 h-3.5 w-3.5" />Trasforma in DDT</Button>
        <Button size="sm" variant="secondary" aria-label="Altre azioni preventivo" aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)} className="rounded-l-none border-l border-[var(--border)] px-2">
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        {menuOpen && <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
          <button type="button" onClick={() => { setMenuOpen(false); props.onFillRandomRows(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--foreground)] hover:bg-[var(--background)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span>Popola 15–60 righe test</span>
          </button>
        </div>}
      </div>
    </div>
  </header>;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

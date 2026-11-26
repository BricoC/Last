import React, { useRef, useEffect } from "react";
import { Plus, Save, Printer, FileText, PanelLeftClose, PanelLeft, CheckCircle2, AlertTriangle, Trash2, Sparkles } from "lucide-react";
import { DdtDocument } from "../models/ddt";
import { cn } from "@/shared/utils/cn";
import { useEasterEggStore } from "@/shared/easter-eggs/useEasterEggStore";
import { DDTStudioActionMenu } from "./DDTStudioActionMenu";
import { DdtStudioViewSwitch } from "./DdtStudioViewSwitch";

export interface DDTStudioHeaderProps {
  ddt: Partial<DdtDocument>;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  activeView: "editor" | "a4";
  setActiveView: (view: "editor" | "a4") => void;
  selectedYear?: number | null;
  trashCount?: number;
  onOpenTrash?: () => void;
  onNewDdt: () => void;
  onSaveDraft: () => void;
  onEmitDdt: () => void;
  onTheOne: () => void;
  onOpenPrintModal: () => void;
  onExportPdf: () => void;
  onGenerateTest48?: () => void;
  onDuplicateDdt: () => void;
  onDeleteDdt: () => void;
  isSaving?: boolean;
  isExportingPdf?: boolean;
  isPrinting?: boolean;
  isDirty?: boolean;
  hasContent?: boolean;
  toastMessage?: string | null;
  numberingStatus?: {
    missing: number[];
    maxNumber: number;
    totalCount: number;
    year: number;
  } | null;
  onOpenGapModal?: () => void;
}

export const DDTStudioHeader: React.FC<DDTStudioHeaderProps> = ({
  ddt,
  sidebarOpen,
  setSidebarOpen,
  activeView,
  setActiveView,
  selectedYear,
  trashCount = 0,
  onOpenTrash,
  onNewDdt,
  onSaveDraft,
  onEmitDdt,
  onTheOne,
  onOpenPrintModal,
  onExportPdf,
  onGenerateTest48,
  onDuplicateDdt,
  onDeleteDdt,
  isSaving = false,
  isExportingPdf = false,
  isPrinting = false,
  isDirty = true,
  hasContent = true,
  toastMessage = null,
  numberingStatus = null,
  onOpenGapModal,
}) => {
  const { triggerFf9Moguo } = useEasterEggStore();
  const theOneClicksRef = useRef(0);
  const theOneClickResetTimer = useRef<NodeJS.Timeout | null>(null);

  const currentYear = selectedYear || ddt.year || new Date().getFullYear();

  // Premendo ESC ritorna sempre alla vista Editor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeView === "a4") {
        setActiveView("editor");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeView, setActiveView]);

  const isConfirmed = ddt.status === "confermato" && ddt.doc_number !== null;
  const isTheOneDisabled = Boolean(isConfirmed || isSaving || isPrinting || !hasContent);

  const handleTheOneContainerClick = () => {
    if (!isTheOneDisabled) return;

    if (theOneClickResetTimer.current) {
      clearTimeout(theOneClickResetTimer.current);
    }

    theOneClicksRef.current += 1;
    if (theOneClicksRef.current >= 9) {
      theOneClicksRef.current = 0;
      triggerFf9Moguo();
    } else {
      theOneClickResetTimer.current = setTimeout(() => {
        theOneClicksRef.current = 0;
      }, 3000);
    }
  };

  return (
    <div className="h-12 border-b border-[var(--border)] bg-[var(--card)] px-3 flex items-center justify-between shrink-0 select-none">
      {/* Sinistra: Sidebar Toggle + Titolo + Nuovo DDT */}
      <div className="flex items-center space-x-2">
        <button
          type="button"
          onClick={() => setSidebarOpen((p) => !p)}
          className="p-1.5 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors cursor-default"
          title={sidebarOpen ? "Riduci archivio DDT a barra compatta" : "Espandi archivio DDT"}
        >
          {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4 text-blue-400" />}
        </button>

        <div className="flex items-center space-x-2 border-r border-[var(--border)] pr-3">
          <span className="font-extrabold text-sm tracking-tight text-[var(--foreground)]">DDT Studio</span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30 font-bold">
            Pro
          </span>
        </div>

        <button
          type="button"
          onClick={onNewDdt}
          className="h-7 px-2.5 rounded text-xs font-semibold bg-[var(--background)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--foreground)] flex items-center space-x-1.5 transition-colors cursor-default"
        >
          <Plus className="w-3.5 h-3.5 text-[var(--primary)]" />
          <span>Nuovo DDT</span>
        </button>

        {onOpenTrash && (
          <button
            type="button"
            onClick={onOpenTrash}
            className="h-7 px-2.5 rounded text-xs font-semibold bg-[var(--background)] border border-[var(--border)] hover:border-rose-500/80 text-[var(--foreground)] flex items-center space-x-1.5 transition-colors cursor-default"
            title="Cestino DDT Studio (ultime 15 voci)"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Cestino</span>
            {trashCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono font-bold">
                {trashCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Infobox Controllo Numerazione DDT (tra Cestino e Editor/Foglio A4) */}
      <div className="flex-1 flex items-center justify-center px-2 min-w-0">
        {numberingStatus && numberingStatus.maxNumber > 0 && (
          numberingStatus.missing.length === 0 ? (
            <div
              className="h-7 px-2.5 rounded-md border border-emerald-500/35 bg-emerald-500/10 text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5 max-w-full"
              title={`Controllo numerazione ${numberingStatus.year}: tutti i ${numberingStatus.totalCount} numeri da 1 a ${numberingStatus.maxNumber} sono presenti senza salti.`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">
                Numero DDT {numberingStatus.year}: OK (1–{numberingStatus.maxNumber})
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenGapModal}
              className="h-7 px-2.5 rounded-md border border-amber-400 bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-[11px] font-bold flex items-center gap-1.5 max-w-full shadow-sm ring-1 ring-amber-400/40 transition-colors"
              title={`Numeri mancanti nel ${numberingStatus.year}: ${numberingStatus.missing.map((n) => `#${n}`).join(", ")}. Clicca per recuperare o gestire.`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0 animate-pulse" />
              <span className="truncate">
                {numberingStatus.missing.length === 1
                  ? `Numero saltato: #${numberingStatus.missing[0]}`
                  : `${numberingStatus.missing.length} numeri saltati (#${numberingStatus.missing[numberingStatus.missing.length - 1]})`}
              </span>
            </button>
          )
        )}
      </div>

      <DdtStudioViewSwitch activeView={activeView} onChange={setActiveView} />
      {/* Spazio tra Editor/Foglio A4 e The One: Toast notifica salvataggio */}
      <div className="flex-1 flex items-center justify-center px-3 min-w-0">
        {toastMessage && (() => {
          const isErrorOrWarning = /^(Errore|Attenzione|Impossibile)/i.test(toastMessage.trim());
          return (
            <div
              role="status"
              title={toastMessage}
              className={cn(
                "h-7 px-3 rounded-md border text-xs font-bold flex items-center gap-1.5 max-w-full shadow-md animate-in fade-in zoom-in-95 duration-150",
                isErrorOrWarning
                  ? "bg-amber-500/20 border-amber-400 text-amber-100 ring-1 ring-amber-400/40"
                  : "bg-emerald-500/25 border-emerald-400 text-emerald-100 ring-1 ring-emerald-400/50"
              )}
            >
              {isErrorOrWarning ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
              )}
              <span className="truncate">{toastMessage}</span>
            </div>
          );
        })()}
      </div>

      {/* Destra: Azioni The One, Salva, Draft, Stampa, Altro */}
      <div className="flex items-center space-x-2">
        {/* The One (Emissione con progressivo + Stampa 3 copie immediata) */}
        <div
          onClick={handleTheOneContainerClick}
          className="relative inline-flex items-center"
        >
          <button
            type="button"
            disabled={isTheOneDisabled}
            onClick={onTheOne}
            style={isTheOneDisabled ? { pointerEvents: "none" } : undefined}
            className={cn(
              "h-7 px-2.5 rounded text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm select-none",
              isTheOneDisabled
                ? "bg-purple-950/20 text-purple-400/30 border border-purple-900/20 opacity-40 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-500 text-white border border-purple-400/50 shadow-purple-900/20 cursor-default active:scale-95"
            )}
            title={
              isConfirmed
                ? "The One è disabilitato perché questo DDT è già stato salvato con numero definitivo"
                : !hasContent
                ? "The One è disabilitato perché il DDT è vuoto (inserisci cliente o almeno una riga)"
                : "The One (F3): Salva DDT con numero progressivo e stampa immediatamente 3 copie"
            }
          >
            <Sparkles className={cn("w-3.5 h-3.5", !isConfirmed && "text-purple-200 animate-pulse")} />
            <span>The One (F3)</span>
          </button>
        </div>

        {/* Salva / Aggiorna DDT */}
        {(() => {
          const isUpdateDisabled = isConfirmed && !isDirty;
          const isButtonDisabled = isSaving || isUpdateDisabled;
          return (
            <button
              type="button"
              disabled={isButtonDisabled}
              onClick={onEmitDdt}
              title={
                isUpdateDisabled
                  ? "Nessuna modifica da aggiornare"
                  : isConfirmed
                  ? "Aggiorna il DDT con le modifiche correnti (F3)"
                  : "Salva e conferma il DDT con numero progressivo"
              }
              className={cn(
                "h-7 px-3 rounded text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors",
                isUpdateDisabled
                  ? "bg-emerald-950/20 text-emerald-400/35 border border-emerald-900/30 opacity-50 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white cursor-default"
              )}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isConfirmed ? "Aggiorna DDT (F3)" : "Salva DDT"}</span>
            </button>
          );
        })()}

        {/* Salva Draft */}
        <button
          type="button"
          disabled={isSaving}
          onClick={onSaveDraft}
          className="h-7 px-2.5 rounded text-xs font-semibold bg-[var(--background)] hover:bg-[var(--border)] text-[var(--foreground)] border border-[var(--border)] flex items-center space-x-1.5 transition-colors cursor-default"
        >
          <span>Salva Draft</span>
        </button>

        {/* Tasto Stampa Diretto (Popup copie default 1) */}
        <button
          type="button"
          disabled={isPrinting}
          onClick={onOpenPrintModal}
          className="h-7 px-2.5 rounded text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center space-x-1.5 shadow-sm transition-colors cursor-default"
          title="Stampa diretta su un lato solo (richiede numero copie, default 1)"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>{isPrinting ? "Stampa..." : "Stampa"}</span>
        </button>

        {/* Tasto Salva PDF sul Desktop (Multipagina ad alta fedeltà) */}
        <button
          type="button"
          disabled={isExportingPdf}
          onClick={onExportPdf}
          className="h-7 px-2.5 rounded text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white flex items-center space-x-1.5 shadow-sm transition-colors cursor-default"
          title="Salva il PDF multipagina del DDT direttamente sul Desktop"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{isExportingPdf ? "PDF..." : "PDF"}</span>
        </button>

        <DDTStudioActionMenu
          currentYear={currentYear}
          documentId={ddt.id}
          onGenerateTest48={onGenerateTest48}
          onDuplicateDdt={onDuplicateDdt}
          onDeleteDdt={onDeleteDdt}
        />
      </div>
    </div>
  );
};

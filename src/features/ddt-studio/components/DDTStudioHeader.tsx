import React, { useState, useRef, useEffect } from "react";
import {
  FileSpreadsheet,
  Plus,
  Save,
  Printer,
  FileText,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
  Copy,
  Trash2,
  ChevronDown,
  Eye,
} from "lucide-react";
import { DdtDocument } from "../models/ddt";
import { cn } from "@/shared/utils/cn";
import { DDTMonthlyReportModal } from "./DDTMonthlyReportModal";

export interface DDTStudioHeaderProps {
  ddt: Partial<DdtDocument>;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  activeView: "editor" | "a4";
  setActiveView: (view: "editor" | "a4") => void;
  selectedYear?: number;
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
}

export const DDTStudioHeader: React.FC<DDTStudioHeaderProps> = ({
  ddt,
  sidebarOpen,
  setSidebarOpen,
  activeView,
  setActiveView,
  selectedYear,
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
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isConfirmed = ddt.status === "confermato" && ddt.doc_number !== null;

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
      </div>

      {/* Centro: Switcher Vista Editor vs Foglio A4 (con ESC key support!) */}
      <div className="flex items-center bg-[var(--background)] p-0.5 rounded-lg border border-[var(--border)] shadow-inner">
        <button
          type="button"
          onClick={() => setActiveView("editor")}
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
          onClick={() => setActiveView(activeView === "a4" ? "editor" : "a4")}
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

      {/* Destra: Azioni The One, Salva, Draft, Stampa, Altro */}
      <div className="flex items-center space-x-2">
        {/* The One (Emissione con progressivo + Stampa 3 copie immediata) */}
        <button
          type="button"
          disabled={isConfirmed || isSaving || isPrinting}
          onClick={onTheOne}
          className={cn(
            "h-7 px-2.5 rounded text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm select-none",
            isConfirmed || isSaving || isPrinting
              ? "bg-purple-950/20 text-purple-400/30 border border-purple-900/20 opacity-40 cursor-not-allowed"
              : "bg-purple-600 hover:bg-purple-500 text-white border border-purple-400/50 shadow-purple-900/20 cursor-default active:scale-95"
          )}
          title={
            isConfirmed
              ? "The One è disabilitato perché questo DDT è già stato salvato con numero definitivo"
              : "The One: Salva DDT con numero progressivo e stampa immediatamente 3 copie"
          }
        >
          <Sparkles className={cn("w-3.5 h-3.5", !isConfirmed && "text-purple-200 animate-pulse")} />
          <span>The One</span>
        </button>

        {/* Salva DDT (Verde) */}
        <button
          type="button"
          disabled={isSaving}
          onClick={onEmitDdt}
          className="h-7 px-3 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-1.5 shadow-sm transition-colors cursor-default"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isConfirmed ? "Aggiorna DDT" : "Salva DDT"}</span>
        </button>

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

        {/* Altre Azioni */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="h-7 px-2 rounded text-xs font-semibold bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--card)] text-[var(--foreground)] flex items-center space-x-1 transition-colors cursor-default"
          >
            <span>Altre Azioni</span>
            <ChevronDown className="w-3 h-3 text-[var(--muted-foreground)]" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-1 w-52 rounded-md shadow-lg bg-[var(--card)] border border-[var(--border)] py-1 z-50">
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  setIsReportModalOpen(true);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 flex items-center space-x-2 transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Report Excel Mesi ({currentYear})</span>
              </button>

              <div className="my-1 border-t border-[var(--border)]" />

              {onGenerateTest48 && (
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onGenerateTest48();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 flex items-center space-x-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Popola Test 48 Righe</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  onDuplicateDdt();
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--background)] flex items-center space-x-2"
              >
                <Copy className="w-3.5 h-3.5 text-blue-400" />
                <span>Duplica DDT</span>
              </button>
              {ddt.id && (
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onDeleteDdt();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 flex items-center space-x-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Elimina DDT</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modale Report Excel Mesi */}
      <DDTMonthlyReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        year={currentYear}
      />
    </div>
  );
};

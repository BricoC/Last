import React, { useState, useEffect } from "react";
import {
  FileSpreadsheet,
  Download,
  LoaderCircle,
  CheckCircle,
  AlertTriangle,
  X,
  FolderArchive,
  Minimize2,
  Ban,
} from "lucide-react";
import {
  getDdtMonthlyCounts,
  MonthSummaryCount,
} from "../services/ddtReportService";
import { useDdtBatchExportStore } from "../stores/useDdtBatchExportStore";
import { useEasterEggStore } from "@/shared/easter-eggs/useEasterEggStore";
import { cn } from "@/shared/utils/cn";

export interface DDTMonthlyReportModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  year?: number;
}

export const DDTMonthlyReportModal: React.FC<DDTMonthlyReportModalProps> = ({
  isOpen: propIsOpen,
  onClose: propOnClose,
  year: propYear,
}) => {
  const {
    isExporting,
    exportType,
    progress,
    successMsg,
    errorMsg,
    isModalOpen: storeIsOpen,
    modalYear: storeYear,
    closeModal,
    cancelExport,
    startExportOnlyExcel,
    startExportFullPackage,
  } = useDdtBatchExportStore();

  const isVisible = propIsOpen !== undefined ? propIsOpen || storeIsOpen : storeIsOpen;
  const currentYear = propYear ?? storeYear ?? new Date().getFullYear();

  // Easter Egg Final Fantasy VII (Victory Fanfare al completamento del report)
  const { triggerFf7 } = useEasterEggStore();
  useEffect(() => {
    if (successMsg) {
      triggerFf7();
    }
  }, [successMsg, triggerFf7]);

  const handleClose = () => {
    if (propOnClose) propOnClose();
    closeModal();
  };

  const [counts, setCounts] = useState<MonthSummaryCount[]>([]);
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setIsLoadingCounts(true);
      void getDdtMonthlyCounts(currentYear)
        .then((data) => setCounts(data))
        .catch((err) => console.error("Errore caricamento conteggi mensili DDT:", err))
        .finally(() => setIsLoadingCounts(false));
    }
  }, [isVisible, currentYear]);

  if (!isVisible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-100 select-none text-[var(--foreground)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-lg bg-[#0f172a] border border-emerald-500/40 rounded-xl shadow-2xl p-4 flex flex-col space-y-3.5">
        {/* Testata Modale */}
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Report Excel & Archivio PDF Mesi ({currentYear})
              </h3>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            {isExporting && (
              <button
                type="button"
                onClick={handleClose}
                title="Riduci a icona e continua in background"
                className="px-2 py-1 rounded text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-white flex items-center space-x-1 border border-slate-700 transition-colors"
              >
                <Minimize2 className="w-3 h-3" />
                <span>Riduci in background</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Chiudi finestra"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notifica Informativa Background quando attivo */}
        {isExporting && (
          <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-500/40 text-[11px] text-purple-200 flex items-start space-x-2">
            <LoaderCircle className="w-4 h-4 shrink-0 text-purple-400 animate-spin mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="font-semibold text-white block">Elaborazione in background attiva:</span>
              Puoi chiudere questa finestra in qualsiasi momento. L'applicazione non si bloccherà e potrai continuare a lavorare normalmente su qualsiasi schermata.
            </div>
          </div>
        )}

        {/* Feedback Notifica Successo */}
        {successMsg && (
          <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="truncate">{successMsg}</span>
          </div>
        )}

        {/* Feedback Notifica Errore */}
        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span className="truncate">{errorMsg}</span>
          </div>
        )}

        {/* Barra di Progresso Creazione Pacchetto PDF */}
        {progress && (
          <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-500/40 space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-purple-200">
                {exportType === "excel_only"
                  ? `Generazione file Excel ${progress.monthName} ${progress.year}`
                  : `Creazione cartella "${String(progress.month).padStart(2, "0")}. ${progress.monthName} ${progress.year}"`}
              </span>
              <span className="font-mono font-bold text-purple-300">
                {progress.percent}%
              </span>
            </div>

            {/* Progress Track */}
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-emerald-400 h-2.5 transition-all duration-150"
                style={{ width: `${progress.percent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span className="truncate max-w-[280px]">
                {progress.currentDoc}
              </span>
              {progress.total > 0 && (
                <span className="font-mono text-slate-400">
                  {progress.current} / {progress.total} DDT
                </span>
              )}
            </div>

            {/* Pulsante Annulla Operazione */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={cancelExport}
                className="text-[11px] text-red-400 hover:text-red-300 flex items-center space-x-1 px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-colors"
              >
                <Ban className="w-3 h-3" />
                <span>Interrompi esportazione</span>
              </button>
            </div>
          </div>
        )}

        {/* Loading Conteggi Iniziali */}
        {isLoadingCounts ? (
          <div className="py-8 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
            <LoaderCircle className="w-5 h-5 animate-spin text-emerald-400" />
            <span>Lettura archivio DDT in corso...</span>
          </div>
        ) : (
          /* Lista dei 12 Mesi */
          <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
            {counts.map((item) => {
              const hasData = item.count > 0;
              const isWorkingThisMonth = isExporting && progress?.month === item.month;
              const isWorkingThisBatch = isWorkingThisMonth && exportType === "full_package";
              const isWorkingThisExcel = isWorkingThisMonth && exportType === "excel_only";

              return (
                <div
                  key={item.month}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg text-xs transition-colors",
                    hasData
                      ? "bg-[#1e293b]/80 border border-slate-700/50 hover:border-slate-600"
                      : "bg-[#1e293b]/30 border border-transparent text-slate-500 opacity-60"
                  )}
                >
                  <div className="flex items-center space-x-2">
                    <span className={cn("font-bold text-xs", hasData ? "text-white" : "text-slate-500")}>
                      {item.name}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-mono font-bold",
                        hasData
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-slate-800 text-slate-600"
                      )}
                    >
                      {item.count} DDT
                    </span>
                  </div>

                  {hasData ? (
                    <div className="flex items-center space-x-1.5">
                      {/* Opzione 1: Cartella Completa sul Desktop (Cartella Mese con Excel + Sottocartella PDF) */}
                      <button
                        type="button"
                        disabled={isExporting}
                        onClick={() => startExportFullPackage(currentYear, item.month)}
                        className={cn(
                          "px-2.5 py-1 rounded text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm",
                          isWorkingThisBatch
                            ? "bg-purple-600 text-white"
                            : "bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 disabled:opacity-40"
                        )}
                        title={`Crea cartella sul Desktop con Report Excel e tutti i ${item.count} file PDF in background`}
                      >
                        {isWorkingThisBatch ? (
                          <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FolderArchive className="w-3.5 h-3.5 text-purple-300" />
                        )}
                        <span>Cartella (Excel + PDF)</span>
                      </button>

                      {/* Opzione 2: Solo File Excel */}
                      <button
                        type="button"
                        disabled={isExporting}
                        onClick={() => startExportOnlyExcel(currentYear, item.month)}
                        className={cn(
                          "px-2 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition-all",
                          isWorkingThisExcel
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 disabled:opacity-40"
                        )}
                        title={`Scarica solo il file Excel per ${item.name}`}
                      >
                        {isWorkingThisExcel ? (
                          <LoaderCircle className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3 text-emerald-400" />
                        )}
                        <span>Solo Excel</span>
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500 italic pr-2">Nessun DDT</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
          <span className="text-[11px] text-slate-500 italic">
            {isExporting ? "Elaborazione non bloccante attiva" : "Seleziona un mese per esportare"}
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            {isExporting ? "Continua in background" : "Chiudi"}
          </button>
        </div>
      </div>
    </div>
  );
};

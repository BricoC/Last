import React from "react";
import { createPortal } from "react-dom";
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  X,
  ExternalLink,
  Ban,
  FolderArchive,
  FileSpreadsheet,
} from "lucide-react";
import { useDdtBatchExportStore } from "../stores/useDdtBatchExportStore";
import { DDTA4Document } from "../document/DDTA4Document";

export const DdtBatchExportRunner: React.FC = () => {
  const {
    isExporting,
    exportType,
    progress,
    successMsg,
    errorMsg,
    batchRenderDoc,
    isModalOpen,
    openModal,
    dismissToast,
    cancelExport,
  } = useDdtBatchExportStore();

  return (
    <>
      {/* 1. Portale invisibile per il rendering A4 persistente (funziona anche a modale chiusa) */}
      {batchRenderDoc &&
        createPortal(
          <div
            id="ddt-batch-export-portal"
            style={{
              position: "fixed",
              left: "-99999px",
              top: 0,
              width: "210mm",
              opacity: 1,
              pointerEvents: "none",
              zIndex: -99999,
            }}
          >
            <DDTA4Document
              ddt={batchRenderDoc.ddt}
              items={batchRenderDoc.items}
              isPrintOnly={true}
            />
          </div>,
          document.body
        )}

      {/* 2. Floating Widget in basso a destra (visibile a modale chiusa o quando si naviga l'app) */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end space-y-2 pointer-events-none select-none">
        {/* Banner Operazione in Corso (mostrato quando l'utente chiude la modale o sta navigando altrove) */}
        {isExporting && progress && !isModalOpen && (
          <div className="pointer-events-auto bg-[#0f172a]/95 border border-purple-500/60 shadow-2xl backdrop-blur-md rounded-xl p-3.5 w-84 max-w-sm text-slate-100 animate-in slide-in-from-bottom-3 duration-200">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center space-x-2 truncate">
                <div className="p-1 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {exportType === "excel_only" ? (
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  ) : (
                    <FolderArchive className="w-3.5 h-3.5" />
                  )}
                </div>
                <span className="text-xs font-bold text-white truncate">
                  Report {progress.monthName} {progress.year}
                </span>
              </div>
              <div className="flex items-center space-x-1.5 shrink-0">
                <span className="text-xs font-mono font-bold text-purple-300">
                  {progress.percent}%
                </span>
                <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin shrink-0" />
              </div>
            </div>

            {/* Barra di avanzamento */}
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mb-2">
              <div
                className="bg-gradient-to-r from-purple-500 via-indigo-400 to-emerald-400 h-1.5 transition-all duration-150"
                style={{ width: `${progress.percent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2.5">
              <span className="truncate max-w-[190px] text-slate-300 font-medium">
                {progress.currentDoc}
              </span>
              {progress.total > 0 && (
                <span className="font-mono shrink-0 ml-1">
                  {progress.current} / {progress.total}
                </span>
              )}
            </div>

            {/* Bottoni di controllo */}
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => openModal(progress.year)}
                className="text-purple-300 hover:text-white flex items-center space-x-1 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-800"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Apri dettagli</span>
              </button>

              <button
                type="button"
                onClick={cancelExport}
                className="text-red-400 hover:text-red-300 flex items-center space-x-1 transition-colors px-1.5 py-0.5 rounded hover:bg-red-500/10"
              >
                <Ban className="w-3 h-3" />
                <span>Annulla</span>
              </button>
            </div>
          </div>
        )}

        {/* Notifica di Successo */}
        {successMsg && !isModalOpen && (
          <div className="pointer-events-auto bg-[#064e3b]/95 border border-emerald-500/60 shadow-2xl backdrop-blur-md rounded-xl p-3 max-w-md text-emerald-100 flex items-start space-x-2.5 animate-in slide-in-from-bottom-2 duration-150">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs leading-snug">
              <span className="font-bold text-white block mb-0.5">Esportazione completata</span>
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={dismissToast}
              className="text-emerald-300 hover:text-white p-0.5 rounded hover:bg-emerald-800/50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Notifica di Errore */}
        {errorMsg && !isModalOpen && (
          <div className="pointer-events-auto bg-[#450a0a]/95 border border-red-500/60 shadow-2xl backdrop-blur-md rounded-xl p-3 max-w-md text-red-100 flex items-start space-x-2.5 animate-in slide-in-from-bottom-2 duration-150">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs leading-snug">
              <span className="font-bold text-white block mb-0.5">Avviso Esportazione</span>
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={dismissToast}
              className="text-red-300 hover:text-white p-0.5 rounded hover:bg-red-800/50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </>
  );
};


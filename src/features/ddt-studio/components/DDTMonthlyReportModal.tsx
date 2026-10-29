import React, { useState, useEffect } from "react";
import {
  FileSpreadsheet,
  Download,
  LoaderCircle,
  CheckCircle,
  X,
} from "lucide-react";
import {
  getDdtMonthlyCounts,
  generateDdtMonthlyExcelReport,
  saveReportToDesktop,
  MonthSummaryCount,
} from "../services/ddtReportService";
import { cn } from "@/shared/utils/cn";

export interface DDTMonthlyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
}

export const DDTMonthlyReportModal: React.FC<DDTMonthlyReportModalProps> = ({
  isOpen,
  onClose,
  year,
}) => {
  const [counts, setCounts] = useState<MonthSummaryCount[]>([]);
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);
  const [exportingMonth, setExportingMonth] = useState<number | null>(null);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoadingCounts(true);
      setExportSuccessMsg(null);
      void getDdtMonthlyCounts(year)
        .then((data) => setCounts(data))
        .catch((err) => console.error("Errore caricamento conteggi mensili DDT:", err))
        .finally(() => setIsLoadingCounts(false));
    }
  }, [isOpen, year]);

  if (!isOpen) return null;

  const handleExport = async (month: number) => {
    setExportingMonth(month);
    setExportSuccessMsg(null);

    try {
      const result = await generateDdtMonthlyExcelReport(year, month);
      await saveReportToDesktop(result.filename, result.buffer);
      setExportSuccessMsg(`File salvato sul Desktop: ${result.filename}`);
      setTimeout(() => setExportSuccessMsg(null), 6000);
    } catch (err) {
      console.error("Errore esportazione report Excel:", err);
      alert(`Errore esportazione report Excel: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportingMonth(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-100 select-none text-[var(--foreground)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-[#0f172a] border border-emerald-500/40 rounded-xl shadow-2xl p-4 flex flex-col space-y-3">
        {/* Testata Modale */}
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Report Excel Mesi ({year})
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Notifica Successo */}
        {exportSuccessMsg && (
          <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="truncate">{exportSuccessMsg}</span>
          </div>
        )}

        {/* Loading Conteggi */}
        {isLoadingCounts ? (
          <div className="py-8 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
            <LoaderCircle className="w-5 h-5 animate-spin text-emerald-400" />
            <span>Lettura archivio DDT in corso...</span>
          </div>
        ) : (
          /* Lista dei 12 Mesi */
          <div className="max-h-96 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {counts.map((item) => {
              const hasData = item.count > 0;
              const isWorking = exportingMonth === item.month;

              return (
                <div
                  key={item.month}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg text-xs transition-colors",
                    hasData
                      ? "bg-[#1e293b]/80 border border-slate-700/50 hover:border-emerald-500/50"
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
                    <button
                      type="button"
                      disabled={Boolean(exportingMonth)}
                      onClick={() => handleExport(item.month)}
                      className={cn(
                        "px-3 py-1 rounded text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm",
                        isWorking
                          ? "bg-emerald-600 text-white"
                          : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40"
                      )}
                      title={`Scarica file Excel per ${item.name}`}
                    >
                      {isWorking ? (
                        <>
                          <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                          <span>Generazione...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Scarica Excel</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-500 italic pr-2">Nessun DDT</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-2 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};


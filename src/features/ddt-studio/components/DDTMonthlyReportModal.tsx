import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  FileSpreadsheet,
  Download,
  LoaderCircle,
  CheckCircle,
  X,
  FolderArchive,
} from "lucide-react";
import {
  getDdtMonthlyCounts,
  generateDdtMonthlyExcelReport,
  getMonthlyFullDdtDocuments,
  saveReportToDesktop,
  MonthSummaryCount,
  ITALIAN_MONTH_NAMES,
} from "../services/ddtReportService";
import { formatDdtPdfFilename, generatePdfBytesFromElements } from "../utils/ddtExportManager";
import { DDTA4Document } from "../document/DDTA4Document";
import { DdtDocument, DdtItem } from "../models/ddt";
import { cn } from "@/shared/utils/cn";

export interface DDTMonthlyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
}

interface BatchProgress {
  month: number;
  monthName: string;
  current: number;
  total: number;
  percent: number;
  currentDoc: string;
}

export const DDTMonthlyReportModal: React.FC<DDTMonthlyReportModalProps> = ({
  isOpen,
  onClose,
  year,
}) => {
  const [counts, setCounts] = useState<MonthSummaryCount[]>([]);
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);
  const [exportingExcelMonth, setExportingExcelMonth] = useState<number | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // Documento temporaneo montato nel portale invisibile per cattura PDF
  const [batchRenderDoc, setBatchRenderDoc] = useState<{ ddt: DdtDocument; items: DdtItem[] } | null>(null);

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

  // Esportazione solo file Excel
  const handleExportOnlyExcel = async (month: number) => {
    setExportingExcelMonth(month);
    setExportSuccessMsg(null);

    try {
      const result = await generateDdtMonthlyExcelReport(year, month);
      await saveReportToDesktop(result.filename, result.buffer);
      setExportSuccessMsg(`File Excel salvato sul Desktop: ${result.filename}`);
      setTimeout(() => setExportSuccessMsg(null), 6000);
    } catch (err) {
      console.error("Errore esportazione report Excel:", err);
      alert(`Errore esportazione report Excel: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportingExcelMonth(null);
    }
  };

  // Esportazione completa pacchetto: cartella "MM. Mese AAAA" con dentro file Excel e sottocartella "PDF"
  const handleExportFullPackage = async (month: number) => {
    const monthName = ITALIAN_MONTH_NAMES[month - 1] || `Mese ${month}`;
    const monthPadded = String(month).padStart(2, "0");
    const folderName = `${monthPadded}. ${monthName} ${year}`;

    setExportSuccessMsg(null);
    setBatchProgress({
      month,
      monthName,
      current: 0,
      total: 0,
      percent: 0,
      currentDoc: "Generazione file Excel di riepilogo...",
    });

    try {
      // 1. Genera il file Excel e salvalo nella cartella principale sul Desktop
      const excelRes = await generateDdtMonthlyExcelReport(year, month);
      await saveReportToDesktop(`${folderName}/${excelRes.filename}`, excelRes.buffer);

      // 2. Recupera tutti i DDT del mese completi di righe
      const ddtDocs = await getMonthlyFullDdtDocuments(year, month);
      const total = ddtDocs.length;

      setBatchProgress({
        month,
        monthName,
        current: 0,
        total,
        percent: 0,
        currentDoc: `Avvio creazione di ${total} PDF...`,
      });

      // 3. Ciclo di generazione di ciascun PDF nel portale A4 invisibile
      for (let i = 0; i < total; i++) {
        const doc = ddtDocs[i];
        const docLabel = `#${doc.series ? `${doc.series}/` : ""}${doc.doc_number} - ${doc.client_name}`;

        setBatchProgress({
          month,
          monthName,
          current: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100),
          currentDoc: docLabel,
        });

        // Monta nel portale invisibile
        setBatchRenderDoc({ ddt: doc, items: doc.items });

        // Attendi render del layout A4
        await new Promise((r) => setTimeout(r, 60));

        // Rileva le pagine A4 renderizzate
        const portalPages = document.querySelectorAll("#ddt-batch-export-portal .ddt-a4-page");
        const pagesArray = Array.from(portalPages) as HTMLElement[];

        if (pagesArray.length > 0) {
          const pdfBytes = await generatePdfBytesFromElements(pagesArray);
          const pdfFilename = formatDdtPdfFilename(doc);
          await saveReportToDesktop(`${folderName}/PDF/${pdfFilename}`, pdfBytes);
        }
      }

      setBatchRenderDoc(null);
      setBatchProgress(null);
      setExportSuccessMsg(`Cartella creata sul Desktop: "${folderName}" con Report Excel e ${total} file PDF!`);
      setTimeout(() => setExportSuccessMsg(null), 8000);
    } catch (err) {
      console.error("Errore generazione pacchetto mensile:", err);
      alert(`Errore generazione pacchetto: ${err instanceof Error ? err.message : String(err)}`);
      setBatchRenderDoc(null);
      setBatchProgress(null);
    }
  };

  const isWorking = Boolean(batchProgress || exportingExcelMonth);

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-100 select-none text-[var(--foreground)]"
        onClick={(e) => {
          if (!isWorking && e.target === e.currentTarget) onClose();
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
                  Report Excel & Archivio PDF Mesi ({year})
                </h3>
              </div>
            </div>
            {!isWorking && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Feedback Notifica Successo */}
          {exportSuccessMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              <span className="truncate">{exportSuccessMsg}</span>
            </div>
          )}

          {/* Barra di Progresso Creazione Pacchetto PDF */}
          {batchProgress && (
            <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-500/40 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-purple-200">
                  Creazione cartella "{String(batchProgress.month).padStart(2, "0")}. {batchProgress.monthName} {year}"
                </span>
                <span className="font-mono font-bold text-purple-300">
                  {batchProgress.percent}%
                </span>
              </div>

              {/* Progress Track */}
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-emerald-400 h-2.5 transition-all duration-150"
                  style={{ width: `${batchProgress.percent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="truncate max-w-[280px]">
                  {batchProgress.currentDoc}
                </span>
                {batchProgress.total > 0 && (
                  <span className="font-mono text-slate-400">
                    {batchProgress.current} / {batchProgress.total} DDT
                  </span>
                )}
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
                const isWorkingThisExcel = exportingExcelMonth === item.month;
                const isWorkingThisBatch = batchProgress?.month === item.month;

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
                          disabled={isWorking}
                          onClick={() => handleExportFullPackage(item.month)}
                          className={cn(
                            "px-2.5 py-1 rounded text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm",
                            isWorkingThisBatch
                              ? "bg-purple-600 text-white"
                              : "bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40"
                          )}
                          title={`Crea cartella sul Desktop con Report Excel e tutti i ${item.count} file PDF`}
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
                          disabled={isWorking}
                          onClick={() => handleExportOnlyExcel(item.month)}
                          className={cn(
                            "px-2 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition-all",
                            isWorkingThisExcel
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
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

          <div className="pt-2 border-t border-slate-800 flex justify-end">
            <button
              type="button"
              disabled={isWorking}
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-50"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>

      {/* Portale invisibile per il rendering A4 durante l'esportazione batch di tutti i PDF */}
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
    </>
  );
};

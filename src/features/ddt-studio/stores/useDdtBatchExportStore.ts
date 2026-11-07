import { create } from "zustand";
import {
  generateDdtMonthlyExcelReport,
  getMonthlyFullDdtDocuments,
  saveReportToDesktop,
  ITALIAN_MONTH_NAMES,
} from "../services/ddtReportService";
import { formatDdtPdfFilename, generatePdfBase64FromElements } from "../utils/ddtExportManager";
import { DdtDocument, DdtItem } from "../models/ddt";

export interface BatchProgressInfo {
  year: number;
  month: number;
  monthName: string;
  current: number;
  total: number;
  percent: number;
  currentDoc: string;
}

interface DdtBatchExportState {
  isExporting: boolean;
  exportType: "excel_only" | "full_package" | null;
  progress: BatchProgressInfo | null;
  successMsg: string | null;
  errorMsg: string | null;
  isModalOpen: boolean;
  modalYear: number;
  batchRenderDoc: { ddt: DdtDocument; items: DdtItem[] } | null;
  cancelRequested: boolean;

  // Actions
  openModal: (year?: number) => void;
  closeModal: () => void;
  dismissToast: () => void;
  cancelExport: () => void;
  startExportOnlyExcel: (year: number, month: number) => Promise<void>;
  startExportFullPackage: (year: number, month: number) => Promise<void>;
}

export const useDdtBatchExportStore = create<DdtBatchExportState>((set, get) => ({
  isExporting: false,
  exportType: null,
  progress: null,
  successMsg: null,
  errorMsg: null,
  isModalOpen: false,
  modalYear: new Date().getFullYear(),
  batchRenderDoc: null,
  cancelRequested: false,

  openModal: (year?: number) => {
    set({
      isModalOpen: true,
      modalYear: year ?? get().modalYear,
    });
  },

  closeModal: () => {
    set({ isModalOpen: false });
  },

  dismissToast: () => {
    set({ successMsg: null, errorMsg: null });
  },

  cancelExport: () => {
    if (get().isExporting) {
      set({ cancelRequested: true });
    }
  },

  startExportOnlyExcel: async (year: number, month: number) => {
    const monthName = ITALIAN_MONTH_NAMES[month - 1] || `Mese ${month}`;
    set({
      isExporting: true,
      exportType: "excel_only",
      cancelRequested: false,
      errorMsg: null,
      successMsg: null,
      progress: {
        year,
        month,
        monthName,
        current: 1,
        total: 1,
        percent: 50,
        currentDoc: `Generazione report Excel ${monthName} ${year}...`,
      },
    });

    try {
      const result = await generateDdtMonthlyExcelReport(year, month);
      if (get().cancelRequested) {
        set({
          isExporting: false,
          progress: null,
          exportType: null,
          errorMsg: "Generazione Excel annullata.",
        });
        return;
      }

      await saveReportToDesktop(result.filename, result.buffer);

      set({
        isExporting: false,
        exportType: null,
        progress: null,
        successMsg: `File Excel salvato sul Desktop: ${result.filename}`,
      });

      setTimeout(() => {
        if (get().successMsg?.includes(result.filename)) {
          set({ successMsg: null });
        }
      }, 7000);
    } catch (err) {
      console.error("Errore esportazione report Excel:", err);
      set({
        isExporting: false,
        exportType: null,
        progress: null,
        errorMsg: `Errore salvataggio Excel: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  startExportFullPackage: async (year: number, month: number) => {
    const monthName = ITALIAN_MONTH_NAMES[month - 1] || `Mese ${month}`;
    const monthPadded = String(month).padStart(2, "0");
    const folderName = `${monthPadded}. ${monthName} ${year}`;

    set({
      isExporting: true,
      exportType: "full_package",
      cancelRequested: false,
      errorMsg: null,
      successMsg: null,
      progress: {
        year,
        month,
        monthName,
        current: 0,
        total: 0,
        percent: 0,
        currentDoc: "Creazione file Excel riepilogativo...",
      },
    });

    try {
      // 1. Genera file Excel
      const excelRes = await generateDdtMonthlyExcelReport(year, month);
      if (get().cancelRequested) {
        set({
          isExporting: false,
          progress: null,
          exportType: null,
          batchRenderDoc: null,
          errorMsg: "Esportazione annullata dall'utente.",
        });
        return;
      }

      await saveReportToDesktop(`${folderName}/${excelRes.filename}`, excelRes.buffer);

      // 2. Recupera tutti i DDT del mese
      const ddtDocs = await getMonthlyFullDdtDocuments(year, month);
      const total = ddtDocs.length;

      if (total === 0) {
        set({
          isExporting: false,
          progress: null,
          exportType: null,
          batchRenderDoc: null,
          successMsg: `Cartella creata sul Desktop con Report Excel (${monthName} ${year}). Nessun DDT presente.`,
        });
        return;
      }

      set((state) => ({
        progress: state.progress
          ? {
              ...state.progress,
              total,
              percent: 1,
              currentDoc: `Avvio creazione di ${total} PDF...`,
            }
          : null,
      }));

      // 3. Loop asincrono cooperativo: un documento alla volta, cedendo il controllo alla UI
      for (let i = 0; i < total; i++) {
        if (get().cancelRequested) {
          set({
            isExporting: false,
            progress: null,
            exportType: null,
            batchRenderDoc: null,
            errorMsg: `Esportazione interrotta a ${i} di ${total} DDT.`,
          });
          return;
        }

        const doc = ddtDocs[i];
        const docLabel = `#${doc.series ? `${doc.series}/` : ""}${doc.doc_number} - ${doc.client_name}`;
        const currentPercent = Math.round(((i + 1) / total) * 100);

        set({
          progress: {
            year,
            month,
            monthName,
            current: i + 1,
            total,
            percent: currentPercent,
            currentDoc: docLabel,
          },
          batchRenderDoc: { ddt: doc, items: doc.items },
        });

        // Attendi che il DOM renderizzi il documento nel portale invisibile
        await new Promise((r) => setTimeout(r, 45));

        const portalPages = document.querySelectorAll("#ddt-batch-export-portal .ddt-a4-page");
        const pagesArray = Array.from(portalPages) as HTMLElement[];

        if (pagesArray.length > 0) {
          // pixelRatio: 1.6 per altissima nitidezza senza occupare 6M di pixel di canvas
          const pdfBase64 = await generatePdfBase64FromElements(pagesArray, { pixelRatio: 1.6 });
          const pdfFilename = formatDdtPdfFilename(doc);
          await saveReportToDesktop(`${folderName}/PDF/${pdfFilename}`, pdfBase64);
        }

        // Micro-pausa essenziale per liberare il Main Thread JS (garantisce click, scroll e digitazione a 60fps)
        await new Promise((r) => setTimeout(r, 35));
      }

      set({
        batchRenderDoc: null,
        isExporting: false,
        exportType: null,
        progress: null,
        successMsg: `Cartella creata sul Desktop: "${folderName}" con Report Excel e ${total} file PDF!`,
      });

      setTimeout(() => {
        if (get().successMsg?.includes(folderName)) {
          set({ successMsg: null });
        }
      }, 9000);
    } catch (err) {
      console.error("Errore generazione pacchetto mensile:", err);
      set({
        batchRenderDoc: null,
        isExporting: false,
        exportType: null,
        progress: null,
        errorMsg: `Errore generazione pacchetto: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },
}));


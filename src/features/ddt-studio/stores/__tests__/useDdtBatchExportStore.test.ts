import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDdtBatchExportStore } from "../useDdtBatchExportStore";

const mocks = vi.hoisted(() => ({
  generateDdtMonthlyExcelReport: vi.fn(),
  getMonthlyFullDdtDocuments: vi.fn(),
  saveReportToDesktop: vi.fn(),
  getCompanySettings: vi.fn(),
  formatDdtPdfFilename: vi.fn(),
  generatePdfBase64FromElements: vi.fn(),
  waitForDomPaint: vi.fn(),
}));

vi.mock("../../services/ddtMonthlyExcelReportService", () => ({
  generateDdtMonthlyExcelReport: mocks.generateDdtMonthlyExcelReport,
}));

vi.mock("../../services/ddtMonthlyDocumentsService", () => ({
  getMonthlyFullDdtDocuments: mocks.getMonthlyFullDdtDocuments,
}));

vi.mock("../../services/ddtReportDesktopService", () => ({
  saveReportToDesktop: mocks.saveReportToDesktop,
}));

vi.mock("@/features/settings/companySettingsRepository", () => ({
  getCompanySettings: mocks.getCompanySettings,
}));

vi.mock("../../utils/ddtExportManager", () => ({
  formatDdtPdfFilename: mocks.formatDdtPdfFilename,
  generatePdfBase64FromElements: mocks.generatePdfBase64FromElements,
}));

vi.mock("@/shared/utils/a4PdfCapture", () => ({
  waitForDomPaint: mocks.waitForDomPaint,
}));

describe("useDdtBatchExportStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateDdtMonthlyExcelReport.mockResolvedValue({
      filename: "Report Marzo 2026.xlsx",
      buffer: new ArrayBuffer(8),
    });
    mocks.getMonthlyFullDdtDocuments.mockResolvedValue([]);
    mocks.saveReportToDesktop.mockResolvedValue(undefined);
    mocks.getCompanySettings.mockResolvedValue({});
    mocks.formatDdtPdfFilename.mockReturnValue("ddt-1.pdf");
    mocks.generatePdfBase64FromElements.mockResolvedValue("pdf-base64");
    mocks.waitForDomPaint.mockResolvedValue(undefined);
    useDdtBatchExportStore.setState({
      isExporting: false,
      exportType: null,
      progress: null,
      successMsg: null,
      errorMsg: null,
      isModalOpen: false,
      modalYear: 2026,
      batchRenderDoc: null,
      cancelRequested: false,
    });
  });

  it("genera e salva l'Excel del mese, poi segnala il successo", async () => {
    await useDdtBatchExportStore.getState().startExportOnlyExcel(2026, 3);

    expect(mocks.generateDdtMonthlyExcelReport).toHaveBeenCalledWith(2026, 3);
    expect(mocks.saveReportToDesktop).toHaveBeenCalledWith(
      "Report Marzo 2026.xlsx",
      expect.any(ArrayBuffer)
    );
    expect(useDdtBatchExportStore.getState()).toMatchObject({
      isExporting: false,
      exportType: null,
      successMsg: expect.stringContaining("Report Marzo 2026.xlsx"),
      errorMsg: null,
    });
  });

  it("crea il pacchetto mensile e gestisce il caso senza DDT", async () => {
    await useDdtBatchExportStore.getState().startExportFullPackage(2026, 3);

    expect(mocks.getCompanySettings).toHaveBeenCalledOnce();
    expect(mocks.getMonthlyFullDdtDocuments).toHaveBeenCalledWith(2026, 3);
    expect(mocks.saveReportToDesktop).toHaveBeenCalledWith(
      "03. Marzo 2026/Report Marzo 2026.xlsx",
      expect.any(ArrayBuffer)
    );
    expect(useDdtBatchExportStore.getState()).toMatchObject({
      isExporting: false,
      batchRenderDoc: null,
      successMsg: expect.stringContaining("Nessun DDT presente"),
      errorMsg: null,
    });
  });

  it("ferma l'esportazione e mostra l'errore se la generazione Excel fallisce", async () => {
    mocks.generateDdtMonthlyExcelReport.mockRejectedValueOnce(new Error("Excel non disponibile"));

    await useDdtBatchExportStore.getState().startExportOnlyExcel(2026, 3);

    expect(useDdtBatchExportStore.getState()).toMatchObject({
      isExporting: false,
      progress: null,
      errorMsg: "Errore salvataggio Excel: Excel non disponibile",
      successMsg: null,
    });
    expect(mocks.saveReportToDesktop).not.toHaveBeenCalled();
  });
});

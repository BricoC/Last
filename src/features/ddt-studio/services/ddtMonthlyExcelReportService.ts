import ExcelJS from "exceljs";
import { getDdtMonthlyReportData } from "./ddtMonthlyReportDataService";
/**
 * Genera il file Excel .xlsx fedele a NoMnaV1 con i 3 fogli:
 * 1. Recap Mese & Clienti
 * 2. Dettaglio Articoli
 * 3. Riepilogo DDT
 */
export async function generateDdtMonthlyExcelReport(
  year: number,
  month: number
): Promise<{ filename: string; buffer: Uint8Array }> {
  const data = await getDdtMonthlyReportData(year, month);
  const { metrics, ddtRows, articleRows } = data;
  const monthName = metrics.monthName;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Last Gestionale";
  wb.created = new Date();

  // -------------------------------------------------------------------------
  // FOGLIO 1: Recap Mese & Clienti
  // -------------------------------------------------------------------------
  const wsRecap = wb.addWorksheet("Recap Mese & Clienti");

  wsRecap.columns = [
    { key: "pos", width: 12 },
    { key: "client", width: 44 },
    { key: "ddtCount", width: 18 },
    { key: "ddtList", width: 45 },
    { key: "taxable", width: 24 },
    { key: "vat", width: 20 },
    { key: "total", width: 24 },
    { key: "share", width: 16 },
  ];

  // Header Titolo
  const titleRow = wsRecap.addRow([`RIEPILOGO MENSILE DDT - ${monthName.toUpperCase()} ${year}`]);
  titleRow.font = { bold: true, size: 14 };

  wsRecap.addRow([]); // riga 2 vuota

  // Metriche Generali Mese
  const subTitleRow = wsRecap.addRow(["METRICHE GENERALI MESE"]);
  subTitleRow.font = { bold: true, size: 11 };

  const rMese = wsRecap.addRow(["Mese di Riferimento", `${monthName} ${year}`]);
  rMese.font = { size: 10 };

  const rDdts = wsRecap.addRow(["Totale DDT Emessi", metrics.totalDdts]);
  rDdts.font = { size: 10 };

  const rClients = wsRecap.addRow(["Numero Clienti Serviti", metrics.uniqueClients]);
  rClients.font = { size: 10 };

  const rTax = wsRecap.addRow(["Totale Imponibile (€)", metrics.totalTaxable]);
  rTax.font = { size: 10 };
  rTax.getCell(2).numFmt = "€ #,##0.00";

  const rVat = wsRecap.addRow(["Totale IVA Imposta (€)", metrics.totalVat]);
  rVat.font = { size: 10 };
  rVat.getCell(2).numFmt = "€ #,##0.00";

  const rDoc = wsRecap.addRow(["Totale Documento / Fatturato (€)", metrics.totalDocument]);
  rDoc.font = { bold: true, size: 11 };
  rDoc.getCell(2).numFmt = "€ #,##0.00";

  wsRecap.addRow([]); // riga 10 vuota

  const subRankingRow = wsRecap.addRow(["DETTAGLIO FATTURATO PER CLIENTE"]);
  subRankingRow.font = { bold: true, size: 11 };

  // Riga Intestazione Tabella Clienti (Riga 12)
  const headerRanking = wsRecap.addRow([
    "Pos.",
    "Cliente",
    "N° DDT Emessi",
    "Elenco N° DDT",
    "Totale Imponibile (€)",
    "Totale IVA (€)",
    "Totale Fatturato (€)",
    "% Incidenza",
  ]);
  headerRanking.font = { bold: true, size: 10 };

  // Dati Clienti
  for (const c of metrics.clientRanking) {
    const row = wsRecap.addRow([
      c.pos,
      c.client,
      c.ddtCount,
      c.ddtNumbersList,
      c.totalTaxable,
      c.totalVat,
      c.totalDocument,
      c.sharePercent,
    ]);
    row.font = { size: 10 };
    row.getCell(5).numFmt = "€ #,##0.00";
    row.getCell(6).numFmt = "€ #,##0.00";
    row.getCell(7).numFmt = "€ #,##0.00";
  }

  // -------------------------------------------------------------------------
  // FOGLIO 2: Dettaglio Articoli
  // -------------------------------------------------------------------------
  const wsArticles = wb.addWorksheet("Dettaglio Articoli");

  wsArticles.columns = [
    { key: "year", width: 9 },
    { key: "month", width: 14 },
    { key: "date", width: 14 },
    { key: "ddtNumber", width: 11 },
    { key: "client", width: 38 },
    { key: "destination", width: 28 },
    { key: "reason", width: 20 },
    { key: "payment", width: 26 },
    { key: "orderRef", width: 22 },
    { key: "operator", width: 12 },
    { key: "rowIdx", width: 9 },
    { key: "description", width: 55 },
    { key: "unit", width: 10 },
    { key: "qty", width: 12 },
    { key: "price", width: 18 },
    { key: "disc", width: 11 },
    { key: "netPrice", width: 18 },
    { key: "rowTot", width: 18 },
    { key: "vat", width: 10 },
    { key: "notes", width: 30 },
  ];

  const headerArticles = wsArticles.addRow([
    "Anno",
    "Mese",
    "Data DDT",
    "N° DDT",
    "Cliente",
    "Destinazione",
    "Causale Trasporto",
    "Condizioni Pagamento",
    "N° Ordine Cliente",
    "Operatore",
    "N° Riga",
    "Descrizione Articolo / Prestazione",
    "U.M.",
    "Quantità",
    "Prezzo Unitario (€)",
    "Sconto %",
    "Prezzo Netto (€)",
    "Totale Riga (€)",
    "IVA %",
    "Note Documento",
  ]);
  headerArticles.font = { bold: true, size: 10 };

  for (const art of articleRows) {
    const row = wsArticles.addRow([
      art.year,
      art.monthName,
      art.dateStr,
      art.docNumber,
      art.client,
      art.destination,
      art.reason,
      art.payment,
      art.orderReference,
      art.operator,
      art.rowIndex,
      art.description,
      art.unit,
      art.quantity,
      art.unitPrice,
      art.discountPct,
      art.netPrice,
      art.rowTotal,
      art.vatRate,
      art.internalNotes,
    ]);
    row.font = { size: 10 };
    row.getCell(15).numFmt = "€ #,##0.00";
    row.getCell(17).numFmt = "€ #,##0.00";
    row.getCell(18).numFmt = "€ #,##0.00";
  }

  // -------------------------------------------------------------------------
  // FOGLIO 3: Riepilogo DDT
  // -------------------------------------------------------------------------
  const wsDdt = wb.addWorksheet("Riepilogo DDT");

  wsDdt.columns = [
    { key: "year", width: 9 },
    { key: "month", width: 14 },
    { key: "date", width: 14 },
    { key: "ddtNumber", width: 14 },
    { key: "client", width: 38 },
    { key: "destination", width: 28 },
    { key: "operator", width: 12 },
    { key: "taxable", width: 22 },
    { key: "vat", width: 18 },
    { key: "total", width: 22 },
    { key: "reason", width: 20 },
    { key: "payment", width: 26 },
    { key: "orderRef", width: 22 },
    { key: "carrier", width: 18 },
    { key: "notes", width: 30 },
  ];

  const headerDdt = wsDdt.addRow([
    "Anno",
    "Mese",
    "Data DDT",
    "N° DDT",
    "Cliente",
    "Destinazione",
    "Operatore",
    "Totale Imponibile (€)",
    "IVA Imposta (€)",
    "Totale Documento (€)",
    "Causale Trasporto",
    "Condizioni Pagamento",
    "N° Ordine Cliente",
    "Vettore",
    "Note",
  ]);
  headerDdt.font = { bold: true, size: 10 };

  for (const d of ddtRows) {
    const row = wsDdt.addRow([
      d.year,
      d.monthName,
      d.dateStr,
      d.docNumber,
      d.client,
      d.destination,
      d.operator,
      d.taxable,
      d.vat,
      d.totalDocument,
      d.reason,
      d.payment,
      d.orderReference,
      d.carrier,
      d.notes,
    ]);
    row.font = { size: 10 };
    row.getCell(8).numFmt = "€ #,##0.00";
    row.getCell(9).numFmt = "€ #,##0.00";
    row.getCell(10).numFmt = "€ #,##0.00";
  }

  // Riga Finale Totale Mese
  const totalRow = wsDdt.addRow([
    null,
    null,
    null,
    "TOTALE MESE",
    `${metrics.totalDdts} DDT Emessi`,
    null,
    null,
    metrics.totalTaxable,
    metrics.totalVat,
    metrics.totalDocument,
    null,
    null,
    null,
    null,
    null,
  ]);
  totalRow.font = { bold: true, size: 10 };
  totalRow.getCell(8).numFmt = "€ #,##0.00";
  totalRow.getCell(9).numFmt = "€ #,##0.00";
  totalRow.getCell(10).numFmt = "€ #,##0.00";

  // Esportazione Buffer binario
  const buffer = await wb.xlsx.writeBuffer();
  const filename = `Report DDT ${monthName} ${year}.xlsx`;

  return {
    filename,
    buffer: new Uint8Array(buffer),
  };
}

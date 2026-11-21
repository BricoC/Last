import ExcelJS from "exceljs";
import type { ListinoClienteRow } from "../models/priceList";
import { round5 } from "../utils/priceFormulas";
import { formatExportTimestamp, styleHeaderRow } from "./priceListWorkbookStyles";
/**
 * Costruisce il file Excel individuale di un cliente con formula dinamica
 * `PREZZO VENDITA = ACQUISTO (€) * (1 + % ACQUISTO)` dove entrambi i campi sono valorizzati.
 */
export function buildCustomerPriceListWorkbook(
  clientName: string,
  rows: ListinoClienteRow[]
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Last Gestionale";
  wb.created = new Date();

  const ws = wb.addWorksheet("Listino Cliente", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  ws.columns = [
    { key: "fornitore", width: 16 }, // A
    { key: "codice", width: 16 }, // B
    { key: "data", width: 13 }, // C
    { key: "descrizione", width: 48 }, // D
    { key: "vendita", width: 16 }, // E
    { key: "perc_acq", width: 13 }, // F
    { key: "acquisto", width: 16 }, // G
    { key: "data_acq", width: 14 }, // H
    { key: "acq_old", width: 22 }, // I
    { key: "ric_old", width: 16 }, // J
    { key: "note", width: 24 }, // K
    { key: "note1", width: 20 }, // L
    { key: "note2", width: 20 }, // M
  ];

  const ts = formatExportTimestamp();
  const titleRow = ws.getRow(1);
  ws.mergeCells("A1:M1");
  titleRow.getCell(1).value = `LISTINO CLIENTE: ${clientName} — Backup Excel esportato il ${ts.label} (${rows.length} voci)`;
  titleRow.getCell(1).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
  titleRow.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  titleRow.height = 22;

  const headers = [
    "FORNITORE",
    "CODICE ART.",
    "DATA",
    "DESCRIZIONE",
    "PREZZO VENDITA",
    "% ACQUISTO",
    "ACQUISTO (€)",
    "DATA ACQUISTO",
    "ACQUISTO OLD",
    "RICARICO (%) OLD",
    "NOTE",
    "NOTE 1",
    "NOTE 2",
  ];
  const headerRow = ws.getRow(2);
  headers.forEach((h, idx) => {
    headerRow.getCell(idx + 1).value = h;
  });
  styleHeaderRow(headerRow, headers.length);
  ws.autoFilter = "A2:M2";

  rows.forEach((item, idx) => {
    const r = idx + 3;
    const excelRow = ws.getRow(r);

    const acqEur =
      item.acquisto_eur != null && isFinite(item.acquisto_eur) && item.acquisto_eur > 0
        ? item.acquisto_eur
        : null;
    const percAcqFrac =
      item.perc_acquisto != null && isFinite(item.perc_acquisto)
        ? round5(item.perc_acquisto / 100)
        : null;

    excelRow.getCell(1).value = item.fornitore || null;
    excelRow.getCell(2).value = item.codice_articolo || null;
    excelRow.getCell(2).numFmt = "@";
    excelRow.getCell(3).value = item.data_ref || null;
    excelRow.getCell(4).value = item.descrizione || "";

    if (acqEur != null && percAcqFrac != null) {
      const fallbackSale = round5(acqEur * (1 + percAcqFrac));
      excelRow.getCell(5).value = {
        formula: `G${r}*(1+F${r})`,
        result: item.prezzo_fattura ?? fallbackSale,
      };
    } else {
      excelRow.getCell(5).value = item.prezzo_fattura ?? null;
    }
    excelRow.getCell(5).numFmt = "€ #,##0.000";

    excelRow.getCell(6).value = percAcqFrac;
    excelRow.getCell(6).numFmt = "0.00%";

    excelRow.getCell(7).value = acqEur ?? (item.acquisto_eur ?? null);
    excelRow.getCell(7).numFmt = "€ #,##0.00000";

    excelRow.getCell(8).value = item.data_acquisto || null;
    excelRow.getCell(9).value = item.acquisto_old || null;
    excelRow.getCell(10).value = item.ricarico != null && isFinite(item.ricarico) ? item.ricarico : null;
    excelRow.getCell(11).value = item.note || null;
    excelRow.getCell(12).value = item.note1 || null;
    excelRow.getCell(13).value = item.note2 || null;
  });

  return wb;
}

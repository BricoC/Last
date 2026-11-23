import ExcelJS from "exceljs";
import type { ListinoGeneraleRow } from "../models/priceList";
import { calculatePrezzoFattura, calculatePrezzoProfess, calculatePrezzoPubblico, calculateR1, calculateR2 } from "../utils/priceFormulas";
import { formatExportTimestamp, styleHeaderRow, toExcelFraction } from "./priceListWorkbookStyles";
/**
 * Costruisce il file Excel completo del Listino Generale (+ Listini Vari unificati)
 * replicando colonne A–R di LISTINO GENERALE.xlsm e formule dinamiche su ogni riga.
 */
export function buildGeneralPriceListWorkbook(rows: ListinoGeneraleRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Last Gestionale";
  wb.created = new Date();

  const ws = wb.addWorksheet("Foglio1", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  ws.columns = [
    { key: "cat", width: 22 }, // A
    { key: "fornit", width: 14 }, // B
    { key: "articolo", width: 16 }, // C
    { key: "data", width: 13 }, // D
    { key: "descrizione", width: 48 }, // E
    { key: "um", width: 8 }, // F
    { key: "ri_pub", width: 10 }, // G
    { key: "pubblico", width: 14 }, // H
    { key: "ri_prof", width: 10 }, // I
    { key: "profess", width: 14 }, // J
    { key: "ri_fatt", width: 10 }, // K
    { key: "fattura", width: 14 }, // L
    { key: "acquisto", width: 14 }, // M
    { key: "aum", width: 9 }, // N
    { key: "r1", width: 14 }, // O
    { key: "maga", width: 9 }, // P
    { key: "r2", width: 14 }, // Q
    { key: "iva", width: 9 }, // R
    { key: "note", width: 28 }, // S
  ];

  const ts = formatExportTimestamp();
  const titleRow = ws.getRow(1);
  ws.mergeCells("A1:S1");
  titleRow.getCell(1).value = `LISTINO GENERALE (+ LISTINI VARI) — Backup Excel esportato il ${ts.label} (${rows.length} articoli)`;
  titleRow.getCell(1).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
  titleRow.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  titleRow.height = 22;

  const headers = [
    "CATEGORIA",
    "FORNIT",
    "ARTICOLO",
    "DATA",
    "DESCRIZIONE",
    "UM",
    "RI_PUB",
    "PUBBLICO",
    "RI_PROF",
    "PROFESS",
    "RI_FATT",
    "FATTURA",
    "ACQUISTO",
    "AUM",
    "R1",
    "MAGA",
    "R2",
    "IVA",
    "NOTE",
  ];
  const headerRow = ws.getRow(2);
  headers.forEach((h, idx) => {
    headerRow.getCell(idx + 1).value = h;
  });
  styleHeaderRow(headerRow, headers.length);
  ws.autoFilter = "A2:S2";

  rows.forEach((item, idx) => {
    const r = idx + 3;
    const excelRow = ws.getRow(r);

    const acq = item.prezzo_acquisto != null && isFinite(item.prezzo_acquisto) ? item.prezzo_acquisto : null;
    const hasCost = acq != null && acq > 0;
    const aumFrac = toExcelFraction(item.aumento ?? 0) ?? 0;
    const magaFrac = toExcelFraction(item.maga ?? 0) ?? 0;
    const ivaFrac = toExcelFraction(item.perc_iva ?? 0.22) ?? 0.22;

    const riPubFrac = toExcelFraction(item.perc_pub);
    const riProfFrac = toExcelFraction(item.perc_prof);
    const riFattFrac = toExcelFraction(item.perc_fatt);

    const r1Calc = hasCost ? calculateR1(acq, aumFrac) : item.r1;
    const r2Calc = hasCost && r1Calc != null ? calculateR2(r1Calc, magaFrac) : item.r2;

    const safeText = (val?: string | null): string | null => {
      if (!val) return null;
      return /^[=+\-@\t\r]/.test(val) ? `'${val}` : val;
    };

    excelRow.getCell(1).value = safeText(item.cat);
    excelRow.getCell(2).value = safeText(item.fornitore);
    excelRow.getCell(3).value = safeText(item.codice_articolo);
    excelRow.getCell(3).numFmt = "@";
    excelRow.getCell(4).value = safeText(item.data_ref);
    excelRow.getCell(5).value = safeText(item.descrizione) ?? "";
    excelRow.getCell(6).value = safeText(item.um) ?? "NR.";

    excelRow.getCell(7).value = riPubFrac;
    excelRow.getCell(7).numFmt = "0.0%";

    if (hasCost && riPubFrac != null && r2Calc != null) {
      excelRow.getCell(8).value = {
        formula: `((Q${r}*G${r})+Q${r})*(1+R${r})`,
        result: item.prezzo_pubblico ?? calculatePrezzoPubblico(r2Calc, riPubFrac, ivaFrac),
      };
    } else {
      excelRow.getCell(8).value = item.prezzo_pubblico ?? null;
    }
    excelRow.getCell(8).numFmt = "€ #,##0.000";

    excelRow.getCell(9).value = riProfFrac;
    excelRow.getCell(9).numFmt = "0.0%";

    if (hasCost && riProfFrac != null && r2Calc != null) {
      excelRow.getCell(10).value = {
        formula: `((Q${r}*I${r})+Q${r})*(1+R${r})`,
        result: item.prezzo_profess ?? calculatePrezzoProfess(r2Calc, riProfFrac, ivaFrac),
      };
    } else {
      excelRow.getCell(10).value = item.prezzo_profess ?? null;
    }
    excelRow.getCell(10).numFmt = "€ #,##0.000";

    excelRow.getCell(11).value = riFattFrac;
    excelRow.getCell(11).numFmt = "0.0%";

    if (hasCost && riFattFrac != null && r2Calc != null) {
      excelRow.getCell(12).value = {
        formula: `Q${r}*(1+K${r})`,
        result: item.prezzo_fattura ?? calculatePrezzoFattura(r2Calc, riFattFrac),
      };
    } else {
      excelRow.getCell(12).value = item.prezzo_fattura ?? null;
    }
    excelRow.getCell(12).numFmt = "€ #,##0.000";

    excelRow.getCell(13).value = acq;
    excelRow.getCell(13).numFmt = "€ #,##0.00000";

    excelRow.getCell(14).value = hasCost ? aumFrac : item.aumento != null ? toExcelFraction(item.aumento) : null;
    excelRow.getCell(14).numFmt = "0%";

    if (hasCost) {
      excelRow.getCell(15).value = {
        formula: `M${r}*(1+N${r})`,
        result: r1Calc ?? undefined,
      };
    } else {
      excelRow.getCell(15).value = item.r1 ?? null;
    }
    excelRow.getCell(15).numFmt = "€ #,##0.00000";

    excelRow.getCell(16).value = hasCost ? magaFrac : item.maga != null ? toExcelFraction(item.maga) : null;
    excelRow.getCell(16).numFmt = "0.0%";

    if (hasCost) {
      excelRow.getCell(17).value = {
        formula: `O${r}*(1+P${r})`,
        result: r2Calc ?? undefined,
      };
    } else {
      excelRow.getCell(17).value = item.r2 ?? null;
    }
    excelRow.getCell(17).numFmt = "€ #,##0.00000";

    excelRow.getCell(18).value = ivaFrac;
    excelRow.getCell(18).numFmt = "0.0%";

    excelRow.getCell(19).value = item.note || null;
  });

  return wb;
}

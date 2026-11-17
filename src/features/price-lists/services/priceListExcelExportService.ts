import ExcelJS from "exceljs";
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { ListinoClienteRow, ListinoGeneraleRow } from "../models/priceList";
import {
  calculatePrezzoFattura,
  calculatePrezzoProfess,
  calculatePrezzoPubblico,
  calculateR1,
  calculateR2,
  round5,
} from "../utils/priceFormulas";
import { priceListRepository } from "./priceListRepository";

const EXCEL_EXPORT_FOLDER_KEY = "last_price_list_excel_export_folder_v1";

/**
 * Converte una percentuale memorizzata su SQLite (es. 22 oppure 0.22 oppure 114.6)
 * in frazione decimale per Excel con formato `0.0%` (es. 0.22 o 1.146).
 */
export function toExcelFraction(
  val: number | null | undefined,
  fractionThreshold = 2
): number | null {
  if (val == null || isNaN(val) || !isFinite(val)) return null;
  return val > fractionThreshold ? round5(val / 100) : round5(val);
}

/**
 * Normalizza il nome file per Windows rimuovendo caratteri non ammessi.
 */
export function sanitizeExcelFilename(name: string): string {
  const cleaned = (name || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .trim();
  return cleaned || "Cliente";
}

function formatExportTimestamp(): { label: string; fileSuffix: string; dateFolder: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  return {
    label: `${dd}/${mm}/${yyyy} ${hh}:${min}`,
    fileSuffix: `${yyyy}.${mm}.${dd} ore ${hh}.${min}`,
    dateFolder: `${yyyy}.${mm}.${dd}`,
  };
}

export async function getExcelExportFolder(): Promise<string> {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(EXCEL_EXPORT_FOLDER_KEY);
    if (saved && saved.trim()) return saved.trim();
  }
  try {
    const desktop = await invoke<string>("get_default_desktop_folder");
    if (desktop && desktop.trim()) return desktop.trim();
  } catch {
    // Fallback solo web/test
  }
  return "";
}

export function saveExcelExportFolder(folderPath: string): void {
  if (typeof localStorage === "undefined") return;
  const trimmed = folderPath.trim();
  if (trimmed) {
    localStorage.setItem(EXCEL_EXPORT_FOLDER_KEY, trimmed);
  } else {
    localStorage.removeItem(EXCEL_EXPORT_FOLDER_KEY);
  }
}

export async function resetExcelExportFolderToDesktop(): Promise<string> {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(EXCEL_EXPORT_FOLDER_KEY);
  }
  return getExcelExportFolder();
}

function styleHeaderRow(row: ExcelJS.Row, colCount: number): void {
  row.height = 22;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF334155" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      right: { style: "thin", color: { argb: "FF334155" } },
    };
  }
}

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
    const aumFrac = toExcelFraction(item.aumento ?? 0, 1) ?? 0;
    const magaFrac = toExcelFraction(item.maga ?? 0, 1) ?? 0;
    const ivaFrac = toExcelFraction(item.perc_iva ?? 0.22, 1) ?? 0.22;

    const riPubFrac = toExcelFraction(item.perc_pub, 2);
    const riProfFrac = toExcelFraction(item.perc_prof, 2);
    const riFattFrac = toExcelFraction(item.perc_fatt, 2);

    const r1Calc = hasCost ? calculateR1(acq, aumFrac) : item.r1;
    const r2Calc = hasCost && r1Calc != null ? calculateR2(r1Calc, magaFrac) : item.r2;

    excelRow.getCell(1).value = item.cat || null;
    excelRow.getCell(2).value = item.fornitore || null;
    excelRow.getCell(3).value = item.codice_articolo || null;
    excelRow.getCell(3).numFmt = "@";
    excelRow.getCell(4).value = item.data_ref || null;
    excelRow.getCell(5).value = item.descrizione || "";
    excelRow.getCell(6).value = item.um || "NR.";

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

    excelRow.getCell(14).value = hasCost ? aumFrac : item.aumento != null ? toExcelFraction(item.aumento, 1) : null;
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

    excelRow.getCell(16).value = hasCost ? magaFrac : item.maga != null ? toExcelFraction(item.maga, 1) : null;
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

async function writeWorkbookToDisk(wb: ExcelJS.Workbook, filePath: string): Promise<number> {
  const buffer = await wb.xlsx.writeBuffer();
  const bytes = Array.from(new Uint8Array(buffer as ArrayBuffer));
  return await invoke<number>("write_binary_file", { filePath, bytes });
}

/**
 * Esporta l'intero Listino Generale (+ Listini Vari unificati) in un unico file .xlsx nella cartella scelta.
 */
export async function exportGeneralPriceListExcel(folderPath: string): Promise<{
  filePath: string;
  rowCount: number;
}> {
  const rows = await priceListRepository.searchGeneral("", 100000);
  const wb = buildGeneralPriceListWorkbook(rows);
  const ts = formatExportTimestamp();
  const cleanFolder = folderPath.replace(/[\\/]$/, "");
  const filePath = `${cleanFolder}\\LISTINO GENERALE ${ts.fileSuffix}.xlsx`;
  await writeWorkbookToDisk(wb, filePath);
  return { filePath, rowCount: rows.length };
}

export interface CustomerClientSummary {
  clientName: string;
  rowCount: number;
}

/**
 * Restituisce l'elenco clienti disponibili in `listini_clienti` con il relativo numero di articoli.
 */
export async function getExportableCustomerPriceListSummary(): Promise<CustomerClientSummary[]> {
  const db = await getDatabase();
  const rows = await db.select<{ cliente: string; cnt: number }[]>(
    `SELECT TRIM(REPLACE(cliente, 'LIST_', '')) as cliente, COUNT(*) as cnt
     FROM listini_clienti
     WHERE cliente NOT LIKE 'LIST_000%'
       AND cliente != 'LIST_'
       AND TRIM(REPLACE(cliente, 'LIST_', '')) != ''
     GROUP BY TRIM(REPLACE(cliente, 'LIST_', ''))
     ORDER BY cliente COLLATE NOCASE ASC`
  );
  return rows
    .filter((r) => Boolean(r.cliente?.trim()))
    .map((r) => ({ clientName: r.cliente.trim(), rowCount: Number(r.cnt) || 0 }));
}

/**
 * Esporta i listini clienti selezionati creando un file `<CLIENTE>.xlsx` separato per ogni cliente
 * dentro una sottocartella datata della cartella di esportazione.
 */
export async function exportCustomerPriceListsExcel(
  folderPath: string,
  selectedClients: string[],
  onProgress?: (current: number, total: number, clientName: string) => void
): Promise<{
  outputFolder: string;
  filesCreated: number;
  totalRows: number;
}> {
  const selectedSet = new Set(selectedClients.map((c) => c.trim().toLowerCase()).filter(Boolean));
  if (selectedSet.size === 0) {
    throw new Error("Seleziona almeno un cliente da esportare.");
  }

  const db = await getDatabase();
  const allRows = await db.select<ListinoClienteRow[]>(
    `SELECT * FROM listini_clienti
     WHERE cliente NOT LIKE 'LIST_000%'
       AND cliente != 'LIST_'
       AND TRIM(REPLACE(cliente, 'LIST_', '')) != ''
     ORDER BY cliente COLLATE NOCASE ASC, descrizione COLLATE NOCASE ASC`
  );

  const grouped = new Map<string, { displayName: string; rows: ListinoClienteRow[] }>();
  for (const row of allRows) {
    const cleanName = (row.cliente || "").replace(/^LIST_/, "").trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    if (!selectedSet.has(key)) continue;
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = { displayName: cleanName, rows: [] };
      grouped.set(key, bucket);
    }
    bucket.rows.push(row);
  }

  const ts = formatExportTimestamp();
  const cleanFolder = folderPath.replace(/[\\/]$/, "");
  const outputFolder = `${cleanFolder}\\Listini Clienti ${ts.dateFolder}`;

  const entries = Array.from(grouped.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "it", { sensitivity: "base" })
  );

  const usedFilenames = new Set<string>();
  let filesCreated = 0;
  let totalRows = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    onProgress?.(i + 1, entries.length, entry.displayName);

    let baseName = sanitizeExcelFilename(entry.displayName);
    let candidate = baseName;
    let counter = 2;
    while (usedFilenames.has(candidate.toLowerCase())) {
      candidate = `${baseName} (${counter++})`;
    }
    usedFilenames.add(candidate.toLowerCase());

    const wb = buildCustomerPriceListWorkbook(entry.displayName, entry.rows);
    const filePath = `${outputFolder}\\${candidate}.xlsx`;
    await writeWorkbookToDisk(wb, filePath);

    filesCreated++;
    totalRows += entry.rows.length;

    if (i % 5 === 4) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return { outputFolder, filesCreated, totalRows };
}

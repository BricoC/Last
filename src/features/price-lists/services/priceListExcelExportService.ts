import ExcelJS from "exceljs";
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { ListinoClienteRow } from "../models/priceList";
import { priceListRepository } from "./priceListRepository";
import { buildGeneralPriceListWorkbook } from "./generalPriceListWorkbook";
import { buildCustomerPriceListWorkbook } from "./customerPriceListWorkbook";
import { formatExportTimestamp } from "./priceListWorkbookStyles";
export { toExcelFraction } from "./priceListWorkbookStyles";

const EXCEL_EXPORT_FOLDER_KEY = "last_price_list_excel_export_folder_v1";

/**
 * Normalizza una frazione decimale memorizzata su SQLite (es. 0.02 -> 2%, 0.22 -> 22%, 4.0 -> 400%)
 * per celle Excel con formato `0.0%`.
 */
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

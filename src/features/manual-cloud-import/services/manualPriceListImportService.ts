import { supabaseFetch } from "@/shared/services/supabaseSession";
import { invoke, isTauri } from "@tauri-apps/api/core";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { getDatabase } from "@/shared/data-layer/database";
import { parseItalianNumber } from "@/shared/utils/numberUtils";
import { deterministicUuid } from "@/shared/utils/deterministicUuid";

export interface FileItemInfo {
  filename: string;
  path: string;
  size_bytes: number;
}

export interface SupabaseConfigStatus {
  config: {
    projectUrl: string;
    anonKey: string;
  } | null;
  configPath: string;
}

export interface CurrentAppDbCounts {
  clientiCount: number;
  clientiRows: number;
  generaleRows: number;
  generaleTrashRows: number;
  ddtCount: number;
  ddtItemsCount: number;
}

export async function fetchCurrentAppDatabaseCounts(): Promise<CurrentAppDbCounts> {
  const db = await getDatabase();

  let clientiRows = 0;
  let clientiCount = 0;
  try {
    const res = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM listini_clienti WHERE cliente NOT LIKE 'LIST_000%' AND cliente != 'LIST_' AND TRIM(REPLACE(cliente, 'LIST_', '')) != ''`
    );
    clientiRows = res[0]?.count ?? 0;

    const resCli = await db.select<{ count: number }[]>(
      `SELECT COUNT(DISTINCT cliente) as count FROM listini_clienti WHERE cliente NOT LIKE 'LIST_000%' AND cliente != 'LIST_' AND TRIM(REPLACE(cliente, 'LIST_', '')) != ''`
    );
    clientiCount = resCli[0]?.count ?? 0;
  } catch (e) {
    console.warn("[AppDbCounts] Errore listini_clienti:", e);
  }

  let generaleRows = 0;
  let generaleTrashRows = 0;
  try {
    const res = await db.select<{ count: number }[]>(`SELECT COUNT(*) as count FROM listino_generale`);
    generaleRows = res[0]?.count ?? 0;

    const resTrash = await db.select<{ count: number }[]>(`SELECT COUNT(*) as count FROM listino_generale_cestino`);
    generaleTrashRows = resTrash[0]?.count ?? 0;
  } catch (e) {
    console.warn("[AppDbCounts] Errore listino_generale:", e);
  }

  let ddtCount = 0;
  let ddtItemsCount = 0;
  try {
    const res = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM ddt_documents WHERE deleted_at IS NULL`
    );
    ddtCount = res[0]?.count ?? 0;

    const resItems = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM ddt_items WHERE deleted_at IS NULL`
    );
    ddtItemsCount = resItems[0]?.count ?? 0;
  } catch (e) {
    console.warn("[AppDbCounts] Errore ddt:", e);
  }

  return {
    clientiCount,
    clientiRows,
    generaleRows,
    generaleTrashRows,
    ddtCount,
    ddtItemsCount,
  };
}

export async function getSupabaseConfig(): Promise<{ projectUrl: string; anonKey: string }> {
  const status = await invoke<SupabaseConfigStatus>("load_supabase_config");
  if (!status.config || !status.config.projectUrl || !status.config.anonKey) {
    throw new Error("Configurazione Supabase mancante in supabase.local.json");
  }
  return status.config;
}

export async function readTextFileLossless(filePath: string): Promise<string> {
  const base64Str = await invoke<string>("read_single_excel_file_base64", { filePath });
  const binary = atob(base64Str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function parseSafeNum(val: unknown, defaultVal: number = 0): number {
  const num = parseItalianNumber(val);
  return num === null ? defaultVal : num;
}

/** Excel stores percentages as fractions. A textual % suffix explicitly gives percentage points. */
export function parseExcelPricePercentage(value: unknown, fallback = 0): number {
  const number = parseItalianNumber(value);
  if (number === null) return fallback;
  return typeof value === "string" && value.trim().endsWith("%") ? number / 100 : number;
}

export function normalizeArtCode(val: unknown): string {
  if (val === null || val === undefined || val === "" || val === 0 || val === "0") return "";
  return String(val).trim();
}

export function parseAnyDate(dateVal: unknown, annoFallback: number = 2026): {
  year: number;
  month: number;
  day: number;
  iso: string;
} {
  if (!dateVal) {
    return {
      year: annoFallback,
      month: 1,
      day: 1,
      iso: `${annoFallback}-01-01`,
    };
  }

  const s = String(dateVal).trim();
  let y: number | null = null;
  let m: number | null = null;
  let d: number | null = null;

  if (s.includes("-")) {
    const parts = s.split("-");
    if (parts.length >= 3 && parts[0].length === 4) {
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      d = parseInt(parts[2].slice(0, 2), 10);
    }
  } else if (s.includes(".")) {
    const parts = s.split(".");
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        y = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
        d = parseInt(parts[2], 10);
      } else if (parts[2].length === 4) {
        d = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
        y = parseInt(parts[2], 10);
      }
    }
  } else if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        y = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
        d = parseInt(parts[2], 10);
      } else if (parts[2].length === 4) {
        const p0 = parseInt(parts[0], 10);
        const p1 = parseInt(parts[1], 10);
        const p2 = parseInt(parts[2], 10);
        y = p2;
        if (p1 > 12 && p0 <= 12) {
          m = p0;
          d = p1;
        } else {
          d = p0;
          m = p1;
        }
      }
    }
  }

  if (y == null || isNaN(y) || y < 2000 || y > 2099) y = annoFallback;
  if (m == null || isNaN(m) || m < 1 || m > 12) m = 1;
  if (d == null || isNaN(d) || d < 1 || d > 31) d = 1;

  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return {
    year: y,
    month: m,
    day: d,
    iso: `${y}-${mm}-${dd}`,
  };
}

/* =====================================================================
   1. LISTINI CLIENTI (ACQUISTO TESTO PROTETTO)
===================================================================== */

export interface ParsedListinoClienteRow {
  cloudId?: number;
  cliente: string;
  fileName: string;
  descrizione: string;
  prezzo_fattura?: number;
  prezzo_acquisto?: number;
  acquisto_old: string;
  ricarico?: number;
  note?: string | null;
  note1?: string | null;
  note2?: string | null;
  hasTextAcquisto: boolean;
}

export interface ClientListAnalysisResult {
  totalFiles: number;
  skippedFiles: string[];
  totalRows: number;
  textAcquistoCount: number;
  clientsCount: number;
  rows: ParsedListinoClienteRow[];
  errors: string[];
}

const SALE_PRICE_HEADER_CANDIDATES = [
  "FATTURA",
  "PREZZO_FATTURA",
  "VENDITA FATTURA",
  "PREZZO VENDITA",
  "VENDITA",
  "VENDITA IVA COMPRESA",
  "PREZZO CON IVA",
] as const;

/**
 * Converte una riga Excel di un listino cliente gestendo intestazioni con spazi
 * (es. " FATTURA") o etichette storiche equivalenti (es. "VENDITA", "PREZZO CON IVA").
 */
export function parseCustomerPriceListExcelRow(
  rawRow: Record<string, unknown>,
  clienteWithPrefix: string,
  fileName: string
): ParsedListinoClienteRow | null {
  const normalized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(rawRow)) {
    const cleanKey = key.trim().toUpperCase();
    if (cleanKey && !(cleanKey in normalized && String(normalized[cleanKey] ?? "").trim() !== "")) {
      normalized[cleanKey] = val;
    }
  }

  const descRaw = normalized.DESCRIZIONE;
  if (descRaw == null) return null;
  const desc = String(descRaw).trim();
  if (!desc || desc === "0") return null;

  const prezzoFattura = SALE_PRICE_HEADER_CANDIDATES
    .map((candidate) => optionalImportNumber(normalized[candidate]))
    .find((value) => value !== undefined);
  const purchase = normalized.ACQUISTO;
  const acquistoOldText = purchase == null ? "" : String(purchase).trim();
  const hasText = typeof purchase === "string" && /[a-zA-Z]/.test(acquistoOldText);
  const prezzoAcquisto = hasText ? undefined : optionalImportNumber(purchase);
  const ricarico = optionalImportNumber(normalized.RICARICO);

  return {
    cliente: clienteWithPrefix,
    fileName,
    descrizione: desc,
    prezzo_fattura: prezzoFattura,
    prezzo_acquisto: prezzoAcquisto,
    acquisto_old: acquistoOldText,
    ricarico,
    note: normalized.NOTE ? String(normalized.NOTE).trim() : null,
    note1: normalized.NOTE1 ? String(normalized.NOTE1).trim() : null,
    note2: normalized.NOTE2 ? String(normalized.NOTE2).trim() : null,
    hasTextAcquisto: hasText,
  };
}

export async function scanAndParseClientPriceLists(
  folderPath: string = "D:\\BricoClassFiles\\Offline\\ListiniClienti",
  ignoreOneDriveConflicts: boolean = true,
  onProgress?: (current: number, total: number, filename: string) => void
): Promise<ClientListAnalysisResult> {
  const fileList = await invoke<FileItemInfo[]>("list_files_in_folder", {
    folderPath: folderPath.trim() || undefined,
    extensions: ["xls", "xlsx"],
  });

  const validFiles: FileItemInfo[] = [];
  const skippedFiles: string[] = [];

  for (const f of fileList) {
    const fn = f.filename;
    if (fn.startsWith("~$") || fn.startsWith("000 Modulo") || fn === ".xls" || fn === ".xlsx") {
      skippedFiles.push(fn);
      continue;
    }
    if (ignoreOneDriveConflicts && fn.includes("-DESKTOP-")) {
      skippedFiles.push(fn + " (conflitto OneDrive)");
      continue;
    }
    validFiles.push(f);
  }

  const allRows: ParsedListinoClienteRow[] = [];
  const errors: string[] = [];
  const clientsSet = new Set<string>();
  let textAcquistoCount = 0;

  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    if (onProgress) onProgress(i + 1, validFiles.length, file.filename);

    try {
      const base64Str = await invoke<string>("read_single_excel_file_base64", {
        filePath: file.path,
      });
      const binaryStr = atob(base64Str);
      const wb = XLSX.read(binaryStr, { type: "binary" });
      if (!wb.SheetNames || wb.SheetNames.length === 0) continue;

      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const clientNameOnly = file.filename.replace(/\.(xls|xlsx)$/i, "").trim();
      const clienteWithPrefix = "LIST_" + clientNameOnly;
      clientsSet.add(clienteWithPrefix);

      for (const r of rawData) {
        const parsedRow = parseCustomerPriceListExcelRow(r, clienteWithPrefix, file.filename);
        if (!parsedRow) continue;
        if (parsedRow.hasTextAcquisto) textAcquistoCount++;
        allRows.push(parsedRow);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Errore nel file ${file.filename}: ${msg}`);
    }
  }

  return {
    totalFiles: validFiles.length,
    skippedFiles,
    totalRows: allRows.length,
    textAcquistoCount,
    clientsCount: clientsSet.size,
    rows: allRows,
    errors,
  };
}

async function readCloudInventory<T>(
  projectUrl: string, anonKey: string, table: string, columns: string,
  onProgress?: (count: number) => void
): Promise<T[]> {
  const rows: T[] = [];
  const url = new URL(`/rest/v1/${table}`, projectUrl);
  url.searchParams.set("select", columns);
  url.searchParams.set("order", "id.asc");
  url.searchParams.set("limit", "1000");
  while (true) {
    url.searchParams.set("offset", String(rows.length));
    const response = await supabaseFetch(url.toString(), {
      headers: { apikey: anonKey },
    });
    if (!response.ok) throw new Error(`Inventario Supabase ${table} incompleto: HTTP ${response.status}`);
    const chunk = await response.json();
    if (!Array.isArray(chunk)) throw new Error(`Inventario Supabase ${table} non valido`);
    if (!chunk.length) return rows;
    rows.push(...chunk);
    onProgress?.(rows.length);
  }
}

function optionalImportNumber(value: unknown): number | undefined {
  return parseItalianNumber(value) ?? undefined;
}

function optionalImportPercentage(value: unknown): number | undefined {
  return optionalImportNumber(value) === undefined ? undefined : parseExcelPricePercentage(value);
}

function mergeImportDuplicates<T extends object>(rows: T[], keyFor: (row: T, index: number) => string): T[] {
  const unique = new Map<string, T>();
  for (const [index, row] of rows.entries()) {
    const key = keyFor(row, index);
    const fields = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
    unique.set(key, { ...unique.get(key), ...fields } as T);
  }
  return [...unique.values()];
}

const clientListKey = (row: { cliente: string; descrizione: string }) =>
  JSON.stringify([String(row.cliente || "").trim().toLowerCase(), String(row.descrizione || "").trim().toLowerCase()]);

function mergeClientImportRows(rows: ParsedListinoClienteRow[]) {
  return mergeImportDuplicates(
    rows.map((row) => ({ ...row, acquisto_old: row.acquisto_old?.trim() || undefined })),
    clientListKey,
  );
}

function groupByPayloadColumns(records: Record<string, unknown>[]): Record<string, unknown>[][] {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of records) {
    const shape = JSON.stringify(Object.keys(row).filter((key) => row[key] !== undefined).sort());
    const group = groups.get(shape);
    if (group) group.push(row);
    else groups.set(shape, [row]);
  }
  return [...groups.values()];
}

async function writePriceListBatches(
  projectUrl: string, anonKey: string, table: string, records: Record<string, unknown>[],
  onProgress?: (current: number, total: number) => void
): Promise<{ inserted: number; updated: number; failed: number }> {
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const unique = mergeImportDuplicates(records, (row, index) => row.id == null ? `new:${index}` : `id:${row.id}`);
  for (const group of groupByPayloadColumns(unique)) {
    for (let offset = 0; offset < group.length; offset += 200) {
      const chunk = group.slice(offset, offset + 200);
      const existing = chunk[0].id != null;
      try {
        const response = await supabaseFetch(new URL(`/rest/v1/${table}`, projectUrl), {
          method: "POST",
          headers: {
            apikey: anonKey, "Content-Type": "application/json",
            Prefer: existing ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
          },
          body: JSON.stringify(chunk),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (existing) updated += chunk.length;
        else inserted += chunk.length;
      } catch {
        failed += chunk.length;
      }
      onProgress?.(inserted + updated + failed, unique.length);
    }
  }
  return { inserted, updated, failed };
}

export async function uploadClientPriceListsToSupabase(
  rows: ParsedListinoClienteRow[],
  projectUrl: string,
  anonKey: string,
  onProgress?: (processed: number, total: number) => void
): Promise<{ inserted: number; updated: number; failed: number }> {
  const inventory = await readCloudInventory<{ id: number; cliente: string; descrizione: string }>(
    projectUrl, anonKey, "listini_clienti", "id,cliente,descrizione"
  );
  const cloudMap = new Map(inventory.map((row) => [clientListKey(row), row]));
  const nowIso = new Date().toISOString();
  const toUpsert: Record<string, unknown>[] = mergeClientImportRows(rows).map((r) => {
    const match = cloudMap.get(clientListKey(r));
    const payload: Record<string, unknown> = {
      cliente: r.cliente,
      descrizione: r.descrizione,
      prezzo_fattura: r.prezzo_fattura,
      prezzo_acquisto: r.prezzo_acquisto,
      acquisto_old: r.acquisto_old,
      ricarico: r.ricarico,
      note: r.note,
      note1: r.note1,
      note2: r.note2,
      modificato_da: "Migrazione Manuale Last",
      updated_at: nowIso,
    };
    if (match) payload.id = match.id;
    return payload;
  });

  return writePriceListBatches(projectUrl, anonKey, "listini_clienti", toUpsert, onProgress);
}

/* =====================================================================
   2. LISTINO GENERALE & VARI
===================================================================== */

export interface ParsedListinoGeneraleRow {
  cloudId?: number;
  cat?: string | null;
  fornitore?: string | null;
  codice_articolo?: string | null;
  data?: string | null;
  descrizione: string;
  um?: string;
  perc_pub?: number;
  prezzo_pubblico?: number;
  perc_prof?: number;
  prezzo_profess?: number;
  perc_fatt?: number;
  prezzo_fattura?: number;
  prezzo_acquisto?: number;
  aumento?: number;
  r1?: number;
  maga?: number;
  r2?: number;
  perc_iva?: number;
  note?: string | null;
  isVari: boolean;
}

export interface GeneralListAnalysisResult {
  totalGenerale: number;
  totalVari: number;
  totalCombined: number;
  rowsGenerale: ParsedListinoGeneraleRow[];
  rowsVari: ParsedListinoGeneraleRow[];
  errors: string[];
}

export async function scanAndParseGeneralPriceLists(
  generalFilePath: string = "D:\\BricoClassFiles\\Offline\\Listini\\Listini Generali\\LISTINO GENERALE.xlsm",
  variFolderPath: string = "D:\\BricoClassFiles\\Offline\\Listini\\Listini Generali",
  onProgress?: (stage: string, current: number, total: number) => void
): Promise<GeneralListAnalysisResult> {
  const rowsGenerale: ParsedListinoGeneraleRow[] = [];
  const rowsVari: ParsedListinoGeneraleRow[] = [];
  const errors: string[] = [];

  try {
    if (onProgress) onProgress("Listino Generale", 0, 1);
    const b64 = await invoke<string>("read_single_excel_file_base64", { filePath: generalFilePath });
    const wb = XLSX.read(atob(b64), { type: "binary" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    for (const r of rawData) {
      const desc = String(r.DESCRIZIONE ?? r.descrizione ?? "").trim();
      if (!desc || desc === "0") continue;
      const cat = r.CAT ? String(r.CAT).trim() : null;
      if (cat && cat.startsWith("LIST_")) continue;

      rowsGenerale.push({
        cat,
        fornitore: r.FORNIT ? String(r.FORNIT).trim() : (r.fornitore ? String(r.fornitore).trim() : null),
        codice_articolo: normalizeArtCode(r.ART ?? r.codice_articolo),
        data: r.DATA != null ? String(r.DATA).trim() : null,
        descrizione: desc,
        um: r.UM ? String(r.UM).trim() : "NR.",
        perc_pub: optionalImportPercentage(r["% PUB"] ?? r["%PUB"] ?? r.perc_pub),
        prezzo_pubblico: optionalImportNumber(r.PUBBLICO ?? r.prezzo_pubblico),
        perc_prof: optionalImportPercentage(r["% PROF"] ?? r["%PROF"] ?? r.perc_prof),
        prezzo_profess: optionalImportNumber(r.PROFESS ?? r.prezzo_profess),
        perc_fatt: optionalImportPercentage(r["% FATT"] ?? r["%FATT"] ?? r.perc_fatt),
        prezzo_fattura: optionalImportNumber(r.FATTURA ?? r.prezzo_fattura),
        prezzo_acquisto: optionalImportNumber(r.ACQUISTO ?? r.prezzo_acquisto),
        aumento: optionalImportPercentage(r.AUMENTO ?? r.aumento),
        r1: optionalImportNumber(r.R1 ?? r.r1),
        maga: optionalImportPercentage(r.MAGA ?? r.maga),
        r2: optionalImportNumber(r.R2 ?? r.r2),
        perc_iva: optionalImportPercentage(r.IVA ?? r["%IVA"] ?? r.perc_iva),
        note: r.NOTE ? String(r.NOTE).trim() : null,
        isVari: false,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Errore lettura Listino Generale: ${msg}`);
  }

  try {
    const files = await invoke<FileItemInfo[]>("list_files_in_folder", {
      folderPath: variFolderPath,
      extensions: ["xls", "xlsx", "xlsm"],
    });

    const variFiles = files.filter(
      (f) =>
        !f.filename.toLowerCase().includes("listino generale") &&
        !f.filename.startsWith("~$")
    );

    for (let i = 0; i < variFiles.length; i++) {
      const f = variFiles[i];
      if (onProgress) onProgress(`Listini Vari (${f.filename})`, i + 1, variFiles.length);

      try {
        const catName = "LIST_" + f.filename.replace(/\.[^/.]+$/, "").trim();
        const b64 = await invoke<string>("read_single_excel_file_base64", { filePath: f.path });
        const wb = XLSX.read(atob(b64), { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

        for (const r of raw) {
          const desc = String(r.DESCRIZIONE ?? r.descrizione ?? "").trim();
          if (!desc || desc === "0") continue;

          rowsVari.push({
            cat: catName,
            fornitore: r.FORNIT ? String(r.FORNIT).trim() : (r.fornitore ? String(r.fornitore).trim() : null),
            codice_articolo: normalizeArtCode(r.ART ?? r.codice_articolo),
            data: r.DATA != null ? String(r.DATA).trim() : null,
            descrizione: desc,
            um: r.UM ? String(r.UM).trim() : "NR.",
            perc_pub: optionalImportPercentage(r["% PUB"] ?? r["%PUB"] ?? r.perc_pub),
            prezzo_pubblico: optionalImportNumber(r.PUBBLICO ?? r.prezzo_pubblico),
            perc_prof: optionalImportPercentage(r["% PROF"] ?? r["%PROF"] ?? r.perc_prof),
            prezzo_profess: optionalImportNumber(r.PROFESS ?? r.prezzo_profess),
            perc_fatt: optionalImportPercentage(r["% FATT"] ?? r["%FATT"] ?? r.perc_fatt),
            prezzo_fattura: optionalImportNumber(r.FATTURA ?? r.prezzo_fattura),
            prezzo_acquisto: optionalImportNumber(r.ACQUISTO ?? r.prezzo_acquisto),
            aumento: optionalImportPercentage(r.AUMENTO ?? r.aumento),
            r1: optionalImportNumber(r.R1 ?? r.r1),
            maga: optionalImportPercentage(r.MAGA ?? r.maga),
            r2: optionalImportNumber(r.R2 ?? r.r2),
            perc_iva: optionalImportPercentage(r.IVA ?? r["%IVA"] ?? r.perc_iva),
            note: r.NOTE ? String(r.NOTE).trim() : null,
            isVari: true,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Errore lettura Listino Vario (${f.filename}): ${msg}`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Errore lettura cartella Listini Vari: ${msg}`);
  }

  return {
    totalGenerale: rowsGenerale.length,
    totalVari: rowsVari.length,
    totalCombined: rowsGenerale.length + rowsVari.length,
    rowsGenerale,
    rowsVari,
    errors,
  };
}

export async function uploadGeneralListsToSupabase(
  rowsGenerale: ParsedListinoGeneraleRow[],
  rowsVari: ParsedListinoGeneraleRow[],
  projectUrl: string,
  anonKey: string,
  onProgress?: (stage: string, processed: number, total: number) => void
): Promise<{ genInserted: number; genUpdated: number; varInserted: number; varUpdated: number; failed: number }> {
  type InventoryRow = { id: number; codice_articolo: string; descrizione: string };
  const columns = "id,codice_articolo,descrizione";
  const [generalInventory, variInventory] = await Promise.all([
    rowsGenerale.length ? readCloudInventory<InventoryRow>(projectUrl, anonKey, "listino_generale", columns) : [],
    rowsVari.length ? readCloudInventory<InventoryRow>(projectUrl, anonKey, "listini_vari", columns) : [],
  ]);

  const now = new Date().toISOString();
  const articleKey = (row: { codice_articolo?: string | null; descrizione: string }) =>
    `${normalizeArtCode(row.codice_articolo)}___${String(row.descrizione || "").trim().toLowerCase()}`;
  const prepareRows = (rows: ParsedListinoGeneraleRow[], inventory: InventoryRow[]) => {
    const cloud = new Map(inventory.map((row) => [articleKey(row), row.id]));
    return mergeImportDuplicates(rows, articleKey).map((row) => {
      const { isVari: _isVari, cloudId: _cloudId, ...payload } = row;
      const id = cloud.get(articleKey(row));
      return {
        ...payload, codice_articolo: row.codice_articolo || null, updated_at: now,
        ...(id == null ? {} : { id }),
      };
    });
  };
  const general = await writePriceListBatches(
    projectUrl, anonKey, "listino_generale", prepareRows(rowsGenerale, generalInventory),
    (current, total) => onProgress?.("Listino Generale", current, total)
  );
  const vari = await writePriceListBatches(
    projectUrl, anonKey, "listini_vari", prepareRows(rowsVari, variInventory),
    (current, total) => onProgress?.("Listini Vari", current, total)
  );
  return {
    genInserted: general.inserted, genUpdated: general.updated,
    varInserted: vari.inserted, varUpdated: vari.updated, failed: general.failed + vari.failed,
  };
}

/* =====================================================================
   3. DDT TESTATE E RIGHE ARTICOLI (CON DEDUPLICA E FILE RECENTI 2026)
===================================================================== */

export interface ParsedDdtHeader {
  cloudId?: number;
  numero: number;
  anno: number;
  data: string | null;
  cliente: string;
  indirizzo?: string;
  citta?: string;
  pagamento?: string;
  destinazione?: string;
  citta_dest?: string;
  nr_vs_ordine?: string;
  causale?: string;
  porto?: string;
  aspetto?: string;
  colli?: string;
  peso_kg?: number;
  vettore?: string;
  operatore?: string;
  note?: string;
  totale_imponibile?: number;
  totale_iva?: number;
  totale_documento?: number;
  prezzo_acquisto_totale?: number;
  ricavo?: number;
  ricarico_totale?: number;
  sconto_totale?: number;
  stato?: string;
  piva?: string;
  cod_fiscale?: string;
  sdi?: string;
}

export interface ParsedDdtRow {
  cloudId?: number;
  ddt_id?: number;
  anno: number;
  numero_ddt: number;
  riga_nr: number;
  um?: string;
  quantita: number;
  descrizione: string;
  prezzo?: number;
  sconto_pct?: number;
  importo?: number;
  iva_pct?: number;
  prezzo_acquisto?: number;
  prezzo_scontato?: number;
  ricavo?: number;
}

export interface DdtAnalysisResult {
  totalHeaders: number;
  totalRows: number;
  yearsDetected: number[];
  headers: ParsedDdtHeader[];
  rows: ParsedDdtRow[];
  errors: string[];
}

export async function scanAndParseLocalDdt(
  datiFolderPath: string = "D:\\BricoClassFiles\\Offline\\Database\\DDTDati",
  articoliFolderPath: string = "D:\\BricoClassFiles\\Offline\\Database\\DDTArticoli",
  onProgress?: (stage: string, current: number, total: number) => void
): Promise<DdtAnalysisResult> {
  const headerMap = new Map<string, ParsedDdtHeader>();
  const rowsMap = new Map<string, ParsedDdtRow>();
  const errors: string[] = [];

  // 1. Lettura Testate Consolidate (2023, 2024, 2025, 2026)
  try {
    const datiFiles = await invoke<FileItemInfo[]>("list_files_in_folder", {
      folderPath: datiFolderPath,
      extensions: ["csv"],
    });

    for (let i = 0; i < datiFiles.length; i++) {
      const f = datiFiles[i];
      if (onProgress) onProgress(`CSV Testate Consolidate (${f.filename})`, i + 1, datiFiles.length);

      try {
        const text = await readTextFileLossless(f.path);
        const parsed = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });

        let fileYearFallback = 2026;
        const ym = f.filename.match(/(\d{4})/);
        if (ym) fileYearFallback = parseInt(ym[1], 10);

        for (const r of parsed.data) {
          const numRaw = r.DDT ?? r.NumeroDDT ?? r.numero;
          if (numRaw == null || numRaw === "") continue;
          const num = parseInt(String(numRaw), 10);
          if (isNaN(num)) continue;

          const dateObj = parseAnyDate(r.Data ?? r.data, fileYearFallback);
          const yr = r.Anno ? parseInt(String(r.Anno), 10) : dateObj.year;

          const key = `${yr}_${num}`;
          headerMap.set(key, {
            numero: num,
            anno: yr,
            data: dateObj.iso,
            cliente: String(r.Cliente ?? r.cliente ?? "").trim(),
            indirizzo: String(r.Indirizzo ?? r.indirizzo ?? "").trim(),
            citta: String(r.Citta ?? r.citta ?? "").trim(),
            pagamento: String(r.Pagamento ?? r.pagamento ?? "").trim(),
            destinazione: String(r.Destinazione ?? r.destinazione ?? "").trim(),
            citta_dest: String(r.CittaDest ?? r.citta_dest ?? "").trim(),
            nr_vs_ordine: String(r.OR ?? r.OrdineNumero ?? r.nr_vs_ordine ?? "").trim(),
            causale: String(r.Causale ?? r.CausaleTrasporto ?? r.causale ?? "Vendita").trim(),
            porto: String(r.Porto ?? r.porto ?? "").trim(),
            aspetto: String(r.Aspetto ?? r.AspettoBeni ?? r.aspetto ?? "").trim(),
            colli: String(r.Colli ?? r.colli ?? ""),
            peso_kg: parseSafeNum(r.PesoKg ?? r.peso_kg),
            vettore: String(r.Vettore ?? r.vettore ?? "").trim(),
            operatore: String(r.OP ?? r.Operatore ?? r.operatore ?? "").trim(),
            note: String(r.Note ?? r.note ?? "").trim(),
            totale_imponibile: parseSafeNum(r.TotaleImponibile ?? r.totale_imponibile),
            totale_iva: parseSafeNum(r.Imposta ?? r.totale_iva),
            totale_documento: parseSafeNum(r.TotaleDocumento ?? r.totale_documento),
            prezzo_acquisto_totale: parseSafeNum(r.PrezzoAcquistoTotale ?? r.prezzo_acquisto_totale),
            ricavo: parseSafeNum(r.Ricavo ?? r.ricavo),
            ricarico_totale: parseSafeNum(r.RicaricoTotale ?? r.ricarico_totale),
            sconto_totale: parseSafeNum(r.Sconto ?? r.sconto_totale),
            stato: "confermato",
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Errore testate ${f.filename}: ${msg}`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Errore cartella DDTDati: ${msg}`);
  }

  // 2. Lettura File Singoli 2026\DDTDati (Aggiorna gli ultimi DDT emessi)
  try {
    const dati2026Folder = "D:\\BricoClassFiles\\Offline\\Database\\2026\\DDTDati";
    const files2026 = await invoke<FileItemInfo[]>("list_files_in_folder", {
      folderPath: dati2026Folder,
      extensions: ["csv"],
    }).catch(() => [] as FileItemInfo[]);

    if (files2026.length > 0) {
      if (onProgress) onProgress("Scansione DDT Recenti 2026", 1, files2026.length);
      for (const f of files2026) {
        const match = f.filename.match(/^(\d+)\s+(\d{4})\.(\d{2})\.(\d{2})/);
        if (!match) continue;
        const num = parseInt(match[1], 10);
        const yr = parseInt(match[2], 10);
        const key = `${yr}_${num}`;

        // Se non presente nel consolidato o più recente, leggiamo il dettaglio
        if (!headerMap.has(key)) {
          try {
            const text = await readTextFileLossless(f.path);
            const p = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
            const r = p.data[0];
            if (r) {
              const iso = `${yr}-${match[3]}-${match[4]}`;
              headerMap.set(key, {
                numero: num,
                anno: yr,
                data: iso,
                cliente: String(r.Cliente ?? r.cliente ?? "").trim(),
                indirizzo: String(r.Indirizzo ?? r.indirizzo ?? "").trim(),
                citta: String(r.Citta ?? r.citta ?? "").trim(),
                pagamento: String(r.Pagamento ?? r.pagamento ?? "").trim(),
                destinazione: String(r.Destinazione ?? r.destinazione ?? "").trim(),
                citta_dest: String(r.CittaDest ?? r.citta_dest ?? "").trim(),
                nr_vs_ordine: String(r.OR ?? r.OrdineNumero ?? r.nr_vs_ordine ?? "").trim(),
                causale: String(r.Causale ?? r.CausaleTrasporto ?? r.causale ?? "Vendita").trim(),
                porto: String(r.Porto ?? r.porto ?? "").trim(),
                aspetto: String(r.Aspetto ?? r.AspettoBeni ?? r.aspetto ?? "").trim(),
                colli: String(r.Colli ?? r.colli ?? ""),
                peso_kg: parseSafeNum(r.PesoKg ?? r.peso_kg),
                vettore: String(r.Vettore ?? r.vettore ?? "").trim(),
                operatore: String(r.OP ?? r.Operatore ?? r.operatore ?? "").trim(),
                note: String(r.Note ?? r.note ?? "").trim(),
                totale_imponibile: parseSafeNum(r.TotaleImponibile ?? r.totale_imponibile),
                totale_iva: parseSafeNum(r.Imposta ?? r.totale_iva),
                totale_documento: parseSafeNum(r.TotaleDocumento ?? r.totale_documento),
                prezzo_acquisto_totale: parseSafeNum(r.PrezzoAcquistoTotale ?? r.prezzo_acquisto_totale),
                ricavo: parseSafeNum(r.Ricavo ?? r.ricavo),
                ricarico_totale: parseSafeNum(r.RicaricoTotale ?? r.ricarico_totale),
                sconto_totale: parseSafeNum(r.Sconto ?? r.sconto_totale),
                stato: "confermato",
              });
            }
          } catch {
            // Ignora singolo file se illeggibile
          }
        }
      }
    }
  } catch {
    // 2026 folder opzionale
  }

  // 3. Lettura Righe Consolidate con Deduplica automatica su chiave `${anno}_${num}_${row}_${desc}`
  try {
    const artFiles = await invoke<FileItemInfo[]>("list_files_in_folder", {
      folderPath: articoliFolderPath,
      extensions: ["csv"],
    });

    for (let i = 0; i < artFiles.length; i++) {
      const f = artFiles[i];
      if (onProgress) onProgress(`CSV Righe Articoli Consolidate (${f.filename})`, i + 1, artFiles.length);

      try {
        const text = await readTextFileLossless(f.path);
        const parsed = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });

        let fileYearFallback = 2026;
        const ym = f.filename.match(/(\d{4})/);
        if (ym) fileYearFallback = parseInt(ym[1], 10);

        for (const r of parsed.data) {
          const numRaw = r.DDT ?? r.NumeroDDT ?? r.numero;
          const desc = String(r.Descrizione ?? r.descrizione ?? "").trim();
          if (numRaw == null || !desc) continue;
          const num = parseInt(String(numRaw), 10);
          if (isNaN(num)) continue;

          const dateObj = parseAnyDate(r.Data ?? r.data, fileYearFallback);
          const yr = r.Anno ? parseInt(String(r.Anno), 10) : dateObj.year;
          const rigaNr = parseInt(String(r.Row ?? r.riga_nr ?? 1), 10) || 1;

          // Deduplica fedele a NoManV1 updateMergedArt
          const rowKey = `${yr}_${num}_${rigaNr}_${desc.toLowerCase()}`;
          rowsMap.set(rowKey, {
            anno: yr,
            numero_ddt: num,
            riga_nr: rigaNr,
            um: String(r.UM ?? r.UnitaMisura ?? r.um ?? "NR.").trim(),
            quantita: parseSafeNum(r.Quantita ?? r.quantita, 1),
            descrizione: desc,
            prezzo: parseSafeNum(r.PrezzoUnit ?? r.Prezzo ?? r.prezzo),
            sconto_pct: parseSafeNum(r.Sconto ?? r.Sconto1 ?? r.sconto_pct),
            importo: parseSafeNum(r.Importo ?? r.importo),
            iva_pct: parseSafeNum(r.IVA ?? r.iva ?? r.iva_pct, 22),
            prezzo_acquisto: parseSafeNum(r.PrezzoAcquisto ?? r.prezzo_acquisto),
            prezzo_scontato: parseSafeNum(r.PrezzoScontato ?? r.prezzo_scontato),
            ricavo: parseSafeNum(r.Ricavo ?? r.ricavo),
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Errore righe ${f.filename}: ${msg}`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Errore cartella DDTArticoli: ${msg}`);
  }

  // 4. Lettura Righe Singole 2026\DDTArticoli (ultimi DDT emessi)
  try {
    const art2026Folder = "D:\\BricoClassFiles\\Offline\\Database\\2026\\DDTArticoli";
    const filesArt2026 = await invoke<FileItemInfo[]>("list_files_in_folder", {
      folderPath: art2026Folder,
      extensions: ["csv"],
    }).catch(() => [] as FileItemInfo[]);

    if (filesArt2026.length > 0) {
      if (onProgress) onProgress("Scansione Righe Recenti 2026", 1, filesArt2026.length);
      for (const f of filesArt2026) {
        const match = f.filename.match(/^(\d+)\s+(\d{4})\.(\d{2})\.(\d{2})/);
        if (!match) continue;
        const num = parseInt(match[1], 10);
        const yr = parseInt(match[2], 10);

        try {
          const text = await readTextFileLossless(f.path);
          const p = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
          for (const r of p.data) {
            const desc = String(r.Descrizione ?? r.descrizione ?? "").trim();
            if (!desc) continue;
            const rigaNr = parseInt(String(r.Row ?? r.riga_nr ?? 1), 10) || 1;
            const rowKey = `${yr}_${num}_${rigaNr}_${desc.toLowerCase()}`;

            rowsMap.set(rowKey, {
              anno: yr,
              numero_ddt: num,
              riga_nr: rigaNr,
              um: String(r.UM ?? r.UnitaMisura ?? r.um ?? "NR.").trim(),
              quantita: parseSafeNum(r.Quantita ?? r.quantita, 1),
              descrizione: desc,
              prezzo: parseSafeNum(r.PrezzoUnit ?? r.Prezzo ?? r.prezzo),
              sconto_pct: parseSafeNum(r.Sconto ?? r.Sconto1 ?? r.sconto_pct),
              importo: parseSafeNum(r.Importo ?? r.importo),
              iva_pct: parseSafeNum(r.IVA ?? r.iva ?? r.iva_pct, 22),
              prezzo_acquisto: parseSafeNum(r.PrezzoAcquisto ?? r.prezzo_acquisto),
              prezzo_scontato: parseSafeNum(r.PrezzoScontato ?? r.prezzo_scontato),
              ricavo: parseSafeNum(r.Ricavo ?? r.ricavo),
            });
          }
        } catch {
          // Ignora singolo file se illeggibile
        }
      }
    }
  } catch {
    // 2026 folder opzionale
  }

  const allHeaders = Array.from(headerMap.values());
  const allRows = Array.from(rowsMap.values());
  const yearsSet = new Set<number>();
  for (const h of allHeaders) yearsSet.add(h.anno);

  return {
    totalHeaders: allHeaders.length,
    totalRows: allRows.length,
    yearsDetected: Array.from(yearsSet).sort(),
    headers: allHeaders,
    rows: allRows,
    errors,
  };
}

export async function uploadDdtToSupabase(
  headers: ParsedDdtHeader[],
  rows: ParsedDdtRow[],
  projectUrl: string,
  anonKey: string,
  onProgress?: (stage: string, processed: number, total: number) => void
): Promise<{ headersUploaded: number; rowsUploaded: number; failed: number }> {
  type CloudHeader = { id: string; anno: number; numero: number };
  type CloudLine = Pick<ParsedDdtRow, "anno" | "numero_ddt" | "riga_nr" | "descrizione">;
  const headerKey = (year: number, number: number) => `${year}_${number}`;
  const lineKey = (row: CloudLine) => JSON.stringify([
    row.anno, row.numero_ddt, row.riga_nr, String(row.descrizione ?? "").trim().toLowerCase(),
  ]);

  onProgress?.("Verifica DDT e righe esistenti su Supabase", 0, headers.length + rows.length);
  const [cloudHeaders, cloudLines] = await Promise.all([
    readCloudInventory<CloudHeader>(projectUrl, anonKey, "ddt", "id,anno,numero"),
    readCloudInventory<CloudLine>(projectUrl, anonKey, "ddt_righe", "anno,numero_ddt,riga_nr,descrizione"),
  ]);
  const headerIds = new Map(cloudHeaders.map((row) => [headerKey(row.anno, row.numero), row.id]));
  const missingHeaders = [...new Map(headers.map((row) => [headerKey(row.anno, row.numero), row])).values()]
    .filter((row) => !headerIds.has(headerKey(row.anno, row.numero)));

  const requestHeaders = {
    apikey: anonKey, "Content-Type": "application/json",
  };
  let headersUploaded = 0;
  let rowsUploaded = 0;
  let failed = 0;
  let refreshHeaders = false;
  const nowIso = new Date().toISOString();
  for (let offset = 0; offset < missingHeaders.length; offset += 200) {
    const chunk = await Promise.all(missingHeaders.slice(offset, offset + 200).map(async (h) => ({
      id: await deterministicUuid(`last:ddt:${headerKey(h.anno, h.numero)}`),
      numero: h.numero,
      anno: h.anno,
      data: h.data,
      cliente: h.cliente,
      indirizzo: h.indirizzo ?? null,
      citta: h.citta ?? null,
      pagamento: h.pagamento ?? null,
      destinazione: h.destinazione ?? null,
      citta_dest: h.citta_dest ?? null,
      nr_vs_ordine: h.nr_vs_ordine ?? null,
      causale: h.causale ?? null,
      porto: h.porto ?? null,
      aspetto: h.aspetto ?? null,
      colli: h.colli ?? null,
      peso_kg: h.peso_kg ?? 0,
      vettore: h.vettore ?? null,
      operatore: h.operatore ?? null,
      note: h.note ?? null,
      totale_imponibile: h.totale_imponibile ?? 0,
      totale_iva: h.totale_iva ?? 0,
      totale_documento: h.totale_documento ?? 0,
      prezzo_acquisto_totale: h.prezzo_acquisto_totale ?? 0,
      ricavo: h.ricavo ?? 0,
      ricarico_totale: h.ricarico_totale ?? 0,
      sconto_totale: h.sconto_totale ?? 0,
      stato: h.stato || "confermato",
      piva: h.piva ?? null,
      cod_fiscale: h.cod_fiscale ?? null,
      sdi: h.sdi ?? null,
      ultima_modifica: nowIso,
    })));
    try {
      const response = await supabaseFetch(new URL("/rest/v1/ddt?on_conflict=anno,numero", projectUrl), {
        method: "POST",
        headers: { ...requestHeaders, Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify(chunk),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const inserted = await response.json() as CloudHeader[];
      if (!Array.isArray(inserted)) throw new Error("Risposta inserimento DDT non valida");
      for (const row of inserted) headerIds.set(headerKey(row.anno, row.numero), row.id);
      headersUploaded += inserted.length;
      refreshHeaders ||= inserted.length < chunk.length;
    } catch {
      failed += chunk.length;
    }
    onProgress?.("Invio Nuovi DDT", Math.min(offset + 200, missingHeaders.length), missingHeaders.length);
  }
  if (refreshHeaders) {
    const current = await readCloudInventory<CloudHeader>(projectUrl, anonKey, "ddt", "id,anno,numero");
    for (const row of current) headerIds.set(headerKey(row.anno, row.numero), row.id);
  }

  const existingLines = new Set(cloudLines.map(lineKey));
  const missingLines = [...new Map(rows.map((row) => [lineKey(row), row])).values()]
    .filter((row) => !existingLines.has(lineKey(row)));
  for (let offset = 0; offset < missingLines.length; offset += 300) {
    const candidates = missingLines.slice(offset, offset + 300);
    const chunk = [];
    for (const row of candidates) {
      const parent = headerIds.get(headerKey(row.anno, row.numero_ddt));
      if (!parent) {
        failed++;
        continue;
      }
      chunk.push({
        id: await deterministicUuid(`last:ddt-riga:${parent}:${lineKey(row)}`),
        ddt_id: parent,
        anno: row.anno, numero_ddt: row.numero_ddt, riga_nr: row.riga_nr,
        um: row.um ?? "", quantita: row.quantita, descrizione: row.descrizione, prezzo: row.prezzo ?? 0,
        sconto_pct: row.sconto_pct ?? 0, importo: row.importo ?? 0, iva_pct: Math.round(row.iva_pct ?? 22),
        prezzo_acquisto: row.prezzo_acquisto ?? 0, prezzo_scontato: row.prezzo_scontato ?? 0, ricavo: row.ricavo ?? 0,
      });
    }
    if (chunk.length) {
      try {
        const response = await supabaseFetch(new URL("/rest/v1/ddt_righe?on_conflict=id", projectUrl), {
          method: "POST",
          headers: { ...requestHeaders, Prefer: "resolution=ignore-duplicates,return=minimal" },
          body: JSON.stringify(chunk),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        rowsUploaded += chunk.length;
      } catch {
        failed += chunk.length;
      }
    }
    onProgress?.("Invio Nuove Righe Articoli", Math.min(offset + 300, missingLines.length), missingLines.length);
  }
  return { headersUploaded, rowsUploaded, failed };
}

/* =====================================================================
   4. SINCRONIZZAZIONE LOCALE SQLITE LISTINI CLIENTI & SICUREZZA ROLLBACK
===================================================================== */

export async function backupLocalSqliteTable(table: string = "listini_clienti"): Promise<number> {
  const db = await getDatabase();
  // Crea o aggiorna una tabella di backup congelata
  await db.execute(`DROP TABLE IF EXISTS ${table}_migration_safety_backup;`);
  await db.execute(`CREATE TABLE ${table}_migration_safety_backup AS SELECT * FROM ${table};`);
  const res = await db.select<{ count: number }[]>(`SELECT COUNT(*) as count FROM ${table}_migration_safety_backup;`);
  return res[0]?.count ?? 0;
}

export async function restoreLocalSqliteTable(table: string = "listini_clienti"): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${table};`);
  await db.execute(`INSERT INTO ${table} SELECT * FROM ${table}_migration_safety_backup;`);
}

export async function downloadSupabaseSnapshot(
  projectUrl: string,
  anonKey: string,
  table: string,
  onProgress?: (count: number) => void
): Promise<Record<string, unknown>[]> {
  return readCloudInventory<Record<string, unknown>>(projectUrl, anonKey, table, "*", onProgress);
}

export function saveJsonToFileLocally(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function restoreSupabaseSnapshot(
  projectUrl: string,
  anonKey: string,
  table: string,
  records: Record<string, unknown>[],
  onProgress?: (current: number, total: number) => void
): Promise<{ restored: number; failed: number }> {
  const { inserted, updated, failed } = await writePriceListBatches(projectUrl, anonKey, table, records, onProgress);
  return { restored: inserted + updated, failed };
}

export async function syncClientRowsToLocalSqlite(
  rows: ParsedListinoClienteRow[],
  onProgress?: (processed: number, total: number) => void
): Promise<void> {
  const imported = mergeClientImportRows(rows);
  if (imported.length === 0) {
    onProgress?.(0, 0);
    return;
  }

  if (isTauri()) {
    const CHUNK_SIZE = 5000;
    for (let i = 0; i < imported.length; i += CHUNK_SIZE) {
      const chunk = imported.slice(i, i + CHUNK_SIZE).map((r) => ({
        cloud_id: r.cloudId ?? null,
        cliente: r.cliente,
        descrizione: r.descrizione,
        prezzo_fattura: r.prezzo_fattura ?? null,
        prezzo_acquisto: r.prezzo_acquisto ?? null,
        acquisto_old: r.acquisto_old ?? "",
        ricarico: r.ricarico ?? null,
        note: r.note ?? null,
        note1: r.note1 ?? null,
        note2: r.note2 ?? null,
      }));
      await invoke("sync_client_price_lists_to_local", { rows: chunk });
      onProgress?.(Math.min(i + CHUNK_SIZE, imported.length), imported.length);
    }
    return;
  }

  const db = await getDatabase();
  const nowIso = new Date().toISOString();
  const existingRows = await db.select<{ id: string | null; cliente: string; descrizione: string }[]>(
    "SELECT id, cliente, descrizione FROM listini_clienti"
  );
  const existingByKey = new Map<string, string[]>();
  const usedIds = new Set<string>();
  for (const row of existingRows) {
    if (!row.id) continue;
    usedIds.add(row.id);
    const key = `${row.cliente.trim().toLowerCase()}___${row.descrizione.trim().toLowerCase()}`;
    const list = existingByKey.get(key);
    if (list) list.push(row.id);
    else existingByKey.set(key, [row.id]);
  }

  const BATCH_SIZE = 250;
  for (let i = 0; i < imported.length; i += BATCH_SIZE) {
    const chunk = imported.slice(i, i + BATCH_SIZE);
    for (let j = 0; j < chunk.length; j++) {
      const r = chunk[j];
      const purchaseText = r.acquisto_old?.trim() ? r.acquisto_old : null;
      const key = `${r.cliente.trim().toLowerCase()}___${r.descrizione.trim().toLowerCase()}`;
      const matchedIds = existingByKey.get(key);

      if (matchedIds && matchedIds.length > 0) {
        for (const id of matchedIds) {
          await db.execute(
            `UPDATE listini_clienti SET
              prezzo_fattura = COALESCE($1, prezzo_fattura),
              prezzo_acquisto = COALESCE($2, prezzo_acquisto),
              acquisto_old = COALESCE($3, acquisto_old),
              ricarico = COALESCE($4, ricarico),
              note = $5,
              note1 = $6,
              note2 = $7,
              updated_at = $8
            WHERE id = $9 AND sync_revision IS NULL;`,
            [
              r.prezzo_fattura ?? null,
              r.prezzo_acquisto ?? null,
              purchaseText,
              r.ricarico ?? null,
              r.note ?? null,
              r.note1 ?? null,
              r.note2 ?? null,
              nowIso,
              id,
            ]
          );
        }
      } else {
        let newId = r.cloudId != null ? `cli_${r.cloudId}` : `new_mig_${crypto.randomUUID()}`;
        if (usedIds.has(newId)) {
          newId = `new_mig_${crypto.randomUUID()}`;
        }
        usedIds.add(newId);
        await db.execute(
          `INSERT INTO listini_clienti (
            id, cliente, descrizione, prezzo_fattura, prezzo_acquisto, acquisto_old,
            ricarico, note, note1, note2, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);`,
          [
            newId,
            r.cliente,
            r.descrizione,
            r.prezzo_fattura ?? null,
            r.prezzo_acquisto ?? null,
            purchaseText,
            r.ricarico ?? null,
            r.note ?? null,
            r.note1 ?? null,
            r.note2 ?? null,
            nowIso,
            nowIso,
          ]
        );
        existingByKey.set(key, [newId]);
      }
    }

    onProgress?.(Math.min(i + BATCH_SIZE, imported.length), imported.length);
  }
}

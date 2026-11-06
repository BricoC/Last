import { invoke } from "@tauri-apps/api/core";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { getDatabase } from "@/shared/data-layer/database";

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

export async function getSupabaseConfig(): Promise<{ projectUrl: string; anonKey: string }> {
  const status = await invoke<SupabaseConfigStatus>("load_supabase_config");
  if (!status.config || !status.config.projectUrl || !status.config.anonKey) {
    throw new Error("Configurazione Supabase mancante in supabase.local.json");
  }
  return status.config;
}

/**
 * Legge un file in base64 e lo decodifica in testo con supporto trasparente a UTF-8 o Windows-1252
 */
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

/**
 * Normalizza un valore numerico in modo sicuro per Postgres (identico a NoManV1)
 */
export function parseSafeNum(val: unknown, defaultVal: number = 0): number {
  if (val === null || val === undefined || val === "") return defaultVal;
  if (typeof val === "number") return isNaN(val) ? defaultVal : val;
  const s = String(val).replace(/,/g, ".").replace(/[^\d.-]/g, "");
  const num = parseFloat(s);
  return isNaN(num) ? defaultVal : num;
}

export function normalizeArtCode(val: unknown): string {
  if (val === null || val === undefined || val === "" || val === 0 || val === "0") return "";
  return String(val).trim();
}

/**
 * Parser universale per date (ISO, IT, USA, con/senza separatori) identico a NoManV1 ddtUtils
 */
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
        // In NoMan format is M/D/YYYY from Excel or D/M/YYYY
        if (p0 <= 12 && p1 <= 31) {
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
   1. SEZIONE: LISTINI CLIENTI (MODIFICATO CON TESTO ACQUISTO PROTETTO)
===================================================================== */

export interface ParsedListinoClienteRow {
  cloudId?: number;
  cliente: string;
  fileName: string;
  descrizione: string;
  prezzo_fattura: number;
  prezzo_acquisto: number;
  acquisto_old: string;
  ricarico: number;
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
        const descRaw = r.DESCRIZIONE ?? r.descrizione;
        if (descRaw == null) continue;
        const desc = String(descRaw).trim();
        if (!desc || desc === "0") continue;

        // FATTURA
        let prezzoFattura = 0;
        const fatRaw = r.FATTURA ?? r.prezzo_fattura;
        if (fatRaw != null && fatRaw !== "") {
          prezzoFattura = parseSafeNum(fatRaw);
        }

        // ACQUISTO (Preservato al 100% come testo in acquisto_old)
        const acqRaw = r.ACQUISTO ?? r.acquisto;
        const acquistoOldText = acqRaw != null ? String(acqRaw).trim() : "";
        const hasText = acquistoOldText !== "" && /[a-zA-Z]/.test(acquistoOldText);
        if (hasText) textAcquistoCount++;

        let prezzoAcquisto = 0;
        if (acquistoOldText && !hasText) {
          prezzoAcquisto = parseSafeNum(acquistoOldText);
        }

        let ricarico = 0;
        const ricRaw = r.RICARICO ?? r.ricarico;
        if (ricRaw != null && ricRaw !== "") {
          ricarico = parseSafeNum(ricRaw);
        }

        allRows.push({
          cliente: clienteWithPrefix,
          fileName: file.filename,
          descrizione: desc,
          prezzo_fattura: prezzoFattura,
          prezzo_acquisto: prezzoAcquisto,
          acquisto_old: acquistoOldText,
          ricarico: ricarico,
          note: r.NOTE ? String(r.NOTE).trim() : null,
          note1: r.NOTE1 ? String(r.NOTE1).trim() : null,
          note2: r.NOTE2 ? String(r.NOTE2).trim() : null,
          hasTextAcquisto: hasText,
        });
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

export async function uploadClientPriceListsToSupabase(
  rows: ParsedListinoClienteRow[],
  projectUrl: string,
  anonKey: string,
  onProgress?: (processed: number, total: number) => void
): Promise<{ inserted: number; updated: number; failed: number }> {
  // 1. Fetch cloud map by key
  const cloudMap = new Map<string, { id: number }>();
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const res = await fetch(
      `${projectUrl}/rest/v1/listini_clienti?select=id,cliente,descrizione&limit=${PAGE_SIZE}&offset=${offset}`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
    );
    if (!res.ok) break;
    const data = (await res.json()) as { id: number; cliente: string; descrizione: string }[];
    if (data.length === 0) break;
    for (const c of data) {
      const k = `${String(c.cliente || "").trim().toLowerCase()}___${String(c.descrizione || "").trim().toLowerCase()}`;
      cloudMap.set(k, { id: c.id });
    }
    offset += data.length;
    if (data.length < PAGE_SIZE) break;
  }

  const nowIso = new Date().toISOString();
  const toUpsert: Record<string, unknown>[] = rows.map((r) => {
    const k = `${r.cliente.trim().toLowerCase()}___${r.descrizione.trim().toLowerCase()}`;
    const match = cloudMap.get(k);
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

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const BATCH_SIZE = 200;

  for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
    const chunk = toUpsert.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(`${projectUrl}/rest/v1/listini_clienti`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(chunk),
      });
      if (res.ok) {
        for (const item of chunk) {
          if (item.id != null) updated++;
          else inserted++;
        }
      } else {
        failed += chunk.length;
      }
    } catch {
      failed += chunk.length;
    }
    if (onProgress) onProgress(Math.min(i + BATCH_SIZE, toUpsert.length), toUpsert.length);
  }

  return { inserted, updated, failed };
}

/* =====================================================================
   2. SEZIONE: LISTINO GENERALE & LISTINI VARI (STESSA LOGICA NOMANV1)
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

  // 1. Lettura Listino Generale
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
      if (cat && cat.startsWith("LIST_")) continue; // Esclude righe non-generali

      rowsGenerale.push({
        cat,
        fornitore: r.FORNIT ? String(r.FORNIT).trim() : (r.fornitore ? String(r.fornitore).trim() : null),
        codice_articolo: normalizeArtCode(r.ART ?? r.codice_articolo),
        data: r.DATA != null ? String(r.DATA).trim() : null,
        descrizione: desc,
        um: r.UM ? String(r.UM).trim() : "NR.",
        perc_pub: parseSafeNum(r["% PUB"] ?? r["%PUB"] ?? r.perc_pub),
        prezzo_pubblico: parseSafeNum(r.PUBBLICO ?? r.prezzo_pubblico),
        perc_prof: parseSafeNum(r["% PROF"] ?? r["%PROF"] ?? r.perc_prof),
        prezzo_profess: parseSafeNum(r.PROFESS ?? r.prezzo_profess),
        perc_fatt: parseSafeNum(r["% FATT"] ?? r["%FATT"] ?? r.perc_fatt),
        prezzo_fattura: parseSafeNum(r.FATTURA ?? r.prezzo_fattura),
        prezzo_acquisto: parseSafeNum(r.ACQUISTO ?? r.prezzo_acquisto),
        aumento: parseSafeNum(r.AUMENTO ?? r.aumento),
        r1: parseSafeNum(r.R1 ?? r.r1),
        maga: parseSafeNum(r.MAGA ?? r.maga),
        r2: parseSafeNum(r.R2 ?? r.r2),
        perc_iva: parseSafeNum(r.IVA ?? r["%IVA"] ?? r.perc_iva, 0.22),
        note: r.NOTE ? String(r.NOTE).trim() : null,
        isVari: false,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Errore lettura Listino Generale (${generalFilePath}): ${msg}`);
  }

  // 2. Lettura Listini Vari (altri file nella cartella)
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
            perc_pub: parseSafeNum(r["% PUB"] ?? r["%PUB"] ?? r.perc_pub),
            prezzo_pubblico: parseSafeNum(r.PUBBLICO ?? r.prezzo_pubblico),
            perc_prof: parseSafeNum(r["% PROF"] ?? r["%PROF"] ?? r.perc_prof),
            prezzo_profess: parseSafeNum(r.PROFESS ?? r.prezzo_profess),
            perc_fatt: parseSafeNum(r["% FATT"] ?? r["%FATT"] ?? r.perc_fatt),
            prezzo_fattura: parseSafeNum(r.FATTURA ?? r.prezzo_fattura),
            prezzo_acquisto: parseSafeNum(r.ACQUISTO ?? r.prezzo_acquisto),
            aumento: parseSafeNum(r.AUMENTO ?? r.aumento),
            r1: parseSafeNum(r.R1 ?? r.r1),
            maga: parseSafeNum(r.MAGA ?? r.maga),
            r2: parseSafeNum(r.R2 ?? r.r2),
            perc_iva: parseSafeNum(r.IVA ?? r["%IVA"] ?? r.perc_iva, 0.22),
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
  let genInserted = 0;
  let genUpdated = 0;
  let varInserted = 0;
  let varUpdated = 0;
  let failed = 0;

  // 1. Invio Listino Generale
  if (rowsGenerale.length > 0) {
    const cloudMapGen = new Map<string, { id: number }>();
    let offset = 0;
    while (true) {
      const res = await fetch(
        `${projectUrl}/rest/v1/listino_generale?select=id,codice_articolo,descrizione&limit=1000&offset=${offset}`,
        { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
      );
      if (!res.ok) break;
      const data = (await res.json()) as { id: number; codice_articolo: string; descrizione: string }[];
      if (data.length === 0) break;
      for (const c of data) {
        const k = `${normalizeArtCode(c.codice_articolo)}___${String(c.descrizione || "").trim().toLowerCase()}`;
        cloudMapGen.set(k, { id: c.id });
      }
      offset += data.length;
      if (data.length < 1000) break;
    }

    const nowIso = new Date().toISOString();
    const toUpsert = rowsGenerale.map((r) => {
      const k = `${normalizeArtCode(r.codice_articolo)}___${r.descrizione.trim().toLowerCase()}`;
      const match = cloudMapGen.get(k);
      const payload: Record<string, unknown> = {
        cat: r.cat,
        fornitore: r.fornitore,
        codice_articolo: r.codice_articolo || null,
        data: r.data,
        descrizione: r.descrizione,
        um: r.um,
        perc_pub: r.perc_pub,
        prezzo_pubblico: r.prezzo_pubblico,
        perc_prof: r.perc_prof,
        prezzo_profess: r.prezzo_profess,
        perc_fatt: r.perc_fatt,
        prezzo_fattura: r.prezzo_fattura,
        prezzo_acquisto: r.prezzo_acquisto,
        aumento: r.aumento,
        r1: r.r1,
        maga: r.maga,
        r2: r.r2,
        perc_iva: r.perc_iva,
        note: r.note,
        modificato_da: "Migrazione Manuale Last",
        updated_at: nowIso,
      };
      if (match) payload.id = match.id;
      return payload;
    });

    const BATCH_SIZE = 250;
    for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
      const chunk = toUpsert.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch(`${projectUrl}/rest/v1/listino_generale`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(chunk),
        });
        if (res.ok) {
          for (const item of chunk) {
            if (item.id != null) genUpdated++;
            else genInserted++;
          }
        } else {
          failed += chunk.length;
        }
      } catch {
        failed += chunk.length;
      }
      if (onProgress) onProgress("Listino Generale", Math.min(i + BATCH_SIZE, toUpsert.length), toUpsert.length);
    }
  }

  // 2. Invio Listini Vari
  if (rowsVari.length > 0) {
    const cloudMapVar = new Map<string, { id: number }>();
    let offset = 0;
    while (true) {
      const res = await fetch(
        `${projectUrl}/rest/v1/listini_vari?select=id,codice_articolo,descrizione&limit=1000&offset=${offset}`,
        { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
      );
      if (!res.ok) break;
      const data = (await res.json()) as { id: number; codice_articolo: string; descrizione: string }[];
      if (data.length === 0) break;
      for (const c of data) {
        const k = `${normalizeArtCode(c.codice_articolo)}___${String(c.descrizione || "").trim().toLowerCase()}`;
        cloudMapVar.set(k, { id: c.id });
      }
      offset += data.length;
      if (data.length < 1000) break;
    }

    const nowIso = new Date().toISOString();
    const toUpsert = rowsVari.map((r) => {
      const k = `${normalizeArtCode(r.codice_articolo)}___${r.descrizione.trim().toLowerCase()}`;
      const match = cloudMapVar.get(k);
      const payload: Record<string, unknown> = {
        cat: r.cat,
        fornitore: r.fornitore,
        codice_articolo: r.codice_articolo || null,
        data: r.data,
        descrizione: r.descrizione,
        um: r.um,
        perc_pub: r.perc_pub,
        prezzo_pubblico: r.prezzo_pubblico,
        perc_prof: r.perc_prof,
        prezzo_profess: r.prezzo_profess,
        perc_fatt: r.perc_fatt,
        prezzo_fattura: r.prezzo_fattura,
        prezzo_acquisto: r.prezzo_acquisto,
        aumento: r.aumento,
        r1: r.r1,
        maga: r.maga,
        r2: r.r2,
        perc_iva: r.perc_iva,
        note: r.note,
        modificato_da: "Migrazione Manuale Last",
        updated_at: nowIso,
      };
      if (match) payload.id = match.id;
      return payload;
    });

    const BATCH_SIZE = 250;
    for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
      const chunk = toUpsert.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch(`${projectUrl}/rest/v1/listini_vari`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(chunk),
        });
        if (res.ok) {
          for (const item of chunk) {
            if (item.id != null) varUpdated++;
            else varInserted++;
          }
        } else {
          failed += chunk.length;
        }
      } catch {
        failed += chunk.length;
      }
      if (onProgress) onProgress("Listini Vari", Math.min(i + BATCH_SIZE, toUpsert.length), toUpsert.length);
    }
  }

  return { genInserted, genUpdated, varInserted, varUpdated, failed };
}

/* =====================================================================
   3. SEZIONE: DDT TESTATE E RIGHE ARTICOLI (STESSA LOGICA NOMANV1)
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
  const rowsList: ParsedDdtRow[] = [];
  const errors: string[] = [];

  // 1. Scansione Testate DDT
  try {
    const datiFiles = await invoke<FileItemInfo[]>("list_files_in_folder", {
      folderPath: datiFolderPath,
      extensions: ["csv"],
    });

    for (let i = 0; i < datiFiles.length; i++) {
      const f = datiFiles[i];
      if (onProgress) onProgress(`Lettura CSV Testate (${f.filename})`, i + 1, datiFiles.length);

      try {
        const text = await readTextFileLossless(f.path);
        const parsed = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });

        // Estrai anno di default dal nome file (es. "2026 DDTDati.csv" o "1 2026.01.02 ...")
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
        errors.push(`Errore nel file DDT ${f.filename}: ${msg}`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Errore lettura cartella DDTDati: ${msg}`);
  }

  // 2. Scansione Righe DDTArticoli
  try {
    const artFiles = await invoke<FileItemInfo[]>("list_files_in_folder", {
      folderPath: articoliFolderPath,
      extensions: ["csv"],
    });

    for (let i = 0; i < artFiles.length; i++) {
      const f = artFiles[i];
      if (onProgress) onProgress(`Lettura CSV Articoli (${f.filename})`, i + 1, artFiles.length);

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

          rowsList.push({
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
        errors.push(`Errore nel file DDTArticoli ${f.filename}: ${msg}`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Errore lettura cartella DDTArticoli: ${msg}`);
  }

  const allHeaders = Array.from(headerMap.values());
  const yearsSet = new Set<number>();
  for (const h of allHeaders) yearsSet.add(h.anno);

  return {
    totalHeaders: allHeaders.length,
    totalRows: rowsList.length,
    yearsDetected: Array.from(yearsSet).sort(),
    headers: allHeaders,
    rows: rowsList,
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
  let headersUploaded = 0;
  let rowsUploaded = 0;
  let failed = 0;

  // 1. Invio Testate DDT con onConflict(anno, numero)
  const HEADER_BATCH = 200;
  const nowIso = new Date().toISOString();

  for (let i = 0; i < headers.length; i += HEADER_BATCH) {
    const chunk = headers.slice(i, i + HEADER_BATCH).map((h) => ({
      numero: h.numero,
      anno: h.anno,
      data: h.data,
      cliente: h.cliente,
      indirizzo: h.indirizzo,
      citta: h.citta,
      pagamento: h.pagamento,
      destinazione: h.destinazione,
      citta_dest: h.citta_dest,
      nr_vs_ordine: h.nr_vs_ordine,
      causale: h.causale,
      porto: h.porto,
      aspetto: h.aspetto,
      colli: h.colli,
      peso_kg: h.peso_kg,
      vettore: h.vettore,
      operatore: h.operatore,
      note: h.note,
      totale_imponibile: h.totale_imponibile,
      totale_iva: h.totale_iva,
      totale_documento: h.totale_documento,
      prezzo_acquisto_totale: h.prezzo_acquisto_totale,
      ricavo: h.ricavo,
      ricarico_totale: h.ricarico_totale,
      sconto_totale: h.sconto_totale,
      stato: h.stato || "confermato",
      ultima_modifica: nowIso,
    }));

    try {
      const res = await fetch(`${projectUrl}/rest/v1/ddt`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(chunk),
      });
      if (res.ok) {
        headersUploaded += chunk.length;
      } else {
        failed += chunk.length;
      }
    } catch {
      failed += chunk.length;
    }
    if (onProgress) onProgress("Testate DDT", Math.min(i + HEADER_BATCH, headers.length), headers.length);
  }

  // 2. Fetch ddt_id map from Supabase to attach ddt_id to rows
  const ddtIdMap = new Map<string, number>();
  let offset = 0;
  while (true) {
    const res = await fetch(
      `${projectUrl}/rest/v1/ddt?select=id,anno,numero&limit=1000&offset=${offset}`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
    );
    if (!res.ok) break;
    const data = (await res.json()) as { id: number; anno: number; numero: number }[];
    if (data.length === 0) break;
    for (const d of data) {
      ddtIdMap.set(`${d.anno}_${d.numero}`, d.id);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }

  // 3. Invio Righe Articoli DDT
  const rowsPayload = rows.map((r) => {
    const parentId = ddtIdMap.get(`${r.anno}_${r.numero_ddt}`);
    return {
      ddt_id: parentId || null,
      anno: r.anno,
      numero_ddt: r.numero_ddt,
      riga_nr: r.riga_nr,
      um: r.um,
      quantita: r.quantita,
      descrizione: r.descrizione,
      prezzo: r.prezzo,
      sconto_pct: r.sconto_pct,
      importo: r.importo,
      iva_pct: r.iva_pct,
      prezzo_acquisto: r.prezzo_acquisto,
      prezzo_scontato: r.prezzo_scontato,
      ricavo: r.ricavo,
    };
  });

  const ROW_BATCH = 300;
  for (let i = 0; i < rowsPayload.length; i += ROW_BATCH) {
    const chunk = rowsPayload.slice(i, i + ROW_BATCH);
    try {
      const res = await fetch(`${projectUrl}/rest/v1/ddt_righe`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(chunk),
      });
      if (res.ok) {
        rowsUploaded += chunk.length;
      } else {
        failed += chunk.length;
      }
    } catch {
      failed += chunk.length;
    }
    if (onProgress) onProgress("Righe Articoli DDT", Math.min(i + ROW_BATCH, rowsPayload.length), rowsPayload.length);
  }

  return { headersUploaded, rowsUploaded, failed };
}

/* =====================================================================
   4. SINCRONIZZAZIONE LOCALE SQLITE PER TUTTI I LISTINI
===================================================================== */

export async function syncClientRowsToLocalSqlite(
  rows: ParsedListinoClienteRow[],
  onProgress?: (processed: number, total: number) => void
): Promise<void> {
  const db = await getDatabase();
  const nowIso = new Date().toISOString();
  const BATCH_SIZE = 250;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);

    for (const r of chunk) {
      await db.execute(
        `INSERT INTO listini_clienti (
          cliente, descrizione, prezzo_fattura, prezzo_acquisto, acquisto_old,
          ricarico, note, note1, note2, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT(cliente, descrizione) DO UPDATE SET
          prezzo_fattura = excluded.prezzo_fattura,
          prezzo_acquisto = excluded.prezzo_acquisto,
          acquisto_old = excluded.acquisto_old,
          ricarico = excluded.ricarico,
          note = excluded.note,
          note1 = excluded.note1,
          note2 = excluded.note2,
          updated_at = excluded.updated_at;`,
        [
          r.cliente,
          r.descrizione,
          r.prezzo_fattura,
          r.prezzo_acquisto,
          r.acquisto_old || null,
          r.ricarico,
          r.note ?? null,
          r.note1 ?? null,
          r.note2 ?? null,
          nowIso,
        ]
      ).catch(async () => {
        await db.execute(
          `UPDATE listini_clienti SET
            prezzo_fattura = $1,
            prezzo_acquisto = $2,
            acquisto_old = $3,
            ricarico = $4,
            note = $5,
            note1 = $6,
            note2 = $7,
            updated_at = $8
          WHERE cliente = $9 AND descrizione = $10;`,
          [
            r.prezzo_fattura,
            r.prezzo_acquisto,
            r.acquisto_old || null,
            r.ricarico,
            r.note ?? null,
            r.note1 ?? null,
            r.note2 ?? null,
            nowIso,
            r.cliente,
            r.descrizione,
          ]
        );
      });
    }

    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, rows.length), rows.length);
    }
  }
}

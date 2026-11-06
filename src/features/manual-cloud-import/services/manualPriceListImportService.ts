import { invoke } from "@tauri-apps/api/core";
import * as XLSX from "xlsx";
import { getDatabase } from "@/shared/data-layer/database";

export interface ExcelFileInfo {
  filename: string;
  path: string;
  size_bytes: number;
}

export interface ParsedListinoRow {
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

export interface AnalysisResult {
  totalFiles: number;
  skippedFiles: string[];
  totalRows: number;
  textAcquistoCount: number;
  clientsCount: number;
  rows: ParsedListinoRow[];
  errors: string[];
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
    throw new Error("Configurazione Supabase non trovata in supabase.local.json");
  }
  return status.config;
}

/**
 * Scansiona e analizza tutti i file Excel della cartella specificata.
 */
export async function scanAndParseLocalFiles(
  folderPath: string = "D:\\BricoClassFiles\\Offline\\ListiniClienti",
  ignoreOneDriveConflicts: boolean = true,
  onProgress?: (current: number, total: number, filename: string) => void
): Promise<AnalysisResult> {
  const fileList = await invoke<ExcelFileInfo[]>("list_excel_files_in_folder", {
    folderPath: folderPath.trim() || undefined,
  });

  const validFiles: ExcelFileInfo[] = [];
  const skippedFiles: string[] = [];

  for (const f of fileList) {
    const fn = f.filename;
    if (fn.startsWith("~$") || fn.startsWith("000 Modulo") || fn === ".xls" || fn === ".xlsx") {
      skippedFiles.push(fn);
      continue;
    }
    if (ignoreOneDriveConflicts && fn.includes("-DESKTOP-")) {
      skippedFiles.push(fn + " (conflitto OneDrive saltato)");
      continue;
    }
    validFiles.push(f);
  }

  const allRows: ParsedListinoRow[] = [];
  const errors: string[] = [];
  const clientsSet = new Set<string>();
  let textAcquistoCount = 0;

  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    if (onProgress) {
      onProgress(i + 1, validFiles.length, file.filename);
    }

    try {
      const base64Str = await invoke<string>("read_single_excel_file_base64", {
        filePath: file.path,
      });

      // Decodifica binaria SheetJS
      const binaryStr = atob(base64Str);
      const wb = XLSX.read(binaryStr, { type: "binary" });
      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        skippedFiles.push(file.filename + " (nessun foglio trovato)");
        continue;
      }

      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });

      const clientNameOnly = file.filename.replace(/\.(xls|xlsx)$/i, "").trim();
      const clienteWithPrefix = "LIST_" + clientNameOnly;
      clientsSet.add(clienteWithPrefix);

      for (const r of rawData) {
        const descRaw = r.DESCRIZIONE ?? r.descrizione;
        if (descRaw == null) continue;
        const desc = String(descRaw).trim();
        if (!desc || desc === "0") continue;

        // FATTURA (prezzo di vendita)
        let prezzoFattura = 0;
        const fatRaw = r.FATTURA ?? r.prezzo_fattura;
        if (fatRaw != null && fatRaw !== "") {
          const s = String(fatRaw).replace(",", ".").trim();
          const n = parseFloat(s);
          if (!isNaN(n)) prezzoFattura = n;
        }

        // ACQUISTO (il testo storico originale salvato INTATTO in acquisto_old)
        const acqRaw = r.ACQUISTO ?? r.acquisto;
        const acquistoOldText = acqRaw != null ? String(acqRaw).trim() : "";
        const hasText = acquistoOldText !== "" && /[a-zA-Z]/.test(acquistoOldText);
        if (hasText) {
          textAcquistoCount++;
        }

        // PREZZO ACQUISTO (valore numerico calcolato SOLO se non contiene testo corrotto)
        let prezzoAcquisto = 0;
        if (acquistoOldText && !hasText) {
          const cleanNum = acquistoOldText.replace(",", ".").replace(/[^\d.]/g, "");
          const n = parseFloat(cleanNum);
          if (!isNaN(n)) prezzoAcquisto = n;
        }

        // RICARICO
        let ricarico = 0;
        const ricRaw = r.RICARICO ?? r.ricarico;
        if (ricRaw != null && ricRaw !== "") {
          const s = String(ricRaw).replace(",", ".").replace(/[^\d.]/g, "");
          const n = parseFloat(s);
          if (!isNaN(n)) ricarico = n;
        }

        const note = r.NOTE ? String(r.NOTE).trim() : null;
        const note1 = r.NOTE1 ? String(r.NOTE1).trim() : null;
        const note2 = r.NOTE2 ? String(r.NOTE2).trim() : null;

        allRows.push({
          cliente: clienteWithPrefix,
          fileName: file.filename,
          descrizione: desc,
          prezzo_fattura: prezzoFattura,
          prezzo_acquisto: prezzoAcquisto,
          acquisto_old: acquistoOldText,
          ricarico: ricarico,
          note,
          note1,
          note2,
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

export interface CloudPriceListHeader {
  id: number;
  cliente: string;
  descrizione: string;
  acquisto_old: string | null;
  prezzo_fattura: number | null;
}

/**
 * Scarica la mappatura delle righe presenti attualmente su Supabase table listini_clienti
 */
export async function fetchCloudPriceListMap(
  projectUrl: string,
  anonKey: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<Map<string, CloudPriceListHeader>> {
  const map = new Map<string, CloudPriceListHeader>();
  const PAGE_SIZE = 1000;
  let offset = 0;
  let totalRows = Infinity;

  while (offset < totalRows) {
    const url = new URL("/rest/v1/listini_clienti", projectUrl);
    url.searchParams.set("select", "id,cliente,descrizione,acquisto_old,prezzo_fattura");
    url.searchParams.set("order", "id.asc");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url.toString(), {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Range-Unit": "items",
        Prefer: "count=exact",
      },
    });

    if (!res.ok) {
      throw new Error(`Errore fetch Supabase listini_clienti: ${res.status} ${res.statusText}`);
    }

    const contentRange = res.headers.get("content-range");
    if (contentRange) {
      const parts = contentRange.split("/");
      if (parts[1]) {
        const parsed = parseInt(parts[1], 10);
        if (!isNaN(parsed)) totalRows = parsed;
      }
    }

    const pageData = (await res.json()) as CloudPriceListHeader[];
    if (pageData.length === 0) break;

    for (const item of pageData) {
      const key = `${String(item.cliente || "").trim().toLowerCase()}___${String(item.descrizione || "").trim().toLowerCase()}`;
      map.set(key, item);
    }

    offset += pageData.length;
    if (onProgress) {
      onProgress(map.size, totalRows === Infinity ? map.size : totalRows);
    }
  }

  return map;
}

export interface UploadBatchStats {
  totalProcessed: number;
  inserted: number;
  updated: number;
  failed: number;
  errorMessages: string[];
}

/**
 * Carica o aggiorna i listini clienti su Supabase in batch controllati
 */
export async function uploadRowsToSupabase(
  rows: ParsedListinoRow[],
  cloudMap: Map<string, CloudPriceListHeader>,
  projectUrl: string,
  anonKey: string,
  onProgress?: (processed: number, total: number, stats: UploadBatchStats) => void
): Promise<UploadBatchStats> {
  const stats: UploadBatchStats = {
    totalProcessed: 0,
    inserted: 0,
    updated: 0,
    failed: 0,
    errorMessages: [],
  };

  const toUpsert: Record<string, unknown>[] = [];
  const nowIso = new Date().toISOString();

  for (const r of rows) {
    const key = `${r.cliente.trim().toLowerCase()}___${r.descrizione.trim().toLowerCase()}`;
    const cloudMatch = cloudMap.get(key);

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

    if (cloudMatch) {
      payload.id = cloudMatch.id;
    }

    toUpsert.push(payload);
  }

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

      if (!res.ok) {
        const errText = await res.text();
        stats.failed += chunk.length;
        stats.errorMessages.push(`Batch ${i / BATCH_SIZE + 1} fallito: ${res.status} - ${errText}`);
      } else {
        for (const item of chunk) {
          if (item.id != null) {
            stats.updated++;
          } else {
            stats.inserted++;
          }
        }
      }
    } catch (err: unknown) {
      stats.failed += chunk.length;
      const msg = err instanceof Error ? err.message : String(err);
      stats.errorMessages.push(`Batch ${i / BATCH_SIZE + 1} eccezione di rete: ${msg}`);
    }

    stats.totalProcessed += chunk.length;
    if (onProgress) {
      onProgress(stats.totalProcessed, toUpsert.length, stats);
    }
  }

  return stats;
}

/**
 * Salva i dati analizzati anche nel database SQLite locale
 */
export async function syncRowsToLocalSqlite(
  rows: ParsedListinoRow[],
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
        // Se non c'è UNIQUE(cliente, descrizione), fa fallback su update per cliente e descrizione
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

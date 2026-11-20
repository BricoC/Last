import { getDatabase } from "@/shared/data-layer/database";
import { deterministicUuid } from "@/shared/utils/deterministicUuid";
import {
  scanAndParseClientPriceLists,
  scanAndParseGeneralPriceLists,
  type ParsedListinoClienteRow,
  type ParsedListinoGeneraleRow,
} from "@/features/manual-cloud-import/services/manualPriceListImportService";
import { priceListRepository } from "@/features/price-lists/services/priceListRepository";
import { priceListSyncService } from "@/features/price-lists/services/priceListSyncService";
import type {
  ListinoClienteRow,
  ListinoGeneraleRow,
} from "@/features/price-lists/models/priceList";

export const ONEDRIVE_CLIENTI_DIR = "D:\\BricoClassFiles\\OneDrive\\ListiniClienti";
export const ONEDRIVE_GENERALE_FILE =
  "D:\\BricoClassFiles\\OneDrive\\Listini\\Listini Generali\\LISTINO GENERALE.xlsm";
export const ONEDRIVE_GENERALI_DIR =
  "D:\\BricoClassFiles\\OneDrive\\Listini\\Listini Generali";

export type DiffStatus = "new" | "updated";

export interface GeneralDiffItem {
  key: string;
  status: DiffStatus;
  existingId?: string;
  parsed: ParsedListinoGeneraleRow;
  existingSummary?: string;
}

export interface GeneralOneDriveAnalysis {
  totalParsed: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  diffItems: GeneralDiffItem[];
  errors: string[];
}

export interface ClientDiffItem {
  key: string;
  status: DiffStatus;
  existingId?: string;
  existingRow?: ListinoClienteRow;
  parsed: ParsedListinoClienteRow;
  existingSummary?: string;
  existingFattura?: number | null;
  existingAcquisto?: number | null;
  existingAcquistoOld?: string | null;
  changeBadges?: string[];
}

export interface ClientOneDriveAnalysis {
  totalFiles: number;
  skippedFiles: string[];
  clientsCount: number;
  totalParsed: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  diffItems: ClientDiffItem[];
  errors: string[];
}

function normText(v?: string | null): string {
  return (v || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function normUnit(v?: string | null): string {
  return normText(v).replace(/\.+$/, "");
}

function normCode(v?: string | null): string {
  const c = normText(v);
  return c === "0" ? "" : c;
}

function numChanged(a?: number | null, b?: number | null): boolean {
  const na = a ?? 0;
  const nb = b ?? 0;
  return Math.abs(na - nb) > 0.001;
}

function strChanged(a?: string | null, b?: string | null): boolean {
  return normText(a) !== normText(b);
}

function buildGeneralKey(
  sourceTable: string,
  cat: string | null | undefined,
  descrizione: string,
  codice?: string | null
): string {
  return `${sourceTable}|${normText(cat)}|${normText(descrizione)}|${normText(codice)}`;
}

function buildGeneralFallbackKey(
  sourceTable: string,
  cat: string | null | undefined,
  descrizione: string
): string {
  return `${sourceTable}|${normText(cat)}|${normText(descrizione)}`;
}

export async function analyzeOneDriveGeneralLists(
  onProgress?: (stage: string, current: number, total: number) => void
): Promise<GeneralOneDriveAnalysis> {
  const parsedRes = await scanAndParseGeneralPriceLists(
    ONEDRIVE_GENERALE_FILE,
    ONEDRIVE_GENERALI_DIR,
    onProgress
  );

  const db = await getDatabase();
  const existingRows = await db.select<ListinoGeneraleRow[]>(
    `SELECT id, source_table, cat, fornitore, codice_articolo, data_ref, descrizione, um,
            perc_pub, prezzo_pubblico, perc_prof, prezzo_profess, perc_fatt, prezzo_fattura,
            prezzo_acquisto, aumento, r1, maga, r2, perc_iva, note
     FROM listino_generale`
  );

  const exactMap = new Map<string, ListinoGeneraleRow>();
  const fallbackMap = new Map<string, ListinoGeneraleRow>();
  for (const row of existingRows) {
    const src = row.source_table || "listino_generale";
    exactMap.set(buildGeneralKey(src, row.cat, row.descrizione, row.codice_articolo), row);
    const fb = buildGeneralFallbackKey(src, row.cat, row.descrizione);
    if (!fallbackMap.has(fb)) fallbackMap.set(fb, row);
  }

  const allParsed = [...parsedRes.rowsGenerale, ...parsedRes.rowsVari];
  const seenKeys = new Set<string>();
  const diffItems: GeneralDiffItem[] = [];
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const p of allParsed) {
    const src = p.isVari ? "listini_vari" : "listino_generale";
    const key = buildGeneralKey(src, p.cat, p.descrizione, p.codice_articolo);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const existing =
      exactMap.get(key) ??
      fallbackMap.get(buildGeneralFallbackKey(src, p.cat, p.descrizione));

    if (!existing) {
      newCount++;
      diffItems.push({ key, status: "new", parsed: p });
      continue;
    }

    const pubDiff = numChanged(p.prezzo_pubblico, existing.prezzo_pubblico);
    const profDiff = numChanged(p.prezzo_profess, existing.prezzo_profess);
    const fattDiff = numChanged(p.prezzo_fattura, existing.prezzo_fattura);
    const acqDiff = numChanged(p.prezzo_acquisto, existing.prezzo_acquisto);
    const fornDiff = strChanged(p.fornitore, existing.fornitore);
    const codDiff = normCode(p.codice_articolo) !== normCode(existing.codice_articolo);
    const umDiff = normUnit(p.um) !== normUnit(existing.um);

    const changed = pubDiff || profDiff || fattDiff || acqDiff || fornDiff || codDiff || umDiff;

    if (changed) {
      updatedCount++;
      const diffs: string[] = [];
      if (fattDiff) diffs.push(`Fatt: ${existing.prezzo_fattura != null ? `€${existing.prezzo_fattura.toFixed(2)}` : "-"}`);
      if (acqDiff) diffs.push(`Acq: ${existing.prezzo_acquisto != null ? `€${existing.prezzo_acquisto.toFixed(2)}` : "-"}`);
      if (pubDiff) diffs.push(`Pub: ${existing.prezzo_pubblico != null ? `€${existing.prezzo_pubblico.toFixed(2)}` : "-"}`);
      if (profDiff) diffs.push(`Prof: ${existing.prezzo_profess != null ? `€${existing.prezzo_profess.toFixed(2)}` : "-"}`);
      if (fornDiff) diffs.push(`Forn: ${existing.fornitore || "-"}`);
      if (codDiff) diffs.push(`Cod: ${existing.codice_articolo || "-"}`);
      if (umDiff) diffs.push(`UM: ${existing.um || "-"}`);
      diffItems.push({
        key,
        status: "updated",
        existingId: existing.id,
        parsed: p,
        existingSummary: diffs.join(" · "),
      });
    } else {
      unchangedCount++;
    }
  }

  return {
    totalParsed: allParsed.length,
    newCount,
    updatedCount,
    unchangedCount,
    diffItems,
    errors: parsedRes.errors,
  };
}

export async function importOneDriveGeneralDiffItems(
  items: GeneralDiffItem[]
): Promise<{ imported: number; cloudSynced: boolean; cloudError?: string }> {
  if (items.length === 0) return { imported: 0, cloudSynced: true };

  const now = new Date().toISOString();
  const rows: ListinoGeneraleRow[] = [];

  for (const item of items) {
    const p = item.parsed;
    const sourceTable = p.isVari ? "listini_vari" : "listino_generale";
    const id =
      item.existingId ||
      (await deterministicUuid(
        `onedrive-gen:${sourceTable}:${normText(p.cat)}:${normText(p.descrizione)}:${normText(p.codice_articolo)}`
      ));
    rows.push({
      id,
      source_table: sourceTable,
      cat: p.cat ?? null,
      fornitore: p.fornitore ?? null,
      codice_articolo: p.codice_articolo ?? null,
      data_ref: p.data ?? null,
      descrizione: p.descrizione,
      um: p.um || "NR.",
      perc_pub: p.perc_pub ?? null,
      prezzo_pubblico: p.prezzo_pubblico ?? null,
      perc_prof: p.perc_prof ?? null,
      prezzo_profess: p.prezzo_profess ?? null,
      perc_fatt: p.perc_fatt ?? null,
      prezzo_fattura: p.prezzo_fattura ?? null,
      prezzo_acquisto: p.prezzo_acquisto ?? null,
      aumento: p.aumento ?? null,
      r1: p.r1 ?? null,
      maga: p.maga ?? null,
      r2: p.r2 ?? null,
      perc_iva: p.perc_iva ?? 0.22,
      note: p.note ?? null,
      created_at: now,
      updated_at: now,
    });
  }

  await priceListRepository.saveGeneralRows(rows, "local");
  try {
    await priceListSyncService.retryPendingChanges();
    return { imported: rows.length, cloudSynced: true };
  } catch (err) {
    return {
      imported: rows.length,
      cloudSynced: false,
      cloudError: err instanceof Error ? err.message : String(err),
    };
  }
}

function buildClientKey(cliente: string, descrizione: string): string {
  return `${normText(cliente)}|${normText(descrizione)}`;
}

export async function analyzeOneDriveClientLists(
  onProgress?: (current: number, total: number, filename: string) => void
): Promise<ClientOneDriveAnalysis> {
  const parsedRes = await scanAndParseClientPriceLists(
    ONEDRIVE_CLIENTI_DIR,
    true,
    onProgress
  );

  const db = await getDatabase();
  const existingRows = await db.select<ListinoClienteRow[]>(
    `SELECT id, cliente, fornitore, codice_articolo, descrizione,
            prezzo_fattura, prezzo_acquisto, acquisto_eur, perc_acquisto,
            data_acquisto, acquisto_old, ricarico, data_ref, note, note1, note2
     FROM listini_clienti`
  );

  const existingMap = new Map<string, ListinoClienteRow>();
  for (const row of existingRows) {
    existingMap.set(buildClientKey(row.cliente, row.descrizione), row);
  }

  const seenKeys = new Set<string>();
  const diffItems: ClientDiffItem[] = [];
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const p of parsedRes.rows) {
    const key = buildClientKey(p.cliente, p.descrizione);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const existing = existingMap.get(key);
    if (!existing) {
      newCount++;
      diffItems.push({ key, status: "new", parsed: p });
      continue;
    }

    const fattDiff = numChanged(p.prezzo_fattura, existing.prezzo_fattura);
    // Una cella ACQUISTO è numerica pura solo se non contiene lettere, parentesi o spazi tra cifre (es. "13 8,53 (5)" o "(06) 0,532")
    const isPureNumericAcquisto =
      !p.hasTextAcquisto &&
      Boolean(p.acquisto_old) &&
      /^[+-]?[\d.,]+(\s*€)?$/.test(p.acquisto_old.trim());
    const acqNumDiff = isPureNumericAcquisto && numChanged(p.prezzo_acquisto, existing.prezzo_acquisto);
    const acqOldDiff = strChanged(p.acquisto_old, existing.acquisto_old);
    const changed = fattDiff || acqNumDiff || acqOldDiff;

    if (changed) {
      updatedCount++;
      const diffs: string[] = [];
      const changeBadges: string[] = [];
      if (fattDiff) {
        const oldVal = existing.prezzo_fattura != null ? `€${existing.prezzo_fattura.toFixed(2)}` : "—";
        const newVal = p.prezzo_fattura != null ? `€${p.prezzo_fattura.toFixed(2)}` : "—";
        diffs.push(`Fatt: ${oldVal}`);
        changeBadges.push(`Fattura: ${oldVal} → ${newVal}`);
      }
      if (acqNumDiff) {
        const oldVal = existing.prezzo_acquisto != null ? `€${existing.prezzo_acquisto.toFixed(2)}` : "—";
        const newVal = p.prezzo_acquisto != null ? `€${p.prezzo_acquisto.toFixed(2)}` : "—";
        diffs.push(`Acq€: ${oldVal}`);
        changeBadges.push(`Acq €: ${oldVal} → ${newVal}`);
      }
      if (acqOldDiff) {
        const oldVal = existing.acquisto_old || "—";
        const newVal = p.acquisto_old || "—";
        diffs.push(`AcqOld: ${oldVal}`);
        changeBadges.push(`Acquisto: ${oldVal} → ${newVal}`);
      }
      diffItems.push({
        key,
        status: "updated",
        existingId: existing.id,
        existingRow: existing,
        parsed: p,
        existingSummary: diffs.join(" · "),
        existingFattura: existing.prezzo_fattura ?? null,
        existingAcquisto: existing.prezzo_acquisto ?? null,
        existingAcquistoOld: existing.acquisto_old ?? null,
        changeBadges,
      });
    } else {
      unchangedCount++;
    }
  }

  return {
    totalFiles: parsedRes.totalFiles,
    skippedFiles: parsedRes.skippedFiles,
    clientsCount: parsedRes.clientsCount,
    totalParsed: parsedRes.totalRows,
    newCount,
    updatedCount,
    unchangedCount,
    diffItems,
    errors: parsedRes.errors,
  };
}

export async function importOneDriveClientDiffItems(
  items: ClientDiffItem[]
): Promise<{ imported: number; cloudSynced: boolean; cloudError?: string }> {
  if (items.length === 0) return { imported: 0, cloudSynced: true };

  const now = new Date().toISOString();
  const rows: ListinoClienteRow[] = [];

  for (const item of items) {
    const p = item.parsed;
    const ex = item.existingRow;
    const id =
      item.existingId ||
      (await deterministicUuid(
        `onedrive-cli:${normText(p.cliente)}:${normText(p.descrizione)}`
      ));
    const isPureNumericAcquisto =
      !p.hasTextAcquisto &&
      Boolean(p.acquisto_old) &&
      /^[+-]?[\d.,]+(\s*€)?$/.test(p.acquisto_old.trim());
    rows.push({
      id,
      cliente: p.cliente,
      fornitore: ex?.fornitore ?? null,
      codice_articolo: ex?.codice_articolo ?? null,
      descrizione: p.descrizione,
      prezzo_fattura: p.prezzo_fattura ?? null,
      prezzo_acquisto: isPureNumericAcquisto ? (p.prezzo_acquisto ?? null) : (ex?.prezzo_acquisto ?? null),
      acquisto_eur: ex?.acquisto_eur ?? null,
      perc_acquisto: ex?.perc_acquisto ?? null,
      data_acquisto: ex?.data_acquisto ?? null,
      acquisto_old: p.acquisto_old || null,
      ricarico: ex?.ricarico ?? (p.ricarico ?? null),
      data_ref: ex?.data_ref ?? null,
      note: p.note ?? ex?.note ?? null,
      note1: p.note1 ?? ex?.note1 ?? null,
      note2: p.note2 ?? ex?.note2 ?? null,
      created_at: ex?.created_at || now,
      updated_at: now,
    });
  }

  await priceListRepository.saveClientRows(rows, "local");
  try {
    await priceListSyncService.retryPendingChanges();
    return { imported: rows.length, cloudSynced: true };
  } catch (err) {
    return {
      imported: rows.length,
      cloudSynced: false,
      cloudError: err instanceof Error ? err.message : String(err),
    };
  }
}

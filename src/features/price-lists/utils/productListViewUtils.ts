import { ListinoGeneraleRow, PriceListLogEntry } from "../models/priceList";
import { parseItalianNumber } from "@/shared/utils/numberUtils";
import { formatPriceListInput } from "./priceListInput";
import { generalPriceHistoryFields, generalPriceVariation } from "./generalPriceHistory";
import type { BulkOperationPayload } from "../components/BulkEditToolbar";
import {
  round5,
  calculateR1,
  calculateR2,
  calculateCostoMaggiorato,
  calculatePrezzoFattura,
  calculatePercFattura,
  calculatePrezzoPubblico,
  calculatePercPubblico,
  calculatePrezzoProfess,
  calculatePercProfess,
} from "./priceFormulas";

export const PRODUCT_LIST_BATCH_SIZE = 150;

export const MGS_CODEC_FREQUENCIES = [
  "140.85",
  "140.96",
  "141.12",
  "141.80",
  "140.15",
  "141.52",
  "140.48",
];

export type ProductListSortField =
  | "descrizione"
  | "codice_articolo"
  | "fornitore"
  | "cat"
  | "data_ref"
  | "prezzo_fattura"
  | "prezzo_pubblico"
  | "prezzo_profess"
  | "prezzo_acquisto"
  | "costo_maggiorato";

// Ordine esatto colonne modificabili richiesto:
// ... | U.M. | % PUB | PUBBLICO | % PROF | PROFESS | % FATT | FATTURA | ACQUISTO BASE | IVA | AUMENTO % | MAGAZZINO % | ACQ. MAGG.
export const EDITABLE_COL_ORDER = [
  "cat",
  "fornitore",
  "codice_articolo",
  "descrizione",
  "um",
  "perc_pub",
  "prezzo_pubblico",
  "perc_prof",
  "prezzo_profess",
  "perc_fatt",
  "prezzo_fattura",
  "prezzo_acquisto", // tra fattura ed iva
  "perc_iva",
  "aumento", // dopo iva
  "maga", // dopo iva
] as const;

export type EditableColumnKey = (typeof EDITABLE_COL_ORDER)[number];

// Helper data odierna in formato aaaa.mm.gg
export function getTodayAaaaMmGg(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

// Helper formattazione qualsiasi data in aaaa.mm.gg
export function formatDateAaaaMmGg(rawDate: string | null | undefined): string {
  if (!rawDate) return "—";
  const str = String(rawDate).trim();
  if (!str) return "—";

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str.replace(/-/g, ".");
  }

  if (/^\d{4}\.\d{2}\.\d{2}$/.test(str)) {
    return str;
  }

  if (str.includes("T")) {
    const p = str.split("T")[0].split("-");
    if (p.length === 3) return `${p[0]}.${p[1]}.${p[2]}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [g, m, a] = str.split("/");
    return `${a}.${m}.${g}`;
  }

  if (/^\d{6}$/.test(str)) {
    const yy = str.slice(0, 2);
    const mm = str.slice(2, 4);
    const dd = str.slice(4, 6);
    const yyyy = Number(yy) > 50 ? `19${yy}` : `20${yy}`;
    return `${yyyy}.${mm}.${dd}`;
  }

  return str;
}

export function createBlankGeneralRow(): ListinoGeneraleRow {
  return {
    id: `new_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    source_table: "listino_generale",
    cat: "",
    fornitore: "",
    codice_articolo: "",
    data_ref: getTodayAaaaMmGg(),
    descrizione: "",
    um: "NR.",
    perc_pub: null,
    prezzo_pubblico: null,
    perc_prof: null,
    prezzo_profess: null,
    perc_fatt: null,
    prezzo_fattura: null,
    prezzo_acquisto: null,
    aumento: 0,
    r1: null,
    maga: 0,
    r2: null,
    perc_iva: 0.22,
    note: null,
  };
}

export function parseInputNumber(val: string): number | null {
  const num = parseItalianNumber(val);
  return num == null ? null : round5(num);
}

export function parseInputPercent(val: string): number | null {
  const num = parseInputNumber(val);
  if (num == null) return null;
  return round5(num / 100);
}

export function formatSellingPrice(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  return `€ ${Number(val).toLocaleString("it-IT", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })}`;
}

export function formatCostPrice(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  return `€ ${Number(val).toLocaleString("it-IT", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}`;
}

export function formatPercentClean(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  const pct = val * 100;
  const rounded = Math.round(pct * 100) / 100;
  return `${rounded.toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

export function getFormattedInitValue(val: any, col: string, char?: string): string {
  if (char !== undefined) return char;
  if (val == null) return "";
  if (col === "prezzo_pubblico" || col === "prezzo_profess" || col === "prezzo_fattura") {
    const n = Number(val);
    if (!isNaN(n)) return (Math.round(n * 1000) / 1000).toString();
  }
  if (col === "prezzo_acquisto") {
    const n = Number(val);
    if (!isNaN(n)) return (Math.round(n * 10000) / 10000).toString();
  }
  return formatPriceListInput(val, col);
}

export function formatPriceListDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return typeof date === "string" ? date : "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year} alle ${hours}:${minutes}:${seconds}`;
}

export function filterAndSortGeneralItems(
  items: ListinoGeneraleRow[],
  originalRowsSnapshot: Map<string, ListinoGeneraleRow>,
  searchTokens: string[],
  sortField: ProductListSortField | null,
  sortAsc: boolean
): ListinoGeneraleRow[] {
  const newItems: ListinoGeneraleRow[] = [];
  const dbItems: ListinoGeneraleRow[] = [];

  for (const item of items) {
    if (item.id.startsWith("new_") || !originalRowsSnapshot.has(item.id)) {
      newItems.push(item);
    } else {
      dbItems.push(item);
    }
  }

  let filteredNew = newItems;
  let filteredDb = dbItems;

  if (searchTokens.length > 0) {
    filteredNew = filteredNew.filter((item) => {
      const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""} ${item.cat || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
    filteredDb = filteredDb.filter((item) => {
      const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""} ${item.cat || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }

  if (sortField) {
    filteredDb = [...filteredDb].sort((a, b) => {
      let valA: any = sortField === "costo_maggiorato" ? null : (a as any)[sortField];
      let valB: any = sortField === "costo_maggiorato" ? null : (b as any)[sortField];

      if (sortField === "costo_maggiorato") {
        valA = a.r2 ?? calculateCostoMaggiorato(a.prezzo_acquisto, a.aumento, a.maga);
        valB = b.r2 ?? calculateCostoMaggiorato(b.prezzo_acquisto, b.aumento, b.maga);
      }

      if (valA == null) valA = "";
      if (valB == null) valB = "";

      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }

      return sortAsc
        ? String(valA).localeCompare(String(valB), "it", { numeric: true })
        : String(valB).localeCompare(String(valA), "it", { numeric: true });
    });
  }

  return [...filteredNew, ...filteredDb];
}

// Funzione di calcolo riga con formule bidirezionali e data aggiornata automaticamente
export function updateGeneralRowWithField(
  prevRow: ListinoGeneraleRow,
  colId: EditableColumnKey | string,
  rawVal: string | number | null
): ListinoGeneraleRow {
  const updated: ListinoGeneraleRow = { ...prevRow };

  if (colId !== "data_ref") {
    updated.data_ref = getTodayAaaaMmGg();
  }

  switch (colId) {
    case "cat":
      updated.cat = rawVal ? String(rawVal).trim() : null;
      break;
    case "fornitore":
      updated.fornitore = rawVal ? String(rawVal).trim() : null;
      break;
    case "codice_articolo":
      updated.codice_articolo = rawVal ? String(rawVal).trim() : null;
      break;
    case "data_ref":
      updated.data_ref = rawVal ? String(rawVal).trim() : null;
      break;
    case "descrizione":
      updated.descrizione = rawVal ? String(rawVal) : "";
      break;
    case "um":
      updated.um = rawVal ? String(rawVal).trim().toUpperCase() : "NR.";
      break;
    case "prezzo_acquisto": {
      const num = typeof rawVal === "number" ? rawVal : parseInputNumber(String(rawVal ?? ""));
      updated.prezzo_acquisto = num;
      const r1 = calculateR1(num, updated.aumento);
      const r2 = calculateR2(r1, updated.maga);
      updated.r1 = r1;
      updated.r2 = r2;
      updated.prezzo_fattura = calculatePrezzoFattura(r2, updated.perc_fatt);
      updated.prezzo_pubblico = calculatePrezzoPubblico(r2, updated.perc_pub, updated.perc_iva);
      updated.prezzo_profess = calculatePrezzoProfess(r2, updated.perc_prof, updated.perc_iva);
      break;
    }
    case "aumento": {
      const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal ?? ""));
      updated.aumento = num;
      const r1 = calculateR1(updated.prezzo_acquisto, num);
      const r2 = calculateR2(r1, updated.maga);
      updated.r1 = r1;
      updated.r2 = r2;
      updated.prezzo_fattura = calculatePrezzoFattura(r2, updated.perc_fatt);
      updated.prezzo_pubblico = calculatePrezzoPubblico(r2, updated.perc_pub, updated.perc_iva);
      updated.prezzo_profess = calculatePrezzoProfess(r2, updated.perc_prof, updated.perc_iva);
      break;
    }
    case "maga": {
      const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal ?? ""));
      updated.maga = num;
      const r1 = calculateR1(updated.prezzo_acquisto, updated.aumento);
      const r2 = calculateR2(r1, num);
      updated.r1 = r1;
      updated.r2 = r2;
      updated.prezzo_fattura = calculatePrezzoFattura(r2, updated.perc_fatt);
      updated.prezzo_pubblico = calculatePrezzoPubblico(r2, updated.perc_pub, updated.perc_iva);
      updated.prezzo_profess = calculatePrezzoProfess(r2, updated.perc_prof, updated.perc_iva);
      break;
    }
    case "perc_pub": {
      const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal ?? ""));
      updated.perc_pub = num;
      const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
      updated.prezzo_pubblico = calculatePrezzoPubblico(costoMaggiorato, num, updated.perc_iva);
      break;
    }
    case "prezzo_pubblico": {
      const num = typeof rawVal === "number" ? rawVal : parseInputNumber(String(rawVal ?? ""));
      updated.prezzo_pubblico = num;
      const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
      if (num != null && costoMaggiorato > 0) {
        updated.perc_pub = round5(calculatePercPubblico(num, costoMaggiorato, updated.perc_iva) / 100);
      }
      break;
    }
    case "perc_prof": {
      const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal ?? ""));
      updated.perc_prof = num;
      const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
      updated.prezzo_profess = calculatePrezzoProfess(costoMaggiorato, num, updated.perc_iva);
      break;
    }
    case "prezzo_profess": {
      const num = typeof rawVal === "number" ? rawVal : parseInputNumber(String(rawVal ?? ""));
      updated.prezzo_profess = num;
      const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
      if (num != null && costoMaggiorato > 0) {
        updated.perc_prof = round5(calculatePercProfess(num, costoMaggiorato, updated.perc_iva) / 100);
      }
      break;
    }
    case "perc_fatt": {
      const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal ?? ""));
      updated.perc_fatt = num;
      const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
      updated.prezzo_fattura = calculatePrezzoFattura(costoMaggiorato, num);
      break;
    }
    case "prezzo_fattura": {
      const num = typeof rawVal === "number" ? rawVal : parseInputNumber(String(rawVal ?? ""));
      updated.prezzo_fattura = num;
      const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
      if (num != null && costoMaggiorato > 0) {
        updated.perc_fatt = round5(calculatePercFattura(num, costoMaggiorato) / 100);
      }
      break;
    }
    case "perc_iva": {
      const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal ?? ""));
      updated.perc_iva = num ?? 0.22;
      const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
      updated.prezzo_pubblico = calculatePrezzoPubblico(costoMaggiorato, updated.perc_pub, updated.perc_iva);
      updated.prezzo_profess = calculatePrezzoProfess(costoMaggiorato, updated.perc_prof, updated.perc_iva);
      break;
    }
    default:
      break;
  }

  return updated;
}

export function applyBulkActionToGeneralRow(
  row: ListinoGeneraleRow,
  payload: BulkOperationPayload
): ListinoGeneraleRow {
  let updated = { ...row };
  const numVal =
    typeof payload.value === "number" ? payload.value : parseFloat(String(payload.value));

  switch (payload.action) {
    case "var_acq_perc": {
      if (!isNaN(numVal)) {
        const currentAcq = updated.prezzo_acquisto || 0;
        const newAcq = round5(currentAcq * (1 + numVal / 100));
        updated = updateGeneralRowWithField(updated, "prezzo_acquisto", newAcq);
      }
      break;
    }
    case "var_acq_val": {
      if (!isNaN(numVal)) {
        const currentAcq = updated.prezzo_acquisto || 0;
        const newAcq = round5(Math.max(0, currentAcq + numVal));
        updated = updateGeneralRowWithField(updated, "prezzo_acquisto", newAcq);
      }
      break;
    }
    case "set_aumento": {
      if (!isNaN(numVal)) {
        updated = updateGeneralRowWithField(updated, "aumento", round5(numVal / 100));
      }
      break;
    }
    case "set_maga": {
      if (!isNaN(numVal)) {
        updated = updateGeneralRowWithField(updated, "maga", round5(numVal / 100));
      }
      break;
    }
    case "var_pub_perc": {
      if (!isNaN(numVal)) {
        const currentPub = updated.prezzo_pubblico || 0;
        const newPub = round5(currentPub * (1 + numVal / 100));
        updated = updateGeneralRowWithField(updated, "prezzo_pubblico", newPub);
      }
      break;
    }
    case "var_prof_perc": {
      if (!isNaN(numVal)) {
        const currentProf = updated.prezzo_profess || 0;
        const newProf = round5(currentProf * (1 + numVal / 100));
        updated = updateGeneralRowWithField(updated, "prezzo_profess", newProf);
      }
      break;
    }
    case "var_fatt_perc": {
      if (!isNaN(numVal)) {
        const currentFatt = updated.prezzo_fattura || 0;
        const newFatt = round5(currentFatt * (1 + numVal / 100));
        updated = updateGeneralRowWithField(updated, "prezzo_fattura", newFatt);
      }
      break;
    }
    case "set_perc_fatt": {
      if (!isNaN(numVal)) {
        updated = updateGeneralRowWithField(updated, "perc_fatt", round5(numVal / 100));
      }
      break;
    }
    case "set_cat": {
      updated = updateGeneralRowWithField(updated, "cat", String(payload.value).trim());
      break;
    }
    case "set_fornitore": {
      updated = updateGeneralRowWithField(updated, "fornitore", String(payload.value).trim());
      break;
    }
    case "set_iva": {
      if (!isNaN(numVal)) {
        updated = updateGeneralRowWithField(updated, "perc_iva", round5(numVal / 100));
      }
      break;
    }
    default:
      break;
  }

  return updated;
}

export function buildGeneralPriceChangeLogs(
  rowsToSave: ListinoGeneraleRow[],
  originalRowsSnapshot: Map<string, ListinoGeneraleRow>,
  operatorName: string,
  nowIso: string
): Omit<PriceListLogEntry, "id">[] {
  const logEntries: Omit<PriceListLogEntry, "id">[] = [];
  const textFields: { key: keyof ListinoGeneraleRow; label: string }[] = [
    { key: "descrizione", label: "Descrizione" },
    { key: "codice_articolo", label: "Codice Articolo" },
    { key: "fornitore", label: "Fornitore" },
    { key: "cat", label: "Categoria" },
    { key: "um", label: "U.M." },
  ];

  for (const row of rowsToSave) {
    const original = originalRowsSnapshot.get(row.id);
    const artCode = row.codice_articolo?.trim() || row.id;
    const artDesc = row.descrizione || "Articolo";

    if (original) {
      for (const f of generalPriceHistoryFields) {
        const oldV = (original[f.key] as number | null) ?? null;
        const newV = (row[f.key] as number | null) ?? null;
        if (oldV !== newV) {
          const pct = generalPriceVariation(oldV, newV, f.fraction);
          logEntries.push({
            row_id: row.id,
            created_at: nowIso,
            tipo_listino: "generale",
            cliente: "",
            codice_articolo: artCode,
            descrizione: artDesc,
            campo_modificato: f.label,
            vecchio_valore: oldV != null ? round5(oldV) : null,
            nuovo_valore: newV != null ? round5(newV) : null,
            vecchio_testo: null,
            nuovo_testo: null,
            variazione_pct: pct != null ? round5(pct) : null,
            operatore: operatorName,
            motivo: "Modifica Excel Listino Generale",
          });
        }
      }

      for (const f of textFields) {
        const oldT = (original[f.key] as string | null) ?? "";
        const newT = (row[f.key] as string | null) ?? "";
        if (oldT !== newT) {
          logEntries.push({
            row_id: row.id,
            created_at: nowIso,
            tipo_listino: "generale",
            cliente: "",
            codice_articolo: artCode,
            descrizione: artDesc,
            campo_modificato: f.label,
            vecchio_valore: null,
            nuovo_valore: null,
            vecchio_testo: oldT || "—",
            nuovo_testo: newT || "—",
            variazione_pct: null,
            operatore: operatorName,
            motivo: `Da "${oldT || "—"}" a "${newT || "—"}"`,
          });
        }
      }
    } else {
      logEntries.push({
        row_id: row.id,
        created_at: nowIso,
        tipo_listino: "generale",
        cliente: "",
        codice_articolo: artCode,
        descrizione: artDesc,
        campo_modificato: "Nuovo Articolo",
        vecchio_valore: null,
        nuovo_valore: row.prezzo_acquisto ? round5(row.prezzo_acquisto) : null,
        vecchio_testo: null,
        nuovo_testo: row.descrizione || "Nuovo Articolo",
        variazione_pct: null,
        operatore: operatorName,
        motivo: "Creazione nuovo articolo",
      });
    }
  }

  return logEntries;
}

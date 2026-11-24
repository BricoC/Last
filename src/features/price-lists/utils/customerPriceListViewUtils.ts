import { ListinoClienteRow, PriceListLogEntry } from "../models/priceList";
import { parsePriceListNumber } from "./priceListInput";
import { round5 } from "./priceFormulas";
import {
  formatDateAaaaMmGg,
  formatPriceListDateTime,
  getTodayAaaaMmGg,
} from "./productListViewUtils";

export { formatDateAaaaMmGg, formatPriceListDateTime, getTodayAaaaMmGg };

export const CUSTOMER_LIST_BATCH_SIZE = 150;

export const NIER_EASTER_EGG_PHRASES = [
  "glory to mankind",
  "glory of mankind",
  "gloria all'umanita",
  "gloria all'umanità",
];

export type CustomerPriceListTab = "tutti" | "duplicati" | "da_verificare";

export type CustomerPriceListSortField =
  | "cliente"
  | "fornitore"
  | "codice_articolo"
  | "data_ref"
  | "descrizione"
  | "prezzo_fattura"
  | "perc_acquisto"
  | "acquisto_eur"
  | "data_acquisto"
  | "acquisto_old"
  | "ricarico";

export const EDITABLE_CLIENT_COL_ORDER = [
  "cliente",
  "fornitore",
  "codice_articolo",
  "descrizione",
  "prezzo_fattura",
  "perc_acquisto",
  "acquisto_eur",
  "data_acquisto",
  "acquisto_old",
  "note",
  "note1",
  "note2",
] as const;

export function createBlankClientRow(defaultClient?: string): ListinoClienteRow {
  return {
    id: `new_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    cliente: defaultClient || "",
    fornitore: "",
    codice_articolo: "",
    descrizione: "",
    prezzo_fattura: null,
    prezzo_acquisto: null,
    acquisto_eur: null,
    perc_acquisto: null,
    data_acquisto: null,
    acquisto_old: "",
    ricarico: null,
    data_ref: getTodayAaaaMmGg(),
    note: "",
    note1: null,
    note2: null,
  };
}

export function formatClientEuro(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  return `€ ${val.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

export function getClientFormattedInitValue(val: any, col: string, char?: string): string {
  if (char !== undefined) return char;
  if (val == null) return "";
  if (col === "perc_acquisto") {
    return `${val}%`;
  }
  return String(val);
}

export function filterAndSortClientPriceItems(
  items: ListinoClienteRow[],
  originalRowsSnapshot: Map<string, ListinoClienteRow>,
  selectedClientFilter: string,
  activeTab: CustomerPriceListTab,
  searchTokens: string[],
  sortField: CustomerPriceListSortField,
  sortAsc: boolean
): ListinoClienteRow[] {
  const newItems: ListinoClienteRow[] = [];
  const dbItems: ListinoClienteRow[] = [];

  for (const item of items) {
    if (item.id.startsWith("new_") || !originalRowsSnapshot.has(item.id)) {
      newItems.push(item);
    } else {
      dbItems.push(item);
    }
  }

  let filteredNew = newItems;
  let filteredDb = dbItems;

  if (selectedClientFilter !== "TUTTI") {
    filteredNew = filteredNew.filter(
      (item) => item.cliente.toLowerCase() === selectedClientFilter.toLowerCase()
    );
    filteredDb = filteredDb.filter(
      (item) => item.cliente.toLowerCase() === selectedClientFilter.toLowerCase()
    );
  }

  if (activeTab === "duplicati") {
    const seen = new Map<string, number>();
    for (const it of items) {
      const key = `${it.cliente}__${it.descrizione}`.toLowerCase();
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    filteredDb = filteredDb.filter(
      (it) => (seen.get(`${it.cliente}__${it.descrizione}`.toLowerCase()) || 0) > 1
    );
  } else if (activeTab === "da_verificare") {
    filteredDb = filteredDb.filter((it) => !it.prezzo_fattura || it.prezzo_fattura <= 0);
  }

  if (searchTokens.length > 0) {
    filteredNew = filteredNew.filter((item) => {
      const text = `${item.cliente} ${item.fornitore || ""} ${item.descrizione} ${item.codice_articolo || ""} ${item.note || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
    filteredDb = filteredDb.filter((item) => {
      const text = `${item.cliente} ${item.fornitore || ""} ${item.descrizione} ${item.codice_articolo || ""} ${item.note || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }

  filteredDb.sort((a, b) => {
    let valA: any = a[sortField];
    let valB: any = b[sortField];

    if (valA == null) valA = "";
    if (valB == null) valB = "";

    if (typeof valA === "number" && typeof valB === "number") {
      return sortAsc ? valA - valB : valB - valA;
    }

    return sortAsc
      ? String(valA).localeCompare(String(valB), "it", { numeric: true })
      : String(valB).localeCompare(String(valA), "it", { numeric: true });
  });

  return [...filteredNew, ...filteredDb];
}

// Aggiornamento campi con formule dinamiche bidirezionali e data automatica
export function updateClientRowWithField(
  row: ListinoClienteRow,
  field: string,
  rawValue: string | number | null
): ListinoClienteRow {
  const updated = { ...row };
  const today = getTodayAaaaMmGg();
  updated.data_ref = today;

  switch (field) {
    case "cliente":
      updated.cliente = String(rawValue || "").trim();
      break;
    case "fornitore":
      updated.fornitore = String(rawValue || "").trim() || null;
      break;
    case "codice_articolo":
      updated.codice_articolo = String(rawValue || "").trim() || null;
      break;
    case "descrizione":
      updated.descrizione = String(rawValue || "").trim();
      break;
    case "data_acquisto":
      updated.data_acquisto = String(rawValue || "").trim() || null;
      break;
    case "acquisto_old":
      updated.acquisto_old = String(rawValue || "").trim() || null;
      break;
    case "note":
      updated.note = String(rawValue || "").trim() || null;
      break;
    case "note1":
      updated.note1 = String(rawValue || "").trim() || null;
      break;
    case "note2":
      updated.note2 = String(rawValue || "").trim() || null;
      break;

    case "acquisto_eur": {
      const acq = parsePriceListNumber(rawValue);
      updated.acquisto_eur = acq;
      if (acq != null) {
        updated.data_acquisto = today;
      }
      if (acq != null && acq > 0 && updated.perc_acquisto != null) {
        updated.prezzo_fattura = round5(acq * (1 + updated.perc_acquisto / 100));
      } else if (acq != null && acq > 0 && updated.prezzo_fattura != null) {
        updated.perc_acquisto = round5(((updated.prezzo_fattura - acq) / acq) * 100);
      }
      break;
    }

    case "perc_acquisto": {
      const perc = parsePriceListNumber(rawValue);
      updated.perc_acquisto = perc;
      if (updated.acquisto_eur != null && updated.acquisto_eur > 0 && perc != null) {
        updated.prezzo_fattura = round5(updated.acquisto_eur * (1 + perc / 100));
      }
      break;
    }

    case "prezzo_fattura": {
      const fatt = parsePriceListNumber(rawValue);
      updated.prezzo_fattura = fatt;
      if (fatt != null && updated.acquisto_eur != null && updated.acquisto_eur > 0) {
        updated.perc_acquisto = round5(
          ((fatt - updated.acquisto_eur) / updated.acquisto_eur) * 100
        );
      }
      break;
    }

    case "ricarico":
      updated.ricarico =
        rawValue != null && String(rawValue).trim() !== "" ? String(rawValue).trim() : null;
      break;

    default:
      break;
  }

  return updated;
}

export function buildClientPriceChangeLogs(
  rowsToSave: ListinoClienteRow[],
  originalRowsSnapshot: Map<string, ListinoClienteRow>,
  operatorName: string,
  nowIso: string
): Omit<PriceListLogEntry, "id">[] {
  const logEntries: Omit<PriceListLogEntry, "id">[] = [];
  const checkFields: { key: keyof ListinoClienteRow; label: string }[] = [
    { key: "prezzo_fattura", label: "Prezzo Vendita" },
    { key: "perc_acquisto", label: "% Acquisto" },
    { key: "acquisto_eur", label: "Acquisto (€)" },
    { key: "data_acquisto", label: "Data Acquisto" },
    { key: "acquisto_old", label: "Acquisto OLD" },
    { key: "descrizione", label: "Descrizione" },
    { key: "codice_articolo", label: "Codice Articolo" },
    { key: "fornitore", label: "Fornitore" },
    { key: "cliente", label: "Cliente" },
    { key: "note", label: "Note" },
  ];

  for (const row of rowsToSave) {
    const original = originalRowsSnapshot.get(row.id);
    const artCode = row.codice_articolo?.trim() || row.id;
    const artDesc = row.descrizione || "Articolo";

    if (original) {
      for (const f of checkFields) {
        const oldV = original[f.key];
        const newV = row[f.key];
        if (oldV !== newV) {
          logEntries.push({
            row_id: row.id,
            created_at: nowIso,
            tipo_listino: "cliente",
            cliente: row.cliente,
            codice_articolo: artCode,
            descrizione: artDesc,
            campo_modificato: f.label,
            vecchio_valore: typeof oldV === "number" ? round5(oldV) : null,
            nuovo_valore: typeof newV === "number" ? round5(newV) : null,
            vecchio_testo: typeof oldV === "string" ? oldV : null,
            nuovo_testo: typeof newV === "string" ? newV : null,
            variazione_pct: null,
            operatore: operatorName,
            motivo: "Modifica Excel Listino Cliente",
          });
        }
      }
    } else {
      logEntries.push({
        row_id: row.id,
        created_at: nowIso,
        tipo_listino: "cliente",
        cliente: row.cliente,
        codice_articolo: artCode,
        descrizione: artDesc,
        campo_modificato: "Nuovo Articolo Cliente",
        vecchio_valore: null,
        nuovo_valore: row.prezzo_fattura ? round5(row.prezzo_fattura) : null,
        vecchio_testo: null,
        nuovo_testo: row.descrizione || "Nuovo Articolo",
        variazione_pct: null,
        operatore: operatorName,
        motivo: `Creazione articolo per ${row.cliente}`,
      });
    }
  }

  return logEntries;
}

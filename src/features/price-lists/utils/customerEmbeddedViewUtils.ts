import { ListinoClienteRow } from "../models/priceList";
import { parsePriceListNumber } from "./priceListInput";
import { round5 } from "./priceFormulas";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { isClientMatching } from "@/features/ddt-studio/utils/clientPriceListMatcher";
import {
  CustomerPriceListSortField,
  getTodayAaaaMmGg,
} from "./customerPriceListViewUtils";

export function formatEmbeddedPercent(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  return `${val.toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

export function filterAndSortEmbeddedClientItems(
  items: ListinoClienteRow[],
  originalRowsSnapshot: Map<string, ListinoClienteRow>,
  clientFilter: string,
  currentClientName: string | undefined,
  currentClientPls: Set<string> | undefined,
  searchTokens: string[],
  sortField: CustomerPriceListSortField,
  sortAsc: boolean
): ListinoClienteRow[] {
  let result = items;

  const effectiveFilter = clientFilter.trim();
  if (effectiveFilter) {
    const filterClean = effectiveFilter;
    const matchesCurrentClient =
      currentClientName && isClientMatching(filterClean, currentClientName);

    result = result.filter((item) => {
      if (
        matchesCurrentClient &&
        currentClientPls &&
        currentClientPls.has(item.cliente.toUpperCase())
      ) {
        return true;
      }
      if (isClientMatching(filterClean, item.cliente)) {
        return true;
      }
      const rawCli = item.cliente.toLowerCase();
      const cleanCli = item.cliente.replace(/^LIST_/, "").toLowerCase();
      const normCli = `${rawCli} ${cleanCli}`;
      const clientTokens = tokenizeSearch(filterClean);
      return clientTokens.every((tok) => normCli.includes(tok));
    });
  } else if (currentClientName && currentClientName.trim()) {
    result = result.filter((item) => {
      if (currentClientPls && currentClientPls.size > 0) {
        return currentClientPls.has(item.cliente.toUpperCase());
      }
      return isClientMatching(currentClientName, item.cliente);
    });
  }

  if (searchTokens.length > 0) {
    result = result.filter((item) => {
      const text = `${item.cliente} ${item.fornitore || ""} ${item.descrizione} ${item.codice_articolo || ""} ${item.note || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }

  const newItems = result.filter(
    (i) => i.id.startsWith("new_") && !originalRowsSnapshot.has(i.id)
  );
  const dbItems = result.filter(
    (i) => !i.id.startsWith("new_") || originalRowsSnapshot.has(i.id)
  );

  dbItems.sort((a, b) => {
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

  return [...newItems, ...dbItems];
}

export function updateEmbeddedClientRowWithField(
  row: ListinoClienteRow,
  field: string,
  rawValue: string | number | null,
  richHtml?: string | null
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
      updated.descrizione_rich = updated.descrizione ? (richHtml ?? null) : null;
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

    case "perc_acquisto": {
      const newPerc = parsePriceListNumber(rawValue);
      updated.perc_acquisto = newPerc;
      if (updated.acquisto_eur != null && newPerc != null) {
        updated.prezzo_fattura = round5(updated.acquisto_eur * (1 + newPerc / 100));
      }
      break;
    }

    case "prezzo_fattura": {
      const newVendita = parsePriceListNumber(rawValue);
      updated.prezzo_fattura = newVendita;
      if (updated.acquisto_eur != null && updated.acquisto_eur > 0 && newVendita != null) {
        const perc = ((newVendita - updated.acquisto_eur) / updated.acquisto_eur) * 100;
        updated.perc_acquisto = round5(perc);
      }
      break;
    }

    case "acquisto_eur": {
      const newAcq = parsePriceListNumber(rawValue);
      updated.acquisto_eur = newAcq;
      if (!updated.data_acquisto && newAcq != null) {
        updated.data_acquisto = today;
      }
      if (newAcq != null && updated.perc_acquisto != null) {
        updated.prezzo_fattura = round5(newAcq * (1 + updated.perc_acquisto / 100));
      } else if (newAcq != null && updated.prezzo_fattura != null && newAcq > 0) {
        const perc = ((updated.prezzo_fattura - newAcq) / newAcq) * 100;
        updated.perc_acquisto = round5(perc);
      }
      break;
    }

    case "ricarico": {
      updated.ricarico =
        rawValue != null && String(rawValue).trim() !== "" ? String(rawValue).trim() : null;
      break;
    }

    default:
      (updated as any)[field] = rawValue;
  }

  return updated;
}

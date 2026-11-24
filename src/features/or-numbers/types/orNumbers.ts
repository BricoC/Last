export interface OrRow {
  id: string;
  docNumber: number | null;
  series: string;
  date: string; // YYYY-MM-DD
  client: string;
  destination: string;
  orderReference: string;
  statusLog: string;
  discountPercent?: number;
  hasMissingPrices?: boolean;
  itemsSearchText?: string;
  taxableTotalFormatted?: string;
}

export type OrStatusType = "green" | "yellow" | "red" | "unpriced";

/**
 * Verifica se la stringa corrisponde a un vero numero d'ordine.
 * Se contiene "RDA" (richiesta d'acquisto/conferma interna), NON viene considerato numero d'ordine.
 */
export function isActualOrderReference(ref?: string | null): boolean {
  if (!ref) return false;
  const trimmed = ref.trim();
  if (!trimmed) return false;
  if (trimmed.toUpperCase().includes("RDA")) {
    return false;
  }
  return true;
}

export function getOrStatus(row: OrRow): OrStatusType {
  if (isActualOrderReference(row.orderReference)) {
    return "green";
  }
  if (row.statusLog && row.statusLog.trim()) {
    return "yellow";
  }
  if (row.hasMissingPrices) {
    return "unpriced";
  }
  return "red";
}

/**
 * Filtro multi-parola su numero DDT, numero ordine, destinazione e articoli contenuti nel DDT.
 * Tutte le parole digitate (separate da spazi) devono comparire in almeno uno dei campi.
 */
export function matchesOrRowSearch(row: OrRow, query: string): boolean {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = [
    row.docNumber != null ? String(row.docNumber) : "",
    row.orderReference || "",
    row.destination || "",
    row.itemsSearchText || "",
  ]
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

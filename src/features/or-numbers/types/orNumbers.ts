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
}

export type OrStatusType = "green" | "yellow" | "red";

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
  return "red";
}

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

export function getOrStatus(row: OrRow): OrStatusType {
  if (row.orderReference && row.orderReference.trim()) {
    return "green";
  }
  if (row.statusLog && row.statusLog.trim()) {
    return "yellow";
  }
  return "red";
}


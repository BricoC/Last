import type Database from "@tauri-apps/plugin-sql";
import type { OfflineQueueItem } from "@/features/orders/services/orderSupabaseService";

export const ORDER_QUEUE_KEY = "last_order_offline_queue";

export function parseOrderQueue(value: unknown): OfflineQueueItem[] {
  if (!Array.isArray(value) || value.some(item => !item || typeof item.id !== "string" ||
    typeof item.targetId !== "string" || typeof item.action !== "string" || typeof item.timestamp !== "string")) {
    throw new Error("Coda ordini non valida nel backup");
  }
  return value;
}

export function readOrderQueueForBackup(): OfflineQueueItem[] {
  return parseOrderQueue(JSON.parse(localStorage.getItem(ORDER_QUEUE_KEY) ?? "[]"));
}

// This table is populated only by a restore or inside a physical backup snapshot.
export async function consumeRestoredOrderQueue(db: Database): Promise<void> {
  const [row] = await db.select<{ payload: string; merge_queue: number }[]>(
    "SELECT payload, merge_queue FROM order_queue_restore WHERE id=1");
  if (!row) return;
  const imported = parseOrderQueue(JSON.parse(row.payload));
  const current = row.merge_queue ? readOrderQueueForBackup() : [];
  const ids = new Set(current.map(item => item.id));
  const combined = [...current, ...imported.filter(item => !ids.has(item.id))];
  localStorage.setItem(ORDER_QUEUE_KEY, JSON.stringify(combined));
  await db.execute("DELETE FROM order_queue_restore WHERE id=1 AND payload=$1 AND merge_queue=$2", [row.payload, row.merge_queue]);
}

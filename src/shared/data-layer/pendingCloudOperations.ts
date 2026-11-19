import { getDatabase } from "./database";
import type { SqliteWrite } from "./localDatabaseBatch";

export interface PendingCloudOperation {
  sequence: number;
  record_id: string;
  action: string;
  payload: string;
}

export function pendingCloudWrite(scope: string, recordId: string, action: string, payload: unknown): SqliteWrite {
  return {
    sql: "INSERT INTO pending_cloud_operations (scope, record_id, action, payload) VALUES ($1,$2,$3,$4)",
    params: [scope, recordId, action, JSON.stringify(payload)],
  };
}

const running = new Map<string, Promise<number>>();

export function flushPendingCloudOperations(
  scope: string, apply: (operation: PendingCloudOperation) => Promise<void>,
): Promise<number> {
  const existing = running.get(scope);
  if (existing) return existing;
  const request = (async () => {
    const db = await getDatabase();
    const operations = await db.select<PendingCloudOperation[]>(
      "SELECT sequence, record_id, action, payload FROM pending_cloud_operations WHERE scope = $1 ORDER BY sequence",
      [scope],
    );
    const failed = new Set<string>();
    let confirmed = 0;
    for (const operation of operations) {
      if (failed.has(operation.record_id)) continue;
      try {
        await apply(operation);
        await db.execute("DELETE FROM pending_cloud_operations WHERE sequence = $1", [operation.sequence]);
        confirmed++;
      } catch (error) {
        failed.add(operation.record_id);
        console.warn(`[${scope}] Operazione cloud ancora in sospeso:`, error);
      }
    }
    return confirmed;
  })().finally(() => running.delete(scope));
  running.set(scope, request);
  return request;
}

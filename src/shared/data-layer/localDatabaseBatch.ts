import { invoke } from "@tauri-apps/api/core";

export interface SqliteWrite {
  sql: string;
  params: unknown[];
  expectedRows?: number;
}

export async function applyLocalDatabaseBatch(
  writes: SqliteWrite[],
  referenceTables?: string[],
): Promise<void> {
  if (writes.length === 0) return;
  await invoke("apply_local_database_batch", {
    writes,
    validateReferencesAfterWrite: referenceTables !== undefined,
    ...(referenceTables === undefined ? {} : { referenceTables }),
  });
}

import { getDatabase } from "@/shared/data-layer/database";
import type { SqliteWrite } from "@/shared/data-layer/localDatabaseBatch";
import { normalizeSupabaseProjectUrl } from "@/shared/services/supabaseConfigCache";

export type PriceListCloudTable = "listino_generale" | "listini_vari" | "listini_clienti";
type LocalPriceList = "listino_generale" | "listini_clienti";

const pullStateSchema = `CREATE TABLE IF NOT EXISTS price_list_pull_state (
  project_url TEXT NOT NULL, table_name TEXT NOT NULL, revision TEXT NOT NULL,
  PRIMARY KEY (project_url, table_name)
)`;

export async function readPriceListPullState(projectUrl: string): Promise<Map<string, string>> {
  const db = await getDatabase();
  await db.execute(pullStateSchema);
  const cols = await db.select<{ name: string }[]>("PRAGMA table_info(price_list_pull_state)");
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("revision") || cols.some((c) => !["project_url", "table_name", "revision"].includes(c.name))) {
    await db.execute("DROP TABLE price_list_pull_state");
    await db.execute(pullStateSchema);
  }
  const rows = await db.select<{ table_name: string; revision: string }[]>(
    "SELECT table_name, revision FROM price_list_pull_state WHERE project_url = $1",
    [normalizeSupabaseProjectUrl(projectUrl)],
  );
  return new Map(rows.map((row) => [row.table_name, row.revision]));
}

export function priceListPullWrites(
  projectUrl: string,
  streams: [PriceListCloudTable, { last_sync_revision?: string | number | null }[]][],
): SqliteWrite[] {
  const writes: SqliteWrite[] = [{ sql: pullStateSchema, params: [] }];
  for (const [table, rows] of streams) {
    let latest = 0n;
    for (const row of rows) {
      if (row.last_sync_revision == null) continue;
      const revision = BigInt(row.last_sync_revision);
      if (revision > latest) latest = revision;
    }
    if (latest) writes.push({
      sql: `INSERT INTO price_list_pull_state (project_url, table_name, revision) VALUES ($1,$2,$3)
        ON CONFLICT(project_url, table_name) DO UPDATE SET revision = excluded.revision
        WHERE CAST(excluded.revision AS INTEGER) > CAST(revision AS INTEGER)`,
      params: [normalizeSupabaseProjectUrl(projectUrl), table, latest.toString()],
    });
  }
  return writes;
}

export function reconcilePriceListId(table: LocalPriceList, oldId: string, cloudId: string): SqliteWrite[] {
  if (!oldId || oldId === cloudId || /^(gen_|var_|cli_)\d+$/.test(oldId)) return [];
  return [
    {
      sql: `DELETE FROM ${table} WHERE id = $1 AND EXISTS (
        SELECT 1 FROM ${table} AS canonical WHERE canonical.id = $2
          AND ${table}.sync_revision IS NULL
      )`,
      params: [oldId, cloudId],
    },
    {
      sql: `DELETE FROM ${table} WHERE id = $2 AND sync_revision IS NULL AND EXISTS (
        SELECT 1 FROM ${table} AS original WHERE original.id = $1
      )`,
      params: [oldId, cloudId],
    },
    {
      sql: `UPDATE ${table} SET id = $2 WHERE id = $1`,
      params: [oldId, cloudId],
    },
    {
      sql: `UPDATE listini_prezzi_log SET row_id = $2 WHERE row_id = $1
        AND NOT EXISTS (SELECT 1 FROM ${table} WHERE id = $1)
        AND EXISTS (SELECT 1 FROM ${table} WHERE id = $2)`,
      params: [oldId, cloudId],
    },
  ];
}

import type Database from "@tauri-apps/plugin-sql";

interface SqliteColumn {
  name: string;
}

async function addColumnIfMissing(
  db: Database,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  const columns = await db.select<SqliteColumn[]>(`PRAGMA table_info(${table})`);
  if (!columns.some((entry) => entry.name === column)) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export async function migrateDdtSchemaV5(db: Database): Promise<void> {
  await addColumnIfMissing(db, "ddt_documents", "series", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, "ddt_items", "deleted_at", "TEXT");
  await addColumnIfMissing(db, "ddt_items", "updated_by", "TEXT NOT NULL DEFAULT 'system'");
  await addColumnIfMissing(db, "ddt_items", "sync_status", "TEXT NOT NULL DEFAULT 'pending'");

  await db.execute("DROP INDEX IF EXISTS idx_ddt_number_year");
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ddt_number_year_series
    ON ddt_documents(year, series, doc_number)
    WHERE deleted_at IS NULL AND doc_number IS NOT NULL;
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_ddt_items_active
    ON ddt_items(ddt_id, deleted_at, row_index);
  `);
}

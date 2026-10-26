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

interface DuplicateDdtNumber {
  year: number;
  doc_number: number;
  duplicate_count: number;
}

export async function migrateDdtNumberUniquenessV8(db: Database): Promise<void> {
  const duplicates = await db.select<DuplicateDdtNumber[]>(`
    SELECT year, doc_number, COUNT(*) AS duplicate_count
    FROM ddt_documents
    WHERE doc_number IS NOT NULL AND deleted_at IS NULL
    GROUP BY year, doc_number
    HAVING COUNT(*) > 1
    ORDER BY year, doc_number
    LIMIT 10
  `);
  if (duplicates.length > 0) {
    const keys = duplicates.map((row) => `${row.year}/${row.doc_number} (${row.duplicate_count} record)`).join(", ");
    throw new Error(`Vincolo anti-duplicati DDT non applicato. Numeri già duplicati da risolvere: ${keys}. Nessun DDT è stato modificato.`);
  }

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ddt_number_year_active
    ON ddt_documents(year, doc_number)
    WHERE doc_number IS NOT NULL AND deleted_at IS NULL;
  `);
  await db.execute("DROP INDEX IF EXISTS idx_ddt_number_year_series");
  await db.execute("DROP INDEX IF EXISTS idx_ddt_number_year");
  await db.execute("DROP INDEX IF EXISTS idx_ddt_number_year_global");
}

// Replaces the earlier all-record index while preserving the active-record rule.
export async function migrateDdtNumberReuseAfterSoftDeleteV9(db: Database): Promise<void> {
  await migrateDdtNumberUniquenessV8(db);
}

export async function migrateDdtInformationalRowsV10(db: Database): Promise<void> {
  await addColumnIfMissing(db, "ddt_items", "row_kind", "TEXT NOT NULL DEFAULT 'item'");
}

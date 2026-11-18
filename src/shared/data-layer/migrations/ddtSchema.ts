import type { MigrationDatabase } from "../migrationPlan";

export async function migrateDdtSchemaV5(db: MigrationDatabase): Promise<void> {
  await db.addColumnIfMissing("ddt_documents", "series", "TEXT NOT NULL DEFAULT ''");
  await db.addColumnIfMissing("ddt_items", "deleted_at", "TEXT");
  await db.addColumnIfMissing("ddt_items", "updated_by", "TEXT NOT NULL DEFAULT 'system'");
  await db.addColumnIfMissing("ddt_items", "sync_status", "TEXT NOT NULL DEFAULT 'pending'");

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

export async function migrateDdtNumberUniquenessV8(db: MigrationDatabase): Promise<void> {
  await db.requireEmpty(`
    SELECT printf('%d/%d (%d record)', year, doc_number, COUNT(*))
    FROM ddt_documents
    WHERE doc_number IS NOT NULL AND deleted_at IS NULL
    GROUP BY year, doc_number
    HAVING COUNT(*) > 1
    ORDER BY year, doc_number
    LIMIT 10
  `, "Vincolo anti-duplicati DDT non applicato. Numeri già duplicati da risolvere:");
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
export async function migrateDdtNumberReuseAfterSoftDeleteV9(db: MigrationDatabase): Promise<void> {
  await migrateDdtNumberUniquenessV8(db);
}

export async function migrateDdtInformationalRowsV10(db: MigrationDatabase): Promise<void> {
  await db.addColumnIfMissing("ddt_items", "row_kind", "TEXT NOT NULL DEFAULT 'item'");
}

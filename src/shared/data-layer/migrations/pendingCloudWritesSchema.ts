import type { MigrationDatabase } from "../migrationPlan";

export async function migratePendingCloudWritesV31(db: MigrationDatabase): Promise<void> {
  const changes = [
    { table: "listino_generale", column: "sync_revision", type: "TEXT" },
    { table: "listino_generale", column: "sync_confirmed_at", type: "TEXT" },
    { table: "listini_clienti", column: "sync_revision", type: "TEXT" },
    { table: "listini_clienti", column: "sync_confirmed_at", type: "TEXT" },
    { table: "listini_clienti_cestino", column: "prezzo_acquisto", type: "REAL" },
    { table: "supplier_invoices", column: "cloud_upload_pending", type: "INTEGER NOT NULL DEFAULT 0" },
    { table: "supplier_invoices", column: "cloud_uploaded_at", type: "TEXT" },
  ];
  for (const { table, column, type } of changes) {
    await db.addColumnIfMissing(table, column, type);
  }
}

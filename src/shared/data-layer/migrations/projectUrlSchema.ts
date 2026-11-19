import type { MigrationDatabase } from "../migrationPlan";
import { migratePendingCloudWritesV31 } from "./pendingCloudWritesSchema";

const SYNCED_TABLES_WITH_PROJECT_URL = [
  "clients",
  "supplier_invoices",
  "ddt_documents",
  "notes",
  "notes_trash",
  "offers",
  "quotes",
  "orders",
] as const;

export async function migrateSyncedEntitiesProjectUrlV37(db: MigrationDatabase): Promise<void> {
  await migratePendingCloudWritesV31(db);
  for (const table of SYNCED_TABLES_WITH_PROJECT_URL) {
    await db.addColumnIfMissing(table, "project_url", "TEXT");
  }
}

export async function migrateTrashTablesProjectUrlV38(db: MigrationDatabase): Promise<void> {
  await db.addColumnIfMissing("offers_trash", "project_url", "TEXT");
  await db.addColumnIfMissing("quotes_trash", "project_url", "TEXT");
}

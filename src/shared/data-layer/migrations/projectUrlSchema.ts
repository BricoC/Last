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

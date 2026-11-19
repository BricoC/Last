import type { MigrationDatabase } from "../migrationPlan";

export async function migratePendingCloudOperationsV34(db: MigrationDatabase): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS pending_cloud_operations (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    payload TEXT NOT NULL
  )`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pending_cloud_operations_scope
    ON pending_cloud_operations(scope, record_id, sequence)`);
  await db.addColumnIfMissing("clients", "pending_previous_name", "TEXT");
}

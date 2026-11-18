import type { MigrationDatabase } from "../migrationPlan";

export async function migrateEmailSettingsSchemaV20(db: MigrationDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS email_settings (
      id TEXT PRIMARY KEY,
      carrara_to TEXT NOT NULL DEFAULT '',
      carrara_cc TEXT NOT NULL DEFAULT '',
      wepa_salanetti_to TEXT NOT NULL DEFAULT '',
      wepa_salanetti_cc TEXT NOT NULL DEFAULT '',
      wepa_ralletta_to TEXT NOT NULL DEFAULT '',
      wepa_ralletta_cc TEXT NOT NULL DEFAULT '',
      bank_to TEXT NOT NULL DEFAULT '',
      bank_cc TEXT NOT NULL DEFAULT '',
      accountant_to TEXT NOT NULL DEFAULT '',
      accountant_cc TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );
  `);

  await db.execute(`
    INSERT INTO email_settings (id, created_at, updated_at, updated_by)
    VALUES ('email_config', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'system')
    ON CONFLICT (id) DO NOTHING
  `);
}


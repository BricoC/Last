import type { MigrationDatabase } from "../migrationPlan";

export async function migrateNoteDeletionsV32(db: MigrationDatabase): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS note_deletions (
    id TEXT PRIMARY KEY, supabase_id INTEGER, deleted_at TEXT NOT NULL, project_url TEXT
  )`);
  await db.execute(`INSERT INTO note_deletions (id, supabase_id, deleted_at)
    SELECT id, supabase_id, deleted_at FROM notes_trash WHERE supabase_id IS NOT NULL
    ON CONFLICT (id) DO NOTHING`);
}

export async function migrateNoteDeletionsProjectUrlV36(db: MigrationDatabase): Promise<void> {
  await db.addColumnIfMissing("note_deletions", "project_url", "TEXT");
}

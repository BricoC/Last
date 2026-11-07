import Database from "@tauri-apps/plugin-sql";

/**
 * Migrazione v23: Tabella Note (Gestore Note e Word Editor)
 */
export async function migrateNotesSchemaV23(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      supabase_id INTEGER,
      title TEXT NOT NULL,
      content_html TEXT NOT NULL DEFAULT '',
      content_text TEXT NOT NULL DEFAULT '',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      color TEXT DEFAULT 'default',
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_notes_list ON notes(is_archived, is_pinned DESC, updated_at DESC);
  `);
}

/**
 * Migrazione v24: Aggiunta colonna supabase_id per sincronizzazione cloud
 */
export async function migrateNotesSchemaV24(db: Database): Promise<void> {
  try {
    await db.execute(`ALTER TABLE notes ADD COLUMN supabase_id INTEGER;`);
  } catch {}
}


import type Database from "@tauri-apps/plugin-sql";

/**
 * Migrazione v25: Tabelle Cestino per Note e Offerte (FIFO max 10 elementi)
 */
export async function migrateTrashSchemaV25(db: Database): Promise<void> {
  // 1. Cestino Note
  await db.execute(`
    CREATE TABLE IF NOT EXISTS notes_trash (
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
      deleted_at TEXT NOT NULL,
      deleted_by TEXT DEFAULT 'Operatore'
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_notes_trash_deleted_at 
    ON notes_trash(deleted_at DESC);
  `);

  // 2. Cestino Offerte
  await db.execute(`
    CREATE TABLE IF NOT EXISTS offers_trash (
      id TEXT PRIMARY KEY,
      supabase_id INTEGER,
      offer_date TEXT NOT NULL,
      requester TEXT NOT NULL,
      contact TEXT,
      items_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Da preparare',
      is_urgent INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      deleted_by TEXT DEFAULT 'Operatore'
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_offers_trash_deleted_at 
    ON offers_trash(deleted_at DESC);
  `);
}


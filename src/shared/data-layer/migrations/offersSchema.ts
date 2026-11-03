import Database from "@tauri-apps/plugin-sql";

/**
 * Migrazione v17: Tabella Offerte e Richieste Clienti
 * - `offers`: gestione appunti, offerte materiali con sync Supabase e funzionamento offline-first
 */
export async function migrateOffersSchemaV17(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS offers (
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
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_offers_active_date ON offers(is_archived, offer_date DESC, created_at DESC);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_offers_sync ON offers(sync_status, updated_at);
  `);
}

/**
 * Migrazione v18: Aggiunta colonne is_urgent, created_by, updated_by
 */
export async function migrateOffersSchemaV18(db: Database): Promise<void> {
  try {
    await db.execute(`ALTER TABLE offers ADD COLUMN is_urgent INTEGER NOT NULL DEFAULT 0;`);
  } catch {}
  try {
    await db.execute(`ALTER TABLE offers ADD COLUMN created_by TEXT;`);
  } catch {}
  try {
    await db.execute(`ALTER TABLE offers ADD COLUMN updated_by TEXT;`);
  } catch {}
}


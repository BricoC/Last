import type Database from "@tauri-apps/plugin-sql";

export async function migrateQuoteTrashSchemaV21(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS quotes_trash (
      id TEXT PRIMARY KEY,
      quote_number INTEGER,
      numero TEXT,
      year INTEGER,
      quote_date TEXT,
      client_name TEXT,
      subject TEXT,
      total_document_subunits INTEGER DEFAULT 0,
      data_json TEXT,
      deleted_at TEXT NOT NULL,
      deleted_by TEXT DEFAULT 'system'
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_quotes_trash_deleted_at 
    ON quotes_trash(deleted_at DESC);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS quote_sequences (
      year INTEGER PRIMARY KEY,
      last_number INTEGER NOT NULL
    );
  `);

  // Inizializza la sequenza con il massimo numero preventivo registrato per ogni anno
  try {
    await db.execute(`
      INSERT OR IGNORE INTO quote_sequences (year, last_number)
      SELECT year, COALESCE(MAX(quote_number), 0)
      FROM quotes
      GROUP BY year;
    `);
  } catch (err) {
    console.warn("[migrateQuoteTrashSchemaV21] Inizializzazione quote_sequences:", err);
  }
}

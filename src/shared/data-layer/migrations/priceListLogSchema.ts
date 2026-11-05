import type Database from "@tauri-apps/plugin-sql";

export async function migratePriceListLogSchemaV12(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS listini_prezzi_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_id TEXT,
      created_at TEXT NOT NULL,
      tipo_listino TEXT DEFAULT 'generale',
      cliente TEXT DEFAULT '',
      codice_articolo TEXT NOT NULL,
      descrizione TEXT,
      campo_modificato TEXT NOT NULL,
      vecchio_valore REAL,
      nuovo_valore REAL,
      vecchio_testo TEXT,
      nuovo_testo TEXT,
      variazione_pct REAL,
      operatore TEXT DEFAULT 'Operatore',
      motivo TEXT
    );
  `);

  try {
    await db.execute("ALTER TABLE listini_prezzi_log ADD COLUMN row_id TEXT;");
  } catch {}
  try {
    await db.execute("ALTER TABLE listini_prezzi_log ADD COLUMN vecchio_testo TEXT;");
  } catch {}
  try {
    await db.execute("ALTER TABLE listini_prezzi_log ADD COLUMN nuovo_testo TEXT;");
  } catch {}

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_listini_log_art 
    ON listini_prezzi_log(codice_articolo);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_listini_log_row 
    ON listini_prezzi_log(row_id);
  `);
}

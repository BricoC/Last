import type Database from "@tauri-apps/plugin-sql";

export async function migratePriceListLogSchemaV12(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS listini_prezzi_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      tipo_listino TEXT DEFAULT 'generale',
      cliente TEXT DEFAULT '',
      codice_articolo TEXT NOT NULL,
      descrizione TEXT,
      campo_modificato TEXT NOT NULL,
      vecchio_valore REAL,
      nuovo_valore REAL,
      variazione_pct REAL,
      operatore TEXT DEFAULT 'Operatore',
      motivo TEXT
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_listini_log_art 
    ON listini_prezzi_log(codice_articolo);
  `);
}

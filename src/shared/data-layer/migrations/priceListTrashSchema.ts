import type Database from "@tauri-apps/plugin-sql";

export async function migratePriceListTrashSchemaV19(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS listino_generale_cestino (
      id TEXT PRIMARY KEY,
      deleted_at TEXT NOT NULL,
      deleted_by TEXT,
      source_table TEXT DEFAULT 'listino_generale',
      cat TEXT,
      fornitore TEXT,
      codice_articolo TEXT,
      data_ref TEXT,
      descrizione TEXT NOT NULL,
      um TEXT,
      perc_pub REAL,
      prezzo_pubblico REAL,
      perc_prof REAL,
      prezzo_profess REAL,
      perc_fatt REAL,
      prezzo_fattura REAL,
      prezzo_acquisto REAL,
      aumento REAL,
      r1 REAL,
      maga REAL,
      r2 REAL,
      perc_iva REAL DEFAULT 0.22,
      note TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_listino_cestino_deleted_at 
    ON listino_generale_cestino(deleted_at DESC);
  `);
}

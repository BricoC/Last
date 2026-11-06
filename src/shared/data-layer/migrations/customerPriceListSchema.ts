import type Database from "@tauri-apps/plugin-sql";

export async function migrateCustomerPriceListUpgradeV22(db: Database): Promise<void> {
  // 1. Verifica ed estensione tabella listini_clienti
  const tableInfo = await db.select<{ name: string }[]>("PRAGMA table_info(listini_clienti);");
  const existingCols = new Set(tableInfo.map((c) => c.name));

  if (!existingCols.has("data_ref")) {
    await db.execute("ALTER TABLE listini_clienti ADD COLUMN data_ref TEXT;");
  }
  if (!existingCols.has("acquisto_eur")) {
    await db.execute("ALTER TABLE listini_clienti ADD COLUMN acquisto_eur REAL;");
  }
  if (!existingCols.has("perc_acquisto")) {
    await db.execute("ALTER TABLE listini_clienti ADD COLUMN perc_acquisto REAL;");
  }
  if (!existingCols.has("data_acquisto")) {
    await db.execute("ALTER TABLE listini_clienti ADD COLUMN data_acquisto TEXT;");
  }
  if (!existingCols.has("acquisto_old")) {
    await db.execute("ALTER TABLE listini_clienti ADD COLUMN acquisto_old TEXT;");
    // Popola acquisto_old col vecchio prezzo_acquisto convertito a testo
    await db.execute(`
      UPDATE listini_clienti 
      SET acquisto_old = CAST(prezzo_acquisto AS TEXT) 
      WHERE prezzo_acquisto IS NOT NULL AND acquisto_old IS NULL;
    `);
  }

  // 2. Tabella Cestino Listini Clienti (max 50 voci FIFO)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS listini_clienti_cestino (
      id TEXT PRIMARY KEY,
      deleted_at TEXT NOT NULL,
      deleted_by TEXT,
      cliente TEXT NOT NULL,
      codice_articolo TEXT,
      descrizione TEXT NOT NULL,
      prezzo_fattura REAL,
      acquisto_eur REAL,
      perc_acquisto REAL,
      data_acquisto TEXT,
      acquisto_old TEXT,
      ricarico REAL,
      data_ref TEXT,
      note TEXT,
      note1 TEXT,
      note2 TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_listini_clienti_cestino_deleted_at 
    ON listini_clienti_cestino(deleted_at DESC);
  `);
}

import type { MigrationDatabase } from "../migrationPlan";

export async function migrateCustomerPriceListUpgradeV22(db: MigrationDatabase): Promise<void> {
  for (const [column, definition] of [
    ["data_ref", "TEXT"],
    ["acquisto_eur", "REAL"],
    ["perc_acquisto", "REAL"],
    ["data_acquisto", "TEXT"],
    ["fornitore", "TEXT"],
  ]) {
    await db.addColumnIfMissing("listini_clienti", column, definition);
  }
  await db.addColumnIfMissing("listini_clienti", "acquisto_old", "TEXT", `
    UPDATE listini_clienti SET acquisto_old = CAST(prezzo_acquisto AS TEXT)
    WHERE prezzo_acquisto IS NOT NULL AND acquisto_old IS NULL
  `);

  // 2. Tabella Cestino Listini Clienti (max 50 voci FIFO)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS listini_clienti_cestino (
      id TEXT PRIMARY KEY,
      deleted_at TEXT NOT NULL,
      deleted_by TEXT,
      cliente TEXT NOT NULL,
      fornitore TEXT,
      codice_articolo TEXT,
      descrizione TEXT NOT NULL,
      prezzo_fattura REAL,
      acquisto_eur REAL,
      perc_acquisto REAL,
      data_acquisto TEXT,
      acquisto_old TEXT,
      ricarico TEXT,
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


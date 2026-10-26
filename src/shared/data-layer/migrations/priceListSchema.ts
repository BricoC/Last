import type Database from "@tauri-apps/plugin-sql";

export async function migratePriceListsSchemaV11(db: Database): Promise<void> {
  // 1. Tabella Listino Generale (contiene sia listino_generale che listini_vari, per un totale di ~9763 articoli)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS listino_generale (
      id TEXT PRIMARY KEY,
      source_table TEXT NOT NULL DEFAULT 'listino_generale',
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
    CREATE INDEX IF NOT EXISTS idx_listino_gen_search 
    ON listino_generale(descrizione, codice_articolo, fornitore);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_listino_gen_codice 
    ON listino_generale(codice_articolo);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_listino_gen_fornitore 
    ON listino_generale(fornitore);
  `);

  // 2. Tabella Listini Clienti (~18558 voci con prezzi dedicati per cliente)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS listini_clienti (
      id TEXT PRIMARY KEY,
      cliente TEXT NOT NULL,
      codice_articolo TEXT,
      descrizione TEXT NOT NULL,
      prezzo_fattura REAL,
      prezzo_acquisto REAL,
      ricarico REAL,
      note TEXT,
      note1 TEXT,
      note2 TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_listini_clienti_cliente 
    ON listini_clienti(cliente);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_listini_clienti_search 
    ON listini_clienti(cliente, descrizione, codice_articolo);
  `);
}

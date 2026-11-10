import Database from "@tauri-apps/plugin-sql";

export async function migrateSupplierPriceListsSchemaV27(db: Database): Promise<void> {
  // Tabella dei file listini indicizzati da cartella condivisa (OneDrive / Rete Locale)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS supplier_price_list_files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      file_path TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      file_date TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      last_modified_ms INTEGER NOT NULL DEFAULT 0,
      total_items INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL
    );
  `);

  // Tabella unificata degli articoli da listini fornitori
  await db.execute(`
    CREATE TABLE IF NOT EXISTS supplier_price_list_items (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES supplier_price_list_files(id) ON DELETE CASCADE,
      supplier_name TEXT NOT NULL,
      code TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      net_price REAL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'NR',
      barcode TEXT,
      list_date TEXT,
      brand TEXT,
      notes TEXT,
      extra_code TEXT,
      created_at TEXT NOT NULL
    );
  `);

  try {
    await db.execute("ALTER TABLE supplier_price_list_items ADD COLUMN net_price REAL DEFAULT 0;");
  } catch {
    // Colonna già presente
  }

  try {
    await db.execute("ALTER TABLE supplier_price_list_items ADD COLUMN extra_code TEXT;");
  } catch {
    // Colonna già presente
  }

  // Indici ad altissima velocità per ricerca istantanea su centinaia di migliaia di righe
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_spli_supplier ON supplier_price_list_items(supplier_name);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_spli_code ON supplier_price_list_items(code);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_spli_barcode ON supplier_price_list_items(barcode);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_spli_file_id ON supplier_price_list_items(file_id);
  `);
}


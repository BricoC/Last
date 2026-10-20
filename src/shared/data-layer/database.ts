import Database from "@tauri-apps/plugin-sql";

const DB_FILENAME = "sqlite:LastData.db";

let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

/**
 * Inizializza o restituisce l'istanza singleton di SQLite locale.
 * Esegue automaticamente le migrazioni delle tabelle e degli indici al primo avvio.
 */
export async function getDatabase(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const db = await Database.load(DB_FILENAME);

      // Esecuzione migrazioni schema
      await runMigrations(db);

      dbInstance = db;
      return db;
    } catch (err) {
      initPromise = null;
      console.error("[Database] Errore critico inizializzazione SQLite:", err);
      throw err;
    }
  })();

  return initPromise;
}

/**
 * Migrazioni versionate dello schema SQLite locale.
 */
async function runMigrations(db: Database): Promise<void> {
  // Tabella tracciamento migrazioni
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  // Tabella Prodotti / Listino
  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      description TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'NR',
      purchase_price_cents INTEGER NOT NULL DEFAULT 0,
      sale_price_cents INTEGER NOT NULL DEFAULT 0,
      vat_rate INTEGER NOT NULL DEFAULT 22,
      category TEXT,
      supplier TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );
  `);

  // Indice univoco parziale sul codice articolo (SOLO tra gli articoli attivi con deleted_at IS NULL)
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_active_code 
    ON products(code) 
    WHERE deleted_at IS NULL;
  `);

  // Indice per ricerche testuali veloci
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_products_search 
    ON products(description, code);
  `);

  // Indice per la sincronizzazione incrementale Outbox
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_products_sync 
    ON products(sync_status, updated_at);
  `);
}

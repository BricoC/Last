import Database from "@tauri-apps/plugin-sql";

const DB_FILENAME = "sqlite:LastData.db";

let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

interface Migration {
  version: number;
  name: string;
  up: (db: Database) => Promise<void>;
}

/**
 * Registro sequenziale delle migrazioni dello schema SQLite.
 * Ogni migrazione viene eseguita una sola volta e tracciata in `schema_migrations`.
 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "create_products_table_and_indexes",
    up: async (db: Database) => {
      // Tabella Prodotti
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

      // Indice univoco parziale: codice unico esclusivamente tra i record attivi (deleted_at IS NULL)
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_products_active_code 
        ON products(code) 
        WHERE deleted_at IS NULL;
      `);

      // Indice per ricerche veloci su codice e descrizione
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_products_search 
        ON products(description, code);
      `);

      // Indice per la futura sincronizzazione incrementale Outbox
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_products_sync 
        ON products(sync_status, updated_at);
      `);
    },
  },
];

/**
 * Inizializza o restituisce l'istanza singleton di SQLite locale.
 * Esegue automaticamente le migrazioni versionate al primo avvio.
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

      // Esecuzione migrazioni versionate
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
 * Motore di migrazione versionata: verifica lo storico e applica solo i nuovi delta.
 */
async function runMigrations(db: Database): Promise<void> {
  // 1. Assicura esistenza tabella tracciamento migrazioni
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  // 2. Recupera le versioni già applicate
  const appliedRows = await db.select<{ version: number }[]>(
    "SELECT version FROM schema_migrations"
  );
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  // 3. Esegue i delta in ordine progressivo
  for (const migration of MIGRATIONS) {
    if (!appliedSet.has(migration.version)) {
      console.log(`[Database] Applicazione migrazione v${migration.version}: ${migration.name}`);
      await migration.up(db);

      await db.execute(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)",
        [migration.version, migration.name, new Date().toISOString()]
      );
      console.log(`[Database] Migrazione v${migration.version} applicata con successo.`);
    }
  }
}

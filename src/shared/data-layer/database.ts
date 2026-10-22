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
  {
    version: 2,
    name: "upgrade_products_5decimal_support",
    up: async (db: Database) => {
      // Aggiungi colonne per memorizzazione monetaria a 5 cifre decimali (subunits scalate 100.000)
      await db.execute(`
        ALTER TABLE products ADD COLUMN purchase_price_subunits INTEGER NOT NULL DEFAULT 0;
      `);
      await db.execute(`
        ALTER TABLE products ADD COLUMN sale_price_subunits INTEGER NOT NULL DEFAULT 0;
      `);
      // Migrazione deterministica dai vecchi centesimi: cents * 1000 = subunits (zero perdita di precisione)
      await db.execute(`
        UPDATE products 
        SET purchase_price_subunits = purchase_price_cents * 1000,
            sale_price_subunits = sale_price_cents * 1000;
      `);
    },
  },
  {
    version: 3,
    name: "create_clients_table",
    up: async (db: Database) => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS clients (
          id TEXT PRIMARY KEY,
          code TEXT,
          business_name TEXT NOT NULL,
          address TEXT,
          city TEXT,
          postal_code TEXT,
          province TEXT,
          vat_number TEXT,
          fiscal_code TEXT,
          sdi_code TEXT,
          pec TEXT,
          payment_method TEXT,
          destination_name TEXT,
          destination_address TEXT,
          destination_city TEXT,
          phones_json TEXT DEFAULT '[]',
          notes TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          deleted_at TEXT,
          sync_status TEXT NOT NULL DEFAULT 'pending'
        );
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_clients_business_name 
        ON clients(business_name) 
        WHERE deleted_at IS NULL;
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_clients_search 
        ON clients(vat_number, fiscal_code);
      `);
    },
  },
  {
    version: 4,
    name: "create_ddt_documents_and_items_tables",
    up: async (db: Database) => {
      // Testate DDT
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ddt_documents (
          id TEXT PRIMARY KEY,
          doc_number INTEGER,
          year INTEGER NOT NULL,
          doc_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'bozza',
          client_id TEXT,
          client_name TEXT NOT NULL,
          client_address TEXT,
          client_city TEXT,
          client_vat TEXT,
          client_fiscal_code TEXT,
          client_sdi TEXT,
          client_phones_json TEXT DEFAULT '[]',
          destination_name TEXT,
          destination_address TEXT,
          destination_city TEXT,
          transport_reason TEXT DEFAULT 'Vendita',
          payment_method TEXT,
          order_reference TEXT,
          account_or_balance TEXT DEFAULT '',
          operator TEXT,
          goods_appearance TEXT,
          carriage_terms TEXT DEFAULT 'Franco stabilimento',
          packages_count TEXT,
          weight_kg TEXT,
          carrier TEXT,
          pickup_date_time TEXT,
          internal_notes TEXT,
          total_taxable_subunits INTEGER NOT NULL DEFAULT 0,
          total_vat_subunits INTEGER NOT NULL DEFAULT 0,
          total_document_subunits INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          deleted_at TEXT,
          sync_status TEXT NOT NULL DEFAULT 'pending'
        );
      `);

      // Indice parziale univoco per numero documento definitivo per anno (protezione anti-duplicati assoluta)
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ddt_number_year 
        ON ddt_documents(doc_number, year) 
        WHERE deleted_at IS NULL AND doc_number IS NOT NULL;
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_ddt_status_year 
        ON ddt_documents(status, year, doc_date);
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_ddt_client_name 
        ON ddt_documents(client_name);
      `);

      // Righe DDT
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ddt_items (
          id TEXT PRIMARY KEY,
          ddt_id TEXT NOT NULL REFERENCES ddt_documents(id) ON DELETE CASCADE,
          row_index INTEGER NOT NULL,
          product_id TEXT,
          code TEXT,
          description TEXT NOT NULL,
          unit TEXT DEFAULT 'NR',
          quantity TEXT NOT NULL DEFAULT '1',
          unit_price_subunits INTEGER NOT NULL DEFAULT 0,
          discount_pct TEXT DEFAULT '0',
          net_amount_subunits INTEGER NOT NULL DEFAULT 0,
          vat_rate INTEGER NOT NULL DEFAULT 22,
          vat_amount_subunits INTEGER NOT NULL DEFAULT 0,
          purchase_price_subunits INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_ddt_items_ddt_row 
        ON ddt_items(ddt_id, row_index);
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

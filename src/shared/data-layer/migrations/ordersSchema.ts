import Database from "@tauri-apps/plugin-sql";

/**
 * Migrazione v16: Tabelle per Order Manager
 * - `orders`: ordini attivi, archiviati e cestino
 * - `suppliers`: anagrafica fornitori
 * - `order_audit_logs`: storico modifiche e backup
 */
export async function migrateOrdersSchemaV16(db: Database): Promise<void> {
  // 1. Tabella Fornitori
  await db.execute(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      supabase_id INTEGER,
      name TEXT NOT NULL UNIQUE,
      representative TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      vat_number TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'synced'
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
  `);

  // 2. Tabella Ordini
  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      supabase_id INTEGER,
      order_date TEXT,
      supplier_name TEXT,
      article_code TEXT,
      description TEXT,
      quantity TEXT,
      price TEXT,
      ordered_date TEXT,
      notes TEXT,
      user_name TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      highlights TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'synced'
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(is_archived, is_deleted);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_orders_supplier ON orders(supplier_name);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_orders_article ON orders(article_code, description);
  `);

  // 3. Tabella Storico Operazioni / Audit Log
  await db.execute(`
    CREATE TABLE IF NOT EXISTS order_audit_logs (
      id TEXT PRIMARY KEY,
      supabase_id INTEGER,
      table_name TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      operation_date TEXT NOT NULL,
      user_name TEXT,
      old_data TEXT,
      new_data TEXT,
      summary TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_order_audit_date ON order_audit_logs(operation_date DESC);
  `);
}


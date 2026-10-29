import Database from "@tauri-apps/plugin-sql";

export async function migrateElectronicInvoicesSchemaV15(db: Database): Promise<void> {
  // 1. Tabella Testate Fatture Fornitori
  await db.execute(`
    CREATE TABLE IF NOT EXISTS supplier_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name TEXT NOT NULL,
      vat_number TEXT,
      fiscal_code TEXT,
      doc_number TEXT NOT NULL,
      doc_date TEXT NOT NULL,
      year INTEGER NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      taxable_amount REAL NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT,
      due_date TEXT,
      iban TEXT,
      bank_name TEXT,
      file_name TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(supplier_name, doc_number, doc_date)
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_supplier_inv_year ON supplier_invoices(year);
    CREATE INDEX IF NOT EXISTS idx_supplier_inv_date ON supplier_invoices(doc_date DESC);
    CREATE INDEX IF NOT EXISTS idx_supplier_inv_supplier ON supplier_invoices(supplier_name);
  `);

  // 2. Tabella Righe Articoli Fatture Fornitori
  await db.execute(`
    CREATE TABLE IF NOT EXISTS supplier_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER REFERENCES supplier_invoices(id) ON DELETE CASCADE,
      supplier_name TEXT NOT NULL,
      doc_number TEXT NOT NULL,
      doc_date TEXT NOT NULL,
      year INTEGER NOT NULL,
      line_number INTEGER,
      article_code TEXT,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT,
      unit_price REAL NOT NULL DEFAULT 0,
      discount_1 REAL NOT NULL DEFAULT 0,
      discount_2 REAL NOT NULL DEFAULT 0,
      discount_3 REAL NOT NULL DEFAULT 0,
      discounted_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 22,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_supplier_items_year ON supplier_invoice_items(year);
    CREATE INDEX IF NOT EXISTS idx_supplier_items_code ON supplier_invoice_items(article_code);
    CREATE INDEX IF NOT EXISTS idx_supplier_items_desc ON supplier_invoice_items(description);
    CREATE INDEX IF NOT EXISTS idx_supplier_items_supplier ON supplier_invoice_items(supplier_name);
    CREATE INDEX IF NOT EXISTS idx_supplier_items_doc ON supplier_invoice_items(supplier_name, doc_number, doc_date);
  `);
}


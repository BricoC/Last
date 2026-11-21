import type { MigrationDatabase } from "../migrationPlan";
import { migratePendingCloudWritesV31 } from "./pendingCloudWritesSchema";

export async function migrateInvoiceIssuerV39(db: MigrationDatabase): Promise<void> {
  // Older databases can have V31 and V37 recorded with some cloud columns missing.
  await migratePendingCloudWritesV31(db);
  await db.addColumnIfMissing("supplier_invoices", "project_url", "TEXT");

  const normalized = (column: string) =>
    `UPPER(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${column},''),' ',''),char(9),''),char(10),''),char(13),''))`;
  const vat = normalized("vat_number");
  const fiscalCode = normalized("fiscal_code");
  const issuer = `CASE WHEN ${vat} <> '' THEN 'vat:' || CASE
    WHEN LENGTH(${vat}) = 13 AND substr(${vat},1,2)='IT' AND substr(${vat},3) NOT GLOB '*[^0-9]*'
      THEN substr(${vat},3) ELSE ${vat} END
    WHEN ${fiscalCode} <> '' THEN 'cf:' || ${fiscalCode}
    ELSE 'name:' || UPPER(TRIM(supplier_name)) END`;

  await db.requireEmpty(
    `SELECT printf('%d record', COUNT(*)) FROM supplier_invoices
      GROUP BY ${issuer}, doc_number, doc_date HAVING COUNT(*) > 1 LIMIT 1`,
    "Fatture legacy con la stessa identità fiscale, numero e data. Verificare i duplicati prima della migrazione.",
  );
  await db.execute(`
    CREATE TABLE supplier_invoices_v39 (
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
      cloud_upload_pending INTEGER NOT NULL DEFAULT 0,
      cloud_uploaded_at TEXT,
      project_url TEXT,
      issuer_key TEXT NOT NULL,
      UNIQUE(issuer_key, doc_number, doc_date)
    );
  `);
  await db.execute(`INSERT INTO supplier_invoices_v39 (id, supplier_name, vat_number, fiscal_code, doc_number, doc_date, year, total_amount, taxable_amount, vat_amount, payment_method, due_date, iban, bank_name, file_name, notes, created_at, cloud_upload_pending, cloud_uploaded_at, project_url, issuer_key)
    SELECT id, supplier_name, vat_number, fiscal_code, doc_number, doc_date, year, total_amount, taxable_amount, vat_amount, payment_method, due_date, iban, bank_name, file_name, notes, created_at, cloud_upload_pending, cloud_uploaded_at, project_url, ${issuer} FROM supplier_invoices`);
  await db.execute(`
    CREATE TABLE supplier_invoice_items_v39 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER REFERENCES supplier_invoices_v39(id) ON DELETE CASCADE,
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
  await db.execute(`INSERT INTO supplier_invoice_items_v39 (id, invoice_id, supplier_name, doc_number, doc_date, year, line_number, article_code, description, quantity, unit, unit_price, discount_1, discount_2, discount_3, discounted_price, total_price, vat_rate, created_at)
    SELECT id, COALESCE(invoice_id, (SELECT id FROM supplier_invoices AS h
      WHERE h.supplier_name=i.supplier_name AND h.doc_number=i.doc_number AND h.doc_date=i.doc_date)), supplier_name, doc_number, doc_date, year, line_number, article_code, description, quantity, unit, unit_price, discount_1, discount_2, discount_3, discounted_price, total_price, vat_rate, created_at
    FROM supplier_invoice_items AS i`);
  await db.execute("DROP TABLE supplier_invoice_items");
  await db.execute("DROP TABLE supplier_invoices");
  await db.execute("ALTER TABLE supplier_invoices_v39 RENAME TO supplier_invoices");
  await db.execute("ALTER TABLE supplier_invoice_items_v39 RENAME TO supplier_invoice_items");
  await db.execute(`
    CREATE INDEX idx_supplier_inv_year ON supplier_invoices(year);
    CREATE INDEX idx_supplier_inv_date ON supplier_invoices(doc_date DESC);
    CREATE INDEX idx_supplier_inv_supplier ON supplier_invoices(supplier_name);
    CREATE INDEX idx_supplier_items_year ON supplier_invoice_items(year);
    CREATE INDEX idx_supplier_items_code ON supplier_invoice_items(article_code);
    CREATE INDEX idx_supplier_items_desc ON supplier_invoice_items(description);
    CREATE INDEX idx_supplier_items_supplier ON supplier_invoice_items(supplier_name);
    CREATE INDEX idx_supplier_items_doc ON supplier_invoice_items(supplier_name,doc_number,doc_date);
    CREATE INDEX idx_supplier_items_invoice ON supplier_invoice_items(invoice_id);
  `);
}

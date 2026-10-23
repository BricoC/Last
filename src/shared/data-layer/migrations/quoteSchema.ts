import type Database from "@tauri-apps/plugin-sql";

export async function migrateQuoteSchemaV6(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      quote_number INTEGER,
      year INTEGER NOT NULL,
      quote_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'bozza',
      client_id TEXT,
      client_name TEXT NOT NULL DEFAULT '',
      client_address TEXT,
      client_city TEXT,
      client_postal_code TEXT,
      client_province TEXT,
      client_vat TEXT,
      client_fiscal_code TEXT,
      client_sdi TEXT,
      client_pec TEXT,
      client_phones_json TEXT NOT NULL DEFAULT '[]',
      destination_name TEXT,
      destination_address TEXT,
      destination_city TEXT,
      subject TEXT NOT NULL DEFAULT '',
      global_discount_pct TEXT NOT NULL DEFAULT '0',
      validity_days INTEGER NOT NULL DEFAULT 30,
      payment_method TEXT,
      delivery_date TEXT,
      delivery_terms TEXT,
      default_supplier TEXT,
      internal_notes TEXT,
      customer_notes TEXT,
      converted_ddt_id TEXT,
      total_taxable_subunits INTEGER NOT NULL DEFAULT 0,
      total_vat_subunits INTEGER NOT NULL DEFAULT 0,
      total_document_subunits INTEGER NOT NULL DEFAULT 0,
      total_cost_subunits INTEGER NOT NULL DEFAULT 0,
      total_profit_subunits INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_active_number_year
    ON quotes(year, quote_number)
    WHERE deleted_at IS NULL AND quote_number IS NOT NULL;
  `);
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_converted_ddt
    ON quotes(converted_ddt_id)
    WHERE converted_ddt_id IS NOT NULL;
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_quotes_archive
    ON quotes(status, year, quote_date, deleted_at);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_quotes_client
    ON quotes(client_name, client_id, deleted_at);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS quote_items (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
      row_index INTEGER NOT NULL,
      product_id TEXT,
      supplier TEXT,
      supplier_item_code TEXT,
      code TEXT,
      description TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'NR',
      quantity TEXT NOT NULL DEFAULT '1',
      purchase_price_subunits INTEGER NOT NULL DEFAULT 0,
      markup_pct TEXT,
      base_unit_price_subunits INTEGER NOT NULL DEFAULT 0,
      effective_unit_price_subunits INTEGER NOT NULL DEFAULT 0,
      forced_unit_price_subunits INTEGER,
      discount_pct TEXT NOT NULL DEFAULT '0',
      effective_markup_pct TEXT,
      margin_pct TEXT,
      net_amount_subunits INTEGER NOT NULL DEFAULT 0,
      cost_total_subunits INTEGER NOT NULL DEFAULT 0,
      gross_profit_subunits INTEGER NOT NULL DEFAULT 0,
      vat_rate INTEGER NOT NULL DEFAULT 22 CHECK(vat_rate IN (0, 4, 10, 22)),
      vat_amount_subunits INTEGER NOT NULL DEFAULT 0,
      availability TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_quote_items_active_order
    ON quote_items(quote_id, deleted_at, row_index);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_quote_items_sync
    ON quote_items(sync_status, updated_at);
  `);
}

import type Database from "@tauri-apps/plugin-sql";

export async function migrateQuoteFavoritesSchemaV26(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS quote_favorite_items (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL DEFAULT 'Generale',
      description TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'NR',
      supplier TEXT,
      supplier_item_code TEXT,
      code TEXT,
      purchase_price_subunits INTEGER NOT NULL DEFAULT 0,
      markup_pct TEXT,
      base_unit_price_subunits INTEGER NOT NULL DEFAULT 0,
      forced_unit_price_subunits INTEGER,
      discount_pct TEXT NOT NULL DEFAULT '0',
      vat_rate INTEGER NOT NULL DEFAULT 22,
      availability TEXT,
      notes TEXT,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_quote_favorites_cat
    ON quote_favorite_items(category, deleted_at);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_quote_favorites_updated
    ON quote_favorite_items(updated_at DESC);
  `);
}


import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { buildMigrationPlan, type MigrationDatabase } from "./migrationPlan";
import { migratePendingCloudOperationsV34 } from "./migrations/pendingCloudOperationsSchema";
import {
  migrateDdtNumberReuseAfterSoftDeleteV9,
  migrateDdtInformationalRowsV10,
  migrateDdtNumberUniquenessV8,
  migrateDdtSchemaV5,
} from "./migrations/ddtSchema";
import { migrateQuoteSchemaV6 } from "./migrations/quoteSchema";
import { migrateCompanySettingsSchemaV7 } from "./migrations/companySettingsSchema";
import { migratePriceListsSchemaV11 } from "./migrations/priceListSchema";
import { migratePriceListLogSchemaV12 } from "./migrations/priceListLogSchema";
import { migrateElectronicInvoicesSchemaV15 } from "./migrations/electronicInvoicesSchema";
import { migrateOrdersSchemaV16 } from "./migrations/ordersSchema";
import { migrateOffersSchemaV17, migrateOffersSchemaV18 } from "./migrations/offersSchema";
import { migratePriceListTrashSchemaV19 } from "./migrations/priceListTrashSchema";
import { migrateEmailSettingsSchemaV20 } from "./migrations/emailSettingsSchema";
import { migrateQuoteTrashSchemaV21 } from "./migrations/quoteTrashSchema";
import { migrateCustomerPriceListUpgradeV22 } from "./migrations/customerPriceListSchema";
import { migrateNotesSchemaV23, migrateNotesSchemaV24 } from "./migrations/notesSchema";
import { migrateTrashSchemaV25 } from "./migrations/trashSchema";
import { migrateQuoteFavoritesSchemaV26 } from "./migrations/quoteFavoritesSchema";
import { migrateSupplierPriceListsSchemaV27 } from "./migrations/supplierPriceListsSchema";
import { migratePendingCloudWritesV31 } from "./migrations/pendingCloudWritesSchema";
import { migrateNoteDeletionsV32 } from "./migrations/noteDeletionsSchema";

const DB_FILENAME = "sqlite:LastData.db";

let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

interface Migration {
  version: number;
  name: string;
  up: (db: MigrationDatabase) => Promise<void>;
}

/**
 * Registro sequenziale delle migrazioni dello schema SQLite.
 * Ogni migrazione viene eseguita una sola volta e tracciata in `schema_migrations`.
 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "create_products_table_and_indexes",
    up: async (db: MigrationDatabase) => {
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
    up: async (db: MigrationDatabase) => {
      await db.addColumnIfMissing("products", "purchase_price_subunits", "INTEGER NOT NULL DEFAULT 0");
      await db.addColumnIfMissing("products", "sale_price_subunits", "INTEGER NOT NULL DEFAULT 0");
      await db.execute(`
        UPDATE products SET
          purchase_price_subunits = CASE WHEN purchase_price_subunits = 0 THEN purchase_price_cents * 1000 ELSE purchase_price_subunits END,
          sale_price_subunits = CASE WHEN sale_price_subunits = 0 THEN sale_price_cents * 1000 ELSE sale_price_subunits END
      `);
    },
  },
  {
    version: 3,
    name: "create_clients_table",
    up: async (db: MigrationDatabase) => {
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
    up: async (db: MigrationDatabase) => {
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
  {
    version: 5,
    name: "add_ddt_series_and_soft_delete_items",
    up: migrateDdtSchemaV5,
  },
  {
    version: 6,
    name: "create_quotes_and_quote_items",
    up: migrateQuoteSchemaV6,
  },
  {
    version: 7,
    name: "create_company_settings",
    up: migrateCompanySettingsSchemaV7,
  },
  {
    version: 8,
    name: "enforce_unique_ddt_number_per_year",
    up: migrateDdtNumberUniquenessV8,
  },
  {
    version: 9,
    name: "allow_ddt_number_reuse_after_soft_delete",
    up: migrateDdtNumberReuseAfterSoftDeleteV9,
  },
  {
    version: 10,
    name: "preserve_informational_ddt_rows",
    up: migrateDdtInformationalRowsV10,
  },
  {
    version: 11,
    name: "create_price_lists_tables",
    up: migratePriceListsSchemaV11,
  },
  {
    version: 12,
    name: "create_price_list_log_table",
    up: migratePriceListLogSchemaV12,
  },
  {
    version: 13,
    name: "add_client_destinations_price_lists_and_email",
    up: async (db: MigrationDatabase) => {
      await db.addColumnIfMissing("clients", "destinations_json", "TEXT DEFAULT '[]'");
      await db.addColumnIfMissing("clients", "price_lists_json", "TEXT DEFAULT '[]'");
      await db.addColumnIfMissing("clients", "email", "TEXT");
    },
  },
  {
    version: 14,
    name: "enrich_ddt_client_details",
    up: async (db: MigrationDatabase) => {
      await db.execute(`
        UPDATE ddt_documents
        SET 
          client_id = COALESCE(client_id, (SELECT c.id FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL LIMIT 1)),
          client_address = COALESCE(client_address, (SELECT c.address FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL LIMIT 1)),
          client_city = COALESCE(client_city, (SELECT (c.city || CASE WHEN c.province IS NOT NULL AND c.province != '' THEN ' ' || c.province ELSE '' END) FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL LIMIT 1)),
          client_vat = COALESCE(client_vat, (SELECT c.vat_number FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL LIMIT 1)),
          client_fiscal_code = COALESCE(client_fiscal_code, (SELECT c.fiscal_code FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL LIMIT 1)),
          client_sdi = COALESCE(client_sdi, (SELECT c.sdi_code FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL LIMIT 1))
        WHERE (client_address IS NULL OR client_address = '')
          AND client_name IS NOT NULL
          AND EXISTS (SELECT 1 FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL);
      `);
    },
  },
  {
    version: 15,
    name: "create_supplier_invoices_and_items",
    up: async (db: MigrationDatabase) => {
      await migrateElectronicInvoicesSchemaV15(db);
    },
  },
  {
    version: 16,
    name: "create_orders_suppliers_and_audit_tables",
    up: async (db: MigrationDatabase) => {
      await migrateOrdersSchemaV16(db);
    },
  },
  {
    version: 17,
    name: "create_offers_table",
    up: async (db: MigrationDatabase) => {
      await migrateOffersSchemaV17(db);
    },
  },
  {
    version: 18,
    name: "add_urgent_and_audit_fields_to_offers",
    up: async (db: MigrationDatabase) => {
      await migrateOffersSchemaV18(db);
    },
  },
  {
    version: 19,
    name: "create_price_list_trash_table",
    up: async (db: MigrationDatabase) => {
      await migratePriceListTrashSchemaV19(db);
    },
  },
  {
    version: 20,
    name: "create_email_settings_table",
    up: async (db: MigrationDatabase) => {
      await migrateEmailSettingsSchemaV20(db);
    },
  },
  {
    version: 21,
    name: "create_quote_trash_and_sequences_table",
    up: async (db: MigrationDatabase) => {
      await migrateQuoteTrashSchemaV21(db);
    },
  },
  {
    version: 22,
    name: "customer_price_list_upgrade_v22",
    up: async (db: MigrationDatabase) => {
      await migrateCustomerPriceListUpgradeV22(db);
    },
  },
  {
    version: 23,
    name: "create_notes_table",
    up: async (db: MigrationDatabase) => {
      await migrateNotesSchemaV23(db);
    },
  },
  {
    version: 24,
    name: "add_supabase_id_to_notes",
    up: async (db: MigrationDatabase) => {
      await migrateNotesSchemaV24(db);
    },
  },
  {
    version: 25,
    name: "create_notes_and_offers_trash_tables",
    up: async (db: MigrationDatabase) => {
      await migrateTrashSchemaV25(db);
    },
  },
  {
    version: 26,
    name: "create_quote_favorite_items_table",
    up: async (db: MigrationDatabase) => {
      await migrateQuoteFavoritesSchemaV26(db);
    },
  },
  {
    version: 27,
    name: "create_supplier_price_lists_tables",
    up: async (db: MigrationDatabase) => {
      await migrateSupplierPriceListsSchemaV27(db);
    },
  },
  {
    version: 28,
    name: "add_sdi_code_to_company_settings",
    up: async (db: MigrationDatabase) => {
      await db.addColumnIfMissing("company_settings", "sdi_code", "TEXT NOT NULL DEFAULT 'M5UXCR1'");
    },
  },
  {
    version: 29,
    name: "seed_client_price_lists_from_known_aliases",
    up: async (db: MigrationDatabase) => {
      const aliases: Record<string, string[]> = {
        "CARTIERE CARRARA": ["LIST_CARMA"],
        "TREVITECH": ["LIST_TREVI"],
        "WEPA ITALIA": ["LIST_WEPA LISTINO"],
        "FALEGNAMERIA BARSELLA": ["LIST_BARSELLA"],
        "FRUGOLI": ["LIST_FRUGOLI"],
        "CORAZZA": ["LIST_CORAZZA"],
        "DEL DEBBIO": ["LIST_DEL DEBBIO"],
        "FALCHETTI": ["LIST_FALCHETTI"],
        "LUCCHESI": ["LIST_LUCCHESI"],
        "PAPER GROUP": ["LIST_PAPER GROUP"],
        "SAN MARCO": ["LIST_SAN MARCO"],
        "SCA": ["LIST_SCA"],
        "TOSCOLI": ["LIST_TOSCOLI"],
        "VALMET": ["LIST_VALMET"],
        "VOITH": ["LIST_VOITH"],
        "ARTE DEL SERRAMENTO": ["LIST_ARTE DEL SERRAMENTO"],
        "ASSEM": ["LIST_ASSEM"],
        "KARTOGROUP": ["LIST_KARTOGROUP"],
        "CAMM": ["LIST_C.A.M.M."],
        "C.A.M.M.": ["LIST_C.A.M.M."],
      };

      for (const [name, lists] of Object.entries(aliases)) {
        await db.execute(
          `UPDATE clients 
           SET price_lists_json = $1 
           WHERE (price_lists_json IS NULL OR price_lists_json = '[]' OR price_lists_json = '')
             AND deleted_at IS NULL
             AND (
               UPPER(TRIM(business_name)) = UPPER($2)
               OR UPPER(TRIM(business_name)) LIKE '%' || UPPER($2) || '%'
             )`,
          [JSON.stringify(lists), name]
        );
      }
    },
  },
  {
    version: 30,
    name: "clear_placeholder_email_settings",
    up: async (db: MigrationDatabase) => {
      await db.execute(`
        UPDATE email_settings SET
          carrara_to = CASE WHEN carrara_to LIKE '%@cartierecarrara.com' THEN '' ELSE carrara_to END,
          carrara_cc = CASE WHEN carrara_cc LIKE '%@cartierecarrara.com' THEN '' ELSE carrara_cc END,
          wepa_salanetti_to = CASE WHEN wepa_salanetti_to LIKE '%@wepa.eu' THEN '' ELSE wepa_salanetti_to END,
          wepa_salanetti_cc = CASE WHEN wepa_salanetti_cc LIKE '%@wepa.eu' THEN '' ELSE wepa_salanetti_cc END,
          wepa_ralletta_to = CASE WHEN wepa_ralletta_to LIKE '%@wepa.eu' THEN '' ELSE wepa_ralletta_to END,
          wepa_ralletta_cc = CASE WHEN wepa_ralletta_cc LIKE '%@wepa.eu' THEN '' ELSE wepa_ralletta_cc END,
          bank_to = CASE WHEN bank_to LIKE '%@bpc.bcc.it' THEN '' ELSE bank_to END,
          bank_cc = CASE WHEN bank_cc LIKE '%@bpc.bcc.it' THEN '' ELSE bank_cc END,
          accountant_to = CASE WHEN accountant_to LIKE '%@studiotaddeucci.it' THEN '' ELSE accountant_to END
        WHERE id = 'email_config';
      `);
    },
  },
  {
    version: 31,
    name: "track_pending_price_list_and_invoice_writes",
    up: migratePendingCloudWritesV31,
  },
  {
    version: 32,
    name: "persist_pending_note_deletions",
    up: migrateNoteDeletionsV32,
  },
  {
    version: 33,
    name: "repair_previously_unverified_columns",
    up: async (db: MigrationDatabase) => {
      await migratePriceListLogSchemaV12(db);
      await migrateOffersSchemaV18(db);
      await migrateQuoteTrashSchemaV21(db);
      await migrateNotesSchemaV24(db);
      await migrateSupplierPriceListsSchemaV27(db);
      await db.addColumnIfMissing("company_settings", "sdi_code", "TEXT NOT NULL DEFAULT 'M5UXCR1'");
    },
  },
  {
    version: 34,
    name: "persist_pending_cloud_operations",
    up: migratePendingCloudOperationsV34,
  },
];

const BUSY_RETRY_DELAYS_MS = [150, 300, 600, 1200, 2000];

export function isSqliteBusyError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("database is locked") ||
    msg.includes("database table is locked") ||
    msg.includes("(code: 5)") ||
    msg.includes("sqlite_busy")
  );
}

export async function withSqliteBusyRetry<T>(op: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= BUSY_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (!isSqliteBusyError(err) || attempt === BUSY_RETRY_DELAYS_MS.length) {
        throw err;
      }
      const jitter = Math.floor(Math.random() * 100);
      await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_DELAYS_MS[attempt] + jitter));
    }
  }
  throw lastErr;
}

function wrapDatabaseWithBusyRetry(db: Database): Database {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "execute") {
        return (query: string, bindValues?: unknown[]) =>
          withSqliteBusyRetry(() => target.execute(query, bindValues));
      }
      if (prop === "select") {
        return <T>(query: string, bindValues?: unknown[]) =>
          withSqliteBusyRetry(() => target.select<T>(query, bindValues));
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

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
      await withSqliteBusyRetry(() => invoke("initialize_local_database"));
      await runMigrations();
      const db = wrapDatabaseWithBusyRetry(Database.get(DB_FILENAME));

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
async function runMigrations(): Promise<void> {
  const migrations = await Promise.all(MIGRATIONS.map(async ({ version, name, up }) => ({
    version,
    name,
    steps: await buildMigrationPlan(up),
  })));
  await withSqliteBusyRetry(() => invoke("run_local_migrations", { migrations }));
}

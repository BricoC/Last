import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { buildMigrationPlan, MigrationDatabase } from "@/shared/data-layer/migrationPlan";

const { invoke, get } = vi.hoisted(() => ({ invoke: vi.fn(), get: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke,
  isTauri: () => true,
}));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { get } }));

type PlannedMigration = { version: number; name: string; steps: Awaited<ReturnType<typeof buildMigrationPlan>> };

function createFullSqliteAdapter(sqlite: DatabaseSync) {
  const bindParams = (params: unknown[]) =>
    Object.fromEntries(params.map((v, i) => [`$${i + 1}`, (v === undefined ? null : v) as SQLInputValue]));

  const adapter: Omit<MigrationDatabase, "execute"> & {
    select: <T>(sql: string, params?: unknown[]) => Promise<T>;
    execute: (sql: string, params?: unknown[]) => Promise<{ rowsAffected: number; lastInsertId: number }>;
  } = {
    async execute(sql: string, params: unknown[] = []) {
      if (!params.length) {
        sqlite.exec(sql);
        return { rowsAffected: 0, lastInsertId: 0 };
      }
      const info = sqlite.prepare(sql).run(bindParams(params));
      return { rowsAffected: Number(info.changes ?? 0), lastInsertId: Number(info.lastInsertRowid ?? 0) };
    },
    async select<T>(sql: string, params: unknown[] = []) {
      const stmt = sqlite.prepare(sql);
      const rows = params.length ? stmt.all(bindParams(params)) : stmt.all();
      return rows as unknown as T;
    },
    async addColumnIfMissing(table, column, definition, backfill) {
      const exists = sqlite.prepare("SELECT 1 FROM pragma_table_info(?) WHERE name = ?").get(table, column);
      if (!exists) {
        sqlite.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
        if (backfill) sqlite.exec(backfill);
      }
    },
    async requireEmpty(sql, message) {
      if (sqlite.prepare(sql).get()) throw new Error(message);
    },
  };
  return adapter;
}

async function runPlan(db: Omit<MigrationDatabase, "execute"> & { execute: (sql: string, params?: unknown[]) => Promise<unknown> }, migration: PlannedMigration) {
  for (const step of migration.steps) {
    switch (step.kind) {
      case "write":
        await db.execute(step.write.sql, step.write.params);
        break;
      case "addColumn":
        await db.addColumnIfMissing(step.table, step.column, step.definition, step.backfill);
        break;
      case "requireEmpty":
        await db.requireEmpty(step.sql, step.message);
        break;
    }
  }
}

function setupFreshMigratedDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = createFullSqliteAdapter(sqlite);
  get.mockReturnValue(db);

  invoke.mockImplementation(async (command: string, params?: Record<string, unknown>) => {
    if (command === "initialize_local_database") return undefined;
    if (command === "run_local_migrations") {
      const migrations = (params?.migrations ?? []) as PlannedMigration[];
      for (const m of migrations) {
        await runPlan(db, m);
      }
      return undefined;
    }
    if (command === "apply_local_database_batch") {
      const writes = (params?.writes ?? []) as { sql: string; params?: unknown[]; expectedRows?: number }[];
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        for (const w of writes) {
          const res = await db.execute(w.sql, w.params ?? []);
          if (w.expectedRows !== undefined && res.rowsAffected !== w.expectedRows) {
            throw new Error("I dati locali sono cambiati durante l'operazione");
          }
        }
        sqlite.exec("COMMIT");
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
      return undefined;
    }
    if (command === "write_backup_file") return 1024;
    if (command === "clean_old_backups") return 0;
    if (command === "send_order_email") return undefined;
    if (command === "load_supabase_config") {
      return { config: { projectUrl: "https://proj-a.supabase.co", anonKey: "anon-key-a" } };
    }
    return undefined;
  });

  return { sqlite, db };
}

describe("Audit Remediation Regression Suite", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("AUD-04: executeModularBackup succeeds on a fresh migrated DB including ddt and settings", async () => {
    const { sqlite } = setupFreshMigratedDb();
    try {
      const { getDatabase } = await import("@/shared/data-layer/database");
      await getDatabase();

      const { executeModularBackup } = await import("@/features/settings/services/backupService");
      const res = await executeModularBackup("C:\\tmp\\backups", ["ddt", "settings"]);
      expect(res.success).toBe(true);
      expect(res.tableCounts.ddt_logs).toBe(0);
      expect(res.tableCounts.ddt_sync_snapshots).toBe(0);
      expect(res.tableCounts.app_users).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it("AUD-05: restoreDdt and restoreQuoteFromTrash do NOT resurrect previously deleted items", async () => {
    const { sqlite } = setupFreshMigratedDb();
    try {
      const { getDatabase } = await import("@/shared/data-layer/database");
      await getDatabase();

      const t1 = "2026-01-10T10:00:00.000Z";
      const t2 = "2026-01-11T12:00:00.000Z";
      sqlite.prepare(`
        INSERT INTO ddt_documents (
          id, doc_number, year, doc_date, status, client_name,
          total_taxable_subunits, total_vat_subunits, total_document_subunits,
          deleted_at, created_at, updated_at, updated_by, sync_status
        ) VALUES (
          'ddt-1', 1, 2026, '2026-01-10', 'confermato', 'Cliente Test',
          10000000, 2200000, 12200000, ?, ?, ?, 'Op', 'synced'
        )
      `).run(t2, t1, t2);
      sqlite.prepare(`
        INSERT INTO ddt_items (
          id, ddt_id, row_index, description, quantity, unit,
          unit_price_subunits, net_amount_subunits, vat_rate, vat_amount_subunits,
          deleted_at, created_at, updated_at, updated_by, sync_status
        ) VALUES (
          'item-active', 'ddt-1', 0, 'Articolo valido', '1', 'NR',
          10000000, 10000000, 22, 2200000, ?, ?, ?, 'Op', 'synced'
        )
      `).run(t2, t1, t2);
      sqlite.prepare(`
        INSERT INTO ddt_items (
          id, ddt_id, row_index, description, quantity, unit,
          unit_price_subunits, net_amount_subunits, vat_rate, vat_amount_subunits,
          deleted_at, created_at, updated_at, updated_by, sync_status
        ) VALUES (
          'item-old-deleted', 'ddt-1', 1, 'Articolo rimosso prima', '1', 'NR',
          50000000, 50000000, 22, 11000000, ?, ?, ?, 'Op', 'synced'
        )
      `).run(t1, t1, t1);

      const { ddtRepository } = await import("@/features/ddt-studio/services/ddtRepository");
      const restored = await ddtRepository.restoreDdt("ddt-1");
      expect(restored.success).toBe(true);

      const activeItems = sqlite
        .prepare("SELECT id FROM ddt_items WHERE ddt_id = 'ddt-1' AND deleted_at IS NULL")
        .all() as { id: string }[];
      expect(activeItems.map((i) => i.id)).toEqual(["item-active"]);

      sqlite.prepare(`
        INSERT INTO quotes (
          id, quote_number, year, quote_date, status, client_name,
          total_taxable_subunits, total_vat_subunits, total_document_subunits,
          deleted_at, created_at, updated_at, updated_by, sync_status
        ) VALUES (
          'q-1', 1, 2026, '2026-01-10', 'bozza', 'Cliente Test',
          20000000, 4400000, 24400000, ?, ?, ?, 'Op', 'synced'
        )
      `).run(t2, t1, t2);
      sqlite.prepare(`
        INSERT INTO quote_items (
          id, quote_id, row_index, description, quantity, unit,
          net_amount_subunits, vat_rate, vat_amount_subunits,
          deleted_at, created_at, updated_at, updated_by, sync_status
        ) VALUES (
          'qi-active', 'q-1', 0, 'Voce attiva', '1', 'NR',
          20000000, 22, 4400000, ?, ?, ?, 'Op', 'synced'
        )
      `).run(t2, t1, t2);
      sqlite.prepare(`
        INSERT INTO quote_items (
          id, quote_id, row_index, description, quantity, unit,
          net_amount_subunits, vat_rate, vat_amount_subunits,
          deleted_at, created_at, updated_at, updated_by, sync_status
        ) VALUES (
          'qi-old-deleted', 'q-1', 1, 'Voce cancellata prima', '1', 'NR',
          90000000, 22, 19800000, ?, ?, ?, 'Op', 'synced'
        )
      `).run(t1, t1, t1);
      sqlite.prepare(`
        INSERT INTO quotes_trash (id, quote_number, year, quote_date, client_name, total_document_subunits, deleted_at, deleted_by, data_json)
        VALUES ('q-1', 1, 2026, '2026-01-10', 'Cliente Test', 24400000, ?, 'Op', '{}')
      `).run(t2);

      const { quoteRepository } = await import("@/features/quotes/services/quoteRepository");
      await quoteRepository.restoreQuoteFromTrash("q-1");

      const activeQuoteItems = sqlite
        .prepare("SELECT id FROM quote_items WHERE quote_id = 'q-1' AND deleted_at IS NULL")
        .all() as { id: string }[];
      expect(activeQuoteItems.map((i) => i.id)).toEqual(["qi-active"]);
    } finally {
      sqlite.close();
    }
  });

  it("AUD-06: clientRepository & offersRepository.deleteOffer preserve active/origin project_url even on cold cache", async () => {
    const { sqlite } = setupFreshMigratedDb();
    try {
      const { getDatabase } = await import("@/shared/data-layer/database");
      await getDatabase();

      const { setLastKnownSupabaseProjectUrl } = await import("@/shared/services/supabaseConfigCache");
      setLastKnownSupabaseProjectUrl(null);

      const { clientRepository } = await import("@/features/clients/services/clientRepository");
      const created = await clientRepository.createOrUpdateClient({ business_name: "Cliente Cold Cache" });
      const clientRow = sqlite
        .prepare("SELECT project_url FROM clients WHERE id = ?")
        .get(created.id) as { project_url: string | null };
      expect(clientRow.project_url).toBe("https://proj-a.supabase.co");

      setLastKnownSupabaseProjectUrl(null);
      sqlite.prepare(`
        INSERT INTO offers (id, supabase_id, offer_date, requester, contact, items_text, status, is_urgent, is_archived, created_by, updated_by, created_at, updated_at, sync_status, project_url)
        VALUES ('off-1', 42, '2026-01-10', 'Mario', '', 'Merce', 'Da preparare', 0, 0, 'Op', 'Op', '2026-01-10T00:00:00Z', '2026-01-10T00:00:00Z', 'synced', 'https://proj-a.supabase.co')
      `).run();

      const { offersRepository } = await import("@/features/offers/services/offersRepository");
      await offersRepository.deleteOffer("off-1");

      const op = sqlite
        .prepare("SELECT project_url FROM pending_cloud_operations WHERE scope = 'offers' AND record_id = 'off-1'")
        .get() as { project_url: string | null };
      expect(op.project_url).toBe("https://proj-a.supabase.co");
    } finally {
      sqlite.close();
    }
  });

  it("AUD-09: orderEmailService escapes HTML payloads in supplier email body", async () => {
    const { orderEmailService } = await import("@/features/orders/services/orderEmailService");
    const payload = '<img src=x onerror=alert(1)><b>INJECTED</b>';
    await orderEmailService.sendOrderEmail({
      supplierName: "Fornitore Test",
      supplier: { id: "s1", name: "Fornitore Test", email: "fornitore@example.test" } as never,
      logoUrlOrPath: 'javascript:alert(1)" onerror="alert(2)',
      items: [
        {
          id: "1",
          supplier: "Fornitore Test",
          article_code: "COD<script>1</script>",
          description: payload,
          quantity: 1,
          price: "10",
          order_date: "2026-01-01",
          notes: '<a href="https://evil.example">CLICCA</a>',
          status: "Da Ordinare",
        } as never,
      ],
    });

    const call = invoke.mock.calls.find(([cmd]) => cmd === "send_order_email");
    expect(call).toBeDefined();
    const body = (call![1] as { body: string }).body;
    expect(body).not.toContain("<img src=x");
    expect(body).not.toContain("<script>");
    expect(body).not.toContain('<a href="https://evil.example">');
    expect(body).not.toContain("javascript:alert");
    expect(body).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("AUD-11: mapHeaderForLocal preserves 'annullato' DDT status", async () => {
    const { mapHeaderForLocal } = await import("@/features/settings/data-import/ddtReadOnlyPreviewService");
    const mapped = mapHeaderForLocal({
      id: "ddt-ann",
      numero: 7,
      anno: 2026,
      data: "2026-02-01",
      stato: "annullato",
      cliente: "DDT ANNULLATO",
      indirizzo: null,
      citta: null,
      piva: null,
      cod_fiscale: null,
      sdi: null,
      telefoni: null,
      destinazione: null,
      citta_dest: null,
      causale: null,
      pagamento: null,
      nr_vs_ordine: null,
      operatore: null,
      aspetto: null,
      porto: null,
      colli: null,
      peso_kg: null,
      vettore: null,
      note: null,
      totale_imponibile: 0,
      totale_iva: 0,
      totale_documento: 0,
      created_at: "2026-02-01T10:00:00Z",
      ultima_modifica: "2026-02-01T10:00:00Z",
    });
    expect(mapped.status).toBe("annullato");
  });

  it("AUD-14: AppUserService preserves explicit empty allowed_pages=[] for non-admin users", async () => {
    const { sqlite } = setupFreshMigratedDb();
    try {
      const { getDatabase } = await import("@/shared/data-layer/database");
      await getDatabase();

      const { AppUserService } = await import("@/shared/services/appUserService");
      await AppUserService.ensureTable();
      sqlite.prepare(`
        INSERT INTO app_users (
          id, name, station_name, can_access_settings, can_access_ddt, can_access_price_lists,
          can_edit_price_lists, can_edit_or_numbers, is_admin, allowed_pages,
          theme_preset, theme_brightness, password_hash, require_password, created_at
        ) VALUES (
          'u-restricted', 'Limitato', 'PC-2', 0, 1, 1, 0, 0, 0, '[]', 'grigio', 4, '', 0, '2026-01-01T00:00:00Z'
        )
      `).run();

      const users = await AppUserService.getAllUsers();
      const restricted = users.find((u) => u.id === "u-restricted");
      expect(restricted).toBeDefined();
      expect(restricted!.allowed_pages).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("AUD-18: folderPathsSettings has no hardcoded workstation paths and persists user values", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
    try {
      const {
        loadFolderPathsConfig,
        saveFolderPathsConfig,
        getOneDriveGeneraleFilePath,
      } = await import("@/features/settings/services/folderPathsSettings");

      const initial = loadFolderPathsConfig();
      expect(JSON.stringify(initial)).not.toMatch(/BricoClassFiles/i);
      expect(initial.supplierPriceListsDir).toBe("");
      expect(initial.oneDriveClientiDir).toBe("");

      saveFolderPathsConfig({
        ...initial,
        supplierPriceListsDir: "C:\\Custom\\Fornitori",
        oneDriveGeneraliDir: "C:\\Custom\\Generali",
      });
      const reloaded = loadFolderPathsConfig();
      expect(reloaded.supplierPriceListsDir).toBe("C:\\Custom\\Fornitori");
      expect(getOneDriveGeneraleFilePath(reloaded)).toBe("C:\\Custom\\Generali\\LISTINO GENERALE.xlsm");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

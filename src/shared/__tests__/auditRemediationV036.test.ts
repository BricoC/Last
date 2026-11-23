import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import SUPABASE_STATION_ACCESS_SQL from "@/features/settings/data-import/supabaseStationAccess.sql?raw";

const sqliteRef: { db: DatabaseSync | null } = { db: null };

function createRealSqliteAdapter(sqlite: DatabaseSync) {
  return {
    async execute(sql: string, params: unknown[] = []) {
      if (!params.length) {
        sqlite.exec(sql);
        return { rowsAffected: 0, lastInsertId: 0 };
      }
      const res = sqlite
        .prepare(sql)
        .run(Object.fromEntries(params.map((v, i) => [`$${i + 1}`, (v === undefined ? null : v) as SQLInputValue])));
      return { rowsAffected: Number(res.changes ?? 0), lastInsertId: Number(res.lastInsertRowid ?? 0) };
    },
    async select<T>(sql: string, params: unknown[] = []): Promise<T> {
      const stmt = sqlite.prepare(sql);
      const rows = params.length
        ? stmt.all(Object.fromEntries(params.map((v, i) => [`$${i + 1}`, (v === undefined ? null : v) as SQLInputValue])))
        : stmt.all();
      return rows as unknown as T;
    },
  };
}

const mockInvoke = vi.fn();
const mockSupabaseFetch = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  isTauri: () => true,
}));

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: async () => createRealSqliteAdapter(sqliteRef.db!),
}));

vi.mock("@/shared/data-layer/localDatabaseBatch", () => ({
  applyLocalDatabaseBatch: async (writes: Array<{ sql: string; params: unknown[]; expectedRows?: number }>) => {
    const db = sqliteRef.db!;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const w of writes) {
        const res = w.params.length
          ? db.prepare(w.sql).run(Object.fromEntries(w.params.map((v, i) => [`$${i + 1}`, (v === undefined ? null : v) as SQLInputValue])))
          : (db.exec(w.sql), { changes: 0 });
        if (w.expectedRows !== undefined && Number(res.changes ?? 0) !== w.expectedRows) {
          throw new Error(`Expected ${w.expectedRows} rows, got ${res.changes}`);
        }
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  },
}));

vi.mock("@/shared/services/supabaseSession", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  requireSupabaseAccess: vi.fn(async () => "token"),
  getAuthenticatedSupabaseClient: vi.fn(async () => null),
}));

import {
  saveCompanySettings,
  pullCompanySettingsFromSupabase,
  getCompanySettings,
  clearCompanySettingsCache,
  retryPendingCompanySettings,
} from "@/features/settings/companySettingsRepository";
import {
  saveEmailSettings,
  pullEmailSettingsFromSupabase,
  getEmailSettings,
  retryPendingEmailSettings,
} from "@/features/settings/emailSettingsRepository";
import { invalidateSupabaseConfigCache } from "@/shared/services/supabaseConfigCache";
import { priceListSyncService } from "@/features/price-lists/services/priceListSyncService";
import { ddtRepository } from "@/features/ddt-studio/services/ddtRepository";
import { pullDdtChanges } from "@/features/ddt-studio/services/ddtCloudPull";
import { OrNumbersRepository } from "@/features/or-numbers/services/orNumbersRepository";
import { cloudSyncStatusService } from "@/shared/services/cloudSyncStatusService";
import { saveLocalRibaPaid, getLocalRibaStatus } from "@/features/dashboard/services/ribaService";
import { flushPendingCloudOperations, getLegacyPendingOperationsCount } from "@/shared/data-layer/pendingCloudOperations";
import { OrderEmailService } from "@/features/orders/services/orderEmailService";
import { backupLocalSqliteTable } from "@/features/manual-cloud-import/services/manualPriceListImportService";
import { extractPkcs7ContentBytes } from "@/features/invoices/services/invoiceXmlParser";

describe("Audit Remediation v0.3.6 (AUD-01 .. AUD-07, AUD-10)", () => {
  beforeEach(() => {
    sqliteRef.db?.close();
    const db = new DatabaseSync(":memory:");
    sqliteRef.db = db;
    mockInvoke.mockReset();
    mockSupabaseFetch.mockReset();
    clearCompanySettingsCache();
    invalidateSupabaseConfigCache();

    db.exec(`
      CREATE TABLE company_settings (
        id TEXT PRIMARY KEY,
        business_name TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        postal_code TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        province TEXT NOT NULL DEFAULT '',
        vat_number TEXT NOT NULL DEFAULT '',
        fiscal_code TEXT NOT NULL DEFAULT '',
        sdi_code TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        logo_data_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE TABLE email_settings (
        id TEXT PRIMARY KEY,
        carrara_to TEXT NOT NULL DEFAULT '',
        carrara_cc TEXT NOT NULL DEFAULT '',
        wepa_salanetti_to TEXT NOT NULL DEFAULT '',
        wepa_salanetti_cc TEXT NOT NULL DEFAULT '',
        wepa_ralletta_to TEXT NOT NULL DEFAULT '',
        wepa_ralletta_cc TEXT NOT NULL DEFAULT '',
        bank_to TEXT NOT NULL DEFAULT '',
        bank_cc TEXT NOT NULL DEFAULT '',
        accountant_to TEXT NOT NULL DEFAULT '',
        accountant_cc TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE TABLE pending_cloud_operations (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,
        record_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        project_url TEXT
      );
      CREATE TABLE listino_generale (
        id TEXT PRIMARY KEY,
        source_table TEXT NOT NULL DEFAULT 'listino_generale',
        cat TEXT, fornitore TEXT, codice_articolo TEXT, data_ref TEXT,
        descrizione TEXT NOT NULL DEFAULT '', um TEXT DEFAULT 'NR.',
        perc_pub REAL, prezzo_pubblico REAL, perc_prof REAL, prezzo_profess REAL,
        perc_fatt REAL, prezzo_fattura REAL, prezzo_acquisto REAL,
        aumento REAL, r1 REAL, maga REAL, r2 REAL, perc_iva REAL DEFAULT 0.22,
        note TEXT, created_at TEXT, updated_at TEXT,
        sync_revision TEXT, cloud_write_key TEXT, remote_sync_revision TEXT
      );
      CREATE TABLE listini_clienti (
        id TEXT PRIMARY KEY,
        cliente TEXT NOT NULL DEFAULT '',
        descrizione TEXT NOT NULL DEFAULT '',
        sync_revision TEXT,
        remote_sync_revision TEXT
      );
      CREATE TABLE price_list_pull_state (
        project_url TEXT NOT NULL,
        table_name TEXT NOT NULL,
        revision TEXT NOT NULL,
        PRIMARY KEY (project_url, table_name)
      );
      CREATE TABLE ddt_documents (
        id TEXT PRIMARY KEY,
        doc_number INTEGER,
        year INTEGER NOT NULL,
        series TEXT DEFAULT '',
        doc_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'confermato',
        client_name TEXT NOT NULL DEFAULT '',
        total_document_subunits INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL DEFAULT 'system',
        deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        project_url TEXT
      );
      CREATE TABLE ddt_items (
        id TEXT PRIMARY KEY,
        ddt_id TEXT NOT NULL,
        row_index INTEGER NOT NULL DEFAULT 1,
        description TEXT NOT NULL DEFAULT '',
        deleted_at TEXT,
        updated_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );
      CREATE TABLE ddt_sync_snapshots (
        ddt_id TEXT PRIMARY KEY,
        remote_ultima_modifica TEXT,
        snapshot_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE ddt_logs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE quotes (id TEXT PRIMARY KEY, sync_status TEXT, deleted_at TEXT, project_url TEXT);
      CREATE TABLE clients (id TEXT PRIMARY KEY, sync_status TEXT, deleted_at TEXT, project_url TEXT);
      CREATE TABLE offers (id TEXT PRIMARY KEY, sync_status TEXT, project_url TEXT);
      CREATE TABLE notes (id TEXT PRIMARY KEY, sync_status TEXT, project_url TEXT);
      CREATE TABLE note_deletions (id TEXT PRIMARY KEY, project_url TEXT);
      CREATE TABLE supplier_invoices (id TEXT PRIMARY KEY, cloud_upload_pending INTEGER, project_url TEXT);
      CREATE TABLE orders (id TEXT PRIMARY KEY, sync_status TEXT, project_url TEXT);
    `);

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_supabase_config") {
        return { config: { projectUrl: "https://demo.supabase.co", anonKey: "sb_publishable_test" } };
      }
      return null;
    });
  });

  it("AUD-01: supabaseStationAccess.sql creates public.company_settings before enabling RLS", () => {
    const createIdx = SUPABASE_STATION_ACCESS_SQL.indexOf("CREATE TABLE IF NOT EXISTS public.company_settings");
    const rlsLoopIdx = SUPABASE_STATION_ACCESS_SQL.indexOf("managed_tables constant text[]");
    expect(createIdx).toBeGreaterThan(-1);
    expect(rlsLoopIdx).toBeGreaterThan(createIdx);
  });

  it("AUD-02: pullCompanySettingsFromSupabase & pullEmailSettingsFromSupabase preserve local pending edits and retryPending pushes them", async () => {
    mockSupabaseFetch.mockRejectedValueOnce(new Error("Offline"));
    await saveCompanySettings({
      business_name: "Nuova Ragione Offline",
      address: "Via Nuova 1",
      postal_code: "55100",
      city: "Lucca",
      province: "LU",
      vat_number: "12345678901",
      fiscal_code: "12345678901",
      sdi_code: "ABC1234",
      phone: "0583",
      email: "new@test.it",
      logo_data_url: null,
    });

    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });

    mockSupabaseFetch
      .mockResolvedValueOnce(new Response(JSON.stringify("0"), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const status = await cloudSyncStatusService.getStatus(true);
    expect(status.hasPendingLocalChanges).toBe(true);

    // Pull must NOT overwrite pending local company_settings
    mockSupabaseFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: "company_profile", business_name: "Vecchia Cloud" }]), { status: 200 })
    );
    const pulledCompany = await pullCompanySettingsFromSupabase(false);
    expect(pulledCompany).toBeNull();
    clearCompanySettingsCache();
    expect((await getCompanySettings()).business_name).toBe("Nuova Ragione Offline");

    // Retry pushes pending company_settings and marks synced
    mockSupabaseFetch.mockResolvedValueOnce(new Response("", { status: 201 }));
    expect(await retryPendingCompanySettings()).toBe(true);
    clearCompanySettingsCache();
    expect((await getCompanySettings()).sync_status).toBe("synced");

    // Same for email_settings
    mockSupabaseFetch.mockRejectedValueOnce(new Error("Offline"));
    await saveEmailSettings({
      carrara_to: "nuova@carrara.test",
      carrara_cc: "",
      wepa_salanetti_to: "",
      wepa_salanetti_cc: "",
      wepa_ralletta_to: "",
      wepa_ralletta_cc: "",
      bank_to: "nuova@banca.test",
      bank_cc: "",
      accountant_to: "",
      accountant_cc: "",
    });
    mockSupabaseFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: "email_config", carrara_to: "vecchia@carrara.test" }]), { status: 200 })
    );
    expect(await pullEmailSettingsFromSupabase(false)).toBeNull();
    expect((await getEmailSettings()).carrara_to).toBe("nuova@carrara.test");

    mockSupabaseFetch.mockResolvedValueOnce(new Response("", { status: 201 }));
    expect(await retryPendingEmailSettings()).toBe(true);
  });

  it("AUD-03: ddtRepository.emptyTrash preserves pending tombstones and cleans synced snapshots", async () => {
    sqliteRef.db!.exec(`
      INSERT INTO ddt_documents (id, doc_number, year, doc_date, status, client_name, created_at, updated_at, deleted_at, sync_status, project_url)
      VALUES
        ('ddt-pending-del', 10, 2026, '2026-11-23', 'confermato', 'ACME', '2026-11-23T00:00:00Z', '2026-11-23T01:00:00Z', '2026-11-23T01:00:00Z', 'pending', 'https://demo.supabase.co'),
        ('ddt-synced-del', 11, 2026, '2026-11-23', 'confermato', 'ACME', '2026-11-23T00:00:00Z', '2026-11-23T01:00:00Z', '2026-11-23T01:00:00Z', 'synced', 'https://demo.supabase.co');
      INSERT INTO ddt_sync_snapshots (ddt_id, remote_ultima_modifica, snapshot_json, updated_at)
      VALUES
        ('ddt-pending-del', '2026-11-23T00:00:00Z', '{}', '2026-11-23T00:00:00Z'),
        ('ddt-synced-del', '2026-11-23T00:00:00Z', '{}', '2026-11-23T00:00:00Z');
    `);
    await ddtRepository.emptyTrash();
    expect(sqliteRef.db!.prepare("SELECT id FROM ddt_documents WHERE id='ddt-pending-del'").get()).toEqual({ id: "ddt-pending-del" });
    expect(sqliteRef.db!.prepare("SELECT id FROM ddt_documents WHERE id='ddt-synced-del'").get()).toBeUndefined();
    expect(sqliteRef.db!.prepare("SELECT ddt_id FROM ddt_sync_snapshots WHERE ddt_id='ddt-synced-del'").get()).toBeUndefined();
  });

  it("AUD-04: pullDdtChanges soft-deletes synced legacy project_url=NULL DDTs without deadlocking, while protecting other projects", async () => {
    sqliteRef.db!.exec(`
      INSERT INTO ddt_documents (id, doc_number, year, doc_date, status, client_name, created_at, updated_at, deleted_at, sync_status, project_url)
      VALUES
        ('ddt-legacy', 5, 2026, '2026-01-10', 'confermato', 'Legacy', '2026-01-10T00:00:00Z', '2026-01-10T00:00:00Z', NULL, 'synced', NULL),
        ('ddt-other-proj', 6, 2026, '2026-01-11', 'confermato', 'Other', '2026-01-11T00:00:00Z', '2026-01-11T00:00:00Z', NULL, 'synced', 'https://other.supabase.co');
      CREATE TABLE ddt_pull_state (project_url TEXT PRIMARY KEY, revision TEXT NOT NULL, initialized INTEGER NOT NULL DEFAULT 0);
      INSERT INTO ddt_pull_state VALUES ('https://demo.supabase.co', '10', 1);
    `);

    let call = 0;
    mockSupabaseFetch.mockImplementation(async () => {
      call++;
      if (call === 1) {
        return new Response(JSON.stringify([
          {
            id: "ddt-legacy",
            revision: "11",
            deletedAt: "2026-11-23T10:00:00Z",
            document: null,
          },
          {
            id: "ddt-other-proj",
            revision: "12",
            deletedAt: "2026-11-23T10:01:00Z",
            document: null,
          },
        ]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const pullRes = await pullDdtChanges("https://demo.supabase.co", "sb_publishable_test");
    expect(pullRes.deleted).toBe(1);
    expect(pullRes.deferred).toBe(1);
    const legacyRow = sqliteRef.db!.prepare("SELECT deleted_at FROM ddt_documents WHERE id='ddt-legacy'").get() as { deleted_at: string | null };
    expect(legacyRow.deleted_at).toBe("2026-11-23T10:00:00Z");
    const otherRow = sqliteRef.db!.prepare("SELECT deleted_at FROM ddt_documents WHERE id='ddt-other-proj'").get() as { deleted_at: string | null };
    expect(otherRow.deleted_at).toBeNull();
  });

  it("AUD-05: reconcileRemotePriceListDeletions removes ghost row even when another local row is pending", async () => {
    sqliteRef.db!.exec(`
      INSERT INTO listino_generale (id, source_table, descrizione, sync_revision, remote_sync_revision)
      VALUES ('gen_1', 'listino_generale', 'Eliminato su cloud', NULL, '10'),
             ('gen_2', 'listino_generale', 'Modificato offline', 'local-rev-1', '11');
      INSERT INTO price_list_pull_state (project_url, table_name, revision)
      VALUES ('https://demo.supabase.co', 'listino_generale', '11'),
             ('https://demo.supabase.co', 'listini_vari', '0');
    `);

    mockSupabaseFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("listino_generale") && url.includes("last_sync_revision=gt.11")) {
        return new Response(JSON.stringify([{ id: 3, descrizione: "Nuovo da PC B", last_sync_revision: 12 }]), { status: 200 });
      }
      if (url.includes("listini_vari") && url.includes("last_sync_revision=gt.0")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("listino_generale?select=id&limit=1")) {
        return new Response(JSON.stringify([{ id: 2 }]), { status: 200, headers: { "content-range": "0-0/2" } });
      }
      if (url.includes("listino_generale?select=id&order=id.asc")) {
        return new Response(JSON.stringify([{ id: 2 }, { id: 3 }]), { status: 200 });
      }
      if (url.includes("listini_vari?select=id&limit=1")) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-range": "*/0" } });
      }
      return new Response("[]", { status: 200 });
    });

    const res = await priceListSyncService.syncIncrementalGeneralFromSupabase();
    expect(res.error).toBeUndefined();
    expect(sqliteRef.db!.prepare("SELECT id FROM listino_generale WHERE id='gen_1'").get()).toBeUndefined();
    expect(sqliteRef.db!.prepare("SELECT id FROM listino_generale WHERE id='gen_2'").get()).toEqual({ id: "gen_2" });
    expect(sqliteRef.db!.prepare("SELECT id FROM listino_generale WHERE id='gen_3'").get()).toEqual({ id: "gen_3" });
  });

  it("AUD-07: OrNumbersRepository.updateLogsBatch stamps project_url even when config cache is cold", async () => {
    invalidateSupabaseConfigCache();
    mockSupabaseFetch.mockRejectedValueOnce(new Error("Offline"));
    await OrNumbersRepository.updateLogsBatch({ "2026-10": "inviato" });
    const op = sqliteRef.db!.prepare("SELECT scope, record_id, project_url FROM pending_cloud_operations WHERE scope='or_logs'").get() as Record<string, unknown>;
    expect(op).toEqual({ scope: "or_logs", record_id: "2026-10", project_url: "https://demo.supabase.co" });
  });

  it("AUD-10: ribaService isolates paid status per Supabase projectUrl", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    saveLocalRibaPaid("riba_30_11_2026", "30/11/2026", "2026-11-23T10:00:00Z", "https://proj-a.supabase.co");
    expect(getLocalRibaStatus("riba_30_11_2026", "https://proj-a.supabase.co")?.isPaid).toBe(true);
    expect(getLocalRibaStatus("riba_30_11_2026", "https://proj-b.supabase.co")).toBeNull();
  });

  it("AUD-09: legacyOperationsWarningCount is tracked per scope and not clobbered by other scopes", async () => {
    sqliteRef.db!.exec(`
      INSERT INTO pending_cloud_operations (scope, record_id, action, payload, project_url)
      VALUES ('offers', 'off-1', 'delete', '{}', NULL),
             ('offers', 'off-2', 'delete', '{}', NULL);
    `);
    await flushPendingCloudOperations("offers", async () => {}, "https://demo.supabase.co");
    expect(getLegacyPendingOperationsCount()).toBe(2);
    await flushPendingCloudOperations("quotes", async () => {}, "https://demo.supabase.co");
    expect(getLegacyPendingOperationsCount()).toBe(2);
  });

  it("AUD-12: blocks SVG logo data URLs, invalid SQLite backup table names, and deeply nested BER payloads", async () => {
    // 1. SVG logo blocked in order email HTML
    const emailService = new OrderEmailService();
    mockInvoke.mockResolvedValueOnce(undefined);
    await emailService.sendOrderEmail({
      supplierName: "Fornitore Test",
      items: [{
        id: "ord-1",
        order_date: "2026-11-23",
        supplier_name: "Fornitore Test",
        article_code: "A1",
        description: "Test",
        quantity: "1",
        price: "10",
        ordered_date: null,
        notes: "",
        user_name: "Op",
        is_archived: false,
        is_deleted: false,
        highlights: {},
        created_at: "2026-11-23T00:00:00Z",
        updated_at: "2026-11-23T00:00:00Z",
      }],
      logoUrlOrPath: "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=",
    });
    const sentCall = mockInvoke.mock.calls.find(([cmd]) => cmd === "send_order_email");
    expect(sentCall).toBeDefined();
    expect(String((sentCall?.[1] as { body: string }).body)).not.toContain("image/svg+xml");

    // 2. backupLocalSqliteTable rejects SQL injection table names
    await expect(backupLocalSqliteTable("listini_clienti; DROP TABLE clients;--")).rejects.toThrow("Nome tabella non valido");

    // 3. Deeply nested BER constructed tags do not cause stack overflow
    const oid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01];
    const nested = new Uint8Array(oid.length + 2 + 200);
    nested.set(oid, 0);
    nested[oid.length] = 0xa0;
    nested[oid.length + 1] = 0x80;
    for (let i = oid.length + 2; i < nested.length; i += 2) {
      nested[i] = 0x24;
      nested[i + 1] = 0x80;
    }
    expect(() => extractPkcs7ContentBytes(nested)).not.toThrow();
  });
});

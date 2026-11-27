import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

let memSqlite: DatabaseSync;

function createSqliteAdapter(sqlite: DatabaseSync) {
  return {
    async select<T>(sql: string, params: unknown[] = []): Promise<T> {
      const stmt = sqlite.prepare(sql);
      if (!params.length) return stmt.all() as T;
      if (!/\$\d+/.test(sql)) {
        return stmt.all(...params.map((v) => (v === undefined ? null : v) as SQLInputValue)) as T;
      }
      const bound = Object.fromEntries(
        params.map((v, i) => [`$${i + 1}`, (v === undefined ? null : v) as SQLInputValue])
      );
      return stmt.all(bound) as T;
    },
    async execute(sql: string, params: unknown[] = []) {
      const stmt = sqlite.prepare(sql);
      if (!params.length) {
        const res = stmt.run();
        return { rowsAffected: Number(res.changes), lastInsertId: Number(res.lastInsertRowid) };
      }
      const bound = Object.fromEntries(
        params.map((v, i) => [`$${i + 1}`, (v === undefined ? null : v) as SQLInputValue])
      );
      const res = stmt.run(bound);
      return { rowsAffected: Number(res.changes), lastInsertId: Number(res.lastInsertRowid) };
    },
  };
}

const mockInvoke = vi.fn().mockResolvedValue(null);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: async () => createSqliteAdapter(memSqlite),
  runMigrations: async () => {},
}));

vi.mock("@/shared/data-layer/localDatabaseBatch", () => ({
  applyLocalDatabaseBatch: async (writes: Array<{ sql: string; params?: unknown[] }>) => {
    const adapter = createSqliteAdapter(memSqlite);
    memSqlite.exec("BEGIN IMMEDIATE");
    try {
      for (const w of writes) {
        await adapter.execute(w.sql, w.params ?? []);
      }
      memSqlite.exec("COMMIT");
    } catch (e) {
      memSqlite.exec("ROLLBACK");
      throw e;
    }
  },
}));

const mockSupabaseFetch = vi.fn();
const mockGetAuthClient = vi.fn();
vi.mock("@/shared/services/supabaseSession", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  getAuthenticatedSupabaseClient: (...args: unknown[]) => mockGetAuthClient(...args),
  requireSupabaseAccess: async () => "token",
  SUPABASE_SESSION_UPDATED: "supabase-session-updated",
}));

const lsStore = new Map<string, string>();
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => lsStore.get(k) ?? null,
      setItem: (k: string, v: string) => { lsStore.set(k, String(v)); },
      removeItem: (k: string) => { lsStore.delete(k); },
      clear: () => { lsStore.clear(); },
    },
    configurable: true,
  });
}

Object.defineProperty(globalThis, "navigator", {
  value: { onLine: true },
  configurable: true,
});

beforeEach(() => {
  memSqlite = new DatabaseSync(":memory:");
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(null);
  mockSupabaseFetch.mockReset();
  mockGetAuthClient.mockReset();
  lsStore.clear();
});

describe("Audit Remediation Regression Suite (AUD-01 .. AUD-08)", () => {
  it("AUD-01: notesSyncService fetches all 2,500 notes across 3 pages without deleting local synced notes", async () => {
    const projectUrl = "https://proj-a.supabase.co";
    memSqlite.exec(`
      CREATE TABLE notes (
        id TEXT PRIMARY KEY, supabase_id INTEGER, title TEXT, content_html TEXT,
        content_text TEXT, is_pinned INTEGER, is_archived INTEGER, color TEXT,
        created_by TEXT, updated_by TEXT, created_at TEXT, updated_at TEXT,
        sync_status TEXT, project_url TEXT
      );
      CREATE TABLE note_deletions (id TEXT PRIMARY KEY, supabase_id INTEGER, deleted_at TEXT, project_url TEXT);
      CREATE TABLE notes_trash (id TEXT PRIMARY KEY, supabase_id INTEGER, project_url TEXT);
    `);

    const insert = memSqlite.prepare(`
      INSERT INTO notes (id, supabase_id, title, content_html, content_text, is_pinned, is_archived, color, created_by, updated_by, created_at, updated_at, sync_status, project_url)
      VALUES (?, ?, ?, '', '', 0, 0, 'default', 'op', 'op', '2026-01-01T00:00:00Z', ?, 'synced', ?)
    `);
    const allRemote: Array<Record<string, unknown>> = [];
    for (let i = 2500; i >= 1; i--) {
      const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
      insert.run(`note-${i}`, i, `Nota ${i}`, ts, projectUrl);
      allRemote.push({
        id: i,
        local_id: `note-${i}`,
        title: `Nota ${i}`,
        content_html: "",
        content_text: "",
        is_pinned: false,
        is_archived: false,
        color: "default",
        created_by: "op",
        updated_by: "op",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: ts,
      });
    }

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_supabase_config") {
        return { config: { projectUrl, anonKey: "sb_publishable_test" } };
      }
      return null;
    });

    let getCalls = 0;
    mockSupabaseFetch.mockImplementation(async (url: string) => {
      if (url.includes("/rest/v1/note?")) {
        getCalls++;
        if (getCalls === 1) {
          return new Response(JSON.stringify(allRemote.slice(0, 1000)), {
            status: 200,
            headers: { "content-range": "0-999/2500" },
          });
        }
        if (getCalls === 2) {
          return new Response(JSON.stringify(allRemote.slice(1000, 2000)), {
            status: 200,
            headers: { "content-range": "0-999/1500" },
          });
        }
        return new Response(JSON.stringify(allRemote.slice(2000, 2500)), {
          status: 200,
          headers: { "content-range": "0-499/500" },
        });
      }
      return new Response("[]", { status: 200 });
    });

    const { invalidateSupabaseConfigCache } = await import("@/shared/services/supabaseConfigCache");
    invalidateSupabaseConfigCache();
    const { notesSyncService } = await import("@/features/notes/services/notesSyncService");
    const res = await notesSyncService.sync();

    expect(res.success).toBe(true);
    expect(getCalls).toBe(3);
    const remaining = memSqlite.prepare("SELECT COUNT(*) as c FROM notes").get() as { c: number };
    expect(remaining.c).toBe(2500);
  });

  it("AUD-03: cloudSyncStatusService.executeFullSync reports notesSyncService.sync() failures", async () => {
    const { invalidateSupabaseConfigCache } = await import("@/shared/services/supabaseConfigCache");
    invalidateSupabaseConfigCache();

    const { priceListSyncService } = await import("@/features/price-lists/services/priceListSyncService");
    const { offersSyncService } = await import("@/features/offers/services/offersSyncService");
    const { clientSyncService } = await import("@/features/clients/services/clientSyncService");
    const { ddtIncrementalSyncService } = await import("@/features/ddt-studio/services/ddtIncrementalSyncService");
    const { QuoteSyncService } = await import("@/features/quotes/services/quoteSyncService");
    const { notesSyncService } = await import("@/features/notes/services/notesSyncService");
    const { orderSupabaseService } = await import("@/features/orders/services/orderSupabaseService");
    const { electronicInvoicesService } = await import("@/features/invoices/services/electronicInvoicesService");
    const { OrNumbersRepository } = await import("@/features/or-numbers/services/orNumbersRepository");
    const companyMod = await import("@/features/settings/companySettingsRepository");
    const emailMod = await import("@/features/settings/emailSettingsRepository");

    vi.spyOn(priceListSyncService, "retryPendingChanges").mockResolvedValue(0 as never);
    vi.spyOn(offersSyncService, "retryPendingChanges").mockResolvedValue(0 as never);
    vi.spyOn(offersSyncService, "sync").mockResolvedValue({ success: true, pushed: 0, pulled: 0 } as never);
    vi.spyOn(clientSyncService, "syncAllFromSupabase").mockResolvedValue({ synced: 0 } as never);
    vi.spyOn(QuoteSyncService, "retryPendingChanges").mockResolvedValue(0 as never);
    vi.spyOn(QuoteSyncService, "pullQuotes").mockResolvedValue({ pulled: 0 } as never);
    vi.spyOn(QuoteSyncService, "getLastRetryError").mockReturnValue(null);
    vi.spyOn(orderSupabaseService, "processOfflineQueue").mockResolvedValue(0);
    vi.spyOn(orderSupabaseService, "fetchOrders").mockResolvedValue([] as never);
    vi.spyOn(orderSupabaseService, "getLastQueueFailure").mockReturnValue(null);
    vi.spyOn(electronicInvoicesService, "retryPendingUploads").mockResolvedValue(0 as never);
    vi.spyOn(electronicInvoicesService, "syncFromSupabase").mockResolvedValue({ synced: 0 } as never);
    vi.spyOn(OrNumbersRepository, "retryPendingLogs").mockResolvedValue(0 as never);
    vi.spyOn(companyMod, "retryPendingCompanySettings").mockResolvedValue(true);
    vi.spyOn(emailMod, "retryPendingEmailSettings").mockResolvedValue(true);
    vi.spyOn(ddtIncrementalSyncService, "syncNewDdtsFromSupabase").mockResolvedValue({
      newHeadersCount: 0, newLinesCount: 0, backupPath: null,
    } as never);
    vi.spyOn(priceListSyncService, "syncIncrementalGeneralFromSupabase").mockResolvedValue({ updatedCount: 0 } as never);
    vi.spyOn(priceListSyncService, "syncIncrementalClientiFromSupabase").mockResolvedValue({ updatedCount: 0 } as never);

    vi.spyOn(notesSyncService, "sync").mockResolvedValue({
      success: false,
      pushed: 0,
      pulled: 0,
      error: "Download note: HTTP 500",
    });

    const { cloudSyncStatusService } = await import("@/shared/services/cloudSyncStatusService");
    const result = await cloudSyncStatusService.executeFullSync();

    expect(result.success).toBe(false);
    expect(result.summary).toContain("Note: Download note: HTTP 500");
    vi.restoreAllMocks();
  });

  it("AUD-04: offline Ri.Ba. payment resolves projectUrl, remains readable, and retries via pending_cloud_operations", async () => {
    memSqlite.exec(`
      CREATE TABLE app_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE pending_cloud_operations (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, record_id TEXT NOT NULL,
        action TEXT NOT NULL, payload TEXT NOT NULL, project_url TEXT
      );
    `);
    const projectUrl = "https://proj-a.supabase.co";
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_supabase_config") {
        return { config: { projectUrl, anonKey: "sb_publishable_test" } };
      }
      return null;
    });
    mockSupabaseFetch.mockRejectedValueOnce(new Error("offline"));

    const { invalidateSupabaseConfigCache } = await import("@/shared/services/supabaseConfigCache");
    invalidateSupabaseConfigCache();
    const {
      registerRibaPayment,
      getSqliteRibaStatus,
      getLocalRibaStatus,
      retryPendingRibaPayments,
    } = await import("@/features/dashboard/services/ribaService");

    const reg = await registerRibaPayment("riba_30_11_2026", "30/11/2026", "2026-11-27T10:00:00.000Z");
    expect(reg).toEqual({ confirmed: true, remote: false });

    const dbStatus = await getSqliteRibaStatus("riba_30_11_2026", projectUrl);
    const lsStatus = getLocalRibaStatus("riba_30_11_2026", projectUrl);
    expect(dbStatus?.isPaid).toBe(true);
    expect(lsStatus?.isPaid).toBe(true);

    // Now online: retry flushes queued Ri.Ba. payment
    mockSupabaseFetch.mockResolvedValueOnce(
      Response.json([{ deadline_key: "riba_30_11_2026", is_paid: true }])
    );
    const flushed = await retryPendingRibaPayments();
    expect(flushed).toBe(1);
    const remaining = memSqlite.prepare("SELECT COUNT(*) as c FROM pending_cloud_operations WHERE scope = 'riba'").get() as { c: number };
    expect(remaining.c).toBe(0);
  });

  it("AUD-05: restoreModularBackup preserves existing Admin password_hash and blocks non-admin app_users restore", async () => {
    memSqlite.exec(`
      CREATE TABLE app_users (
        id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, station_name TEXT NOT NULL DEFAULT '',
        can_access_settings INTEGER NOT NULL DEFAULT 1, can_access_ddt INTEGER NOT NULL DEFAULT 1,
        can_access_price_lists INTEGER NOT NULL DEFAULT 1, can_edit_price_lists INTEGER NOT NULL DEFAULT 0,
        can_edit_or_numbers INTEGER NOT NULL DEFAULT 0, can_manage_backups INTEGER NOT NULL DEFAULT 0,
        is_admin INTEGER NOT NULL DEFAULT 0, allowed_pages TEXT, theme_preset TEXT DEFAULT 'grigio',
        theme_brightness INTEGER DEFAULT 4, password_hash TEXT DEFAULT '',
        require_password INTEGER NOT NULL DEFAULT 0, topbar_order TEXT DEFAULT '', created_at TEXT NOT NULL
      );
    `);
    const existingHash = "pbkdf2-sha256$600000$c2FsdHNhbHRzYWx0c2FsdA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    memSqlite.prepare(`
      INSERT INTO app_users (id, name, is_admin, can_manage_backups, password_hash, require_password, created_at)
      VALUES ('admin', 'Admin', 1, 1, ?, 1, '2026-01-01T00:00:00Z')
    `).run(existingHash);

    const { useUserStore } = await import("@/shared/stores/useUserStore");
    const { restoreModularBackup } = await import("@/features/settings/services/backupService");

    const pkg = {
      app: "Last" as const,
      version: "1.0" as const,
      createdAt: "2026-11-27T12:00:00Z",
      type: "modular" as const,
      selectedCategories: ["settings"],
      tableCounts: { app_users: 1 },
      tables: {
        app_users: [{
          id: "admin",
          name: "Admin",
          station_name: "PC Ufficio",
          can_access_settings: 1,
          can_access_ddt: 1,
          can_access_price_lists: 1,
          can_edit_price_lists: 1,
          can_edit_or_numbers: 1,
          can_manage_backups: 1,
          is_admin: 0,
          allowed_pages: '["dashboard","settings"]',
          theme_preset: "grigio",
          theme_brightness: 4,
          password_hash: "",
          require_password: 0,
          topbar_order: "[]",
          created_at: "2026-01-01T00:00:00Z",
        }],
      },
    };

    // Non-admin cannot restore app_users
    useUserStore.setState({
      currentUser: {
        id: "banco-1", name: "Banco 1", station_name: "Cassa",
        can_access_settings: true, can_access_ddt: true, can_access_price_lists: true,
        can_edit_price_lists: false, can_edit_or_numbers: false, can_manage_backups: true,
        is_admin: false, allowed_pages: ["settings"], theme_preset: "grigio", theme_brightness: 4,
        require_password: false, created_at: "2026-01-01T00:00:00Z",
      },
    });
    const blocked = await restoreModularBackup(pkg, ["settings"], "merge");
    expect(blocked.success).toBe(false);

    // Admin can restore, and stripped backup preserves existing password_hash, require_password, is_admin
    useUserStore.setState({
      currentUser: {
        id: "admin", name: "Admin", station_name: "PC Ufficio",
        can_access_settings: true, can_access_ddt: true, can_access_price_lists: true,
        can_edit_price_lists: true, can_edit_or_numbers: true, can_manage_backups: true,
        is_admin: true, allowed_pages: ["settings"], theme_preset: "grigio", theme_brightness: 4,
        require_password: true, created_at: "2026-01-01T00:00:00Z",
      },
    });
    const res = await restoreModularBackup(pkg, ["settings"], "merge");
    expect(res.success).toBe(true);
    const adminRow = memSqlite.prepare("SELECT password_hash, require_password, is_admin FROM app_users WHERE id = 'admin'").get() as {
      password_hash: string; require_password: number; is_admin: number;
    };
    expect(adminRow.require_password).toBe(1);
    expect(adminRow.password_hash).toBe(existingHash);
    expect(adminRow.is_admin).toBe(1);
    useUserStore.setState({ currentUser: null });
  });

  it("AUD-06: orderSupabaseService.processOfflineQueue reruns when new item is enqueued mid-flush", async () => {
    memSqlite.exec(`
      CREATE TABLE orders (
        id TEXT PRIMARY KEY, supabase_id TEXT, order_date TEXT, supplier_name TEXT,
        article_code TEXT, description TEXT, quantity TEXT, price TEXT, ordered_date TEXT,
        notes TEXT, user_name TEXT, is_archived INTEGER, is_deleted INTEGER,
        highlights TEXT, created_at TEXT, updated_at TEXT, sync_status TEXT, project_url TEXT
      );
    `);
    const projectUrl = "https://proj-a.supabase.co";
    const uuidA = "11111111-1111-4111-8111-111111111111";
    const uuidB = "22222222-2222-4222-8222-222222222222";
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_supabase_config") {
        return { config: { projectUrl, anonKey: "sb_publishable_test" } };
      }
      return null;
    });

    let resolveFirstUpdate!: () => void;
    const firstUpdatePromise = new Promise<void>((resolve) => { resolveFirstUpdate = resolve; });
    const updatedIds: string[] = [];

    mockGetAuthClient.mockResolvedValue({
      supabaseUrl: projectUrl,
      from: () => ({
        update: () => ({
          eq: (_col: string, id: string) => ({
            select: async () => {
              updatedIds.push(id);
              if (id === uuidA) await firstUpdatePromise;
              return { data: [{ id }], error: null };
            },
          }),
        }),
      }),
    });

    const { invalidateSupabaseConfigCache } = await import("@/shared/services/supabaseConfigCache");
    invalidateSupabaseConfigCache();
    const { orderSupabaseService } = await import("@/features/orders/services/orderSupabaseService");

    localStorage.setItem("last_order_offline_queue", JSON.stringify([
      { id: "qA", action: "archive", targetId: uuidA, timestamp: "2026-11-27T10:00:00Z", projectUrl },
    ]));

    const flushA = orderSupabaseService.processOfflineQueue();
    await new Promise((r) => setTimeout(r, 20));

    const currentQ = JSON.parse(localStorage.getItem("last_order_offline_queue") || "[]");
    currentQ.push({ id: "qB", action: "archive", targetId: uuidB, timestamp: "2026-11-27T10:00:01Z", projectUrl });
    localStorage.setItem("last_order_offline_queue", JSON.stringify(currentQ));
    const flushB = await orderSupabaseService.processOfflineQueue();
    expect(flushB).toBe(0);

    resolveFirstUpdate();
    await expect(flushA).resolves.toBe(1);
    // Scheduled rerun drains qB automatically on the next tick
    await new Promise((r) => setTimeout(r, 30));

    expect(updatedIds).toEqual([uuidA, uuidB]);
    expect(JSON.parse(localStorage.getItem("last_order_offline_queue") || "[]")).toEqual([]);
  });

  it("AUD-07: offersRepository.moveToTrash resolves active project_url even on cold config cache", async () => {
    memSqlite.exec(`
      CREATE TABLE offers (
        id TEXT PRIMARY KEY, supabase_id INTEGER, offer_date TEXT, requester TEXT,
        contact TEXT, items_text TEXT, status TEXT, is_urgent INTEGER, is_archived INTEGER,
        created_by TEXT, updated_by TEXT, created_at TEXT, updated_at TEXT, sync_status TEXT, project_url TEXT
      );
      CREATE TABLE offers_trash (
        id TEXT PRIMARY KEY, supabase_id INTEGER, offer_date TEXT, requester TEXT,
        contact TEXT, items_text TEXT, status TEXT, is_urgent INTEGER, is_archived INTEGER,
        created_by TEXT, updated_by TEXT, created_at TEXT, updated_at TEXT,
        deleted_at TEXT, deleted_by TEXT, project_url TEXT
      );
      CREATE TABLE pending_cloud_operations (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, record_id TEXT NOT NULL,
        action TEXT NOT NULL, payload TEXT NOT NULL, project_url TEXT
      );
    `);
    memSqlite.prepare(`
      INSERT INTO offers (id, supabase_id, offer_date, requester, contact, items_text, status, is_urgent, is_archived, created_by, updated_by, created_at, updated_at, sync_status, project_url)
      VALUES ('off-1', NULL, '2026-11-27', 'Mario', '', 'test', 'attesa', 0, 0, 'op', 'op', '2026-11-27T10:00:00Z', '2026-11-27T10:00:00Z', 'pending', NULL)
    `).run();

    const projectUrl = "https://proj-a.supabase.co";
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_supabase_config") {
        return { config: { projectUrl, anonKey: "sb_publishable_test" } };
      }
      return null;
    });

    const { invalidateSupabaseConfigCache } = await import("@/shared/services/supabaseConfigCache");
    invalidateSupabaseConfigCache();

    const { offersRepository } = await import("@/features/offers/services/offersRepository");
    await offersRepository.moveToTrash("off-1", "Admin");

    const op = memSqlite.prepare("SELECT project_url FROM pending_cloud_operations WHERE record_id = 'off-1'").get() as {
      project_url: string | null;
    };
    expect(op.project_url).toBe(projectUrl);
  });

  it("AUD-08: useUserStore blocks createUser, updateUser, and deleteUser for non-admin currentUser", async () => {
    const { useUserStore } = await import("@/shared/stores/useUserStore");
    const nonAdmin = {
      id: "banco-1", name: "Banco 1", station_name: "Cassa",
      can_access_settings: true, can_access_ddt: true, can_access_price_lists: true,
      can_edit_price_lists: false, can_edit_or_numbers: false, can_manage_backups: false,
      is_admin: false, allowed_pages: ["dashboard", "settings"],
      theme_preset: "grigio" as const, theme_brightness: 4,
      require_password: false, created_at: "2026-01-01T00:00:00Z",
    };
    useUserStore.setState({ users: [nonAdmin], currentUser: nonAdmin });

    await expect(useUserStore.getState().createUser({
      name: "Escalated", can_access_settings: true, can_manage_backups: true,
    })).rejects.toThrow("Solo un amministratore");

    await expect(useUserStore.getState().updateUser({
      ...nonAdmin, can_manage_backups: true,
    })).rejects.toThrow("Solo un amministratore");

    await expect(useUserStore.getState().deleteUser("admin")).rejects.toThrow("Solo un amministratore");
    useUserStore.setState({ users: [], currentUser: null });
  });

  it("AUD-10: flushPendingCloudOperations uses latest activeProjectUrl and apply on coalesced rerun", async () => {
    memSqlite.exec(`
      CREATE TABLE pending_cloud_operations (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, record_id TEXT NOT NULL,
        action TEXT NOT NULL, payload TEXT NOT NULL, project_url TEXT
      );
      INSERT INTO pending_cloud_operations (scope, record_id, action, payload, project_url)
      VALUES ('test_aud10', 'rec-A', 'upsert', '{}', 'https://a.supabase.co'),
             ('test_aud10', 'rec-B', 'upsert', '{}', 'https://b.supabase.co');
    `);

    const { flushPendingCloudOperations } = await import("@/shared/data-layer/pendingCloudOperations");
    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => { releaseA = r; });
    const callsA: string[] = [];
    const callsB: string[] = [];

    const p1 = flushPendingCloudOperations("test_aud10", async (op) => {
      callsA.push(op.record_id);
      if (op.record_id === "rec-A") await gateA;
    }, "https://a.supabase.co");

    await new Promise((r) => setTimeout(r, 20));
    const p2 = flushPendingCloudOperations("test_aud10", async (op) => {
      callsB.push(op.record_id);
    }, "https://b.supabase.co");

    releaseA();
    await Promise.all([p1, p2]);

    expect(callsA).toEqual(["rec-A"]);
    expect(callsB).toEqual(["rec-B"]);
    const remaining = memSqlite.prepare("SELECT COUNT(*) as c FROM pending_cloud_operations").get() as { c: number };
    expect(remaining.c).toBe(0);
  });

  it("AUD-12: checkNumberAvailabilityOnCloud distinguishes HTTP 500 ('unknown') from 'available'", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_supabase_config") {
        return { config: { projectUrl: "https://proj-a.supabase.co", anonKey: "sb_publishable_test" } };
      }
      return null;
    });
    mockSupabaseFetch.mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const { invalidateSupabaseConfigCache } = await import("@/shared/services/supabaseConfigCache");
    invalidateSupabaseConfigCache();
    const { ddtCloudPushService } = await import("@/features/ddt-studio/services/ddtCloudPushService");
    await expect(ddtCloudPushService.checkNumberAvailabilityOnCloud(2026, 5)).resolves.toBe("unknown");
  });

  it("AUD-16: electronicInvoicesService.searchInvoices binds LIMIT as SQL parameter", async () => {
    memSqlite.exec(`
      CREATE TABLE supplier_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_name TEXT, doc_number TEXT,
        doc_date TEXT, year INTEGER, total_amount REAL, taxable_amount REAL,
        vat_amount REAL, payment_method TEXT, due_date TEXT, iban TEXT,
        bank_name TEXT, file_name TEXT, notes TEXT
      );
    `);
    const { electronicInvoicesService } = await import("@/features/invoices/services/electronicInvoicesService");
    const res = await electronicInvoicesService.searchInvoices({ limit: 25 });
    expect(res).toEqual([]);
  });

  it("AUD-17: AppUserService.createUser enforces can_manage_backups=true when is_admin=true", async () => {
    memSqlite.exec(`
      CREATE TABLE app_users (
        id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, station_name TEXT NOT NULL DEFAULT '',
        can_access_settings INTEGER NOT NULL DEFAULT 1, can_access_ddt INTEGER NOT NULL DEFAULT 1,
        can_access_price_lists INTEGER NOT NULL DEFAULT 1, can_edit_price_lists INTEGER NOT NULL DEFAULT 0,
        can_edit_or_numbers INTEGER NOT NULL DEFAULT 0, can_manage_backups INTEGER NOT NULL DEFAULT 0,
        is_admin INTEGER NOT NULL DEFAULT 0, allowed_pages TEXT, theme_preset TEXT DEFAULT 'grigio',
        theme_brightness INTEGER DEFAULT 4, password_hash TEXT DEFAULT '',
        require_password INTEGER NOT NULL DEFAULT 0, topbar_order TEXT DEFAULT '', created_at TEXT NOT NULL
      );
    `);
    const { AppUserService } = await import("@/shared/services/appUserService");
    const created = await AppUserService.createUser({
      name: "Admin2",
      can_access_settings: false,
      is_admin: true,
      can_manage_backups: false,
    });
    expect(created.can_manage_backups).toBe(true);
  });
});

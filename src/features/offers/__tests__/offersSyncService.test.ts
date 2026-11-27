import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

let memSqlite: DatabaseSync;

function createSqliteAdapter(sqlite: DatabaseSync) {
  return {
    async select<T>(sql: string, params: unknown[] = []): Promise<T> {
      const stmt = sqlite.prepare(sql);
      if (!params.length) return stmt.all() as T;
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

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: async () => createSqliteAdapter(memSqlite),
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
let mockCreds: { projectUrl: string; anonKey: string } | null = null;
vi.mock("@/shared/services/supabaseSession", () => ({
  getAuthenticatedSupabaseCredentials: async () => mockCreds,
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  getAuthenticatedSupabaseClient: async () => null,
}));

vi.mock("@/shared/services/supabaseRealtimeSubscription", () => ({
  createSupabaseRealtimeSubscription: () => () => {},
}));

beforeEach(() => {
  memSqlite = new DatabaseSync(":memory:");
  mockInvoke.mockReset();
  mockSupabaseFetch.mockReset();
  mockCreds = null;
  memSqlite.exec(`
    CREATE TABLE offers (
      id TEXT PRIMARY KEY,
      supabase_id INTEGER,
      offer_date TEXT,
      requester TEXT,
      contact TEXT,
      items_text TEXT,
      status TEXT,
      is_urgent INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT,
      updated_at TEXT,
      sync_status TEXT,
      project_url TEXT
    );
    CREATE TABLE offers_trash (
      id TEXT PRIMARY KEY,
      supabase_id INTEGER,
      offer_date TEXT,
      requester TEXT,
      contact TEXT,
      items_text TEXT,
      status TEXT,
      is_urgent INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT,
      deleted_by TEXT,
      project_url TEXT
    );
    CREATE TABLE pending_cloud_operations (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT,
      record_id TEXT,
      action TEXT,
      payload TEXT,
      project_url TEXT
    );
  `);
});

describe("OffersSyncService (Level-2 integration)", () => {
  it("pushes pending local offers, pulls remote updates, and isolates records from other projects", async () => {
    const projA = "https://proj-a.supabase.co";
    const projB = "https://proj-b.supabase.co";
    memSqlite.exec(`
      INSERT INTO offers VALUES
        ('off-a', NULL, '2026-02-01', 'Mario', '333', 'Vite 4x40', 'In attesa', 0, 0, 'Op', 'Op', '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z', 'pending', '${projA}'),
        ('off-b', 77, '2026-02-01', 'Luigi', '444', 'Tasselli', 'In attesa', 0, 0, 'Op', 'Op', '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z', 'pending', '${projB}');
    `);

    mockInvoke.mockResolvedValue({ config: { projectUrl: projA, anonKey: "anon-a" }, isValid: true });
    mockCreds = { projectUrl: projA, anonKey: "anon-a" };
    mockSupabaseFetch.mockImplementation(async (url: string | URL, opts?: { method?: string }) => {
      const s = String(url);
      if (opts?.method === "POST" && s.includes("/rest/v1/offerte")) {
        return new Response(JSON.stringify([{ id: 101 }]), { status: 201 });
      }
      if (s.includes("/rest/v1/offerte")) {
        return new Response(JSON.stringify([
          {
            id: 101,
            local_id: "off-a",
            offer_date: "2026-02-01",
            requester: "Mario",
            contact: "333",
            items_text: "Vite 4x40",
            status: "In attesa",
            is_urgent: false,
            is_archived: false,
            created_by: "Op",
            updated_by: "Op",
            created_at: "2026-02-01T00:00:00Z",
            updated_at: "2026-02-01T00:00:00Z",
          },
          {
            id: 202,
            local_id: "off-remote",
            offer_date: "2026-02-02",
            requester: "Anna",
            contact: "555",
            items_text: "Trapano",
            status: "Inviata",
            is_urgent: true,
            is_archived: false,
            created_by: "PC2",
            updated_by: "PC2",
            created_at: "2026-02-02T00:00:00Z",
            updated_at: "2026-02-02T00:00:00Z",
          },
        ]), {
          status: 200,
          headers: { "content-range": "0-1/2" },
        });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { offersSyncService } = await import("../services/offersSyncService");
    const res = await offersSyncService.sync();

    expect(res.success).toBe(true);
    expect(res.pushed).toBe(1);
    expect(res.pulled).toBe(1);

    const rowA = memSqlite.prepare("SELECT supabase_id, sync_status FROM offers WHERE id = 'off-a'").get() as Record<string, unknown>;
    const rowB = memSqlite.prepare("SELECT sync_status FROM offers WHERE id = 'off-b'").get() as Record<string, unknown>;
    const rowRemote = memSqlite.prepare("SELECT requester, is_urgent FROM offers WHERE id = 'off-remote'").get() as Record<string, unknown>;
    expect(rowA).toEqual({ supabase_id: 101, sync_status: "synced" });
    expect(rowB).toEqual({ sync_status: "pending" });
    expect(rowRemote).toEqual({ requester: "Anna", is_urgent: 1 });
  });
});

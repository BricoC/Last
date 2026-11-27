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
vi.mock("@/shared/services/supabaseSession", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

beforeEach(() => {
  memSqlite = new DatabaseSync(":memory:");
  mockInvoke.mockReset();
  mockSupabaseFetch.mockReset();
  memSqlite.exec(`
    CREATE TABLE ddt_documents (
      id TEXT PRIMARY KEY,
      doc_number INTEGER,
      year INTEGER,
      series TEXT,
      order_reference TEXT,
      project_url TEXT,
      deleted_at TEXT,
      sync_status TEXT
    );
    CREATE TABLE ddt_logs (
      id TEXT PRIMARY KEY,
      status TEXT,
      updated_at TEXT
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

describe("OrNumbersRepository (Level-2 integration)", () => {
  it("syncOrdersFromSupabase matches by id or default series without overwriting custom series with same doc_number", async () => {
    const proj = "https://proj-a.supabase.co";
    memSqlite.exec(`
      INSERT INTO ddt_documents VALUES ('ddt-std', 10, 2026, '', '', '${proj}', NULL, 'synced');
      INSERT INTO ddt_documents VALUES ('ddt-ser-b', 10, 2026, 'B', 'ORD-SERIE-B', '${proj}', NULL, 'synced');
    `);
    mockInvoke.mockResolvedValue({ config: { projectUrl: proj, anonKey: "anon-a" }, isValid: true });
    mockSupabaseFetch.mockImplementation(async () =>
      new Response(JSON.stringify([{ id: "ddt-remote-legacy", numero: 10, anno: 2026, nr_vs_ordine: "OR-999" }]), { status: 200 })
    );

    const { OrNumbersRepository } = await import("../orNumbersRepository");
    await OrNumbersRepository.syncOrdersFromSupabase(2026);

    const std = memSqlite.prepare("SELECT order_reference FROM ddt_documents WHERE id = 'ddt-std'").get() as { order_reference: string };
    const serB = memSqlite.prepare("SELECT order_reference FROM ddt_documents WHERE id = 'ddt-ser-b'").get() as { order_reference: string };
    expect(std.order_reference).toBe("OR-999");
    expect(serB.order_reference).toBe("ORD-SERIE-B");
  });

  it("loadLogs pulls remote logs while preserving local pending or_logs operations", async () => {
    const proj = "https://proj-a.supabase.co";
    memSqlite.exec(`
      INSERT INTO ddt_logs VALUES ('log-pending', 'INVIATO_LOCALE', '2026-02-01T10:00:00Z');
      INSERT INTO pending_cloud_operations (scope, record_id, action, payload, project_url)
        VALUES ('or_logs', 'log-pending', 'upsert', '{"id":"log-pending","status":"INVIATO_LOCALE"}', '${proj}');
    `);
    mockInvoke.mockResolvedValue({ config: { projectUrl: proj, anonKey: "anon-a" }, isValid: true });
    mockSupabaseFetch.mockImplementation(async (url: string | URL, opts?: { method?: string }) => {
      const s = String(url);
      if (opts?.method === "POST") {
        // Simulate transient failure on pending retry so operation remains queued
        return new Response("", { status: 503 });
      }
      if (s.includes("ddt_logs")) {
        if (s.includes("offset=0")) {
          return new Response(JSON.stringify([
            { id: "log-pending", status: "VECCHIO_REMOTO", updated_at: "2026-02-02T10:00:00Z" },
            { id: "log-remote", status: "INVIATO", updated_at: "2026-02-02T10:00:00Z" },
          ]), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { OrNumbersRepository } = await import("../orNumbersRepository");
    const map = await OrNumbersRepository.getLogsMap();
    expect(map["log-pending"]).toBe("INVIATO_LOCALE");
    expect(map["log-remote"]).toBe("INVIATO");
  });
});

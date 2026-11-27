import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import * as XLSX from "xlsx";

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

const lsStore = new Map<string, string>();
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => lsStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        lsStore.set(k, String(v));
      },
      removeItem: (k: string) => {
        lsStore.delete(k);
      },
      clear: () => {
        lsStore.clear();
      },
    },
    configurable: true,
  });
}

beforeEach(() => {
  memSqlite = new DatabaseSync(":memory:");
  mockInvoke.mockReset();
  lsStore.clear();
  memSqlite.exec(`
    CREATE TABLE supplier_price_list_files (
      id TEXT PRIMARY KEY,
      filename TEXT UNIQUE,
      file_path TEXT,
      supplier_name TEXT,
      file_date TEXT,
      file_size INTEGER,
      last_modified_ms INTEGER,
      total_items INTEGER,
      imported_at TEXT
    );
    CREATE TABLE supplier_price_list_items (
      id TEXT PRIMARY KEY,
      file_id TEXT,
      supplier_name TEXT,
      code TEXT,
      description TEXT,
      price REAL,
      net_price REAL DEFAULT 0,
      unit TEXT,
      barcode TEXT,
      list_date TEXT,
      brand TEXT,
      notes TEXT,
      extra_code TEXT,
      created_at TEXT
    );
  `);
});

describe("SupplierPriceListService (Level-2 integration)", () => {
  it("scanAndSync imports valid Excel files, skips unchanged files, deletes removed files, and tracks failedFiles", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Codice", "Descrizione", "Prezzo Listino", "U.M."],
      ["A100", "Vite Legno 4x40", 12.5, "CF"],
      ["A200", "Tassello Nylon", 8.0, "CF"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Listino");
    const validBase64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

    // Seed an unchanged file and a removed file in SQLite
    memSqlite.exec(`
      INSERT INTO supplier_price_list_files VALUES ('f-skip', 'skip.xlsx', 'C:\\listini\\skip.xlsx', 'SKIP', '2026-01-01', 100, 1000, 1, '2026-01-01T00:00:00Z');
      INSERT INTO supplier_price_list_files VALUES ('f-old', 'removed.xlsx', 'C:\\listini\\removed.xlsx', 'OLD', '2026-01-01', 50, 500, 1, '2026-01-01T00:00:00Z');
      INSERT INTO supplier_price_list_items (id, file_id, supplier_name, code, description, price) VALUES ('it-old', 'f-old', 'OLD', 'X1', 'Vecchio', 5);
    `);

    mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "list_files_in_folder") {
        return [
          { filename: "skip.xlsx", path: "C:\\listini\\skip.xlsx", size_bytes: 100, last_modified_ms: 1000 },
          { filename: "ACME_2026.xlsx", path: "C:\\listini\\ACME_2026.xlsx", size_bytes: 200, last_modified_ms: 2000 },
          { filename: "corrupt.xlsx", path: "C:\\listini\\corrupt.xlsx", size_bytes: 300, last_modified_ms: 3000 },
        ];
      }
      if (cmd === "read_single_excel_file_base64") {
        if (String(args?.filePath).includes("corrupt")) {
          throw new Error("File corrotto");
        }
        return validBase64;
      }
      return null;
    });

    const { SupplierPriceListService } = await import("../supplierPriceListService");
    const res = await SupplierPriceListService.scanAndSync(undefined, false);

    expect(res.updatedFiles).toBe(1);
    expect(res.skippedFiles).toBe(1);
    expect(res.deletedFiles).toBe(1);
    expect(res.failedFiles).toEqual(["corrupt.xlsx"]);
    expect(res.totalItems).toBe(2);

    const searchRes = await SupplierPriceListService.searchItems({ query: "vite", limit: 1 });
    expect(searchRes.total).toBe(1);
    expect(searchRes.items[0].code).toBe("A100");
  });
});

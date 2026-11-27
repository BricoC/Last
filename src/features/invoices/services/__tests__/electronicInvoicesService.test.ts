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
    CREATE TABLE supplier_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name TEXT,
      vat_number TEXT,
      fiscal_code TEXT,
      doc_number TEXT,
      doc_date TEXT,
      year INTEGER,
      total_amount REAL,
      taxable_amount REAL,
      vat_amount REAL,
      payment_method TEXT,
      due_date TEXT,
      iban TEXT,
      bank_name TEXT,
      file_name TEXT,
      notes TEXT,
      cloud_upload_pending INTEGER DEFAULT 0,
      cloud_uploaded_at TEXT,
      project_url TEXT,
      issuer_key TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX idx_si_issuer ON supplier_invoices(issuer_key, doc_number, doc_date);
    CREATE TABLE supplier_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER,
      supplier_name TEXT,
      doc_number TEXT,
      doc_date TEXT,
      year INTEGER,
      line_number INTEGER,
      article_code TEXT,
      description TEXT,
      quantity REAL,
      unit TEXT,
      unit_price REAL,
      discount_1 REAL,
      discount_2 REAL,
      discount_3 REAL,
      discounted_price REAL,
      total_price REAL,
      vat_rate REAL
    );
  `);
});

describe("ElectronicInvoicesService (Level-2 integration)", () => {
  it("uploads pending invoices with matching or NULL project_url and skips other projects", async () => {
    const projA = "https://proj-a.supabase.co";
    const projB = "https://proj-b.supabase.co";
    memSqlite.exec(`
      INSERT INTO supplier_invoices (id, supplier_name, doc_number, doc_date, year, total_amount, taxable_amount, vat_amount, cloud_upload_pending, project_url, issuer_key)
      VALUES
        (1, 'FORN A', 'F1', '2026-01-10', 2026, 122, 100, 22, 1, NULL, 'vat:111'),
        (2, 'FORN B', 'F2', '2026-01-11', 2026, 244, 200, 44, 1, '${projA}', 'vat:222'),
        (3, 'FORN C', 'F3', '2026-01-12', 2026, 366, 300, 66, 1, '${projB}', 'vat:333');
    `);
    mockInvoke.mockResolvedValue({ config: { projectUrl: projA, anonKey: "anon-a" }, isValid: true });
    mockSupabaseFetch.mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const { electronicInvoicesService } = await import("../electronicInvoicesService");
    await electronicInvoicesService.retryPendingUploads();

    expect(mockSupabaseFetch).toHaveBeenCalledTimes(2);
    const rows = memSqlite.prepare("SELECT id, cloud_upload_pending FROM supplier_invoices ORDER BY id").all() as Array<{ id: number; cloud_upload_pending: number }>;
    expect(rows).toEqual([
      { id: 1, cloud_upload_pending: 0 },
      { id: 2, cloud_upload_pending: 0 },
      { id: 3, cloud_upload_pending: 1 },
    ]);
  });

  it("syncFromSupabase downloads paginated headers and lines atomically", async () => {
    const projA = "https://proj-a.supabase.co";
    mockInvoke.mockResolvedValue({ config: { projectUrl: projA, anonKey: "anon-a" }, isValid: true });
    mockSupabaseFetch.mockImplementation(async (url: string) => {
      if (url.includes("fatture_elettroniche_testate")) {
        if (!url.includes("id=gt.") && !url.includes("offset=")) {
          return new Response(JSON.stringify([{
            id: 10,
            fornitore: "Wepa Italia",
            partita_iva: "01234567890",
            numero_documento: "FT-100",
            data_documento: "2026-03-01",
            anno: 2026,
            totale_documento: 122,
            imponibile: 100,
            imposta: 22,
          }]), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("fatture_elettroniche_righe")) {
        if (!url.includes("id=gt.") && !url.includes("offset=")) {
          return new Response(JSON.stringify([{
            invoice_id: 10,
            numero_linea: 1,
            codice_articolo: "C1",
            descrizione: "Carta",
            quantita: 2,
            prezzo_unitario: 50,
            prezzo_scontato: 50,
            prezzo_totale: 100,
            aliquota_iva: 22,
          }]), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { electronicInvoicesService } = await import("../electronicInvoicesService");
    const res = await electronicInvoicesService.syncFromSupabase();
    expect(res.testateCount).toBe(1);
    expect(res.righeCount).toBe(1);
    const counts = await electronicInvoicesService.getLocalCounts();
    expect(counts).toEqual({ testate: 1, righe: 1 });
  });
});

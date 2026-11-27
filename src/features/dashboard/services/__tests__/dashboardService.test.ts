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

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: async () => createSqliteAdapter(memSqlite),
}));

beforeEach(() => {
  memSqlite = new DatabaseSync(":memory:");
  memSqlite.exec(`
    CREATE TABLE ddt_documents (
      id TEXT PRIMARY KEY,
      doc_number INTEGER,
      year INTEGER,
      series TEXT DEFAULT '',
      doc_date TEXT,
      client_name TEXT,
      destination_name TEXT,
      destination_address TEXT,
      destination_city TEXT,
      status TEXT,
      transport_reason TEXT,
      total_taxable_subunits INTEGER,
      total_vat_subunits INTEGER,
      total_document_subunits INTEGER,
      deleted_at TEXT
    );
    CREATE TABLE ddt_items (
      id TEXT PRIMARY KEY,
      ddt_id TEXT,
      row_kind TEXT,
      code TEXT,
      description TEXT,
      unit TEXT,
      quantity TEXT,
      unit_price_subunits INTEGER,
      purchase_price_subunits INTEGER,
      net_amount_subunits INTEGER,
      deleted_at TEXT,
      vat_rate INTEGER DEFAULT 22
    );
  `);
});

describe("DashboardService (Level-2 integration with SQLite)", () => {
  it("excludes drafts, soft-deleted DDTs, and Resi from margin, and excludes uncosted items from margin denominator", async () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const dDate = `${y}-${m}-05`;

    memSqlite.exec(`
      -- Emitted sale DDT: 1 costed item (net 100, cost 50) + 1 uncosted item (net 1000, cost 0)
      INSERT INTO ddt_documents VALUES ('d1', 1, ${y}, '', '${dDate}', 'ACME', NULL, NULL, NULL, 'emesso', 'Vendita', 110000000, 24200000, 134200000, NULL);
      INSERT INTO ddt_items VALUES ('i1', 'd1', 'item', 'A1', 'Articolo Costato', 'NR', '1', 10000000, 5000000, 10000000, NULL, 22);
      INSERT INTO ddt_items VALUES ('i2', 'd1', 'item', 'A2', 'Articolo Senza Costo', 'NR', '1', 100000000, 0, 100000000, NULL, 22);

      -- Reso DDT: excluded from cost/margin calculations
      INSERT INTO ddt_documents VALUES ('d2', 2, ${y}, '', '${dDate}', 'ACME', NULL, NULL, NULL, 'emesso', 'Reso merce', 50000000, 11000000, 61000000, NULL);
      INSERT INTO ddt_items VALUES ('i3', 'd2', 'item', 'A3', 'Reso', 'NR', '1', 50000000, 25000000, 50000000, NULL, 22);

      -- Draft & deleted DDTs: excluded everywhere
      INSERT INTO ddt_documents VALUES ('d3', NULL, ${y}, '', '${dDate}', 'BETA', NULL, NULL, NULL, 'bozza', 'Vendita', 99900000, 0, 99900000, NULL);
      INSERT INTO ddt_documents VALUES ('d4', 3, ${y}, '', '${dDate}', 'GAMMA', NULL, NULL, NULL, 'emesso', 'Vendita', 88800000, 0, 88800000, '2026-01-01T00:00:00Z');
    `);

    const { dashboardService } = await import("../dashboardService");
    const data = await dashboardService.getDashboardData();

    expect(data.kpis.activeDraftsCount).toBe(1);
    expect(data.kpis.currentYearDdtCount).toBe(2);
    // Margin computed strictly on costed items: net 100, cost 50 => margin 50%, markup 100%
    expect(data.kpis.currentMonthCost).toBeCloseTo(50, 2);
    expect(data.kpis.currentMonthMarginPercent).toBeCloseTo(50, 2);
    expect(data.kpis.currentMonthMarkupPercent).toBeCloseTo(100, 2);
    expect(data.kpis.averageMarginPercent).toBeCloseTo(50, 2);
  });

  it("computes homogeneous cutoff comparisons in getMonthlyPerformanceReport for current month", async () => {
    const now = new Date();
    const y = now.getFullYear();
    const prev = y - 1;
    const m = String(now.getMonth() + 1).padStart(2, "0");

    // Current year: 200 within cutoff (day 01) + 500 after cutoff (day 28)
    // Prior year:   100 within cutoff (day 01) + 900 after cutoff (day 28)
    memSqlite.exec(`
      INSERT INTO ddt_documents VALUES ('c1', 1, ${y}, '', '${y}-${m}-01', 'ACME', NULL, NULL, NULL, 'emesso', 'Vendita', 20000000, 0, 20000000, NULL);
      INSERT INTO ddt_documents VALUES ('c2', 2, ${y}, '', '${y}-${m}-28', 'ACME', NULL, NULL, NULL, 'emesso', 'Vendita', 50000000, 0, 50000000, NULL);
      INSERT INTO ddt_documents VALUES ('p1', 1, ${prev}, '', '${prev}-${m}-01', 'ACME', NULL, NULL, NULL, 'emesso', 'Vendita', 10000000, 0, 10000000, NULL);
      INSERT INTO ddt_documents VALUES ('p2', 2, ${prev}, '', '${prev}-${m}-28', 'ACME', NULL, NULL, NULL, 'emesso', 'Vendita', 90000000, 0, 90000000, NULL);
    `);

    const { dashboardService } = await import("../dashboardService");
    const report = await dashboardService.getMonthlyPerformanceReport(y, 10);
    const currentMonthDetail = report.months[now.getMonth()];
    const prevComp = currentMonthDetail.comparisonsByYear?.[prev];
    expect(prevComp).toBeDefined();
    expect(prevComp!.isCutoffApplied).toBe(true);
    expect(prevComp!.turnoverAtCutoff).toBeCloseTo(100, 2);
    expect(prevComp!.fullMonthTurnover).toBeCloseTo(1000, 2);
    // Cutoff vs Cutoff: (200 - 100) / 100 * 100 = +100%
    expect(prevComp!.deltaPercent).toBeCloseTo(100, 2);
  });
});

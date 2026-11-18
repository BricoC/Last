import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { DashboardService } from "@/features/dashboard/services/dashboardService";
import { getDdtMonthlyReportData } from "../ddtReportService";

const { getDatabase } = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("@/shared/data-layer/database", () => ({ getDatabase }));

it("mantiene 1,5 e 1.250,5 nei totali della dashboard e nei prezzi unitari del report", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE ddt_documents (
        id TEXT PRIMARY KEY, year INTEGER, doc_number INTEGER, doc_date TEXT, status TEXT, series TEXT,
        client_name TEXT, destination_name TEXT, destination_city TEXT, operator TEXT,
        total_taxable_subunits INTEGER, total_vat_subunits INTEGER, total_document_subunits INTEGER,
        transport_reason TEXT, payment_method TEXT, order_reference TEXT, carrier TEXT,
        internal_notes TEXT, deleted_at TEXT
      );
      CREATE TABLE ddt_items (
        ddt_id TEXT, row_index INTEGER, code TEXT, description TEXT, unit TEXT, quantity TEXT,
        unit_price_subunits INTEGER, discount_pct TEXT, net_amount_subunits INTEGER, vat_rate INTEGER, deleted_at TEXT
      );
      INSERT INTO ddt_documents (id, year, doc_number, doc_date, status, client_name,
        total_taxable_subunits, total_vat_subunits, total_document_subunits)
        VALUES ('ddt', 2026, 1, '2026-01-02', 'confermato', 'Cliente', 250400000, 0, 250400000);
      INSERT INTO ddt_items VALUES
        ('ddt', 1, 'A', 'ARTICOLO A', 'NR.', '1,5', 200000, '', 300000, 0, NULL),
        ('ddt', 2, 'B', 'ARTICOLO B', 'NR.', '1.250,5', 200000, '', 250100000, 0, NULL);
    `);
    getDatabase.mockResolvedValue({
      select: async (sql: string, params: SQLInputValue[] = []) => sqlite.prepare(sql).all(...params),
    });

    const articles = await new DashboardService().searchArticles("");
    expect(articles.map((row) => [row.code, row.totalQuantity])).toEqual([["B", 1250.5], ["A", 1.5]]);
    const report = await getDdtMonthlyReportData(2026, 1);
    expect(report.articleRows.map((row) => [row.quantity, row.netPrice, row.vatRate])).toEqual([
      ["1,5", 2, "0%"], ["1.250,5", 2, "0%"],
    ]);
  } finally {
    getDatabase.mockReset();
    sqlite.close();
  }
});

import { describe, expect, it, vi, beforeEach } from "vitest";

const { select, execute } = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({ select, execute })),
}));

import { orderRepository } from "../orderRepository";

describe("OrderRepository malformed JSON resilience", () => {
  beforeEach(() => {
    select.mockReset();
    execute.mockReset();
  });

  it("handles malformed JSON in highlights, old_data, and new_data without crashing", async () => {
    const badOrderRow = {
      id: "o1",
      supabase_id: "o1",
      order_date: "2026-11-19",
      supplier_name: "FORNITORE",
      article_code: "A1",
      description: "PROVA",
      quantity: "1",
      price: "10",
      ordered_date: null,
      notes: "",
      user_name: "Admin",
      is_archived: 0,
      is_deleted: 0,
      highlights: "{not-valid-json",
      created_at: "2026-11-19",
      updated_at: "2026-11-19",
    };
    const badAuditRow = {
      id: "a1",
      supabase_id: "a1",
      table_name: "ordini",
      operation_type: "UPDATE",
      operation_date: "2026-11-19",
      user_name: "Admin",
      old_data: "{bad-old",
      new_data: "{bad-new",
      summary: "PROVA",
      created_at: "2026-11-19",
    };

    select
      .mockResolvedValueOnce([badAuditRow]) // getAuditLogs
      .mockResolvedValueOnce([badOrderRow]) // searchAll orders
      .mockResolvedValueOnce([]) // searchAll suppliers
      .mockResolvedValueOnce([badAuditRow]); // searchAll audit

    const logs = await orderRepository.getAuditLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].old_data).toBeNull();
    expect(logs[0].new_data).toBeNull();

    const searchRes = await orderRepository.searchAll("PROVA");
    expect(searchRes.orders).toHaveLength(1);
    expect(searchRes.orders[0].highlights).toEqual({});
    expect(searchRes.auditLogs).toHaveLength(1);
    expect(searchRes.auditLogs[0].old_data).toBeNull();
  });
});

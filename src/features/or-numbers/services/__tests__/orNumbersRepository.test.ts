import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvoke, mockExecute, mockSelect } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockExecute: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({
    execute: mockExecute,
    select: mockSelect,
  })),
}));

import { OrNumbersRepository } from "../orNumbersRepository";

describe("OrNumbersRepository", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockExecute.mockReset();
    mockSelect.mockReset();
    mockExecute.mockResolvedValue({ rowsAffected: 1 });
    mockInvoke.mockResolvedValue({ config: null });
  });

  it("aggiorna sconto, imponibile e imposta delle righe e i totali della testata nello stesso batch", async () => {
    mockSelect.mockResolvedValueOnce([{ updated_at: "old-document" }]).mockResolvedValueOnce([
      { id: "r1", updated_at: "old-r1", quantity: "2", unit_price_subunits: 1_000_000, vat_rate: 22 },
      { id: "r2", updated_at: "old-r2", quantity: "1,5", unit_price_subunits: 1_000_000, vat_rate: 0 },
    ]);
    await OrNumbersRepository.assignOrderReference("ddt-or-1", "ORD-2026-42", 15);

    expect(mockInvoke).toHaveBeenCalledWith("apply_local_database_batch", {
      validateReferencesAfterWrite: false,
      writes: [
        { sql: expect.stringContaining("total_document_subunits"), params: ["ORD-2026-42", expect.any(String), "ddt-or-1", "old-document", 2_975_000, 374_000, 3_349_000], expectedRows: 1 },
        { sql: expect.stringContaining("discount_pct"), params: ["15", 1_700_000, 374_000, expect.any(String), "r1", "old-r1"], expectedRows: 1 },
        { sql: expect.stringContaining("discount_pct"), params: ["15", 1_275_000, 0, expect.any(String), "r2", "old-r2"], expectedRows: 1 },
      ],
    });
  });
});

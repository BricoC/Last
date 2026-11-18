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

  it("assignOrderReference aggiorna discount_pct (non discount_percent) su ddt_items", async () => {
    await OrNumbersRepository.assignOrderReference("ddt-or-1", "ORD-2026-42", 15);

    const itemUpdateCall = mockExecute.mock.calls.find((c) =>
      String(c[0]).includes("UPDATE ddt_items")
    );
    expect(itemUpdateCall).toBeDefined();
    expect(String(itemUpdateCall?.[0])).toContain("discount_pct");
    expect(String(itemUpdateCall?.[0])).not.toContain("discount_percent");
    expect(itemUpdateCall?.[1]).toEqual(["15", "ddt-or-1"]);
  });
});

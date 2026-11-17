import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecute, mockSelect, mockSync } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockSelect: vi.fn(),
  mockSync: vi.fn(),
}));

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({
    execute: mockExecute,
    select: mockSelect,
  })),
}));

vi.mock("../services/offersSyncService", () => ({
  offersSyncService: {
    sync: mockSync,
    deleteRemoteOffer: vi.fn(async () => {}),
  },
}));

import { OffersRepository } from "../services/offersRepository";

describe("OffersRepository", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockSelect.mockReset();
    mockSync.mockReset();
    mockSync.mockResolvedValue({ success: true, pushed: 0, pulled: 0 });
  });

  it("archives all active 'Inviata' offers and triggers sync", async () => {
    mockExecute.mockResolvedValue({ rowsAffected: 3 });
    const repo = new OffersRepository();

    const affected = await repo.archiveSentOffers("Mario");

    expect(affected).toBe(3);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("is_archived = 1");
    expect(sql).toContain("WHERE is_archived = 0 AND status = 'Inviata'");
    expect(params[0]).toBe("Mario");
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it("queries getAllOffers with Inviata sorted after non-Inviata by date descending", async () => {
    mockSelect.mockResolvedValue([]);
    const repo = new OffersRepository();

    await repo.getAllOffers();

    expect(mockSelect).toHaveBeenCalledTimes(1);
    const [sql] = mockSelect.mock.calls[0];
    expect(sql).toContain("CASE WHEN status = 'Inviata' THEN 1 ELSE 0 END ASC, offer_date DESC, created_at DESC");
  });
});

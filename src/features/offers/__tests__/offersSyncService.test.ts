import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/shared/services/supabaseSession", () => ({
  supabaseFetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

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

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(async () => "ok"),
  })),
}));

import { OffersSyncService } from "../services/offersSyncService";

describe("OffersSyncService", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockInvoke.mockReset();
    mockExecute.mockReset();
    mockSelect.mockReset();
    mockInvoke.mockResolvedValue({
      config: { projectUrl: "https://example.supabase.co", anonKey: "anon-key" },
      isValid: true,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("coalesces concurrent sync() calls and runs a follow-up pass instead of failing", async () => {
    let pullCalls = 0;
    let releaseFirstPull!: () => void;
    const firstPullGate = new Promise<void>((resolve) => {
      releaseFirstPull = resolve;
    });

    mockSelect.mockResolvedValue([]);
    mockExecute.mockResolvedValue({ rowsAffected: 0 });

    globalThis.fetch = vi.fn(async () => {
      pullCalls++;
      if (pullCalls === 1) {
        await firstPullGate;
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    const service = new OffersSyncService();
    const p1 = service.sync();
    // Wait a microtask so p1 reaches fetch
    await Promise.resolve();
    await Promise.resolve();

    const p2 = service.sync();
    releaseFirstPull();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(pullCalls).toBe(2);
  });

  it("inserts newly pulled remote offers and deletes local synced offers removed remotely", async () => {
    // 1st select: pendings -> []
    // 2nd select: existing check for remote id 10 -> [] (new remote offer)
    // 3rd select: localSynced check -> id "local-deleted" with supabase_id 99 (missing remotely)
    mockSelect
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "local-deleted", supabase_id: 99 }]);
    mockExecute.mockResolvedValue({ rowsAffected: 1 });

    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            id: 10,
            local_id: "remote-10",
            offer_date: "2026-11-17",
            requester: "Mario",
            contact: "",
            items_text: "10 viti",
            status: "Da preparare",
            is_urgent: false,
            is_archived: false,
          },
        ]),
        { status: 200, headers: { "Content-Range": "0-0/1" } }
      )
    ) as typeof fetch;

    const service = new OffersSyncService();
    const res = await service.sync();

    expect(res).toEqual({ success: true, pushed: 0, pulled: 1 });
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO offers"),
      expect.arrayContaining(["remote-10", 10, "2026-11-17", "Mario"])
    );
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM offers WHERE id = $1 AND sync_status = 'synced'"),
      ["local-deleted", 99]
    );
  });
});

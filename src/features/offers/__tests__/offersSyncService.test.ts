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

const pendingOffer = {
  id: "local-offer",
  supabase_id: 23,
  project_url: "https://example.supabase.co",
  sync_status: "pending",
  offer_date: "2026-11-19",
  requester: "Cliente di prova",
  items_text: "Articolo",
  status: "Inviata",
  updated_at: "2026-11-20T10:00:00Z",
};

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

  it("relinks a stale remote ID by local_id and preserves newer local edits at acknowledgement", async () => {
    mockSelect.mockResolvedValueOnce([]).mockResolvedValueOnce([pendingOffer]);
    mockExecute.mockResolvedValue({ rowsAffected: 1 });
    const requests: Array<[string, URL]> = [];
    globalThis.fetch = vi.fn(async (input, options) => {
      const url = new URL(String(input));
      const method = options?.method ?? "GET";
      requests.push([method, url]);
      if (method === "GET" || url.searchParams.has("id")) return Response.json([]);
      return Response.json([{ id: 41 }]);
    });

    const service = new OffersSyncService();
    await expect(service.sync()).resolves.toEqual({ success: true, pushed: 1, pulled: 0 });
    expect(requests.map(([method]) => method)).toEqual(["PATCH", "PATCH", "GET"]);
    expect(requests[0][1].searchParams.get("id")).toBe("eq.23");
    expect(requests[0][1].searchParams.get("or")).toContain('local_id.eq."local-offer"');
    expect(requests[1][1].searchParams.get("local_id")).toBe("eq.local-offer");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("CASE WHEN updated_at = $3"),
      [41, pendingOffer.id, pendingOffer.updated_at, pendingOffer.project_url, 23],
    );
  });

  it("continues other offers and recreates a missing offer only after explicit republication", async () => {
    const other = { ...pendingOffer, id: "new-offer", supabase_id: null };
    mockSelect.mockResolvedValueOnce([]).mockResolvedValueOnce([pendingOffer, other])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...pendingOffer, supabase_id: null }]);
    mockExecute.mockResolvedValue({ rowsAffected: 1 });
    const published: string[] = [];
    globalThis.fetch = vi.fn(async (_input, options) => {
      if (options?.method !== "POST") return Response.json([]);
      published.push(JSON.parse(String(options.body)).local_id);
      return Response.json([{ id: published.length + 40 }]);
    });

    const service = new OffersSyncService();
    await expect(service.sync()).resolves.toMatchObject({ success: false, pushed: 1 });
    expect(service.getStatus().missingOfferIds).toEqual([pendingOffer.id]);
    expect(published).toEqual([other.id]);
    await expect(service.republishMissingOffer(pendingOffer.id)).resolves.toMatchObject({ success: true, pushed: 1 });
    expect(published).toEqual([other.id, pendingOffer.id]);
    expect(service.getStatus().missingOfferIds).toEqual([]);
  });

  it("keeps an offer pending on HTTP failure without falling back to another write", async () => {
    mockSelect.mockResolvedValueOnce([]).mockResolvedValueOnce([pendingOffer]);
    const fetch = vi.fn(async () => new Response(null, { status: 403 }));
    globalThis.fetch = fetch;
    const service = new OffersSyncService();
    await expect(service.sync()).resolves.toMatchObject({ success: false, error: expect.stringContaining("403") });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(service.getStatus().missingOfferIds).toEqual([]);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it.each([true, false])("deletes by stable local_id before checking a legacy ID, match=%s", async (found) => {
    mockSelect.mockResolvedValueOnce([{
      sequence: 1,
      record_id: pendingOffer.id,
      action: "delete",
      payload: JSON.stringify({ remoteId: 23 }),
      project_url: pendingOffer.project_url,
    }]).mockResolvedValueOnce([]);
    mockExecute.mockResolvedValue({ rowsAffected: 1 });
    const deletions: URL[] = [];
    globalThis.fetch = vi.fn(async (input, options) => {
      if (options?.method !== "DELETE") return Response.json([]);
      deletions.push(new URL(String(input)));
      return Response.json(found ? [{ id: 41 }] : []);
    });

    await expect(new OffersSyncService().sync()).resolves.toMatchObject({ success: true });
    expect(deletions[0].searchParams.get("local_id")).toBe("eq.local-offer");
    expect(deletions).toHaveLength(found ? 1 : 2);
    if (!found) {
      expect(deletions[1].searchParams.get("id")).toBe("eq.23");
      expect(deletions[1].searchParams.get("local_id")).toBe("is.null");
    }
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

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({
    execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    select: vi.fn().mockResolvedValue([]),
  })),
}));

import { OrderSupabaseService } from "../orderSupabaseService";

describe("OrderSupabaseService - cleanId & Offline Queue", () => {
  const originalNavigator = globalThis.navigator;
  const originalLocalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: true },
      configurable: true,
    });
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    };
    if (typeof globalThis.window === "undefined") {
      (globalThis as any).window = { dispatchEvent: vi.fn() };
    }
    if (typeof globalThis.CustomEvent === "undefined") {
      (globalThis as any).CustomEvent = class CustomEvent {
        constructor(public type: string, public detail?: unknown) {}
      };
    }
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
    (globalThis as any).localStorage = originalLocalStorage;
    globalThis.window = originalWindow;
  });

  it("cleanId discards offline_/draft_/new_ IDs and preserves short supplier/order IDs", () => {
    const service = new OrderSupabaseService();
    expect(service.cleanId("offline_1730000000000")).toBeNull();
    expect(service.cleanId("ord_offline_1730000000000")).toBeNull();
    expect(service.cleanId("ord_draft_1")).toBeNull();
    expect(service.cleanId("new_row")).toBeNull();
    expect(service.cleanId("sup_42")).toBe("sup_42");
    expect(service.cleanId("42")).toBe("42");
    expect(service.cleanId("ord_9f8a7b6c-1234-4321-8888-111122223333")).toBe(
      "9f8a7b6c-1234-4321-8888-111122223333"
    );
  });

  it("rewrites targetId of queued updates after offline insert resolves remote ID", async () => {
    const service = new OrderSupabaseService();
    const updatedEqIds: string[] = [];

    const mockSupabase = {
      from: () => ({
        insert: () => ({
          select: async () => ({
            data: [{ id: "real-uuid-999", created_at: "2026-11-18T10:00:00Z" }],
            error: null,
          }),
        }),
        update: () => ({
          eq: async (_col: string, id: string) => {
            updatedEqIds.push(id);
            return { error: null };
          },
        }),
      }),
    };

    vi.spyOn(service, "getClient").mockResolvedValue(mockSupabase as any);
    localStorage.setItem(
      "last_order_offline_queue",
      JSON.stringify([
        {
          id: "q1",
          targetId: "ord_offline_12345",
          action: "insert",
          payload: { descrizione: "TEST" },
          timestamp: "2026-11-18T10:00:00Z",
        },
        {
          id: "q2",
          targetId: "ord_offline_12345",
          action: "update",
          payload: { descrizione: "TEST MODIFICATO" },
          timestamp: "2026-11-18T10:01:00Z",
        },
      ])
    );

    const processed = await service.processOfflineQueue();
    expect(processed).toBe(2);
    expect(updatedEqIds).toEqual(["real-uuid-999"]);
  });
});

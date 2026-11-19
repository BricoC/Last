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
import type { OrderItem } from "../../types/order";
import { setLastKnownSupabaseProjectUrl } from "@/shared/services/supabaseConfigCache";

const queueKey = "last_order_offline_queue";
const draft = { id: "ord_draft_test", description: "Primo ordine" } as OrderItem;

describe("OrderSupabaseService - cleanId & Offline Queue", () => {
  const originalNavigator = globalThis.navigator;
  const originalLocalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    setLastKnownSupabaseProjectUrl("https://example.test");
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

  it("cleanId accepts a cloud UUID and rejects local and supplier IDs", () => {
    const service = new OrderSupabaseService();
    expect(service.cleanId("offline_1730000000000")).toBeNull();
    expect(service.cleanId("ord_offline_1730000000000")).toBeNull();
    expect(service.cleanId("ord_draft_1")).toBeNull();
    expect(service.cleanId("new_row")).toBeNull();
    expect(service.cleanId("sup_42")).toBeNull();
    expect(service.cleanId("42")).toBeNull();
    expect(service.cleanId("ord_9f8a7b6c-1234-4321-8888-111122223333")).toBe(
      "9f8a7b6c-1234-4321-8888-111122223333"
    );
  });

  it("rewrites targetId of queued updates after offline insert resolves remote ID", async () => {
    const service = new OrderSupabaseService();
    const updatedEqIds: string[] = [];
    const remote = "9f8a7b6c-1234-4321-8888-111122223333";

    const mockSupabase = {
      from: () => ({
        upsert: () => ({
          select: async () => ({
            data: [{ id: remote, created_at: "2026-11-18T10:00:00Z" }],
            error: null,
          }),
        }),
        update: () => ({
          eq: (_col: string, id: string) => ({
            select: async () => {
              updatedEqIds.push(id);
              return { data: [{ id }], error: null };
            },
          }),
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
          remoteId: remote,
          payload: { descrizione: "TEST" },
          timestamp: "2026-11-18T10:00:00Z",
          projectUrl: "https://example.test",
        },
        {
          id: "q2",
          targetId: "ord_offline_12345",
          action: "update",
          payload: { descrizione: "TEST MODIFICATO" },
          timestamp: "2026-11-18T10:01:00Z",
          projectUrl: "https://example.test",
        },
      ])
    );

    const processed = await service.processOfflineQueue();
    expect(processed).toBe(2);
    expect(updatedEqIds).toEqual([remote]);
  });

  it("riusa lo stesso UUID se il cloud salva ma la risposta va persa", async () => {
    const service = new OrderSupabaseService();
    const remote = new Map<string, { id: string; descrizione: string }>();
    const upsert = vi.fn(([row]: { id: string; descrizione: string }[]) => ({
      select: async () => {
        remote.set(row.id, row);
        if (upsert.mock.calls.length === 1) throw new Error("Risposta persa");
        return { data: [row], error: null };
      },
    }));
    vi.spyOn(service, "getClient").mockResolvedValue({ from: () => ({ upsert }) } as any);

    await service.saveOrder(draft, true);
    await expect(service.processOfflineQueue()).resolves.toBe(1);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(remote.size).toBe(1);
    expect(JSON.parse(localStorage.getItem(queueKey)!)).toEqual([]);
  });

  it("accorpa edit offline e conserva un nuovo edit accodato durante l'invio", async () => {
    const service = new OrderSupabaseService();
    const online = globalThis.navigator as { onLine: boolean };
    online.onLine = false;
    await service.saveOrder(draft, true);
    await service.saveOrder({ ...draft, description: "Seconda versione" }, true);
    const initial = JSON.parse(localStorage.getItem(queueKey)!);
    expect(initial).toHaveLength(1);
    expect(initial[0].payload.descrizione).toBe("SECONDA VERSIONE");

    online.onLine = true;
    let complete!: (value: unknown) => void;
    let started!: () => void;
    const sending = new Promise<void>((resolve) => { started = resolve; });
    const upsert = vi.fn(() => ({
      select: () => new Promise((resolve) => { complete = resolve; started(); }),
    }));
    const update = vi.fn(() => ({ eq: () => ({ select: async () => ({ data: [{}], error: null }) }) }));
    vi.spyOn(service, "getClient").mockResolvedValue({ from: () => ({ upsert, update }) } as any);
    const run = service.processOfflineQueue();
    await sending;
    await service.saveOrder({ ...draft, description: "Terza versione" }, true);
    await expect(service.processOfflineQueue()).resolves.toBe(0);
    complete({ data: [{ id: initial[0].remoteId }], error: null });
    await expect(run).resolves.toBe(1);
    expect(JSON.parse(localStorage.getItem(queueKey)!)).toMatchObject([
      { targetId: initial[0].remoteId, action: "update", payload: { descrizione: "TERZA VERSIONE" } },
    ]);
    await expect(service.processOfflineQueue()).resolves.toBe(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ descrizione: "TERZA VERSIONE" }));
    expect(upsert).toHaveBeenCalledTimes(1);
  });
  it("recupera un riordino legacy accodato come aggiornamento e usa un UUID idempotente", async () => {
    const service = new OrderSupabaseService();
    localStorage.setItem(queueKey, JSON.stringify([
      { id: "legacy", targetId: "ord_1760000000000_abc", action: "update",
        payload: { descrizione: "Riordino" }, timestamp: "2026-01-01T00:00:00Z", projectUrl: "https://example.test" },
    ]));
    const upsert = vi.fn((rows: Array<{ id: string }>) => ({
      select: async () => ({ data: rows, error: null }),
    }));
    vi.spyOn(service, "getClient").mockResolvedValue({ from: () => ({ upsert }) } as any);
    await expect(service.processOfflineQueue()).resolves.toBe(1);
    expect(service.cleanId(upsert.mock.calls[0][0][0].id)).not.toBeNull();
    expect(service.getOfflineQueue()).toEqual([]);
  });

  it("inserisce un fornitore locale per nome e conserva in coda un errore REST", async () => {
    const service = new OrderSupabaseService();
    const upsert = vi.fn(() => ({
      select: vi.fn().mockResolvedValueOnce({ error: { code: "503" } }),
    }));
    vi.spyOn(service, "getClient").mockResolvedValue({ from: () => ({ upsert }) } as any);
    const supplier = await service.upsertSupplier({ id: "sup_1760000000000", name: "ACME" });
    expect(supplier).toMatchObject({ id: "sup_1760000000000", sync_status: "pending" });
    expect(upsert).toHaveBeenCalledWith([expect.objectContaining({ nome: "ACME" })], { onConflict: "nome" });
    expect(service.getOfflineQueue()).toMatchObject([{ action: "upsert_supplier", targetId: supplier.id }]);
  });

  it("accoda l'archiviazione sia per la bozza sia per l'ordine cloud nello stesso lotto", async () => {
    const service = new OrderSupabaseService();
    (globalThis.navigator as { onLine: boolean }).onLine = false;
    const cloud = "9f8a7b6c-1234-4321-8888-111122223333";
    await service.saveOrder(draft, true);
    await service.archiveOrders([draft.id, `ord_${cloud}`]);
    expect(service.getOfflineQueue()).toMatchObject([
      { action: "insert", targetId: draft.id },
      { action: "archive", targetId: draft.id },
      { action: "archive", targetId: cloud },
    ]);
  });

});

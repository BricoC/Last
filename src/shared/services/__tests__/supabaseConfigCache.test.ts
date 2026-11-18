import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

describe("supabaseConfigCache", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.resetModules();
    mockInvoke.mockReset();
    const listeners = new Map<string, Set<() => void>>();
    (globalThis as any).window = {
      addEventListener: (event: string, fn: () => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(fn);
      },
      dispatchEvent: (ev: { type: string }) => {
        for (const fn of listeners.get(ev.type) ?? []) {
          fn();
        }
      },
    };
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("caches config per loader and invalidates all loaders when supabase-config-updated fires", async () => {
    const { createCachedSupabaseConfigLoader } = await import("../supabaseConfigCache");
    const loader = createCachedSupabaseConfigLoader("TestService");

    mockInvoke.mockResolvedValueOnce({
      config: { projectUrl: "https://one.supabase.co/", anonKey: " key-1 " },
    });
    const first = await loader();
    const second = await loader();
    expect(first).toEqual({ projectUrl: "https://one.supabase.co", anonKey: "key-1" });
    expect(second).toEqual(first);
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    window.dispatchEvent({ type: "supabase-config-updated" } as Event);

    mockInvoke.mockResolvedValueOnce({
      config: { projectUrl: "https://two.supabase.co", anonKey: "key-2" },
    });
    const refreshed = await loader();
    expect(refreshed).toEqual({ projectUrl: "https://two.supabase.co", anonKey: "key-2" });
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { NotesSyncService } from "../services/notesSyncService";

describe("NotesSyncService", () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    mockInvoke.mockReset();
    mockExecute.mockReset();
    mockSelect.mockReset();
    mockExecute.mockResolvedValue({ rowsAffected: 1 });
    mockInvoke.mockResolvedValue({
      config: { projectUrl: "https://example.supabase.co", anonKey: "anon-key" },
    });
    if (typeof globalThis.window === "undefined") {
      (globalThis as any).window = { dispatchEvent: vi.fn() };
    }
    if (typeof globalThis.CustomEvent === "undefined") {
      (globalThis as any).CustomEvent = class CustomEvent {
        constructor(public type: string) {}
      };
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  });

  it("uses on_conflict=local_id upsert for pending notes, syncs offline trash deletions, and skips resurrected trash", async () => {
    const syncService = new NotesSyncService();
    mockSelect
      // 0. trashedWithRemote
      .mockResolvedValueOnce([
        { id: "trash-1", supabase_id: 77, deleted_at: "2026-11-18T10:00:00Z" },
      ])
      // 1. pending notes
      .mockResolvedValueOnce([
        {
          id: "restored-1",
          supabase_id: null,
          title: "Nota Ripristinata",
          content_html: "<p>Test</p>",
          content_text: "Test",
          is_pinned: 0,
          is_archived: 0,
          color: "default",
          created_by: "Admin",
          updated_by: "Admin",
          created_at: "2026-11-18T09:00:00Z",
          updated_at: "2026-11-18T10:05:00Z",
          sync_status: "pending",
        },
      ]);

    const calls: Array<{ method: string; url: string; headers: Record<string, string> }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      calls.push({ method, url, headers: (init?.headers as Record<string, string>) || {} });

      if (method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (method === "POST") {
        return new Response(JSON.stringify([{ id: 99 }]), { status: 201 });
      }
      // Pull returns trashed note #77 with older updated_at
      return new Response(
        JSON.stringify([
          {
            id: 77,
            local_id: "trash-1",
            title: "Vecchia",
            content_html: "",
            content_text: "",
            updated_at: "2026-11-18T09:50:00Z",
          },
        ]),
        { status: 200 }
      );
    }) as typeof fetch;

    const result = await syncService.sync();
    expect(result.success).toBe(true);
    expect(result.pushed).toBe(1);
    expect(result.pulled).toBe(0);

    const postCall = calls.find((c) => c.method === "POST");
    expect(postCall?.url).toContain("on_conflict=local_id");
    expect(postCall?.headers.Prefer).toContain("resolution=merge-duplicates");

    const delCall = calls.find((c) => c.method === "DELETE");
    expect(delCall?.url).toContain("id=eq.77");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { migrationTestDatabase } from "@/shared/data-layer/__tests__/migrationTestDatabase";
import { migrateNotesSchemaV23 } from "@/shared/data-layer/migrations/notesSchema";
import { migrateTrashSchemaV25 } from "@/shared/data-layer/migrations/trashSchema";
import { migrateNoteDeletionsV32 } from "@/shared/data-layer/migrations/noteDeletionsSchema";
import { migrateSyncedEntitiesProjectUrlV37 } from "@/shared/data-layer/migrations/projectUrlSchema";

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

import { NotesSyncService, notesSyncService } from "../services/notesSyncService";
import { notesRepository } from "../services/notesRepository";

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
        { id: "trash-1", supabase_id: 77, deleted_at: "2026-11-18T10:00:00Z", project_url: "https://example.supabase.co" },
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
          project_url: "https://example.supabase.co",
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
    expect(new URL(delCall!.url).searchParams.get("or")).toBe('(id.eq.77,local_id.eq."trash-1")');
  });

  it("ignora anche una copia cloud più recente quando la cancellazione fallisce", async () => {
    mockSelect
      .mockResolvedValueOnce([{ id: "trash-1", supabase_id: 77, deleted_at: "2026-01-01", project_url: "https://example.supabase.co" }])
      .mockResolvedValueOnce([]);
    globalThis.fetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json([{ id: 77, local_id: "trash-1", updated_at: "2026-02-01" }]));

    const result = await new NotesSyncService().sync();
    expect(result).toMatchObject({ success: false, pulled: 0, error: expect.stringContaining("HTTP 503") });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("conserva tutte le eliminazioni offline oltre i dieci elementi del cestino", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const sync = vi.spyOn(notesSyncService, "sync").mockResolvedValue({ success: false, pushed: 0, pulled: 0 });
    try {
      const db = migrationTestDatabase(sqlite);
      await migrateNotesSchemaV23(db);
      await migrateTrashSchemaV25(db);
      mockInvoke.mockImplementation(async (_name, { writes }: { writes: { sql: string; params: SQLInputValue[] }[] }) => {
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          for (const { sql, params } of writes) {
            sqlite.prepare(sql).run(Object.fromEntries(params.map((param, index) => [`$${index + 1}`, param])));
          }
          sqlite.exec("COMMIT");
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      });
      await migrateNoteDeletionsV32(db);
      await db.addColumnIfMissing("notes", "project_url", "TEXT");
      await db.addColumnIfMissing("notes_trash", "project_url", "TEXT");
      void migrateSyncedEntitiesProjectUrlV37;
      const insert = sqlite.prepare("INSERT INTO notes (id, supabase_id, title, created_at, updated_at) VALUES (?, ?, 'Nota', '2026-01-01', '2026-01-01')");
      for (let index = 1; index <= 11; index++) {
        insert.run(`nota-${index}`, index);
        await notesRepository.moveToTrash(`nota-${index}`);
      }
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM notes_trash").get()).toEqual({ count: 10 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM note_deletions").get()).toEqual({ count: 11 });
      expect(sqlite.prepare("SELECT supabase_id FROM note_deletions WHERE id = 'nota-1'").get()).toEqual({ supabase_id: 1 });
    } finally {
      sync.mockRestore();
      sqlite.close();
    }
  });
});

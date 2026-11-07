import { describe, it, expect } from "vitest";
import type { NoteRecord } from "../types/note";

describe("Notes types and data model", () => {
  it("creates a valid note object with default attributes", () => {
    const note: NoteRecord = {
      id: "note-123",
      title: "Promemoria Riunione",
      content_html: "<p>Discutere ordini <strong>fornitori</strong></p>",
      content_text: "Discutere ordini fornitori",
      is_pinned: 0,
      is_archived: 0,
      color: "default",
      created_by: "Admin",
      updated_by: "Admin",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sync_status: "synced",
    };

    expect(note.id).toBe("note-123");
    expect(note.is_pinned).toBe(0);
    expect(note.is_archived).toBe(0);
    expect(note.content_html).toContain("<strong>fornitori</strong>");
  });

  it("handles pinned and archived status transitions correctly", () => {
    let note: NoteRecord = {
      id: "note-pin",
      title: "Urgente",
      content_html: "<p>Attenzione alle scadenze</p>",
      content_text: "Attenzione alle scadenze",
      is_pinned: 0,
      is_archived: 0,
      created_at: "2026-11-07T08:00:00.000Z",
      updated_at: "2026-11-07T08:00:00.000Z",
      sync_status: "synced",
    };

    // Fissa in alto
    note = { ...note, is_pinned: 1 };
    expect(note.is_pinned).toBe(1);

    // Archivia
    note = { ...note, is_archived: 1 };
    expect(note.is_archived).toBe(1);
  });
});

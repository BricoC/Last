import { describe, it, expect } from "vitest";
import type { NoteRecord } from "../types/note";
import { matchesFragmentSearch } from "@/shared/hooks/useFragmentSearch";

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
      color: "default",
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

  it("supports multi-word fragment search across title and content", () => {
    const note: NoteRecord = {
      id: "note-search",
      title: "Ordine Fornitore Zippo",
      content_html: "<p>Richieste speciali per accendini e accessori</p>",
      content_text: "Richieste speciali per accendini e accessori",
      is_pinned: 0,
      is_archived: 0,
      color: "default",
      created_at: "2026-11-07T08:00:00.000Z",
      updated_at: "2026-11-07T08:00:00.000Z",
      sync_status: "synced",
    };

    // Ricerca multi-parola con parole in ordine sparso (una nel titolo, una nel testo)
    expect(matchesFragmentSearch([note.title, note.content_text], "zippo accessori")).toBe(true);
    expect(matchesFragmentSearch([note.title, note.content_text], "accessori zippo")).toBe(true);
    expect(matchesFragmentSearch([note.title, note.content_text], "ord acc")).toBe(true);
    expect(matchesFragmentSearch([note.title, note.content_text], "fornitore inesistente")).toBe(false);
  });
});


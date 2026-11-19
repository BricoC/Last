import { getDatabase } from "@/shared/data-layer/database";
import { applyLocalDatabaseBatch, type SqliteWrite } from "@/shared/data-layer/localDatabaseBatch";
import type { NoteRecord, TrashNoteRow } from "../types/note";
import { notesSyncService } from "./notesSyncService";
import { getLastKnownSupabaseProjectUrl } from "@/shared/services/supabaseConfigCache";

function queueNoteDeletion(id: string, deletedAt: string): SqliteWrite {
  const projectUrl = getLastKnownSupabaseProjectUrl();
  return {
    sql: `INSERT INTO note_deletions (id, supabase_id, deleted_at, project_url)
          SELECT id, supabase_id, $2,
            CASE WHEN project_url IS NOT NULL THEN project_url WHEN supabase_id IS NULL THEN $3 ELSE NULL END
          FROM notes WHERE id = $1
          ON CONFLICT(id) DO UPDATE SET supabase_id = excluded.supabase_id, deleted_at = excluded.deleted_at, project_url = excluded.project_url`,
    params: [id, deletedAt, projectUrl],
  };
}

export class NotesRepository {
  /**
   * Recupera le note (con le appuntate in cima, poi le più recenti per data di modifica)
   */
  public async getNotes(includeArchived: boolean = false): Promise<NoteRecord[]> {
    const db = await getDatabase();
    const query = includeArchived
      ? `SELECT * FROM notes ORDER BY is_pinned DESC, updated_at DESC`
      : `SELECT * FROM notes WHERE is_archived = 0 ORDER BY is_pinned DESC, updated_at DESC`;
    return await db.select<NoteRecord[]>(query);
  }

  /**
   * Recupera una singola nota per ID
   */
  public async getNoteById(id: string): Promise<NoteRecord | null> {
    const db = await getDatabase();
    const rows = await db.select<NoteRecord[]>(`SELECT * FROM notes WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] || null;
  }

  /**
   * Crea una nuova nota vuota
   */
  public async createNote(params?: {
    title?: string;
    created_by?: string;
    color?: string;
  }): Promise<NoteRecord> {
    const db = await getDatabase();
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const title = params?.title || "Nuova Nota";
    const createdBy = params?.created_by || "Operatore";
    const color = params?.color || "default";

    const projectUrl = getLastKnownSupabaseProjectUrl();

    await db.execute(
      `INSERT INTO notes (
        id, title, content_html, content_text, is_pinned, is_archived, color, created_by, updated_by, created_at, updated_at, sync_status, project_url
      ) VALUES ($1, $2, '', '', 0, 0, $3, $4, $4, $5, $5, 'pending', $6)`,
      [id, title, color, createdBy, nowIso, projectUrl]
    );

    return {
      id,
      title,
      content_html: "",
      content_text: "",
      is_pinned: 0,
      is_archived: 0,
      color,
      created_by: createdBy,
      updated_by: createdBy,
      created_at: nowIso,
      updated_at: nowIso,
      sync_status: "pending",
    };
  }

  /**
   * Salva o aggiorna il contenuto di una nota
   */
  public async saveNote(params: {
    id: string;
    title: string;
    content_html: string;
    content_text: string;
    color?: string;
    updated_by?: string;
  }): Promise<void> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();
    const updatedBy = params.updated_by || "Operatore";
    const color = params.color || "default";

    await db.execute(
      `UPDATE notes SET
        title = $1,
        content_html = $2,
        content_text = $3,
        color = $4,
        updated_by = $5,
        updated_at = $6,
        sync_status = 'pending'
      WHERE id = $7`,
      [params.title, params.content_html, params.content_text, color, updatedBy, nowIso, params.id]
    );
  }

  /**
   * Fissa in alto o rimuove lo stato fissato
   */
  public async togglePin(id: string, isPinned: boolean): Promise<void> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();
    await db.execute(
      `UPDATE notes SET is_pinned = $1, updated_at = $2, sync_status = 'pending' WHERE id = $3`,
      [isPinned ? 1 : 0, nowIso, id]
    );
  }

  /**
   * Archivia o ripristina una nota
   */
  public async toggleArchive(id: string, isArchived: boolean): Promise<void> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();
    await db.execute(
      `UPDATE notes SET is_archived = $1, updated_at = $2, sync_status = 'pending' WHERE id = $3`,
      [isArchived ? 1 : 0, nowIso, id]
    );
  }

  /**
   * Sposta una nota nel Cestino (massimo 10 elementi FIFO)
   */
  public async moveToTrash(id: string, deletedBy?: string): Promise<void> {
    await getDatabase();
    const now = new Date().toISOString();
    await applyLocalDatabaseBatch([
      {
        sql: `INSERT INTO notes_trash (
          id, supabase_id, title, content_html, content_text, is_pinned, is_archived, color,
          created_by, updated_by, created_at, updated_at, deleted_at, deleted_by, project_url
        ) SELECT id, supabase_id, title, content_html, content_text, is_pinned, is_archived, color,
          created_by, updated_by, created_at, updated_at, $2, $3,
          CASE WHEN project_url IS NOT NULL THEN project_url WHEN supabase_id IS NULL THEN $4 ELSE NULL END
        FROM notes WHERE id = $1`,
        params: [id, now, deletedBy || "Operatore", getLastKnownSupabaseProjectUrl()],
      },
      queueNoteDeletion(id, now),
      { sql: "DELETE FROM notes WHERE id = $1", params: [id] },
      {
        sql: `DELETE FROM notes_trash WHERE id NOT IN (
          SELECT id FROM notes_trash ORDER BY deleted_at DESC, rowid DESC LIMIT 10
        )`,
        params: [],
      },
    ]);
    void notesSyncService.sync();
  }

  /**
   * Restituisce le note nel cestino ordinate per data eliminazione (max 10)
   */
  public async getTrashNotes(): Promise<TrashNoteRow[]> {
    const db = await getDatabase();
    return await db.select<TrashNoteRow[]>(
      `SELECT * FROM notes_trash ORDER BY deleted_at DESC LIMIT 10`
    );
  }

  /**
   * Conteggio note nel cestino
   */
  public async getTrashCount(): Promise<number> {
    const db = await getDatabase();
    const rows = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM notes_trash`
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * Ripristina una nota dal Cestino alla lista attiva
   */
  public async restoreFromTrash(id: string): Promise<NoteRecord | null> {
    const db = await getDatabase();
    const rows = await db.select<TrashNoteRow[]>(
      `SELECT * FROM notes_trash WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!rows || rows.length === 0) return null;

    const item = rows[0];
    const nowIso = new Date().toISOString();

    await applyLocalDatabaseBatch([
      {
        sql: `INSERT INTO notes (
          id, supabase_id, title, content_html, content_text, is_pinned, is_archived, color,
          created_by, updated_by, created_at, updated_at, sync_status, project_url
        ) SELECT id, NULL, title, content_html, content_text, is_pinned, is_archived, color,
          created_by, updated_by, created_at, $2, 'pending',
          CASE WHEN project_url IS NOT NULL THEN project_url WHEN supabase_id IS NULL THEN $3 ELSE NULL END
          FROM notes_trash WHERE id = $1`,
        params: [id, nowIso, getLastKnownSupabaseProjectUrl()],
        expectedRows: 1,
      },
      { sql: "DELETE FROM note_deletions WHERE id = $1", params: [id] },
      { sql: "DELETE FROM notes_trash WHERE id = $1", params: [id] },
    ]);
    void notesSyncService.sync();

    return {
      id: item.id,
      supabase_id: null,
      title: item.title,
      content_html: item.content_html,
      content_text: item.content_text,
      is_pinned: item.is_pinned,
      is_archived: item.is_archived,
      color: item.color,
      created_by: item.created_by,
      updated_by: item.updated_by,
      created_at: item.created_at,
      updated_at: nowIso,
      sync_status: "pending",
    };
  }

  /**
   * Elimina definitivamente una nota
   */
  public async deleteNote(id: string): Promise<void> {
    await getDatabase();
    await applyLocalDatabaseBatch([
      queueNoteDeletion(id, new Date().toISOString()),
      { sql: "DELETE FROM notes WHERE id = $1", params: [id] },
      { sql: "DELETE FROM notes_trash WHERE id = $1", params: [id] },
    ]);
    void notesSyncService.sync();
  }
}

export const notesRepository = new NotesRepository();


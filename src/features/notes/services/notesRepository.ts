import { getDatabase } from "@/shared/data-layer/database";
import type { NoteRecord, TrashNoteRow } from "../types/note";
import { notesSyncService } from "./notesSyncService";

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

    await db.execute(
      `INSERT INTO notes (
        id, title, content_html, content_text, is_pinned, is_archived, color, created_by, updated_by, created_at, updated_at, sync_status
      ) VALUES ($1, $2, '', '', 0, 0, $3, $4, $4, $5, $5, 'pending')`,
      [id, title, color, createdBy, nowIso]
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
    const db = await getDatabase();
    const rows = await db.select<NoteRecord[]>(`SELECT * FROM notes WHERE id = $1 LIMIT 1`, [id]);
    if (!rows || rows.length === 0) return;

    const note = rows[0];
    const nowIso = new Date().toISOString();
    const user = deletedBy || "Operatore";

    // 1. Inserisci o aggiorna nel cestino
    await db.execute(
      `INSERT INTO notes_trash (
        id, supabase_id, title, content_html, content_text, is_pinned, is_archived, color, created_by, updated_by, created_at, updated_at, deleted_at, deleted_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT(id) DO UPDATE SET
        deleted_at = excluded.deleted_at,
        deleted_by = excluded.deleted_by`,
      [
        note.id,
        note.supabase_id ?? null,
        note.title,
        note.content_html,
        note.content_text,
        note.is_pinned,
        note.is_archived,
        note.color || "default",
        note.created_by || user,
        note.updated_by || user,
        note.created_at,
        note.updated_at,
        nowIso,
        user,
      ]
    );

    // 2. Rimuovi dalla tabella principale
    await db.execute(`DELETE FROM notes WHERE id = $1`, [id]);

    // 3. Tronca il cestino mantenendo rigorosamente le ultime 10 note (FIFO)
    await db.execute(`
      DELETE FROM notes_trash 
      WHERE id NOT IN (
        SELECT id FROM notes_trash 
        ORDER BY deleted_at DESC 
        LIMIT 10
      );
    `);

    // 4. Rimuovi da Supabase se presente
    if (note.supabase_id) {
      void notesSyncService.deleteRemoteNote(note.supabase_id);
    }
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

    // 1. Reinserisci nella tabella attiva con sync_status = 'pending' per risincronizzare su Supabase
    await db.execute(
      `INSERT INTO notes (
        id, supabase_id, title, content_html, content_text, is_pinned, is_archived, color, created_by, updated_by, created_at, updated_at, sync_status
      ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        content_html = excluded.content_html,
        content_text = excluded.content_text,
        is_pinned = excluded.is_pinned,
        is_archived = excluded.is_archived,
        color = excluded.color,
        updated_at = excluded.updated_at,
        sync_status = 'pending'`,
      [
        item.id,
        item.title,
        item.content_html,
        item.content_text,
        item.is_pinned,
        item.is_archived,
        item.color || "default",
        item.created_by,
        item.updated_by,
        item.created_at,
        nowIso,
      ]
    );

    // 2. Rimuovi dal cestino
    await db.execute(`DELETE FROM notes_trash WHERE id = $1`, [id]);

    // 3. Sincronizza su Supabase
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
    const db = await getDatabase();
    const rows = await db.select<{ supabase_id?: number | null }[]>(
      `SELECT supabase_id FROM notes WHERE id = $1 LIMIT 1`,
      [id]
    );
    await db.execute(`DELETE FROM notes WHERE id = $1`, [id]);
    await db.execute(`DELETE FROM notes_trash WHERE id = $1`, [id]);
    if (rows[0]?.supabase_id) {
      void notesSyncService.deleteRemoteNote(rows[0].supabase_id);
    }
  }
}

export const notesRepository = new NotesRepository();


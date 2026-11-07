import { getDatabase } from "@/shared/data-layer/database";
import type { NoteRecord } from "../types/note";

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
      ) VALUES ($1, $2, '', '', 0, 0, $3, $4, $4, $5, $5, 'synced')`,
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
      sync_status: "synced",
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
        updated_at = $6
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
      `UPDATE notes SET is_pinned = $1, updated_at = $2 WHERE id = $3`,
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
      `UPDATE notes SET is_archived = $1, updated_at = $2 WHERE id = $3`,
      [isArchived ? 1 : 0, nowIso, id]
    );
  }

  /**
   * Elimina definitivamente una nota
   */
  public async deleteNote(id: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(`DELETE FROM notes WHERE id = $1`, [id]);
  }
}

export const notesRepository = new NotesRepository();


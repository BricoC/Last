import { supabaseFetch } from "@/shared/services/supabaseSession";
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { matchesActiveSupabaseProject } from "@/shared/services/supabaseConfigCache";
import type { NoteRecord } from "../types/note";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
  isValid: boolean;
}

type NotesSyncResult = { success: boolean; pushed: number; pulled: number; error?: string };
type PendingDeletion = { id: string; supabase_id: number | null; deleted_at: string };

export class NotesSyncService {
  private activeSync: Promise<NotesSyncResult> | null = null;
  private rerunRequested = false;
  private syncError: string | null = null;
  private lastSyncTime: Date | null = null;

  public getStatus() {
    return {
      isSyncing: this.activeSync !== null,
      syncError: this.syncError,
      lastSyncTime: this.lastSyncTime,
    };
  }

  private async getSupabaseCredentials(): Promise<SupabaseConfig | null> {
    try {
      const res = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
      if (res?.config?.projectUrl && res?.config?.anonKey) {
        return {
          projectUrl: res.config.projectUrl.replace(/\/$/, ""),
          anonKey: res.config.anonKey,
        };
      }
    } catch (err) {
      console.warn("[NotesSync] Impossibile recuperare configurazione Supabase:", err);
    }
    return null;
  }

  /**
   * Sincronizzazione bidirezionale: invia le note modificate e scarica gli aggiornamenti dal cloud
   */
  public sync(): Promise<NotesSyncResult> {
    if (this.activeSync) {
      this.rerunRequested = true;
      return this.activeSync;
    }
    this.activeSync = this.runSync().finally(() => { this.activeSync = null; });
    return this.activeSync;
  }

  public async retryPendingDeletions(): Promise<void> {
    const db = await getDatabase();
    const [pending] = await db.select<{ id: string }[]>("SELECT id FROM note_deletions LIMIT 1");
    if (pending) await this.sync();
  }

  private async runSync(): Promise<NotesSyncResult> {
    let pushed = 0;
    let pulled = 0;
    let result: NotesSyncResult;
    do {
      this.rerunRequested = false;
      result = await this.syncOnce();
      pushed += result.pushed;
      pulled += result.pulled;
    } while (this.rerunRequested);
    return { ...result, pushed, pulled };
  }

  private async syncOnce(): Promise<NotesSyncResult> {
    const creds = await this.getSupabaseCredentials();
    if (!creds) {
      this.syncError = "Configurazione Supabase non disponibile";
      return { success: false, pushed: 0, pulled: 0, error: this.syncError };
    }

    this.syncError = null;

    let pushed = 0;
    let pulled = 0;

    try {
      const db = await getDatabase();

      const pendingDeletions = await db.select<Array<PendingDeletion & { project_url?: string | null }>>(
        "SELECT id, supabase_id, deleted_at, project_url FROM note_deletions ORDER BY deleted_at, id"
      );
      const activeProjectUrl = creds.projectUrl.trim().replace(/\/+$/, "").toLowerCase();
      let deletionError: string | undefined;
      for (const deletion of pendingDeletions) {
        const opProjectUrl = deletion.project_url?.trim().replace(/\/+$/, "").toLowerCase() || null;
        if (!opProjectUrl || opProjectUrl !== activeProjectUrl) {
          continue;
        }
        try {
          const url = new URL("/rest/v1/note", creds.projectUrl);
          if (deletion.supabase_id != null) {
            url.searchParams.set("or", `(id.eq.${deletion.supabase_id},local_id.eq.${JSON.stringify(deletion.id)})`);
          } else {
            url.searchParams.set("local_id", `eq.${deletion.id}`);
          }
          const response = await supabaseFetch(url.toString(), {
            method: "DELETE",
            headers: { apikey: creds.anonKey },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await db.execute(
            "DELETE FROM note_deletions WHERE id = $1 AND deleted_at = $2", [deletion.id, deletion.deleted_at]
          );
        } catch (error) {
          deletionError = `Eliminazioni note in sospeso: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      // 1. PUSH: Invia le note con sync_status = 'pending' verso Supabase (solo per il progetto attivo)
      const pendings = await db.select<Array<NoteRecord & { project_url?: string | null }>>(
        `SELECT * FROM notes WHERE sync_status = 'pending'
           AND NOT EXISTS (SELECT 1 FROM note_deletions WHERE note_deletions.id = notes.id)`
      );

      for (const item of pendings) {
        if (!matchesActiveSupabaseProject(item.project_url, activeProjectUrl)) continue;
        const payload = {
          local_id: item.id,
          title: item.title,
          content_html: item.content_html,
          content_text: item.content_text,
          is_pinned: Boolean(item.is_pinned),
          is_archived: Boolean(item.is_archived),
          color: item.color || "default",
          created_by: item.created_by || "Operatore",
          updated_by: item.updated_by || "Operatore",
          created_at: item.created_at,
          updated_at: item.updated_at,
        };

        if (item.supabase_id) {
          // PATCH su riga già esistente su Supabase (return=representation per rilevare righe eliminate da altri PC)
          const url = new URL(`/rest/v1/note?id=eq.${item.supabase_id}`, creds.projectUrl);
          const res = await supabaseFetch(url.toString(), {
            method: "PATCH",
            headers: {
              apikey: creds.anonKey,
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            const updatedRows = await res.json().catch(() => null);
            if (Array.isArray(updatedRows) && updatedRows.length === 0) {
              // La nota è stata eliminata su Cloud da un'altra postazione: non resuscitarla silenziosamente
              throw new Error(`Nota #${item.supabase_id} eliminata da un'altra postazione sul Cloud`);
            } else {
              await db.execute(
                `UPDATE notes SET sync_status = 'synced', project_url = $3 WHERE id = $1 AND updated_at = $2`,
                [item.id, item.updated_at, activeProjectUrl]
              );
            }
            pushed++;
          } else {
            const errBody = (await res.json().catch(() => ({}))) as { message?: string; hint?: string };
            throw new Error(`Errore invio Supabase: ${errBody?.message || res.statusText || res.status}`);
          }
        } else {
          // POST upsert con on_conflict=local_id per evitare 409 Conflict dopo restore dal cestino
          const url = new URL("/rest/v1/note?on_conflict=local_id", creds.projectUrl);
          const res = await supabaseFetch(url.toString(), {
            method: "POST",
            headers: {
              apikey: creds.anonKey,
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates,return=representation",
            },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            const data = await res.json().catch(() => []);
            const remoteId = Array.isArray(data) && data[0]?.id ? Number(data[0].id) : null;
            await db.execute(
              `UPDATE notes SET supabase_id = $1, sync_status = 'synced', project_url = $4 WHERE id = $2 AND updated_at = $3`,
              [remoteId, item.id, item.updated_at, activeProjectUrl]
            );
            pushed++;
          } else {
            const errBody = (await res.json().catch(() => ({}))) as { message?: string; hint?: string };
            throw new Error(`Errore invio Supabase: ${errBody?.message || res.statusText || res.status}`);
          }
        }
      }

      // 2. PULL: Scarica tutte le note remote da Supabase (paginazione da 1000)
      type RemoteNoteRow = {
        id: number;
        local_id?: string;
        title: string;
        content_html: string;
        content_text: string;
        is_pinned?: boolean | number;
        is_archived?: boolean | number;
        color?: string;
        created_by?: string;
        updated_by?: string;
        created_at?: string;
        updated_at?: string;
      };
      const PAGE_SIZE = 1000;
      const remoteById = new Map<number, RemoteNoteRow>();
      let pullOk = true;
      let pullErrorStatus: number | null = null;
      let cursor: { updated_at: string | null; id: number } | null = null;
      for (;;) {
        const pullUrl = new URL(
          `/rest/v1/note?select=*&order=updated_at.desc,id.desc&limit=${PAGE_SIZE}`,
          creds.projectUrl
        );
        if (cursor) {
          if (cursor.updated_at) {
            pullUrl.searchParams.set(
              "or",
              `(updated_at.lt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},id.lt.${cursor.id}))`
            );
          } else {
            pullUrl.searchParams.set(
              "or",
              `(and(updated_at.is.null,id.lt.${cursor.id}),updated_at.not.is.null)`
            );
          }
        }
        const pullRes = await supabaseFetch(pullUrl.toString(), {
          headers: {
            apikey: creds.anonKey,
            Prefer: "count=exact",
          },
        });
        if (!pullRes.ok) {
          pullOk = false;
          pullErrorStatus = pullRes.status;
          break;
        }
        const page = (await pullRes.json()) as RemoteNoteRow[];
        if (!Array.isArray(page) || page.length === 0) break;
        for (const row of page) {
          if (typeof row?.id === "number") remoteById.set(row.id, row);
        }
        const last = page[page.length - 1];
        if (typeof last?.id !== "number") {
          pullOk = false;
          break;
        }
        cursor = { updated_at: last.updated_at ?? null, id: last.id };
        const totalMatch = pullRes.headers.get("content-range")?.match(/\/(\d+)$/);
        if (totalMatch) {
          const total = Number(totalMatch[1]);
          if (remoteById.size >= total) break;
        } else if (page.length < PAGE_SIZE) {
          break;
        }
      }
      const remoteList = Array.from(remoteById.values());

      if (pullOk) {
        const activeProjectDeletions = pendingDeletions.filter((entry) =>
          matchesActiveSupabaseProject(entry.project_url, activeProjectUrl)
        );
        {
          for (const rem of remoteList) {
            if (activeProjectDeletions.some((entry) => entry.id === rem.local_id || entry.supabase_id === rem.id)) continue;
            const trashed = await db.select<{ id: string }[]>(
              "SELECT id FROM note_deletions WHERE (id = $1 OR supabase_id = $2) AND project_url = $3 " +
              "UNION ALL SELECT id FROM notes_trash WHERE (id = $1 OR supabase_id = $2) AND project_url = $3 LIMIT 1",
              [rem.local_id ?? null, rem.id, activeProjectUrl]
            );
            if (trashed.length) continue;

            const existing = await db.select<{ id: string; sync_status: string; updated_at: string }[]>(
              `SELECT id, sync_status, updated_at FROM notes WHERE (supabase_id = $1 OR (id = $2 AND $2 IS NOT NULL)) AND project_url = $3 LIMIT 1`,
              [rem.id, rem.local_id || null, activeProjectUrl]
            );

            const isPinnedNum = rem.is_pinned ? 1 : 0;
            const isArchivedNum = rem.is_archived ? 1 : 0;
            const nowIso = new Date().toISOString();

            if (existing.length === 0) {
              const newId = rem.local_id || crypto.randomUUID();
              await db.execute(
                `INSERT INTO notes (
                  id, supabase_id, title, content_html, content_text, is_pinned, is_archived, color, created_by, updated_by, created_at, updated_at, sync_status, project_url
                ) SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'synced', $13
                  WHERE NOT EXISTS (SELECT 1 FROM note_deletions WHERE (id = $1 OR supabase_id = $2) AND project_url = $13)
                    AND NOT EXISTS (SELECT 1 FROM notes_trash WHERE (id = $1 OR supabase_id = $2) AND project_url = $13)
                  ON CONFLICT(id) DO NOTHING`,
                [
                  newId,
                  rem.id,
                  rem.title || "Nuova Nota",
                  rem.content_html || "",
                  rem.content_text || "",
                  isPinnedNum,
                  isArchivedNum,
                  rem.color || "default",
                  rem.created_by || "Operatore",
                  rem.updated_by || "Operatore",
                  rem.created_at || nowIso,
                  rem.updated_at || nowIso,
                  activeProjectUrl,
                ]
              );
              pulled++;
            } else if (existing[0].sync_status === "synced") {
              await db.execute(
                `UPDATE notes SET
                  supabase_id = $1,
                  title = $2,
                  content_html = $3,
                  content_text = $4,
                  is_pinned = $5,
                  is_archived = $6,
                  color = $7,
                  created_by = $8,
                  updated_by = $9,
                  updated_at = $10
                WHERE id = $11 AND sync_status = 'synced' AND (updated_at IS NULL OR updated_at <= $10)`,
                [
                  rem.id,
                  rem.title || "Nuova Nota",
                  rem.content_html || "",
                  rem.content_text || "",
                  isPinnedNum,
                  isArchivedNum,
                  rem.color || "default",
                  rem.created_by || "Operatore",
                  rem.updated_by || "Operatore",
                  rem.updated_at || nowIso,
                  existing[0].id,
                ]
              );
            }
          }

          // Riconcilia le note synced eliminate da un altro PC
          const localSynced = await db.select<Array<{ id: string; supabase_id: number | null }>>(
            `SELECT id, supabase_id FROM notes WHERE supabase_id IS NOT NULL AND sync_status = 'synced' AND project_url = $1`,
            [activeProjectUrl]
          );
          for (const loc of Array.isArray(localSynced) ? localSynced : []) {
            if (loc.supabase_id !== null && !remoteById.has(Number(loc.supabase_id))) {
              await db.execute(
                `DELETE FROM notes WHERE id = $1 AND sync_status = 'synced' AND supabase_id = $2`,
                [loc.id, loc.supabase_id]
              );
            }
          }
        }
      }

      if (pullErrorStatus !== null) throw new Error(`Download note: HTTP ${pullErrorStatus}`);
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("notes-data-updated"));
      if (deletionError) throw new Error(deletionError);
      this.lastSyncTime = new Date();
      return { success: true, pushed, pulled };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.syncError = msg;
      console.warn("[NotesSync] Sync interrotta:", err);
      return { success: false, pushed, pulled, error: msg };
    }
  }
}

export const notesSyncService = new NotesSyncService();


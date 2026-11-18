import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
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

      const pendingDeletions = await db.select<PendingDeletion[]>(
        "SELECT id, supabase_id, deleted_at FROM note_deletions ORDER BY deleted_at, id"
      );
      let deletionError: string | undefined;
      for (const deletion of pendingDeletions) {
        try {
          const url = new URL("/rest/v1/note", creds.projectUrl);
          if (deletion.supabase_id != null) {
            url.searchParams.set("or", `(id.eq.${deletion.supabase_id},local_id.eq.${JSON.stringify(deletion.id)})`);
          } else {
            url.searchParams.set("local_id", `eq.${deletion.id}`);
          }
          const response = await fetch(url.toString(), {
            method: "DELETE",
            headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await db.execute(
            "DELETE FROM note_deletions WHERE id = $1 AND deleted_at = $2", [deletion.id, deletion.deleted_at]
          );
        } catch (error) {
          deletionError = `Eliminazioni note in sospeso: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      // 1. PUSH: Invia le note con sync_status = 'pending' verso Supabase
      const pendings = await db.select<NoteRecord[]>(
        `SELECT * FROM notes WHERE sync_status = 'pending'
           AND NOT EXISTS (SELECT 1 FROM note_deletions WHERE note_deletions.id = notes.id)`
      );

      for (const item of pendings) {
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
          // PATCH su riga già esistente su Supabase
          const url = new URL(`/rest/v1/note?id=eq.${item.supabase_id}`, creds.projectUrl);
          const res = await fetch(url.toString(), {
            method: "PATCH",
            headers: {
              apikey: creds.anonKey,
              Authorization: `Bearer ${creds.anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            await db.execute(`UPDATE notes SET sync_status = 'synced' WHERE id = $1 AND updated_at = $2`, [item.id, item.updated_at]);
            pushed++;
          } else {
            const errBody = (await res.json().catch(() => ({}))) as { message?: string; hint?: string };
            throw new Error(`Errore invio Supabase: ${errBody?.message || res.statusText || res.status}`);
          }
        } else {
          // POST upsert con on_conflict=local_id per evitare 409 Conflict dopo restore dal cestino
          const url = new URL("/rest/v1/note?on_conflict=local_id", creds.projectUrl);
          const res = await fetch(url.toString(), {
            method: "POST",
            headers: {
              apikey: creds.anonKey,
              Authorization: `Bearer ${creds.anonKey}`,
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates,return=representation",
            },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            const data = await res.json().catch(() => []);
            const remoteId = Array.isArray(data) && data[0]?.id ? Number(data[0].id) : null;
            await db.execute(
              `UPDATE notes SET supabase_id = $1, sync_status = 'synced' WHERE id = $2 AND updated_at = $3`,
              [remoteId, item.id, item.updated_at]
            );
            pushed++;
          } else {
            const errBody = (await res.json().catch(() => ({}))) as { message?: string; hint?: string };
            throw new Error(`Errore invio Supabase: ${errBody?.message || res.statusText || res.status}`);
          }
        }
      }

      // 2. PULL: Scarica le note remote da Supabase
      const pullUrl = new URL("/rest/v1/note?select=*&order=updated_at.desc&limit=1000", creds.projectUrl);
      const pullRes = await fetch(pullUrl.toString(), {
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
        },
      });

      if (pullRes.ok) {
        const remoteList = (await pullRes.json()) as Array<{
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
        }>;

        if (Array.isArray(remoteList)) {
          for (const rem of remoteList) {
            if (pendingDeletions.some((entry) => entry.id === rem.local_id || entry.supabase_id === rem.id)) continue;
            const trashed = await db.select<{ id: string }[]>(
              "SELECT id FROM note_deletions WHERE id = $1 OR supabase_id = $2 " +
              "UNION ALL SELECT id FROM notes_trash WHERE id = $1 OR supabase_id = $2 LIMIT 1",
              [rem.local_id ?? null, rem.id]
            );
            if (trashed.length) continue;

            const existing = await db.select<{ id: string; sync_status: string; updated_at: string }[]>(
              `SELECT id, sync_status, updated_at FROM notes WHERE supabase_id = $1 OR (id = $2 AND $2 IS NOT NULL) LIMIT 1`,
              [rem.id, rem.local_id || null]
            );

            const isPinnedNum = rem.is_pinned ? 1 : 0;
            const isArchivedNum = rem.is_archived ? 1 : 0;
            const nowIso = new Date().toISOString();

            if (existing.length === 0) {
              const newId = rem.local_id || crypto.randomUUID();
              await db.execute(
                `INSERT INTO notes (
                  id, supabase_id, title, content_html, content_text, is_pinned, is_archived, color, created_by, updated_by, created_at, updated_at, sync_status
                ) SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'synced'
                  WHERE NOT EXISTS (SELECT 1 FROM note_deletions WHERE id = $1 OR supabase_id = $2)
                    AND NOT EXISTS (SELECT 1 FROM notes_trash WHERE id = $1 OR supabase_id = $2)
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
                WHERE id = $11 AND sync_status = 'synced'`,
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
        }
      }

      if (!pullRes.ok) throw new Error(`Download note: HTTP ${pullRes.status}`);
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


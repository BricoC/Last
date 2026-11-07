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

export class NotesSyncService {
  private isSyncing = false;
  private syncError: string | null = null;
  private lastSyncTime: Date | null = null;

  public getStatus() {
    return {
      isSyncing: this.isSyncing,
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
  public async sync(): Promise<{ success: boolean; pushed: number; pulled: number; error?: string }> {
    if (this.isSyncing) {
      return { success: false, pushed: 0, pulled: 0, error: "Sincronizzazione già in corso" };
    }

    const creds = await this.getSupabaseCredentials();
    if (!creds) {
      this.syncError = "Configurazione Supabase non disponibile";
      return { success: false, pushed: 0, pulled: 0, error: this.syncError };
    }

    this.isSyncing = true;
    this.syncError = null;

    let pushed = 0;
    let pulled = 0;

    try {
      const db = await getDatabase();

      // 1. PUSH: Invia le note con sync_status = 'pending' verso Supabase
      const pendings = await db.select<NoteRecord[]>(
        `SELECT * FROM notes WHERE sync_status = 'pending'`
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
            await db.execute(`UPDATE notes SET sync_status = 'synced' WHERE id = $1`, [item.id]);
            pushed++;
          } else {
            const errBody = (await res.json().catch(() => ({}))) as { message?: string; hint?: string };
            throw new Error(`Errore invio Supabase: ${errBody?.message || res.statusText || res.status}`);
          }
        } else {
          // POST nuova riga
          const url = new URL("/rest/v1/note", creds.projectUrl);
          const res = await fetch(url.toString(), {
            method: "POST",
            headers: {
              apikey: creds.anonKey,
              Authorization: `Bearer ${creds.anonKey}`,
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            const data = await res.json().catch(() => []);
            const remoteId = Array.isArray(data) && data[0]?.id ? Number(data[0].id) : null;
            await db.execute(
              `UPDATE notes SET supabase_id = $1, sync_status = 'synced' WHERE id = $2`,
              [remoteId, item.id]
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
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'synced')`,
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
                WHERE id = $11`,
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

      this.lastSyncTime = new Date();
      window.dispatchEvent(new CustomEvent("notes-data-updated"));
      return { success: true, pushed, pulled };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.syncError = msg;
      console.warn("[NotesSync] Sync interrotta:", err);
      return { success: false, pushed, pulled, error: msg };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Elimina una nota da Supabase se possiede un ID remoto
   */
  public async deleteRemoteNote(supabaseId: number | null | undefined): Promise<void> {
    if (!supabaseId) return;
    const creds = await this.getSupabaseCredentials();
    if (!creds) return;

    try {
      const url = new URL(`/rest/v1/note?id=eq.${supabaseId}`, creds.projectUrl);
      await fetch(url.toString(), {
        method: "DELETE",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
        },
      });
    } catch (err) {
      console.warn("[NotesSync] Impossibile eliminare nota da Supabase:", err);
    }
  }
}

export const notesSyncService = new NotesSyncService();

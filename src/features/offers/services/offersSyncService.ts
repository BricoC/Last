import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import type { OfferRecord } from "../types/offer";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
  isValid: boolean;
}

export class OffersSyncService {
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
      console.warn("[OffersSync] Impossibile recuperare configurazione Supabase:", err);
    }
    return null;
  }

  /**
   * Sincronizzazione bidirezionale: invia le modifiche locali in attesa e scarica gli aggiornamenti remoti
   */
  public async sync(): Promise<{ success: boolean; pushed: number; pulled: number; error?: string }> {
    if (this.isSyncing) {
      return { success: false, pushed: 0, pulled: 0, error: "Sincronizzazione già in corso" };
    }

    const creds = await this.getSupabaseCredentials();
    if (!creds) {
      this.syncError = "Configurazione Supabase non configurata";
      return { success: false, pushed: 0, pulled: 0, error: this.syncError };
    }

    this.isSyncing = true;
    this.syncError = null;

    let pushed = 0;
    let pulled = 0;

    try {
      const db = await getDatabase();

      // 1. PUSH: Invia le offerte con sync_status = 'pending' verso Supabase
      const pendings = await db.select<OfferRecord[]>(
        `SELECT * FROM offers WHERE sync_status = 'pending'`
      );

      for (const item of pendings) {
        const payload = {
          local_id: item.id,
          offer_date: item.offer_date,
          requester: item.requester,
          contact: item.contact || "",
          items_text: item.items_text,
          status: item.status,
          is_urgent: Boolean(item.is_urgent),
          is_archived: Boolean(item.is_archived),
          created_by: item.created_by || "Operatore",
          updated_by: item.updated_by || "Operatore",
          created_at: item.created_at,
          updated_at: item.updated_at,
        };

        if (item.supabase_id) {
          // Aggiornamento PATCH per riga già registrata su Supabase
          const url = new URL(`/rest/v1/offerte?id=eq.${item.supabase_id}`, creds.projectUrl);
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
            await db.execute(`UPDATE offers SET sync_status = 'synced' WHERE id = $1`, [item.id]);
            pushed++;
          } else {
            const errBody = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(`Errore invio Supabase: ${errBody?.message || res.statusText || res.status}`);
          }
        } else {
          // Inserimento POST nuova offerta
          const url = new URL("/rest/v1/offerte", creds.projectUrl);
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
              `UPDATE offers SET supabase_id = $1, sync_status = 'synced' WHERE id = $2`,
              [remoteId, item.id]
            );
            pushed++;
          } else {
            const errBody = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(`Errore invio Supabase: ${errBody?.message || res.statusText || res.status}`);
          }
        }
      }

      // 2. PULL: Scarica le offerte remote e aggiorna la copia locale
      const pullUrl = new URL("/rest/v1/offerte?select=*&order=id.desc&limit=1000", creds.projectUrl);
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
          offer_date: string;
          requester: string;
          contact?: string;
          items_text: string;
          status: string;
          is_urgent?: boolean | number;
          is_archived: boolean | number;
          created_by?: string;
          updated_by?: string;
          created_at?: string;
          updated_at?: string;
        }>;

        if (Array.isArray(remoteList)) {
          for (const rem of remoteList) {
            // Controlla se abbiamo già questo record cercandolo per supabase_id o local_id
            const existing = await db.select<{ id: string; sync_status: string; updated_at: string }[]>(
              `SELECT id, sync_status, updated_at FROM offers WHERE supabase_id = $1 OR (id = $2 AND $2 IS NOT NULL) LIMIT 1`,
              [rem.id, rem.local_id || null]
            );

            const isArchivedNum = rem.is_archived ? 1 : 0;
            const isUrgentNum = rem.is_urgent ? 1 : 0;
            const nowIso = new Date().toISOString();

            if (existing.length === 0) {
              // Nuovo record remoto inserito da un'altra postazione
              const newId = rem.local_id || crypto.randomUUID();
              await db.execute(
                `INSERT INTO offers (
                  id, supabase_id, offer_date, requester, contact, items_text, status, is_urgent, is_archived, created_by, updated_by, created_at, updated_at, sync_status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'synced')`,
                [
                  newId,
                  rem.id,
                  rem.offer_date || nowIso.slice(0, 10),
                  rem.requester || "Cliente",
                  rem.contact || "",
                  rem.items_text || "",
                  rem.status || "Da preparare",
                  isUrgentNum,
                  isArchivedNum,
                  rem.created_by || "Operatore",
                  rem.updated_by || "Operatore",
                  rem.created_at || nowIso,
                  rem.updated_at || nowIso,
                ]
              );
              pulled++;
            } else if (existing[0].sync_status === "synced") {
              // Se la versione locale non ha modifiche in sospeso, aggiorniamo con i dati remoti
              await db.execute(
                `UPDATE offers SET 
                  supabase_id = $1,
                  offer_date = $2,
                  requester = $3,
                  contact = $4,
                  items_text = $5,
                  status = $6,
                  is_urgent = $7,
                  is_archived = $8,
                  created_by = $9,
                  updated_by = $10,
                  updated_at = $11
                 WHERE id = $12`,
                [
                  rem.id,
                  rem.offer_date,
                  rem.requester,
                  rem.contact || "",
                  rem.items_text,
                  rem.status,
                  isUrgentNum,
                  isArchivedNum,
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
      window.dispatchEvent(new CustomEvent("offers-data-updated"));
      return { success: true, pushed, pulled };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.syncError = msg;
      console.warn("[OffersSync] Sync interrotta (offline o errore rete):", err);
      return { success: false, pushed, pulled, error: msg };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Elimina un'offerta da Supabase se possiede un ID remoto
   */
  public async deleteRemoteOffer(supabaseId: number | null | undefined): Promise<void> {
    if (!supabaseId) return;
    const creds = await this.getSupabaseCredentials();
    if (!creds) return;

    try {
      const url = new URL(`/rest/v1/offerte?id=eq.${supabaseId}`, creds.projectUrl);
      await fetch(url.toString(), {
        method: "DELETE",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
        },
      });
    } catch (err) {
      console.warn("[OffersSync] Impossibile eliminare offerta remota da Supabase:", err);
    }
  }
}

export const offersSyncService = new OffersSyncService();


import { invoke } from "@tauri-apps/api/core";
import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { getDatabase } from "@/shared/data-layer/database";
import { OrderItem } from "../types/order";
import { parseHighlights } from "./orderRepository";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  isConfigured: boolean;
  config: SupabaseConfig | null;
}

export class OrderSyncService {
  private client: SupabaseClient | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  public recentlyPushedRemoteIds = new Set<number>();
  private inFlightLocalIds = new Set<string>();
  private isPushing = false;

  private async getCredentials(): Promise<SupabaseConfig | null> {
    try {
      const status = await invoke<ConfigStatus>("load_supabase_config");
      if (!status.config || !status.config.projectUrl || !status.config.anonKey) {
        return null;
      }
      return status.config;
    } catch {
      return null;
    }
  }

  async getClient(): Promise<SupabaseClient | null> {
    if (this.client) return this.client;
    const creds = await this.getCredentials();
    if (!creds) return null;
    this.client = createClient(creds.projectUrl, creds.anonKey);
    return this.client;
  }

  /**
   * Avvia la sottoscrizione WebSocket in tempo reale a Supabase (canale 'realtime_om')
   * Riceve istantaneamente modifiche fatte da NoMan V1 o da altri terminali
   */
  async startRealtime(): Promise<void> {
    const supabase = await this.getClient();
    if (!supabase || this.realtimeChannel) return;

    this.realtimeChannel = supabase
      .channel("realtime_om")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ordini" },
        async (payload) => {
          await this.handleRemoteOrderChange(payload);
          window.dispatchEvent(
            new CustomEvent("supabase_update_ordini", { detail: payload })
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fornitori" },
        async (payload) => {
          await this.syncSuppliersFromSupabase();
          window.dispatchEvent(
            new CustomEvent("supabase_update_fornitori", { detail: payload })
          );
        }
      )
      .subscribe();
  }

  /**
   * Disconnette il canale Realtime quando si lascia la pagina
   */
  stopRealtime(): void {
    if (this.realtimeChannel && this.client) {
      void this.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  /**
   * Salva localmente in SQLite il cambio ricevuto via WebSocket
   */
  private async handleRemoteOrderChange(payload: any): Promise<void> {
    try {
      const db = await getDatabase();
      if (payload.eventType === "DELETE") {
        if (payload.old?.id) {
          await db.execute(`DELETE FROM orders WHERE supabase_id = $1`, [payload.old.id]);
        }
      } else if (payload.new) {
        const item = payload.new;
        if (this.recentlyPushedRemoteIds.has(item.id)) {
          return;
        }

        const existing = await db.select<Array<{ id: string }>>(
          `SELECT id FROM orders WHERE supabase_id = $1 LIMIT 1`,
          [item.id]
        );

        const now = new Date().toISOString();
        if (existing.length > 0) {
          await db.execute(
            `UPDATE orders SET
              order_date = $1, supplier_name = $2, article_code = $3, description = $4,
              quantity = $5, price = $6, ordered_date = $7, notes = $8, user_name = $9,
              is_archived = $10, is_deleted = $11, highlights = $12, updated_at = $13,
              sync_status = 'synced'
            WHERE supabase_id = $14`,
            [
              item.data || "",
              item.fornitore || "",
              item.articolo || "",
              (item.descrizione || "").toUpperCase(),
              String(item.quantita || ""),
              String(item.prezzo || ""),
              item.ordinato || null,
              item.note || "",
              item.utente || "",
              item.archiviato ? 1 : 0,
              item.eliminato ? 1 : 0,
              JSON.stringify(parseHighlights(item.evidenze)),
              item.ultima_modifica || now,
              item.id,
            ]
          );
        } else {
          const localId = "ord_" + item.id;
          await db.execute(
            `INSERT INTO orders (
              id, supabase_id, order_date, supplier_name, article_code, description,
              quantity, price, ordered_date, notes, user_name, is_archived, is_deleted,
              highlights, created_at, updated_at, sync_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'synced')
            ON CONFLICT(id) DO UPDATE SET
              supabase_id = excluded.supabase_id,
              order_date = excluded.order_date,
              supplier_name = excluded.supplier_name,
              article_code = excluded.article_code,
              description = excluded.description,
              quantity = excluded.quantity,
              price = excluded.price,
              ordered_date = excluded.ordered_date,
              notes = excluded.notes,
              user_name = excluded.user_name,
              is_archived = excluded.is_archived,
              is_deleted = excluded.is_deleted,
              highlights = excluded.highlights,
              updated_at = excluded.updated_at,
              sync_status = 'synced'`,
            [
              localId,
              item.id,
              item.data || "",
              item.fornitore || "",
              item.articolo || "",
              (item.descrizione || "").toUpperCase(),
              String(item.quantita || ""),
              String(item.prezzo || ""),
              item.ordinato || null,
              item.note || "",
              item.utente || "",
              item.archiviato ? 1 : 0,
              item.eliminato ? 1 : 0,
              JSON.stringify(parseHighlights(item.evidenze)),
              item.created_at || now,
              item.ultima_modifica || now,
            ]
          );
        }
      }
    } catch (err) {
      console.warn("[OrderSyncService] Errore aggiornamento locale da realtime:", err);
    }
  }

  /**
   * Scarica fornitori da Supabase e li salva localmente in SQLite
   */
  async syncSuppliersFromSupabase(): Promise<number> {
    const creds = await this.getCredentials();
    if (!creds) return 0;

    try {
      const url = new URL("/rest/v1/fornitori", creds.projectUrl);
      url.searchParams.set("select", "*");
      url.searchParams.set("order", "nome.asc");

      const res = await fetch(url.toString(), {
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
        },
      });

      if (!res.ok) return 0;
      const data: any[] = await res.json();
      if (!data || data.length === 0) return 0;

      const db = await getDatabase();
      const now = new Date().toISOString();

      for (const item of data) {
        await db.execute(
          `INSERT INTO suppliers (
            id, supabase_id, name, representative, email, phone, address, vat_number, notes, created_at, updated_at, sync_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'synced')
          ON CONFLICT(name) DO UPDATE SET
            supabase_id = excluded.supabase_id,
            representative = excluded.representative,
            email = excluded.email,
            phone = excluded.phone,
            address = excluded.address,
            vat_number = excluded.vat_number,
            notes = excluded.notes,
            updated_at = excluded.updated_at,
            sync_status = 'synced'`,
          [
            'sup_' + item.id,
            item.id,
            (item.nome || '').trim(),
            item.rappresentante || '',
            item.email || '',
            item.telefono || '',
            item.indirizzo || '',
            item.piva || '',
            item.note || '',
            item.created_at || now,
            now,
          ]
        );
      }

      return data.length;
    } catch (err) {
      console.warn("[OrderSyncService] Errore sync fornitori:", err);
      return 0;
    }
  }

  /**
   * Scarica ordini da Supabase e li salva localmente in SQLite
   */
  async syncOrdersFromSupabase(): Promise<number> {
    const creds = await this.getCredentials();
    if (!creds) return 0;

    try {
      const url = new URL("/rest/v1/ordini", creds.projectUrl);
      url.searchParams.set("select", "*");
      url.searchParams.set("order", "created_at.desc");
      url.searchParams.set("limit", "2500");

      const res = await fetch(url.toString(), {
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
        },
      });

      if (!res.ok) return 0;
      const data: any[] = await res.json();
      if (!data || data.length === 0) return 0;

      const db = await getDatabase();
      const now = new Date().toISOString();

      for (const item of data) {
        const localId = 'ord_' + item.id;
        await db.execute(
          `INSERT INTO orders (
            id, supabase_id, order_date, supplier_name, article_code, description,
            quantity, price, ordered_date, notes, user_name, is_archived, is_deleted,
            highlights, created_at, updated_at, sync_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'synced')
          ON CONFLICT(id) DO UPDATE SET
            supabase_id = excluded.supabase_id,
            order_date = excluded.order_date,
            supplier_name = excluded.supplier_name,
            article_code = excluded.article_code,
            description = excluded.description,
            quantity = excluded.quantity,
            price = excluded.price,
            ordered_date = excluded.ordered_date,
            notes = excluded.notes,
            user_name = excluded.user_name,
            is_archived = excluded.is_archived,
            is_deleted = excluded.is_deleted,
            highlights = excluded.highlights,
            updated_at = excluded.updated_at,
            sync_status = 'synced'`,
          [
            localId,
            item.id,
            item.data || '',
            item.fornitore || '',
            item.articolo || '',
            (item.descrizione || '').toUpperCase(),
            String(item.quantita || ''),
            String(item.prezzo || ''),
            item.ordinato || null,
            item.note || '',
            item.utente || '',
            item.archiviato ? 1 : 0,
            item.eliminato ? 1 : 0,
            JSON.stringify(parseHighlights(item.evidenze)),
            item.created_at || now,
            item.ultima_modifica || now,
          ]
        );
      }

      return data.length;
    } catch (err) {
      console.warn("[OrderSyncService] Errore sync ordini:", err);
      return 0;
    }
  }

  /**
   * Spinge le modifiche locali in stato 'pending' verso Supabase
   */
  async pushPendingOrdersToSupabase(): Promise<void> {
    if (this.isPushing) return;
    this.isPushing = true;
    try {
      const creds = await this.getCredentials();
      if (!creds) return;

      const db = await getDatabase();
      const pendings = await db.select<OrderItem[]>(
        `SELECT * FROM orders WHERE sync_status = 'pending' LIMIT 50`
      );

      for (const p of pendings) {
        if (this.inFlightLocalIds.has(p.id)) {
          continue;
        }
        this.inFlightLocalIds.add(p.id);

        try {
          const payload: Record<string, unknown> = {
            data: p.order_date || null,
            fornitore: p.supplier_name || '',
            articolo: p.article_code || '',
            descrizione: (p.description || '').toUpperCase(),
            quantita: p.quantity || '',
            prezzo: p.price || '',
            ordinato: p.ordered_date || null,
            note: p.notes || '',
            utente: p.user_name || 'Operatore',
            archiviato: Boolean(p.is_archived),
            eliminato: Boolean(p.is_deleted),
            evidenze: parseHighlights(p.highlights),
            ultima_modifica: new Date().toISOString(),
          };

          if (p.supabase_id) {
            const url = new URL(`/rest/v1/ordini?id=eq.${p.supabase_id}`, creds.projectUrl);
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
              await db.execute(`UPDATE orders SET sync_status = 'synced' WHERE id = $1`, [p.id]);
            }
          } else {
            const url = new URL("/rest/v1/ordini", creds.projectUrl);
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
              const inserted = await res.json();
              const remoteId = inserted[0]?.id;
              if (remoteId) {
                this.recentlyPushedRemoteIds.add(remoteId);
                setTimeout(() => this.recentlyPushedRemoteIds.delete(remoteId), 30000);
                await db.execute(
                  `UPDATE orders SET supabase_id = $1, sync_status = 'synced' WHERE id = $2`,
                  [remoteId, p.id]
                );
                window.dispatchEvent(
                  new CustomEvent("order_synced_remote_id", {
                    detail: { localId: p.id, supabaseId: remoteId },
                  })
                );
              }
            }
          }
        } finally {
          this.inFlightLocalIds.delete(p.id);
        }
      }
    } catch (err) {
      console.warn("[OrderSyncService] Errore push pending orders:", err);
    } finally {
      this.isPushing = false;
    }
  }

  /**
   * Sincronizzazione completa all'avvio
   */
  async fullSync(): Promise<{ suppliersCount: number; ordersCount: number }> {
    const suppliersCount = await this.syncSuppliersFromSupabase();
    const ordersCount = await this.syncOrdersFromSupabase();
    await this.pushPendingOrdersToSupabase();
    return { suppliersCount, ordersCount };
  }
}

export const orderSyncService = new OrderSyncService();

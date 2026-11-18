import { invoke } from "@tauri-apps/api/core";
import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { getDatabase } from "@/shared/data-layer/database";
import { deterministicUuid } from "@/shared/utils/deterministicUuid";
import { OrderItem, Supplier, OrderViewMode } from "../types/order";
import { parseHighlights, TODAY } from "../utils/constants";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
  configPath?: string;
}

export interface OfflineQueueItem {
  id: string;
  targetId: string;
  action:
    | "insert"
    | "update"
    | "soft_delete"
    | "permanent_delete"
    | "restore_trash"
    | "restore_archive"
    | "archive"
    | "highlight"
    | "upsert_supplier"
    | "delete_supplier";
  remoteId?: string;
  payload?: any;
  timestamp: string;
}

const QUEUE_STORAGE_KEY = "last_order_offline_queue";

export class OrderSupabaseService {
  private client: SupabaseClient | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private onlineHandler: (() => void) | null = null;
  private queueIntervalId: ReturnType<typeof setInterval> | null = null;
  public recentlyPushedRemoteIds = new Set<string>();
  private isProcessingQueue = false;
  private processingItemId?: string;
  private readonly resolvedDrafts = new Map<string, string>();

  private async getCredentials(): Promise<SupabaseConfig | null> {
    try {
      const status = await invoke<ConfigStatus>("load_supabase_config");
      if (!status?.config?.projectUrl || !status?.config?.anonKey) {
        return null;
      }
      return status.config;
    } catch {
      return null;
    }
  }

  async getClient(requireFreshConfig = false): Promise<SupabaseClient | null> {
    if (this.client && !requireFreshConfig) return this.client;
    const creds = await this.getCredentials();
    if (!creds) return null;
    const client = createClient(creds.projectUrl, creds.anonKey);
    if (!requireFreshConfig) this.client = client;
    return client;
  }

  /**
   * Avvia sottoscrizione WebSocket Realtime (identica a noManV1)
   */
  async startRealtime(): Promise<void> {
    const supabase = await this.getClient();
    if (!supabase || this.realtimeChannel) return;

    this.realtimeChannel = supabase
      .channel("realtime_om")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ordini" },
        (payload) => {
          if (payload.eventType === "DELETE" && payload.old && (payload.old as any).id) {
            void this.deleteFromSqlite([String((payload.old as any).id)]);
          }
          window.dispatchEvent(
            new CustomEvent("supabase_update_ordini", { detail: payload })
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fornitori" },
        (payload) => {
          window.dispatchEvent(
            new CustomEvent("supabase_update_fornitori", { detail: payload })
          );
        }
      )
      .subscribe();

    // Allinea silenziosamente la cache SQLite degli ordini con Supabase
    void this.reconcileFullOrdersCache();

    // Ascolta il ritorno della connessione internet per svuotare la coda offline
    if (!this.onlineHandler) {
      this.onlineHandler = () => {
        void this.processOfflineQueue();
      };
      window.addEventListener("online", this.onlineHandler);
    }

    // Controllo periodico coda ogni 15 secondi
    if (!this.queueIntervalId) {
      this.queueIntervalId = setInterval(() => {
        if (navigator.onLine) {
          void this.processOfflineQueue();
        }
      }, 15000);
    }
  }

  stopRealtime(): void {
    if (this.realtimeChannel && this.client) {
      void this.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    if (this.onlineHandler) {
      window.removeEventListener("online", this.onlineHandler);
      this.onlineHandler = null;
    }
    if (this.queueIntervalId) {
      clearInterval(this.queueIntervalId);
      this.queueIntervalId = null;
    }
  }

  /**
   * Pulisce e risolve un ID, rimuovendo prefissi "ord_" e scartando ID sintetici locali
   */
  public cleanId(id: string | number | null | undefined): string | null {
    if (!id) return null;
    let s = String(id).trim();
    if (s.startsWith("ord_") && !s.startsWith("ord_draft_")) {
      s = s.slice(4);
    }
    if (!s || s.startsWith("ord_draft_") || s.startsWith("draft_") || s.startsWith("new_") || s.startsWith("offline_")) {
      return null;
    }
    return s;
  }

  /**
   * Carica ordini direttamente da Supabase Cloud.
   * Se offline o errore di rete, legge dalla cache SQLite locale.
   */
  async fetchOrders(viewMode: OrderViewMode = "attivi", requireCloud = false): Promise<OrderItem[]> {
    const supabase = await this.getClient(requireCloud);
    if (supabase && navigator.onLine) {
      try {
        let query = supabase.from("ordini").select("*");
        if (viewMode === "archiviati") {
          query = query.eq("archiviato", true).eq("eliminato", false).order("created_at", { ascending: false });
        } else if (viewMode === "cestino") {
          query = query.eq("eliminato", true).order("created_at", { ascending: false });
        } else {
          query = query
            .or("archiviato.is.null,archiviato.eq.false")
            .eq("eliminato", false)
            .order("created_at", { ascending: true });
        }

        const data = await this.readCloudPages(query.order("id"));

        const mapped: OrderItem[] = data.map((r: any) => ({
          id: r.id,
          supabase_id: r.id,
          order_date: r.data || "",
          supplier_name: r.fornitore || "",
          article_code: r.articolo || "",
          description: (r.descrizione || "").toUpperCase(),
          quantity: String(r.quantita || ""),
          price: String(r.prezzo || ""),
          ordered_date: r.ordinato || null,
          notes: r.note || "",
          user_name: r.utente || "",
          is_archived: Boolean(r.archiviato),
          is_deleted: Boolean(r.eliminato),
          highlights: parseHighlights(r.evidenze),
          created_at: r.created_at || new Date().toISOString(),
          updated_at: r.ultima_modifica || new Date().toISOString(),
          sync_status: "synced",
        }));

        // Salva in background nella cache locale SQLite (senza bloccare)
        if (requireCloud) await this.cacheOrdersToSqlite(mapped, viewMode, true);
        else void this.cacheOrdersToSqlite(mapped, viewMode);

        return mapped;
      } catch (err) {
        if (requireCloud) throw err;
        console.warn("[OrderSupabaseService] Errore fetch Supabase, fallback SQLite:", err);
      }
    }

    // Fallback SQLite locale
    if (requireCloud) throw new Error("Cloud ordini non disponibile");
    return this.loadOrdersFromSqlite(viewMode);
  }

  /**
   * Carica fornitori direttamente da Supabase Cloud
   */
  async fetchSuppliers(requireCloud = false): Promise<Supplier[]> {
    const supabase = await this.getClient(requireCloud);
    if (supabase && navigator.onLine) {
      try {
        const data = await this.readCloudPages(supabase.from("fornitori").select("*").order("nome").order("id"));

        const mapped: Supplier[] = data.map((r: any) => ({
          id: String(r.id),
          supabase_id: r.id,
          name: r.nome || "",
          representative: r.rappresentante || "",
          email: r.email || "",
          phone: r.telefono || "",
          address: r.indirizzo || "",
          vat_number: r.piva || "",
          notes: r.note || "",
          created_at: r.created_at || new Date().toISOString(),
          updated_at: r.created_at || new Date().toISOString(),
          sync_status: "synced",
        }));

        if (requireCloud) await this.cacheSuppliersToSqlite(mapped, true);
        else void this.cacheSuppliersToSqlite(mapped);
        return mapped;
      } catch (err) {
        if (requireCloud) throw err;
        console.warn("[OrderSupabaseService] Errore fetch fornitori Supabase, fallback SQLite:", err);
      }
    }

    if (requireCloud) throw new Error("Cloud fornitori non disponibile");
    return this.loadSuppliersFromSqlite();
  }

  private async readCloudPages<T>(query: {
    range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  }): Promise<T[]> {
    const rows: T[] = [];
    for (;;) {
      const { data, error } = await query.range(rows.length, rows.length + 999);
      if (error || !Array.isArray(data)) throw new Error(error?.message || "Risposta Supabase non valida");
      if (!data.length) return rows;
      rows.push(...data);
    }
  }

  /**
   * Salva o aggiorna un ordine (0ms su Supabase, con coda offline se la connessione manca)
   */
  async saveOrder(
    order: OrderItem,
    isDraft: boolean = false
  ): Promise<{ success: boolean; data?: OrderItem; error?: string }> {
    const nowIso = new Date().toISOString();
    const autoDate = order.order_date?.trim() ? order.order_date : TODAY();
    const resolvedId = this.resolvedDrafts.get(order.id);
    const cleanId = resolvedId || this.cleanId(order.supabase_id) || this.cleanId(order.id);
    const inserting = !resolvedId && (isDraft || !cleanId);
    const localId = cleanId || order.id || "ord_offline_" + crypto.randomUUID();
    const remoteId = inserting ? await deterministicUuid(`last:order:${localId}`) : undefined;
    const queued = this.getOfflineQueue().some((item) => item.targetId === localId);

    const remotePayload = {
      data: autoDate,
      fornitore: order.supplier_name || "",
      articolo: order.article_code || "",
      descrizione: (order.description || "").toUpperCase(),
      quantita: String(order.quantity || ""),
      prezzo: String(order.price || ""),
      ordinato: order.ordered_date || null,
      note: order.notes || "",
      utente: order.user_name || "Operatore",
      archiviato: Boolean(order.is_archived),
      eliminato: Boolean(order.is_deleted),
      evidenze: parseHighlights(order.highlights),
      ultima_modifica: nowIso,
    };

    const supabase = queued ? null : await this.getClient();
    if (supabase && navigator.onLine) {
      try {
        if (!inserting && cleanId) {
          // Update riga esistente
          this.recentlyPushedRemoteIds.add(cleanId);
          setTimeout(() => this.recentlyPushedRemoteIds.delete(cleanId), 30000);

          const { error } = await supabase.from("ordini").update(remotePayload).eq("id", cleanId);
          if (error) throw error;

          const updatedItem: OrderItem = {
            ...order,
            id: cleanId,
            supabase_id: cleanId,
            order_date: autoDate,
            updated_at: nowIso,
            sync_status: "synced",
          };
          void this.cacheSingleOrderToSqlite(updatedItem);
          return { success: true, data: updatedItem };
        } else {
          // Insert nuova riga
          const { data, error } = await supabase.from("ordini").upsert([{ ...remotePayload, id: remoteId }], { onConflict: "id" }).select();
          if (error) throw error;
          if (data && data[0]) {
            const newId = String(data[0].id);
            this.resolvedDrafts.set(localId, newId);
            this.recentlyPushedRemoteIds.add(newId);
            setTimeout(() => this.recentlyPushedRemoteIds.delete(newId), 30000);

            const insertedItem: OrderItem = {
              ...order,
              id: newId,
              supabase_id: newId,
              order_date: autoDate,
              created_at: data[0].created_at || nowIso,
              updated_at: nowIso,
              isNew: false,
              sync_status: "synced",
            };
            void this.cacheSingleOrderToSqlite(insertedItem, order.id);
            return { success: true, data: insertedItem };
          }
        }
      } catch (err: any) {
        console.warn("[OrderSupabaseService] Errore salvataggio Supabase diretto, accodamento offline:", err);
      }
    }

    // Modalità Offline: Salva localmente e accoda per l'invio quando torna online
    const offlineItem: OrderItem = {
      ...order,
      id: localId,
      order_date: autoDate,
      updated_at: nowIso,
      sync_status: "pending",
    };

    this.enqueueOffline({
      id: "q_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      targetId: localId,
      action: inserting ? "insert" : "update",
      remoteId,
      payload: remotePayload,
      timestamp: nowIso,
    });

    void this.cacheSingleOrderToSqlite(offlineItem);
    return { success: true, data: offlineItem };
  }

  /**
   * Sposta ordini nel cestino
   */
  async moveToTrash(items: Array<OrderItem | string>): Promise<boolean> {
    const ids = items.map((it) => (typeof it === "string" ? it : String(it.supabase_id || it.id)));
    const cleanIds = ids.map((id) => this.cleanId(id)).filter(Boolean) as string[];
    const nowIso = new Date().toISOString();

    const supabase = await this.getClient();
    if (supabase && cleanIds.length > 0 && navigator.onLine) {
      try {
        for (const id of cleanIds) {
          this.recentlyPushedRemoteIds.add(id);
          setTimeout(() => this.recentlyPushedRemoteIds.delete(id), 30000);
        }
        const { error } = await supabase
          .from("ordini")
          .update({ eliminato: true, ultima_modifica: nowIso })
          .in("id", cleanIds);
        if (!error) {
          void this.updateSqliteFlag(cleanIds, "is_deleted", 1);
          return true;
        }
      } catch (err) {
        console.warn("[OrderSupabaseService] Errore moveToTrash Supabase:", err);
      }
    }

    // Offline Queue
    for (const id of ids) {
      this.enqueueOffline({
        id: "q_trash_" + Date.now() + "_" + id,
        targetId: id,
        action: "soft_delete",
        timestamp: nowIso,
      });
    }
    void this.updateSqliteFlag(ids, "is_deleted", 1);
    return true;
  }

  /**
   * Ripristina ordini dal cestino
   */
  async restoreFromTrash(items: Array<OrderItem | string>): Promise<boolean> {
    const ids = items.map((it) => (typeof it === "string" ? it : String(it.supabase_id || it.id)));
    const cleanIds = ids.map((id) => this.cleanId(id)).filter(Boolean) as string[];
    const nowIso = new Date().toISOString();

    const supabase = await this.getClient();
    if (supabase && cleanIds.length > 0 && navigator.onLine) {
      try {
        for (const id of cleanIds) {
          this.recentlyPushedRemoteIds.add(id);
          setTimeout(() => this.recentlyPushedRemoteIds.delete(id), 30000);
        }
        const { error } = await supabase
          .from("ordini")
          .update({ eliminato: false, ultima_modifica: nowIso })
          .in("id", cleanIds);
        if (!error) {
          void this.updateSqliteFlag(cleanIds, "is_deleted", 0);
          return true;
        }
      } catch (err) {
        console.warn("[OrderSupabaseService] Errore restoreFromTrash Supabase:", err);
      }
    }

    for (const id of ids) {
      this.enqueueOffline({
        id: "q_rtrash_" + Date.now() + "_" + id,
        targetId: id,
        action: "restore_trash",
        timestamp: nowIso,
      });
    }
    void this.updateSqliteFlag(ids, "is_deleted", 0);
    return true;
  }

  /**
   * Ripristina ordini dall'archivio
   */
  async restoreFromArchive(items: Array<OrderItem | string>): Promise<boolean> {
    const ids = items.map((it) => (typeof it === "string" ? it : String(it.supabase_id || it.id)));
    const cleanIds = ids.map((id) => this.cleanId(id)).filter(Boolean) as string[];
    const nowIso = new Date().toISOString();

    const supabase = await this.getClient();
    if (supabase && cleanIds.length > 0 && navigator.onLine) {
      try {
        for (const id of cleanIds) {
          this.recentlyPushedRemoteIds.add(id);
          setTimeout(() => this.recentlyPushedRemoteIds.delete(id), 30000);
        }
        const { error } = await supabase
          .from("ordini")
          .update({ archiviato: false, ultima_modifica: nowIso })
          .in("id", cleanIds);
        if (!error) {
          void this.updateSqliteFlag(cleanIds, "is_archived", 0);
          return true;
        }
      } catch (err) {
        console.warn("[OrderSupabaseService] Errore restoreFromArchive Supabase:", err);
      }
    }

    for (const id of ids) {
      this.enqueueOffline({
        id: "q_rarch_" + Date.now() + "_" + id,
        targetId: id,
        action: "restore_archive",
        timestamp: nowIso,
      });
    }
    void this.updateSqliteFlag(ids, "is_archived", 0);
    return true;
  }

  /**
   * Eliminazione definitiva (Cestino)
   */
  async permanentDelete(items: Array<OrderItem | string>): Promise<boolean> {
    const ids = items.map((it) => (typeof it === "string" ? it : String(it.supabase_id || it.id)));
    const cleanIds = ids.map((id) => this.cleanId(id)).filter(Boolean) as string[];
    const nowIso = new Date().toISOString();

    const supabase = await this.getClient();
    if (supabase && cleanIds.length > 0 && navigator.onLine) {
      try {
        for (const id of cleanIds) {
          this.recentlyPushedRemoteIds.add(id);
          setTimeout(() => this.recentlyPushedRemoteIds.delete(id), 30000);
        }
        const { error } = await supabase.from("ordini").delete().in("id", cleanIds);
        if (!error) {
          void this.deleteFromSqlite(cleanIds);
          return true;
        }
      } catch (err) {
        console.warn("[OrderSupabaseService] Errore permanentDelete Supabase:", err);
      }
    }

    for (const id of ids) {
      this.enqueueOffline({
        id: "q_pdel_" + Date.now() + "_" + id,
        targetId: id,
        action: "permanent_delete",
        timestamp: nowIso,
      });
    }
    void this.deleteFromSqlite(ids);
    return true;
  }

  /**
   * Archivia gli ordini indicati
   */
  async archiveOrders(ids: string[]): Promise<boolean> {
    const cleanIds = ids.map((id) => this.cleanId(id)).filter(Boolean) as string[];
    const nowIso = new Date().toISOString();

    const supabase = await this.getClient();
    if (supabase && cleanIds.length > 0 && navigator.onLine) {
      try {
        for (const id of cleanIds) {
          this.recentlyPushedRemoteIds.add(id);
          setTimeout(() => this.recentlyPushedRemoteIds.delete(id), 30000);
        }
        const { error } = await supabase
          .from("ordini")
          .update({ archiviato: true, ultima_modifica: nowIso })
          .in("id", cleanIds);
        if (!error) {
          void this.updateSqliteFlag(cleanIds, "is_archived", 1);
          return true;
        }
      } catch (err) {
        console.warn("[OrderSupabaseService] Errore archiveOrders Supabase:", err);
      }
    }

    for (const id of ids) {
      this.enqueueOffline({
        id: "q_arch_" + Date.now() + "_" + id,
        targetId: id,
        action: "archive",
        timestamp: nowIso,
      });
    }
    void this.updateSqliteFlag(ids, "is_archived", 1);
    return true;
  }

  /**
   * Aggiorna evidenziazione cella
   */
  async updateCellHighlight(id: string, newHighlights: Record<string, boolean>): Promise<boolean> {
    const cleanId = this.cleanId(id);
    const nowIso = new Date().toISOString();

    const supabase = await this.getClient();
    if (supabase && cleanId && navigator.onLine) {
      try {
        this.recentlyPushedRemoteIds.add(cleanId);
        setTimeout(() => this.recentlyPushedRemoteIds.delete(cleanId), 30000);

        const { error } = await supabase
          .from("ordini")
          .update({ evidenze: newHighlights, ultima_modifica: nowIso })
          .eq("id", cleanId);
        if (!error) return true;
      } catch (err) {
        console.warn("[OrderSupabaseService] Errore highlight Supabase:", err);
      }
    }

    this.enqueueOffline({
      id: "q_hl_" + Date.now() + "_" + id,
      targetId: id,
      action: "highlight",
      payload: newHighlights,
      timestamp: nowIso,
    });
    return true;
  }

  /**
   * Riordina articoli creando nuovi ordini con data odierna (0ms su Supabase)
   */
  async reorderArticles(
    items: Array<{
      supplier_name: string;
      article_code: string;
      description: string;
      quantity?: string;
      price?: string;
      notes?: string;
    }>,
    currentUser: string = "Operatore"
  ): Promise<OrderItem[]> {
    const today = TODAY();
    const nowIso = new Date().toISOString();
    const created: OrderItem[] = [];
    for (const it of items) {
      const order: OrderItem = {
        id: "ord_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        order_date: today,
        supplier_name: it.supplier_name,
        article_code: it.article_code,
        description: (it.description || "").toUpperCase(),
        quantity: it.quantity || "1",
        price: it.price || "",
        notes: it.notes || "",
        user_name: currentUser,
        is_archived: false,
        is_deleted: false,
        isNew: true,
        created_at: nowIso,
        updated_at: nowIso,
      };
      const res = await this.saveOrder(order);
      if (res.data) {
        created.push(res.data);
      } else {
        created.push(order);
      }
    }
    return created;
  }

  /**
   * Imposta data ordine su Supabase e SQLite per tutti gli articoli di un fornitore (invio email)
   */
  async markSupplierOrdersAsSent(supplierName: string): Promise<boolean> {
    const today = TODAY();
    const nowIso = new Date().toISOString();
    const cleanSupplier = supplierName.trim();

    const supabase = await this.getClient();
    if (supabase && navigator.onLine) {
      try {
        await supabase
          .from("ordini")
          .update({ ordinato: today, ultima_modifica: nowIso })
          .ilike("fornitore", cleanSupplier)
          .eq("archiviato", false)
          .eq("eliminato", false);
      } catch (err) {
        console.warn("[OrderSupabaseService] Errore markSupplierOrdersAsSent Supabase:", err);
      }
    }

    try {
      const db = await getDatabase();
      await db.execute(
        `UPDATE orders SET ordered_date = $1, updated_at = $2 WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($3)) AND is_archived = 0 AND is_deleted = 0`,
        [today, nowIso, cleanSupplier]
      );
    } catch {}

    return true;
  }

  /**
   * Salva o modifica un fornitore (Cloud Supabase prioritario + SQLite cache)
   */
  async upsertSupplier(
    supplier: Partial<Supplier> & { id: string },
    _currentUser: string = "Operatore"
  ): Promise<Supplier> {
    const nowIso = new Date().toISOString();
    const cleanId = this.cleanId(supplier.supabase_id) || this.cleanId(supplier.id);
    const supabase = await this.getClient();

    const toSave: Supplier = {
      id: supplier.id,
      supabase_id: supplier.supabase_id,
      name: (supplier.name || "").trim(),
      representative: supplier.representative || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      vat_number: supplier.vat_number || "",
      notes: supplier.notes || "",
      created_at: supplier.created_at || nowIso,
      updated_at: nowIso,
      sync_status: "synced",
    };

    const payload = {
      nome: toSave.name,
      rappresentante: toSave.representative,
      email: toSave.email,
      telefono: toSave.phone,
      indirizzo: toSave.address,
      piva: toSave.vat_number,
      note: toSave.notes,
    };

    if (supabase && navigator.onLine) {
      try {
        if (cleanId) {
          await supabase.from("fornitori").update(payload).eq("id", cleanId);
        } else {
          const { data } = await supabase.from("fornitori").insert([payload]).select();
          if (data && data[0]) {
            toSave.id = String(data[0].id);
            toSave.supabase_id = data[0].id;
          }
        }
      } catch (err) {
        console.warn("[OrderSupabaseService] Errore upsertSupplier Supabase:", err);
        this.enqueueOffline({
          id: "q_sups_" + Date.now() + "_" + toSave.id,
          targetId: toSave.id,
          action: "upsert_supplier",
          payload,
          timestamp: nowIso,
        });
      }
    } else {
      this.enqueueOffline({
        id: "q_sups_" + Date.now() + "_" + toSave.id,
        targetId: toSave.id,
        action: "upsert_supplier",
        payload,
        timestamp: nowIso,
      });
    }

    void this.cacheSingleSupplierToSqlite(toSave);
    return toSave;
  }

  /**
   * Elimina un fornitore da Supabase e SQLite
   */
  async deleteSupplier(id: string): Promise<boolean> {
    const cleanId = this.cleanId(id);
    const nowIso = new Date().toISOString();
    const supabase = await this.getClient();
    if (supabase && cleanId && navigator.onLine) {
      try {
        await supabase.from("fornitori").delete().eq("id", cleanId);
      } catch (err) {
        console.warn("[OrderSupabaseService] Errore deleteSupplier Supabase:", err);
        this.enqueueOffline({
          id: "q_sdel_" + Date.now() + "_" + id,
          targetId: id,
          action: "delete_supplier",
          timestamp: nowIso,
        });
      }
    } else {
      this.enqueueOffline({
        id: "q_sdel_" + Date.now() + "_" + id,
        targetId: id,
        action: "delete_supplier",
        timestamp: nowIso,
      });
    }
    void this.deleteSupplierFromSqlite(id);
    return true;
  }

  // ==========================================
  // CODA OFFLINE & RECUPERO AUTOMATICO
  // ==========================================

  public getOfflineQueue(): OfflineQueueItem[] {
    try {
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveOfflineQueue(queue: OfflineQueueItem[]): void {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  }

  private enqueueOffline(item: OfflineQueueItem): void {
    const queue = this.getOfflineQueue();
    const last = [...queue].reverse().find((entry) => entry.targetId === item.targetId);
    if (item.action === "insert" && last?.action === "insert" && last.id !== this.processingItemId) {
      last.payload = item.payload;
      last.timestamp = item.timestamp;
      last.remoteId ??= item.remoteId;
    } else {
      queue.push(item);
    }
    this.saveOfflineQueue(queue);
  }

  private acknowledgeOfflineItem(item: OfflineQueueItem, remoteId?: string): void {
    const queue = this.getOfflineQueue().filter((entry) => entry.id !== item.id);
    if (remoteId) {
      this.resolvedDrafts.set(item.targetId, remoteId);
      for (const entry of queue) {
        if (entry.targetId !== item.targetId || entry.action.includes("supplier")) continue;
        entry.targetId = remoteId;
        if (entry.action === "insert") entry.action = "update";
      }
    }
    this.saveOfflineQueue(queue);
  }

  async processOfflineQueue(): Promise<number> {
    if (this.isProcessingQueue || !navigator.onLine) return 0;
    const initialQueue = this.getOfflineQueue();
    if (initialQueue.length === 0) return 0;

    this.isProcessingQueue = true;
    let processedCount = 0;
    const failedTargets = new Set<string>();
    try {
      const supabase = await this.getClient();
      if (!supabase) return 0;
      for (const initial of initialQueue) {
        const item = this.getOfflineQueue().find((entry) => entry.id === initial.id);
        if (!item || failedTargets.has(item.targetId)) continue;
        this.processingItemId = item.id;
        try {
          const cleanId = this.cleanId(item.targetId);
          if (item.action === "insert" && item.payload) {
            if (!item.remoteId) {
              item.remoteId = await deterministicUuid(`last:order:${item.targetId}`);
              this.saveOfflineQueue(this.getOfflineQueue().map((entry) => entry.id === item.id ? item : entry));
            }
            const { data, error } = await supabase.from("ordini")
              .upsert([{ ...item.payload, id: item.remoteId }], { onConflict: "id" }).select();
            if (error) throw error;
            const remote = data?.[0];
            if (!remote?.id) throw new Error("Ordine non confermato da Supabase");
            const remoteId = String(remote.id);
            this.acknowledgeOfflineItem(item, remoteId);
            processedCount++;
            const now = new Date().toISOString();
            await this.cacheSingleOrderToSqlite({
              id: remoteId, supabase_id: remoteId, order_date: remote.data || "",
              supplier_name: remote.fornitore || "", article_code: remote.articolo || "",
              description: (remote.descrizione || "").toUpperCase(),
              quantity: String(remote.quantita ?? ""), price: String(remote.prezzo ?? ""),
              ordered_date: remote.ordinato || null, notes: remote.note || "",
              user_name: remote.utente || "", is_archived: Boolean(remote.archiviato),
              is_deleted: Boolean(remote.eliminato), highlights: parseHighlights(remote.evidenze),
              created_at: remote.created_at || now, updated_at: remote.ultima_modifica || now,
              sync_status: "synced",
            }, item.targetId);
            continue;
          }

          const now = new Date().toISOString();
          const flags = {
            soft_delete: { eliminato: true }, restore_trash: { eliminato: false },
            restore_archive: { archiviato: false }, archive: { archiviato: true },
            highlight: { evidenze: item.payload },
          };
          let result: { error: unknown };
          if (item.action === "upsert_supplier" && item.payload) {
            const suppliers = supabase.from("fornitori");
            result = cleanId ? await suppliers.update(item.payload).eq("id", cleanId) : await suppliers.insert([item.payload]);
          } else if (cleanId && (item.action === "permanent_delete" || item.action === "delete_supplier")) {
            result = await supabase.from(item.action === "delete_supplier" ? "fornitori" : "ordini").delete().eq("id", cleanId);
          } else if (cleanId && item.action === "update" && item.payload) {
            result = await supabase.from("ordini").update(item.payload).eq("id", cleanId);
          } else if (cleanId && item.action in flags) {
            result = await supabase.from("ordini")
              .update({ ...flags[item.action as keyof typeof flags], ultima_modifica: now }).eq("id", cleanId);
          } else {
            continue;
          }
          if (result.error) throw result.error;
          this.acknowledgeOfflineItem(item);
          processedCount++;
        } catch (error) {
          failedTargets.add(item.targetId);
          console.warn(`[OrderSupabaseService] Errore elaborazione coda per ${item.id}:`, error);
        }
      }
    } finally {
      this.processingItemId = undefined;
      this.isProcessingQueue = false;
    }
    if (processedCount > 0) {
      window.dispatchEvent(new CustomEvent("order_offline_queue_synced", { detail: { processedCount } }));
    }
    return processedCount;
  }

  // ==========================================
  // CACHE SQLITE LOCALE (PER MODALITÀ OFFLINE)
  // ==========================================

  private async cacheOrdersToSqlite(orders: OrderItem[], viewMode?: OrderViewMode, strict = false): Promise<void> {
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      const fetchedSupabaseIds = new Set<string>();

      for (const item of orders) {
        const localId = "ord_" + item.id;
        fetchedSupabaseIds.add(String(item.id));
        // Rimuove eventuali vecchie righe draft/duplicate collegate allo stesso supabase_id
        await db.execute(
          `DELETE FROM orders WHERE supabase_id = $1 AND id <> $2`,
          [String(item.id), localId]
        );
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
            item.order_date || "",
            item.supplier_name || "",
            item.article_code || "",
            (item.description || "").toUpperCase(),
            String(item.quantity || ""),
            String(item.price || ""),
            item.ordered_date || null,
            item.notes || "",
            item.user_name || "",
            item.is_archived ? 1 : 0,
            item.is_deleted ? 1 : 0,
            JSON.stringify(parseHighlights(item.highlights)),
            item.created_at || now,
            item.updated_at || now,
          ]
        );
      }

      // Rimuove dalla cache di questa vista eventuali ordini synced eliminati o spostati da altri PC
      if (viewMode) {
        const queuedIds = new Set(this.getOfflineQueue().map((q) => this.cleanId(q.targetId) || q.targetId));
        const viewWhere =
          viewMode === "archiviati"
            ? "is_archived = 1 AND is_deleted = 0"
            : viewMode === "cestino"
            ? "is_deleted = 1"
            : "is_archived = 0 AND is_deleted = 0";
        const localInView = await db.select<{ id: string; supabase_id: string | null }[]>(
          `SELECT id, supabase_id FROM orders WHERE ${viewWhere} AND sync_status = 'synced'`
        );
        for (const row of localInView) {
          const supId = row.supabase_id ? String(row.supabase_id) : "";
          if (supId && !fetchedSupabaseIds.has(supId) && !queuedIds.has(supId) && !queuedIds.has(row.id)) {
            await db.execute(`DELETE FROM orders WHERE id = $1`, [row.id]);
          }
        }
      }
    } catch (error) {
      if (strict) throw error;
    }
  }

  /**
   * Riallinea completamente la cache SQLite `orders` con `public.ordini` su Supabase:
   * deduplica eventuali righe draft rimaste dopo l'insert, inserisce ordini mancanti (es. cestino/archivio)
   * e rimuove dalla cache ordini eliminati definitivamente su Supabase.
   */
  public async reconcileFullOrdersCache(): Promise<void> {
    const supabase = await this.getClient();
    if (!supabase || !navigator.onLine) return;

    try {
      const allRemote: any[] = [];
      const PAGE = 1000;
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from("ordini")
          .select("*")
          .order("created_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error || !Array.isArray(data)) return;
        allRemote.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      const mapped: OrderItem[] = allRemote.map((r: any) => ({
        id: r.id,
        supabase_id: r.id,
        order_date: r.data || "",
        supplier_name: r.fornitore || "",
        article_code: r.articolo || "",
        description: (r.descrizione || "").toUpperCase(),
        quantity: String(r.quantita || ""),
        price: String(r.prezzo || ""),
        ordered_date: r.ordinato || null,
        notes: r.note || "",
        user_name: r.utente || "",
        is_archived: Boolean(r.archiviato),
        is_deleted: Boolean(r.eliminato),
        highlights: parseHighlights(r.evidenze),
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.ultima_modifica || new Date().toISOString(),
        sync_status: "synced",
      }));

      await this.cacheOrdersToSqlite(mapped);

      const db = await getDatabase();
      const queuedIds = new Set(this.getOfflineQueue().map((q) => this.cleanId(q.targetId) || q.targetId));
      const remoteIds = new Set(mapped.map((m) => String(m.id)));
      const localAll = await db.select<{ id: string; supabase_id: string | null; sync_status: string }[]>(
        `SELECT id, supabase_id, sync_status FROM orders`
      );
      for (const row of localAll) {
        const supId = row.supabase_id ? String(row.supabase_id) : "";
        if (row.sync_status === "synced" && (!supId || !remoteIds.has(supId)) && !queuedIds.has(row.id)) {
          await db.execute(`DELETE FROM orders WHERE id = $1`, [row.id]);
        }
      }
    } catch (err) {
      console.warn("[OrderSupabaseService] Errore riconciliazione cache ordini:", err);
    }
  }

  private async cacheSingleOrderToSqlite(item: OrderItem, previousLocalId?: string): Promise<void> {
    try {
      const db = await getDatabase();
      const cleanSup = item.supabase_id ? String(item.supabase_id) : null;
      const localId = cleanSup ? `ord_${cleanSup}` : (item.id.startsWith("ord_") ? item.id : "ord_" + item.id);
      const now = new Date().toISOString();

      if (cleanSup) {
        await db.execute(
          `DELETE FROM orders WHERE (supabase_id = $1 OR id = $2) AND id <> $3`,
          [cleanSup, previousLocalId || "", localId]
        );
      } else if (previousLocalId && previousLocalId !== localId) {
        await db.execute(`DELETE FROM orders WHERE id = $1`, [previousLocalId]);
      }

      await db.execute(
        `INSERT INTO orders (
          id, supabase_id, order_date, supplier_name, article_code, description,
          quantity, price, ordered_date, notes, user_name, is_archived, is_deleted,
          highlights, created_at, updated_at, sync_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
          sync_status = excluded.sync_status`,
        [
          localId,
          item.supabase_id ? String(item.supabase_id) : null,
          item.order_date || "",
          item.supplier_name || "",
          item.article_code || "",
          (item.description || "").toUpperCase(),
          String(item.quantity || ""),
          String(item.price || ""),
          item.ordered_date || null,
          item.notes || "",
          item.user_name || "",
          item.is_archived ? 1 : 0,
          item.is_deleted ? 1 : 0,
          JSON.stringify(parseHighlights(item.highlights)),
          item.created_at || now,
          item.updated_at || now,
          item.sync_status || "synced",
        ]
      );
    } catch {}
  }

  private async cacheSuppliersToSqlite(suppliers: Supplier[], strict = false): Promise<void> {
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      for (const item of suppliers) {
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
            "sup_" + item.id,
            item.id,
            (item.name || "").trim(),
            item.representative || "",
            item.email || "",
            item.phone || "",
            item.address || "",
            item.vat_number || "",
            item.notes || "",
            item.created_at || now,
            now,
          ]
        );
      }
    } catch (error) {
      if (strict) throw error;
    }
  }

  private async cacheSingleSupplierToSqlite(item: Supplier): Promise<void> {
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
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
          item.id.startsWith("sup_") ? item.id : "sup_" + item.id,
          item.supabase_id || item.id,
          (item.name || "").trim(),
          item.representative || "",
          item.email || "",
          item.phone || "",
          item.address || "",
          item.vat_number || "",
          item.notes || "",
          item.created_at || now,
          item.updated_at || now,
        ]
      );
    } catch {}
  }

  private async deleteSupplierFromSqlite(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      const clean = this.cleanId(id);
      const searchIds = [id, "sup_" + id];
      if (clean) searchIds.push(clean, "sup_" + clean);
      const placeholders = searchIds.map((_, i) => `$${i + 1}`).join(",");
      await db.execute(
        `DELETE FROM suppliers WHERE id IN (${placeholders}) OR supabase_id IN (${placeholders})`,
        searchIds
      );
    } catch {}
  }

  private async loadOrdersFromSqlite(viewMode: OrderViewMode): Promise<OrderItem[]> {
    try {
      const db = await getDatabase();
      let sql = "";
      if (viewMode === "archiviati") {
        sql = "SELECT * FROM orders WHERE is_archived = 1 AND is_deleted = 0 ORDER BY created_at DESC";
      } else if (viewMode === "cestino") {
        sql = "SELECT * FROM orders WHERE is_deleted = 1 ORDER BY created_at DESC";
      } else {
        sql = "SELECT * FROM orders WHERE is_archived = 0 AND is_deleted = 0 ORDER BY created_at ASC";
      }
      const rows = await db.select<any[]>(sql);
      return rows.map((r) => ({
        id: r.id,
        supabase_id: r.supabase_id,
        order_date: r.order_date || "",
        supplier_name: r.supplier_name || "",
        article_code: r.article_code || "",
        description: (r.description || "").toUpperCase(),
        quantity: String(r.quantity || ""),
        price: String(r.price || ""),
        ordered_date: r.ordered_date || null,
        notes: r.notes || "",
        user_name: r.user_name || "",
        is_archived: Boolean(r.is_archived),
        is_deleted: Boolean(r.is_deleted),
        highlights: parseHighlights(r.highlights),
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || new Date().toISOString(),
        sync_status: r.sync_status || "synced",
      }));
    } catch {
      return [];
    }
  }

  private async loadSuppliersFromSqlite(): Promise<Supplier[]> {
    try {
      const db = await getDatabase();
      const rows = await db.select<any[]>("SELECT * FROM suppliers ORDER BY name ASC");
      const map = new Map<string, Supplier>();

      for (const r of rows) {
        if (r.name && r.name.trim()) {
          map.set(r.name.trim().toUpperCase(), {
            id: r.id,
            supabase_id: r.supabase_id,
            name: r.name.trim(),
            representative: r.representative || "",
            email: r.email || "",
            phone: r.phone || "",
            address: r.address || "",
            vat_number: r.vat_number || "",
            notes: r.notes || "",
            created_at: r.created_at || new Date().toISOString(),
            updated_at: r.updated_at || new Date().toISOString(),
            sync_status: r.sync_status || "synced",
          });
        }
      }

      // Integrazione/fallback: arricchisce l'elenco con fornitori usati in ordini, listino articoli o fatture
      try {
        const fallbackQueries = [
          "SELECT DISTINCT supplier_name as name FROM orders WHERE supplier_name IS NOT NULL AND TRIM(supplier_name) != ''",
          "SELECT DISTINCT fornitore as name FROM listino_articoli WHERE fornitore IS NOT NULL AND TRIM(fornitore) != ''",
          "SELECT DISTINCT supplier_name as name FROM supplier_invoices WHERE supplier_name IS NOT NULL AND TRIM(supplier_name) != ''",
        ];
        for (const q of fallbackQueries) {
          try {
            const extra = await db.select<{ name: string }[]>(q);
            for (const item of extra) {
              const cleanName = item.name?.trim();
              if (cleanName && !map.has(cleanName.toUpperCase())) {
                map.set(cleanName.toUpperCase(), {
                  id: `sup_${cleanName.replace(/\s+/g, "_")}`,
                  name: cleanName,
                  representative: "",
                  email: "",
                  phone: "",
                  address: "",
                  vat_number: "",
                  notes: "",
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  sync_status: "synced",
                });
              }
            }
          } catch {
            // Se una tabella non è ancora creata, prosegue con le altre
          }
        }
      } catch {
        // Ignora errori query extra
      }

      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  private async updateSqliteFlag(ids: string[], flagCol: "is_deleted" | "is_archived", val: 0 | 1): Promise<void> {
    try {
      const db = await getDatabase();
      for (const id of ids) {
        const clean = this.cleanId(id);
        const searchIds = [id, "ord_" + id];
        if (clean) searchIds.push(clean, "ord_" + clean);
        const placeholders = searchIds.map((_, i) => `$${i + 2}`).join(",");
        await db.execute(
          `UPDATE orders SET ${flagCol} = $1, updated_at = datetime('now') WHERE id IN (${placeholders}) OR supabase_id IN (${placeholders})`,
          [val, ...searchIds]
        );
      }
    } catch {}
  }

  private async deleteFromSqlite(ids: string[]): Promise<void> {
    try {
      const db = await getDatabase();
      for (const id of ids) {
        const clean = this.cleanId(id);
        const searchIds = [id, "ord_" + id];
        if (clean) searchIds.push(clean, "ord_" + clean);
        const placeholders = searchIds.map((_, i) => `$${i + 1}`).join(",");
        await db.execute(
          `DELETE FROM orders WHERE id IN (${placeholders}) OR supabase_id IN (${placeholders})`,
          searchIds
        );
      }
    } catch {}
  }
}

export const orderSupabaseService = new OrderSupabaseService();

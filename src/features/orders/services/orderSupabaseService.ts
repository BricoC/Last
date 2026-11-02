import { invoke } from "@tauri-apps/api/core";
import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { getDatabase } from "@/shared/data-layer/database";
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
  payload?: any;
  timestamp: string;
}

const QUEUE_STORAGE_KEY = "last_order_offline_queue";

export class OrderSupabaseService {
  private client: SupabaseClient | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  public recentlyPushedRemoteIds = new Set<string>();
  private isProcessingQueue = false;

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

  async getClient(): Promise<SupabaseClient | null> {
    if (this.client) return this.client;
    const creds = await this.getCredentials();
    if (!creds) return null;
    this.client = createClient(creds.projectUrl, creds.anonKey);
    return this.client;
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

    // Ascolta il ritorno della connessione internet per svuotare la coda offline
    window.addEventListener("online", () => {
      void this.processOfflineQueue();
    });

    // Controllo periodico coda ogni 15 secondi
    setInterval(() => {
      if (navigator.onLine) {
        void this.processOfflineQueue();
      }
    }, 15000);
  }

  stopRealtime(): void {
    if (this.realtimeChannel && this.client) {
      void this.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  /**
   * Pulisce e risolve un ID, rimuovendo prefissi "ord_" e identificando UUID
   */
  public cleanId(id: string | number | null | undefined): string | null {
    if (!id) return null;
    let s = String(id);
    if (s.startsWith("ord_") && !s.startsWith("ord_draft_")) {
      s = s.slice(4);
    }
    if (s.startsWith("draft_") || s.startsWith("new_")) return null;
    return s.length > 10 ? s : null;
  }

  /**
   * Carica ordini direttamente da Supabase Cloud.
   * Se offline o errore di rete, legge dalla cache SQLite locale.
   */
  async fetchOrders(viewMode: OrderViewMode = "attivi"): Promise<OrderItem[]> {
    const supabase = await this.getClient();
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

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
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
          void this.cacheOrdersToSqlite(mapped);

          return mapped;
        }
      } catch (err) {
        console.warn("[OrderSupabaseService] Errore fetch Supabase, fallback SQLite:", err);
      }
    }

    // Fallback SQLite locale
    return this.loadOrdersFromSqlite(viewMode);
  }

  /**
   * Carica fornitori direttamente da Supabase Cloud
   */
  async fetchSuppliers(): Promise<Supplier[]> {
    const supabase = await this.getClient();
    if (supabase && navigator.onLine) {
      try {
        const { data, error } = await supabase.from("fornitori").select("*").order("nome");
        if (!error && Array.isArray(data)) {
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

          void this.cacheSuppliersToSqlite(mapped);
          return mapped;
        }
      } catch (err) {
        console.warn("[OrderSupabaseService] Errore fetch fornitori Supabase, fallback SQLite:", err);
      }
    }

    return this.loadSuppliersFromSqlite();
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
    const cleanId = this.cleanId(order.supabase_id) || this.cleanId(order.id);

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

    const supabase = await this.getClient();
    if (supabase && navigator.onLine) {
      try {
        if (!isDraft && cleanId) {
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
          const { data, error } = await supabase.from("ordini").insert([remotePayload]).select();
          if (error) throw error;
          if (data && data[0]) {
            const newId = String(data[0].id);
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
            void this.cacheSingleOrderToSqlite(insertedItem);
            return { success: true, data: insertedItem };
          }
        }
      } catch (err: any) {
        console.warn("[OrderSupabaseService] Errore salvataggio Supabase diretto, accodamento offline:", err);
      }
    }

    // Modalità Offline: Salva localmente e accoda per l'invio quando torna online
    const localId = cleanId || order.id || "ord_offline_" + Date.now();
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
      action: !isDraft && cleanId ? "update" : "insert",
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
    const ids = items.map((it) => (typeof it === "string" ? it : it.id));
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
    const ids = items.map((it) => (typeof it === "string" ? it : it.id));
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
    const ids = items.map((it) => (typeof it === "string" ? it : it.id));
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
    const ids = items.map((it) => (typeof it === "string" ? it : it.id));
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
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch {}
  }

  private enqueueOffline(item: OfflineQueueItem): void {
    const queue = this.getOfflineQueue();
    queue.push(item);
    this.saveOfflineQueue(queue);
  }

  /**
   * Svuota la coda offline inviando le modifiche accumulate a Supabase non appena torna la connessione
   */
  async processOfflineQueue(): Promise<number> {
    if (this.isProcessingQueue || !navigator.onLine) return 0;
    const queue = this.getOfflineQueue();
    if (queue.length === 0) return 0;

    const supabase = await this.getClient();
    if (!supabase) return 0;

    this.isProcessingQueue = true;
    let processedCount = 0;
    const remainingQueue: OfflineQueueItem[] = [];

    for (const item of queue) {
      try {
        const cleanId = this.cleanId(item.targetId);
        const nowIso = new Date().toISOString();

        if (item.action === "insert" && item.payload) {
          const { data, error } = await supabase.from("ordini").insert([item.payload]).select();
          if (error) throw error;
          if (data && data[0]) {
            processedCount++;
            continue;
          }
        } else if (item.action === "update" && item.payload && cleanId) {
          const { error } = await supabase.from("ordini").update(item.payload).eq("id", cleanId);
          if (error) throw error;
          processedCount++;
          continue;
        } else if (item.action === "soft_delete" && cleanId) {
          const { error } = await supabase.from("ordini").update({ eliminato: true, ultima_modifica: nowIso }).eq("id", cleanId);
          if (error) throw error;
          processedCount++;
          continue;
        } else if (item.action === "restore_trash" && cleanId) {
          const { error } = await supabase.from("ordini").update({ eliminato: false, ultima_modifica: nowIso }).eq("id", cleanId);
          if (error) throw error;
          processedCount++;
          continue;
        } else if (item.action === "restore_archive" && cleanId) {
          const { error } = await supabase.from("ordini").update({ archiviato: false, ultima_modifica: nowIso }).eq("id", cleanId);
          if (error) throw error;
          processedCount++;
          continue;
        } else if (item.action === "archive" && cleanId) {
          const { error } = await supabase.from("ordini").update({ archiviato: true, ultima_modifica: nowIso }).eq("id", cleanId);
          if (error) throw error;
          processedCount++;
          continue;
        } else if (item.action === "permanent_delete" && cleanId) {
          const { error } = await supabase.from("ordini").delete().eq("id", cleanId);
          if (error) throw error;
          processedCount++;
          continue;
        } else if (item.action === "highlight" && cleanId && item.payload) {
          const { error } = await supabase.from("ordini").update({ evidenze: item.payload, ultima_modifica: nowIso }).eq("id", cleanId);
          if (error) throw error;
          processedCount++;
          continue;
        } else if (item.action === "upsert_supplier" && item.payload) {
          if (cleanId) {
            const { error } = await supabase.from("fornitori").update(item.payload).eq("id", cleanId);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("fornitori").insert([item.payload]);
            if (error) throw error;
          }
          processedCount++;
          continue;
        } else if (item.action === "delete_supplier" && cleanId) {
          const { error } = await supabase.from("fornitori").delete().eq("id", cleanId);
          if (error) throw error;
          processedCount++;
          continue;
        }
      } catch (err) {
        console.warn(`[OrderSupabaseService] Errore elaborazione coda per ${item.id}:`, err);
        remainingQueue.push(item);
      }
    }

    this.saveOfflineQueue(remainingQueue);
    this.isProcessingQueue = false;

    if (processedCount > 0) {
      window.dispatchEvent(new CustomEvent("order_offline_queue_synced", { detail: { processedCount } }));
    }

    return processedCount;
  }

  // ==========================================
  // CACHE SQLITE LOCALE (PER MODALITÀ OFFLINE)
  // ==========================================

  private async cacheOrdersToSqlite(orders: OrderItem[]): Promise<void> {
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      for (const item of orders) {
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
    } catch {}
  }

  private async cacheSingleOrderToSqlite(item: OrderItem): Promise<void> {
    try {
      const db = await getDatabase();
      const localId = item.id.startsWith("ord_") ? item.id : "ord_" + item.id;
      const now = new Date().toISOString();
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

  private async cacheSuppliersToSqlite(suppliers: Supplier[]): Promise<void> {
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
    } catch {}
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
      return rows.map((r) => ({
        id: r.id,
        supabase_id: r.supabase_id,
        name: r.name || "",
        representative: r.representative || "",
        email: r.email || "",
        phone: r.phone || "",
        address: r.address || "",
        vat_number: r.vat_number || "",
        notes: r.notes || "",
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || new Date().toISOString(),
        sync_status: r.sync_status || "synced",
      }));
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

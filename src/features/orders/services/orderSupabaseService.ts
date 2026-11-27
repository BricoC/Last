import { ORDER_QUEUE_KEY } from "@/shared/data-layer/orderQueueBackup";
import { createSupabaseRealtimeSubscription } from "@/shared/services/supabaseRealtimeSubscription";
import { applyLocalDatabaseBatch, type SqliteWrite } from "@/shared/data-layer/localDatabaseBatch";
import { orderRepository } from "./orderRepository";
import { getAuthenticatedSupabaseClient } from "@/shared/services/supabaseSession";
import {
  getLastKnownSupabaseProjectUrl,
  normalizeSupabaseProjectUrl,
  resolveActiveSupabaseProjectUrl,
  setLastKnownSupabaseProjectUrl,
} from "@/shared/services/supabaseConfigCache";
import { invoke } from "@tauri-apps/api/core";
import { type SupabaseClient } from "@supabase/supabase-js";
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
    | "mark_sent"
    | "upsert_supplier"
    | "delete_supplier";
  remoteId?: string;
  payload?: any;
  timestamp: string;
  projectUrl?: string;
}



export class OrderSupabaseService {
  public recentlyPushedRemoteIds = new Set<string>();
  private queueFlight: Promise<number> | null = null;
  private processingItemId?: string;
  private mutationGeneration = 0;
  private readonly resolvedSuppliers = new Map<string, string>();
  private readonly resolvedDrafts = new Map<string, string>();

  private async getCredentials(): Promise<SupabaseConfig | null> {
    try {
      const status = await invoke<ConfigStatus>("load_supabase_config");
      if (!status?.config?.projectUrl || !status?.config?.anonKey) {
        return null;
      }
      setLastKnownSupabaseProjectUrl(status.config.projectUrl);
      return status.config;
    } catch {
      return null;
    }
  }

  async getClient(): Promise<SupabaseClient | null> {
    const creds = await this.getCredentials();
    return creds ? getAuthenticatedSupabaseClient(creds.projectUrl, creds.anonKey) : null;
  }

  public readonly subscribeRealtime = createSupabaseRealtimeSubscription(
    () => this.getClient(),
    (supabase, isCurrent) => {
      const channel = supabase
      .channel("last:orders", { config: { private: true } })
      .on(
        "broadcast",
        { event: "ordini" },
        ({ payload }) => {
          if (!isCurrent() || !payload) return;
          const remoteId = String(payload.old?.id ?? payload.new?.id ?? "");
          if (remoteId && this.hasQueuedOrder(remoteId)) return;
          if (payload.eventType === "DELETE" && remoteId) {
            void this.deleteFromSqlite([remoteId], isCurrent);
          }
          window.dispatchEvent(
            new CustomEvent("supabase_update_ordini", { detail: payload })
          );
        }
      )
      .on(
        "broadcast",
        { event: "fornitori" },
        ({ payload }) => {
          if (!isCurrent() || !payload) return;
          window.dispatchEvent(
            new CustomEvent("supabase_update_fornitori", { detail: payload })
          );
        }
      )
      .subscribe();

      void (this.queueFlight ?? this.processOfflineQueue()).then(() => {
        if (isCurrent()) return this.reconcileFullOrdersCache();
      }).catch((error) => console.warn("[OrderSupabaseService] Sync iniziale ordini:", error));

      return channel;
    },
    "[OrderSupabaseService] Realtime ordini",
  );

  /**
   * Pulisce e risolve un ID, rimuovendo prefissi "ord_" e scartando ID sintetici locali
   */
  public cleanId(id: string | number | null | undefined): string | null {
    const value = String(id ?? "").trim().replace(/^ord_/, "");
    return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value) ? value : null;
  }

  private supplierRemoteId(id: string | number | null | undefined): string | null {
    const value = String(id ?? "").trim();
    return /^(?:0|[1-9]\d*)$/.test(value) && BigInt(value) <= 9223372036854775807n ? value : null;
  }

  private orderTarget(id: string): string {
    return this.resolvedDrafts.get(id) ?? this.cleanId(id) ?? id;
  }

  private hasQueuedOrder(id: string) {
    const target = this.orderTarget(id);
    return this.getOfflineQueue().some((entry) =>
      !entry.action.endsWith("supplier") && this.orderTarget(entry.targetId) === target
    );
  }

  private hasQueuedSupplier(id: string) {
    return this.getOfflineQueue().some((entry) => entry.action.endsWith("supplier") &&
      (this.resolvedSuppliers.get(entry.targetId) ?? entry.targetId) === id);
  }

  /**
   * Carica ordini direttamente da Supabase Cloud.
   * Se offline o errore di rete, legge dalla cache SQLite locale.
   */
  async fetchOrders(viewMode: OrderViewMode = "attivi", requireCloud = false): Promise<OrderItem[]> {
    const supabase = await this.getClient();
    if (supabase && navigator.onLine) {
      const generation = this.mutationGeneration;
      try {
        let query = supabase.from("ordini").select("*", { count: "exact" });
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

        const data = await this.readCloudPages(query.order("id"), true);

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
        await this.cacheOrdersToSqlite(mapped, generation, viewMode, requireCloud);
        if (!requireCloud && generation !== this.mutationGeneration) return this.loadOrdersFromSqlite(viewMode);
        if (requireCloud) return mapped;
        const local = await this.loadOrdersFromSqlite(viewMode);
        return local.length || mapped.some((order) => this.hasQueuedOrder(order.id))
          ? local : mapped;
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
    const supabase = await this.getClient();
    if (supabase && navigator.onLine) {
      const generation = this.mutationGeneration;
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

        await this.cacheSuppliersToSqlite(mapped, generation, requireCloud);
        if (!requireCloud && generation !== this.mutationGeneration) return this.loadSuppliersFromSqlite();
        if (requireCloud) return mapped;
        const local = await this.loadSuppliersFromSqlite();
        const pending = local.filter((supplier) => supplier.sync_status === "pending");
        const pendingNames = new Set(pending.map((supplier) => supplier.name.trim().toUpperCase()));
        return [...mapped.filter((supplier) => !this.hasQueuedSupplier(supplier.id) &&
          !pendingNames.has(supplier.name.trim().toUpperCase())), ...pending];
      } catch (err) {
        if (requireCloud) throw err;
        console.warn("[OrderSupabaseService] Errore fetch fornitori Supabase, fallback SQLite:", err);
      }
    }

    if (requireCloud) throw new Error("Cloud fornitori non disponibile");
    return this.loadSuppliersFromSqlite();
  }

  private async readCloudPages<T extends { id: string | number }>(query: {
    range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null; count: number | null }>;
  }, requireCount = false): Promise<T[]> {
    const rows: T[] = [];
    const ids = new Set<string>();
    let total: number | undefined;
    for (;;) {
      const { data, error, count } = await query.range(rows.length, rows.length + 999);
      if (error || !Array.isArray(data)) throw new Error(error?.message || "Risposta Supabase non valida");
      if (requireCount) {
        if (count == null || (total != null && count !== total) || rows.length + data.length > count ||
          (!data.length && rows.length < count)) throw new Error("Download ordini incompleto");
        total = count;
      }
      for (const row of data) {
        if (row.id == null || ids.has(String(row.id))) throw new Error("Pagina ordini o fornitori incoerente");
        ids.add(String(row.id));
      }
      rows.push(...data);
      if (!data.length || rows.length === total) return rows;
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
    const queued = this.hasQueuedOrder(localId);

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

          const { data, error } = await supabase.from("ordini").update(remotePayload).eq("id", cleanId).select("id");
          if (error) throw error;
          if (data?.length !== 1) throw new Error("Modifica ordine non confermata da Supabase");

          this.mutationGeneration++;
          const updatedItem: OrderItem = {
            ...order,
            id: cleanId,
            supabase_id: cleanId,
            order_date: autoDate,
            updated_at: nowIso,
            sync_status: "synced",
          };
          await this.cacheSingleOrderToSqlite(updatedItem);
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

            this.mutationGeneration++;
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
            await this.cacheSingleOrderToSqlite(insertedItem, order.id);
            return { success: true, data: insertedItem };
          }
        }
      } catch (err: any) {
        console.warn("[OrderSupabaseService] Errore salvataggio Supabase diretto, accodamento offline:", err);
      }
    }

    // Modalità Offline: Salva localmente e accoda per l'invio quando torna online
    const activeProjectUrl = await resolveActiveSupabaseProjectUrl();
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
      ...(activeProjectUrl ? { projectUrl: activeProjectUrl } : {}),
    });

    await this.cacheSingleOrderToSqlite(offlineItem);
    return { success: true, data: offlineItem };
  }

  async moveToTrash(items: Array<OrderItem | string>): Promise<boolean> {
    return this.changeOrders(items, "soft_delete");
  }

  async restoreFromTrash(items: Array<OrderItem | string>): Promise<boolean> {
    return this.changeOrders(items, "restore_trash");
  }

  async restoreFromArchive(items: Array<OrderItem | string>): Promise<boolean> {
    return this.changeOrders(items, "restore_archive");
  }

  async permanentDelete(items: Array<OrderItem | string>): Promise<boolean> {
    return this.changeOrders(items, "permanent_delete");
  }

  async archiveOrders(ids: string[]): Promise<boolean> {
    return this.changeOrders(ids, "archive");
  }

  async updateCellHighlight(id: string, newHighlights: Record<string, boolean>): Promise<boolean> {
    return this.changeOrders([id], "highlight", newHighlights);
  }

  private async changeOrders(
    items: Array<OrderItem | string>,
    action: "soft_delete" | "restore_trash" | "restore_archive" | "permanent_delete" | "archive" | "highlight" | "mark_sent",
    payload?: Record<string, boolean> | string,
  ): Promise<boolean> {
    const db = await getDatabase();
    const timestamp = new Date().toISOString();
    const targets = new Set(items.map((item) => this.orderTarget(
      typeof item === "string" ? item : String(item.supabase_id || item.id)
    )));
    const changes = {
      soft_delete: ["is_deleted", 1], restore_trash: ["is_deleted", 0],
      restore_archive: ["is_archived", 0], archive: ["is_archived", 1],
      highlight: ["highlights", JSON.stringify(payload ?? {})],
      mark_sent: ["ordered_date", payload],
    } as const;
    const activeProjectUrl = await resolveActiveSupabaseProjectUrl();
    for (const targetId of targets) {
      const hasRemoteOrInsert = this.cleanId(targetId) !== null || this.hasQueuedOrder(targetId);
      const storedId = targetId.startsWith("ord_") ? targetId : `ord_${targetId}`;
      if (action === "permanent_delete") {
        await db.execute("DELETE FROM orders WHERE id IN ($1,$2) OR supabase_id = $1", [targetId, storedId]);
      } else {
        const [column, value] = changes[action];
        await db.execute(
          `UPDATE orders SET ${column} = $1, updated_at = $2, sync_status = 'pending'
           WHERE id IN ($3,$4) OR supabase_id = $3`,
          [value, timestamp, targetId, storedId],
        );
      }
      if (hasRemoteOrInsert) {
        this.enqueueOffline({
          id: crypto.randomUUID(),
          targetId,
          action,
          payload,
          timestamp,
          ...(activeProjectUrl ? { projectUrl: activeProjectUrl } : {}),
        });
      }
    }
    if (targets.size) await this.processOfflineQueue();
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
        id: "ord_draft_" + crypto.randomUUID(),
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
      const res = await this.saveOrder(order, true);
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
  async markSupplierOrdersAsSent(supplierName: string, currentUser = "Operatore", orderIds?: string[]): Promise<boolean> {
    const targetIds = Array.isArray(orderIds) && orderIds.length > 0 ? orderIds : null;
    let resolvedIds = targetIds;
    if (!resolvedIds) {
      const db = await getDatabase();
      const orders = await db.select<Array<{ id: string; supabase_id: string | null }>>(
        `SELECT id, supabase_id FROM orders
         WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1)) AND is_archived = 0 AND is_deleted = 0`,
        [supplierName],
      );
      resolvedIds = orders.map((order) => order.supabase_id || order.id);
    }
    const date = TODAY();
    await this.changeOrders(resolvedIds, "mark_sent", date);
    await orderRepository.recordAuditLog("orders", "UPDATE", currentUser, null,
      { supplier: supplierName, ordered_date: date, count: resolvedIds.length },
      `Inviato ordine email a ${supplierName} (${resolvedIds.length} articoli)`);
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
    const cleanId = this.resolvedSuppliers.get(supplier.id) ?? this.supplierRemoteId(supplier.supabase_id)
      ?? this.supplierRemoteId(supplier.id);
    const targetId = cleanId ?? supplier.id;
    const supabase = this.hasQueuedSupplier(targetId) ? null : await this.getClient();

    const toSave: Supplier = {
      id: supplier.id,
      supabase_id: cleanId ?? undefined,
      name: (supplier.name || "").trim(),
      representative: supplier.representative || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      vat_number: supplier.vat_number || "",
      notes: supplier.notes || "",
      created_at: supplier.created_at || nowIso,
      updated_at: nowIso,
      sync_status: "pending",
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
        const remoteId = await this.writeSupplier(supabase, payload, cleanId);
        this.mutationGeneration++;
        this.resolvedSuppliers.set(supplier.id, remoteId);
        toSave.id = remoteId;
        toSave.supabase_id = remoteId;
        toSave.sync_status = "synced";
      } catch (err) {
        console.warn("[OrderSupabaseService] Errore upsertSupplier Supabase:", err);
      }
    }
    if (toSave.sync_status === "pending") {
      const activeProjectUrl = await resolveActiveSupabaseProjectUrl();
      this.enqueueOffline({
        id: crypto.randomUUID(),
        targetId,
        action: "upsert_supplier",
        payload,
        timestamp: nowIso,
        ...(activeProjectUrl ? { projectUrl: activeProjectUrl } : {}),
      });
    }
    await this.cacheSingleSupplierToSqlite(toSave, supplier.id);
    return toSave;
  }

  private async writeSupplier(supabase: SupabaseClient, payload: Record<string, unknown>, remoteId: string | null) {
    const table = supabase.from("fornitori");
    const request = remoteId
      ? table.update(payload).eq("id", remoteId)
      : table.upsert([payload], { onConflict: "nome" });
    const { data, error } = await request.select("id");
    if (error) throw error;
    const confirmedId = this.supplierRemoteId(data?.[0]?.id);
    if (!confirmedId) throw new Error("Fornitore non confermato da Supabase");
    return confirmedId;
  }

  async deleteSupplier(id: string): Promise<boolean> {
    const db = await getDatabase();
    const [local] = await db.select<Array<{ supabase_id: string | null }>>(
      "SELECT supabase_id FROM suppliers WHERE id = $1 OR supabase_id = $1 LIMIT 1", [id],
    );
    const remoteId = this.resolvedSuppliers.get(id) ?? this.supplierRemoteId(local?.supabase_id)
      ?? this.supplierRemoteId(id);
    const targetId = remoteId ?? id;
    if (remoteId || this.hasQueuedSupplier(targetId)) {
      const activeProjectUrl = await resolveActiveSupabaseProjectUrl();
      this.enqueueOffline({
        id: crypto.randomUUID(),
        targetId,
        action: "delete_supplier",
        timestamp: new Date().toISOString(),
        ...(activeProjectUrl ? { projectUrl: activeProjectUrl } : {}),
      });
    }
    await this.deleteSupplierFromSqlite(targetId);
    if (id !== targetId) await this.deleteSupplierFromSqlite(id);
    await this.processOfflineQueue();
    return true;
  }

  // ==========================================
  // CODA OFFLINE & RECUPERO AUTOMATICO
  // ==========================================

  public getOfflineQueue(): OfflineQueueItem[] {
    try {
      const raw = localStorage.getItem(ORDER_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveOfflineQueue(queue: OfflineQueueItem[]): void {
    localStorage.setItem(ORDER_QUEUE_KEY, JSON.stringify(queue));
  }

  private enqueueOffline(item: OfflineQueueItem): void {
    this.mutationGeneration++;
    const resolvedProjectUrl = normalizeSupabaseProjectUrl(item.projectUrl ?? getLastKnownSupabaseProjectUrl());
    const stampedItem: OfflineQueueItem = {
      ...item,
      ...(resolvedProjectUrl ? { projectUrl: resolvedProjectUrl } : {}),
    };
    const queue = this.getOfflineQueue();
    const last = [...queue].reverse().find(
      (entry) =>
        entry.targetId === stampedItem.targetId &&
        normalizeSupabaseProjectUrl(entry.projectUrl) === normalizeSupabaseProjectUrl(stampedItem.projectUrl)
    );
    if (["insert", "upsert_supplier"].includes(stampedItem.action) && last?.action === stampedItem.action && last.id !== this.processingItemId
      && (stampedItem.action !== "upsert_supplier" || last.payload.nome === stampedItem.payload.nome)) {
      last.payload = stampedItem.payload;
      last.timestamp = stampedItem.timestamp;
      last.remoteId ??= stampedItem.remoteId;
    } else {
      queue.push(stampedItem);
    }
    this.saveOfflineQueue(queue);
  }

  private acknowledgeOfflineItem(item: OfflineQueueItem, remoteId?: string): void {
    this.mutationGeneration++;
    const queue = this.getOfflineQueue().filter((entry) => entry.id !== item.id);
    if (remoteId) {
      const supplier = item.action.endsWith("supplier");
      (supplier ? this.resolvedSuppliers : this.resolvedDrafts).set(item.targetId, remoteId);
      const itemProjectUrl = normalizeSupabaseProjectUrl(item.projectUrl);
      for (const entry of queue) {
        if (
          entry.targetId !== item.targetId ||
          entry.action.endsWith("supplier") !== supplier ||
          normalizeSupabaseProjectUrl(entry.projectUrl) !== itemProjectUrl
        ) continue;
        entry.targetId = remoteId;
        if (entry.action === "insert") entry.action = "update";
      }
    }
    this.saveOfflineQueue(queue);
  }

  private lastQueueFailure: string | null = null;

  public getLastQueueFailure(): string | null {
    return this.lastQueueFailure;
  }

  async processOfflineQueue(): Promise<number> {
    if (!navigator.onLine) return 0;
    await getDatabase();
    if (this.queueFlight) return 0;
    const initialQueue = this.getOfflineQueue();
    if (initialQueue.length === 0) {
      this.lastQueueFailure = null;
      return 0;
    }
    this.queueFlight = this.drainOfflineQueue(initialQueue).finally(() => { this.queueFlight = null; });
    return this.queueFlight;
  }

  private async drainOfflineQueue(initialQueue: OfflineQueueItem[]): Promise<number> {
    let processedCount = 0;
    let legacyHeld = 0;
    const failedTargets = new Set<string>();
    this.lastQueueFailure = null;
    try {
      const supabase = await this.getClient();
      if (!supabase) {
        this.lastQueueFailure = "Sessione Supabase non disponibile per svuotare la coda ordini";
        return 0;
      }
      const activeProjectUrl =
        getLastKnownSupabaseProjectUrl() ??
        normalizeSupabaseProjectUrl((await this.getCredentials())?.projectUrl);
      for (const initial of initialQueue) {
        const item = this.getOfflineQueue().find((entry) => entry.id === initial.id);
        if (!item || failedTargets.has(item.targetId)) continue;
        const itemProjectUrl = normalizeSupabaseProjectUrl(item.projectUrl);
        if (!itemProjectUrl) {
          legacyHeld++;
          continue;
        }
        if (!activeProjectUrl || itemProjectUrl !== activeProjectUrl) {
          continue;
        }
        const clientUrl = normalizeSupabaseProjectUrl(
          (supabase as unknown as { supabaseUrl?: string }).supabaseUrl ?? (await this.getCredentials())?.projectUrl
        );
        if (clientUrl && clientUrl !== itemProjectUrl) {
          break;
        }
        this.processingItemId = item.id;
        try {
          const cleanId = this.cleanId(item.targetId);
          const db = await getDatabase();
          const hasLaterOperation = () => this.getOfflineQueue().some((entry) =>
            entry.id !== item.id && entry.action.endsWith("supplier") === item.action.endsWith("supplier") &&
            (entry.targetId === item.targetId || (cleanId && this.cleanId(entry.targetId) === cleanId))
          );
          // Old clients queued synthetic reorder IDs as updates.
          const legacyReorder = item.action === "update" && !cleanId && /^ord_\d+_\w+$/.test(item.targetId);
          if ((item.action === "insert" || legacyReorder) && item.payload) {
            if (!item.remoteId) {
              item.remoteId = await deterministicUuid(`last:order:${item.targetId}`);
              this.saveOfflineQueue(this.getOfflineQueue().map((entry) => entry.id === item.id ? item : entry));
            }
            const { data, error } = await supabase.from("ordini")
              .upsert([{ ...item.payload, id: item.remoteId }], { onConflict: "id" }).select();
            if (error) throw error;
            const remote = data?.[0];
            const remoteId = this.cleanId(remote?.id);
            if (!remoteId || remoteId !== item.remoteId) throw new Error("Ordine non confermato da Supabase");
            if (hasLaterOperation()) {
              const localId = `ord_${remoteId}`;
              await applyLocalDatabaseBatch([
                { sql: `DELETE FROM orders WHERE id = $1 AND sync_status = 'synced'
                  AND EXISTS (SELECT 1 FROM orders WHERE id IN ($2,$3) AND id <> $1)`,
                  params: [localId, item.targetId, `ord_${item.targetId}`] },
                { sql: "UPDATE orders SET id = $1, supabase_id = $2 WHERE id IN ($3,$4)",
                  params: [localId, remoteId, item.targetId, `ord_${item.targetId}`] },
              ]);
              this.acknowledgeOfflineItem(item, remoteId);
              processedCount++;
              continue;
            }
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
            this.acknowledgeOfflineItem(item, remoteId);
            processedCount++;
            continue;
          }

          if (item.action === "upsert_supplier" && item.payload) {
            const remoteId = await this.writeSupplier(supabase, item.payload, this.supplierRemoteId(item.targetId));
            await db.execute(
              `UPDATE suppliers SET supabase_id = $1,
                sync_status = CASE WHEN $2 AND updated_at <= $3 THEN 'synced' ELSE sync_status END
                WHERE id IN ($4,$5) OR supabase_id = $4`,
              [remoteId, hasLaterOperation() ? 0 : 1, item.timestamp, item.targetId, `sup_${item.targetId}`],
            );
            this.acknowledgeOfflineItem(item, remoteId);
            processedCount++;
            continue;
          }

          if (item.action === "delete_supplier" || item.action === "permanent_delete") {
            const id = item.action === "delete_supplier" ? this.supplierRemoteId(item.targetId) : cleanId;
            // A standalone legacy delete for a synthetic ID only affected the local row.
            if (id) {
              const { error } = await supabase.from(item.action === "delete_supplier" ? "fornitori" : "ordini")
                .delete().eq("id", id);
              if (error) throw error;
            }
          } else {
            const flags = {
              soft_delete: { eliminato: true }, restore_trash: { eliminato: false },
              restore_archive: { archiviato: false }, archive: { archiviato: true },
              highlight: { evidenze: item.payload }, mark_sent: { ordinato: item.payload },
            };
            const payload = item.action === "update" ? item.payload : flags[item.action as keyof typeof flags];
            if (!payload || !cleanId) continue;
            const { data, error } = await supabase.from("ordini")
              .update({ ...payload, ultima_modifica: item.timestamp }).eq("id", cleanId).select("id");
            if (error) throw error;
            if (data?.length !== 1) throw new Error("Modifica ordine non confermata da Supabase");
            if (!hasLaterOperation()) {
              await db.execute(
                "UPDATE orders SET sync_status = 'synced' WHERE supabase_id = $1 AND updated_at <= $2",
                [cleanId, item.timestamp],
              );
            }
          }
          this.acknowledgeOfflineItem(item);
          processedCount++;
        } catch (error) {
          failedTargets.add(item.targetId);
          console.warn(`[OrderSupabaseService] Errore elaborazione coda per ${item.id}:`, error);
        }
      }
    } finally {
      this.processingItemId = undefined;
    }
    if (failedTargets.size > 0) {
      this.lastQueueFailure = `${failedTargets.size} operazioni ordini non confermate su Supabase`;
    }
    if (legacyHeld > 0) {
      console.warn(
        `[OrderSupabaseService] Conservate ${legacyHeld} operazioni ordini legacy prive di progetto di destinazione verificabile.`
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("order-legacy-offline-queue", { detail: { count: legacyHeld } }));
      }
    }
    if (processedCount > 0) {
      window.dispatchEvent(new CustomEvent("order_offline_queue_synced", { detail: { processedCount } }));
    }
    return processedCount;
  }

  // ==========================================
  // CACHE SQLITE LOCALE (PER MODALITÀ OFFLINE)
  // ==========================================

  private async cacheOrdersToSqlite(orders: OrderItem[], generation: number, viewMode?: OrderViewMode, strict = false): Promise<void> {
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      const activeProjectUrl =
        getLastKnownSupabaseProjectUrl() ??
        normalizeSupabaseProjectUrl((await this.getCredentials())?.projectUrl);
      const fetchedSupabaseIds = new Set<string>();

      for (const item of orders) {
        if (this.mutationGeneration !== generation) return;
        const localId = "ord_" + item.id;
        fetchedSupabaseIds.add(String(item.id));
        if (this.hasQueuedOrder(String(item.id))) continue;
        // Rimuove eventuali vecchie righe draft/duplicate collegate allo stesso supabase_id
        await db.execute(
          `DELETE FROM orders WHERE supabase_id = $1 AND id <> $2 AND sync_status = 'synced'`,
          [String(item.id), localId]
        );
        if (this.mutationGeneration !== generation) return;
        await db.execute(
          `INSERT INTO orders (
            id, supabase_id, order_date, supplier_name, article_code, description,
            quantity, price, ordered_date, notes, user_name, is_archived, is_deleted,
            highlights, created_at, updated_at, sync_status, project_url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'synced', $17)
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
            sync_status = 'synced',
            project_url = excluded.project_url
          WHERE orders.sync_status <> 'pending' AND julianday(excluded.updated_at) >= julianday(orders.updated_at)`,
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
            activeProjectUrl,
          ]
        );
      }

      // Rimuove dalla cache di questa vista eventuali ordini synced eliminati o spostati da altri PC
      if (viewMode && activeProjectUrl) {
        const viewWhere =
          viewMode === "archiviati"
            ? "is_archived = 1 AND is_deleted = 0"
            : viewMode === "cestino"
            ? "is_deleted = 1"
            : "is_archived = 0 AND is_deleted = 0";
        const localInView = await db.select<{ id: string; supabase_id: string | null }[]>(
          `SELECT id, supabase_id FROM orders WHERE ${viewWhere} AND sync_status = 'synced' AND project_url = $1`,
          [activeProjectUrl]
        );
        for (const row of localInView) {
          if (this.mutationGeneration !== generation) return;
          const supId = row.supabase_id ? String(row.supabase_id) : "";
          if (supId && !fetchedSupabaseIds.has(supId) && !this.hasQueuedOrder(supId) && !this.hasQueuedOrder(row.id)) {
            await db.execute(`DELETE FROM orders WHERE id = $1 AND sync_status = 'synced'`, [row.id]);
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

    const generation = this.mutationGeneration;
    try {
      const allRemote = await this.readCloudPages(supabase.from("ordini").select("*", { count: "exact" }).order("id"), true);

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

      await this.cacheOrdersToSqlite(mapped, generation);

      const db = await getDatabase();
      const activeProjectUrl =
        getLastKnownSupabaseProjectUrl() ??
        normalizeSupabaseProjectUrl((await this.getCredentials())?.projectUrl);
      if (!activeProjectUrl) return;
      const remoteIds = new Set(mapped.map((m) => String(m.id)));
      const localAll = await db.select<{ id: string; supabase_id: string | null; sync_status: string }[]>(
        `SELECT id, supabase_id, sync_status FROM orders WHERE project_url = $1`,
        [activeProjectUrl]
      );
      for (const row of localAll) {
        if (this.mutationGeneration !== generation) return;
        const supId = row.supabase_id ? String(row.supabase_id) : "";
        if (row.sync_status === "synced" && (!supId || !remoteIds.has(supId)) && !this.hasQueuedOrder(row.id) && !this.hasQueuedOrder(supId)) {
          await db.execute(`DELETE FROM orders WHERE id = $1 AND sync_status = 'synced'`, [row.id]);
        }
      }
    } catch (err) {
      console.warn("[OrderSupabaseService] Errore riconciliazione cache ordini:", err);
    }
  }

  private async cacheSingleOrderToSqlite(item: OrderItem, previousLocalId?: string): Promise<void> {
    await getDatabase();
    const writes: SqliteWrite[] = [];
    const cleanSup = item.supabase_id ? String(item.supabase_id) : null;
    const localId = cleanSup ? `ord_${cleanSup}` : (item.id.startsWith("ord_") ? item.id : "ord_" + item.id);
    const now = new Date().toISOString();

    if (cleanSup) {
      writes.push({ sql: `DELETE FROM orders WHERE (supabase_id = $1 OR id = $2) AND id <> $3`,
        params: [cleanSup, previousLocalId || "", localId],
      });
    } else if (previousLocalId && previousLocalId !== localId) {
      writes.push({ sql: "DELETE FROM orders WHERE id = $1", params: [previousLocalId] });
    }

    const orderProjectUrl = getLastKnownSupabaseProjectUrl();
    writes.push({ sql: `INSERT INTO orders (
        id, supabase_id, order_date, supplier_name, article_code, description,
        quantity, price, ordered_date, notes, user_name, is_archived, is_deleted,
        highlights, created_at, updated_at, sync_status, project_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
        sync_status = excluded.sync_status,
        project_url = COALESCE(orders.project_url, excluded.project_url)`,
      params: [
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
        orderProjectUrl,
      ],
    });
    await applyLocalDatabaseBatch(writes);
  }

  private async cacheSuppliersToSqlite(suppliers: Supplier[], generation: number, strict = false): Promise<void> {
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      for (const item of suppliers) {
        if (this.mutationGeneration !== generation) return;
        if (this.hasQueuedSupplier(item.id)) continue;
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
            sync_status = 'synced'
          WHERE suppliers.sync_status <> 'pending'`,
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

  private async cacheSingleSupplierToSqlite(item: Supplier, localId: string): Promise<void> {
    const db = await getDatabase();
    const params = [
      localId.startsWith("sup_") ? localId : `sup_${localId}`,
      item.supabase_id ?? null, item.name, item.representative ?? "", item.email ?? "",
      item.phone ?? "", item.address ?? "", item.vat_number ?? "", item.notes ?? "",
      item.created_at, item.updated_at, item.sync_status,
    ];
    const assign = `supabase_id = excluded.supabase_id, name = excluded.name,
      representative = excluded.representative, email = excluded.email, phone = excluded.phone,
      address = excluded.address, vat_number = excluded.vat_number, notes = excluded.notes,
      updated_at = excluded.updated_at, sync_status = excluded.sync_status`;
    await db.execute(`INSERT INTO suppliers (
      id, supabase_id, name, representative, email, phone, address, vat_number, notes, created_at, updated_at, sync_status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT(id) DO UPDATE SET ${assign}
    ON CONFLICT(name) DO UPDATE SET ${assign}`, params);
  }

  private async deleteSupplierFromSqlite(id: string): Promise<void> {
    const db = await getDatabase();
    await db.execute("DELETE FROM suppliers WHERE id IN ($1,$2) OR supabase_id = $1",
      [id, id.startsWith("sup_") ? id : `sup_${id}`]);
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
          "SELECT DISTINCT fornitore as name FROM listino_generale WHERE fornitore IS NOT NULL AND TRIM(fornitore) != ''",
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

  private async deleteFromSqlite(ids: string[], isCurrent: () => boolean): Promise<void> {
    try {
      const db = await getDatabase();
      for (const id of ids) {
        if (!isCurrent() || this.hasQueuedOrder(id)) return;
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

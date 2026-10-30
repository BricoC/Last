import { getDatabase } from "@/shared/data-layer/database";
import { OrderItem, Supplier, OrderAuditLog, OrderViewMode } from "../types/order";
import { TODAY } from "../utils/constants";

/**
 * Converte qualsiasi rappresentazione (oggetto, stringa JSON, stringa doppiamente serializzata)
 * in un oggetto valido Record<string, boolean>, escludendo indici numerici spurii.
 */
export function parseHighlights(raw: any): Record<string, boolean> {
  if (!raw) return {};
  let cur = raw;
  while (typeof cur === "string") {
    try {
      cur = JSON.parse(cur);
    } catch {
      return {};
    }
  }
  if (typeof cur !== "object" || cur === null || Array.isArray(cur)) {
    return {};
  }
  const clean: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(cur)) {
    if (v === true && k !== "0" && k !== "1" && isNaN(Number(k)) && k !== "col_select" && k !== "col_actions") {
      clean[k] = true;
    }
  }
  return clean;
}

class OrderRepository {
  /**
   * Restituisce gli ordini in base alla modalità di visualizzazione:
   * - 'attivi': non archiviati e non cancellati
   * - 'archiviati': archiviati e non cancellati
   * - 'cestino': cancellati (is_deleted = 1)
   */
  async getOrders(viewMode: OrderViewMode): Promise<OrderItem[]> {
    const db = await getDatabase();

    // Elimina eventuali duplicati generati da desincronizzazione ID locale / remoto
    try {
      await db.execute(`
        DELETE FROM orders 
        WHERE supabase_id IS NOT NULL 
        AND id NOT IN (
          SELECT MIN(id) FROM orders WHERE supabase_id IS NOT NULL GROUP BY supabase_id
        )
      `);
      await db.execute(`
        DELETE FROM orders 
        WHERE supabase_id IS NULL AND is_archived = 0 AND is_deleted = 0
        AND (supplier_name IS NULL OR supplier_name = '') 
        AND (description IS NULL OR description = '')
        AND (article_code IS NULL OR article_code = '')
      `);
      await db.execute(`
        UPDATE orders 
        SET highlights = '{}' 
        WHERE highlights = '"{}"' OR highlights = '\"{}\"' OR highlights LIKE '"%' OR highlights IS NULL
      `);
    } catch {
      // Cleanup facoltativo
    }

    let query = `
      SELECT 
        id, supabase_id, order_date, supplier_name, article_code, description,
        quantity, price, ordered_date, notes, user_name, is_archived, is_deleted,
        highlights, created_at, updated_at, sync_status
      FROM orders
    `;

    if (viewMode === 'archiviati') {
      query += ` WHERE is_archived = 1 AND is_deleted = 0 ORDER BY updated_at DESC`;
    } else if (viewMode === 'cestino') {
      query += ` WHERE is_deleted = 1 ORDER BY updated_at DESC`;
    } else {
      query += ` WHERE is_archived = 0 AND is_deleted = 0 ORDER BY supplier_name ASC, created_at ASC`;
    }

    const rows = await db.select<Array<{
      id: string;
      supabase_id: number | null;
      order_date: string;
      supplier_name: string;
      article_code: string;
      description: string;
      quantity: string;
      price: string;
      ordered_date: string | null;
      notes: string | null;
      user_name: string | null;
      is_archived: number;
      is_deleted: number;
      highlights: string | null;
      created_at: string;
      updated_at: string;
      sync_status: string;
    }>>(query);

    return rows.map((r) => {
      const highlights = parseHighlights(r.highlights);
      return {
        id: r.id,
        supabase_id: r.supabase_id,
        order_date: r.order_date || '',
        supplier_name: r.supplier_name || '',
        article_code: r.article_code || '',
        description: r.description || '',
        quantity: r.quantity || '',
        price: r.price || '',
        ordered_date: r.ordered_date,
        notes: r.notes || '',
        user_name: r.user_name || '',
        is_archived: r.is_archived === 1,
        is_deleted: r.is_deleted === 1,
        highlights,
        created_at: r.created_at,
        updated_at: r.updated_at,
        sync_status: r.sync_status as 'synced' | 'pending' | 'failed',
      };
    });
  }

  /**
   * Salva o aggiorna un ordine locale con audit log automatico
   */
  async upsertOrder(order: Partial<OrderItem> & { id: string }, currentUser: string = 'Operatore'): Promise<OrderItem> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    // Controlla se esiste già
    const existing = await db.select<Array<{
      id: string;
      supabase_id: number | null;
      order_date: string;
      supplier_name: string;
      article_code: string;
      description: string;
      quantity: string;
      price: string;
      ordered_date: string | null;
      notes: string | null;
      user_name: string | null;
      is_archived: number;
      is_deleted: number;
      highlights: string | null;
      created_at: string;
      updated_at: string;
    }>>('SELECT * FROM orders WHERE id = $1 LIMIT 1', [order.id]);

    const oldRecord = existing[0] || null;

    const recordToSave: OrderItem = {
      id: order.id,
      supabase_id: order.supabase_id ?? (oldRecord ? oldRecord.supabase_id : null),
      order_date: order.order_date ?? (oldRecord ? oldRecord.order_date : TODAY()),
      supplier_name: order.supplier_name ?? (oldRecord ? oldRecord.supplier_name : ''),
      article_code: order.article_code ?? (oldRecord ? oldRecord.article_code : ''),
      description: (order.description ?? (oldRecord ? oldRecord.description : '')).toUpperCase(),
      quantity: order.quantity ?? (oldRecord ? oldRecord.quantity : ''),
      price: order.price ?? (oldRecord ? oldRecord.price : ''),
      ordered_date: order.ordered_date !== undefined ? order.ordered_date : (oldRecord ? oldRecord.ordered_date : null),
      notes: order.notes !== undefined ? order.notes : (oldRecord && oldRecord.notes ? oldRecord.notes : ''),
      user_name: order.user_name !== undefined ? order.user_name : (oldRecord && oldRecord.user_name ? oldRecord.user_name : currentUser),
      is_archived: order.is_archived ?? (oldRecord ? oldRecord.is_archived === 1 : false),
      is_deleted: order.is_deleted ?? (oldRecord ? oldRecord.is_deleted === 1 : false),
      highlights: parseHighlights(order.highlights ?? (oldRecord ? oldRecord.highlights : {})),
      created_at: oldRecord ? oldRecord.created_at : now,
      updated_at: now,
      sync_status: 'pending',
    };

    if (oldRecord) {
      await db.execute(
        `UPDATE orders SET
          order_date = $1, supplier_name = $2, article_code = $3, description = $4,
          quantity = $5, price = $6, ordered_date = $7, notes = $8, user_name = $9,
          is_archived = $10, is_deleted = $11, highlights = $12, updated_at = $13,
          sync_status = 'pending'
        WHERE id = $14`,
        [
          recordToSave.order_date,
          recordToSave.supplier_name,
          recordToSave.article_code,
          recordToSave.description,
          recordToSave.quantity,
          recordToSave.price,
          recordToSave.ordered_date,
          recordToSave.notes,
          recordToSave.user_name,
          recordToSave.is_archived ? 1 : 0,
          recordToSave.is_deleted ? 1 : 0,
          JSON.stringify(recordToSave.highlights || {}),
          now,
          recordToSave.id,
        ]
      );

      // Registra audit log
      await this.recordAuditLog(
        'orders',
        'UPDATE',
        currentUser,
        oldRecord,
        recordToSave,
        `Modifica ordine ${recordToSave.article_code} (${recordToSave.supplier_name})`
      );
    } else {
      await db.execute(
        `INSERT INTO orders (
          id, supabase_id, order_date, supplier_name, article_code, description,
          quantity, price, ordered_date, notes, user_name, is_archived, is_deleted,
          highlights, created_at, updated_at, sync_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'pending')`,
        [
          recordToSave.id,
          recordToSave.supabase_id,
          recordToSave.order_date,
          recordToSave.supplier_name,
          recordToSave.article_code,
          recordToSave.description,
          recordToSave.quantity,
          recordToSave.price,
          recordToSave.ordered_date,
          recordToSave.notes,
          recordToSave.user_name,
          recordToSave.is_archived ? 1 : 0,
          recordToSave.is_deleted ? 1 : 0,
          JSON.stringify(recordToSave.highlights || {}),
          recordToSave.created_at,
          recordToSave.updated_at,
        ]
      );

      await this.recordAuditLog(
        'orders',
        'INSERT',
        currentUser,
        null,
        recordToSave,
        `Nuovo ordine ${recordToSave.article_code} (${recordToSave.supplier_name})`
      );
    }

    return recordToSave;
  }

  /**
   * Sposta uno o più ordini nel cestino (soft delete)
   */
  async moveToTrash(ids: string[], currentUser: string = 'Operatore'): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDatabase();
    const now = new Date().toISOString();
    for (const id of ids) {
      await db.execute(
        `UPDATE orders SET is_deleted = 1, updated_at = $1, sync_status = 'pending' WHERE id = $2`,
        [now, id]
      );
      await this.recordAuditLog('orders', 'UPDATE', currentUser, { id, is_deleted: 0 }, { id, is_deleted: 1 }, `Spostato nel cestino`);
    }
  }

  /**
   * Ripristina ordini dal cestino
   */
  async restoreFromTrash(ids: string[], currentUser: string = 'Operatore'): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDatabase();
    const now = new Date().toISOString();
    for (const id of ids) {
      await db.execute(
        `UPDATE orders SET is_deleted = 0, updated_at = $1, sync_status = 'pending' WHERE id = $2`,
        [now, id]
      );
      await this.recordAuditLog('orders', 'UPDATE', currentUser, { id, is_deleted: 1 }, { id, is_deleted: 0 }, `Ripristinato dal cestino`);
    }
  }

  /**
   * Ripristina ordini dall'archivio negli attivi
   */
  async restoreFromArchive(ids: string[], currentUser: string = 'Operatore'): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDatabase();
    const now = new Date().toISOString();
    for (const id of ids) {
      await db.execute(
        `UPDATE orders SET is_archived = 0, updated_at = $1, sync_status = 'pending' WHERE id = $2`,
        [now, id]
      );
      await this.recordAuditLog('orders', 'UPDATE', currentUser, { id, is_archived: 1 }, { id, is_archived: 0 }, `Ripristinato tra gli attivi`);
    }
  }

  /**
   * Elimina definitivamente record dal database
   */
  async permanentDelete(ids: string[], currentUser: string = 'Operatore'): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDatabase();
    for (const id of ids) {
      await db.execute(`DELETE FROM orders WHERE id = $1`, [id]);
      await this.recordAuditLog('orders', 'DELETE', currentUser, { id }, null, `Eliminazione definitiva`);
    }
  }

  /**
   * Archivia in blocco tutti gli ordini attivi che hanno 'ordered_date' compilato
   */
  async archiveOrderedRows(currentUser: string = 'Operatore'): Promise<number> {
    const db = await getDatabase();
    const rows = await db.select<Array<{ id: string }>>(
      `SELECT id FROM orders WHERE is_archived = 0 AND is_deleted = 0 AND ordered_date IS NOT NULL AND ordered_date != ''`
    );
    if (rows.length === 0) return 0;
    const now = new Date().toISOString();
    for (const r of rows) {
      await db.execute(
        `UPDATE orders SET is_archived = 1, updated_at = $1, sync_status = 'pending' WHERE id = $2`,
        [now, r.id]
      );
    }
    await this.recordAuditLog('orders', 'UPDATE', currentUser, null, null, `Archiviati ${rows.length} ordini completati`);
    return rows.length;
  }

  /**
   * Imposta la data d'ordine per tutti gli articoli di un fornitore specificato (post-invio email)
   */
  async markSupplierOrdersAsSent(supplierName: string, currentUser: string = 'Operatore'): Promise<string[]> {
    const db = await getDatabase();
    const today = TODAY();
    const now = new Date().toISOString();
    const rows = await db.select<Array<{ id: string }>>(
      `SELECT id FROM orders WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1)) AND is_archived = 0 AND is_deleted = 0`,
      [supplierName]
    );
    const ids = rows.map((r) => r.id);
    for (const id of ids) {
      await db.execute(
        `UPDATE orders SET ordered_date = $1, updated_at = $2, sync_status = 'pending' WHERE id = $3`,
        [today, now, id]
      );
    }
    await this.recordAuditLog(
      'orders',
      'UPDATE',
      currentUser,
      null,
      { supplier: supplierName, ordered_date: today, count: ids.length },
      `Inviato ordine email a ${supplierName} (${ids.length} articoli)`
    );
    return ids;
  }

  /**
   * Toggle dell'evidenziazione di una specifica cella
   */
  async toggleCellHighlight(orderId: string, colId: string): Promise<Record<string, boolean>> {
    if (!colId || colId === "col_select" || colId === "col_actions" || colId === "0" || colId === "1" || !isNaN(Number(colId))) {
      return {};
    }
    const db = await getDatabase();
    const rows = await db.select<Array<{ highlights: string | null }>>(
      `SELECT highlights FROM orders WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    if (rows.length === 0) return {};
    const highlights = parseHighlights(rows[0].highlights);
    if (highlights[colId]) {
      delete highlights[colId];
    } else {
      highlights[colId] = true;
    }
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE orders SET highlights = $1, updated_at = $2, sync_status = 'pending' WHERE id = $3`,
      [JSON.stringify(highlights), now, orderId]
    );
    return highlights;
  }

  /**
   * RE-ORDER (Nuova funzione richiesta):
   * Clona uno o più articoli dallo storico fornitore creando nuovi ordini attivi con data odierna
   */
  async reorderArticles(items: Array<{
    supplier_name: string;
    article_code: string;
    description: string;
    quantity?: string;
    price?: string;
    notes?: string;
  }>, currentUser: string = 'Operatore'): Promise<OrderItem[]> {
    const created: OrderItem[] = [];
    const today = TODAY();
    for (const it of items) {
      const newOrder: OrderItem = {
        id: 'ord_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        order_date: today,
        supplier_name: it.supplier_name,
        article_code: it.article_code,
        description: it.description.toUpperCase(),
        quantity: it.quantity || '1',
        price: it.price || '',
        notes: it.notes || '',
        user_name: currentUser,
        is_archived: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sync_status: 'pending',
      };
      await this.upsertOrder(newOrder, currentUser);
      created.push(newOrder);
    }
    return created;
  }

  /**
   * Restituisce tutti gli articoli storici ordinati per un fornitore con conteggi di frequenza
   */
  async getSupplierHistory(supplierName?: string): Promise<Array<{
    supplier_name: string;
    article_code: string;
    description: string;
    last_price: string;
    last_order_date: string;
    order_count: number;
    total_quantity: number;
  }>> {
    const db = await getDatabase();
    let query = `
      SELECT 
        supplier_name,
        article_code,
        description,
        price,
        order_date,
        ordered_date,
        quantity
      FROM orders
      WHERE is_deleted = 0 AND supplier_name != '' AND article_code != ''
    `;
    const params: unknown[] = [];
    if (supplierName && supplierName.trim() !== '') {
      query += ` AND LOWER(TRIM(supplier_name)) = LOWER(TRIM($1))`;
      params.push(supplierName);
    }
    query += ` ORDER BY updated_at DESC`;

    const rows = await db.select<Array<{
      supplier_name: string;
      article_code: string;
      description: string;
      price: string;
      order_date: string;
      ordered_date: string | null;
      quantity: string;
    }>>(query, params);

    const map = new Map<string, {
      supplier_name: string;
      article_code: string;
      description: string;
      last_price: string;
      last_order_date: string;
      order_count: number;
      total_quantity: number;
    }>();

    for (const r of rows) {
      const key = `${(r.supplier_name || '').toLowerCase()}:::${(r.article_code || '').toLowerCase()}`;
      const qtyNum = parseFloat(r.quantity) || 0;
      const orderDate = r.ordered_date || r.order_date || '';

      if (!map.has(key)) {
        map.set(key, {
          supplier_name: r.supplier_name,
          article_code: r.article_code,
          description: r.description,
          last_price: r.price,
          last_order_date: orderDate,
          order_count: 1,
          total_quantity: qtyNum,
        });
      } else {
        const item = map.get(key)!;
        item.order_count++;
        item.total_quantity += qtyNum;
        if (!item.last_order_date && orderDate) {
          item.last_order_date = orderDate;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.order_count - a.order_count);
  }

  /**
   * Fornisce suggerimenti per l'autocompletamento per fornitore
   * (cerca sia nello storico ordini sia nella tabella products)
   */
  async getArticleSuggestions(supplierName: string, query: string): Promise<Array<{
    article_code: string;
    description: string;
    price: string;
  }>> {
    const db = await getDatabase();
    const cleanQuery = `%${query.trim().toLowerCase()}%`;

    // 1. Cerca prima negli ordini passati di quel fornitore
    const historyRows = await db.select<Array<{
      article_code: string;
      description: string;
      price: string;
    }>>(
      `SELECT DISTINCT article_code, description, price
       FROM orders
       WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1))
         AND (LOWER(article_code) LIKE $2 OR LOWER(description) LIKE $2)
       ORDER BY updated_at DESC LIMIT 15`,
      [supplierName, cleanQuery]
    );

    // 2. Se pochi risultati, cerca anche nei prodotti a magazzino
    let productRows: Array<{ article_code: string; description: string; price: string }> = [];
    if (historyRows.length < 10) {
      const pr = await db.select<Array<{ code: string; description: string; purchase_price_cents: number }>>(
        `SELECT code, description, purchase_price_cents
         FROM products
         WHERE deleted_at IS NULL
           AND (LOWER(supplier) = LOWER($1) OR supplier IS NULL OR supplier = '')
           AND (LOWER(code) LIKE $2 OR LOWER(description) LIKE $2)
         LIMIT 10`,
        [supplierName, cleanQuery]
      );
      productRows = pr.map((p) => ({
        article_code: p.code,
        description: p.description,
        price: p.purchase_price_cents ? (p.purchase_price_cents / 100).toFixed(2) : '',
      }));
    }

    const merged = [...historyRows, ...productRows];
    const uniqueMap = new Map<string, { article_code: string; description: string; price: string }>();
    for (const m of merged) {
      if (m.article_code && !uniqueMap.has(m.article_code.toLowerCase())) {
        uniqueMap.set(m.article_code.toLowerCase(), m);
      }
    }

    return Array.from(uniqueMap.values());
  }

  // ─── GESTIONE FORNITORI ───────────────────────────────────────────────────

  async getSuppliers(): Promise<Supplier[]> {
    const db = await getDatabase();
    const rows = await db.select<Supplier[]>(
      `SELECT id, supabase_id, name, representative, email, phone, address, vat_number, notes, created_at, updated_at, sync_status
       FROM suppliers ORDER BY name ASC`
    );
    return rows;
  }

  async upsertSupplier(supplier: Partial<Supplier> & { id: string }, currentUser: string = 'Operatore'): Promise<Supplier> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const existing = await db.select<Supplier[]>(
      `SELECT * FROM suppliers WHERE id = $1 LIMIT 1`,
      [supplier.id]
    );
    const old = existing[0] || null;

    const toSave: Supplier = {
      id: supplier.id,
      supabase_id: supplier.supabase_id ?? (old ? old.supabase_id : null),
      name: (supplier.name ?? (old ? old.name : '')).trim(),
      representative: supplier.representative ?? (old ? old.representative : ''),
      email: supplier.email ?? (old ? old.email : ''),
      phone: supplier.phone ?? (old ? old.phone : ''),
      address: supplier.address ?? (old ? old.address : ''),
      vat_number: supplier.vat_number ?? (old ? old.vat_number : ''),
      notes: supplier.notes ?? (old ? old.notes : ''),
      created_at: old ? old.created_at : now,
      updated_at: now,
      sync_status: 'pending',
    };

    if (old) {
      await db.execute(
        `UPDATE suppliers SET
          name = $1, representative = $2, email = $3, phone = $4, address = $5,
          vat_number = $6, notes = $7, updated_at = $8, sync_status = 'pending'
        WHERE id = $9`,
        [toSave.name, toSave.representative, toSave.email, toSave.phone, toSave.address, toSave.vat_number, toSave.notes, now, toSave.id]
      );
      await this.recordAuditLog('suppliers', 'UPDATE', currentUser, old, toSave, `Modificato fornitore ${toSave.name}`);
    } else {
      await db.execute(
        `INSERT INTO suppliers (
          id, supabase_id, name, representative, email, phone, address, vat_number, notes, created_at, updated_at, sync_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')`,
        [toSave.id, toSave.supabase_id, toSave.name, toSave.representative, toSave.email, toSave.phone, toSave.address, toSave.vat_number, toSave.notes, toSave.created_at, toSave.updated_at]
      );
      await this.recordAuditLog('suppliers', 'INSERT', currentUser, null, toSave, `Nuovo fornitore ${toSave.name}`);
    }

    return toSave;
  }

  async deleteSupplier(id: string, currentUser: string = 'Operatore'): Promise<void> {
    const db = await getDatabase();
    await db.execute(`DELETE FROM suppliers WHERE id = $1`, [id]);
    await this.recordAuditLog('suppliers', 'DELETE', currentUser, { id }, null, `Eliminato fornitore`);
  }

  // ─── AUDIT LOGS ──────────────────────────────────────────────────────────

  async recordAuditLog(
    tableName: string,
    operationType: 'INSERT' | 'UPDATE' | 'DELETE',
    userName: string,
    oldData: unknown,
    newData: unknown,
    summary: string
  ): Promise<void> {
    try {
      const db = await getDatabase();
      const id = 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO order_audit_logs (
          id, table_name, operation_type, operation_date, user_name, old_data, new_data, summary, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          tableName,
          operationType,
          now,
          userName,
          oldData ? JSON.stringify(oldData) : null,
          newData ? JSON.stringify(newData) : null,
          summary,
          now,
        ]
      );
    } catch (err) {
      console.warn('[OrderRepository] Errore salvataggio audit log:', err);
    }
  }

  async getAuditLogs(limit: number = 300): Promise<OrderAuditLog[]> {
    const db = await getDatabase();
    const rows = await db.select<Array<{
      id: string;
      supabase_id: number | null;
      table_name: string;
      operation_type: string;
      operation_date: string;
      user_name: string | null;
      old_data: string | null;
      new_data: string | null;
      summary: string | null;
      created_at: string;
    }>>(
      `SELECT id, supabase_id, table_name, operation_type, operation_date, user_name, old_data, new_data, summary, created_at
       FROM order_audit_logs ORDER BY operation_date DESC LIMIT $1`,
      [limit]
    );

    return rows.map((r) => ({
      id: r.id,
      supabase_id: r.supabase_id,
      table_name: r.table_name,
      operation_type: r.operation_type as 'INSERT' | 'UPDATE' | 'DELETE',
      operation_date: r.operation_date,
      user_name: r.user_name || 'Operatore',
      old_data: r.old_data ? JSON.parse(r.old_data) : null,
      new_data: r.new_data ? JSON.parse(r.new_data) : null,
      summary: r.summary || '',
      created_at: r.created_at,
    }));
  }

  async clearAuditLogs(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDatabase();
    for (const id of ids) {
      await db.execute(`DELETE FROM order_audit_logs WHERE id = $1`, [id]);
    }
  }

  // ─── RICERCA GLOBALE MULTI-PAROLA ───────────────────────────────────────

  async searchAll(query: string): Promise<{
    orders: OrderItem[];
    suppliers: Supplier[];
    auditLogs: OrderAuditLog[];
  }> {
    const rawQuery = query.trim().toLowerCase();
    if (!rawQuery) {
      return { orders: [], suppliers: [], auditLogs: [] };
    }

    const tokens = rawQuery.split(/\s+/).filter(Boolean);
    const db = await getDatabase();

    // Carica tutti gli ordini dal database locale
    const ordersRows = await db.select<any[]>(
      `SELECT * FROM orders ORDER BY updated_at DESC LIMIT 2000`
    );

    const supplierRows = await db.select<Supplier[]>(
      `SELECT * FROM suppliers ORDER BY name ASC LIMIT 500`
    );

    const auditRows = await db.select<any[]>(
      `SELECT * FROM order_audit_logs ORDER BY operation_date DESC LIMIT 500`
    );

    // Filtro multi-parola: OGNI token deve corrispondere in almeno un campo
    const filteredOrdersRows = ordersRows.filter((r) => {
      const combined = `${r.supplier_name || ''} ${r.article_code || ''} ${r.description || ''} ${r.notes || ''} ${r.order_date || ''} ${r.ordered_date || ''}`.toLowerCase();
      return tokens.every((tok) => combined.includes(tok));
    });

    const filteredSuppliers = supplierRows.filter((s) => {
      const combined = `${s.name || ''} ${s.representative || ''} ${s.email || ''} ${s.phone || ''} ${s.address || ''} ${s.vat_number || ''}`.toLowerCase();
      return tokens.every((tok) => combined.includes(tok));
    });

    const filteredAudit = auditRows.filter((a) => {
      const combined = `${a.summary || ''} ${a.user_name || ''} ${a.operation_type || ''} ${a.table_name || ''} ${a.old_data || ''} ${a.new_data || ''}`.toLowerCase();
      return tokens.every((tok) => combined.includes(tok));
    });

    const orders: OrderItem[] = filteredOrdersRows.map((r) => ({
      id: r.id,
      supabase_id: r.supabase_id,
      order_date: r.order_date || '',
      supplier_name: r.supplier_name || '',
      article_code: r.article_code || '',
      description: r.description || '',
      quantity: r.quantity || '',
      price: r.price || '',
      ordered_date: r.ordered_date,
      notes: r.notes || '',
      user_name: r.user_name || '',
      is_archived: r.is_archived === 1,
      is_deleted: r.is_deleted === 1,
      highlights: r.highlights ? JSON.parse(r.highlights) : {},
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    const auditLogs: OrderAuditLog[] = filteredAudit.map((r) => ({
      id: r.id,
      supabase_id: r.supabase_id,
      table_name: r.table_name,
      operation_type: r.operation_type,
      operation_date: r.operation_date,
      user_name: r.user_name,
      old_data: r.old_data ? JSON.parse(r.old_data) : null,
      new_data: r.new_data ? JSON.parse(r.new_data) : null,
      summary: r.summary,
      created_at: r.created_at,
    }));

    return { orders, suppliers: filteredSuppliers, auditLogs };
  }
}

export const orderRepository = new OrderRepository();

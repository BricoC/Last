import { getDatabase } from "@/shared/data-layer/database";
import type { OfferRecord, OfferStatus, TrashOfferRow } from "../types/offer";
import { offersSyncService } from "./offersSyncService";

export class OffersRepository {
  /**
   * Recupera la lista delle offerte ordinate con la più recente in cima
   */
  public async getOffers(isArchived: boolean): Promise<OfferRecord[]> {
    const db = await getDatabase();
    const rows = await db.select<OfferRecord[]>(
      `SELECT * FROM offers 
       WHERE is_archived = $1
       ORDER BY offer_date DESC, created_at DESC`,
      [isArchived ? 1 : 0]
    );
    return rows;
  }

  /**
   * Recupera tutte le offerte (attive e archiviate) ordinate con la più recente in cima
   */
  public async getAllOffers(): Promise<OfferRecord[]> {
    const db = await getDatabase();
    const rows = await db.select<OfferRecord[]>(
      `SELECT * FROM offers ORDER BY offer_date DESC, created_at DESC`
    );
    return rows;
  }

  /**
   * Restituisce i conteggi attive, archiviate e quelle in attesa di sincronizzazione
   */
  public async getCounts(): Promise<{ activeCount: number; archivedCount: number; pendingSyncCount: number }> {
    const db = await getDatabase();
    const rows = await db.select<{ is_archived: number; sync_status: string; count: number }[]>(
      `SELECT is_archived, sync_status, COUNT(*) as count 
       FROM offers 
       GROUP BY is_archived, sync_status`
    );

    let activeCount = 0;
    let archivedCount = 0;
    let pendingSyncCount = 0;

    for (const r of rows) {
      const c = Number(r.count) || 0;
      if (Number(r.is_archived) === 1) {
        archivedCount += c;
      } else {
        activeCount += c;
      }
      if (r.sync_status === "pending") {
        pendingSyncCount += c;
      }
    }

    return { activeCount, archivedCount, pendingSyncCount };
  }

  /**
   * Crea una nuova offerta/appunto e avvia la sincronizzazione automatica in background
   */
  public async createOffer(params: {
    offer_date: string;
    requester: string;
    contact?: string;
    items_text: string;
    status?: OfferStatus;
    is_urgent?: boolean;
    created_by?: string;
  }): Promise<OfferRecord> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();
    const id = crypto.randomUUID();
    const status: OfferStatus = params.status || "Da preparare";
    const contact = params.contact ? params.contact.trim() : null;
    const requester = params.requester.trim();
    const items_text = params.items_text.trim();
    const is_urgent = params.is_urgent ? 1 : 0;
    const created_by = params.created_by || "Operatore";
    const updated_by = created_by;

    await db.execute(
      `INSERT INTO offers (
        id, supabase_id, offer_date, requester, contact, items_text, status, is_urgent, is_archived, created_by, updated_by, created_at, updated_at, sync_status
      ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11, 'pending')`,
      [id, params.offer_date, requester, contact, items_text, status, is_urgent, created_by, updated_by, nowIso, nowIso]
    );

    const created: OfferRecord = {
      id,
      supabase_id: null,
      offer_date: params.offer_date,
      requester,
      contact,
      items_text,
      status,
      is_urgent,
      is_archived: 0,
      created_by,
      updated_by,
      created_at: nowIso,
      updated_at: nowIso,
      sync_status: "pending",
    };

    // Sincronizza immediatamente
    void offersSyncService.sync().catch(() => {});

    return created;
  }

  /**
   * Modifica dati di un'offerta esistente
   */
  public async updateOffer(
    id: string,
    updates: Partial<Pick<OfferRecord, "offer_date" | "requester" | "contact" | "items_text" | "status" | "is_urgent" | "updated_by">>
  ): Promise<void> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();

    const existing = await db.select<OfferRecord[]>(`SELECT * FROM offers WHERE id = $1 LIMIT 1`, [id]);
    if (existing.length === 0) return;
    const cur = existing[0];

    const offer_date = updates.offer_date ?? cur.offer_date;
    const requester = updates.requester !== undefined ? updates.requester.trim() : cur.requester;
    const contact = updates.contact !== undefined ? (updates.contact ? updates.contact.trim() : null) : cur.contact;
    const items_text = updates.items_text !== undefined ? updates.items_text.trim() : cur.items_text;
    const status = updates.status ?? cur.status;
    const is_urgent = updates.is_urgent !== undefined ? (updates.is_urgent ? 1 : 0) : cur.is_urgent;
    const updated_by = updates.updated_by || "Operatore";

    await db.execute(
      `UPDATE offers SET 
        offer_date = $1,
        requester = $2,
        contact = $3,
        items_text = $4,
        status = $5,
        is_urgent = $6,
        updated_by = $7,
        updated_at = $8,
        sync_status = 'pending'
       WHERE id = $9`,
      [offer_date, requester, contact, items_text, status, is_urgent, updated_by, nowIso, id]
    );

    // Sincronizza immediatamente
    void offersSyncService.sync().catch(() => {});
  }

  /**
   * Aggiorna al volo lo stato di un'offerta (ad es. da popup/selettore nella tabella)
   */
  public async updateStatus(id: string, status: OfferStatus, updated_by?: string): Promise<void> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();
    const user = updated_by || "Operatore";

    await db.execute(
      `UPDATE offers SET 
        status = $1,
        updated_by = $2,
        updated_at = $3,
        sync_status = 'pending'
       WHERE id = $4`,
      [status, user, nowIso, id]
    );

    void offersSyncService.sync().catch(() => {});
  }

  /**
   * Cambia lo stato urgente (toggle)
   */
  public async toggleUrgent(id: string, is_urgent: boolean, updated_by?: string): Promise<void> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();
    const user = updated_by || "Operatore";

    await db.execute(
      `UPDATE offers SET 
        is_urgent = $1,
        updated_by = $2,
        updated_at = $3,
        sync_status = 'pending'
       WHERE id = $4`,
      [is_urgent ? 1 : 0, user, nowIso, id]
    );

    void offersSyncService.sync().catch(() => {});
  }

  /**
   * Sposta un'offerta tra Attive e Archiviate
   */
  public async toggleArchive(id: string, isArchived: boolean, updated_by?: string): Promise<void> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();
    const user = updated_by || "Operatore";

    await db.execute(
      `UPDATE offers SET 
        is_archived = $1,
        updated_by = $2,
        updated_at = $3,
        sync_status = 'pending'
       WHERE id = $4`,
      [isArchived ? 1 : 0, user, nowIso, id]
    );

    void offersSyncService.sync().catch(() => {});
  }

  /**
   * Sposta un'offerta nel Cestino (massimo 10 elementi FIFO)
   */
  public async moveToTrash(id: string, deletedBy?: string): Promise<void> {
    const db = await getDatabase();
    const rows = await db.select<OfferRecord[]>(`SELECT * FROM offers WHERE id = $1 LIMIT 1`, [id]);
    if (!rows || rows.length === 0) return;

    const offer = rows[0];
    const nowIso = new Date().toISOString();
    const user = deletedBy || "Operatore";

    // 1. Inserisci o aggiorna nel cestino
    await db.execute(
      `INSERT INTO offers_trash (
        id, supabase_id, offer_date, requester, contact, items_text, status, is_urgent, is_archived, created_by, updated_by, created_at, updated_at, deleted_at, deleted_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT(id) DO UPDATE SET
        deleted_at = excluded.deleted_at,
        deleted_by = excluded.deleted_by`,
      [
        offer.id,
        offer.supabase_id ?? null,
        offer.offer_date,
        offer.requester,
        offer.contact || "",
        offer.items_text,
        offer.status,
        offer.is_urgent,
        offer.is_archived,
        offer.created_by || user,
        offer.updated_by || user,
        offer.created_at,
        offer.updated_at,
        nowIso,
        user,
      ]
    );

    // 2. Rimuovi dalla tabella principale
    await db.execute(`DELETE FROM offers WHERE id = $1`, [id]);

    // 3. Tronca il cestino mantenendo rigorosamente le ultime 10 offerte (FIFO)
    await db.execute(`
      DELETE FROM offers_trash 
      WHERE id NOT IN (
        SELECT id FROM offers_trash 
        ORDER BY deleted_at DESC 
        LIMIT 10
      );
    `);

    // 4. Rimuovi da Supabase se presente
    if (offer.supabase_id) {
      void offersSyncService.deleteRemoteOffer(offer.supabase_id).catch(() => {});
    }
  }

  /**
   * Restituisce le offerte nel cestino ordinate per data eliminazione (max 10)
   */
  public async getTrashOffers(): Promise<TrashOfferRow[]> {
    const db = await getDatabase();
    return await db.select<TrashOfferRow[]>(
      `SELECT * FROM offers_trash ORDER BY deleted_at DESC LIMIT 10`
    );
  }

  /**
   * Conteggio offerte nel cestino
   */
  public async getTrashCount(): Promise<number> {
    const db = await getDatabase();
    const rows = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM offers_trash`
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * Ripristina un'offerta dal Cestino alla lista attiva
   */
  public async restoreFromTrash(id: string): Promise<OfferRecord | null> {
    const db = await getDatabase();
    const rows = await db.select<TrashOfferRow[]>(
      `SELECT * FROM offers_trash WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!rows || rows.length === 0) return null;

    const item = rows[0];
    const nowIso = new Date().toISOString();

    // 1. Reinserisci nella tabella attiva con sync_status = 'pending'
    await db.execute(
      `INSERT INTO offers (
        id, supabase_id, offer_date, requester, contact, items_text, status, is_urgent, is_archived, created_by, updated_by, created_at, updated_at, sync_status
      ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
      ON CONFLICT(id) DO UPDATE SET
        offer_date = excluded.offer_date,
        requester = excluded.requester,
        contact = excluded.contact,
        items_text = excluded.items_text,
        status = excluded.status,
        is_urgent = excluded.is_urgent,
        is_archived = excluded.is_archived,
        updated_at = excluded.updated_at,
        sync_status = 'pending'`,
      [
        item.id,
        item.offer_date,
        item.requester,
        item.contact || "",
        item.items_text,
        item.status,
        item.is_urgent,
        item.is_archived,
        item.created_by,
        item.updated_by,
        item.created_at,
        nowIso,
      ]
    );

    // 2. Rimuovi dal cestino
    await db.execute(`DELETE FROM offers_trash WHERE id = $1`, [id]);

    // 3. Sincronizza su Supabase
    void offersSyncService.sync().catch(() => {});

    return {
      id: item.id,
      supabase_id: null,
      offer_date: item.offer_date,
      requester: item.requester,
      contact: item.contact,
      items_text: item.items_text,
      status: item.status,
      is_urgent: item.is_urgent,
      is_archived: item.is_archived,
      created_by: item.created_by,
      updated_by: item.updated_by,
      created_at: item.created_at,
      updated_at: nowIso,
      sync_status: "pending",
    };
  }

  /**
   * Elimina un'offerta localmente e da Supabase
   */
  public async deleteOffer(id: string): Promise<void> {
    const db = await getDatabase();
    const existing = await db.select<OfferRecord[]>(`SELECT supabase_id FROM offers WHERE id = $1 LIMIT 1`, [id]);
    const supabaseId = existing[0]?.supabase_id;

    await db.execute(`DELETE FROM offers WHERE id = $1`, [id]);
    await db.execute(`DELETE FROM offers_trash WHERE id = $1`, [id]);

    if (supabaseId) {
      void offersSyncService.deleteRemoteOffer(supabaseId).catch(() => {});
    }
  }
}

export const offersRepository = new OffersRepository();


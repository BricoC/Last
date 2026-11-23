import { parseDdtQuantity } from "../utils/ddtQuantity";
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { applyLocalDatabaseBatch } from "@/shared/data-layer/localDatabaseBatch";
import { resolveActiveSupabaseProjectUrl } from "@/shared/services/supabaseConfigCache";
import { MonetaryValue, money, safeMoney, isPositivePrice } from "@/shared/domain/monetaryValue";
import { DdtItem, DdtDocument, DdtArchiveEntry } from "../models/ddt";
import { calculateDdtTotals, calculateRowAmounts } from "../utils/ddtCalculations";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { ddtCloudPushService } from "./ddtCloudPushService";
import { buildDdtSavePayloadFromImported } from "./ddtImportNormalization";

function notifyDdtUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ddt-data-updated"));
  }
}

export interface PurchasePriceHistoryEntry {
  purchasePriceSubunits: number;
  ddtId: string;
  docNumber: number | null;
  series: string;
  year: number;
  docDate: string;
}

export class DdtRepository {
  /**
   * Recupera la lista dei DDT recenti filtrata per anno e ricerca facoltativa
   */
  public async getRecentDdts(year?: number | null, search = ""): Promise<DdtArchiveEntry[]> {
    const db = await getDatabase();
    let query = `
      SELECT * FROM ddt_documents 
      WHERE deleted_at IS NULL
    `;
    const params: (string | number)[] = [];

    if (year) {
      params.push(year);
      query += ` AND year = $${params.length}`;
    }

    const searchFields = ["client_name", "CAST(doc_number AS TEXT)"];
    for (const token of tokenizeSearch(search)) {
      params.push(`%${token}%`);
      const pIdx = params.length;
      query += ` AND (${searchFields.map((field) => `${field} LIKE $${pIdx}`).join(" OR ")})`;
    }

    query += " ORDER BY year DESC, series ASC, CASE WHEN doc_number IS NULL THEN 0 ELSE 1 END DESC, doc_number DESC, doc_date DESC";

    const rows = await db.select<any[]>(query, params);
    if (rows.length === 0) return [];

    let summaryQuery = `
      SELECT ddt_id,
             COUNT(CASE WHEN unit_price_subunits > 0 THEN 1 END) AS billed_rows,
             MIN(CASE WHEN unit_price_subunits > 0 THEN (purchase_price_subunits > 0) ELSE 1 END) AS all_have_cost
      FROM ddt_items
      WHERE deleted_at IS NULL
    `;
    const summaryParams: any[] = [];
    if (year) {
      summaryQuery += ` AND ddt_id IN (SELECT id FROM ddt_documents WHERE deleted_at IS NULL AND year = $1)`;
      summaryParams.push(year);
    } else {
      summaryQuery += ` AND ddt_id IN (SELECT id FROM ddt_documents WHERE deleted_at IS NULL)`;
    }
    summaryQuery += ` GROUP BY ddt_id`;

    const summaryRows = await db.select<Array<{ ddt_id: string; billed_rows: number; all_have_cost: number }>>(
      summaryQuery,
      summaryParams
    );
    const marginState = new Map<string, { billedRows: number; allHaveCost: boolean }>();
    for (const item of summaryRows) {
      marginState.set(String(item.ddt_id), {
        billedRows: Number(item.billed_rows) || 0,
        allHaveCost: Number(item.all_have_cost) === 1,
      });
    }

    return rows.map((row) => {
      const state = marginState.get(String(row.id));
      return {
        ...this.mapRowToDocument(row, []),
        has_complete_margins: Boolean(state && state.billedRows > 0 && state.allHaveCost),
      };
    });
  }

  /**
   * Recupera gli anni distinti presenti nei DDT per popolare i selettori
   */
  public async getAvailableYears(): Promise<number[]> {
    const currentYear = new Date().getFullYear();
    const fallbackYears = [currentYear, 2026, 2025, 2024, 2023];
    try {
      const db = await getDatabase();
      const rows = await db.select<{ year: number }[]>(
        "SELECT DISTINCT year FROM ddt_documents WHERE deleted_at IS NULL AND year IS NOT NULL ORDER BY year DESC"
      );
      const dbYears = rows.map((r) => Number(r.year)).filter((y) => !isNaN(y) && y > 0);
      const yearsSet = new Set<number>([...fallbackYears, ...dbYears]);
      return Array.from(yearsSet).sort((a, b) => b - a);
    } catch (e) {
      console.warn("Errore recupero anni DDT disponibili:", e);
      return Array.from(new Set(fallbackYears)).sort((a, b) => b - a);
    }
  }

  /**
   * Recupera un DDT completo di tutte le sue righe per ID
   */
  public async getDdtById(id: string): Promise<DdtDocument | null> {
    const db = await getDatabase();
    const [docRows, itemRows] = await Promise.all([
      db.select<any[]>(
        "SELECT * FROM ddt_documents WHERE id = $1 AND deleted_at IS NULL",
        [id]
      ),
      db.select<any[]>(
        "SELECT * FROM ddt_items WHERE ddt_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC",
        [id]
      ),
    ]);

    if (docRows.length === 0) return null;

    const row = docRows[0];
    if ((!row.client_address || !row.client_city) && row.client_name) {
      try {
        const clientRows = await db.select<any[]>(
          "SELECT * FROM clients WHERE LOWER(TRIM(business_name)) = LOWER(TRIM($1)) AND deleted_at IS NULL LIMIT 1",
          [row.client_name]
        );
        if (clientRows.length > 0) {
          const c = clientRows[0];
          row.client_id = row.client_id || c.id;
          row.client_address = row.client_address || c.address;
          const fullCity = [c.city, c.province].filter(Boolean).join(" ");
          row.client_city = row.client_city || (fullCity || undefined);
          row.client_vat = row.client_vat || c.vat_number;
          row.client_fiscal_code = row.client_fiscal_code || c.fiscal_code;
          row.client_sdi = row.client_sdi || c.sdi_code;
        }
      } catch (err) {
        console.warn("Auto-enrich client data on getDdtById:", err);
      }
    }

    const items = itemRows.map(this.mapRowToItem);
    return this.mapRowToDocument(row, items);
  }

  /**
   * Arricchisce in massa i dati cliente (sede, città, P.IVA) per tutti i DDT che ne sono sprovvisti
   */
  public async enrichMissingDdtClientData(): Promise<void> {
    const db = await getDatabase();
    await db.execute(`
      UPDATE ddt_documents
      SET 
        client_id = COALESCE(client_id, (SELECT c.id FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL LIMIT 1)),
        client_address = COALESCE(client_address, (SELECT c.address FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL LIMIT 1)),
        client_city = COALESCE(client_city, (SELECT (c.city || CASE WHEN c.province IS NOT NULL AND c.province != '' THEN ' ' || c.province ELSE '' END) FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL LIMIT 1)),
        client_vat = COALESCE(client_vat, (SELECT c.vat_number FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL LIMIT 1)),
        client_fiscal_code = COALESCE(client_fiscal_code, (SELECT c.fiscal_code FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL LIMIT 1)),
        client_sdi = COALESCE(client_sdi, (SELECT c.sdi_code FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL LIMIT 1))
      WHERE (client_address IS NULL OR client_address = '')
        AND client_name IS NOT NULL
        AND EXISTS (SELECT 1 FROM clients c WHERE LOWER(TRIM(c.business_name)) = LOWER(TRIM(ddt_documents.client_name)) AND c.deleted_at IS NULL);
    `);
  }

  /**
   * Salva una Bozza di DDT (senza assegnare numero progressivo definitivo)
   */
  public async saveDraft(ddt: Partial<DdtDocument>, items: Partial<DdtItem>[]): Promise<DdtDocument> {
    return this.saveDocumentInternal(ddt, items, false);
  }

  /**
   * Emette e conferma definitivamente il DDT (assegnazione progressivo atomica anti-conflitto)
   */
  public async emitDdt(ddt: Partial<DdtDocument>, items: Partial<DdtItem>[]): Promise<DdtDocument> {
    return this.saveDocumentInternal(ddt, items, true);
  }

  /**
   * Duplica un DDT esistente creando una nuova Bozza non numerata
   */
  public async duplicateDdt(originalId: string): Promise<DdtDocument> {
    const original = await this.getDdtById(originalId);
    if (!original) throw new Error("DDT di origine non trovato");

    const newId = crypto.randomUUID();
    const now = new Date();
    const todayIso = now.toISOString().split("T")[0];

    const duplicatedDoc: Partial<DdtDocument> = {
      ...original,
      id: newId,
      doc_number: null,
      year: now.getFullYear(),
      doc_date: todayIso,
      status: "bozza",
    };

    const duplicatedItems: Partial<DdtItem>[] = original.items.map((it, idx) => ({
      ...it,
      id: crypto.randomUUID(),
      ddt_id: newId,
      row_index: idx + 1,
    }));

    return this.saveDraft(duplicatedDoc, duplicatedItems);
  }

  /**
   * Soft delete di un DDT (sposta nel Cestino a 15 elementi FIFO)
   */
  public async deleteDdt(id: string): Promise<void> {
    const db = await getDatabase();
    const existing = await db.select<{ doc_number: number | null; status: string }[]>(
      "SELECT doc_number, status FROM ddt_documents WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
      [id]
    );
    const shouldDeleteRemote = Boolean(
      existing[0] && existing[0].doc_number !== null && existing[0].status !== "bozza"
    );

    if (shouldDeleteRemote) {
      ddtCloudPushService.markRecentlyDeleted(id);
    }

    await invoke("soft_delete_ddt_transaction", {
      id,
      deletedAt: new Date().toISOString(),
    });
    const projectUrl = await resolveActiveSupabaseProjectUrl();
    if (projectUrl) {
      await db.execute(
        `UPDATE ddt_documents
         SET project_url = CASE
           WHEN project_url IS NOT NULL THEN project_url
           WHEN doc_number IS NULL OR status = 'bozza' THEN $1
           ELSE NULL END
         WHERE id = $2`,
        [projectUrl, id]
      );
    }
    // Tronca il cestino mantenendo rigorosamente le ultime 15 voci (FIFO)
    await this.pruneTrash();

    notifyDdtUpdated();
    if (shouldDeleteRemote) {
      await ddtCloudPushService.deleteRemoteDdt(id).catch(() => {});
    }
  }

  /**
   * Recupera il conteggio dei DDT ed elementi nel Cestino
   */
  public async getTrashCount(): Promise<number> {
    try {
      const db = await getDatabase();
      const rows = await db.select<{ count: number }[]>(
        "SELECT COUNT(*) as count FROM ddt_documents WHERE deleted_at IS NOT NULL"
      );
      return rows[0]?.count ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Recupera le ultime 15 voci nel Cestino DDT ordinate per data di eliminazione decrescente
   */
  public async getTrashDdts(): Promise<Array<{
    id: string;
    doc_number: number | null;
    series: string;
    year: number;
    doc_date: string;
    status: string;
    client_name: string;
    total_document_subunits: number;
    deleted_at: string;
    items_count: number;
  }>> {
    const db = await getDatabase();
    const rows = await db.select<any[]>(`
      SELECT d.id, d.doc_number, d.series, d.year, d.doc_date, d.status,
             d.client_name, d.total_document_subunits, d.deleted_at,
             COALESCE((SELECT COUNT(*) FROM ddt_items i WHERE i.ddt_id = d.id), 0) as items_count
      FROM ddt_documents d
      WHERE d.deleted_at IS NOT NULL
      ORDER BY d.deleted_at DESC
      LIMIT 15
    `);
    return rows;
  }

  /**
   * Mantiene al massimo 15 elementi nel Cestino, eliminando definitivamente le voci eccedenti
   */
  public async pruneTrash(): Promise<void> {
    try {
      const db = await getDatabase();
      const rows = await db.select<{ id: string }[]>(
        "SELECT id FROM ddt_documents WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT -1 OFFSET 15"
      );
      for (const row of rows) {
        await db.execute("DELETE FROM ddt_items WHERE ddt_id = $1", [row.id]);
        await db.execute("DELETE FROM ddt_documents WHERE id = $1", [row.id]);
      }
    } catch (err) {
      console.warn("[ddtRepository] Errore pulizia FIFO cestino DDT:", err);
    }
  }

  /**
   * Svuota completamente il Cestino eliminando in modo permanente tutti i record cancellati
   */
  public async emptyTrash(): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "DELETE FROM ddt_items WHERE ddt_id IN (SELECT id FROM ddt_documents WHERE deleted_at IS NOT NULL)"
    );
    await db.execute("DELETE FROM ddt_documents WHERE deleted_at IS NOT NULL");
  }

  /**
   * Ripristina un DDT dal Cestino
   * Se il numero è già occupato da un altro documento attivo, restituisce conflict: true
   * oppure consente il ripristino come Bozza o con nuovo numero.
   */
  public async restoreDdt(
    id: string,
    mode: "original" | "draft" | "new_number" = "original"
  ): Promise<{
    success: boolean;
    conflict?: boolean;
    restoredAs?: "original" | "bozza" | "new_number";
    docNumber?: number | null;
    year?: number;
    error?: string;
  }> {
    const db = await getDatabase();
    const docRows = await db.select<any[]>(
      "SELECT * FROM ddt_documents WHERE id = $1 AND deleted_at IS NOT NULL",
      [id]
    );
    if (docRows.length === 0) {
      return { success: false, error: "DDT non trovato nel Cestino" };
    }
    const doc = docRows[0];
    const now = new Date().toISOString();

    // 1. Ripristino forzato come Bozza
    if (mode === "draft" || doc.doc_number == null || doc.status === "bozza") {
      await applyLocalDatabaseBatch([
        {
          sql: `UPDATE ddt_documents SET doc_number = NULL, status = 'bozza', deleted_at = NULL, updated_at = $1, cloud_restore_requested = 1, sync_status = 'pending' WHERE id = $2 AND deleted_at = $3`,
          params: [now, id, doc.deleted_at],
          expectedRows: 1,
        },
        {
          sql: `UPDATE ddt_items SET deleted_at = NULL, updated_at = $1, sync_status = 'pending' WHERE ddt_id = $2 AND deleted_at = $3`,
          params: [now, id, doc.deleted_at],
        },
      ]);
      return { success: true, restoredAs: "bozza", docNumber: null, year: doc.year };
    }

    // 2. Ripristino forzato con Assegnazione Nuovo Numero
    if (mode === "new_number") {
      const nextNum = await this.getNextDocNumberWithCloud(doc.year);
      await applyLocalDatabaseBatch([
        {
          sql: `UPDATE ddt_documents SET doc_number = $1, status = 'confermato', deleted_at = NULL, updated_at = $2, cloud_restore_requested = 1, sync_status = 'pending' WHERE id = $3 AND deleted_at = $4`,
          params: [nextNum, now, id, doc.deleted_at],
          expectedRows: 1,
        },
        {
          sql: `UPDATE ddt_items SET deleted_at = NULL, updated_at = $1, sync_status = 'pending' WHERE ddt_id = $2 AND deleted_at = $3`,
          params: [now, id, doc.deleted_at],
        },
      ]);
      notifyDdtUpdated();
      void ddtCloudPushService.pushDdtById(id, { reassignNumberOnConflict: true }).catch(() => {});
      return { success: true, restoredAs: "new_number", docNumber: nextNum, year: doc.year };
    }

    // 3. Ripristino con numero originale: verifica assenza di conflitti con DDT attivi (locali e su Supabase)
    const conflictRows = await db.select<any[]>(
      "SELECT id FROM ddt_documents WHERE year = $1 AND doc_number = $2 AND deleted_at IS NULL AND id <> $3",
      [doc.year, doc.doc_number, id]
    );
    const cloudTaken =
      conflictRows.length === 0
        ? await ddtCloudPushService.isNumberTakenOnCloud(doc.year, doc.doc_number, id)
        : false;
    if (conflictRows.length > 0 || cloudTaken) {
      return {
        success: false,
        conflict: true,
        docNumber: doc.doc_number,
        year: doc.year,
      };
    }

    // Numero originale libero: ripristina normalmente
    await applyLocalDatabaseBatch([
      {
        sql: `UPDATE ddt_documents SET deleted_at = NULL, updated_at = $1, cloud_restore_requested = 1, sync_status = 'pending' WHERE id = $2 AND deleted_at = $3`,
        params: [now, id, doc.deleted_at],
        expectedRows: 1,
      },
      {
        sql: `UPDATE ddt_items SET deleted_at = NULL, updated_at = $1, sync_status = 'pending' WHERE ddt_id = $2 AND deleted_at = $3`,
        params: [now, id, doc.deleted_at],
      },
    ]);
    notifyDdtUpdated();
    void ddtCloudPushService.pushDdtById(id, { reassignNumberOnConflict: false }).catch(() => {});
    return { success: true, restoredAs: "original", docNumber: doc.doc_number, year: doc.year };
  }

  /**
   * Risoluzione conflitto di importazione: sostituisce il DDT locale con quello importato.
   * Il DDT locale precedente viene spostato nel Cestino (così non va mai perso).
   */
  public async replaceLocalDdtWithImported(
    localId: string,
    importedHeader: any,
    importedLines: any[]
  ): Promise<void> {
    await getDatabase();
    const payload = buildDdtSavePayloadFromImported(importedHeader, importedLines);
    await invoke("replace_ddt_transaction", {
      localId,
      deletedAt: new Date().toISOString(),
      payload,
    });
    await this.pruneTrash().catch((error) => console.warn("[DDT] Pulizia cestino:", error));
    notifyDdtUpdated();
  }

  /**
   * Verifica la continuità della numerazione annuale (1 .. MAX(doc_number)) nel DB locale.
   */
  public async getMissingDocNumbers(year: number): Promise<{
    missing: number[];
    maxNumber: number;
    totalCount: number;
  }> {
    const db = await getDatabase();
    const rows = await db.select<{ doc_number: number }[]>(
      `SELECT DISTINCT doc_number
       FROM ddt_documents
       WHERE year = $1 AND deleted_at IS NULL AND doc_number IS NOT NULL
       ORDER BY doc_number ASC`,
      [year]
    );
    if (rows.length === 0) {
      return { missing: [], maxNumber: 0, totalCount: 0 };
    }
    const existing = new Set(rows.map((r) => Number(r.doc_number)).filter((n) => n > 0));
    let maxNumber = 0;
    for (const n of existing) {
      if (n > maxNumber) maxNumber = n;
    }
    const missing: number[] = [];
    for (let n = 1; n <= maxNumber; n++) {
      if (!existing.has(n)) missing.push(n);
    }
    return { missing, maxNumber, totalCount: existing.size };
  }

  /**
   * Crea un DDT segnaposto (annullato) per colmare un numero saltato in archivio.
   */
  public async createPlaceholderDdt(year: number, docNumber: number): Promise<DdtDocument> {
    const todayIso = new Date().toISOString().split("T")[0];
    return this.saveDocumentInternal(
      {
        doc_number: docNumber,
        year,
        series: "",
        doc_date: todayIso,
        status: "annullato",
        client_name: "DDT ANNULLATO (PLACEHOLDER)",
      },
      [],
      false
    );
  }

  /**
   * Calcola il prossimo numero annuale nel database locale, condiviso tra le serie.
   */
  public async getNextDocNumber(year: number): Promise<number> {
    const db = await getDatabase();
    const rows = await db.select<{ next_num: number }[]>(
      `SELECT COALESCE(MAX(doc_number), 0) + 1 as next_num
       FROM ddt_documents
       WHERE year = $1 AND deleted_at IS NULL`,
      [year]
    );
    return rows[0]?.next_num ?? 1;
  }

  /**
   * Calcola il prossimo numero progressivo considerando sia il DB locale sia Supabase (per evitare collisioni multi-PC)
   */
  public async getNextDocNumberWithCloud(year: number): Promise<number> {
    const localNext = await this.getNextDocNumber(year);
    const remoteMax = await ddtCloudPushService.getRemoteMaxDocNumber(year);
    return Math.max(localNext, remoteMax + 1);
  }

  private async saveDocumentInternal(
    ddt: Partial<DdtDocument>,
    items: Partial<DdtItem>[],
    isEmission: boolean
  ): Promise<DdtDocument> {
    const docId = ddt.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const year = ddt.year || new Date().getFullYear();
    const series = ddt.series?.trim() || "";

    let docNumber = ddt.doc_number ?? null;
    let status = ddt.status || "bozza";
    const isNewEmission = isEmission && status !== "confermato" && status !== "annullato";

    if (isEmission) {
      status = "confermato";
      if (isNewEmission) {
        if (docNumber === null) {
          docNumber = await this.getNextDocNumberWithCloud(year);
        } else {
          const db = await getDatabase();
          const localTakenRows = await db.select<{ id: string }[]>(
            `SELECT id FROM ddt_documents WHERE year = $1 AND doc_number = $2 AND deleted_at IS NULL AND id <> $3 LIMIT 1`,
            [year, docNumber, docId]
          );
          const localTaken = localTakenRows.length > 0;
          const cloudTaken = localTaken ? true : await ddtCloudPushService.isNumberTakenOnCloud(year, docNumber, docId);
          if (localTaken || cloudTaken) {
            docNumber = await this.getNextDocNumberWithCloud(year);
          }
        }
      }
    } else if (status === "bozza") {
      // Le bozze non occupano un numero DDT ufficiale in archivio/sync
      docNumber = null;
    }

    const totals = calculateDdtTotals(items);
    const validItems = items.filter(
      (it) =>
        Boolean(it.description?.trim().length) ||
        isPositivePrice(it.unit_price) ||
        Boolean(it.purchase_price && isPositivePrice(it.purchase_price)) ||
        Boolean(it.code?.trim()) ||
        Boolean(it.unit?.trim()) ||
        Boolean(it.quantity !== undefined && it.quantity !== null && String(it.quantity).trim() !== "")
    );
    const itemPayloads = validItems.map((it, index) => {
      const isNote = it.row_kind === "note" || (
        it.row_kind !== "item" &&
        Boolean(it.description?.trim()) &&
        !isPositivePrice(it.unit_price) &&
        (!it.purchase_price || !isPositivePrice(it.purchase_price)) &&
        (!it.code || !it.code.trim()) &&
        (!it.unit || !String(it.unit).trim()) &&
        !parseDdtQuantity(it.quantity)
      );
      const p = isNote ? money(0) : safeMoney(it.unit_price);
      const hasExplicitQty =
        it.quantity !== undefined && it.quantity !== null && String(it.quantity).trim() !== "";
      const q = isNote ? "" : (hasExplicitQty ? String(it.quantity).trim() : "1");
      const hasExplicitDisc =
        it.discount_pct !== undefined && it.discount_pct !== null && String(it.discount_pct).trim() !== "";
      const disc = isNote ? "" : (hasExplicitDisc ? String(it.discount_pct).trim() : "0");
      const vatR = !isNote && it.vat_rate !== undefined && it.vat_rate !== null && String(it.vat_rate).trim() !== ""
        ? parseFloat(String(it.vat_rate).replace(",", "."))
        : 0;

      const { netAmount: net, vatAmount: vatA } = isNote
        ? { netAmount: money(0), vatAmount: money(0) }
        : calculateRowAmounts(q, p, disc, vatR);
      const hasInvalidId =
        !it.id ||
        it.id.startsWith("empty-row-") ||
        it.id.startsWith("row-") ||
        it.id.includes("-blank-");
      return {
        id: hasInvalidId ? crypto.randomUUID() : it.id,
        row_index: it.row_index && it.row_index > 0 ? it.row_index : index + 1,
        row_kind: isNote ? "note" : "item",
        product_id: it.product_id || null,
        code: it.code || null,
        description: (it.description || "").trim(),
        unit: isNote ? "" : it.unit || "NR",
        quantity: String(q),
        unit_price_subunits: p.toSubunits(),
        discount_pct: String(disc),
        net_amount_subunits: net.toSubunits(),
        vat_rate: vatR,
        vat_amount_subunits: vatA.toSubunits(),
        purchase_price_subunits: it.purchase_price ? it.purchase_price.toSubunits() : 0,
      };
    });

    const payload = {
      id: docId,
      doc_number: docNumber,
      year,
      series,
      doc_date: ddt.doc_date || now.split("T")[0],
      status,
      is_emission: isEmission,
      updated_at: now,
      updated_by: "system",
      client_id: ddt.client_id || null,
      client_name: (ddt.client_name || "").trim() || "Cliente",
      client_address: ddt.client_address || null,
      client_city: ddt.client_city || null,
      client_vat: ddt.client_vat || null,
      client_fiscal_code: ddt.client_fiscal_code || null,
      client_sdi: ddt.client_sdi || null,
      client_phones_json: JSON.stringify(ddt.client_phones || []),
      destination_name: ddt.destination_name || null,
      destination_address: ddt.destination_address || null,
      destination_city: ddt.destination_city || null,
      transport_reason: ddt.transport_reason || "Vendita",
      payment_method: ddt.payment_method || null,
      order_reference: ddt.order_reference || null,
      account_or_balance: ddt.account_or_balance || "",
      operator: ddt.operator || null,
      goods_appearance: ddt.goods_appearance || null,
      carriage_terms: ddt.carriage_terms || "Franco stabilimento",
      packages_count: ddt.packages_count || null,
      weight_kg: ddt.weight_kg || null,
      carrier: ddt.carrier || null,
      pickup_date_time: ddt.pickup_date_time || null,
      internal_notes: ddt.internal_notes || null,
      total_taxable_subunits: totals.totale_imponibile.toSubunits(),
      total_vat_subunits: totals.totale_iva.toSubunits(),
      total_document_subunits: totals.totale_documento.toSubunits(),
      items: itemPayloads,
    };

    const activeProjectUrl = await resolveActiveSupabaseProjectUrl();

    await invoke("save_ddt_transaction", { payload });
    if (activeProjectUrl) {
      const db = await getDatabase();
      await db.execute(
        "UPDATE ddt_documents SET project_url = COALESCE(project_url, $1) WHERE id = $2",
        [activeProjectUrl, docId]
      );
    }

    // Se è un DDT confermato/emesso, sincronizza subito su Supabase (con riallineamento numero su collisione in prima emissione)
    let cloudPushError: string | undefined;
    if (status !== "bozza" && docNumber !== null) {
      if (isEmission) {
        const pushResult = await ddtCloudPushService.pushDdtById(docId, {
          reassignNumberOnConflict: isNewEmission,
        });
        if (!pushResult.success) {
          cloudPushError = pushResult.error || "Sincronizzazione cloud non riuscita";
        }
      } else {
        void ddtCloudPushService.pushDdtById(docId, { reassignNumberOnConflict: false }).catch(() => {});
      }
    }

    notifyDdtUpdated();

    const saved = await this.getDdtById(docId);
    if (!saved) throw new Error("Errore durante il salvataggio del DDT");
    if (cloudPushError) {
      return Object.assign(saved, { _cloudPushError: cloudPushError });
    }
    return saved;
  }

  private mapRowToDocument(row: any, items: DdtItem[]): DdtDocument {
    let phones: any[] = [];
    try {
      if (row.client_phones_json) {
        phones = JSON.parse(row.client_phones_json);
      }
    } catch {
      phones = [];
    }

    return {
      id: row.id,
      doc_number: row.doc_number ?? null,
      series: row.series || "",
      year: row.year,
      doc_date: row.doc_date,
      status: row.status,
      client_id: row.client_id || undefined,
      client_name: row.client_name,
      client_address: row.client_address || undefined,
      client_city: row.client_city || undefined,
      client_vat: row.client_vat || undefined,
      client_fiscal_code: row.client_fiscal_code || undefined,
      client_sdi: row.client_sdi || undefined,
      client_phones: phones,
      destination_name: row.destination_name || undefined,
      destination_address: row.destination_address || undefined,
      destination_city: row.destination_city || undefined,
      transport_reason: row.transport_reason || "Vendita",
      payment_method: row.payment_method || undefined,
      order_reference: row.order_reference || undefined,
      account_or_balance: row.account_or_balance || "",
      operator: row.operator || "",
      goods_appearance: row.goods_appearance || undefined,
      carriage_terms: row.carriage_terms || "Franco stabilimento",
      packages_count: row.packages_count || undefined,
      weight_kg: row.weight_kg || undefined,
      carrier: row.carrier || undefined,
      pickup_date_time: row.pickup_date_time || undefined,
      internal_notes: row.internal_notes || undefined,
      total_taxable: MonetaryValue.fromSubunits(row.total_taxable_subunits || 0),
      total_vat: MonetaryValue.fromSubunits(row.total_vat_subunits || 0),
      total_document: MonetaryValue.fromSubunits(row.total_document_subunits || 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      deleted_at: row.deleted_at || undefined,
      sync_status: row.sync_status,
      project_url: row.project_url ?? null,
      items,
    };
  }

  private mapRowToItem(row: any): DdtItem {
    const isNote =
      row.row_kind === "note" ||
      (row.row_kind !== "item" &&
        Boolean(row.description?.trim()) &&
        (row.unit_price_subunits ?? 0) === 0 &&
        (row.net_amount_subunits ?? 0) === 0 &&
        (!row.purchase_price_subunits || row.purchase_price_subunits === 0) &&
        (!row.code || !String(row.code).trim()) &&
        !parseDdtQuantity(row.quantity) &&
        (!row.unit || !String(row.unit).trim()));
    return {
      id: row.id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      deleted_at: row.deleted_at ?? null,
      sync_status: row.sync_status,
      ddt_id: row.ddt_id,
      row_index: row.row_index,
      product_id: row.product_id || undefined,
      code: row.code || undefined,
      description: row.description,
      row_kind: isNote ? "note" : "item",
      unit: isNote ? "" : row.unit || "NR",
      quantity: isNote ? "" : String(row.quantity ?? "1"),
      unit_price: MonetaryValue.fromSubunits(row.unit_price_subunits || 0),
      discount_pct: isNote ? "" : String(row.discount_pct ?? "0"),
      net_amount: MonetaryValue.fromSubunits(row.net_amount_subunits || 0),
      vat_rate:
        isNote || row.vat_rate === null || row.vat_rate === undefined || Number(row.vat_rate) === 0
          ? ""
          : row.vat_rate,
      vat_amount: MonetaryValue.fromSubunits(row.vat_amount_subunits || 0),
      purchase_price: row.purchase_price_subunits
        ? MonetaryValue.fromSubunits(row.purchase_price_subunits)
        : undefined,
    };
  }

  /**
   * Restituisce l'ultimo prezzo di acquisto (> 0) praticato allo stesso cliente
   * per ciascuna descrizione normalizzata (TRIM + UPPER), ordinato dal DDT più recente.
   */
  public async getLatestPurchasePriceDetailsForClient(options: {
    clientId?: string | null;
    clientName?: string | null;
    descriptions: string[];
    excludeDdtId?: string | null;
  }): Promise<Map<string, PurchasePriceHistoryEntry>> {
    const targetDescs = new Set(
      options.descriptions.map((d) => d.trim().toUpperCase()).filter(Boolean)
    );
    const clientId = (options.clientId || "").trim();
    const clientNameNorm = (options.clientName || "").trim().toLowerCase();
    const excludeId = (options.excludeDdtId || "").trim();
    const result = new Map<string, PurchasePriceHistoryEntry>();

    if (targetDescs.size === 0 || (!clientId && !clientNameNorm)) {
      return result;
    }

    const db = await getDatabase();
    const rows = await db.select<
      Array<{
        norm_desc: string;
        purchase_price_subunits: number;
        ddt_id: string;
        doc_number: number | null;
        series: string | null;
        year: number;
        doc_date: string;
      }>
    >(
      `SELECT
         TRIM(UPPER(i.description)) AS norm_desc,
         i.purchase_price_subunits,
         d.id AS ddt_id,
         d.doc_number,
         d.series,
         d.year,
         d.doc_date
       FROM ddt_items i
       INNER JOIN ddt_documents d ON d.id = i.ddt_id
       WHERE d.deleted_at IS NULL
         AND d.status <> 'bozza'
         AND i.deleted_at IS NULL
         AND i.purchase_price_subunits > 0
         AND TRIM(COALESCE(i.description, '')) <> ''
         AND ($1 = '' OR d.id <> $1)
         AND (
           ($2 <> '' AND d.client_id = $2)
           OR ($3 <> '' AND LOWER(TRIM(d.client_name)) = $3)
         )
       ORDER BY d.doc_date DESC, d.year DESC, COALESCE(d.doc_number, 0) DESC, i.row_index ASC`,
      [excludeId, clientId, clientNameNorm]
    );

    for (const row of rows) {
      if (!row.norm_desc || !targetDescs.has(row.norm_desc)) continue;
      if (!result.has(row.norm_desc) && Number(row.purchase_price_subunits) > 0) {
        result.set(row.norm_desc, {
          purchasePriceSubunits: Number(row.purchase_price_subunits),
          ddtId: row.ddt_id,
          docNumber: row.doc_number !== null && row.doc_number !== undefined ? Number(row.doc_number) : null,
          series: row.series || "",
          year: Number(row.year),
          docDate: row.doc_date || "",
        });
        if (result.size === targetDescs.size) break;
      }
    }

    return result;
  }

  public async getLatestPurchasePricesForClient(options: {
    clientId?: string | null;
    clientName?: string | null;
    descriptions: string[];
    excludeDdtId?: string | null;
  }): Promise<Map<string, number>> {
    const details = await this.getLatestPurchasePriceDetailsForClient(options);
    const result = new Map<string, number>();
    for (const [desc, entry] of details.entries()) {
      result.set(desc, entry.purchasePriceSubunits);
    }
    return result;
  }
}

export const ddtRepository = new DdtRepository();

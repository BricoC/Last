import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { MonetaryValue, money, safeMoney, isPositivePrice } from "@/shared/domain/monetaryValue";
import { DdtItem, DdtDocument, DdtArchiveEntry } from "../models/ddt";
import { calculateDdtTotals } from "../utils/ddtCalculations";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";

export class DdtRepository {
  /**
   * Recupera la lista dei DDT recenti filtrata per anno e ricerca facoltativa
   */
  public async getRecentDdts(year?: number, search = ""): Promise<DdtArchiveEntry[]> {
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

    query += " ORDER BY year DESC, series ASC, CASE WHEN doc_number IS NULL THEN 0 ELSE 1 END DESC, doc_number DESC, doc_date DESC LIMIT 150";

    const rows = await db.select<any[]>(query, params);
    if (rows.length === 0) return [];

    const ids = rows.map((row) => String(row.id));
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
    const summaryRows = await db.select<Array<{ ddt_id: string; billed_rows: number; all_have_cost: number }>>(
      `SELECT ddt_id,
              COUNT(CASE WHEN unit_price_subunits > 0 THEN 1 END) AS billed_rows,
              MIN(CASE WHEN unit_price_subunits > 0 THEN (purchase_price_subunits > 0) ELSE 1 END) AS all_have_cost
       FROM ddt_items
       WHERE deleted_at IS NULL AND ddt_id IN (${placeholders})
       GROUP BY ddt_id`,
      ids
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
   * Soft delete di un DDT
   */
  public async deleteDdt(id: string): Promise<void> {
    await invoke("soft_delete_ddt_transaction", {
      id,
      deletedAt: new Date().toISOString(),
    });
  }

  /**
   * Calcola il prossimo numero progressivo disponibile per l'anno e serie specificati
   */
  public async getNextDocNumber(year: number, series = ""): Promise<number> {
    const db = await getDatabase();
    const rows = await db.select<{ next_num: number }[]>(
      `SELECT COALESCE(MAX(doc_number), 0) + 1 as next_num 
       FROM ddt_documents 
       WHERE year = $1 AND series = $2 AND deleted_at IS NULL`,
      [year, series]
    );
    return rows[0]?.next_num ?? 1;
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

    const docNumber = ddt.doc_number ?? null;
    let status = ddt.status || "bozza";

    if (isEmission) {
      status = "confermato";
    }

    const totals = calculateDdtTotals(items);
    const validItems = items.filter(
      (it) => it.description?.trim().length || isPositivePrice(it.unit_price)
    );
    const itemPayloads = validItems.map((it, index) => {
      const isNote = it.row_kind === "note";
      const p = isNote ? money(0) : safeMoney(it.unit_price);
      const q = isNote ? "" : it.quantity || "1";
      const disc = isNote ? "" : it.discount_pct || "0";
      const vatR = !isNote && it.vat_rate !== undefined && it.vat_rate !== null && String(it.vat_rate).trim() !== ""
        ? parseFloat(String(it.vat_rate).replace(",", "."))
        : 0;

      const qNum = parseFloat(String(q).replace(",", ".")) || 1;
      const net = p.times(qNum).applyDiscount(parseFloat(String(disc).replace(",", ".")) || 0);
      const vatA = vatR > 0 ? net.calculateVat(vatR) : money(0);
      return {
        id: it.id || crypto.randomUUID(),
        row_index: index + 1,
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

    await invoke("save_ddt_transaction", { payload });

    const saved = await this.getDdtById(docId);
    if (!saved) throw new Error("Errore durante il salvataggio del DDT");
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
      items,
    };
  }

  private mapRowToItem(row: any): DdtItem {
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
      row_kind: row.row_kind === "note" ? "note" : "item",
      unit: row.row_kind === "note" ? "" : row.unit || "NR",
      quantity: row.row_kind === "note" ? "" : String(row.quantity ?? "1"),
      unit_price: MonetaryValue.fromSubunits(row.unit_price_subunits || 0),
      discount_pct: row.row_kind === "note" ? "" : String(row.discount_pct ?? "0"),
      net_amount: MonetaryValue.fromSubunits(row.net_amount_subunits || 0),
      vat_rate: row.row_kind === "note" ? "" : row.vat_rate !== null && row.vat_rate !== undefined ? row.vat_rate : "",
      vat_amount: MonetaryValue.fromSubunits(row.vat_amount_subunits || 0),
      purchase_price: row.purchase_price_subunits
        ? MonetaryValue.fromSubunits(row.purchase_price_subunits)
        : undefined,
    };
  }
}

export const ddtRepository = new DdtRepository();

import { getDatabase } from "@/shared/data-layer/database";
import { MonetaryValue, money, safeMoney, isPositivePrice } from "@/shared/domain/monetaryValue";
import { DdtItem, DdtDocument } from "../models/ddt";
import { calculateDdtTotals } from "../utils/ddtCalculations";

export class DdtRepository {
  /**
   * Recupera la lista dei DDT recenti filtrata per anno e ricerca facoltativa
   */
  public async getRecentDdts(year?: number, search = ""): Promise<DdtDocument[]> {
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

    if (search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      query += ` AND (
        client_name LIKE $${pIdx} 
        OR CAST(doc_number AS TEXT) LIKE $${pIdx}
        OR destination_name LIKE $${pIdx}
        OR internal_notes LIKE $${pIdx}
      )`;
    }

    query += " ORDER BY year DESC, CASE WHEN doc_number IS NULL THEN 0 ELSE 1 END DESC, doc_number DESC, doc_date DESC LIMIT 150";

    const rows = await db.select<any[]>(query, params);
    return rows.map((r) => this.mapRowToDocument(r, []));
  }

  /**
   * Recupera un DDT completo di tutte le sue righe per ID
   */
  public async getDdtById(id: string): Promise<DdtDocument | null> {
    const db = await getDatabase();
    const docRows = await db.select<any[]>(
      "SELECT * FROM ddt_documents WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );

    if (docRows.length === 0) return null;

    const itemRows = await db.select<any[]>(
      "SELECT * FROM ddt_items WHERE ddt_id = $1 ORDER BY row_index ASC",
      [id]
    );

    const items = itemRows.map(this.mapRowToItem);
    return this.mapRowToDocument(docRows[0], items);
  }

  /**
   * Calcola il prossimo numero progressivo disponibile per l'anno specificato
   */
  public async getNextDocNumber(year: number): Promise<number> {
    const db = await getDatabase();
    const rows = await db.select<{ max_num: number | null }[]>(
      "SELECT MAX(doc_number) as max_num FROM ddt_documents WHERE year = $1 AND deleted_at IS NULL",
      [year]
    );
    const max = rows[0]?.max_num;
    return (max && max > 0 ? max : 0) + 1;
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
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.execute(
      "UPDATE ddt_documents SET deleted_at = $1, sync_status = 'pending' WHERE id = $2",
      [now, id]
    );
  }

  private async saveDocumentInternal(
    ddt: Partial<DdtDocument>,
    items: Partial<DdtItem>[],
    isEmission: boolean
  ): Promise<DdtDocument> {
    const db = await getDatabase();
    const docId = ddt.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const year = ddt.year || new Date().getFullYear();

    let docNumber = ddt.doc_number ?? null;
    let status = ddt.status || "bozza";

    if (isEmission) {
      status = "confermato";
      if (!docNumber) {
        docNumber = await this.getNextDocNumber(year);
      }
    }

    // Calcolo totali esatti a 5 decimali
    const totals = calculateDdtTotals(items);

    // Verifica se documento esiste già
    const existing = await db.select<any[]>(
      "SELECT id FROM ddt_documents WHERE id = $1",
      [docId]
    );

    const phonesJson = JSON.stringify(ddt.client_phones || []);

    if (existing.length > 0) {
      await db.execute(
        `UPDATE ddt_documents SET
          doc_number = $1,
          year = $2,
          doc_date = $3,
          status = $4,
          client_id = $5,
          client_name = $6,
          client_address = $7,
          client_city = $8,
          client_vat = $9,
          client_fiscal_code = $10,
          client_sdi = $11,
          client_phones_json = $12,
          destination_name = $13,
          destination_address = $14,
          destination_city = $15,
          transport_reason = $16,
          payment_method = $17,
          order_reference = $18,
          account_or_balance = $19,
          operator = $20,
          goods_appearance = $21,
          carriage_terms = $22,
          packages_count = $23,
          weight_kg = $24,
          carrier = $25,
          pickup_date_time = $26,
          internal_notes = $27,
          total_taxable_subunits = $28,
          total_vat_subunits = $29,
          total_document_subunits = $30,
          updated_at = $31,
          updated_by = 'system',
          sync_status = 'pending'
        WHERE id = $32`,
        [
          docNumber,
          year,
          ddt.doc_date || now.split("T")[0],
          status,
          ddt.client_id || null,
          (ddt.client_name || "").trim() || "Cliente",
          ddt.client_address || null,
          ddt.client_city || null,
          ddt.client_vat || null,
          ddt.client_fiscal_code || null,
          ddt.client_sdi || null,
          phonesJson,
          ddt.destination_name || null,
          ddt.destination_address || null,
          ddt.destination_city || null,
          ddt.transport_reason || "Vendita",
          ddt.payment_method || null,
          ddt.order_reference || null,
          ddt.account_or_balance || "",
          ddt.operator || null,
          ddt.goods_appearance || null,
          ddt.carriage_terms || "Franco stabilimento",
          ddt.packages_count || null,
          ddt.weight_kg || null,
          ddt.carrier || null,
          ddt.pickup_date_time || null,
          ddt.internal_notes || null,
          totals.totale_imponibile.toSubunits(),
          totals.totale_iva.toSubunits(),
          totals.totale_documento.toSubunits(),
          now,
          docId,
        ]
      );
    } else {
      await db.execute(
        `INSERT INTO ddt_documents (
          id, doc_number, year, doc_date, status,
          client_id, client_name, client_address, client_city, client_vat,
          client_fiscal_code, client_sdi, client_phones_json, destination_name,
          destination_address, destination_city, transport_reason, payment_method,
          order_reference, account_or_balance, operator, goods_appearance,
          carriage_terms, packages_count, weight_kg, carrier, pickup_date_time,
          internal_notes, total_taxable_subunits, total_vat_subunits,
          total_document_subunits, created_at, updated_at, updated_by, sync_status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $32, 'system', 'pending'
        )`,
        [
          docId,
          docNumber,
          year,
          ddt.doc_date || now.split("T")[0],
          status,
          ddt.client_id || null,
          (ddt.client_name || "").trim() || "Cliente",
          ddt.client_address || null,
          ddt.client_city || null,
          ddt.client_vat || null,
          ddt.client_fiscal_code || null,
          ddt.client_sdi || null,
          phonesJson,
          ddt.destination_name || null,
          ddt.destination_address || null,
          ddt.destination_city || null,
          ddt.transport_reason || "Vendita",
          ddt.payment_method || null,
          ddt.order_reference || null,
          ddt.account_or_balance || "",
          ddt.operator || null,
          ddt.goods_appearance || null,
          ddt.carriage_terms || "Franco stabilimento",
          ddt.packages_count || null,
          ddt.weight_kg || null,
          ddt.carrier || null,
          ddt.pickup_date_time || null,
          ddt.internal_notes || null,
          totals.totale_imponibile.toSubunits(),
          totals.totale_iva.toSubunits(),
          totals.totale_documento.toSubunits(),
          now,
        ]
      );
    }

    // Riscrivi le righe del documento
    await db.execute("DELETE FROM ddt_items WHERE ddt_id = $1", [docId]);

    // Inserisci solo righe compilate
    const validItems = items.filter(
      (it) => it.description?.trim().length || isPositivePrice(it.unit_price)
    );

    for (let i = 0; i < validItems.length; i++) {
      const it = validItems[i];
      const p = safeMoney(it.unit_price);
      const q = it.quantity || "1";
      const disc = it.discount_pct || "0";
      const vatR = it.vat_rate !== undefined && it.vat_rate !== null && String(it.vat_rate).trim() !== ""
        ? parseFloat(String(it.vat_rate).replace(",", "."))
        : 0;

      const qNum = parseFloat(String(q).replace(",", ".")) || 1;
      const net = p.times(qNum).applyDiscount(parseFloat(String(disc).replace(",", ".")) || 0);
      const vatA = vatR > 0 ? net.calculateVat(vatR) : money(0);

      await db.execute(
        `INSERT INTO ddt_items (
          id, ddt_id, row_index, product_id, code, description, unit, quantity,
          unit_price_subunits, discount_pct, net_amount_subunits, vat_rate,
          vat_amount_subunits, purchase_price_subunits, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15
        )`,
        [
          it.id || crypto.randomUUID(),
          docId,
          i + 1,
          it.product_id || null,
          it.code || null,
          (it.description || "").trim(),
          it.unit || "NR",
          String(q),
          p.toSubunits(),
          String(disc),
          net.toSubunits(),
          vatR,
          vatA.toSubunits(),
          it.purchase_price ? it.purchase_price.toSubunits() : 0,
          now,
        ]
      );
    }

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
      ddt_id: row.ddt_id,
      row_index: row.row_index,
      product_id: row.product_id || undefined,
      code: row.code || undefined,
      description: row.description,
      unit: row.unit || "NR",
      quantity: String(row.quantity ?? "1"),
      unit_price: MonetaryValue.fromSubunits(row.unit_price_subunits || 0),
      discount_pct: String(row.discount_pct ?? "0"),
      net_amount: MonetaryValue.fromSubunits(row.net_amount_subunits || 0),
      vat_rate: row.vat_rate !== null && row.vat_rate !== undefined ? row.vat_rate : "",
      vat_amount: MonetaryValue.fromSubunits(row.vat_amount_subunits || 0),
      purchase_price: row.purchase_price_subunits
        ? MonetaryValue.fromSubunits(row.purchase_price_subunits)
        : undefined,
    };
  }
}

export const ddtRepository = new DdtRepository();

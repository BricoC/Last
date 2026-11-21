import { parseDdtQuantity } from "../utils/ddtQuantity";
import { getDatabase } from "@/shared/data-layer/database";
import { MonetaryValue } from "@/shared/domain/monetaryValue";
import { DdtDocument, DdtItem } from "../models/ddt";
/**
 * Recupera tutti i documenti DDT completi di righe per il mese e anno specificati
 */
export async function getMonthlyFullDdtDocuments(
  year: number,
  month: number
): Promise<DdtDocument[]> {
  const db = await getDatabase();
  const monthStr = String(month).padStart(2, "0");

  const docRows = await db.select<any[]>(
    `SELECT * FROM ddt_documents
     WHERE deleted_at IS NULL AND doc_number IS NOT NULL AND status <> 'bozza'
       AND year = ? AND doc_date >= ? AND doc_date <= ?
     ORDER BY doc_number ASC`,
    [year, `${year}-${monthStr}-01`, `${year}-${monthStr}-31`]
  );

  if (docRows.length === 0) return [];

  // Query parametrizzata in JOIN per evitare interpolazione stringhe IN (${docIds})
  const itemRows = await db.select<any[]>(
    `SELECT i.* FROM ddt_items i
     JOIN ddt_documents d ON d.id = i.ddt_id
     WHERE i.deleted_at IS NULL
       AND d.deleted_at IS NULL
       AND d.doc_number IS NOT NULL
       AND d.status <> 'bozza'
       AND d.year = ?
       AND d.doc_date >= ?
       AND d.doc_date <= ?
     ORDER BY i.row_index ASC`,
    [year, `${year}-${monthStr}-01`, `${year}-${monthStr}-31`]
  );

  const itemsByDocId = new Map<string, DdtItem[]>();
  for (const row of itemRows) {
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
    const it: DdtItem = {
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
          : String(row.vat_rate),
      vat_amount: MonetaryValue.fromSubunits(row.vat_amount_subunits || 0),
      purchase_price: MonetaryValue.fromSubunits(row.purchase_price_subunits || 0),
    };

    const list = itemsByDocId.get(row.ddt_id) || [];
    list.push(it);
    itemsByDocId.set(row.ddt_id, list);
  }

  return docRows.map((row) => {
    let phones: any[] = [];
    try {
      if (row.client_phones_json) phones = JSON.parse(row.client_phones_json);
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
      total_document: MonetaryValue.fromSubunits(
        row.total_document_subunits ||
          ((row.total_taxable_subunits || 0) + (row.total_vat_subunits || 0))
      ),
      created_at: row.created_at,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      deleted_at: row.deleted_at || undefined,
      sync_status: row.sync_status,
      items: itemsByDocId.get(row.id) || [],
    };
  });
}

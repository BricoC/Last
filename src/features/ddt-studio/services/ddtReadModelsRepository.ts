import { getDatabase } from "@/shared/data-layer/database";

export interface DdtListViewRow {
  id: string; year: number; docNumber: number | null; series: string; date: string;
  client: string; destination: string; status: string; taxableSubunits: number;
  purchaseSubunits: number; revenueSubunits: number; markupPercent: number | null;
  discountPercent: number | null; operator: string; reason: string; orderReference: string;
  payment: string;
}

export interface DdtArticleViewRow {
  id: string; ddtId: string; year: number; docNumber: number | null; series: string;
  date: string; client: string; destination: string; unit: string; quantity: string;
  description: string; unitPriceSubunits: number; discountPercent: string;
  netAmountSubunits: number; vatRate: number; rowKind: string;
}

interface DdtListDbRow {
  id: string; year: number; doc_number: number | null; series: string | null; doc_date: string;
  client_name: string; destination_name: string | null; destination_city: string | null; status: string;
  total_taxable_subunits: number; purchase_subunits: number | string; gross_subunits: number | string;
  net_rows_subunits: number | string; operator: string | null; transport_reason: string | null;
  order_reference: string | null; payment_method: string | null;
}

interface DdtArticleDbRow {
  id: string; ddt_id: string; year: number; doc_number: number | null; series: string | null;
  doc_date: string; client_name: string; destination_name: string | null; destination_city: string | null;
  unit: string | null; quantity: string | null; description: string; unit_price_subunits: number;
  discount_pct: string | null; net_amount_subunits: number; vat_rate: number; row_kind: string | null;
}

const numberValue = (value: number | string | null | undefined) => Number(value ?? 0);

export async function getDdtListViewRows(): Promise<DdtListViewRow[]> {
  const db = await getDatabase();
  const rows = await db.select<DdtListDbRow[]>(`
    SELECT d.id, d.year, d.doc_number, d.series, d.doc_date, d.client_name,
      d.destination_name, d.destination_city, d.status, d.total_taxable_subunits,
      d.operator, d.transport_reason, d.order_reference, d.payment_method,
      COALESCE(SUM(CASE WHEN i.deleted_at IS NULL THEN
        i.purchase_price_subunits * CAST(COALESCE(NULLIF(i.quantity, ''), '0') AS REAL) ELSE 0 END), 0) AS purchase_subunits,
      COALESCE(SUM(CASE WHEN i.deleted_at IS NULL THEN
        i.unit_price_subunits * CAST(COALESCE(NULLIF(i.quantity, ''), '0') AS REAL) ELSE 0 END), 0) AS gross_subunits,
      COALESCE(SUM(CASE WHEN i.deleted_at IS NULL THEN i.net_amount_subunits ELSE 0 END), 0) AS net_rows_subunits
    FROM ddt_documents d
    LEFT JOIN ddt_items i ON i.ddt_id = d.id
    WHERE d.deleted_at IS NULL AND d.status <> 'bozza' AND d.doc_number IS NOT NULL
    GROUP BY d.id
    ORDER BY d.year DESC, d.doc_number DESC, d.doc_date DESC
  `);
  return rows.map((row) => {
    const purchaseSubunits = Math.round(numberValue(row.purchase_subunits));
    const gross = numberValue(row.gross_subunits);
    const discount = gross > 0 ? Math.max(0, ((gross - numberValue(row.net_rows_subunits)) / gross) * 100) : null;
    const revenueSubunits = numberValue(row.total_taxable_subunits) - purchaseSubunits;
    return {
      id: row.id, year: Number(row.year), docNumber: row.doc_number, series: row.series || "",
      date: row.doc_date, client: row.client_name, destination: [row.destination_name, row.destination_city].filter(Boolean).join(" · "),
      status: row.status, taxableSubunits: Number(row.total_taxable_subunits), purchaseSubunits,
      revenueSubunits, markupPercent: purchaseSubunits > 0 ? (revenueSubunits / purchaseSubunits) * 100 : null,
      discountPercent: discount, operator: row.operator || "", reason: row.transport_reason || "",
      orderReference: row.order_reference || "", payment: row.payment_method || "",
    };
  });
}

export async function getDdtArticleViewRows(): Promise<DdtArticleViewRow[]> {
  const db = await getDatabase();
  const rows = await db.select<DdtArticleDbRow[]>(`
    SELECT i.id, i.ddt_id, d.year, d.doc_number, d.series, d.doc_date, d.client_name,
      d.destination_name, d.destination_city, i.unit, i.quantity, i.description,
      i.unit_price_subunits, i.discount_pct, i.net_amount_subunits, i.vat_rate, i.row_kind
    FROM ddt_items i
    JOIN ddt_documents d ON d.id = i.ddt_id
    WHERE d.deleted_at IS NULL AND d.status <> 'bozza' AND d.doc_number IS NOT NULL
    ORDER BY d.year DESC, d.doc_number DESC, d.doc_date DESC, i.row_index ASC
  `);
  return rows.map((row) => ({
    id: row.id, ddtId: row.ddt_id, year: Number(row.year), docNumber: row.doc_number,
    series: row.series || "", date: row.doc_date, client: row.client_name,
    destination: [row.destination_name, row.destination_city].filter(Boolean).join(" · "),
    unit: row.unit || "", quantity: row.quantity ?? "", description: row.description,
    unitPriceSubunits: Number(row.unit_price_subunits), discountPercent: row.discount_pct || "",
    netAmountSubunits: Number(row.net_amount_subunits), vatRate: Number(row.vat_rate ?? 0),
    rowKind: row.row_kind || "item",
  }));
}

export interface ClientArticleHistoryRow {
  ddtId: string;
  year: number;
  docNumber: number | null;
  series: string;
  date: string;
  client: string;
  destination: string;
  unit: string;
  quantity: string;
  description: string;
  code: string;
  unitPriceSubunits: number;
  discountPercent: string;
  netAmountSubunits: number;
  vatRate: number;
  purchasePriceSubunits: number;
  revenueSubunits: number;
  markupPercent: number | null;
}

export async function getClientArticleHistory(options: {
  clientName?: string;
  description: string;
  code?: string;
  onlyThisClient?: boolean;
}): Promise<ClientArticleHistoryRow[]> {
  const db = await getDatabase();
  const trimmedDesc = options.description.trim();
  const trimmedCode = (options.code || "").trim();
  const trimmedClient = (options.clientName || "").trim();
  const onlyThisClient = options.onlyThisClient !== false;

  let query = `
    SELECT 
      d.id AS ddt_id,
      d.year,
      d.doc_number,
      d.series,
      d.doc_date,
      d.client_name,
      d.destination_name,
      d.destination_city,
      i.unit,
      i.quantity,
      i.description,
      i.code,
      i.unit_price_subunits,
      i.discount_pct,
      i.net_amount_subunits,
      i.vat_rate,
      i.purchase_price_subunits
    FROM ddt_items i
    JOIN ddt_documents d ON d.id = i.ddt_id
    WHERE d.deleted_at IS NULL 
      AND i.deleted_at IS NULL
      AND d.status <> 'bozza'
      AND d.doc_number IS NOT NULL
  `;

  const params: (string | number)[] = [];

  if (onlyThisClient && trimmedClient) {
    params.push(trimmedClient);
    query += ` AND LOWER(TRIM(d.client_name)) = LOWER(TRIM($${params.length}))`;
  }

  if (trimmedCode) {
    params.push(trimmedCode);
    const codeIdx = params.length;
    params.push(trimmedDesc);
    const descIdx = params.length;
    params.push(`%${trimmedDesc}%`);
    const likeIdx = params.length;
    query += ` AND (
      (i.code IS NOT NULL AND LOWER(TRIM(i.code)) = LOWER(TRIM($${codeIdx})))
      OR LOWER(TRIM(i.description)) = LOWER(TRIM($${descIdx}))
      OR (i.description LIKE $${likeIdx})
    )`;
  } else if (trimmedDesc) {
    params.push(trimmedDesc);
    const descIdx = params.length;
    params.push(`%${trimmedDesc}%`);
    const likeIdx = params.length;
    query += ` AND (
      LOWER(TRIM(i.description)) = LOWER(TRIM($${descIdx}))
      OR (i.description LIKE $${likeIdx})
    )`;
  }

  query += ` ORDER BY d.doc_date DESC, d.doc_number DESC LIMIT 300`;

  const rows = await db.select<any[]>(query, params);

  return rows.map((row) => {
    const qty = parseFloat(String(row.quantity || "0").replace(",", ".")) || 0;
    const netAmount = Number(row.net_amount_subunits || 0);
    const purchaseUnit = Number(row.purchase_price_subunits || 0);
    const totalPurchase = Math.round(purchaseUnit * qty);
    const revenue = netAmount - totalPurchase;
    const markup = totalPurchase > 0 ? (revenue / totalPurchase) * 100 : null;

    return {
      ddtId: String(row.ddt_id),
      year: Number(row.year),
      docNumber: row.doc_number !== null ? Number(row.doc_number) : null,
      series: row.series || "",
      date: String(row.doc_date),
      client: String(row.client_name),
      destination: [row.destination_name, row.destination_city].filter(Boolean).join(" · "),
      unit: String(row.unit || ""),
      quantity: String(row.quantity || ""),
      description: String(row.description || ""),
      code: String(row.code || ""),
      unitPriceSubunits: Number(row.unit_price_subunits || 0),
      discountPercent: String(row.discount_pct || ""),
      netAmountSubunits: netAmount,
      vatRate: Number(row.vat_rate || 0),
      purchasePriceSubunits: purchaseUnit,
      revenueSubunits: revenue,
      markupPercent: markup,
    };
  });
}


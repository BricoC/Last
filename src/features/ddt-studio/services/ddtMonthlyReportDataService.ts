import { parseDdtQuantity } from "../utils/ddtQuantity";
import { getDatabase } from "@/shared/data-layer/database";
import { MonetaryValue } from "@/shared/domain/monetaryValue";
import { ITALIAN_MONTH_NAMES } from "../utils/italianMonthNames";
import type { ClientRankingEntry, DdtMonthlyReportFullData, DdtReportArticleRow, DdtReportDocumentRow, DdtReportMonthlyMetrics, MonthSummaryCount } from "./ddtReportTypes";
/**
 * Recupera i conteggi dei DDT emessi per ciascun mese dell'anno specificato
 */
export async function getDdtMonthlyCounts(year: number): Promise<MonthSummaryCount[]> {
  const db = await getDatabase();
  const rows = await db.select<{ month_num: string; count: number }[]>(
    `SELECT SUBSTR(doc_date, 6, 2) AS month_num, COUNT(*) AS count
     FROM ddt_documents
     WHERE deleted_at IS NULL AND doc_number IS NOT NULL AND status <> 'bozza' AND year = ?
     GROUP BY month_num
     ORDER BY month_num ASC`,
    [year]
  );

  const countMap = new Map<number, number>();
  for (const r of rows) {
    const m = parseInt(r.month_num, 10);
    if (!isNaN(m)) countMap.set(m, Number(r.count));
  }

  return ITALIAN_MONTH_NAMES.map((name, idx) => {
    const month = idx + 1;
    return {
      month,
      name,
      count: countMap.get(month) || 0,
    };
  });
}

/**
 * Formatta data ISO "YYYY-MM-DD" nel formato italiano standard "DD/MM/YYYY"
 */
function toDateIT(isoDate?: string | null): string {
  if (!isoDate) return "";
  const clean = isoDate.split("T")[0].split(" ")[0].trim();
  const parts = clean.split("-");
  if (parts.length === 3) {
    return `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}`;
  }
  return isoDate;
}

/**
 * Converte subunits (fattore 100_000) in euro floating con precisione
 */
function subunitsToEuro(subunits?: number | bigint | null): number {
  if (!subunits) return 0;
  return MonetaryValue.fromSubunits(subunits).toNumber();
}

/**
 * Estrae tutti i dati necessari alla generazione del report del mese specificato
 */
export async function getDdtMonthlyReportData(
  year: number,
  month: number
): Promise<DdtMonthlyReportFullData> {
  const db = await getDatabase();
  const monthStr = String(month).padStart(2, "0");
  const monthName = ITALIAN_MONTH_NAMES[month - 1] || `Mese ${month}`;

  // 1. DDT emessi nel mese
  const ddtDbRows = await db.select<{
    id: string;
    year: number;
    doc_number: number;
    series: string | null;
    doc_date: string;
    client_name: string;
    destination_name: string | null;
    destination_city: string | null;
    operator: string | null;
    total_taxable_subunits: number;
    total_vat_subunits: number;
    total_document_subunits: number;
    transport_reason: string | null;
    payment_method: string | null;
    order_reference: string | null;
    carrier: string | null;
    internal_notes: string | null;
  }[]>(
    `SELECT id, year, doc_number, series, doc_date, client_name,
            destination_name, destination_city, operator,
            total_taxable_subunits, total_vat_subunits, total_document_subunits,
            transport_reason, payment_method, order_reference, carrier, internal_notes
     FROM ddt_documents
     WHERE deleted_at IS NULL AND doc_number IS NOT NULL AND status <> 'bozza'
       AND year = ? AND doc_date >= ? AND doc_date <= ?
     ORDER BY doc_number ASC`,
    [year, `${year}-${monthStr}-01`, `${year}-${monthStr}-31`]
  );

  // 2. Righe articoli dei DDT del mese
  const articleDbRows = await db.select<{
    ddt_id: string;
    row_index: number;
    code: string | null;
    description: string;
    unit: string | null;
    quantity: string | null;
    unit_price_subunits: number;
    discount_pct: string | null;
    net_amount_subunits: number;
    vat_rate: number;
    doc_number: number;
    doc_date: string;
    client_name: string;
    destination_name: string | null;
    destination_city: string | null;
    transport_reason: string | null;
    payment_method: string | null;
    order_reference: string | null;
    operator: string | null;
    internal_notes: string | null;
  }[]>(
    `SELECT i.ddt_id, i.row_index, i.code, i.description, i.unit, i.quantity,
            i.unit_price_subunits, i.discount_pct, i.net_amount_subunits, i.vat_rate,
            d.doc_number, d.doc_date, d.client_name, d.destination_name, d.destination_city,
            d.transport_reason, d.payment_method, d.order_reference, d.operator, d.internal_notes
     FROM ddt_items i
     JOIN ddt_documents d ON d.id = i.ddt_id
     WHERE d.deleted_at IS NULL AND d.doc_number IS NOT NULL AND d.status <> 'bozza'
       AND d.year = ? AND d.doc_date >= ? AND d.doc_date <= ?
       AND i.deleted_at IS NULL
     ORDER BY d.doc_number ASC, i.row_index ASC`,
    [year, `${year}-${monthStr}-01`, `${year}-${monthStr}-31`]
  );

  // Mappatura DDT
  let sumTaxable = 0;
  let sumVat = 0;
  let sumDoc = 0;

  interface ClientAcc {
    client: string;
    ddtNumbers: number[];
    taxable: number;
    vat: number;
    total: number;
  }
  const clientMap = new Map<string, ClientAcc>();

  const ddtRows: DdtReportDocumentRow[] = ddtDbRows.map((row) => {
    const taxable = subunitsToEuro(row.total_taxable_subunits);
    const vat = subunitsToEuro(row.total_vat_subunits);
    // Se il totale documento sorgente è 0 o vuoto ma imponibile o imposta sono disponibili, calcola imponibile + imposta
    let totalDoc = subunitsToEuro(row.total_document_subunits);
    if ((totalDoc === 0 || !row.total_document_subunits) && (taxable !== 0 || vat !== 0)) {
      totalDoc = Number((taxable + vat).toFixed(2));
    }

    sumTaxable += taxable;
    sumVat += vat;
    sumDoc += totalDoc;

    const cName = (row.client_name || "SENZA CLIENTE").trim();
    const existing = clientMap.get(cName) || {
      client: cName,
      ddtNumbers: [],
      taxable: 0,
      vat: 0,
      total: 0,
    };
    existing.ddtNumbers.push(row.doc_number);
    existing.taxable += taxable;
    existing.vat += vat;
    existing.total += totalDoc;
    clientMap.set(cName, existing);

    const destParts = [row.destination_name, row.destination_city].filter(Boolean);
    const dest = destParts.join(" · ");

    return {
      year: row.year,
      monthName,
      dateStr: toDateIT(row.doc_date),
      docNumber: row.doc_number,
      client: row.client_name,
      destination: dest,
      operator: row.operator || "",
      taxable,
      vat,
      totalDocument: totalDoc,
      reason: row.transport_reason || "Vendita",
      payment: row.payment_method || "",
      orderReference: row.order_reference || "",
      carrier: row.carrier || "",
      notes: row.internal_notes || "",
    };
  });

  // Ranking Clienti ordinato per fatturato decrescente
  const clientRankingList = Array.from(clientMap.values()).sort((a, b) => b.total - a.total);
  const clientRanking: ClientRankingEntry[] = clientRankingList.map((c, idx) => {
    const share = sumDoc > 0 ? (c.total / sumDoc) * 100 : 0;
    return {
      pos: idx + 1,
      client: c.client,
      ddtCount: c.ddtNumbers.length,
      ddtNumbersList: c.ddtNumbers.join(", "),
      totalTaxable: c.taxable,
      totalVat: c.vat,
      totalDocument: c.total,
      sharePercent: `${share.toFixed(2)}%`,
    };
  });

  // Mappatura Articoli
  const articleRows: DdtReportArticleRow[] = articleDbRows.map((row) => {
    const unitPrice = subunitsToEuro(row.unit_price_subunits);
    const netAmount = subunitsToEuro(row.net_amount_subunits);
    const qNum = parseDdtQuantity(row.quantity) ?? 0;
    const netPrice = qNum > 0 ? netAmount / qNum : unitPrice;

    const destParts = [row.destination_name, row.destination_city].filter(Boolean);
    const dest = destParts.join(" · ");

    return {
      year,
      monthName,
      dateStr: toDateIT(row.doc_date),
      docNumber: row.doc_number,
      client: row.client_name,
      destination: dest,
      reason: row.transport_reason || "Vendita",
      payment: row.payment_method || "",
      orderReference: row.order_reference || "",
      operator: row.operator || "",
      rowIndex: row.row_index,
      description: row.description,
      unit: row.unit || "NR.",
      quantity: row.quantity || "1",
      unitPrice,
      discountPct: row.discount_pct ? `${row.discount_pct}%` : "",
      netPrice,
      rowTotal: netAmount,
      vatRate: `${row.vat_rate}%`,
      internalNotes: row.internal_notes || "",
    };
  });

  const metrics: DdtReportMonthlyMetrics = {
    monthName,
    year,
    totalDdts: ddtRows.length,
    uniqueClients: clientRanking.length,
    totalTaxable: sumTaxable,
    totalVat: sumVat,
    totalDocument: sumDoc,
    clientRanking,
  };

  return {
    metrics,
    ddtRows,
    articleRows,
  };
}

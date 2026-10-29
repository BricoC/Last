import ExcelJS from "exceljs";
import { getDatabase } from "@/shared/data-layer/database";
import { MonetaryValue } from "@/shared/domain/monetaryValue";
import { invoke } from "@tauri-apps/api/core";
import { DdtDocument, DdtItem } from "../models/ddt";

export const ITALIAN_MONTH_NAMES = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
] as const;

export interface MonthSummaryCount {
  month: number;
  name: string;
  count: number;
}

export interface ClientRankingEntry {
  pos: number;
  client: string;
  ddtCount: number;
  ddtNumbersList: string;
  totalTaxable: number;
  totalVat: number;
  totalDocument: number;
  sharePercent: string;
}

export interface DdtReportMonthlyMetrics {
  monthName: string;
  year: number;
  totalDdts: number;
  uniqueClients: number;
  totalTaxable: number;
  totalVat: number;
  totalDocument: number;
  clientRanking: ClientRankingEntry[];
}

export interface DdtReportDocumentRow {
  year: number;
  monthName: string;
  dateStr: string;
  docNumber: number;
  client: string;
  destination: string;
  operator: string;
  taxable: number;
  vat: number;
  totalDocument: number;
  reason: string;
  payment: string;
  orderReference: string;
  carrier: string;
  notes: string;
}

export interface DdtReportArticleRow {
  year: number;
  monthName: string;
  dateStr: string;
  docNumber: number;
  client: string;
  destination: string;
  reason: string;
  payment: string;
  orderReference: string;
  operator: string;
  rowIndex: number;
  description: string;
  unit: string;
  quantity: string | number;
  unitPrice: number;
  discountPct: string;
  netPrice: number;
  rowTotal: number;
  vatRate: string;
  internalNotes: string;
}

export interface DdtMonthlyReportFullData {
  metrics: DdtReportMonthlyMetrics;
  ddtRows: DdtReportDocumentRow[];
  articleRows: DdtReportArticleRow[];
}

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
    const totalDoc = subunitsToEuro(row.total_document_subunits);

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
    const qNum = parseFloat(row.quantity || "0") || 0;
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

/**
 * Genera il file Excel .xlsx fedele a NoMnaV1 con i 3 fogli:
 * 1. Recap Mese & Clienti
 * 2. Dettaglio Articoli
 * 3. Riepilogo DDT
 */
export async function generateDdtMonthlyExcelReport(
  year: number,
  month: number
): Promise<{ filename: string; buffer: Uint8Array }> {
  const data = await getDdtMonthlyReportData(year, month);
  const { metrics, ddtRows, articleRows } = data;
  const monthName = metrics.monthName;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Last Gestionale";
  wb.created = new Date();

  // -------------------------------------------------------------------------
  // FOGLIO 1: Recap Mese & Clienti
  // -------------------------------------------------------------------------
  const wsRecap = wb.addWorksheet("Recap Mese & Clienti");

  wsRecap.columns = [
    { key: "pos", width: 12 },
    { key: "client", width: 44 },
    { key: "ddtCount", width: 18 },
    { key: "ddtList", width: 45 },
    { key: "taxable", width: 24 },
    { key: "vat", width: 20 },
    { key: "total", width: 24 },
    { key: "share", width: 16 },
  ];

  // Header Titolo
  const titleRow = wsRecap.addRow([`RIEPILOGO MENSILE DDT - ${monthName.toUpperCase()} ${year}`]);
  titleRow.font = { bold: true, size: 14 };

  wsRecap.addRow([]); // riga 2 vuota

  // Metriche Generali Mese
  const subTitleRow = wsRecap.addRow(["METRICHE GENERALI MESE"]);
  subTitleRow.font = { bold: true, size: 11 };

  const rMese = wsRecap.addRow(["Mese di Riferimento", `${monthName} ${year}`]);
  rMese.font = { size: 10 };

  const rDdts = wsRecap.addRow(["Totale DDT Emessi", metrics.totalDdts]);
  rDdts.font = { size: 10 };

  const rClients = wsRecap.addRow(["Numero Clienti Serviti", metrics.uniqueClients]);
  rClients.font = { size: 10 };

  const rTax = wsRecap.addRow(["Totale Imponibile (€)", metrics.totalTaxable]);
  rTax.font = { size: 10 };
  rTax.getCell(2).numFmt = "€ #,##0.00";

  const rVat = wsRecap.addRow(["Totale IVA Imposta (€)", metrics.totalVat]);
  rVat.font = { size: 10 };
  rVat.getCell(2).numFmt = "€ #,##0.00";

  const rDoc = wsRecap.addRow(["Totale Documento / Fatturato (€)", metrics.totalDocument]);
  rDoc.font = { bold: true, size: 11 };
  rDoc.getCell(2).numFmt = "€ #,##0.00";

  wsRecap.addRow([]); // riga 10 vuota

  const subRankingRow = wsRecap.addRow(["DETTAGLIO FATTURATO PER CLIENTE"]);
  subRankingRow.font = { bold: true, size: 11 };

  // Riga Intestazione Tabella Clienti (Riga 12)
  const headerRanking = wsRecap.addRow([
    "Pos.",
    "Cliente",
    "N° DDT Emessi",
    "Elenco N° DDT",
    "Totale Imponibile (€)",
    "Totale IVA (€)",
    "Totale Fatturato (€)",
    "% Incidenza",
  ]);
  headerRanking.font = { bold: true, size: 10 };

  // Dati Clienti
  for (const c of metrics.clientRanking) {
    const row = wsRecap.addRow([
      c.pos,
      c.client,
      c.ddtCount,
      c.ddtNumbersList,
      c.totalTaxable,
      c.totalVat,
      c.totalDocument,
      c.sharePercent,
    ]);
    row.font = { size: 10 };
    row.getCell(5).numFmt = "€ #,##0.00";
    row.getCell(6).numFmt = "€ #,##0.00";
    row.getCell(7).numFmt = "€ #,##0.00";
  }

  // -------------------------------------------------------------------------
  // FOGLIO 2: Dettaglio Articoli
  // -------------------------------------------------------------------------
  const wsArticles = wb.addWorksheet("Dettaglio Articoli");

  wsArticles.columns = [
    { key: "year", width: 9 },
    { key: "month", width: 14 },
    { key: "date", width: 14 },
    { key: "ddtNumber", width: 11 },
    { key: "client", width: 38 },
    { key: "destination", width: 28 },
    { key: "reason", width: 20 },
    { key: "payment", width: 26 },
    { key: "orderRef", width: 22 },
    { key: "operator", width: 12 },
    { key: "rowIdx", width: 9 },
    { key: "description", width: 55 },
    { key: "unit", width: 10 },
    { key: "qty", width: 12 },
    { key: "price", width: 18 },
    { key: "disc", width: 11 },
    { key: "netPrice", width: 18 },
    { key: "rowTot", width: 18 },
    { key: "vat", width: 10 },
    { key: "notes", width: 30 },
  ];

  const headerArticles = wsArticles.addRow([
    "Anno",
    "Mese",
    "Data DDT",
    "N° DDT",
    "Cliente",
    "Destinazione",
    "Causale Trasporto",
    "Condizioni Pagamento",
    "N° Ordine Cliente",
    "Operatore",
    "N° Riga",
    "Descrizione Articolo / Prestazione",
    "U.M.",
    "Quantità",
    "Prezzo Unitario (€)",
    "Sconto %",
    "Prezzo Netto (€)",
    "Totale Riga (€)",
    "IVA %",
    "Note Documento",
  ]);
  headerArticles.font = { bold: true, size: 10 };

  for (const art of articleRows) {
    const row = wsArticles.addRow([
      art.year,
      art.monthName,
      art.dateStr,
      art.docNumber,
      art.client,
      art.destination,
      art.reason,
      art.payment,
      art.orderReference,
      art.operator,
      art.rowIndex,
      art.description,
      art.unit,
      art.quantity,
      art.unitPrice,
      art.discountPct,
      art.netPrice,
      art.rowTotal,
      art.vatRate,
      art.internalNotes,
    ]);
    row.font = { size: 10 };
    row.getCell(15).numFmt = "€ #,##0.00";
    row.getCell(17).numFmt = "€ #,##0.00";
    row.getCell(18).numFmt = "€ #,##0.00";
  }

  // -------------------------------------------------------------------------
  // FOGLIO 3: Riepilogo DDT
  // -------------------------------------------------------------------------
  const wsDdt = wb.addWorksheet("Riepilogo DDT");

  wsDdt.columns = [
    { key: "year", width: 9 },
    { key: "month", width: 14 },
    { key: "date", width: 14 },
    { key: "ddtNumber", width: 14 },
    { key: "client", width: 38 },
    { key: "destination", width: 28 },
    { key: "operator", width: 12 },
    { key: "taxable", width: 22 },
    { key: "vat", width: 18 },
    { key: "total", width: 22 },
    { key: "reason", width: 20 },
    { key: "payment", width: 26 },
    { key: "orderRef", width: 22 },
    { key: "carrier", width: 18 },
    { key: "notes", width: 30 },
  ];

  const headerDdt = wsDdt.addRow([
    "Anno",
    "Mese",
    "Data DDT",
    "N° DDT",
    "Cliente",
    "Destinazione",
    "Operatore",
    "Totale Imponibile (€)",
    "IVA Imposta (€)",
    "Totale Documento (€)",
    "Causale Trasporto",
    "Condizioni Pagamento",
    "N° Ordine Cliente",
    "Vettore",
    "Note",
  ]);
  headerDdt.font = { bold: true, size: 10 };

  for (const d of ddtRows) {
    const row = wsDdt.addRow([
      d.year,
      d.monthName,
      d.dateStr,
      d.docNumber,
      d.client,
      d.destination,
      d.operator,
      d.taxable,
      d.vat,
      d.totalDocument,
      d.reason,
      d.payment,
      d.orderReference,
      d.carrier,
      d.notes,
    ]);
    row.font = { size: 10 };
    row.getCell(8).numFmt = "€ #,##0.00";
    row.getCell(9).numFmt = "€ #,##0.00";
    row.getCell(10).numFmt = "€ #,##0.00";
  }

  // Riga Finale Totale Mese
  const totalRow = wsDdt.addRow([
    null,
    null,
    null,
    "TOTALE MESE",
    `${metrics.totalDdts} DDT Emessi`,
    null,
    null,
    metrics.totalTaxable,
    metrics.totalVat,
    metrics.totalDocument,
    null,
    null,
    null,
    null,
    null,
  ]);
  totalRow.font = { bold: true, size: 10 };
  totalRow.getCell(8).numFmt = "€ #,##0.00";
  totalRow.getCell(9).numFmt = "€ #,##0.00";
  totalRow.getCell(10).numFmt = "€ #,##0.00";

  // Esportazione Buffer binario
  const buffer = await wb.xlsx.writeBuffer();
  const filename = `Report DDT ${monthName} ${year}.xlsx`;

  return {
    filename,
    buffer: new Uint8Array(buffer),
  };
}

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

  const docIds = docRows.map((d) => `'${d.id}'`).join(", ");
  const itemRows = await db.select<any[]>(
    `SELECT * FROM ddt_items
     WHERE deleted_at IS NULL AND ddt_id IN (${docIds})
     ORDER BY row_index ASC`
  );

  const itemsByDocId = new Map<string, DdtItem[]>();
  for (const row of itemRows) {
    const isNote = row.row_kind === "note" || (
      Boolean(row.description?.trim()) &&
      (row.unit_price_subunits ?? 0) === 0 &&
      (row.net_amount_subunits ?? 0) === 0 &&
      (!row.purchase_price_subunits || row.purchase_price_subunits === 0) &&
      (!row.code || !String(row.code).trim())
    );
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
      vat_rate: isNote ? "" : (row.vat_rate !== null && row.vat_rate !== undefined ? String(row.vat_rate) : "22"),
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
      total_document: MonetaryValue.fromSubunits(row.total_document_subunits || 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      deleted_at: row.deleted_at || undefined,
      sync_status: row.sync_status,
      items: itemsByDocId.get(row.id) || [],
    };
  });
}

/**
 * Salva il file Excel generato direttamente sul Desktop dell'utente (usando Tauri)
 * oppure tramite download classico nel browser.
 */
export async function saveReportToDesktop(
  filename: string,
  content: Uint8Array
): Promise<string> {
  try {
    const savedPath = await invoke<string>("save_file_to_desktop", {
      filename,
      bytes: Array.from(content),
    });
    return savedPath;
  } catch (err) {
    console.warn("Fallback download browser perché Tauri save non disponibile:", err);
    const mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const blob = new Blob([content as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return `Scaricato nei Download come ${filename}`;
  }
}

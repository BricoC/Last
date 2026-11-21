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

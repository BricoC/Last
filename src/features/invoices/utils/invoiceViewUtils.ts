import {
  SupplierInvoice,
  SupplierInvoiceItem,
} from "../services/electronicInvoicesService";
import {
  normalizeSearch,
  matchesSearchToken,
} from "@/shared/hooks/useFragmentSearch";

export type IndexedItemRow = SupplierInvoiceItem & { _searchIndex: string };
export type IndexedInvoiceRow = SupplierInvoice & { _searchIndex: string };

export type ItemSortField =
  | "doc_date"
  | "doc_number"
  | "supplier_name"
  | "article_code"
  | "unit"
  | "quantity"
  | "description"
  | "unit_price"
  | "discount_1"
  | "discounted_price"
  | "total_price"
  | "vat_rate";

export type InvoiceSortField =
  | "doc_date"
  | "doc_number"
  | "supplier_name"
  | "year"
  | "taxable_amount"
  | "vat_amount"
  | "total_amount"
  | "payment_method"
  | "due_date"
  | "notes";

export interface SelectedInvoiceCell {
  rowKey: string | number;
  col: "article_code" | "description";
  text: string;
}

export interface InvoiceSummaryTotals {
  count: number;
  taxable: number;
  vat: number;
  total: number;
}

export interface ImportNotificationState {
  type: "success" | "warning" | "error";
  message: string;
}

export function formatInvoiceEuro(val: number, decimals = 2): string {
  return `€ ${val.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function getInvoiceRowKey(item: {
  id?: number | string;
  supplier_name?: string;
  doc_number?: string;
  line_number?: number;
  doc_date?: string;
}): string | number {
  return (
    item.id ??
    `${item.supplier_name || ""}-${item.doc_number}-${item.line_number || item.doc_date || ""}`
  );
}

export function indexInvoiceItems(items: SupplierInvoiceItem[]): IndexedItemRow[] {
  return items.map((r) => ({
    ...r,
    _searchIndex: normalizeSearch(
      `${r.description} ${r.article_code || ""} ${r.supplier_name} ${r.doc_number} ${r.year} ${r.doc_date}`
    ),
  }));
}

export function indexInvoices(invoices: SupplierInvoice[]): IndexedInvoiceRow[] {
  return invoices.map((inv) => ({
    ...inv,
    _searchIndex: normalizeSearch(
      `${inv.supplier_name} ${inv.doc_number} ${inv.doc_date} ${inv.year} ${inv.iban || ""} ${inv.notes || ""}`
    ),
  }));
}

export function filterInvoiceItems(
  indexedItems: IndexedItemRow[],
  selectedYear: number | null,
  onlyWithPrice: boolean,
  searchTokens: string[]
): IndexedItemRow[] {
  return indexedItems.filter((row) => {
    if (selectedYear !== null && row.year !== selectedYear) return false;
    if (onlyWithPrice && row.discounted_price <= 0 && row.unit_price <= 0 && row.total_price <= 0) {
      return false;
    }
    if (!searchTokens.length) return true;
    return searchTokens.every((token) => matchesSearchToken(row._searchIndex, token));
  });
}

export function filterInvoices(
  indexedInvoices: IndexedInvoiceRow[],
  selectedYear: number | null,
  searchTokens: string[]
): IndexedInvoiceRow[] {
  return indexedInvoices.filter((inv) => {
    if (selectedYear !== null && inv.year !== selectedYear) return false;
    if (!searchTokens.length) return true;
    return searchTokens.every((token) => matchesSearchToken(inv._searchIndex, token));
  });
}

export function sortInvoiceItems(
  filteredItems: IndexedItemRow[],
  sortField: ItemSortField,
  sortAsc: boolean
): IndexedItemRow[] {
  return [...filteredItems].sort((a, b) => {
    let valA: unknown = a[sortField];
    let valB: unknown = b[sortField];

    if (sortField === "discounted_price") {
      valA = a.discounted_price > 0 ? a.discounted_price : a.unit_price;
      valB = b.discounted_price > 0 ? b.discounted_price : b.unit_price;
    }

    if (valA == null) valA = "";
    if (valB == null) valB = "";

    if (typeof valA === "number" && typeof valB === "number") {
      return sortAsc ? valA - valB : valB - valA;
    }

    return sortAsc
      ? String(valA).localeCompare(String(valB), "it", { numeric: true, sensitivity: "base" })
      : String(valB).localeCompare(String(valA), "it", { numeric: true, sensitivity: "base" });
  });
}

export function sortInvoices(
  filteredInvoices: IndexedInvoiceRow[],
  sortField: InvoiceSortField,
  sortAsc: boolean
): IndexedInvoiceRow[] {
  return [...filteredInvoices].sort((a, b) => {
    let valA: unknown = a[sortField];
    let valB: unknown = b[sortField];

    if (valA == null) valA = "";
    if (valB == null) valB = "";

    if (typeof valA === "number" && typeof valB === "number") {
      return sortAsc ? valA - valB : valB - valA;
    }

    return sortAsc
      ? String(valA).localeCompare(String(valB), "it", { numeric: true, sensitivity: "base" })
      : String(valB).localeCompare(String(valA), "it", { numeric: true, sensitivity: "base" });
  });
}

export function computeAvailableInvoiceYears(
  invoices: SupplierInvoice[],
  items: SupplierInvoiceItem[]
): number[] {
  const yearsSet = new Set<number>();
  invoices.forEach((inv) => {
    if (inv.year) yearsSet.add(inv.year);
  });
  items.forEach((item) => {
    if (item.year) yearsSet.add(item.year);
  });
  [2026, 2025, 2024, 2023].forEach((y) => yearsSet.add(y));
  return Array.from(yearsSet).sort((a, b) => b - a);
}

export function computeInvoiceSummaryTotals(
  activeTab: "items" | "invoices",
  filteredInvoices: IndexedInvoiceRow[],
  filteredItems: IndexedItemRow[]
): InvoiceSummaryTotals {
  if (activeTab === "invoices") {
    let taxable = 0;
    let vat = 0;
    let total = 0;
    for (let i = 0; i < filteredInvoices.length; i++) {
      const inv = filteredInvoices[i];
      taxable += inv.taxable_amount || 0;
      vat += inv.vat_amount || 0;
      total += inv.total_amount || 0;
    }
    return {
      count: filteredInvoices.length,
      taxable,
      vat,
      total,
    };
  }

  let taxable = 0;
  let vat = 0;
  let total = 0;
  for (let i = 0; i < filteredItems.length; i++) {
    const it = filteredItems[i];
    const lineTotal = it.total_price || 0;
    taxable += lineTotal;
    const rate =
      it.vat_rate !== null && it.vat_rate !== undefined && Number.isFinite(Number(it.vat_rate))
        ? Number(it.vat_rate)
        : 22;
    const lineVat = lineTotal * (rate / 100);
    vat += lineVat;
    total += lineTotal + lineVat;
  }
  return {
    count: filteredItems.length,
    taxable,
    vat,
    total,
  };
}

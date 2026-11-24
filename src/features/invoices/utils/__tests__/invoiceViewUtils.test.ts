import { describe, it, expect } from "vitest";
import {
  computeAvailableInvoiceYears,
  computeInvoiceSummaryTotals,
  filterInvoiceItems,
  filterInvoices,
  indexInvoiceItems,
  indexInvoices,
  sortInvoiceItems,
  sortInvoices,
} from "../invoiceViewUtils";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import type { SupplierInvoice, SupplierInvoiceItem } from "../../services/electronicInvoicesService";

const sampleInvoices: SupplierInvoice[] = [
  {
    id: 1,
    supplier_name: "ACME SRL",
    doc_number: "FT-10",
    doc_date: "2026-05-10",
    year: 2026,
    taxable_amount: 100,
    vat_amount: 22,
    total_amount: 122,
  },
  {
    id: 2,
    supplier_name: "BETA SPA",
    doc_number: "FT-2",
    doc_date: "2025-03-01",
    year: 2025,
    taxable_amount: 200,
    vat_amount: 44,
    total_amount: 244,
  },
];

const sampleItems: SupplierInvoiceItem[] = [
  {
    id: 10,
    invoice_id: 1,
    supplier_name: "ACME SRL",
    doc_number: "FT-10",
    doc_date: "2026-05-10",
    year: 2026,
    line_number: 1,
    article_code: "VITI-01",
    description: "Viti acciaio inox",
    quantity: 10,
    unit: "PZ",
    unit_price: 5,
    discount_1: 10,
    discount_2: 0,
    discount_3: 0,
    discounted_price: 4.5,
    total_price: 45,
    vat_rate: 22,
  },
  {
    id: 11,
    invoice_id: 1,
    supplier_name: "ACME SRL",
    doc_number: "FT-10",
    doc_date: "2026-05-10",
    year: 2026,
    line_number: 2,
    article_code: "",
    description: "Nota consegna",
    quantity: 0,
    unit: "",
    unit_price: 0,
    discount_1: 0,
    discount_2: 0,
    discount_3: 0,
    discounted_price: 0,
    total_price: 0,
    vat_rate: 22,
  },
];

describe("invoiceViewUtils", () => {
  it("filters items and invoices by year, onlyWithPrice, and search tokens", () => {
    const indexed = indexInvoiceItems(sampleItems);
    expect(filterInvoiceItems(indexed, 2026, true, [])).toHaveLength(1);
    expect(filterInvoiceItems(indexed, 2026, false, [])).toHaveLength(2);
    expect(filterInvoiceItems(indexed, 2025, false, [])).toHaveLength(0);
    expect(filterInvoiceItems(indexed, null, true, tokenizeSearch("inox viti"))).toHaveLength(1);

    const indexedInvs = indexInvoices(sampleInvoices);
    expect(filterInvoices(indexedInvs, 2026, [])).toHaveLength(1);
    expect(filterInvoices(indexedInvs, null, tokenizeSearch("beta"))).toHaveLength(1);
    expect(filterInvoices(indexedInvs, 2026, tokenizeSearch("beta"))).toHaveLength(0);
  });

  it("sorts items and invoices consistently", () => {
    const invs = indexInvoices(sampleInvoices);
    const byTotalDesc = sortInvoices(invs, "total_amount", false);
    expect(byTotalDesc[0].id).toBe(2);
    const byDocAsc = sortInvoices(invs, "doc_number", true);
    expect(byDocAsc[0].doc_number).toBe("FT-2");

    const its = indexInvoiceItems(sampleItems);
    const byPriceDesc = sortInvoiceItems(its, "discounted_price", false);
    expect(byPriceDesc[0].id).toBe(10);
  });

  it("computes summary totals and available years accurately", () => {
    const invs = indexInvoices(sampleInvoices);
    const its = indexInvoiceItems(sampleItems);
    const invTotals = computeInvoiceSummaryTotals("invoices", invs, its);
    expect(invTotals).toEqual({ count: 2, taxable: 300, vat: 66, total: 366 });

    const itemTotals = computeInvoiceSummaryTotals("items", invs, filterInvoiceItems(its, null, true, []));
    expect(itemTotals.count).toBe(1);
    expect(itemTotals.taxable).toBe(45);
    expect(itemTotals.vat).toBeCloseTo(9.9, 5);
    expect(itemTotals.total).toBeCloseTo(54.9, 5);

    const years = computeAvailableInvoiceYears(sampleInvoices, sampleItems);
    expect(years).toEqual([2026, 2025, 2024, 2023]);
  });
});

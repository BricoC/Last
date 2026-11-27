import { money, type MonetaryValue } from "@/shared/domain/monetaryValue";
import { calculateQuoteItem, calculateQuoteTotals, quoteQuantityOrNull, type CalculatedQuoteItem, type CalculatedQuoteTotals } from "../utils/quoteCalculations";
import { isQuoteDraftItemActive, type QuoteDraft, type QuoteDraftItem } from "../models/quoteDraft";

export interface PreparedQuoteItem {
  item: QuoteDraftItem;
  calculation: CalculatedQuoteItem;
  isBlank?: boolean;
}

export interface QuoteVatBreakdownEntry {
  rate: number;
  taxable: MonetaryValue;
  vat: MonetaryValue;
}

export interface PreparedQuote {
  rows: PreparedQuoteItem[];
  totals: CalculatedQuoteTotals;
  vatBreakdown: QuoteVatBreakdownEntry[];
}

const ZERO_CALCULATION: CalculatedQuoteItem = {
  base_unit_price: money(0),
  effective_unit_price: money(0),
  markup_pct: null,
  effective_markup_pct: null,
  margin_pct: null,
  net_amount: money(0),
  cost_total: money(0),
  gross_profit: money(0),
  vat_amount: money(0),
};

export function prepareQuoteForPrint(draft: QuoteDraft): PreparedQuote {
  let lastActiveIndex = -1;
  for (let i = draft.items.length - 1; i >= 0; i--) {
    if (isQuoteDraftItemActive(draft.items[i])) {
      lastActiveIndex = i;
      break;
    }
  }

  const slicedItems = lastActiveIndex >= 0 ? draft.items.slice(0, lastActiveIndex + 1) : [];

  const rows: PreparedQuoteItem[] = slicedItems.map((item) => {
    if (!isQuoteDraftItemActive(item)) {
      return { item, calculation: ZERO_CALCULATION, isBlank: true };
    }

    const rawQuantity = String(item.quantity ?? "").trim();
    const hasPrice = !money(item.purchase_price || 0).isZero()
      || !money(item.base_unit_price || 0).isZero()
      || !money(item.forced_unit_price || 0).isZero();
    const calcQuantity = quoteQuantityOrNull(rawQuantity) ? rawQuantity : "1";
    const displayQuantity = rawQuantity || (hasPrice ? "1" : "");
    const rawDiscount = Number(item.discount_pct ?? 0);
    const discount = Number.isFinite(rawDiscount) ? Math.min(100, Math.max(0, rawDiscount)) : 0;
    const rawVatRate = item.vat_rate;
    const vatRate = rawVatRate != null && Number.isFinite(rawVatRate) && rawVatRate >= 0 && rawVatRate <= 100 ? rawVatRate : null;
    const printItem: QuoteDraftItem = { ...item, quantity: displayQuantity, discount_pct: discount, vat_rate: vatRate };
    const calculation = calculateQuoteItem({
      ...printItem,
      quantity: calcQuantity,
      purchase_price: money(item.purchase_price),
      base_unit_price: item.base_unit_price ? money(item.base_unit_price) : null,
      forced_unit_price: item.forced_unit_price ? money(item.forced_unit_price) : null,
    }, validDiscount(draft.global_discount_pct));
    return { item: printItem, calculation, isBlank: false };
  });
  const activeRows = rows.filter((row) => !row.isBlank);
  const byRate = new Map<number, { taxable: MonetaryValue; vat: MonetaryValue }>();
  for (const row of activeRows) {
    const rate = row.item.vat_rate;
    if (rate == null || row.calculation.net_amount.isZero()) continue;
    const prev = byRate.get(rate);
    if (prev) {
      prev.taxable = prev.taxable.plus(row.calculation.net_amount);
      prev.vat = prev.vat.plus(row.calculation.vat_amount);
    } else {
      byRate.set(rate, {
        taxable: row.calculation.net_amount,
        vat: row.calculation.vat_amount,
      });
    }
  }
  const vatBreakdown: QuoteVatBreakdownEntry[] = Array.from(byRate.entries())
    .sort(([a], [b]) => b - a)
    .map(([rate, amounts]) => ({ rate, ...amounts }));

  return {
    rows,
    totals: calculateQuoteTotals(activeRows.map((row) => row.calculation)),
    vatBreakdown,
  };
}

function validDiscount(value?: number): number {
  return Number.isFinite(value) ? Math.min(100, value ?? 0) : 0;
}

import { money } from "@/shared/domain/monetaryValue";
import { calculateQuoteItem, calculateQuoteTotals, type CalculatedQuoteItem, type CalculatedQuoteTotals } from "../utils/quoteCalculations";
import { isQuoteDraftItemActive, type QuoteDraft, type QuoteDraftItem } from "../models/quoteDraft";

export interface PreparedQuoteItem {
  item: QuoteDraftItem;
  calculation: CalculatedQuoteItem;
}

export interface PreparedQuote {
  rows: PreparedQuoteItem[];
  totals: CalculatedQuoteTotals;
}

export function prepareQuoteForPrint(draft: QuoteDraft): PreparedQuote {
  const rows = draft.items.filter(isQuoteDraftItemActive).map((item) => {
    const rawQuantity = String(item.quantity);
    const quantity = validQuantity(rawQuantity) ? rawQuantity.trim() : "1";
    const rawDiscount = Number(item.discount_pct ?? 0);
    const discount = Number.isFinite(rawDiscount) ? Math.min(100, Math.max(0, rawDiscount)) : 0;
    const rawVatRate = item.vat_rate ?? 22;
    const vatRate = [0, 4, 10, 22].includes(rawVatRate) ? rawVatRate : 22;
    const printItem: QuoteDraftItem = { ...item, quantity, discount_pct: discount, vat_rate: vatRate };
    const calculation = calculateQuoteItem({
      ...printItem,
      purchase_price: money(item.purchase_price),
      base_unit_price: item.base_unit_price ? money(item.base_unit_price) : null,
      forced_unit_price: item.forced_unit_price ? money(item.forced_unit_price) : null,
    }, validDiscount(draft.global_discount_pct));
    return { item: printItem, calculation };
  });
  return { rows, totals: calculateQuoteTotals(rows.map((row) => row.calculation)) };
}

function validQuantity(value: string | number): boolean {
  const normalized = String(value).trim().replace(",", ".");
  if (!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return false;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0;
}

function validDiscount(value?: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value ?? 0)) : 0;
}

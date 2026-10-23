import Decimal from "decimal.js";
import { MonetaryValue, money } from "@/shared/domain/monetaryValue";
import { QuoteItemInput, QuoteVatRate } from "../models/quote";

export interface CalculatedQuoteItem {
  base_unit_price: MonetaryValue;
  effective_unit_price: MonetaryValue;
  markup_pct: number | null;
  effective_markup_pct: number | null;
  margin_pct: number | null;
  net_amount: MonetaryValue;
  cost_total: MonetaryValue;
  gross_profit: MonetaryValue;
  vat_amount: MonetaryValue;
}

export interface CalculatedQuoteTotals {
  taxable: MonetaryValue;
  vat: MonetaryValue;
  total: MonetaryValue;
  cost: MonetaryValue;
  gross_profit: MonetaryValue;
  markup_pct: number | null;
  margin_pct: number | null;
}

export function calculateQuoteItem(
  input: QuoteItemInput,
  globalDiscountPct: number
): CalculatedQuoteItem {
  assertFinite("Sconto globale", globalDiscountPct);
  assertFinite("Sconto riga", input.discount_pct ?? 0);
  assertVatRate(input.vat_rate);

  const lineDiscount = input.discount_pct ?? 0;
  if (lineDiscount < 0 || lineDiscount > 100) {
    throw new RangeError("Lo sconto riga deve essere compreso tra 0 e 100.");
  }
  if (globalDiscountPct > 100) {
    throw new RangeError("Lo sconto globale non può superare il 100%.");
  }

  const costPrice = input.purchase_price;
  if (costPrice.isNegative()) throw new RangeError("Il costo d'acquisto non può essere negativo.");
  const requestedMarkup = input.markup_pct ?? 0;
  assertFinite("Ricarico", requestedMarkup);
  const basePrice = input.base_unit_price ?? costPrice.plus(
    costPrice.times(requestedMarkup).dividedBy(100)
  );
  const forcedPrice = input.forced_unit_price ?? null;
  if (basePrice.isNegative() || forcedPrice?.isNegative()) {
    throw new RangeError("Il prezzo unitario non può essere negativo.");
  }
  const effectivePrice = forcedPrice ?? basePrice
    .applyDiscount(lineDiscount)
    .applyDiscount(globalDiscountPct);

  const quantity = parseQuantity(input.quantity);
  const netAmount = effectivePrice.times(quantity);
  const costTotal = costPrice.times(quantity);
  const profit = netAmount.minus(costTotal);

  return {
    base_unit_price: basePrice,
    effective_unit_price: effectivePrice,
    markup_pct: percentageDifference(basePrice, costPrice),
    effective_markup_pct: percentageDifference(effectivePrice, costPrice),
    margin_pct: percentage(effectivePrice.minus(costPrice), effectivePrice),
    net_amount: netAmount,
    cost_total: costTotal,
    gross_profit: profit,
    vat_amount: netAmount.calculateVat(input.vat_rate),
  };
}

export function calculateQuoteTotals(
  items: readonly CalculatedQuoteItem[]
): CalculatedQuoteTotals {
  let taxable = money(0);
  let vat = money(0);
  let cost = money(0);
  let grossProfit = money(0);

  for (const item of items) {
    taxable = taxable.plus(item.net_amount);
    vat = vat.plus(item.vat_amount);
    cost = cost.plus(item.cost_total);
    grossProfit = grossProfit.plus(item.gross_profit);
  }

  return {
    taxable,
    vat,
    total: taxable.plus(vat),
    cost,
    gross_profit: grossProfit,
    markup_pct: percentage(grossProfit, cost),
    margin_pct: percentage(grossProfit, taxable),
  };
}

function percentageDifference(price: MonetaryValue, cost: MonetaryValue): number | null {
  return percentage(price.minus(cost), cost);
}

function percentage(numerator: MonetaryValue, denominator: MonetaryValue): number | null {
  if (denominator.isZero()) return null;
  return numerator.dividedBy(denominator).times(100).toNumber();
}

function parseQuantity(raw: string | number): Decimal {
  const normalized = String(raw).trim().replace(",", ".");
  let quantity: Decimal;
  try {
    quantity = new Decimal(normalized);
  } catch {
    throw new TypeError("La quantità deve essere un numero valido.");
  }
  if (!quantity.isFinite() || quantity.lte(0)) {
    throw new RangeError("La quantità deve essere maggiore di zero.");
  }
  return quantity;
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} deve essere un numero valido.`);
}

function assertVatRate(value: number): asserts value is QuoteVatRate {
  if (![0, 4, 10, 22].includes(value)) {
    throw new RangeError("L'aliquota IVA deve essere 0, 4, 10 o 22.");
  }
}

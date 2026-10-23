import { describe, expect, it } from "vitest";
import { money } from "@/shared/domain/monetaryValue";
import { calculateQuoteItem, calculateQuoteTotals } from "../quoteCalculations";
import { QuoteItemInput } from "../../models/quote";

function item(overrides: Partial<QuoteItemInput> = {}): QuoteItemInput {
  return {
    description: "Materiale",
    quantity: "1",
    purchase_price: money(50),
    markup_pct: 40,
    discount_pct: 5,
    vat_rate: 22,
    ...overrides,
  };
}

describe("quoteCalculations", () => {
  it("calcola ricarico, sconti in cascata, imponibile, costo e IVA", () => {
    const row = calculateQuoteItem(item({ quantity: "4" }), 10);

    expect(row.base_unit_price.toSubunits()).toBe(7_000_000);
    expect(row.effective_unit_price.toSubunits()).toBe(5_985_000);
    expect(row.net_amount.toSubunits()).toBe(23_940_000);
    expect(row.cost_total.toSubunits()).toBe(20_000_000);
    expect(row.gross_profit.toSubunits()).toBe(3_940_000);
    expect(row.vat_amount.toSubunits()).toBe(5_266_800);
    expect(row.effective_markup_pct).toBeCloseTo(19.7, 8);
    expect(row.margin_pct).toBeCloseTo((9.85 / 59.85) * 100, 8);
  });

  it("ricalcola il ricarico dal prezzo base inserito manualmente", () => {
    const row = calculateQuoteItem(item({ base_unit_price: money(80) }), 0);

    expect(row.base_unit_price.toSubunits()).toBe(8_000_000);
    expect(row.markup_pct).toBe(60);
  });

  it("usa il prezzo forzato come prezzo effettivo prima degli sconti", () => {
    const row = calculateQuoteItem(item({ forced_unit_price: money("61.25") }), 10);

    expect(row.effective_unit_price.toSubunits()).toBe(6_125_000);
    expect(row.effective_markup_pct).toBe(22.5);
    expect(row.net_amount.toSubunits()).toBe(6_125_000);
  });

  it("restituisce ricarico nullo quando il costo è zero e margine coerente", () => {
    const row = calculateQuoteItem(item({
      purchase_price: money(0),
      base_unit_price: money(0),
      forced_unit_price: money(12),
      markup_pct: null,
      discount_pct: 0,
      vat_rate: 0,
    }), 0);

    expect(row.markup_pct).toBeNull();
    expect(row.effective_markup_pct).toBeNull();
    expect(row.margin_pct).toBe(100);
    expect(row.vat_amount.isZero()).toBe(true);
  });

  it("calcola aliquote IVA per riga e KPI aggregati", () => {
    const rows = [
      calculateQuoteItem(item({ purchase_price: money(10), markup_pct: 0, discount_pct: 0, vat_rate: 22 }), 0),
      calculateQuoteItem(item({ purchase_price: money(10), markup_pct: 0, discount_pct: 0, vat_rate: 10 }), 0),
      calculateQuoteItem(item({ purchase_price: money(10), markup_pct: 0, discount_pct: 0, vat_rate: 4 }), 0),
      calculateQuoteItem(item({ purchase_price: money(10), markup_pct: 0, discount_pct: 0, vat_rate: 0 }), 0),
    ];
    const totals = calculateQuoteTotals(rows);

    expect(totals.taxable.toSubunits()).toBe(4_000_000);
    expect(totals.vat.toSubunits()).toBe(360_000);
    expect(totals.total.toSubunits()).toBe(4_360_000);
    expect(totals.markup_pct).toBe(0);
    expect(totals.margin_pct).toBe(0);
  });

  it("supporta una maggiorazione globale negativa", () => {
    const row = calculateQuoteItem(item({ purchase_price: money(100), markup_pct: 0, discount_pct: 0 }), -10);
    expect(row.effective_unit_price.toSubunits()).toBe(11_000_000);
  });

  it("restituisce KPI nulli sui totali senza denominatore", () => {
    const totals = calculateQuoteTotals([]);
    expect(totals.markup_pct).toBeNull();
    expect(totals.margin_pct).toBeNull();
  });

  it("rifiuta quantità, sconti e aliquote non valide", () => {
    expect(() => calculateQuoteItem(item({ quantity: "0" }), 0)).toThrow(RangeError);
    expect(() => calculateQuoteItem(item({ discount_pct: 101 }), 0)).toThrow(RangeError);
    expect(() => calculateQuoteItem(item({ vat_rate: 8 as QuoteItemInput["vat_rate"] }), 0)).toThrow(RangeError);
  });
});

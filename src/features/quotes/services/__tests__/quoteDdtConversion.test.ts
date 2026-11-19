import { describe, expect, it } from "vitest";
import { money } from "@/shared/domain/monetaryValue";
import { buildQuoteDdtConversion } from "../quoteDdtConversion";
import { createEmptyQuoteDraft, toQuoteInput } from "../../models/quoteDraft";
import { calculateDdtTotals } from "@/features/ddt-studio/utils/ddtCalculations";

describe("buildQuoteDdtConversion forced_unit_price preservation", () => {
  it("preserves forced_unit_price from editor toQuoteInput even when discount_pct > 0 without global discount", () => {
    const draft = createEmptyQuoteDraft();
    draft.quote_date = "2026-11-19";
    draft.client_name = "ACME SRL";
    draft.global_discount_pct = 0;
    draft.items[0] = {
      ...draft.items[0],
      description: "Articolo test",
      unit: "NR",
      quantity: "1",
      purchase_price: "50",
      base_unit_price: "100",
      forced_unit_price: "80",
      discount_pct: 10,
      vat_rate: 22,
    };

    const input = toQuoteInput(draft);
    const result = buildQuoteDdtConversion(input, "ddt-test-1");

    expect(result.items).toHaveLength(1);
    expect(result.items[0].unit_price.toNumber()).toBe(80);
    expect(result.items[0].discount_pct).toBe("0");
    expect(result.items[0].net_amount.toNumber()).toBe(80);
    expect(result.items[0].vat_amount.toNumber()).toBe(17.6);
    expect(result.ddt.total_document?.toNumber()).toBe(97.6);

    // Verify recalculating in DDT Studio produces the exact same totals
    const ddtRecalc = calculateDdtTotals(result.items);
    expect(ddtRecalc.totale_imponibile.toNumber()).toBe(80);
    expect(ddtRecalc.totale_iva.toNumber()).toBe(17.6);
    expect(ddtRecalc.totale_documento.toNumber()).toBe(97.6);
    expect(money(ddtRecalc.totale_documento).toNumber()).toBe(97.6);
  });
});

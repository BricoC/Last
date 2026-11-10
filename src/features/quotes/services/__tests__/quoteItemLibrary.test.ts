import { describe, it, expect } from "vitest";
import { money } from "@/shared/domain/monetaryValue";
import type { QuoteFavoriteItemInput } from "../../models/quoteLibrary";

describe("Quote Item Library Model & Value Conversions", () => {
  it("correctly converts prices to subunits and back", () => {
    const input: QuoteFavoriteItemInput = {
      description: "MANODOPERA SPECIALIZZATA",
      unit: "ORE",
      category: "Manodopera",
      purchase_price: "25.00",
      forced_unit_price: "45.00",
      base_unit_price: "45.00",
      vat_rate: 22,
    };

    const costSubunits = money(input.purchase_price).toSubunits();
    const saleSubunits = money(input.forced_unit_price).toSubunits();

    expect(costSubunits).toBe(2500000);
    expect(saleSubunits).toBe(4500000);
    expect(money(input.purchase_price).formatIT(true, 2, 2)).toBe("25,00 €");
    expect(money(input.forced_unit_price).formatIT(true, 2, 2)).toBe("45,00 €");
  });

  it("handles optional suppliers, codes and zero costs correctly", () => {
    const input: QuoteFavoriteItemInput = {
      description: "TRASPORTO E CONSEGNA A DOMICILIO",
      category: "Trasporto",
      unit: "A CORPO",
      purchase_price: 0,
      forced_unit_price: "30.00",
    };

    expect(money(input.purchase_price).isZero()).toBe(true);
    expect(money(input.forced_unit_price).toSubunits()).toBe(3000000);
  });
});

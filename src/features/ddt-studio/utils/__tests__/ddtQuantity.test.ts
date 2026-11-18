import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { money } from "@/shared/domain/monetaryValue";
import { calculateDdtTotals, calculateRowAmounts } from "../ddtCalculations";
import { ddtQuantitySql, parseDdtQuantity } from "../ddtQuantity";

describe("Quantità DDT", () => {
  it("interpreta allo stesso modo le quantità in TypeScript e nelle query SQLite", () => {
    const db = new DatabaseSync(":memory:");
    try {
      const parse = db.prepare(`SELECT ${ddtQuantitySql("$quantity")} AS quantity`);
      const examples: [string | null, number | null][] = [
        ["1,5", 1.5], ["1.250,5", 1250.5], ["1.250", 1.25], ["1.234.567", 1234567],
        ["1,234.5", 1234.5], ["-0,25", -0.25], ["+0", 0], ["1e-7", 1e-7], [",5", 0.5],
        ["", null], [null, null], ["1,2,3", null], ["12.34,5", null], ["1e999", null], ["abc 14", null],
      ];
      for (const [quantity, expected] of examples) {
        expect(parseDdtQuantity(quantity), String(quantity)).toBe(expected);
        expect(parse.get({ $quantity: quantity })?.quantity, String(quantity)).toBe(expected);
      }
    } finally {
      db.close();
    }
  });

  it("usa la quantità con migliaia per imponibile, IVA e costo, conservando lo zero", () => {
    const totals = calculateDdtTotals([{
      description: "Articolo", quantity: "1.250,5", unit_price: money(2), purchase_price: money(1), vat_rate: 0,
    }]);
    expect(totals.totale_imponibile.toNumber()).toBe(2501);
    expect(totals.totale_acquisto?.toNumber()).toBe(1250.5);
    expect(totals.totale_iva.toNumber()).toBe(0);
    expect(calculateRowAmounts("0", money(3), 0, 22).netAmount.toNumber()).toBe(0);
    expect(calculateRowAmounts("malformato", money(3)).netAmount.toNumber()).toBe(0);
  });
});

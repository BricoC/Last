import { describe, expect, it } from "vitest";
import { generalPriceVariation } from "../generalPriceHistory";

describe("Variazioni dello storico del Listino Generale", () => {
  it("legge le frazioni per l'aliquota iniziale senza soglie", () => {
    expect(generalPriceVariation(0, 4, true)).toBe(400);
    expect(generalPriceVariation(null, 0.02, true)).toBe(2);
    expect(generalPriceVariation(null, 0, true)).toBe(0);
    expect(generalPriceVariation(0, 4)).toBeNull();
    expect(generalPriceVariation(20, 24)).toBe(20);
  });
});

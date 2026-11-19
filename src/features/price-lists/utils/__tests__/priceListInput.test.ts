import { describe, expect, it } from "vitest";
import { formatPriceListInput, parsePriceListNumber } from "../priceListInput";

describe("Valori in modifica e negli appunti dei listini", () => {
  it.each([
    ["perc_iva", 0.22, "22%"],
    ["perc_iva", 0, "0%"],
    ["perc_pub", 0.5, "50%"],
    ["aumento", 4, "400%"],
  ])("formatta %s in punti percentuali", (column, fraction, text) => {
    expect(formatPriceListInput(fraction, column)).toBe(text);
    expect(parsePriceListNumber(text)! / 100).toBe(fraction);
  });

  it("conserva cifre e precisione delle celle non percentuali", () => {
    expect(formatPriceListInput(12.34567, "prezzo_acquisto")).toBe("12.34567");
    expect(formatPriceListInput("00081", "codice_articolo")).toBe("00081");
    expect(formatPriceListInput(null, "perc_iva")).toBe("");
  });

  it.each([["1,234.56", 1234.56], ["1.234,56", 1234.56], ["1.234.567", 1234567], ["22%", 22]])(
    "converte %s con le unità dei listini clienti",
    (text, result) => expect(parsePriceListNumber(text)).toBe(result),
  );
});

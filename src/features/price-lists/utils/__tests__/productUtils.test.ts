import { describe, it, expect } from "vitest";
import {
  centsToEuro,
  euroToCents,
  parseEuroStringToCents,
  formatCentsToEuro,
  calculateMarkupPercentage,
} from "../currencyUtils";
import { validateProductInput } from "../productValidation";

describe("currencyUtils", () => {
  it("converte correttamente centesimi in euro e viceversa", () => {
    expect(centsToEuro(158)).toBe(1.58);
    expect(euroToCents(1.58)).toBe(158);
    expect(euroToCents(0.1 + 0.2)).toBe(30); // Prevenzione precisione floating point
  });

  it("parsifica correttamente stringhe utente con virgola o punto", () => {
    expect(parseEuroStringToCents("1,58")).toBe(158);
    expect(parseEuroStringToCents("1.58 €")).toBe(158);
    expect(parseEuroStringToCents("15")).toBe(1500);
    expect(parseEuroStringToCents("0,05")).toBe(5);
    expect(parseEuroStringToCents("")).toBe(0);
  });

  it("formatta correttamente in stile italiano", () => {
    const formatted = formatCentsToEuro(158, false);
    expect(formatted).toBe("1,58");
  });

  it("calcola correttamente la percentuale di ricarico", () => {
    // Acquisto 1.00 € (100 cent), Vendita 1.50 € (150 cent) -> +50%
    expect(calculateMarkupPercentage(100, 150)).toBe(50);
    // Acquisto 0 -> 0
    expect(calculateMarkupPercentage(0, 100)).toBe(0);
  });
});

describe("productValidation", () => {
  it("accetta un articolo valido", () => {
    const res = validateProductInput({
      code: "TAS-SX6",
      description: "Tassello Fischer SX 6mm",
      unit: "NR",
      purchase_price_cents: 15,
      sale_price_cents: 35,
      vat_rate: 22,
    });

    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("rifiuta codice mancante o troppo corto", () => {
    const res = validateProductInput({
      code: "A",
      description: "Test",
    });

    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.field === "code")).toBe(true);
  });

  it("rifiuta descrizione vuota", () => {
    const res = validateProductInput({
      code: "TEST-01",
      description: "   ",
    });

    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.field === "description")).toBe(true);
  });

  it("rifiuta prezzi negativi o IVA non valida", () => {
    const res = validateProductInput({
      code: "TEST-01",
      description: "Articolo Test",
      purchase_price_cents: -50,
      vat_rate: 150,
    });

    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.field === "purchase_price_cents")).toBe(true);
    expect(res.errors.some((e) => e.field === "vat_rate")).toBe(true);
  });
});

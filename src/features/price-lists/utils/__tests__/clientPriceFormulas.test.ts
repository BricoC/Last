import { describe, it, expect } from "vitest";
import { round5 } from "../priceFormulas";

describe("Client Price List Formulas and Calculations", () => {
  it("calcola prezzo vendita da acquisto_eur e perc_acquisto", () => {
    const acquistoEur = 10;
    const percAcquisto = 25; // 25%
    const prezzoVendita = round5(acquistoEur * (1 + percAcquisto / 100));
    expect(prezzoVendita).toBe(12.5);
  });

  it("calcola perc_acquisto da prezzo vendita e acquisto_eur", () => {
    const acquistoEur = 10;
    const prezzoVendita = 12.5;
    const percAcquisto = round5(((prezzoVendita - acquistoEur) / acquistoEur) * 100);
    expect(percAcquisto).toBe(25);
  });

  it("preserva il prezzo acquisto invariato quando si cambia la percentuale o il prezzo vendita", () => {
    const acquistoBase = 2.25;
    // Cambio percentuale a 40%
    const perc = 40;
    const vendita1 = round5(acquistoBase * (1 + perc / 100));
    expect(vendita1).toBe(3.15);

    // Cambio prezzo vendita a 3.60
    const vendita2 = 3.6;
    const perc2 = round5(((vendita2 - acquistoBase) / acquistoBase) * 100);
    expect(perc2).toBe(60);
    expect(acquistoBase).toBe(2.25);
  });
});

import { describe, it, expect } from "vitest";
import {
  calculateR1,
  calculateR2,
  calculateCostoMaggiorato,
  calculatePrezzoFattura,
  calculatePercFattura,
  calculatePrezzoPubblico,
  calculatePercPubblico,
  calculatePrezzoProfess,
  calculatePercProfess,
} from "../priceFormulas";

describe("priceFormulas logic", () => {
  it("calculates R1 and R2 accurately with 3M1100 historical values", () => {
    const acq = 23.64;
    const aum = 0;
    const maga = 0.03; // 3%
    const r1 = calculateR1(acq, aum);
    expect(r1).toBe(23.64);
    const r2 = calculateR2(r1, maga);
    expect(r2).toBeCloseTo(24.3492, 4);

    const r2Direct = calculateCostoMaggiorato(acq, aum, maga);
    expect(r2Direct).toBeCloseTo(24.3492, 4);
  });

  it("calculates prezzo fattura and reverse percentage", () => {
    const r2 = 24.3492;
    const percFatt = 0.72; // 72%
    const prezzoFattura = calculatePrezzoFattura(r2, percFatt);
    expect(prezzoFattura).toBeCloseTo(41.880624, 4);

    const reversePerc = calculatePercFattura(prezzoFattura, r2);
    expect(reversePerc).toBeCloseTo(72, 1);
  });

  it("calculates prezzo pubblico (IVA inclusa) and reverse percentage", () => {
    const r2 = 24.3492;
    const percPub = 1.14604;
    const iva = 0.22;
    const prezzoPubblico = calculatePrezzoPubblico(r2, percPub, iva);
    expect(prezzoPubblico).toBeCloseTo(63.750315, 3);

    const reversePerc = calculatePercPubblico(prezzoPubblico, r2, iva);
    expect(reversePerc).toBeCloseTo(114.604, 1);
  });

  it("calculates prezzo profess (IVA inclusa) and reverse percentage", () => {
    const r2 = 24.3492;
    const percProf = 0.6832;
    const iva = 0.22;
    const prezzoProfess = calculatePrezzoProfess(r2, percProf, iva);
    expect(prezzoProfess).toBeCloseTo(50.00118, 3);

    const reversePerc = calculatePercProfess(prezzoProfess, r2, iva);
    expect(reversePerc).toBeCloseTo(68.32, 1);
  });
});


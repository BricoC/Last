import { describe, it, expect } from "vitest";
import { MonetaryValue, money } from "../monetaryValue";

describe("MonetaryValue (Requisito 5 Decimali Esatti)", () => {
  it("rappresenta e formatta esattamente i valori a 5 cifre decimali", () => {
    expect(money(12).formatIT(false)).toBe("12,00000");
    expect(money("12,3").formatIT(false)).toBe("12,30000");
    expect(money("12,34567").formatIT(false)).toBe("12,34567");
    expect(money("0,00001").formatIT(false)).toBe("0,00001");
    expect(money("0,15800").formatIT(true)).toBe("0,15800 €");
  });

  it("converte correttamente da e verso interi scalati per SQLite (fattore 100.000)", () => {
    // 0,15800 € -> 15800 subunits
    const val = money("0,15800");
    expect(val.toSubunits()).toBe(15800);

    const fromSub = MonetaryValue.fromSubunits(15800);
    expect(fromSub.toCanonicalString()).toBe("0.15800");
    expect(fromSub.formatIT(false)).toBe("0,15800");

    // 12,34567 € -> 1234567 subunits
    const val2 = money("12,34567");
    expect(val2.toSubunits()).toBe(1234567);
    expect(MonetaryValue.fromSubunits(1234567).formatIT(false)).toBe("12,34567");

    // 0,00001 € -> 1 subunit
    expect(money("0,00001").toSubunits()).toBe(1);
    expect(MonetaryValue.fromSubunits(1).toCanonicalString()).toBe("0.00001");
  });

  it("migra determinatamente i vecchi prezzi in centesimi (cents * 1000)", () => {
    // Vecchio prodotto con 158 centesimi (1,58 €)
    const migrated = MonetaryValue.fromLegacyCents(158);
    expect(migrated.toCanonicalString()).toBe("1.58000");
    expect(migrated.formatIT(false)).toBe("1,58000");
    expect(migrated.toSubunits()).toBe(158000);
  });

  it("esegue calcoli di riga senza errori di floating point (quantità * prezzo)", () => {
    // 15 pezzi a 0,15800 € = 2,37000 € (Esattamente come nel PDF BricoClass!)
    const qta = 15;
    const prezzo = money("0,15800");
    const totale = prezzo.times(qta);

    expect(totale.toCanonicalString()).toBe("2.37000");
    expect(totale.formatIT(true)).toBe("2,37000 €");
    expect(totale.toSubunits()).toBe(237000);
  });

  it("esegue il calcolo delle 3 righe del documento cartaceo BricoClass fedelmente", () => {
    // Riga 1: 15 * 0,15800 = 2,37000 €
    const riga1 = money("0,15800").times(15);
    // Riga 2: 15 * 0,03000 = 0,45000 €
    const riga2 = money("0,03000").times(15);
    // Riga 3: 15 * 0,01200 = 0,18000 €
    const riga3 = money("0,01200").times(15);

    expect(riga1.formatIT(false)).toBe("2,37000");
    expect(riga2.formatIT(false)).toBe("0,45000");
    expect(riga3.formatIT(false)).toBe("0,18000");

    // Totale imponibile: 2,37000 + 0,45000 + 0,18000 = 3,00000 €
    const totaleImponibile = riga1.plus(riga2).plus(riga3);
    expect(totaleImponibile.formatIT(false)).toBe("3,00000");

    // Imposta IVA 22%: 3,00000 * 0.22 = 0,66000 €
    const imposta = totaleImponibile.calculateVat(22);
    expect(imposta.formatIT(false)).toBe("0,66000");

    // Totale Documento: 3,00000 + 0,66000 = 3,66000 €
    const totaleDocumento = totaleImponibile.plus(imposta);
    expect(totaleDocumento.formatIT(false)).toBe("3,66000");
  });

  it("gestisce sconti percentuali con precisione", () => {
    // Prezzo 100,00000 €, sconto 15% -> 85,00000 €
    const scontato = money(100).applyDiscount(15);
    expect(scontato.formatIT(false)).toBe("85,00000");

    // Prezzo 12,34567 €, sconto 3.5%
    const sc2 = money("12,34567").applyDiscount("3.5");
    // 12.34567 * 0.965 = 11.91357155 -> arrotondato a 5 dec: 11.91357
    expect(sc2.toCanonicalString()).toBe("11.91357");
  });

  it("parsifica formati italiani ed internazionali con tolleranza", () => {
    expect(money("1.234,56789").toCanonicalString()).toBe("1234.56789");
    expect(money("  €  45,50000  ").toCanonicalString()).toBe("45.50000");
    expect(money("").toCanonicalString()).toBe("0.00000");
    expect(money(null).toCanonicalString()).toBe("0.00000");
  });
});

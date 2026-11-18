import { describe, it, expect } from "vitest";
import { parseAnyDate, parseCustomerPriceListExcelRow, parseSafeNum } from "../manualPriceListImportService";

describe("manualPriceListImportService - parseCustomerPriceListExcelRow", () => {
  it("parses standard FATTURA as well as spaced ' FATTURA' and VENDITA header variants", () => {
    const standard = parseCustomerPriceListExcelRow(
      { DESCRIZIONE: "ART 1", FATTURA: 12.5, ACQUISTO: "10 net", RICARICO: "25%" },
      "LIST_TEST",
      "TEST.xls"
    );
    expect(standard?.prezzo_fattura).toBe(12.5);
    expect(standard?.acquisto_old).toBe("10 net");
    expect(standard?.hasTextAcquisto).toBe(true);
    expect(standard?.ricarico).toBe(25);

    const vendita = parseCustomerPriceListExcelRow(
      { DESCRIZIONE: "ABR. STEARATA MT", VENDITA: 2.1, ACQUISTO: "", RICARICO: "25" },
      "LIST_PEDRETTI CARLO",
      "PEDRETTI CARLO.xls"
    );
    expect(vendita?.prezzo_fattura).toBe(2.1);

    const spaced = parseCustomerPriceListExcelRow(
      { DESCRIZIONE: "3M 1310 ARCHETTO", " FATTURA": 4.583, ACQUISTO: "083M 2,917", RICARICO: "57.114% 08" },
      "LIST_NUTINI",
      "NUTINI.xls"
    );
    expect(spaced?.prezzo_fattura).toBe(4.583);

    const venditaFattura = parseCustomerPriceListExcelRow(
      { DESCRIZIONE: "ABRASIVA 100", "VENDITA FATTURA": 1.15, ACQUISTO: "", RICARICO: "08-" },
      "LIST_TIME",
      "TIME.xls"
    );
    expect(venditaFattura?.prezzo_fattura).toBe(1.15);

    const prezzoConIva = parseCustomerPriceListExcelRow(
      { DESCRIZIONE: "PRODOTTO CORRADO", "PREZZO CON IVA": "9,90", ACQUISTO: "" },
      "LIST_CORRADO",
      "CORRADO.xls"
    );
    expect(prezzoConIva?.prezzo_fattura).toBe(9.9);

    const venditaIvaCompresa = parseCustomerPriceListExcelRow(
      { DESCRIZIONE: "ABRASIVA 3M", "VENDITA IVA COMPRESA": 1.35, ACQUISTO: "18 1,02 NETTO" },
      "LIST_DEL GHINGARO DANIELE",
      "DEL GHINGARO DANIELE.xls"
    );
    expect(venditaIvaCompresa?.prezzo_fattura).toBe(1.35);
  });

  it("ignores empty or '0' description rows cleanly", () => {
    expect(parseCustomerPriceListExcelRow({ DESCRIZIONE: "", FATTURA: 5 }, "LIST_A", "A.xls")).toBeNull();
    expect(parseCustomerPriceListExcelRow({ DESCRIZIONE: "0", FATTURA: 5 }, "LIST_A", "A.xls")).toBeNull();
  });

  it("parses Italian thousands separators and DD/MM/YYYY dates accurately", () => {
    expect(parseSafeNum("1.234,56 €")).toBe(1234.56);
    expect(parseSafeNum("1.234.567")).toBe(1234567);
    expect(parseAnyDate("05/11/2026").iso).toBe("2026-11-05");
    expect(parseAnyDate("25/11/2026").iso).toBe("2026-11-25");
    expect(parseAnyDate("11/25/2026").iso).toBe("2026-11-25");
  });
});

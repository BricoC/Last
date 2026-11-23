import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildCustomerPriceListWorkbook } from "../customerPriceListWorkbook";
import { buildGeneralPriceListWorkbook } from "../generalPriceListWorkbook";
import { sanitizeExcelFilename, toExcelFraction } from "../priceListExcelExportService";
import { ListinoClienteRow, ListinoGeneraleRow } from "../../models/priceList";

describe("priceListExcelExportService", () => {
  it("sanitizes Windows filenames cleanly", () => {
    expect(sanitizeExcelFilename('A/B\\C:D*E?F"G<H>I|J.. ')).toBe("A_B_C_D_E_F_G_H_I_J");
    expect(sanitizeExcelFilename("   ")).toBe("Cliente");
  });

  it("preserves stored decimal fractions cleanly for Excel cells (including <=2% and >200%)", () => {
    expect(toExcelFraction(0.02)).toBe(0.02);
    expect(toExcelFraction(0.22)).toBe(0.22);
    expect(toExcelFraction(1.14604)).toBe(1.14604);
    expect(toExcelFraction(4.0)).toBe(4);
    expect(toExcelFraction(0)).toBe(0);
    expect(toExcelFraction(null)).toBeNull();
  });

  it("builds General Price List Excel with Foglio1 headers and live Excel formulas", async () => {
    const rows: ListinoGeneraleRow[] = [
      {
        id: "gen_1",
        source_table: "listino_generale",
        cat: "ANTINFORTUNISTICA",
        fornitore: "FRANZ",
        codice_articolo: "3M1100",
        data_ref: "2020.09.25",
        descrizione: "3M 1100 INSERTI",
        um: "CF.",
        perc_pub: 1.14604,
        prezzo_pubblico: 63.75,
        perc_prof: 0.6832,
        prezzo_profess: 50.001,
        perc_fatt: 0.72,
        prezzo_fattura: 41.881,
        prezzo_acquisto: 23.64,
        aumento: 0,
        r1: 23.64,
        maga: 0.03,
        r2: 24.3492,
        perc_iva: 0.22,
        note: "Nota test",
      },
      {
        id: "var_2",
        source_table: "listini_vari",
        cat: "VARIE",
        fornitore: "VARI",
        codice_articolo: "X01",
        data_ref: "2026.11.17",
        descrizione: "VOCE A PREZZO FISSO",
        um: "NR.",
        perc_pub: null,
        prezzo_pubblico: 15.5,
        perc_prof: null,
        prezzo_profess: 13.0,
        perc_fatt: null,
        prezzo_fattura: 11.0,
        prezzo_acquisto: null,
        aumento: null,
        r1: null,
        maga: null,
        r2: null,
        perc_iva: 0.22,
        note: null,
      },
    ];

    const wb = buildGeneralPriceListWorkbook(rows);
    const ws = wb.getWorksheet("Foglio1");
    expect(ws).toBeDefined();

    // Headers row 2
    expect(ws?.getCell("A2").value).toBe("CATEGORIA");
    expect(ws?.getCell("H2").value).toBe("PUBBLICO");
    expect(ws?.getCell("Q2").value).toBe("R2");
    expect(ws?.getCell("R2").value).toBe("IVA");

    // Row 3 has live formulas matching LISTINO GENERALE.xlsm
    expect(ws?.getCell("O3").formula).toBe("M3*(1+N3)");
    expect(ws?.getCell("Q3").formula).toBe("O3*(1+P3)");
    expect(ws?.getCell("L3").formula).toBe("Q3*(1+K3)");
    expect(ws?.getCell("J3").formula).toBe("((Q3*I3)+Q3)*(1+R3)");
    expect(ws?.getCell("H3").formula).toBe("((Q3*G3)+Q3)*(1+R3)");
    expect(ws?.getCell("S3").value).toBe("Nota test");

    // Row 4 without cost keeps fixed numeric prices
    expect(ws?.getCell("H4").value).toBe(15.5);
    expect(ws?.getCell("L4").value).toBe(11.0);

    // Verify valid XLSX serialization
    const buf = await wb.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buf);
    expect(reloaded.getWorksheet("Foglio1")?.getCell("E3").value).toBe("3M 1100 INSERTI");
  });

  it("builds Customer Price List Excel with sale formula when cost and % exist", async () => {
    const rows: ListinoClienteRow[] = [
      {
        id: "cli_1",
        cliente: "LIST_CARTIERE CARRARA",
        fornitore: "HIKOKI",
        codice_articolo: "CJ18DB",
        data_ref: "2026.11.17",
        descrizione: "SEGACCIO ALTERNATIVO",
        prezzo_fattura: 250.0,
        prezzo_acquisto: 200.0,
        acquisto_eur: 200.0,
        perc_acquisto: 25,
        data_acquisto: "2026.11.10",
        acquisto_old: null,
        ricarico: null,
        note: "Netto",
        note1: null,
        note2: null,
      },
      {
        id: "cli_2",
        cliente: "LIST_CARTIERE CARRARA",
        fornitore: "VARI",
        codice_articolo: null,
        data_ref: null,
        descrizione: "MINUTERIA FISSA",
        prezzo_fattura: 12.5,
        prezzo_acquisto: null,
        acquisto_eur: null,
        perc_acquisto: null,
        data_acquisto: null,
        acquisto_old: "10 net",
        ricarico: "25%",
        note: null,
        note1: null,
        note2: null,
      },
    ];

    const wb = buildCustomerPriceListWorkbook("CARTIERE CARRARA", rows);
    const ws = wb.getWorksheet("Listino Cliente");
    expect(ws).toBeDefined();

    // Row 3 has live formula E3 = G3*(1+F3)
    expect(ws?.getCell("E3").formula).toBe("G3*(1+F3)");
    expect(ws?.getCell("F3").value).toBe(0.25);
    expect(ws?.getCell("G3").value).toBe(200);

    // Row 4 keeps fixed price
    expect(ws?.getCell("E4").value).toBe(12.5);
    expect(ws?.getCell("I4").value).toBe("10 net");

    const buf = await wb.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buf);
    expect(reloaded.getWorksheet("Listino Cliente")?.getCell("D3").value).toBe("SEGACCIO ALTERNATIVO");
  });
});

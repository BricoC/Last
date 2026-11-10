import { describe, it, expect } from "vitest";
import { isCellInRange, parseTsv, formatTsv, normalizeExcelRowCells, type CellRange } from "../gridClipboardHelper";

describe("gridClipboardHelper", () => {
  const cols = ["unit", "quantity", "description", "unit_price", "discount_pct"];

  it("identifies cells inside a single-cell range", () => {
    const range: CellRange = {
      start: { rowIndex: 2, colId: "description" },
      end: { rowIndex: 2, colId: "description" },
    };

    expect(isCellInRange(2, "description", range, cols)).toBe(true);
    expect(isCellInRange(1, "description", range, cols)).toBe(false);
    expect(isCellInRange(2, "quantity", range, cols)).toBe(false);
  });

  it("identifies cells inside a multi-row multi-column range regardless of drag direction", () => {
    // Trascinamento dall'angolo in basso a destra all'angolo in alto a sinistra
    const range: CellRange = {
      start: { rowIndex: 4, colId: "unit_price" },
      end: { rowIndex: 1, colId: "quantity" },
    };

    // Righe 1, 2, 3, 4 e colonne quantity, description, unit_price
    expect(isCellInRange(1, "quantity", range, cols)).toBe(true);
    expect(isCellInRange(2, "description", range, cols)).toBe(true);
    expect(isCellInRange(4, "unit_price", range, cols)).toBe(true);
    expect(isCellInRange(3, "unit", range, cols)).toBe(false); // Fuori a sinistra
    expect(isCellInRange(5, "quantity", range, cols)).toBe(false); // Fuori in basso
    expect(isCellInRange(0, "description", range, cols)).toBe(false); // Fuori in alto
  });

  it("parses single column from Excel", () => {
    const raw = "OLFA L1\r\nCF. GUANTI NITRILE NERI TG. L\r\nADATTATORE 16-10/16\r\n";
    const res = parseTsv(raw);
    expect(res).toEqual([
      ["OLFA L1"],
      ["CF. GUANTI NITRILE NERI TG. L"],
      ["ADATTATORE 16-10/16"],
    ]);
  });

  it("parses multiple columns from Excel with tab separation", () => {
    const raw = "NR.\t1\tOLFA L1\r\nNR.\t2\tCF. GUANTI\r\n";
    const res = parseTsv(raw);
    expect(res).toEqual([
      ["NR.", "1", "OLFA L1"],
      ["NR.", "2", "CF. GUANTI"],
    ]);
  });

  it("formats matrix to Excel-compatible TSV string", () => {
    const matrix = [
      ["NR.", "1", "OLFA L1"],
      ["NR.", "2", "CF. GUANTI"],
    ];
    const tsv = formatTsv(matrix);
    expect(tsv).toBe("NR.\t1\tOLFA L1\r\nNR.\t2\tCF. GUANTI");
  });

  it("normalizes Excel rows with merged description columns (removes phantom empty columns before price)", () => {
    // Simulazione riga Excel con U.M., Quantità, Descrizione unita su 4 celle, Prezzo, Sconto
    const excelRow = ["NR.", "1", "VITE TE 8.8 M 6X30", "", "", "", "0,0230", "0%"];
    const colOrder = ["unit", "quantity", "description", "unit_price", "discount_pct"];

    const normalized = normalizeExcelRowCells(excelRow, 0, colOrder);
    expect(normalized).toEqual(["NR.", "1", "VITE TE 8.8 M 6X30", "0,0230", "0%"]);
  });

  it("leaves normal rows unchanged when no phantom empty columns exist", () => {
    const normalRow = ["NR.", "1", "VITE TE 8.8 M 6X30", "0,0230"];
    const colOrder = ["unit", "quantity", "description", "unit_price", "discount_pct"];

    const normalized = normalizeExcelRowCells(normalRow, 0, colOrder);
    expect(normalized).toEqual(["NR.", "1", "VITE TE 8.8 M 6X30", "0,0230"]);
  });
});


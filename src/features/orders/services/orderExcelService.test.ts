import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { OrderExcelService } from "./orderExcelService";

function workbookFile(rows: unknown[][], format: "xlsx" | "xls" = "xlsx"): File {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Ordini");
  const bytes = XLSX.write(workbook, { bookType: format === "xls" ? "biff8" : "xlsx", type: "array" });
  return new File([bytes], "ordini.xlsx");
}

describe("OrderExcelService.parseOrdersExcelFile", () => {
  it("imports xlsx rows, skips the header and normalizes descriptions", async () => {
    const service = new OrderExcelService();
    const result = await service.parseOrdersExcelFile(
      workbookFile([
        ["Data", "Fornitore", "Codice", "Descrizione", "Quantità", "Prezzo", "Data invio", "Note"],
        ["20/11/2026", "Fornitore Uno", "A-10", "articolo prova", 4, 12.5, "21/11/2026", "urgente"],
        ["", "", "", "", "", "", "", ""],
      ])
    );

    expect(result).toEqual([
      {
        order_date: "20/11/2026",
        supplier_name: "Fornitore Uno",
        article_code: "A-10",
        description: "ARTICOLO PROVA",
        quantity: "4",
        price: "12.5",
        ordered_date: "21/11/2026",
        notes: "urgente",
      },
    ]);
  });

  it("returns no rows for a workbook with only a header", async () => {
    const service = new OrderExcelService();
    await expect(service.parseOrdersExcelFile(workbookFile([["Data", "Fornitore"]]))).resolves.toEqual([]);
  });

  it("keeps legacy xls order imports readable", async () => {
    const service = new OrderExcelService();
    const result = await service.parseOrdersExcelFile(
      workbookFile(
        [
          ["Data", "Fornitore", "Codice", "Descrizione", "Quantità", "Prezzo"],
          ["20/11/2026", "Fornitore Uno", "A-10", "articolo prova", 4, 12.5],
        ],
        "xls"
      )
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ supplier_name: "Fornitore Uno", description: "ARTICOLO PROVA" });
  });
});

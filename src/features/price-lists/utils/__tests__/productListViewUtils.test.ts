import { describe, it, expect } from "vitest";
import {
  applyBulkActionToGeneralRow,
  buildGeneralPriceChangeLogs,
  createBlankGeneralRow,
  filterAndSortGeneralItems,
  formatDateAaaaMmGg,
  updateGeneralRowWithField,
} from "../productListViewUtils";
import type { ListinoGeneraleRow } from "../../models/priceList";

const baseRow: ListinoGeneraleRow = {
  id: "row-1",
  source_table: "listino_generale",
  cat: "FERRAMENTA",
  fornitore: "WURTH",
  codice_articolo: "VITI-10",
  data_ref: "2026.01.01",
  descrizione: "Viti acciaio",
  um: "PZ",
  perc_pub: 0.5,
  prezzo_pubblico: 18.3,
  perc_prof: 0.3,
  prezzo_profess: 15.86,
  perc_fatt: 0.2,
  prezzo_fattura: 12,
  prezzo_acquisto: 10,
  aumento: 0,
  r1: 10,
  maga: 0,
  r2: 10,
  perc_iva: 0.22,
  note: null,
};

describe("productListViewUtils", () => {
  it("formats dates consistently into aaaa.mm.gg", () => {
    expect(formatDateAaaaMmGg("2026-11-05")).toBe("2026.11.05");
    expect(formatDateAaaaMmGg("05/11/2026")).toBe("2026.11.05");
    expect(formatDateAaaaMmGg("200925")).toBe("2020.09.25");
    expect(formatDateAaaaMmGg("")).toBe("—");
  });

  it("recalculates bidirectional price formulas on field updates", () => {
    const updatedAcq = updateGeneralRowWithField(baseRow, "prezzo_acquisto", "20");
    expect(updatedAcq.prezzo_acquisto).toBe(20);
    expect(updatedAcq.r2).toBe(20);
    expect(updatedAcq.prezzo_fattura).toBeCloseTo(24, 3);

    const updatedFatt = updateGeneralRowWithField(updatedAcq, "prezzo_fattura", "30");
    expect(updatedFatt.prezzo_fattura).toBe(30);
    expect(updatedFatt.perc_fatt).toBeCloseTo(0.5, 4);
  });

  it("applies bulk actions accurately", () => {
    const bulkPerc = applyBulkActionToGeneralRow(baseRow, {
      action: "var_acq_perc",
      value: 10,
    });
    expect(bulkPerc.prezzo_acquisto).toBe(11);
    expect(bulkPerc.r2).toBe(11);

    const bulkCat = applyBulkActionToGeneralRow(baseRow, {
      action: "set_cat",
      value: "EDILIZIA",
    });
    expect(bulkCat.cat).toBe("EDILIZIA");
  });

  it("keeps newly created rows pinned at the top during sort", () => {
    const newRow = { ...createBlankGeneralRow(), descrizione: "Zeta nuovo" };
    const dbRowA = { ...baseRow, id: "db-1", descrizione: "Alfa" };
    const dbRowB = { ...baseRow, id: "db-2", descrizione: "Beta" };
    const snapshot = new Map<string, ListinoGeneraleRow>([
      [dbRowA.id, dbRowA],
      [dbRowB.id, dbRowB],
    ]);

    const sorted = filterAndSortGeneralItems(
      [dbRowB, newRow, dbRowA],
      snapshot,
      [],
      "descrizione",
      true
    );
    expect(sorted.map((r) => r.id)).toEqual([newRow.id, "db-1", "db-2"]);
  });

  it("builds price and text change audit logs", () => {
    const snapshot = new Map<string, ListinoGeneraleRow>([[baseRow.id, baseRow]]);
    const modified = { ...baseRow, descrizione: "Viti acciaio inox", prezzo_acquisto: 12 };
    const logs = buildGeneralPriceChangeLogs([modified], snapshot, "Admin", "2026-11-24T12:00:00Z");

    expect(logs.some((l) => l.campo_modificato === "Descrizione" && l.nuovo_testo === "Viti acciaio inox")).toBe(true);
    expect(logs.some((l) => l.campo_modificato === "Prezzo Acquisto" && l.nuovo_valore === 12)).toBe(true);
  });
});

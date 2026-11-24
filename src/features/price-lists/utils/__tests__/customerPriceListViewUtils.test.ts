import { describe, it, expect } from "vitest";
import {
  buildClientPriceChangeLogs,
  createBlankClientRow,
  filterAndSortClientPriceItems,
  updateClientRowWithField,
} from "../customerPriceListViewUtils";
import type { ListinoClienteRow } from "../../models/priceList";

const baseClientRow: ListinoClienteRow = {
  id: "c-1",
  cliente: "ALFA SRL",
  fornitore: "WURTH",
  codice_articolo: "V-01",
  descrizione: "Viti acciaio",
  prezzo_fattura: 12,
  prezzo_acquisto: null,
  acquisto_eur: 10,
  perc_acquisto: 20,
  data_acquisto: "2026.01.01",
  acquisto_old: "",
  ricarico: null,
  data_ref: "2026.01.01",
  note: "",
  note1: null,
  note2: null,
};

describe("customerPriceListViewUtils", () => {
  it("recalculates bidirectional acquisto_eur, perc_acquisto, and prezzo_fattura", () => {
    const withNewPerc = updateClientRowWithField(baseClientRow, "perc_acquisto", "50");
    expect(withNewPerc.perc_acquisto).toBe(50);
    expect(withNewPerc.prezzo_fattura).toBe(15);

    const withNewPrice = updateClientRowWithField(baseClientRow, "prezzo_fattura", "13");
    expect(withNewPrice.prezzo_fattura).toBe(13);
    expect(withNewPrice.perc_acquisto).toBe(30);

    const withNewAcq = updateClientRowWithField(baseClientRow, "acquisto_eur", "20");
    expect(withNewAcq.acquisto_eur).toBe(20);
    expect(withNewAcq.prezzo_fattura).toBe(24);
  });

  it("filters by client, duplicati, da_verificare, and pins new rows at top", () => {
    const dupA = { ...baseClientRow, id: "c-1", cliente: "ALFA SRL", descrizione: "Viti" };
    const dupB = { ...baseClientRow, id: "c-2", cliente: "ALFA SRL", descrizione: "Viti" };
    const noPrice = { ...baseClientRow, id: "c-3", cliente: "BETA SPA", descrizione: "Bulloni", prezzo_fattura: null };
    const newRow = { ...createBlankClientRow("ALFA SRL"), descrizione: "Zeta nuovo" };

    const snapshot = new Map<string, ListinoClienteRow>([
      [dupA.id, dupA],
      [dupB.id, dupB],
      [noPrice.id, noPrice],
    ]);

    const dups = filterAndSortClientPriceItems(
      [dupA, dupB, noPrice],
      snapshot,
      "TUTTI",
      "duplicati",
      [],
      "cliente",
      true
    );
    expect(dups.map((r) => r.id)).toEqual(["c-1", "c-2"]);

    const unpriced = filterAndSortClientPriceItems(
      [dupA, noPrice],
      snapshot,
      "TUTTI",
      "da_verificare",
      [],
      "cliente",
      true
    );
    expect(unpriced.map((r) => r.id)).toEqual(["c-3"]);

    const pinned = filterAndSortClientPriceItems(
      [noPrice, dupA, newRow],
      snapshot,
      "ALFA SRL",
      "tutti",
      [],
      "descrizione",
      true
    );
    expect(pinned.map((r) => r.id)).toEqual([newRow.id, "c-1"]);
  });

  it("builds client price change audit logs", () => {
    const snapshot = new Map<string, ListinoClienteRow>([[baseClientRow.id, baseClientRow]]);
    const updated = { ...baseClientRow, prezzo_fattura: 14, note: "Aggiornato" };
    const logs = buildClientPriceChangeLogs([updated], snapshot, "Admin", "2026-11-24T12:00:00Z");

    expect(logs.some((l) => l.campo_modificato === "Prezzo Vendita" && l.nuovo_valore === 14)).toBe(true);
    expect(logs.some((l) => l.campo_modificato === "Note" && l.nuovo_testo === "Aggiornato")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  filterAndSortEmbeddedClientItems,
  updateEmbeddedClientRowWithField,
} from "../customerEmbeddedViewUtils";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import type { ListinoClienteRow } from "../../models/priceList";

const sampleRows: ListinoClienteRow[] = [
  {
    id: "e-1",
    cliente: "LIST_ALFA",
    fornitore: "WURTH",
    codice_articolo: "A-1",
    descrizione: "Viti acciaio inox",
    prezzo_fattura: 12,
    prezzo_acquisto: null,
    acquisto_eur: 10,
    perc_acquisto: 20,
    data_acquisto: "2025.05.01",
    acquisto_old: "",
    ricarico: null,
    data_ref: "2025.05.01",
    note: "",
    note1: null,
    note2: null,
  },
  {
    id: "e-2",
    cliente: "BETA SPA",
    fornitore: "FISCHER",
    codice_articolo: "B-2",
    descrizione: "Tasselli nylon",
    prezzo_fattura: 8,
    prezzo_acquisto: null,
    acquisto_eur: 5,
    perc_acquisto: 60,
    data_acquisto: null,
    acquisto_old: "",
    ricarico: null,
    data_ref: "2025.05.01",
    note: "",
    note1: null,
    note2: null,
  },
];

describe("customerEmbeddedViewUtils", () => {
  it("filters by currentClientPls when no manual filter is typed, and supports manual filter + global search", () => {
    const snapshot = new Map(sampleRows.map((r) => [r.id, r]));
    const byPls = filterAndSortEmbeddedClientItems(
      sampleRows,
      snapshot,
      "",
      "ALFA SRL",
      new Set(["LIST_ALFA"]),
      [],
      "descrizione",
      true
    );
    expect(byPls.map((r) => r.id)).toEqual(["e-1"]);

    const byManual = filterAndSortEmbeddedClientItems(
      sampleRows,
      snapshot,
      "beta",
      "ALFA SRL",
      new Set(["LIST_ALFA"]),
      tokenizeSearch("tasselli"),
      "descrizione",
      true
    );
    expect(byManual.map((r) => r.id)).toEqual(["e-2"]);
  });

  it("preserves existing data_acquisto when updating acquisto_eur and sets it when missing", () => {
    const withExistingDate = updateEmbeddedClientRowWithField(sampleRows[0], "acquisto_eur", "15");
    expect(withExistingDate.data_acquisto).toBe("2025.05.01");
    expect(withExistingDate.prezzo_fattura).toBe(18);

    const withoutDate = updateEmbeddedClientRowWithField(sampleRows[1], "acquisto_eur", "10");
    expect(withoutDate.data_acquisto).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
    expect(withoutDate.prezzo_fattura).toBe(16);
  });
});

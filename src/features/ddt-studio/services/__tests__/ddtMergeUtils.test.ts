import { describe, it, expect } from "vitest";
import {
  DdtHeaderSnapshot,
  DdtItemSnapshot,
  DdtSnapshot,
  mergeDdtSnapshots,
} from "../ddtMergeUtils";

function makeHeader(overrides: Partial<DdtHeaderSnapshot> = {}): DdtHeaderSnapshot {
  return {
    doc_number: 3030,
    year: 2026,
    doc_date: "2026-11-17",
    status: "confermato",
    client_name: "CARTIERE CARRARA",
    client_address: "Via Roma 1",
    client_city: "Capannori",
    client_vat: "01234567890",
    client_fiscal_code: null,
    client_sdi: "M5UXCR1",
    destination_name: "CV1",
    destination_city: "Lucca",
    transport_reason: "Vendita",
    payment_method: "RI.BA. 60 GG",
    order_reference: "",
    operator: "Sam",
    goods_appearance: "Cartoni",
    carriage_terms: "Franco",
    packages_count: "1",
    weight_kg: "5",
    carrier: "Mittente",
    internal_notes: "",
    ...overrides,
  };
}

function makeItem(overrides: Partial<DdtItemSnapshot> = {}): DdtItemSnapshot {
  return {
    id: "item-1",
    row_index: 1,
    code: "ART1",
    description: "TRAPANO HIKOKI",
    row_kind: "item",
    unit: "NR.",
    quantity: "2",
    unit_price_subunits: 0,
    discount_pct: "",
    net_amount_subunits: 0,
    vat_rate: 22,
    vat_amount_subunits: 0,
    purchase_price_subunits: 0,
    ...overrides,
  };
}

describe("ddtMergeUtils - 3-way merge multi-PC", () => {
  it("preserves remote prices/discounts AND local added/removed rows without conflicts", () => {
    const base: DdtSnapshot = {
      header: makeHeader(),
      items: [
        makeItem({ id: "row-keep", row_index: 1, description: "LAMA 1", quantity: "2" }),
        makeItem({ id: "row-delete", row_index: 2, description: "VITE RIMOSSA", quantity: "1" }),
      ],
    };

    // PC1 (locale) rimuove row-delete e aggiunge row-new
    const local: DdtSnapshot = {
      header: makeHeader(),
      items: [
        makeItem({ id: "row-keep", row_index: 1, description: "LAMA 1", quantity: "2" }),
        makeItem({
          id: "row-new",
          row_index: 2,
          code: "ART3",
          description: "NUOVA VOCE",
          quantity: "1",
          unit_price_subunits: 1000000, // 10.00
          vat_rate: 22,
        }),
      ],
    };

    // PC2 (remoto su Supabase) ha inserito prezzo e sconto su row-keep
    const remote: DdtSnapshot = {
      header: makeHeader(),
      items: [
        makeItem({
          id: "row-keep",
          row_index: 1,
          description: "LAMA 1",
          quantity: "2",
          unit_price_subunits: 5000000, // 50.00
          discount_pct: "10", // net = 2 * 50 * 0.9 = 90.00 (9_000_000)
          purchase_price_subunits: 3000000, // 30.00
          vat_rate: 22,
        }),
        makeItem({ id: "row-delete", row_index: 2, description: "VITE RIMOSSA", quantity: "1" }),
      ],
    };

    const result = mergeDdtSnapshots(base, local, new Set(["row-delete"]), remote);

    expect(result.conflicts).toHaveLength(0);
    expect(result.autoMergedChanges).toBeGreaterThan(0);
    expect(result.merged.items).toHaveLength(2);

    const kept = result.merged.items.find((it) => it.id === "row-keep");
    const added = result.merged.items.find((it) => it.id === "row-new");
    const removed = result.merged.items.find((it) => it.id === "row-delete");

    expect(kept).toBeDefined();
    expect(kept?.unit_price_subunits).toBe(5000000);
    expect(kept?.discount_pct).toBe("10");
    expect(kept?.purchase_price_subunits).toBe(3000000);
    expect(kept?.net_amount_subunits).toBe(9000000); // 90.00

    expect(added).toBeDefined();
    expect(added?.net_amount_subunits).toBe(1000000); // 10.00

    expect(removed).toBeUndefined();

    // Imponibile totale = 90.00 + 10.00 = 100.00 (10_000_000 subunits), IVA 22% = 22.00 (2_200_000)
    expect(result.totalTaxableSubunits).toBe(10000000);
    expect(result.totalVatSubunits).toBe(2200000);
    expect(result.totalDocumentSubunits).toBe(12200000);
  });

  it("merges concurrent non-overlapping header edits cleanly", () => {
    const base: DdtSnapshot = {
      header: makeHeader({ payment_method: "RI.BA. 60 GG", order_reference: "" }),
      items: [makeItem()],
    };
    const local: DdtSnapshot = {
      header: makeHeader({ payment_method: "BONIFICO 30 GG", order_reference: "" }),
      items: [makeItem()],
    };
    const remote: DdtSnapshot = {
      header: makeHeader({ payment_method: "RI.BA. 60 GG", order_reference: "ORD-2026-88" }),
      items: [makeItem()],
    };

    const result = mergeDdtSnapshots(base, local, new Set(), remote);

    expect(result.conflicts).toHaveLength(0);
    expect(result.merged.header.payment_method).toBe("BONIFICO 30 GG");
    expect(result.merged.header.order_reference).toBe("ORD-2026-88");
  });

  it("merges an item added remotely while another item is added locally", () => {
    const base: DdtSnapshot = {
      header: makeHeader(),
      items: [makeItem({ id: "row-1", row_index: 1 })],
    };
    const local: DdtSnapshot = {
      header: makeHeader(),
      items: [
        makeItem({ id: "row-1", row_index: 1 }),
        makeItem({
          id: "row-local",
          row_index: 2,
          description: "AGGIUNTA PC1",
          quantity: "1",
          unit_price_subunits: 2000000,
        }),
      ],
    };
    const remote: DdtSnapshot = {
      header: makeHeader(),
      items: [
        makeItem({ id: "row-1", row_index: 1 }),
        makeItem({
          id: "row-remote",
          row_index: 3,
          description: "AGGIUNTA PC2",
          quantity: "1",
          unit_price_subunits: 3000000,
        }),
      ],
    };

    const result = mergeDdtSnapshots(base, local, new Set(), remote);

    expect(result.conflicts).toHaveLength(0);
    expect(result.merged.items.map((i) => i.id)).toEqual(["row-1", "row-local", "row-remote"]);
    expect(result.merged.items.map((i) => i.row_index)).toEqual([1, 2, 3]);
    expect(result.totalTaxableSubunits).toBe(5000000);
  });

  it("reports a hard conflict when both PCs modify the same price on the same row differently", () => {
    const base: DdtSnapshot = {
      header: makeHeader(),
      items: [makeItem({ id: "row-1", unit_price_subunits: 1000000 })], // 10€
    };
    const local: DdtSnapshot = {
      header: makeHeader(),
      items: [makeItem({ id: "row-1", unit_price_subunits: 1200000 })], // 12€
    };
    const remote: DdtSnapshot = {
      header: makeHeader(),
      items: [makeItem({ id: "row-1", unit_price_subunits: 1500000 })], // 15€
    };

    const result = mergeDdtSnapshots(base, local, new Set(), remote);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      scope: "item",
      itemId: "row-1",
      field: "unit_price_subunits",
    });
  });

  it("keeps the row and flags a conflict instead of silently losing prices when PC1 deletes a row edited by PC2", () => {
    const base: DdtSnapshot = {
      header: makeHeader(),
      items: [makeItem({ id: "row-1", description: "ARTICOLO CONTESO", unit_price_subunits: 0 })],
    };
    const local: DdtSnapshot = {
      header: makeHeader(),
      items: [],
    };
    const remote: DdtSnapshot = {
      header: makeHeader(),
      items: [makeItem({ id: "row-1", description: "ARTICOLO CONTESO", unit_price_subunits: 4500000 })],
    };

    const result = mergeDdtSnapshots(base, local, new Set(["row-1"]), remote);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      scope: "item",
      itemId: "row-1",
      field: "deleted_vs_modified",
    });
    expect(result.merged.items).toHaveLength(1);
    expect(result.merged.items[0].unit_price_subunits).toBe(4500000);
  });
});

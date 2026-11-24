import { describe, it, expect, beforeEach } from "vitest";
import { money } from "@/shared/domain/monetaryValue";
import { makeEmptyDdt, makeEmptyItems } from "../../ddtStudioDefaults";
import {
  addIgnoredDdtGaps,
  applyGlobalDiscountToDdtItems,
  applyGlobalMarkupToDdtItems,
  applyPurchaseHistoryPrices,
  buildClientUpsertPayloadFromDdt,
  computeDdtDirtySignature,
  formatDdtIdentifier,
  getDdtErrorMessage,
  getIgnoredDdtGaps,
  insertArticleIntoDdtItems,
} from "../ddtStudioEditorUtils";

describe("ddtStudioEditorUtils", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  it("computes dirty signature ignoring blank trailing rows and detecting real edits", () => {
    const doc = makeEmptyDdt();
    const rows = makeEmptyItems();
    const sig1 = computeDdtDirtySignature(doc, rows, "", "");
    const sig2 = computeDdtDirtySignature({ ...doc }, [...rows], "", "");
    expect(sig1).toBe(sig2);

    const editedDoc = { ...doc, client_name: "ALFA SRL" };
    expect(computeDdtDirtySignature(editedDoc, rows, "", "")).not.toBe(sig1);

    const withDiscount = computeDdtDirtySignature(doc, rows, "10", "");
    expect(withDiscount).not.toBe(sig1);
  });

  it("inserts articles into first unfilled row or F3 search-query row, applying markup, discount, and VAT rules", () => {
    const rows = makeEmptyItems();
    rows[0] = { ...rows[0], description: "RIGA GIA PRESENTE", unit_price: money(10) };
    rows[1] = { ...rows[1], description: "viti" }; // typed searchQuery during F3

    const { nextItems, insertedIdx } = insertArticleIntoDdtItems(
      rows,
      {
        code: "V-01",
        description: "viti inox",
        unit: "CF.",
        quantity: "2",
        unit_price: 100,
        purchase_price: 50,
        vat_rate: 22,
      },
      "viti",
      "+10%",
      "10"
    );

    expect(insertedIdx).toBe(1);
    expect(nextItems[1].description).toBe("VITI INOX");
    expect(nextItems[1].unit).toBe("CF.");
    expect(nextItems[1].base_price?.toNumber()).toBe(100);
    expect(nextItems[1].unit_price.toNumber()).toBeCloseTo(110, 4);
    expect(nextItems[1].discount_pct).toBe("10");
    expect(nextItems[1].vat_rate).toBe(22);
    expect(nextItems[1].net_amount.toNumber()).toBeCloseTo(198, 2);
    expect(nextItems[1].purchase_price?.toNumber()).toBe(50);

    // Zero-price article clears VAT and defaults unit to NR.
    const zeroPriceRes = insertArticleIntoDdtItems(
      nextItems,
      {
        description: "omaggio",
        quantity: "1",
        unit_price: 0,
        vat_rate: 22,
      },
      "",
      "",
      ""
    );
    expect(zeroPriceRes.insertedIdx).toBe(2);
    expect(zeroPriceRes.nextItems[2].unit).toBe("NR.");
    expect(zeroPriceRes.nextItems[2].vat_rate).toBe("");
  });

  it("applies global cascaded discount and restores original per-row discounts when cleared", () => {
    const rows = makeEmptyItems();
    rows[0] = {
      ...rows[0],
      description: "ARTICOLO A",
      quantity: "2",
      unit_price: money(100),
      discount_pct: "5",
      vat_rate: 22,
    };

    const discounted = applyGlobalDiscountToDdtItems(rows, "10+10");
    expect(discounted[0].discount_pct).toBe("10+10");
    expect(discounted[0].base_discount_pct).toBe("5");
    expect(discounted[0].net_amount.toNumber()).toBeCloseTo(162, 2);

    const restored = applyGlobalDiscountToDdtItems(discounted, "");
    expect(restored[0].discount_pct).toBe("5");
    expect(restored[0].base_discount_pct).toBeUndefined();
    expect(restored[0].net_amount.toNumber()).toBeCloseTo(190, 2);
  });

  it("applies global markup %, ignores partial input, and restores base_price when cleared", () => {
    const rows = makeEmptyItems();
    rows[0] = {
      ...rows[0],
      description: "ARTICOLO B",
      quantity: "1",
      unit_price: money(100),
      vat_rate: 22,
    };

    // Partial typing returns null so state is untouched
    expect(applyGlobalMarkupToDdtItems(rows, "+")).toBeNull();
    expect(applyGlobalMarkupToDdtItems(rows, "-")).toBeNull();

    const markedUp = applyGlobalMarkupToDdtItems(rows, "15,5%")!;
    expect(markedUp[0].base_price?.toNumber()).toBe(100);
    expect(markedUp[0].unit_price.toNumber()).toBeCloseTo(115.5, 4);
    expect(markedUp[0].net_amount.toNumber()).toBeCloseTo(115.5, 2);

    const restored = applyGlobalMarkupToDdtItems(markedUp, "")!;
    expect(restored[0].unit_price.toNumber()).toBe(100);
    expect(restored[0].net_amount.toNumber()).toBe(100);
  });

  it("applies selected purchase history prices only to matching rows with positive subunits", () => {
    const rows = makeEmptyItems();
    rows[0] = { ...rows[0], id: "r0", description: "ART 1", purchase_price: money(1) };
    rows[1] = { ...rows[1], id: "r1", description: "ART 2", purchase_price: money(2) };

    const updated = applyPurchaseHistoryPrices(rows, [
      { rowKey: "r0", purchasePriceSubunits: money(12.34).toSubunits() },
      { rowKey: "r1", purchasePriceSubunits: 0 },
    ]);

    expect(updated[0].purchase_price?.toNumber()).toBeCloseTo(12.34, 4);
    expect(updated[1].purchase_price?.toNumber()).toBe(2);
  });

  it("persists ignored gap numbers per year and formats identifiers & client upsert payloads", () => {
    if (typeof localStorage !== "undefined") {
      addIgnoredDdtGaps(2026, [12, 15]);
      addIgnoredDdtGaps(2026, [15, 20]);
      expect(Array.from(getIgnoredDdtGaps(2026)).sort((a, b) => a - b)).toEqual([12, 15, 20]);
    }

    expect(formatDdtIdentifier({ doc_number: null, series: "" })).toBe("Bozza");
    expect(formatDdtIdentifier({ doc_number: 42, series: "" })).toBe("42");
    expect(formatDdtIdentifier({ doc_number: 42, series: "A" })).toBe("A/42");
    expect(getDdtErrorMessage(new Error("boom"))).toBe("boom");

    const payload = buildClientUpsertPayloadFromDdt(
      {
        client_name: "  BETA SPA  ",
        client_city: "Milano",
        client_phones: [{ id: "p1", nome: "Ufficio", numero: "021234" }],
      },
      "cli-1",
      "https://proj.supabase.co"
    );
    expect(payload.business_name).toBe("BETA SPA");
    expect(payload.id).toBe("cli-1");
    expect(payload.phones).toEqual([{ id: "p1", nome: "Ufficio", numero: "021234" }]);
  });
});

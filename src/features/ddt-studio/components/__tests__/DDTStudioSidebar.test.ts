import { describe, expect, it } from "vitest";
import { isReturnDdt, matchesMarginFilter } from "../../utils/ddtArchiveFilters";

describe("DDTStudioSidebar return (reso) margin handling", () => {
  it("detects 'reso' in transport_reason case-insensitively", () => {
    expect(isReturnDdt("Reso")).toBe(true);
    expect(isReturnDdt("RESO MERCE")).toBe(true);
    expect(isReturnDdt("Reso da cliente")).toBe(true);
    expect(isReturnDdt("Vendita")).toBe(false);
    expect(isReturnDdt("")).toBe(false);
    expect(isReturnDdt(null)).toBe(false);
    expect(isReturnDdt(undefined)).toBe(false);
  });

  it("excludes return DDTs from 'without_margins' and 'with_margins' filters, keeping them in 'all'", () => {
    const returnNoCost = { transport_reason: "Reso", has_complete_margins: false };
    const returnWithCost = { transport_reason: "Reso merce", has_complete_margins: true };
    const saleWithMargins = { transport_reason: "Vendita", has_complete_margins: true };
    const saleWithoutMargins = { transport_reason: "Vendita", has_complete_margins: false };

    expect(matchesMarginFilter(returnNoCost, "all")).toBe(true);
    expect(matchesMarginFilter(returnNoCost, "without_margins")).toBe(false);
    expect(matchesMarginFilter(returnNoCost, "with_margins")).toBe(false);

    expect(matchesMarginFilter(returnWithCost, "all")).toBe(true);
    expect(matchesMarginFilter(returnWithCost, "without_margins")).toBe(false);
    expect(matchesMarginFilter(returnWithCost, "with_margins")).toBe(false);

    expect(matchesMarginFilter(saleWithMargins, "with_margins")).toBe(true);
    expect(matchesMarginFilter(saleWithMargins, "without_margins")).toBe(false);

    expect(matchesMarginFilter(saleWithoutMargins, "without_margins")).toBe(true);
    expect(matchesMarginFilter(saleWithoutMargins, "with_margins")).toBe(false);
  });
});

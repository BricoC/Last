import { describe, it, expect } from "vitest";
import { cleanClientStr, isClientMatching } from "../clientPriceListMatcher";

describe("clientPriceListMatcher (NoManV1 Parity)", () => {
  it("cleans client string removing LIST_ and punctuation", () => {
    expect(cleanClientStr("LIST_WEPA LISTINO")).toBe("WEPA LISTINO");
    expect(cleanClientStr("LISTINO_CARMA")).toBe("CARMA");
    expect(cleanClientStr("C.A.M.M.")).toBe("C A M M");
  });

  it("correctly matches WEPA ITALIA with LIST_WEPA LISTINO", () => {
    expect(isClientMatching("WEPA ITALIA", "LIST_WEPA LISTINO")).toBe(true);
    expect(isClientMatching("WEPA", "LIST_WEPA LISTINO")).toBe(true);
  });

  it("correctly matches CARTIERE CARRARA with LIST_CARMA alias", () => {
    expect(isClientMatching("CARTIERE CARRARA", "LIST_CARMA")).toBe(true);
    expect(isClientMatching("CARTIERE", "LIST_CARMA")).toBe(true);
    expect(isClientMatching("CARRARA", "LIST_CARMA")).toBe(true);
  });

  it("correctly matches FALEGNAMERIA BARSELLA with LIST_BARSELLA", () => {
    expect(isClientMatching("FALEGNAMERIA BARSELLA", "LIST_BARSELLA")).toBe(true);
  });

  it("correctly matches CAMM with LIST_C.A.M.M. ignoring dots", () => {
    expect(isClientMatching("CAMM", "LIST_C.A.M.M.")).toBe(true);
    expect(isClientMatching("C.A.M.M.", "LIST_C.A.M.M.")).toBe(true);
  });

  it("correctly matches ASB SERVICE with LIST_ASB SERVICE SRL", () => {
    expect(isClientMatching("ASB SERVICE", "LIST_ASB SERVICE SRL")).toBe(true);
  });

  it("does not match completely unrelated clients", () => {
    expect(isClientMatching("WEPA ITALIA", "LIST_CARMA")).toBe(false);
    expect(isClientMatching("SEVERI", "LIST_BARSELLA")).toBe(false);
  });
});


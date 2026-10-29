import { describe, it, expect } from "vitest";
import { ITALIAN_MONTH_NAMES } from "../ddtReportService";

describe("ddtReportService - Italian months & formats", () => {
  it("contiene esattamente i 12 mesi in italiano", () => {
    expect(ITALIAN_MONTH_NAMES).toHaveLength(12);
    expect(ITALIAN_MONTH_NAMES[0]).toBe("Gennaio");
    expect(ITALIAN_MONTH_NAMES[9]).toBe("Ottobre");
    expect(ITALIAN_MONTH_NAMES[11]).toBe("Dicembre");
  });
});


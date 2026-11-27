import { describe, expect, it } from "vitest";
import {
  formatMonthlyReportCarrier,
  formatMonthlyReportDestination,
  formatMonthlyReportOperator,
} from "./ddtMonthlyReportDataService";

describe("ddtMonthlyReportDataService helpers", () => {
  it("usa client_address e client_city in fallback quando i campi destinazione sono vuoti (es. DDT 3077)", () => {
    expect(
      formatMonthlyReportDestination({
        destination_name: null,
        destination_address: null,
        destination_city: null,
        client_address: "Via Tazio Nuvolari. 39",
        client_city: "Carraia - LU",
      }),
    ).toBe("Via Tazio Nuvolari. 39 · Carraia - LU");
  });

  it("evita duplicati quando destination_name e destination_address coincidono", () => {
    expect(
      formatMonthlyReportDestination({
        destination_name: "Stab. Pescia",
        destination_address: "Stab. Pescia ",
        destination_city: null,
        client_address: "Via Salicchi",
        client_city: "Lucca",
      }),
    ).toBe("Stab. Pescia");
  });

  it("converte i nomi operatore in a, b, c minuscoli", () => {
    expect(formatMonthlyReportOperator("Alessandro")).toBe("a");
    expect(formatMonthlyReportOperator("Alex")).toBe("a");
    expect(formatMonthlyReportOperator("Nicola")).toBe("b");
    expect(formatMonthlyReportOperator("Samu")).toBe("c");
    expect(formatMonthlyReportOperator("C")).toBe("c");
  });

  it("tratta Nessuno come vettore vuoto", () => {
    expect(formatMonthlyReportCarrier("Nessuno")).toBe("");
    expect(formatMonthlyReportCarrier(" nessuno ")).toBe("");
    expect(formatMonthlyReportCarrier(null)).toBe("");
    expect(formatMonthlyReportCarrier("BRT")).toBe("BRT");
  });
});

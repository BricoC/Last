import { describe, expect, it } from "vitest";
import {
  collapseDuplicateProvinces,
  formatCityForAnagrafica,
  formatCityForDdt,
  formatLocalitaForSupabase,
  parseCityAndProvince,
} from "../cityProvinceUtils";

describe("cityProvinceUtils", () => {
  it("estrae città e provincia rimuovendo ripetizioni di (LU) e forme miste", () => {
    expect(parseCityAndProvince("LUNATA (LU) (LU) (LU)", null)).toEqual({
      city: "LUNATA",
      province: "LU",
    });
    expect(parseCityAndProvince("MONSUMMANO (PT) (PT)", "")).toEqual({
      city: "MONSUMMANO",
      province: "PT",
    });
    expect(parseCityAndProvince("CARRAIA LU (LU)", null)).toEqual({
      city: "CARRAIA",
      province: "LU",
    });
    expect(parseCityAndProvince("TASSIGNANO LU (LU)", "LU")).toEqual({
      city: "TASSIGNANO",
      province: "LU",
    });
    expect(parseCityAndProvince("TASSIGNANO LU LU", "LU")).toEqual({
      city: "TASSIGNANO",
      province: "LU",
    });
    expect(parseCityAndProvince("LUNATA (LU) - LU", null)).toEqual({
      city: "LUNATA",
      province: "LU",
    });
    expect(parseCityAndProvince("TASSIGNANO - LU", null)).toEqual({
      city: "TASSIGNANO",
      province: "LU",
    });
    expect(parseCityAndProvince("PIEVE DI COMPITO (LU) (LU)", "LU")).toEqual({
      city: "PIEVE DI COMPITO",
      province: "LU",
    });
  });

  it("formatCityForDdt restituisce solo la città senza aggiungere (PROV)", () => {
    expect(formatCityForDdt("LUNATA", "LU")).toBe("LUNATA");
    expect(formatCityForDdt("LUNATA (LU) (LU) (LU)", null)).toBe("LUNATA");
    expect(formatCityForDdt("TASSIGNANO LU (LU)", "LU")).toBe("TASSIGNANO");
    expect(formatCityForDdt("CAPANNORI", "")).toBe("CAPANNORI");
  });

  it("formatCityForAnagrafica mostra al massimo una sola provincia tra parentesi", () => {
    expect(formatCityForAnagrafica("LUNATA", "LU")).toBe("LUNATA (LU)");
    expect(formatCityForAnagrafica("LUNATA (LU) (LU)", "LU")).toBe("LUNATA (LU)");
    expect(formatCityForAnagrafica("CARRAIA LU (LU)", null)).toBe("CARRAIA (LU)");
    expect(formatCityForAnagrafica("CAPANNORI", null)).toBe("CAPANNORI");
  });

  it("formatLocalitaForSupabase produce CITY - PROV senza duplicazioni", () => {
    expect(formatLocalitaForSupabase("LUNATA", "LU")).toBe("LUNATA - LU");
    expect(formatLocalitaForSupabase("LUNATA (LU) (LU)", "LU")).toBe("LUNATA - LU");
    expect(formatLocalitaForSupabase("CARRAIA LU", "LU")).toBe("CARRAIA - LU");
  });

  it("collapseDuplicateProvinces collassa le ripetizioni nei DDT storici senza toccare stringhe normali", () => {
    expect(collapseDuplicateProvinces("LUNATA (LU) (LU) (LU)")).toBe("LUNATA (LU)");
    expect(collapseDuplicateProvinces("CARRAIA LU (LU)")).toBe("CARRAIA (LU)");
    expect(collapseDuplicateProvinces("PIEVE DI COMPITO (LU) (LU)")).toBe("PIEVE DI COMPITO (LU)");
    expect(collapseDuplicateProvinces("LUNATA (LU)")).toBe("LUNATA (LU)");
    expect(collapseDuplicateProvinces("LUNATA")).toBe("LUNATA");
    expect(collapseDuplicateProvinces("VIA DI TIGLIO")).toBe("VIA DI TIGLIO");
  });
});

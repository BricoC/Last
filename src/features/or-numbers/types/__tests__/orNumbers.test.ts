import { describe, it, expect } from "vitest";
import { getOrStatus, matchesOrRowSearch, OrRow } from "../orNumbers";

describe("orNumbers getOrStatus", () => {
  it("restituisce 'green' se è presente orderReference", () => {
    const row: OrRow = {
      id: "1",
      docNumber: 100,
      series: "A",
      date: "2026-10-30",
      client: "CARTIERE CARRARA",
      destination: "CV7",
      orderReference: "4500123456 del 14.10.2026",
      statusLog: "Email Multipla 30/10/2026",
    };
    expect(getOrStatus(row)).toBe("green");
  });

  it("restituisce 'yellow' se non ha ordine ma ha statusLog", () => {
    const row: OrRow = {
      id: "2",
      docNumber: 101,
      series: "A",
      date: "2026-10-30",
      client: "CARTIERE CARRARA",
      destination: "CV7",
      orderReference: "",
      statusLog: "Email Multipla 30/10/2026",
    };
    expect(getOrStatus(row)).toBe("yellow");
  });

  it("restituisce 'red' se non ha né ordine né statusLog", () => {
    const row: OrRow = {
      id: "3",
      docNumber: 102,
      series: "A",
      date: "2026-10-30",
      client: "CARTIERE CARRARA",
      destination: "CV7",
      orderReference: "",
      statusLog: "",
    };
    expect(getOrStatus(row)).toBe("red");
  });

  it("considera 'RDA' come assenza di ordine (restituisce 'red' se senza log)", () => {
    const row: OrRow = {
      id: "4",
      docNumber: 103,
      series: "A",
      date: "2026-10-30",
      client: "CARTIERE CARRARA",
      destination: "CV7",
      orderReference: "RDA 11822710",
      statusLog: "",
    };
    expect(getOrStatus(row)).toBe("red");
  });

  it("considera 'rda' minuscolo con log come 'yellow'", () => {
    const row: OrRow = {
      id: "5",
      docNumber: 104,
      series: "A",
      date: "2026-10-30",
      client: "CARTIERE CARRARA",
      destination: "CV7",
      orderReference: "rda 11809631",
      statusLog: "Email Multipla 30/10/2026",
    };
    expect(getOrStatus(row)).toBe("yellow");
  });

  it("restituisce 'unpriced' se mancano i prezzi di vendita", () => {
    const row: OrRow = {
      id: "6",
      docNumber: 105,
      series: "A",
      date: "2026-11-20",
      client: "CARTIERE CARRARA",
      destination: "CV7",
      orderReference: "",
      statusLog: "",
      hasMissingPrices: true,
    };
    expect(getOrStatus(row)).toBe("unpriced");
  });
});

describe("orNumbers matchesOrRowSearch", () => {
  const sampleRow: OrRow = {
    id: "ddt-2854",
    docNumber: 2854,
    series: "",
    date: "2026-11-02",
    client: "CARTIERE CARRARA",
    destination: "CV2",
    orderReference: "4500129911 del 04.11.2026",
    statusLog: "Email Multi Gialli 03/11/2026",
    itemsSearchText: "SCOPA M/MET CASSETTA LAMIERA PENNARELLO P.FINA DURA-INK",
  };

  it("filtra con ricerca multi-parola dentro gli articoli (es. 'cass era')", () => {
    expect(matchesOrRowSearch(sampleRow, "cass era")).toBe(true);
    expect(matchesOrRowSearch(sampleRow, "dura penna")).toBe(true);
    expect(matchesOrRowSearch(sampleRow, "cass plastica")).toBe(false);
  });

  it("filtra anche per numero DDT, numero ordine, destinazione o combinazioni", () => {
    expect(matchesOrRowSearch(sampleRow, "2854")).toBe(true);
    expect(matchesOrRowSearch(sampleRow, "4500129911")).toBe(true);
    expect(matchesOrRowSearch(sampleRow, "cv2 cass")).toBe(true);
    expect(matchesOrRowSearch(sampleRow, "   ")).toBe(true);
  });
});


import { afterEach, describe, it, expect, vi } from "vitest";
import {
  parseAnyDate, parseCustomerPriceListExcelRow, parseSafeNum, parseExcelPricePercentage,
  uploadGeneralListsToSupabase, uploadDdtToSupabase,
  type ParsedDdtHeader, type ParsedDdtRow, type ParsedListinoGeneraleRow,
} from "../manualPriceListImportService";
import { FULL_SUPABASE_SCHEMA_SQL } from "@/features/settings/data-import/supabaseSchemaSql";

afterEach(() => vi.unstubAllGlobals());

describe("manualPriceListImportService - parseCustomerPriceListExcelRow", () => {
  it("parses standard FATTURA as well as spaced ' FATTURA' and VENDITA header variants", () => {
    const standard = parseCustomerPriceListExcelRow(
      { DESCRIZIONE: "ART 1", FATTURA: 12.5, ACQUISTO: "10 net", RICARICO: "25%" },
      "LIST_TEST",
      "TEST.xls"
    );
    expect(standard?.prezzo_fattura).toBe(12.5);
    expect(standard?.acquisto_old).toBe("10 net");
    expect(standard?.hasTextAcquisto).toBe(true);
    expect(standard?.ricarico).toBe(25);

    const vendita = parseCustomerPriceListExcelRow(
      { DESCRIZIONE: "ABR. STEARATA MT", VENDITA: 2.1, ACQUISTO: "", RICARICO: "25" },
      "LIST_PEDRETTI CARLO",
      "PEDRETTI CARLO.xls"
    );
    expect(vendita?.prezzo_fattura).toBe(2.1);

    const spaced = parseCustomerPriceListExcelRow(
      { DESCRIZIONE: "3M 1310 ARCHETTO", " FATTURA": 4.583, ACQUISTO: "083M 2,917", RICARICO: "57.114% 08" },
      "LIST_NUTINI",
      "NUTINI.xls"
    );
    expect(spaced?.prezzo_fattura).toBe(4.583);

    const venditaFattura = parseCustomerPriceListExcelRow(
      { DESCRIZIONE: "ABRASIVA 100", "VENDITA FATTURA": 1.15, ACQUISTO: "", RICARICO: "08-" },
      "LIST_TIME",
      "TIME.xls"
    );
    expect(venditaFattura?.prezzo_fattura).toBe(1.15);

    const prezzoConIva = parseCustomerPriceListExcelRow(
      { DESCRIZIONE: "PRODOTTO CORRADO", "PREZZO CON IVA": "9,90", ACQUISTO: "" },
      "LIST_CORRADO",
      "CORRADO.xls"
    );
    expect(prezzoConIva?.prezzo_fattura).toBe(9.9);

    const venditaIvaCompresa = parseCustomerPriceListExcelRow(
      { DESCRIZIONE: "ABRASIVA 3M", "VENDITA IVA COMPRESA": 1.35, ACQUISTO: "18 1,02 NETTO" },
      "LIST_DEL GHINGARO DANIELE",
      "DEL GHINGARO DANIELE.xls"
    );
    expect(venditaIvaCompresa?.prezzo_fattura).toBe(1.35);
  });

  it("ignores empty or '0' description rows cleanly", () => {
    expect(parseCustomerPriceListExcelRow({ DESCRIZIONE: "", FATTURA: 5 }, "LIST_A", "A.xls")).toBeNull();
    expect(parseCustomerPriceListExcelRow({ DESCRIZIONE: "0", FATTURA: 5 }, "LIST_A", "A.xls")).toBeNull();
  });

  it("parses Italian thousands separators and DD/MM/YYYY dates accurately", () => {
    expect(parseSafeNum("1.234,56 €")).toBe(1234.56);
    expect(parseSafeNum("1.234.567")).toBe(1234567);
    expect(parseAnyDate("05/11/2026").iso).toBe("2026-11-05");
    expect(parseAnyDate("25/11/2026").iso).toBe("2026-11-25");
    expect(parseAnyDate("11/25/2026").iso).toBe("2026-11-25");
  });
});

describe("Import cloud manuale", () => {
  const project = "https://example.test";
  const incoming = { codice_articolo: "A", descrizione: "Articolo", isVari: false } as ParsedListinoGeneraleRow;

  it("normalizza percentuali con unità esplicita e conserva le frazioni Excel", () => {
    expect(["22%", "0%", "2%", 4.0].map((value) => parseExcelPricePercentage(value))).toEqual([0.22, 0, 0.02, 4]);
  });

  it("separa inserimenti e aggiornamenti senza inviare colonne assenti dallo schema", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json([{ id: 7, codice_articolo: "A", descrizione: "Articolo" }]))
      .mockResolvedValueOnce(Response.json([]))
      .mockImplementation(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetch);

    const result = await uploadGeneralListsToSupabase([incoming, { ...incoming, codice_articolo: "B" }], [], project, "test");
    expect(result).toMatchObject({ genInserted: 1, genUpdated: 1, failed: 0 });
    const batches = fetch.mock.calls.slice(2).map(([, init]) => JSON.parse(String(init?.body)));
    expect(batches[0]).toEqual([expect.objectContaining({ id: 7, codice_articolo: "A" })]);
    expect(batches[1]).toEqual([expect.objectContaining({ codice_articolo: "B" })]);
    expect(batches[1][0]).not.toHaveProperty("id");
    const schema = FULL_SUPABASE_SCHEMA_SQL.split("CREATE TABLE IF NOT EXISTS public.listino_generale (")[1].split(");")[0];
    for (const row of batches.flat()) {
      expect(row).not.toHaveProperty("modificato_da");
      for (const column of Object.keys(row)) expect(schema).toMatch(new RegExp(`\\b${column}\\s`));
    }
  });

  it("ferma tutti i POST se l'inventario dei listini è incompleto", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    await expect(uploadGeneralListsToSupabase([incoming], [incoming], project, "test")).rejects.toThrow("listini_vari incompleto");
    expect(fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });

  it("assegna ID deterministici a testata e righe e usa il padre restituito dal cloud", async () => {
    const header = { anno: 2026, numero: 7, data: "2026-01-01", cliente: "ACME" } as ParsedDdtHeader;
    const row = { anno: 2026, numero_ddt: 7, riga_nr: 1, descrizione: "Articolo" } as ParsedDdtRow;
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      if (!init?.method) return Response.json([]);
      if (String(url).includes("/ddt?")) return Response.json(JSON.parse(String(init.body)));
      return new Response(null, { status: 201 });
    });
    vi.stubGlobal("fetch", fetch);
    await expect(uploadDdtToSupabase([header], [row], project, "test")).resolves.toEqual({
      headersUploaded: 1, rowsUploaded: 1, failed: 0,
    });
    const ids = () => fetch.mock.calls.filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body))[0]);
    const [testata, riga] = ids();
    expect(testata.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(riga).toMatchObject({ id: expect.stringMatching(/^[a-f0-9-]{36}$/), ddt_id: testata.id });
    fetch.mockClear();
    await uploadDdtToSupabase([header], [row], project, "test");
    expect(ids().map(({ id }) => id)).toEqual([testata.id, riga.id]);
  });
});

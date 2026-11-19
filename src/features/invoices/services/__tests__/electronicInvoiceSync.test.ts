import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { electronicInvoicesService } from "../electronicInvoicesService";
import type { ParsedInvoiceResult } from "../invoiceXmlParser";

vi.mock("@/shared/services/supabaseSession", () => ({
  supabaseFetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

const { invoke, execute, parse, select } = vi.hoisted(() => ({
  invoke: vi.fn(),
  execute: vi.fn(),
  parse: vi.fn(),
  select: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({ execute, select })),
}));
vi.mock("../invoiceXmlParser", () => ({ parseInvoiceXmlAll: parse }));

const header = { fornitore: "ACME", numero_documento: "42", data_documento: "2026-01-01", anno: 2026 };

describe("Sincronizzazione fatture elettroniche", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    execute.mockReset();
    select.mockReset().mockResolvedValue([]);
    invoke.mockReset().mockImplementation(async (command) => command === "load_supabase_config"
      ? { config: { projectUrl: "https://example.test", anonKey: "mock" } }
      : undefined);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("non scrive in SQLite se una pagina delle righe fallisce dopo il download iniziale", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([header]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ ...header, numero_linea: 1 }]))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(electronicInvoicesService.syncFromSupabase()).rejects.toThrow("HTTP 503");
    expect(invoke).toHaveBeenCalledExactlyOnceWith("load_supabase_config");
    expect(execute).not.toHaveBeenCalled();
  });

  it("consegna testate e righe allo stesso batch dopo l'ultima pagina", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([header]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ ...header, numero_linea: 1, aliquota_iva: 0 }]))
      .mockResolvedValueOnce(Response.json([]));

    await expect(electronicInvoicesService.syncFromSupabase()).resolves.toEqual({ testateCount: 1, righeCount: 1 });
    expect(invoke).toHaveBeenLastCalledWith("apply_local_database_batch", {
      validateReferencesAfterWrite: false,
      writes: [
        { sql: expect.stringContaining("INSERT INTO supplier_invoices"), params: expect.any(Array) },
        { sql: expect.stringContaining("invoice.cloud_upload_pending = 1"), params: [expect.any(String)] },
        { sql: expect.stringContaining("INSERT INTO supplier_invoice_items"), params: expect.arrayContaining([0]) },
      ],
    });
  });

  it("segnala l'errore cloud sulle righe conservando l'esito del salvataggio locale", async () => {
    const doc = { supplier_name: "ACME", doc_number: "42", doc_date: "2026-01-01", year: 2026 };
    const parsed: ParsedInvoiceResult = {
      invoice: { ...doc, total_amount: 1, taxable_amount: 1, vat_amount: 0 },
      items: [{
        ...doc, line_number: 1, description: "Articolo", quantity: 1,
        unit_price: 1, discounted_price: 1, total_price: 1, discount_1: 0,
        discount_2: 0, discount_3: 0, vat_rate: 0,
      }],
    };
    parse.mockReturnValue([parsed]);
    select.mockImplementation(async (sql: string) => {
      if (sql.includes("cloud_upload_pending = 1 ORDER BY")) return [{ ...parsed.invoice, id: 7, project_url: "https://example.test" }];
      if (sql.startsWith("SELECT * FROM supplier_invoice_items")) return parsed.items;
      return [];
    });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await electronicInvoicesService.importXmlFiles([{ name: "fattura.xml", content: "" }]);
    expect(result).toMatchObject({ importedInvoices: 1, totalLines: 1, cloudSynced: false, cloudError: expect.stringContaining("HTTP 503") });
    expect(execute).not.toHaveBeenCalled();
    const [target, init] = fetchMock.mock.calls[0];
    expect(String(target)).toContain("/rpc/last_replace_supplier_invoice");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      p_header: header, p_lines: [expect.objectContaining({ numero_linea: 1, aliquota_iva: 0 })],
    });
    await electronicInvoicesService.retryPendingUploads();
    expect(fetchMock.mock.calls[1][1]?.body).toBe(init?.body);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("cloud_upload_pending = 0"), [expect.any(String), 7]);
    expect(invoke.mock.calls.filter(([command]) => command === "apply_local_database_batch")).toEqual([
      ["apply_local_database_batch", {
        validateReferencesAfterWrite: false,
        writes: [
          { sql: expect.stringContaining("cloud_upload_pending"), params: expect.any(Array) },
          { sql: expect.stringContaining("INSERT INTO supplier_invoice_items"), params: expect.any(Array) },
        ],
      }],
    ]);
  });
});

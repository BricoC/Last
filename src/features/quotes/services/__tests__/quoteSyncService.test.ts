import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteSyncService } from "../quoteSyncService";
import { invalidateSupabaseConfigCache, setLastKnownSupabaseProjectUrl } from "@/shared/services/supabaseConfigCache";

vi.mock("@/shared/services/supabaseSession", () => ({
  supabaseFetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

const { invoke, select } = vi.hoisted(() => ({ invoke: vi.fn(), select: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: async () => ({ select }),
}));

const date = "2026-02-01T10:00:00Z";
const remote = { id: "preventivo-1", updated_at: date, data_json: { items: [] } };

describe("Pull preventivi", () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  beforeEach(() => {
    setLastKnownSupabaseProjectUrl("https://example.test");
    invoke.mockReset().mockImplementation(async (command) => command === "load_supabase_config"
      ? { config: { projectUrl: "https://example.test", anonKey: "test" } } : undefined);
    select.mockReset().mockResolvedValue([]);
    fetch.mockReset();
    vi.stubGlobal("fetch", fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("blocca un preventivo pendente o più recente anche nel pull per ID", async () => {
    select.mockResolvedValueOnce([{ updated_at: "2026-01-01", sync_status: "pending" }])
      .mockResolvedValueOnce([{ updated_at: "2026-03-01", sync_status: "synced" }]);
    fetch.mockResolvedValueOnce(Response.json([remote])).mockResolvedValueOnce(Response.json([remote]));
    await expect(QuoteSyncService.pullQuoteById(remote.id)).resolves.toBe(false);
    await expect(QuoteSyncService.pullQuoteById(remote.id)).resolves.toBe(false);
    expect(invoke.mock.calls.some(([command]) => command === "apply_local_database_batch")).toBe(false);
  });

  it("continua dopo la prima pagina e applica uno snapshot vuoto con la testata", async () => {
    fetch.mockResolvedValueOnce(Response.json([remote]))
      .mockResolvedValueOnce(Response.json([{ ...remote, id: "preventivo-2" }]))
      .mockResolvedValueOnce(Response.json([]));
    await expect(QuoteSyncService.pullQuotes()).resolves.toBe(2);
    expect(fetch.mock.calls.map(([input]) => new URL(String(input)).searchParams.get("offset"))).toEqual(["0", "1", "2"]);
    expect(invoke).toHaveBeenCalledWith("apply_local_database_batch", {
      validateReferencesAfterWrite: false,
      writes: [
        { sql: expect.stringContaining("quotes.sync_status"), params: expect.any(Array), expectedRows: 1 },
        { sql: expect.stringContaining("UPDATE quote_items SET deleted_at"), params: [date, remote.id, "[]"] },
      ],
    });
  });

  it("conserva il preventivo attivo se Supabase rifiuta la scrittura nel cestino", async () => {
    select.mockResolvedValueOnce([{
      sequence: 1, record_id: remote.id, action: "trash", payload: JSON.stringify(remote), project_url: "https://example.test",
    }]);
    fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await QuoteSyncService.retryPendingChanges();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0];
    expect(String(url)).toContain("/rest/v1/preventivi_cestino");
    expect(request?.method).toBe("POST");
  });

  it("salva l'IVA dei preventivi legacy in subunità e conserva l'importo zero esplicito", async () => {
    fetch.mockResolvedValueOnce(Response.json([{ ...remote, data_json: { righe: [
      { id: "riga-1", importo_netto: 100, iva: 22, importo_iva: "22,00" },
      { id: "riga-2", importo_netto: 100, iva: 22, importo_iva: "0" },
    ] } }]));
    await expect(QuoteSyncService.pullQuoteById(remote.id)).resolves.toBe(true);
    const request = invoke.mock.calls.find(([command]) => command === "apply_local_database_batch")?.[1];
    const items = request?.writes.filter((write: { sql: string }) => write.sql.includes("INSERT INTO quote_items"));
    expect(items?.map((write: { params: unknown[] }) => write.params[22])).toEqual([2_200_000, 0]);
  });

  it("non invia al progetto B un'operazione del cestino preventivi accodata per il progetto A", async () => {
    invoke.mockImplementation(async (command) => command === "load_supabase_config"
      ? { config: { projectUrl: "https://proj-b.supabase.co", anonKey: "key-b" } } : undefined);
    invalidateSupabaseConfigCache();
    setLastKnownSupabaseProjectUrl("https://proj-b.supabase.co");
    select.mockResolvedValueOnce([{
      sequence: 1, record_id: remote.id, action: "trash", payload: JSON.stringify(remote), project_url: "https://proj-a.supabase.co",
    }]).mockResolvedValueOnce([]);

    await QuoteSyncService.retryPendingChanges();

    expect(fetch).not.toHaveBeenCalled();
  });
});

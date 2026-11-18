import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { priceListSyncService } from "../priceListSyncService";

const { invoke, select } = vi.hoisted(() => ({ invoke: vi.fn(), select: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({ select })),
}));

const trash = {
  id: "cli_12",
  deleted_at: "2026-01-01T00:00:00Z",
  cliente: "ROSSI",
  codice_articolo: "ART1",
  descrizione: "Trapano",
  prezzo_acquisto: 60,
};
const config = { config: { projectUrl: "https://example.test", anonKey: "mock" } };

describe("Ripristino cestino listini clienti", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    invoke.mockReset().mockImplementation(async (command) =>
      command === "load_supabase_config" ? config : undefined
    );
    select.mockReset().mockImplementation(async (sql: string) =>
      sql.includes("cestino") ? [trash] : []
    );
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("conferma la riga cloud, rimuove il cestino cloud e applica un solo batch locale", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{ ...trash, id: 12 }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(priceListSyncService.restoreClientFromTrash("cli_12")).resolves.toMatchObject({ id: "cli_12" });
    const [post, remove] = fetchMock.mock.calls;
    expect(String(post[0])).toContain("/listini_clienti?on_conflict=id");
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({ id: "12", prezzo_acquisto: 60 });
    expect(String(remove[0])).toContain("/listini_clienti_cestino?id=eq.cli_12");
    expect(remove[1]?.method).toBe("DELETE");
    expect(invoke).toHaveBeenLastCalledWith("apply_local_database_batch", {
      validateReferencesAfterWrite: false,
      writes: [
        { sql: expect.stringContaining("DELETE FROM listini_clienti_cestino"), params: ["cli_12", trash.deleted_at], expectedRows: 1 },
        { sql: expect.stringMatching(/INSERT INTO listini_clienti\s/), params: expect.any(Array) },
        { sql: expect.stringContaining("SET sync_confirmed_at"), params: [expect.any(String), "cli_12"] },
      ],
    });
  });

  it("mantiene il cestino locale quando la rete è assente o manca la conferma", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json([]));
    await expect(priceListSyncService.restoreClientFromTrash("cli_12")).rejects.toThrow("offline");
    await expect(priceListSyncService.restoreClientFromTrash("cli_12")).rejects.toThrow("non ha confermato");
    expect(fetchMock.mock.calls.every((call) => call[1]?.method === "POST")).toBe(true);
    expect(invoke.mock.calls.every((call) => call[0] === "load_supabase_config")).toBe(true);
  });

  it("ripete lo stesso upsert quando fallisce la rimozione dal cestino cloud", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{ ...trash, id: 12 }]))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json([{ ...trash, id: 12 }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(priceListSyncService.restoreClientFromTrash("cli_12")).rejects.toThrow("HTTP 503");
    expect(invoke).toHaveBeenCalledExactlyOnceWith("load_supabase_config");
    await expect(priceListSyncService.restoreClientFromTrash("cli_12")).resolves.toMatchObject({ id: "cli_12" });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body)).id).toBe("12");
  });

  it("ripristina offline una nuova riga priva di ID cloud", async () => {
    select.mockResolvedValueOnce([{ ...trash, id: "new_local" }]);
    await expect(priceListSyncService.restoreClientFromTrash("new_local")).resolves.toMatchObject({ id: "new_local" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoke.mock.calls[0][0]).toBe("apply_local_database_batch");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { priceListSyncService } from "../priceListSyncService";
import { setLastKnownSupabaseProjectUrl } from "@/shared/services/supabaseConfigCache";

vi.mock("@/shared/services/supabaseSession", () => ({
  supabaseFetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

const { invoke, select, execute } = vi.hoisted(() => ({ invoke: vi.fn(), select: vi.fn(), execute: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({ select, execute })),
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
    setLastKnownSupabaseProjectUrl("https://example.test");
    let cleanup: { sequence: number; action: string; record_id: string; payload: string; project_url?: string | null } | undefined;
    invoke.mockReset().mockImplementation(async (command, args) => {
      if (command === "load_supabase_config") return config;
      if (args?.writes?.some((write: { sql: string }) => write.sql.includes("INSERT INTO pending_cloud_operations"))) {
        const params = args.writes.find((write: { sql: string }) => write.sql.includes("INSERT INTO pending_cloud_operations")).params;
        if (params[2] === "cleanup") cleanup = { sequence: 21, action: "cleanup", record_id: params[1], payload: "null", project_url: params[4] };
      }
    });
    select.mockReset().mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT sequence")) return cleanup ? [cleanup] : [];
      return sql.includes("FROM listini_clienti_cestino") ? [trash] : [];
    });
    execute.mockReset().mockImplementation(async () => { cleanup = undefined; });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("conferma la riga cloud e il commit locale prima di rimuovere il cestino cloud", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{ ...trash, id: 12 }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(priceListSyncService.restoreClientFromTrash("cli_12")).resolves.toMatchObject({ id: "cli_12" });
    const [post, remove] = fetchMock.mock.calls;
    expect(String(post[0])).toContain("/listini_clienti?on_conflict=id");
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({ id: "12", prezzo_acquisto: 60 });
    expect(String(remove[0])).toContain("/listini_clienti_cestino?id=eq.cli_12");
    expect(remove[1]?.method).toBe("DELETE");
    const localCommit = invoke.mock.calls.findIndex(([command]) => command === "apply_local_database_batch");
    expect(invoke.mock.invocationCallOrder[localCommit]).toBeLessThan(fetchMock.mock.invocationCallOrder[1]);
    expect(invoke).toHaveBeenCalledWith("apply_local_database_batch", {
      validateReferencesAfterWrite: false,
      writes: [
        { sql: expect.stringContaining("DELETE FROM listini_clienti_cestino"), params: ["cli_12", trash.deleted_at], expectedRows: 1 },
        { sql: expect.stringMatching(/INSERT INTO listini_clienti\s/), params: expect.any(Array) },
        { sql: expect.stringContaining("INSERT INTO pending_cloud_operations"), params: ["listini_clienti", "cli_12", "cleanup", "null", "https://example.test"] },
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

  it("ritenta solo la rimozione dal cestino cloud se la riga attiva è già confermata", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{ ...trash, id: 12 }]))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(priceListSyncService.restoreClientFromTrash("cli_12")).resolves.toMatchObject({ id: "cli_12" });
    expect(execute).not.toHaveBeenCalled();
    await expect(priceListSyncService.flushTrash("listini_clienti")).resolves.toBe(1);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "DELETE", "DELETE"]);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM pending_cloud_operations"), [21]);
  });

  it("ripristina offline una nuova riga priva di ID cloud", async () => {
    select.mockResolvedValueOnce([{ ...trash, id: "new_local" }]);
    await expect(priceListSyncService.restoreClientFromTrash("new_local")).resolves.toMatchObject({ id: "new_local" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoke.mock.calls[0][0]).toBe("apply_local_database_batch");
  });
});

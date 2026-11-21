import { afterEach, expect, it, vi } from "vitest";
import { registerRibaPayment } from "./ribaService";

const { execute, fetch } = vi.hoisted(() => ({ execute: vi.fn(), fetch: vi.fn() }));
vi.mock("@/shared/data-layer/database", () => ({ getDatabase: async () => ({ execute }) }));
vi.mock("@/shared/services/supabaseSession", () => ({ supabaseFetch: fetch }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: async () => ({
  config: { projectUrl: "https://example.test", anonKey: "test" },
}) }));
afterEach(() => vi.unstubAllGlobals());

it("richiede almeno una conferma e conserva il pagamento offline in SQLite", async () => {
  vi.stubGlobal("localStorage", { setItem() { throw Error("quota"); } });
  const save = () => registerRibaPayment("scadenza", "10/12/2026", "2026-12-10T10:00:00Z");
  execute.mockRejectedValueOnce(Error("disk full"));
  fetch.mockResolvedValueOnce(Response.json([]));
  await expect(save()).resolves.toEqual({ confirmed: false, remote: false });
  execute.mockResolvedValueOnce({ rowsAffected: 1 });
  fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(save()).resolves.toEqual({ confirmed: true, remote: false });
  execute.mockResolvedValueOnce({ rowsAffected: 0 });
  fetch.mockResolvedValueOnce(Response.json([{ deadline_key: "scadenza", is_paid: true }]));
  await expect(save()).resolves.toEqual({ confirmed: true, remote: true });
});

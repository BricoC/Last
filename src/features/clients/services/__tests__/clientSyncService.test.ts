import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientSyncService } from "../clientSyncService";
import type { Client } from "../../models/client";

vi.mock("@/shared/services/supabaseSession", () => ({
  supabaseFetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async () => ({ config: { projectUrl: "https://example.test", anonKey: "test" } }),
}));

afterEach(() => vi.unstubAllGlobals());

describe("Sincronizzazione clienti", () => {
  it("ferma il pull se l'invio delle modifiche pendenti fallisce", async () => {
    const service = new ClientSyncService();
    vi.spyOn(service, "syncPendingClientsToSupabase").mockRejectedValue(new Error("Modifiche clienti in sospeso"));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(service.syncAllFromSupabase()).rejects.toThrow("Modifiche clienti in sospeso");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("la P.IVA non autorizza a sovrascrivere un cliente cloud con ragione sociale diversa", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ id: 1, cliente: "Altra azienda" }]));
    vi.stubGlobal("fetch", fetch);
    const service = new ClientSyncService();
    const client = { id: "locale", business_name: "ACME", vat_number: "01234567890" } as Client;
    await expect(service.pushClientToSupabase(client)).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([, options]) => !options?.method)).toBe(true);
  });
});

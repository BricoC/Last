import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  connectSupabase,
  disconnectSupabase,
  forgetSupabaseSession,
  getSupabaseSessionEmail,
  restoreSupabaseSession,
  supabaseFetch,
} from "../supabaseSession";

const projectUrl = "https://audit.supabase.co";
const anonKey = "sb_publishable_demo";
const email = "station@example.test";
const orderUrl = `${projectUrl}/rest/v1/ordini`;
const request = { headers: { apikey: anonKey } };

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();
const getSession = vi.fn();
const signIn = vi.fn();
const refreshSession = vi.fn();
const client = {
  auth: {
    getSession,
    signInWithPassword: signIn,
    refreshSession,
    signOut: vi.fn(async () => {}),
    stopAutoRefresh: vi.fn(async () => {}),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
  realtime: { disconnect: vi.fn() },
  removeAllChannels: vi.fn(async () => {}),
};

let savedSession: Record<string, unknown> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  savedSession = null;
  invokeMock.mockImplementation(async (command: string, payload?: { session?: Record<string, unknown> }) => {
    if (command === "load_supabase_config") {
      return { config: { projectUrl, anonKey } };
    }
    if (command === "save_supabase_station_session") {
      savedSession = payload?.session ?? null;
      return null;
    }
    if (command === "load_supabase_station_session") {
      return savedSession;
    }
    if (command === "clear_supabase_station_session") {
      savedSession = null;
      return null;
    }
    return null;
  });

  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  const session = { access_token: "user-token", refresh_token: "rt-1" };
  getSession.mockResolvedValue({ data: { session }, error: null });
  signIn.mockResolvedValue({ data: { session, user: { email } }, error: null });
  refreshSession.mockResolvedValue({ data: { session: { access_token: "user-token", refresh_token: "rt-2" }, user: { email } }, error: null });
  vi.mocked(createClient).mockReturnValue(client as never);
});

afterEach(() => {
  disconnectSupabase();
  vi.unstubAllGlobals();
});

describe("Sessione cloud Supabase", () => {
  it("blocca le richieste senza sessione senza usare la chiave pubblica come identità", async () => {
    await expect(supabaseFetch(orderUrl, request)).rejects.toThrow("Accedi a Supabase");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("usa il bearer dell'utente approvato solo sul progetto configurato", async () => {
    await connectSupabase(email, "test-password");
    expect(createClient).toHaveBeenCalledWith(projectUrl, anonKey, expect.objectContaining({
      auth: expect.objectContaining({ persistSession: false, detectSessionInUrl: false }),
    }));
    await expect(supabaseFetch("https://other.supabase.co/rest/v1/ordini", request)).rejects.toThrow("Accedi a Supabase");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await supabaseFetch(orderUrl, request);
    const [target, options] = fetchMock.mock.lastCall!;
    expect(target).toBe(orderUrl);
    expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer user-token");
    expect(new Headers(options?.headers).get("apikey")).toBe(anonKey);
    expect(options?.redirect).toBe("error");
  });

  it("salva la sessione su PC, la ripristina al riavvio e la rimuove solo su disconnessione esplicita", async () => {
    await connectSupabase(email, "test-password");
    expect(savedSession).toEqual({
      projectUrl,
      email,
      password: "test-password",
      refreshToken: "rt-1",
    });

    // Simula riavvio app (stato in memoria resettato, file su PC intatto)
    disconnectSupabase();
    expect(getSupabaseSessionEmail()).toBeNull();
    expect(savedSession).not.toBeNull();

    const restored = await restoreSupabaseSession();
    expect(restored).toBe(true);
    expect(getSupabaseSessionEmail()).toBe(email);
    expect(savedSession?.refreshToken).toBe("rt-2");

    // Se il ripristino fallisce per assenza di rete, NON cancella le credenziali salvate
    disconnectSupabase();
    refreshSession.mockRejectedValueOnce(new TypeError("Network error"));
    signIn.mockRejectedValueOnce(new TypeError("Network error"));
    expect(await restoreSupabaseSession()).toBe(false);
    expect(savedSession).not.toBeNull();

    // Solo la disconnessione esplicita dell'utente cancella la sessione salvata
    await forgetSupabaseSession();
    expect(savedSession).toBeNull();
  });

  it("verifica nuovamente l'autorizzazione al cambio di token e disconnette se è revocata", async () => {
    await connectSupabase(email, "test-password");
    getSession.mockResolvedValue({ data: { session: { access_token: "refreshed-token" } }, error: null });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(supabaseFetch(orderUrl, request)).rejects.toThrow("autorizzazione");
    expect(getSupabaseSessionEmail()).toBeNull();
    expect(client.realtime.disconnect).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `${projectUrl}/rest/v1/rpc/last_require_station_access`,
      `${projectUrl}/rest/v1/rpc/last_require_station_access`,
    ]);
  });

  it("scarta un login completato dopo la disconnessione", async () => {
    let completeApproval!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { completeApproval = resolve; }));
    const login = connectSupabase(email, "test-password");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    disconnectSupabase();
    completeApproval(new Response(null, { status: 204 }));
    await expect(login).rejects.toThrow("cambiata");
    expect(getSupabaseSessionEmail()).toBeNull();
  });

  it("scarta anche una risposta dati arrivata dopo la disconnessione", async () => {
    await connectSupabase(email, "test-password");
    let completeRead!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { completeRead = resolve; }));
    const read = supabaseFetch(orderUrl, request);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    disconnectSupabase();
    completeRead(Response.json([{ id: "old-connection" }]));
    await expect(read).rejects.toThrow("sessione Supabase è terminata");
  });
});

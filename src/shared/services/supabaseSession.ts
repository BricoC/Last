import { invoke } from "@tauri-apps/api/core";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { createCachedSupabaseConfigLoader, type CachedSupabaseConfig } from "./supabaseConfigCache";

export const SUPABASE_SESSION_UPDATED = "supabase-session-updated";
const loadConfig = createCachedSupabaseConfigLoader("SupabaseSession");

interface StoredSupabaseSession {
  projectUrl: string;
  email: string;
  password: string;
  refreshToken: string;
}

interface Connection extends CachedSupabaseConfig {
  client: SupabaseClient;
  email: string;
  unsubscribe?: () => void;
  approval?: { token: string; expiresAt: number; request: Promise<void> };
}

let connected: Connection | null = null;
let generation = 0;
let restoreInFlight: Promise<boolean> | null = null;

function notifySession() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SUPABASE_SESSION_UPDATED));
}

function close(connection: Connection) {
  connection.unsubscribe?.();
  connection.client.realtime.disconnect();
  void connection.client.removeAllChannels().catch(() => {});
  void connection.client.auth.stopAutoRefresh().catch(() => {});
  void connection.client.auth.signOut({ scope: "local" }).catch(() => {});
}

export function disconnectSupabase() {
  generation++;
  const previous = connected;
  connected = null;
  if (!previous) return;
  close(previous);
  notifySession();
}

export async function forgetSupabaseSession(): Promise<void> {
  disconnectSupabase();
  await invoke("clear_supabase_station_session").catch(() => {});
}

export function getSupabaseSessionEmail() {
  return connected?.email ?? null;
}

export function subscribeSupabaseSession(listener: () => void) {
  window.addEventListener(SUPABASE_SESSION_UPDATED, listener);
  return () => window.removeEventListener(SUPABASE_SESSION_UPDATED, listener);
}

function matches(connection: Connection | null, projectUrl: string, anonKey: string): connection is Connection {
  return Boolean(connection && connection.projectUrl === projectUrl.trim().replace(/\/$/, "").toLowerCase() &&
    connection.anonKey === anonKey.trim());
}

function verifyApproval(connection: Connection, token: string, allowRefreshRetry = true): Promise<void> {
  if (connection.approval?.token === token && Date.now() < connection.approval.expiresAt) {
    return connection.approval.request;
  }
  const approval = {
    token,
    expiresAt: Number.POSITIVE_INFINITY,
    request: fetch(`${connection.projectUrl}/rest/v1/rpc/last_require_station_access`, {
      method: "POST",
      headers: { apikey: connection.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    }).then(async (response) => {
      if (!response.ok) {
        if (response.status === 401 && allowRefreshRetry && typeof connection.client.auth.refreshSession === "function") {
          const refreshed = await connection.client.auth.refreshSession().catch(() => null);
          const nextToken = refreshed && !refreshed.error ? refreshed.data?.session?.access_token : null;
          if (nextToken && connected === connection) {
            if (connection.approval === approval) connection.approval = undefined;
            return await verifyApproval(connection, nextToken, false);
          }
        }
        if (response.status === 401 || response.status === 403) {
          if (connected === connection) disconnectSupabase();
          void invoke("clear_supabase_station_session").catch((err) => {
            console.warn("[supabaseSession] Impossibile cancellare la sessione locale revocata:", err);
          });
        }
        throw new Error(response.status === 404
          ? "Il progetto Supabase richiede la migrazione di sicurezza Last."
          : "La verifica dell'autorizzazione della postazione Supabase è fallita.");
      }
      approval.expiresAt = Date.now() + 3_000;
    }).catch((error) => {
      if (connection.approval === approval) connection.approval = undefined;
      throw error;
    }),
  };
  connection.approval = approval;
  return approval.request;
}

function createSessionConnection(projectUrl: string, anonKey: string, email: string): Connection {
  const holder: { connection?: Connection } = {};
  const client: SupabaseClient = createClient(projectUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.origin !== projectUrl) throw new Error("Progetto Supabase non valido.");
        return url.pathname.startsWith("/rest/v1/")
          ? fetchWithSession(input, init, holder.connection)
          : fetch(input, { ...init, redirect: "error" });
      },
    },
  });
  const connection: Connection = { projectUrl, anonKey, client, email };
  holder.connection = connection;
  return connection;
}

async function persistStationSession(
  projectUrl: string,
  email: string,
  refreshToken: string,
): Promise<void> {
  await invoke("save_supabase_station_session", {
    session: { projectUrl, email, password: "", refreshToken },
  }).catch(() => {});
}

async function activateConnection(
  connection: Connection,
  session: Session,
  resolvedEmail: string,
  attempt: number,
  shouldPersist: boolean,
): Promise<void> {
  await verifyApproval(connection, session.access_token);
  if (attempt !== generation) throw new Error("La configurazione Supabase è cambiata durante l'accesso.");
  connection.email = resolvedEmail;
  connected = connection;

  const { data: { subscription } } = connection.client.auth.onAuthStateChange((event, nextSession) => {
    if (event === "TOKEN_REFRESHED" && nextSession?.refresh_token && connected === connection) {
      void persistStationSession(
        connection.projectUrl,
        connection.email,
        nextSession.refresh_token,
      );
    }
    if (event === "SIGNED_OUT" && connected === connection) {
      connected = null;
      generation++;
      queueMicrotask(() => {
        connection.unsubscribe?.();
        connection.client.realtime.disconnect();
        void connection.client.removeAllChannels().catch(() => {});
        void connection.client.auth.stopAutoRefresh().catch(() => {});
        notifySession();
      });
    }
  });
  connection.unsubscribe = () => subscription.unsubscribe();

  if (shouldPersist) {
    await persistStationSession(
      connection.projectUrl,
      resolvedEmail,
      session.refresh_token ?? "",
    );
  }
}

export async function connectSupabase(email: string, password: string) {
  disconnectSupabase();
  const attempt = generation;
  const config = await loadConfig();
  if (!config) throw new Error("Salva l'URL del progetto e la chiave API pubblica.");
  const projectUrl = config.projectUrl.toLowerCase();
  const connection = createSessionConnection(projectUrl, config.anonKey, email);

  try {
    const { data, error } = await connection.client.auth.signInWithPassword({ email, password });
    if (error || !data.session || data.user.is_anonymous) {
      throw new Error("Accesso Supabase non riuscito. Controlla l'account della postazione e la connessione.");
    }
    await activateConnection(
      connection,
      data.session,
      data.user.email ?? email,
      attempt,
      true,
    );
  } catch (error) {
    close(connection);
    throw error;
  }
  notifySession();
}

export async function restoreSupabaseSession(): Promise<boolean> {
  if (connected) return true;
  if (restoreInFlight) return restoreInFlight;

  restoreInFlight = (async () => {
    const config = await loadConfig().catch(() => null);
    if (!config) return false;
    const saved = await invoke<StoredSupabaseSession | null>("load_supabase_station_session").catch(() => null);
    if (!saved) return false;

    const projectUrl = config.projectUrl.toLowerCase();
    const savedUrl = saved.projectUrl.trim().replace(/\/$/, "").toLowerCase();
    if (!savedUrl || savedUrl !== projectUrl || !saved.email.trim()) return false;

    const attempt = generation;
    const connection = createSessionConnection(projectUrl, config.anonKey, saved.email);
    try {
      let session: Session | null = null;
      let resolvedEmail = saved.email;
      let shouldPersistRefresh = Boolean(saved.password);

      if (saved.refreshToken && typeof connection.client.auth.refreshSession === "function") {
        const refreshed = await connection.client.auth
          .refreshSession({ refresh_token: saved.refreshToken })
          .catch(() => null);
        if (refreshed && !refreshed.error && refreshed.data?.session && !refreshed.data.user?.is_anonymous) {
          session = refreshed.data.session;
          resolvedEmail = refreshed.data.user?.email ?? saved.email;
          const rotated = Boolean(session.refresh_token && session.refresh_token !== saved.refreshToken);
          shouldPersistRefresh = shouldPersistRefresh || rotated;
          if (rotated && session.refresh_token) {
            await persistStationSession(
              connection.projectUrl,
              resolvedEmail,
              session.refresh_token,
            ).catch(() => {});
          }
        }
      }

      // Migrazione one-shot da blob legacy v0.3.5: se esiste ancora la password, usa un ultimo login e poi rimuovila dal disco.
      if (!session && saved.password) {
        const signedIn = await connection.client.auth.signInWithPassword({
          email: saved.email,
          password: saved.password,
        });
        if (!signedIn.error && signedIn.data.session && !signedIn.data.user?.is_anonymous) {
          session = signedIn.data.session;
          resolvedEmail = signedIn.data.user?.email ?? saved.email;
          shouldPersistRefresh = true;
        }
      }

      if (!session) {
        close(connection);
        return false;
      }

      await activateConnection(
        connection,
        session,
        resolvedEmail,
        attempt,
        shouldPersistRefresh,
      );
      notifySession();
      return true;
    } catch {
      close(connection);
      return false;
    }
  })().finally(() => {
    restoreInFlight = null;
  });

  return restoreInFlight;
}

export async function getAuthenticatedSupabaseClient(projectUrl: string, anonKey: string): Promise<SupabaseClient | null> {
  const connection = connected;
  if (!matches(connection, projectUrl, anonKey)) return null;
  try {
    const { data, error } = await connection.client.auth.getSession();
    return !error && data.session && connected === connection ? connection.client : null;
  } catch {
    return null;
  }
}

export async function requireSupabaseAccess(projectUrl: string, anonKey: string): Promise<string> {
  const connection = connected;
  if (matches(connection, projectUrl, anonKey)) {
    const { data, error } = await connection.client.auth.getSession();
    if (!error && data.session && connection === connected) {
      await verifyApproval(connection, data.session.access_token);
      if (connection === connected) return data.session.access_token;
    }
  }
  throw new Error("Accedi a Supabase con l'account della postazione in Impostazioni → Cloud & Database.");
}

async function fetchWithSession(
  input: RequestInfo | URL, init?: RequestInit, expectedConnection?: Connection,
): Promise<Response> {
  const connection = connected;
  if (expectedConnection && expectedConnection !== connection) {
    throw new Error("La sessione Supabase è terminata.");
  }
  const request = input instanceof Request ? input : undefined;
  const url = new URL(request?.url ?? String(input));
  const headers = new Headers(init?.headers ?? request?.headers);
  if (!url.pathname.startsWith("/rest/v1/") || url.username || url.password) {
    throw new Error("Endpoint Supabase non valido.");
  }
  const token = await requireSupabaseAccess(url.origin, headers.get("apikey") ?? "");
  if (connection !== connected) throw new Error("La sessione Supabase è terminata.");
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(input, { ...init, headers, redirect: "error" });
  if (connection !== connected) throw new Error("La sessione Supabase è terminata.");
  return response;
}

export function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetchWithSession(input, init);
}

if (typeof window !== "undefined") {
  window.addEventListener("supabase-config-updated", () => {
    // Annulla anche un accesso in corso se arrivano impostazioni nuove.
    disconnectSupabase();
  });
}

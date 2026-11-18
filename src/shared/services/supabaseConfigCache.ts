import { invoke } from "@tauri-apps/api/core";

export interface CachedSupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: CachedSupabaseConfig | null;
}

let generation = 0;

if (typeof window !== "undefined") {
  window.addEventListener("supabase-config-updated", () => {
    generation++;
  });
}

/**
 * Restituisce un loader memoizzato per la configurazione Supabase che invalida
 * automaticamente la cache locale all'evento globale `supabase-config-updated`.
 */
export function createCachedSupabaseConfigLoader(logScope: string) {
  let cached: { generation: number; config: CachedSupabaseConfig } | undefined;
  let request: { generation: number; result: Promise<ConfigStatus | null> } | undefined;

  return async (): Promise<CachedSupabaseConfig | null> => {
    for (;;) {
      const currentGeneration = generation;
      if (cached?.generation === currentGeneration) return cached.config;
      if (request?.generation !== currentGeneration) {
        request = {
          generation: currentGeneration,
          result: invoke<ConfigStatus>("load_supabase_config").catch((error) => {
            console.warn(`[${logScope}] Impossibile recuperare credenziali Supabase:`, error);
            return null;
          }),
        };
      }
      const pending = request;
      const status = await pending.result;
      if (request === pending) request = undefined;
      if (currentGeneration !== generation) continue;

      if (status?.config?.projectUrl && status?.config?.anonKey) {
        const config = {
          projectUrl: status.config.projectUrl.replace(/\/$/, ""),
          anonKey: status.config.anonKey.trim(),
        };
        cached = { generation: currentGeneration, config };
        return config;
      }
      return null;
    }
  };
}

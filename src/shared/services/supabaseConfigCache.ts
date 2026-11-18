import { invoke } from "@tauri-apps/api/core";

export interface CachedSupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: CachedSupabaseConfig | null;
}

const cacheResetters = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("supabase-config-updated", () => {
    for (const reset of cacheResetters) {
      reset();
    }
  });
}

/**
 * Restituisce un loader memoizzato per la configurazione Supabase che invalida
 * automaticamente la cache locale all'evento globale `supabase-config-updated`.
 */
export function createCachedSupabaseConfigLoader(logScope: string) {
  let cached: CachedSupabaseConfig | null = null;
  cacheResetters.add(() => {
    cached = null;
  });

  return async (): Promise<CachedSupabaseConfig | null> => {
    if (cached) return cached;
    try {
      const status = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
      if (status?.config?.projectUrl && status?.config?.anonKey) {
        cached = {
          projectUrl: status.config.projectUrl.replace(/\/$/, ""),
          anonKey: status.config.anonKey.trim(),
        };
        return cached;
      }
    } catch (err) {
      console.warn(`[${logScope}] Impossibile recuperare credenziali Supabase:`, err);
    }
    return null;
  };
}

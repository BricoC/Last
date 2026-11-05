import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { AppUser, DEFAULT_ALLOWED_PAGES } from "./appUserService";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
  configPath: string;
}

export interface SupabaseAppUserRow {
  id: string;
  name: string;
  station_name: string;
  can_access_settings: boolean;
  can_access_ddt: boolean;
  can_access_price_lists: boolean;
  can_edit_price_lists: boolean;
  can_edit_or_numbers: boolean;
  is_admin: boolean;
  allowed_pages: string[] | string | null;
  theme_preset: string;
  theme_brightness: number;
  password_hash: string;
  require_password: boolean;
  created_at: string;
  updated_at?: string;
}

export class UserSyncService {
  private static cachedConfig: SupabaseConfig | null = null;

  public static async getCredentials(): Promise<SupabaseConfig | null> {
    if (this.cachedConfig) return this.cachedConfig;
    try {
      const status = await invoke<ConfigStatus>("load_supabase_config");
      if (status?.config?.projectUrl && status?.config?.anonKey) {
        this.cachedConfig = {
          projectUrl: status.config.projectUrl.replace(/\/$/, ""),
          anonKey: status.config.anonKey.trim(),
        };
        return this.cachedConfig;
      }
    } catch (err) {
      console.warn("[UserSyncService] Impossibile caricare configurazione Supabase via Tauri:", err);
    }
    return null;
  }

  /**
   * Salva o aggiorna un utente direttamente su Supabase Cloud (UPSERT)
   */
  public static async pushUserToSupabase(user: AppUser): Promise<boolean> {
    try {
      const creds = await this.getCredentials();
      if (!creds) return false;

      const row: SupabaseAppUserRow = {
        id: user.id,
        name: user.name,
        station_name: user.station_name || "",
        can_access_settings: Boolean(user.can_access_settings),
        can_access_ddt: true,
        can_access_price_lists: true,
        can_edit_price_lists: Boolean(user.can_edit_price_lists),
        can_edit_or_numbers: Boolean(user.can_edit_or_numbers),
        is_admin: Boolean(user.is_admin),
        allowed_pages: user.is_admin ? DEFAULT_ALLOWED_PAGES : (user.allowed_pages || []),
        theme_preset: user.theme_preset || "grigio",
        theme_brightness: Number(user.theme_brightness) || 4,
        password_hash: user.password_hash || "",
        require_password: Boolean(user.require_password),
        created_at: user.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const url = `${creds.projectUrl}/rest/v1/app_users`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(row),
      });

      if (!res.ok) {
        const text = await res.text();
        console.warn(`[UserSyncService] Errore push utente '${user.name}' su Supabase (${res.status}):`, text);
        return false;
      }

      return true;
    } catch (err) {
      console.warn("[UserSyncService] Errore di rete push utente su Supabase:", err);
      return false;
    }
  }

  /**
   * Rimuove un utente da Supabase Cloud
   */
  public static async deleteUserFromSupabase(id: string): Promise<boolean> {
    try {
      const creds = await this.getCredentials();
      if (!creds) return false;

      const url = `${creds.projectUrl}/rest/v1/app_users?id=eq.${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
        },
      });

      return res.ok;
    } catch (err) {
      console.warn("[UserSyncService] Errore rimozione utente su Supabase:", err);
      return false;
    }
  }

  /**
   * Sincronizza tutti gli utenti tra Supabase Cloud e il database SQLite locale:
   * 1. Scarica tutti gli utenti da Supabase
   * 2. Se presenti su Supabase, aggiorna/inserisce la copia locale
   * 3. Se locali non sono su Supabase, effettua l'invio su Supabase
   */
  public static async syncUsers(): Promise<{ pulled: number; pushed: number; success: boolean }> {
    try {
      const creds = await this.getCredentials();
      if (!creds) {
        return { pulled: 0, pushed: 0, success: false };
      }

      const url = `${creds.projectUrl}/rest/v1/app_users?order=is_admin.desc,name.asc`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
        },
      });

      if (!res.ok) {
        console.warn(`[UserSyncService] Errore fetch utenti da Supabase: HTTP ${res.status}`);
        return { pulled: 0, pushed: 0, success: false };
      }

      const remoteRows: SupabaseAppUserRow[] = await res.json();
      const db = await getDatabase();

      let pulled = 0;
      let pushed = 0;

      if (Array.isArray(remoteRows) && remoteRows.length > 0) {
        // Applica i record del Cloud al database SQLite locale
        for (const r of remoteRows) {
          let pages: string[] = [];
          if (Array.isArray(r.allowed_pages)) {
            pages = r.allowed_pages;
          } else if (typeof r.allowed_pages === "string") {
            try {
              pages = JSON.parse(r.allowed_pages);
            } catch {
              pages = [];
            }
          }
          if (r.is_admin || pages.length === 0) {
            pages = DEFAULT_ALLOWED_PAGES;
          }

          await db.execute(
            `INSERT INTO app_users (
              id, name, station_name, can_access_settings, can_access_ddt, can_access_price_lists,
              can_edit_price_lists, can_edit_or_numbers, is_admin, allowed_pages, theme_preset, theme_brightness,
              password_hash, require_password, created_at
            ) VALUES ($1, $2, $3, $4, 1, 1, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              station_name = excluded.station_name,
              can_access_settings = excluded.can_access_settings,
              can_edit_price_lists = excluded.can_edit_price_lists,
              can_edit_or_numbers = excluded.can_edit_or_numbers,
              is_admin = excluded.is_admin,
              allowed_pages = excluded.allowed_pages,
              theme_preset = excluded.theme_preset,
              theme_brightness = excluded.theme_brightness,
              password_hash = excluded.password_hash,
              require_password = excluded.require_password`,
            [
              r.id,
              r.name,
              r.station_name || "",
              r.is_admin ? 1 : r.can_access_settings ? 1 : 0,
              r.is_admin ? 1 : r.can_edit_price_lists ? 1 : 0,
              r.is_admin ? 1 : r.can_edit_or_numbers ? 1 : 0,
              r.is_admin ? 1 : 0,
              JSON.stringify(pages),
              r.theme_preset || "grigio",
              Number(r.theme_brightness) || 4,
              r.password_hash || "",
              r.require_password ? 1 : 0,
              r.created_at || new Date().toISOString(),
            ]
          );
          pulled++;
        }
      }

      // Controlla se esistono utenti locali non presenti su Supabase e sincronizzali su Cloud
      const localUsers = await db.select<any[]>("SELECT * FROM app_users");
      const remoteIds = new Set(remoteRows.map((r) => r.id));

      for (const loc of localUsers) {
        if (!remoteIds.has(loc.id)) {
          let pages: string[] = [];
          try {
            if (loc.allowed_pages) pages = JSON.parse(loc.allowed_pages);
          } catch {
            pages = [];
          }

          const toPush: AppUser = {
            id: loc.id,
            name: loc.name,
            station_name: loc.station_name || "",
            can_access_settings: Boolean(loc.can_access_settings),
            can_access_ddt: true,
            can_access_price_lists: true,
            can_edit_price_lists: Boolean(loc.can_edit_price_lists),
            can_edit_or_numbers: Boolean(loc.can_edit_or_numbers),
            is_admin: Boolean(loc.is_admin),
            allowed_pages: pages,
            theme_preset: loc.theme_preset || "grigio",
            theme_brightness: Number(loc.theme_brightness) || 4,
            password_hash: loc.password_hash || "",
            require_password: Boolean(loc.require_password),
            created_at: loc.created_at || new Date().toISOString(),
          };

          const ok = await this.pushUserToSupabase(toPush);
          if (ok) pushed++;
        }
      }

      return { pulled, pushed, success: true };
    } catch (err) {
      console.warn("[UserSyncService] Errore sincronizzazione utenti:", err);
      return { pulled: 0, pushed: 0, success: false };
    }
  }
}


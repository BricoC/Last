import { getDatabase } from "@/shared/data-layer/database";
import { UserSyncService } from "./userSyncService";

export interface AppPageModule {
  id: string;
  title: string;
  category: "operativo" | "archivio" | "commerciale" | "amministrazione";
}

export const ALL_APP_PAGE_MODULES: AppPageModule[] = [
  { id: "dashboard", title: "Dashboard", category: "operativo" },
  { id: "orders", title: "Order Manager", category: "operativo" },
  { id: "ddt-studio", title: "DDT Studio (Pro)", category: "operativo" },
  { id: "price-lists", title: "Listino Generale", category: "commerciale" },
  { id: "client-lists", title: "Listini Clienti", category: "commerciale" },
  { id: "quotes", title: "Preventivi", category: "commerciale" },
  { id: "offers", title: "Offerte", category: "commerciale" },
  { id: "clients", title: "Clienti", category: "commerciale" },
  { id: "notes", title: "Note", category: "operativo" },
  { id: "or-numbers", title: "OR Numbers", category: "operativo" },
  { id: "ddt-list", title: "DDT List", category: "archivio" },
  { id: "ddt-articles", title: "DDT Articoli", category: "archivio" },
  { id: "invoices", title: "Fatture Elettroniche", category: "amministrazione" },
  { id: "settings", title: "Impostazioni", category: "amministrazione" },
];

export const DEFAULT_ALLOWED_PAGES = ALL_APP_PAGE_MODULES.map((m) => m.id);

export const DEFAULT_TOPBAR_ORDER: string[] = [
  "dashboard",
  "orders",
  "price-lists",
  "or-numbers",
  "ddt-list",
  "ddt-articles",
  "client-lists",
  "invoices",
  "ddt-studio",
  "quotes",
  "offers",
  "clients",
  "notes",
];

export function isPageAllowedForUser(user: AppUser | null | undefined, pageId: string): boolean {
  if (!user) return false;
  if (user.is_admin) return true;
  if (pageId === "settings") {
    return Boolean(user.can_access_settings);
  }
  if (!user.allowed_pages || user.allowed_pages.length === 0) {
    return true;
  }
  return user.allowed_pages.includes(pageId);
}

export interface AppUser {
  id: string;
  name: string;
  station_name: string;
  can_access_settings: boolean;
  can_access_ddt: boolean;
  can_access_price_lists: boolean;
  can_edit_price_lists: boolean;
  can_edit_or_numbers: boolean;
  is_admin: boolean;
  allowed_pages: string[];
  theme_preset: "grigio" | "nero-oled" | "avorio";
  theme_brightness: number;
  password_hash?: string;
  require_password: boolean;
  topbar_order?: string[];
  created_at: string;
}

export async function hashPassword(plain: string): Promise<string> {
  if (!plain) return "";
  const data = new TextEncoder().encode(plain);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassword(plain: string, hash?: string): Promise<boolean> {
  if (!hash) return false;
  const computed = await hashPassword(plain);
  return computed === hash;
}

const DEFAULT_USERS: Omit<AppUser, "created_at">[] = [
  {
    id: "admin",
    name: "Admin",
    station_name: "PC Ufficio",
    can_access_settings: true,
    can_access_ddt: true,
    can_access_price_lists: true,
    can_edit_price_lists: true,
    can_edit_or_numbers: true,
    is_admin: true,
    allowed_pages: DEFAULT_ALLOWED_PAGES,
    theme_preset: "grigio",
    theme_brightness: 4,
    password_hash: "",
    require_password: false,
    topbar_order: DEFAULT_TOPBAR_ORDER,
  },
  {
    id: "banco-1",
    name: "Banco 1",
    station_name: "Postazione Cassa 1",
    can_access_settings: false,
    can_access_ddt: true,
    can_access_price_lists: true,
    can_edit_price_lists: false,
    can_edit_or_numbers: false,
    is_admin: false,
    allowed_pages: [
      "dashboard",
      "orders",
      "ddt-studio",
      "price-lists",
      "client-lists",
      "quotes",
      "offers",
      "clients",
      "or-numbers",
      "ddt-list",
      "ddt-articles",
    ],
    theme_preset: "avorio",
    theme_brightness: 3,
    password_hash: "",
    require_password: false,
    topbar_order: DEFAULT_TOPBAR_ORDER,
  },
  {
    id: "banco-2",
    name: "Banco 2",
    station_name: "Postazione Cassa 2",
    can_access_settings: false,
    can_access_ddt: true,
    can_access_price_lists: true,
    can_edit_price_lists: false,
    can_edit_or_numbers: false,
    is_admin: false,
    allowed_pages: [
      "dashboard",
      "orders",
      "ddt-studio",
      "price-lists",
      "client-lists",
      "quotes",
      "offers",
      "clients",
      "or-numbers",
      "ddt-list",
      "ddt-articles",
    ],
    theme_preset: "nero-oled",
    theme_brightness: 1,
    password_hash: "",
    require_password: false,
    topbar_order: DEFAULT_TOPBAR_ORDER,
  },
];

export class AppUserService {
  private static initialized = false;

  public static async ensureTable(): Promise<void> {
    if (this.initialized) return;
    try {
      const db = await getDatabase();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS app_users (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          station_name TEXT NOT NULL DEFAULT '',
          can_access_settings INTEGER NOT NULL DEFAULT 1,
          can_access_ddt INTEGER NOT NULL DEFAULT 1,
          can_access_price_lists INTEGER NOT NULL DEFAULT 1,
          can_edit_price_lists INTEGER NOT NULL DEFAULT 0,
          can_edit_or_numbers INTEGER NOT NULL DEFAULT 0,
          is_admin INTEGER NOT NULL DEFAULT 0,
          allowed_pages TEXT,
          theme_preset TEXT DEFAULT 'grigio',
          theme_brightness INTEGER DEFAULT 4,
          password_hash TEXT DEFAULT '',
          require_password INTEGER NOT NULL DEFAULT 0,
          topbar_order TEXT DEFAULT '',
          created_at TEXT NOT NULL
        );
      `);

      // Migrazione sicura delle nuove colonne per database già esistenti
      const columnsToAdd = [
        "ALTER TABLE app_users ADD COLUMN can_edit_price_lists INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE app_users ADD COLUMN can_edit_or_numbers INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE app_users ADD COLUMN allowed_pages TEXT",
        "ALTER TABLE app_users ADD COLUMN theme_preset TEXT DEFAULT 'grigio'",
        "ALTER TABLE app_users ADD COLUMN theme_brightness INTEGER DEFAULT 4",
        "ALTER TABLE app_users ADD COLUMN password_hash TEXT DEFAULT ''",
        "ALTER TABLE app_users ADD COLUMN require_password INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE app_users ADD COLUMN topbar_order TEXT DEFAULT ''",
      ];
      for (const sql of columnsToAdd) {
        try {
          await db.execute(sql);
        } catch {
          // Colonna già presente, errore ignorato in sicurezza
        }
      }

      // Rinomina automatica di 'Amministratore' in 'Admin' per l'account principale id='admin'
      try {
        await db.execute(
          "UPDATE app_users SET name = 'Admin' WHERE id = 'admin' AND name != 'Admin'"
        );
      } catch {
        // Nessun aggiornamento necessario
      }

      // Verifica se ci sono utenti, altrimenti effettua il seed iniziale
      const existing = await db.select<{ count: number }[]>(
        "SELECT COUNT(*) as count FROM app_users"
      );
      if (existing?.[0]?.count === 0) {
        for (const u of DEFAULT_USERS) {
          await db.execute(
            `INSERT INTO app_users (
              id, name, station_name, can_access_settings, can_access_ddt, can_access_price_lists,
              can_edit_price_lists, can_edit_or_numbers, is_admin, allowed_pages, theme_preset, theme_brightness,
              password_hash, require_password, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, datetime('now'))`,
            [
              u.id,
              u.name,
              u.station_name,
              u.can_access_settings ? 1 : 0,
              u.can_access_ddt ? 1 : 0,
              u.can_access_price_lists ? 1 : 0,
              u.can_edit_price_lists ? 1 : 0,
              u.can_edit_or_numbers ? 1 : 0,
              u.is_admin ? 1 : 0,
              JSON.stringify(u.allowed_pages),
              u.theme_preset,
              u.theme_brightness,
              u.password_hash || "",
              u.require_password ? 1 : 0,
            ]
          );
        }
      }
      this.initialized = true;
    } catch (e) {
      console.error("Errore inizializzazione tabella app_users:", e);
    }
  }

  public static async getAllUsers(): Promise<AppUser[]> {
    try {
      await this.ensureTable();
      const db = await getDatabase();
      const rows = await db.select<any[]>(
        "SELECT * FROM app_users ORDER BY is_admin DESC, name ASC"
      );
      return rows.map((r) => {
        const isAdmin = Boolean(r.is_admin);
        let allowedPages: string[] = [];
        try {
          if (r.allowed_pages) {
            allowedPages = JSON.parse(r.allowed_pages);
          }
        } catch {
          allowedPages = [];
        }
        if (isAdmin || !Array.isArray(allowedPages) || allowedPages.length === 0) {
          allowedPages = DEFAULT_ALLOWED_PAGES;
        }

        let topbarOrder: string[] = [];
        try {
          if (r.topbar_order) {
            topbarOrder = JSON.parse(r.topbar_order);
          }
        } catch {
          topbarOrder = [];
        }
        if (!Array.isArray(topbarOrder) || topbarOrder.length === 0) {
          topbarOrder = DEFAULT_TOPBAR_ORDER;
        }

        return {
          id: String(r.id),
          name: String(r.name),
          station_name: String(r.station_name || ""),
          // L'amministratore ha sempre tutti i permessi abilitati al 100% senza possibilità di disabilitazione
          can_access_settings: isAdmin ? true : Boolean(r.can_access_settings),
          can_access_ddt: true,
          can_access_price_lists: true,
          can_edit_price_lists: isAdmin ? true : Boolean(r.can_edit_price_lists),
          can_edit_or_numbers: isAdmin ? true : Boolean(r.can_edit_or_numbers),
          is_admin: isAdmin,
          allowed_pages: isAdmin ? DEFAULT_ALLOWED_PAGES : allowedPages,
          theme_preset: (r.theme_preset || "grigio") as "grigio" | "nero-oled" | "avorio",
          theme_brightness: Number(r.theme_brightness) || 4,
          password_hash: String(r.password_hash || ""),
          require_password: Boolean(r.require_password),
          topbar_order: topbarOrder,
          created_at: String(r.created_at || ""),
        };
      });
    } catch (e) {
      console.error("Errore recupero utenti app_users:", e);
      return DEFAULT_USERS.map((u) => ({ ...u, created_at: new Date().toISOString() }));
    }
  }

  public static async createUser(user: {
    id?: string;
    name: string;
    station_name?: string;
    can_access_settings: boolean;
    can_access_ddt?: boolean;
    can_access_price_lists?: boolean;
    can_edit_price_lists?: boolean;
    can_edit_or_numbers?: boolean;
    is_admin?: boolean;
    allowed_pages?: string[];
    theme_preset?: "grigio" | "nero-oled" | "avorio";
    theme_brightness?: number;
    password_hash?: string;
    require_password?: boolean;
    topbar_order?: string[];
  }): Promise<AppUser> {
    await this.ensureTable();
    const db = await getDatabase();
    const id = user.id?.trim() || `user_${Date.now()}`;
    const name = user.name.trim();
    const station = user.station_name?.trim() || "";
    const isAdmin = Boolean(user.is_admin);
    const canSettings = isAdmin ? 1 : user.can_access_settings ? 1 : 0;
    const canDdt = 1;
    const canPrices = 1;
    const canEditPrices = isAdmin ? 1 : user.can_edit_price_lists ? 1 : 0;
    const canEditOr = isAdmin ? 1 : user.can_edit_or_numbers ? 1 : 0;
    const pages = isAdmin
      ? DEFAULT_ALLOWED_PAGES
      : (user.allowed_pages || DEFAULT_ALLOWED_PAGES.filter((p) => p !== "settings"));
    const themePreset = user.theme_preset || "grigio";
    const themeBrightness = user.theme_brightness || 4;
    const passwordHash = user.password_hash || "";
    const requirePassword = user.require_password ? 1 : 0;
    const topbarOrder = user.topbar_order && user.topbar_order.length > 0 ? user.topbar_order : DEFAULT_TOPBAR_ORDER;
    const createdAt = new Date().toISOString();

    await db.execute(
      `INSERT INTO app_users (
        id, name, station_name, can_access_settings, can_access_ddt, can_access_price_lists,
        can_edit_price_lists, can_edit_or_numbers, is_admin, allowed_pages, theme_preset, theme_brightness,
        password_hash, require_password, topbar_order, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        id,
        name,
        station,
        canSettings,
        canDdt,
        canPrices,
        canEditPrices,
        canEditOr,
        isAdmin ? 1 : 0,
        JSON.stringify(pages),
        themePreset,
        themeBrightness,
        passwordHash,
        requirePassword,
        JSON.stringify(topbarOrder),
        createdAt,
      ]
    );

    const created: AppUser = {
      id,
      name,
      station_name: station,
      can_access_settings: Boolean(canSettings),
      can_access_ddt: Boolean(canDdt),
      can_access_price_lists: Boolean(canPrices),
      can_edit_price_lists: Boolean(canEditPrices),
      can_edit_or_numbers: Boolean(canEditOr),
      is_admin: isAdmin,
      allowed_pages: pages,
      theme_preset: themePreset,
      theme_brightness: themeBrightness,
      password_hash: passwordHash,
      require_password: Boolean(requirePassword),
      topbar_order: topbarOrder,
      created_at: createdAt,
    };

    // Sincronizza immediatamente con Supabase Cloud
    void UserSyncService.pushUserToSupabase(created);

    return created;
  }

  public static async updateUser(user: AppUser): Promise<void> {
    await this.ensureTable();
    const db = await getDatabase();
    const isAdmin = Boolean(user.is_admin);
    const canSettings = isAdmin ? 1 : user.can_access_settings ? 1 : 0;
    const canEditPrices = isAdmin ? 1 : user.can_edit_price_lists ? 1 : 0;
    const canEditOr = isAdmin ? 1 : user.can_edit_or_numbers ? 1 : 0;
    const pages = isAdmin ? DEFAULT_ALLOWED_PAGES : (user.allowed_pages || []);
    const requirePassword = user.require_password ? 1 : 0;
    const topbarOrder = user.topbar_order && user.topbar_order.length > 0 ? user.topbar_order : DEFAULT_TOPBAR_ORDER;

    await db.execute(
      `UPDATE app_users 
       SET name = $1, station_name = $2, can_access_settings = $3, can_access_ddt = 1,
           can_access_price_lists = 1, can_edit_price_lists = $4, can_edit_or_numbers = $5,
           is_admin = $6, allowed_pages = $7, theme_preset = $8, theme_brightness = $9,
           password_hash = $10, require_password = $11, topbar_order = $12
       WHERE id = $13`,
      [
        user.name,
        user.station_name,
        canSettings,
        canEditPrices,
        canEditOr,
        isAdmin ? 1 : 0,
        JSON.stringify(pages),
        user.theme_preset || "grigio",
        user.theme_brightness || 4,
        user.password_hash || "",
        requirePassword,
        JSON.stringify(topbarOrder),
        user.id,
      ]
    );

    // Sincronizza immediatamente con Supabase Cloud
    void UserSyncService.pushUserToSupabase({
      ...user,
      can_access_settings: isAdmin ? true : user.can_access_settings,
      can_edit_price_lists: isAdmin ? true : user.can_edit_price_lists,
      can_edit_or_numbers: isAdmin ? true : user.can_edit_or_numbers,
      allowed_pages: pages,
      topbar_order: topbarOrder,
    });
  }

  public static async deleteUser(id: string): Promise<void> {
    await this.ensureTable();
    const db = await getDatabase();
    await db.execute("DELETE FROM app_users WHERE id = $1", [id]);
    // Rimuovi anche da Supabase Cloud
    void UserSyncService.deleteUserFromSupabase(id);
  }

  public static async syncWithCloud(): Promise<{ pulled: number; pushed: number; success: boolean }> {
    await this.ensureTable();
    return await UserSyncService.syncUsers();
  }

  public static getActiveUserId(): string {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("last_active_user_id");
      if (stored) return stored;
    }
    return "admin";
  }

  public static setActiveUserId(id: string): void {
    if (typeof window !== "undefined") {
      localStorage.setItem("last_active_user_id", id);
    }
  }
}

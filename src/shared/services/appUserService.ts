import { getDatabase } from "@/shared/data-layer/database";

export interface AppPageModule {
  id: string;
  title: string;
  category: "operativo" | "archivio" | "commerciale" | "amministrazione";
}

export const ALL_APP_PAGE_MODULES: AppPageModule[] = [
  { id: "dashboard", title: "Dashboard", category: "operativo" },
  { id: "orders", title: "Order Manager", category: "operativo" },
  { id: "price-lists", title: "Listino Generale", category: "commerciale" },
  { id: "or-numbers", title: "OR Numbers", category: "operativo" },
  { id: "ddt-list", title: "DDT List", category: "archivio" },
  { id: "ddt-articles", title: "DDT Articoli", category: "archivio" },
  { id: "client-lists", title: "Listini Clienti", category: "commerciale" },
  { id: "invoices", title: "Fatture Elettroniche", category: "amministrazione" },
  { id: "ddt-studio", title: "DDT Studio (Pro)", category: "operativo" },
  { id: "quotes", title: "Preventivi", category: "commerciale" },
  { id: "offers", title: "Offerte", category: "commerciale" },
  { id: "clients", title: "Clienti", category: "commerciale" },
  { id: "settings", title: "Impostazioni", category: "amministrazione" },
];

export const DEFAULT_ALLOWED_PAGES = ALL_APP_PAGE_MODULES.map((m) => m.id);

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
  created_at: string;
}

const DEFAULT_USERS: Omit<AppUser, "created_at">[] = [
  {
    id: "admin",
    name: "Amministratore (Ufficio)",
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
      ];
      for (const sql of columnsToAdd) {
        try {
          await db.execute(sql);
        } catch {
          // Colonna già presente, errore ignorato in sicurezza
        }
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
              can_edit_price_lists, can_edit_or_numbers, is_admin, allowed_pages, theme_preset, theme_brightness, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, datetime('now'))`,
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
        let allowedPages: string[] = [];
        try {
          if (r.allowed_pages) {
            allowedPages = JSON.parse(r.allowed_pages);
          }
        } catch {
          allowedPages = [];
        }
        if (!Array.isArray(allowedPages) || allowedPages.length === 0) {
          allowedPages = r.is_admin
            ? DEFAULT_ALLOWED_PAGES
            : DEFAULT_ALLOWED_PAGES.filter((p) => p !== "settings");
        }

        return {
          id: String(r.id),
          name: String(r.name),
          station_name: String(r.station_name || ""),
          can_access_settings: Boolean(r.can_access_settings),
          can_access_ddt: Boolean(r.can_access_ddt ?? 1),
          can_access_price_lists: Boolean(r.can_access_price_lists ?? 1),
          can_edit_price_lists: Boolean(r.can_edit_price_lists ?? r.is_admin),
          can_edit_or_numbers: Boolean(r.can_edit_or_numbers ?? r.is_admin),
          is_admin: Boolean(r.is_admin),
          allowed_pages: allowedPages,
          theme_preset: (r.theme_preset || "grigio") as "grigio" | "nero-oled" | "avorio",
          theme_brightness: Number(r.theme_brightness) || 4,
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
  }): Promise<AppUser> {
    await this.ensureTable();
    const db = await getDatabase();
    const id = user.id?.trim() || `user_${Date.now()}`;
    const name = user.name.trim();
    const station = user.station_name?.trim() || "";
    const canSettings = user.can_access_settings ? 1 : 0;
    const canDdt = user.can_access_ddt ?? true ? 1 : 0;
    const canPrices = user.can_access_price_lists ?? true ? 1 : 0;
    const canEditPrices = user.can_edit_price_lists ?? user.is_admin ?? false ? 1 : 0;
    const canEditOr = user.can_edit_or_numbers ?? user.is_admin ?? false ? 1 : 0;
    const isAdmin = user.is_admin ? 1 : 0;
    const pages = user.allowed_pages || (isAdmin ? DEFAULT_ALLOWED_PAGES : DEFAULT_ALLOWED_PAGES.filter((p) => p !== "settings"));
    const themePreset = user.theme_preset || "grigio";
    const themeBrightness = user.theme_brightness || 4;
    const createdAt = new Date().toISOString();

    await db.execute(
      `INSERT INTO app_users (
        id, name, station_name, can_access_settings, can_access_ddt, can_access_price_lists,
        can_edit_price_lists, can_edit_or_numbers, is_admin, allowed_pages, theme_preset, theme_brightness, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        name,
        station,
        canSettings,
        canDdt,
        canPrices,
        canEditPrices,
        canEditOr,
        isAdmin,
        JSON.stringify(pages),
        themePreset,
        themeBrightness,
        createdAt,
      ]
    );

    return {
      id,
      name,
      station_name: station,
      can_access_settings: Boolean(canSettings),
      can_access_ddt: Boolean(canDdt),
      can_access_price_lists: Boolean(canPrices),
      can_edit_price_lists: Boolean(canEditPrices),
      can_edit_or_numbers: Boolean(canEditOr),
      is_admin: Boolean(isAdmin),
      allowed_pages: pages,
      theme_preset: themePreset,
      theme_brightness: themeBrightness,
      created_at: createdAt,
    };
  }

  public static async updateUser(user: AppUser): Promise<void> {
    await this.ensureTable();
    const db = await getDatabase();
    await db.execute(
      `UPDATE app_users 
       SET name = $1, station_name = $2, can_access_settings = $3, can_access_ddt = $4,
           can_access_price_lists = $5, can_edit_price_lists = $6, can_edit_or_numbers = $7,
           is_admin = $8, allowed_pages = $9, theme_preset = $10, theme_brightness = $11
       WHERE id = $12`,
      [
        user.name,
        user.station_name,
        user.can_access_settings ? 1 : 0,
        user.can_access_ddt ? 1 : 0,
        user.can_access_price_lists ? 1 : 0,
        user.can_edit_price_lists ? 1 : 0,
        user.can_edit_or_numbers ? 1 : 0,
        user.is_admin ? 1 : 0,
        JSON.stringify(user.allowed_pages || []),
        user.theme_preset || "grigio",
        user.theme_brightness || 4,
        user.id,
      ]
    );
  }

  public static async deleteUser(id: string): Promise<void> {
    await this.ensureTable();
    const db = await getDatabase();
    await db.execute("DELETE FROM app_users WHERE id = $1", [id]);
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

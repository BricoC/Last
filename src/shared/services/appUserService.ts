import { getDatabase } from "@/shared/data-layer/database";

export interface AppPageModule {
  id: string;
  title: string;
  category: "operativo" | "archivio" | "commerciale" | "amministrazione";
}

export const ALL_APP_PAGE_MODULES: AppPageModule[] = [
  { id: "dashboard", title: "Dashboard", category: "operativo" },
  { id: "ddt-studio", title: "DDT Studio", category: "operativo" },
  { id: "orders", title: "Order Manager", category: "operativo" },
  { id: "price-lists", title: "Listino Generale", category: "commerciale" },
  { id: "client-lists", title: "Listini Clienti", category: "commerciale" },
  { id: "quotes", title: "Preventivi", category: "commerciale" },
  { id: "offers", title: "Offerte", category: "commerciale" },
  { id: "clients", title: "Clienti", category: "commerciale" },
  { id: "supplier-price-lists", title: "Listini Fornitori", category: "commerciale" },
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
  "ddt-studio",
  "orders",
  "price-lists",
  "client-lists",
  "quotes",
  "offers",
  "or-numbers",
  "ddt-list",
  "ddt-articles",
  "invoices",
  "clients",
  "supplier-price-lists",
  "notes",
];

export function isPageAllowedForUser(user: AppUser | null | undefined, pageId: string): boolean {
  if (!user) return false;
  if (user.is_admin) return true;
  if (pageId === "settings") {
    return Boolean(user.can_access_settings);
  }
  if (!Array.isArray(user.allowed_pages)) {
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
  can_manage_backups?: boolean;
  is_admin: boolean;
  allowed_pages: string[];
  theme_preset: "grigio" | "nero-oled" | "avorio";
  theme_brightness: number;
  password_hash?: string;
  require_password: boolean;
  topbar_order?: string[];
  created_at: string;
}

const PASSWORD_HASH_SCHEME = "pbkdf2-sha256";
const PASSWORD_HASH_ITERATIONS = 600_000;
const MIN_ACCEPTED_PASSWORD_HASH_ITERATIONS = 100_000;
const MAX_ACCEPTED_PASSWORD_HASH_ITERATIONS = 2_000_000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_DERIVED_KEY_BYTES = 32;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derivePasswordKey(plain: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(plain),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations },
    material,
    PASSWORD_DERIVED_KEY_BYTES * 8
  );
  return new Uint8Array(bits);
}

/** True for hashes created by the former unsalted SHA-256 implementation. */
export function isLegacyPasswordHash(hash?: string): boolean {
  return Boolean(hash && /^[a-f\d]{64}$/i.test(hash));
}

export async function hashPassword(plain: string): Promise<string> {
  if (!plain) return "";
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const derivedKey = await derivePasswordKey(plain, salt, PASSWORD_HASH_ITERATIONS);
  return [
    PASSWORD_HASH_SCHEME,
    String(PASSWORD_HASH_ITERATIONS),
    toBase64(salt),
    toBase64(derivedKey),
  ].join("$");
}

async function verifyLegacyPassword(plain: string, hash: string): Promise<boolean> {
  const data = new TextEncoder().encode(plain);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  const expected = Uint8Array.from(
    hash.match(/.{2}/g) || [],
    (byte) => Number.parseInt(byte, 16)
  );
  return constantTimeEqual(digest, expected);
}

export async function verifyPassword(plain: string, hash?: string): Promise<boolean> {
  if (!hash || !plain) return false;
  if (isLegacyPasswordHash(hash)) return verifyLegacyPassword(plain, hash);

  const [scheme, iterationsText, saltText, derivedKeyText, extra] = hash.split("$");
  const iterations = Number(iterationsText);
  if (
    scheme !== PASSWORD_HASH_SCHEME ||
    extra !== undefined ||
    !Number.isSafeInteger(iterations) ||
    iterations < MIN_ACCEPTED_PASSWORD_HASH_ITERATIONS ||
    iterations > MAX_ACCEPTED_PASSWORD_HASH_ITERATIONS
  ) {
    return false;
  }

  try {
    const salt = fromBase64(saltText);
    const expected = fromBase64(derivedKeyText);
    if (salt.length < PASSWORD_SALT_BYTES || expected.length !== PASSWORD_DERIVED_KEY_BYTES) {
      return false;
    }
    const actual = await derivePasswordKey(plain, salt, iterations);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
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
    can_manage_backups: true,
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
    can_manage_backups: false,
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
      "supplier-price-lists",
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
    can_manage_backups: false,
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
      "supplier-price-lists",
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
          can_manage_backups INTEGER NOT NULL DEFAULT 0,
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

      // Aggiunta colonna can_manage_backups e garanzia permanente per gli Admin
      try {
        await db.execute(
          "ALTER TABLE app_users ADD COLUMN can_manage_backups INTEGER NOT NULL DEFAULT 0"
        );
      } catch {
        // Colonna già presente
      }
      try {
        await db.execute(
          "UPDATE app_users SET can_manage_backups = 1 WHERE is_admin = 1 AND can_manage_backups = 0"
        );
      } catch {
        // Nessun aggiornamento necessario
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
              can_edit_price_lists, can_edit_or_numbers, can_manage_backups, is_admin, allowed_pages, theme_preset, theme_brightness,
              password_hash, require_password, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, datetime('now'))`,
            [
              u.id,
              u.name,
              u.station_name,
              u.can_access_settings ? 1 : 0,
              u.can_access_ddt ? 1 : 0,
              u.can_access_price_lists ? 1 : 0,
              u.can_edit_price_lists ? 1 : 0,
              u.can_edit_or_numbers ? 1 : 0,
              u.can_manage_backups ? 1 : 0,
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
      throw e;
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
        let hasExplicitAllowedPages = false;
        try {
          if (typeof r.allowed_pages === "string" && r.allowed_pages.trim() !== "") {
            const parsed = JSON.parse(r.allowed_pages);
            if (Array.isArray(parsed)) {
              allowedPages = parsed;
              hasExplicitAllowedPages = true;
            }
          }
        } catch {
          allowedPages = [];
        }
        if (isAdmin) {
          allowedPages = DEFAULT_ALLOWED_PAGES;
        } else if (!hasExplicitAllowedPages) {
          allowedPages = ["dashboard"];
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
          can_manage_backups: isAdmin ? true : Boolean(r.can_manage_backups),
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
      throw e;
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
    can_manage_backups?: boolean;
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
    const canManageBackups = user.can_manage_backups !== undefined ? (user.can_manage_backups ? 1 : 0) : (isAdmin ? 1 : 0);
    const pages = isAdmin
      ? DEFAULT_ALLOWED_PAGES
      : (user.allowed_pages || DEFAULT_ALLOWED_PAGES.filter((p) => p !== "settings"));
    const themePreset = user.theme_preset || "grigio";
    const themeBrightness = user.theme_brightness || 4;
    const passwordHash = user.password_hash || "";
    const requirePassword = user.require_password ? 1 : 0;
    if (requirePassword && !passwordHash.trim()) {
      throw new Error("Impossibile attivare la richiesta password senza impostare una password valida.");
    }
    const topbarOrder = user.topbar_order && user.topbar_order.length > 0 ? user.topbar_order : DEFAULT_TOPBAR_ORDER;
    const createdAt = new Date().toISOString();

    await db.execute(
      `INSERT INTO app_users (
        id, name, station_name, can_access_settings, can_access_ddt, can_access_price_lists,
        can_edit_price_lists, can_edit_or_numbers, can_manage_backups, is_admin, allowed_pages, theme_preset, theme_brightness,
        password_hash, require_password, topbar_order, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        id,
        name,
        station,
        canSettings,
        canDdt,
        canPrices,
        canEditPrices,
        canEditOr,
        canManageBackups,
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
      can_manage_backups: Boolean(canManageBackups),
      is_admin: isAdmin,
      allowed_pages: pages,
      theme_preset: themePreset,
      theme_brightness: themeBrightness,
      password_hash: passwordHash,
      require_password: Boolean(requirePassword),
      topbar_order: topbarOrder,
      created_at: createdAt,
    };


    return created;
  }

  public static async updateUser(user: AppUser): Promise<void> {
    await this.ensureTable();
    const db = await getDatabase();
    const isAdmin = Boolean(user.is_admin);
    const canSettings = isAdmin ? 1 : user.can_access_settings ? 1 : 0;
    const canEditPrices = isAdmin ? 1 : user.can_edit_price_lists ? 1 : 0;
    const canEditOr = isAdmin ? 1 : user.can_edit_or_numbers ? 1 : 0;
    const canManageBackups = isAdmin ? 1 : user.can_manage_backups ? 1 : 0;
    const pages = isAdmin ? DEFAULT_ALLOWED_PAGES : (user.allowed_pages || []);
    const requirePassword = user.require_password ? 1 : 0;
    const passwordHash = user.password_hash || "";
    if (requirePassword && !passwordHash.trim()) {
      throw new Error("Impossibile attivare la richiesta password senza impostare una password valida.");
    }
    const topbarOrder = user.topbar_order && user.topbar_order.length > 0 ? user.topbar_order : DEFAULT_TOPBAR_ORDER;

    await db.execute(
      `UPDATE app_users 
       SET name = $1, station_name = $2, can_access_settings = $3, can_access_ddt = 1,
           can_access_price_lists = 1, can_edit_price_lists = $4, can_edit_or_numbers = $5,
           can_manage_backups = $6, is_admin = $7, allowed_pages = $8, theme_preset = $9, theme_brightness = $10,
           password_hash = $11, require_password = $12, topbar_order = $13
       WHERE id = $14`,
      [
        user.name,
        user.station_name,
        canSettings,
        canEditPrices,
        canEditOr,
        canManageBackups,
        isAdmin ? 1 : 0,
        JSON.stringify(pages),
        user.theme_preset || "grigio",
        user.theme_brightness || 4,
        passwordHash,
        requirePassword,
        JSON.stringify(topbarOrder),
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

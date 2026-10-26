import { getDatabase } from "@/shared/data-layer/database";

export interface AppUser {
  id: string;
  name: string;
  station_name: string;
  can_access_settings: boolean;
  can_access_ddt: boolean;
  can_access_price_lists: boolean;
  is_admin: boolean;
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
    is_admin: true,
  },
  {
    id: "banco-1",
    name: "Banco 1",
    station_name: "Postazione Cassa 1",
    can_access_settings: false,
    can_access_ddt: true,
    can_access_price_lists: true,
    is_admin: false,
  },
  {
    id: "banco-2",
    name: "Banco 2",
    station_name: "Postazione Cassa 2",
    can_access_settings: false,
    can_access_ddt: true,
    can_access_price_lists: true,
    is_admin: false,
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
          is_admin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
      `);

      // Verifica se ci sono utenti, altrimenti effettua il seed iniziale
      const existing = await db.select<{ count: number }[]>(
        "SELECT COUNT(*) as count FROM app_users"
      );
      if (existing?.[0]?.count === 0) {
        for (const u of DEFAULT_USERS) {
          await db.execute(
            `INSERT INTO app_users (id, name, station_name, can_access_settings, can_access_ddt, can_access_price_lists, is_admin, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'))`,
            [
              u.id,
              u.name,
              u.station_name,
              u.can_access_settings ? 1 : 0,
              u.can_access_ddt ? 1 : 0,
              u.can_access_price_lists ? 1 : 0,
              u.is_admin ? 1 : 0,
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
      return rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        station_name: String(r.station_name || ""),
        can_access_settings: Boolean(r.can_access_settings),
        can_access_ddt: Boolean(r.can_access_ddt),
        can_access_price_lists: Boolean(r.can_access_price_lists),
        is_admin: Boolean(r.is_admin),
        created_at: String(r.created_at || ""),
      }));
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
    is_admin?: boolean;
  }): Promise<AppUser> {
    await this.ensureTable();
    const db = await getDatabase();
    const id = user.id?.trim() || `user_${Date.now()}`;
    const name = user.name.trim();
    const station = user.station_name?.trim() || "";
    const canSettings = user.can_access_settings ? 1 : 0;
    const canDdt = user.can_access_ddt ?? true ? 1 : 0;
    const canPrices = user.can_access_price_lists ?? true ? 1 : 0;
    const isAdmin = user.is_admin ? 1 : 0;
    const createdAt = new Date().toISOString();

    await db.execute(
      `INSERT INTO app_users (id, name, station_name, can_access_settings, can_access_ddt, can_access_price_lists, is_admin, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, name, station, canSettings, canDdt, canPrices, isAdmin, createdAt]
    );

    return {
      id,
      name,
      station_name: station,
      can_access_settings: Boolean(canSettings),
      can_access_ddt: Boolean(canDdt),
      can_access_price_lists: Boolean(canPrices),
      is_admin: Boolean(isAdmin),
      created_at: createdAt,
    };
  }

  public static async updateUser(user: AppUser): Promise<void> {
    await this.ensureTable();
    const db = await getDatabase();
    await db.execute(
      `UPDATE app_users 
       SET name = $1, station_name = $2, can_access_settings = $3, can_access_ddt = $4, can_access_price_lists = $5, is_admin = $6
       WHERE id = $7`,
      [
        user.name,
        user.station_name,
        user.can_access_settings ? 1 : 0,
        user.can_access_ddt ? 1 : 0,
        user.can_access_price_lists ? 1 : 0,
        user.is_admin ? 1 : 0,
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

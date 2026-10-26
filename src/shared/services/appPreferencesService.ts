import { getDatabase } from "@/shared/data-layer/database";
import { AppUserService } from "./appUserService";

export class AppPreferencesService {
  private static tableEnsured = false;

  private static async ensureTable() {
    if (this.tableEnsured) return;
    try {
      const db = await getDatabase();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS app_preferences (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      this.tableEnsured = true;
    } catch (e) {
      console.error("Errore creazione tabella app_preferences:", e);
    }
  }

  public static async getPreference(key: string, defaultValue?: string): Promise<string | null> {
    try {
      await this.ensureTable();
      const db = await getDatabase();
      const rows = await db.select<{ value: string }[]>(
        "SELECT value FROM app_preferences WHERE key = $1 LIMIT 1",
        [key]
      );
      if (rows && rows.length > 0) {
        return rows[0].value;
      }
      return defaultValue ?? null;
    } catch (e) {
      console.error(`Errore lettura preferenza ${key}:`, e);
      return defaultValue ?? null;
    }
  }

  public static async setPreference(key: string, value: string): Promise<void> {
    try {
      await this.ensureTable();
      const db = await getDatabase();
      await db.execute(
        `INSERT OR REPLACE INTO app_preferences (key, value, updated_at) 
         VALUES ($1, $2, datetime('now'))`,
        [key, value]
      );
    } catch (e) {
      console.error(`Errore salvataggio preferenza ${key}:`, e);
    }
  }

  /**
   * Recupera una preferenza specifica per l'utente/postazione PC attualmente attiva.
   * Se l'utente non ha ancora personalizzato il valore, ripiega sul valore globale o sul default.
   */
  public static async getUserPreference(key: string, defaultValue?: string): Promise<string | null> {
    const userId = AppUserService.getActiveUserId();
    const userKey = `user:${userId}:${key}`;
    const userVal = await this.getPreference(userKey);
    if (userVal !== null && userVal !== undefined) {
      return userVal;
    }
    return this.getPreference(key, defaultValue);
  }

  /**
   * Salva una preferenza vincolata all'utente/postazione PC attualmente attiva,
   * evitando collisioni o sovrascritture tra computer diversi del negozio.
   */
  public static async setUserPreference(key: string, value: string): Promise<void> {
    const userId = AppUserService.getActiveUserId();
    const userKey = `user:${userId}:${key}`;
    await this.setPreference(userKey, value);
  }
}

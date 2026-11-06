import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";

export interface EmailSettings {
  carrara_to: string;
  carrara_cc: string;
  wepa_salanetti_to: string;
  wepa_salanetti_cc: string;
  wepa_ralletta_to: string;
  wepa_ralletta_cc: string;
  bank_to: string;
  bank_cc: string;
  accountant_to: string;
  accountant_cc: string;
}

export type EmailSettingsInput = EmailSettings;

export const SETTINGS_ID = "email_config";

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  carrara_to: "alessio.piccinini@cartierecarrara.com",
  carrara_cc: "federica.bianchi@cartierecarrara.com",
  wepa_salanetti_to: "Roberto.Lazzareschi@wepa.eu",
  wepa_salanetti_cc: "Massimiliano.Giusti@wepa.eu",
  wepa_ralletta_to: "Davide.Petrucci@wepa.eu",
  wepa_ralletta_cc: "Massimiliano.Giusti@wepa.eu",
  bank_to: "rachele.neri@bpc.bcc.it",
  bank_cc: "capannori@bpc.bcc.it",
  accountant_to: "contabilita@studiotaddeucci.it",
  accountant_cc: "",
};

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
  configPath: string;
}

let cachedSupabaseConfig: SupabaseConfig | null = null;

export async function getSupabaseCredentials(): Promise<SupabaseConfig | null> {
  if (cachedSupabaseConfig) return cachedSupabaseConfig;
  try {
    const status = await invoke<ConfigStatus>("load_supabase_config");
    if (status?.config?.projectUrl && status?.config?.anonKey) {
      cachedSupabaseConfig = {
        projectUrl: status.config.projectUrl.replace(/\/$/, ""),
        anonKey: status.config.anonKey.trim(),
      };
      return cachedSupabaseConfig;
    }
  } catch (err) {
    console.warn("[emailSettingsRepository] Impossibile recuperare credenziali Supabase:", err);
  }
  return null;
}

/**
 * Invia le impostazioni email al Cloud Supabase (UPSERT)
 */
export async function pushEmailSettingsToSupabase(input: EmailSettingsInput): Promise<boolean> {
  try {
    const creds = await getSupabaseCredentials();
    if (!creds) return false;

    const row = {
      id: SETTINGS_ID,
      carrara_to: input.carrara_to.trim(),
      carrara_cc: input.carrara_cc.trim(),
      wepa_salanetti_to: input.wepa_salanetti_to.trim(),
      wepa_salanetti_cc: input.wepa_salanetti_cc.trim(),
      wepa_ralletta_to: input.wepa_ralletta_to.trim(),
      wepa_ralletta_cc: input.wepa_ralletta_cc.trim(),
      bank_to: input.bank_to.trim(),
      bank_cc: input.bank_cc.trim(),
      accountant_to: input.accountant_to.trim(),
      accountant_cc: input.accountant_cc.trim(),
      updated_at: new Date().toISOString(),
      updated_by: "system",
    };

    const url = `${creds.projectUrl}/rest/v1/email_settings`;
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

    if (res.ok) {
      const db = await getDatabase();
      await db.execute("UPDATE email_settings SET sync_status = 'synced' WHERE id = $1", [SETTINGS_ID]);
      return true;
    } else {
      const txt = await res.text();
      console.warn(`[emailSettingsRepository] Supabase push error (${res.status}):`, txt);
    }
  } catch (err) {
    console.warn("[emailSettingsRepository] Errore di rete push email_settings su Supabase:", err);
  }
  return false;
}

/**
 * Scarica le impostazioni email dal Cloud Supabase e aggiorna SQLite locale
 */
export async function pullEmailSettingsFromSupabase(): Promise<EmailSettings | null> {
  try {
    const creds = await getSupabaseCredentials();
    if (!creds) return null;

    const url = `${creds.projectUrl}/rest/v1/email_settings?id=eq.${encodeURIComponent(SETTINGS_ID)}&select=*`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: creds.anonKey,
        Authorization: `Bearer ${creds.anonKey}`,
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0]) {
      const r = data[0];
      const parsed: EmailSettings = {
        carrara_to: r.carrara_to ?? "",
        carrara_cc: r.carrara_cc ?? "",
        wepa_salanetti_to: r.wepa_salanetti_to ?? "",
        wepa_salanetti_cc: r.wepa_salanetti_cc ?? "",
        wepa_ralletta_to: r.wepa_ralletta_to ?? "",
        wepa_ralletta_cc: r.wepa_ralletta_cc ?? "",
        bank_to: r.bank_to ?? "",
        bank_cc: r.bank_cc ?? "",
        accountant_to: r.accountant_to ?? "",
        accountant_cc: r.accountant_cc ?? "",
      };

      // Aggiorna copia locale SQLite
      const db = await getDatabase();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO email_settings (
          id, carrara_to, carrara_cc, wepa_salanetti_to, wepa_salanetti_cc,
          wepa_ralletta_to, wepa_ralletta_cc, bank_to, bank_cc,
          accountant_to, accountant_cc,
          created_at, updated_at, updated_by, deleted_at, sync_status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,'supabase',NULL,'synced')
        ON CONFLICT(id) DO UPDATE SET
          carrara_to = excluded.carrara_to,
          carrara_cc = excluded.carrara_cc,
          wepa_salanetti_to = excluded.wepa_salanetti_to,
          wepa_salanetti_cc = excluded.wepa_salanetti_cc,
          wepa_ralletta_to = excluded.wepa_ralletta_to,
          wepa_ralletta_cc = excluded.wepa_ralletta_cc,
          bank_to = excluded.bank_to,
          bank_cc = excluded.bank_cc,
          accountant_to = excluded.accountant_to,
          accountant_cc = excluded.accountant_cc,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          deleted_at = NULL,
          sync_status = 'synced'`,
        [
          SETTINGS_ID,
          parsed.carrara_to,
          parsed.carrara_cc,
          parsed.wepa_salanetti_to,
          parsed.wepa_salanetti_cc,
          parsed.wepa_ralletta_to,
          parsed.wepa_ralletta_cc,
          parsed.bank_to,
          parsed.bank_cc,
          parsed.accountant_to,
          parsed.accountant_cc,
          now,
        ]
      );

      return parsed;
    }
  } catch (err) {
    console.warn("[emailSettingsRepository] Errore pull email_settings da Supabase:", err);
  }
  return null;
}

export async function getEmailSettings(): Promise<EmailSettings> {
  try {
    const db = await getDatabase();
    const rows = await db.select<EmailSettings[]>(
      "SELECT * FROM email_settings WHERE id = $1 AND deleted_at IS NULL",
      [SETTINGS_ID]
    );

    if (rows && rows.length > 0 && rows[0]) {
      const r = rows[0];
      return {
        carrara_to: r.carrara_to ?? DEFAULT_EMAIL_SETTINGS.carrara_to,
        carrara_cc: r.carrara_cc ?? DEFAULT_EMAIL_SETTINGS.carrara_cc,
        wepa_salanetti_to: r.wepa_salanetti_to ?? DEFAULT_EMAIL_SETTINGS.wepa_salanetti_to,
        wepa_salanetti_cc: r.wepa_salanetti_cc ?? DEFAULT_EMAIL_SETTINGS.wepa_salanetti_cc,
        wepa_ralletta_to: r.wepa_ralletta_to ?? DEFAULT_EMAIL_SETTINGS.wepa_ralletta_to,
        wepa_ralletta_cc: r.wepa_ralletta_cc ?? DEFAULT_EMAIL_SETTINGS.wepa_ralletta_cc,
        bank_to: r.bank_to ?? DEFAULT_EMAIL_SETTINGS.bank_to,
        bank_cc: r.bank_cc ?? DEFAULT_EMAIL_SETTINGS.bank_cc,
        accountant_to: r.accountant_to ?? DEFAULT_EMAIL_SETTINGS.accountant_to,
        accountant_cc: r.accountant_cc ?? "",
      };
    }
  } catch (err) {
    console.warn("[emailSettingsRepository] Errore lettura SQLite:", err);
  }

  return { ...DEFAULT_EMAIL_SETTINGS };
}

export interface SaveEmailResult {
  savedLocal: boolean;
  syncedCloud: boolean;
}

export async function saveEmailSettings(input: EmailSettingsInput): Promise<SaveEmailResult> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  // 1. Salvataggio locale in SQLite (Offline-first)
  await db.execute(
    `INSERT INTO email_settings (
      id, carrara_to, carrara_cc, wepa_salanetti_to, wepa_salanetti_cc,
      wepa_ralletta_to, wepa_ralletta_cc, bank_to, bank_cc,
      accountant_to, accountant_cc,
      created_at, updated_at, updated_by, deleted_at, sync_status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,'system',NULL,'pending')
    ON CONFLICT(id) DO UPDATE SET
      carrara_to = excluded.carrara_to,
      carrara_cc = excluded.carrara_cc,
      wepa_salanetti_to = excluded.wepa_salanetti_to,
      wepa_salanetti_cc = excluded.wepa_salanetti_cc,
      wepa_ralletta_to = excluded.wepa_ralletta_to,
      wepa_ralletta_cc = excluded.wepa_ralletta_cc,
      bank_to = excluded.bank_to,
      bank_cc = excluded.bank_cc,
      accountant_to = excluded.accountant_to,
      accountant_cc = excluded.accountant_cc,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by,
      deleted_at = NULL,
      sync_status = 'pending'`,
    [
      SETTINGS_ID,
      input.carrara_to.trim(),
      input.carrara_cc.trim(),
      input.wepa_salanetti_to.trim(),
      input.wepa_salanetti_cc.trim(),
      input.wepa_ralletta_to.trim(),
      input.wepa_ralletta_cc.trim(),
      input.bank_to.trim(),
      input.bank_cc.trim(),
      input.accountant_to.trim(),
      input.accountant_cc.trim(),
      now,
    ]
  );

  // 2. Sincronizzazione immediata con Supabase Cloud
  const syncedCloud = await pushEmailSettingsToSupabase(input);

  return { savedLocal: true, syncedCloud };
}

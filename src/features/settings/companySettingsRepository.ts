import { getDatabase } from "@/shared/data-layer/database";
import { createCachedSupabaseConfigLoader } from "@/shared/services/supabaseConfigCache";
import { supabaseFetch } from "@/shared/services/supabaseSession";
import type { BaseEntity } from "@/shared/types/baseEntity";

export interface CompanySettings extends BaseEntity {
  business_name: string;
  address: string;
  postal_code: string;
  city: string;
  province: string;
  vat_number: string;
  fiscal_code: string;
  sdi_code?: string;
  phone: string;
  email: string;
  logo_data_url: string | null;
}

export type CompanySettingsInput = Omit<CompanySettings, keyof BaseEntity>;
export interface SaveCompanySettingsResult {
  savedLocal: boolean;
  syncedCloud: boolean;
}

const SETTINGS_ID = "company_profile";
const getSupabaseCredentials = createCachedSupabaseConfigLoader("companySettingsRepository");

let cachedCompanySettings: CompanySettings | null = null;
let inFlightSettingsPromise: Promise<CompanySettings> | null = null;

/** Restituisce le impostazioni aziendali se già caricate in memoria (evita query ripetute su batch render). */
export function getCachedCompanySettings(): CompanySettings | null {
  return cachedCompanySettings;
}

/** Invalida esplicitamente la cache in memoria (utile per test o refresh forzati). */
export function clearCompanySettingsCache(): void {
  cachedCompanySettings = null;
}

export const DEFAULT_COMPANY_SETTINGS: CompanySettingsInput = {
  business_name: "",
  address: "",
  postal_code: "",
  city: "",
  province: "",
  vat_number: "",
  fiscal_code: "",
  sdi_code: "",
  phone: "",
  email: "",
  logo_data_url: null,
};

export async function pushCompanySettingsToSupabase(input: CompanySettingsInput): Promise<boolean> {
  try {
    const creds = await getSupabaseCredentials();
    if (!creds) return false;

    const row = {
      id: SETTINGS_ID,
      business_name: (input.business_name ?? "").trim(),
      address: (input.address ?? "").trim(),
      postal_code: (input.postal_code ?? "").trim(),
      city: (input.city ?? "").trim(),
      province: (input.province ?? "").trim(),
      vat_number: (input.vat_number ?? "").trim(),
      fiscal_code: (input.fiscal_code ?? "").trim(),
      sdi_code: (input.sdi_code ?? "").trim(),
      phone: (input.phone ?? "").trim(),
      email: (input.email ?? "").trim(),
      logo_data_url: input.logo_data_url ?? null,
      updated_at: new Date().toISOString(),
      updated_by: "system",
    };

    const url = `${creds.projectUrl}/rest/v1/company_settings`;
    const res = await supabaseFetch(url, {
      method: "POST",
      headers: {
        apikey: creds.anonKey,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(row),
    });

    if (res.ok) {
      const db = await getDatabase();
      await db.execute("UPDATE company_settings SET sync_status = 'synced' WHERE id = $1", [SETTINGS_ID]);
      if (cachedCompanySettings) {
        cachedCompanySettings = { ...cachedCompanySettings, sync_status: "synced" };
      }
      return true;
    }

    const txt = await res.text();
    console.warn(`[companySettingsRepository] Supabase push error (${res.status}):`, txt);
  } catch (err) {
    console.warn("[companySettingsRepository] Errore di rete push company_settings su Supabase:", err);
  }
  return false;
}

export async function pullCompanySettingsFromSupabase(requireCloud = false): Promise<CompanySettings | null> {
  try {
    const creds = await getSupabaseCredentials();
    if (!creds) {
      if (requireCloud) throw new Error("Configurazione Supabase assente");
      return null;
    }

    const url = `${creds.projectUrl}/rest/v1/company_settings?id=eq.${encodeURIComponent(SETTINGS_ID)}&select=*`;
    const res = await supabaseFetch(url, {
      method: "GET",
      headers: {
        apikey: creds.anonKey,
      },
    });

    if (!res.ok) {
      if (requireCloud) throw new Error(`HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (requireCloud && !Array.isArray(data)) throw new Error("Risposta Supabase non valida");
    if (Array.isArray(data) && data.length > 0 && data[0]) {
      const r = data[0];
      const now = new Date().toISOString();
      const parsed: CompanySettings = {
        id: SETTINGS_ID,
        business_name: r.business_name ?? "",
        address: r.address ?? "",
        postal_code: r.postal_code ?? "",
        city: r.city ?? "",
        province: r.province ?? "",
        vat_number: r.vat_number ?? "",
        fiscal_code: r.fiscal_code ?? "",
        sdi_code: r.sdi_code ?? "",
        phone: r.phone ?? "",
        email: r.email ?? "",
        logo_data_url: r.logo_data_url ?? null,
        created_at: r.created_at ?? now,
        updated_at: r.updated_at ?? now,
        updated_by: r.updated_by ?? "supabase",
        deleted_at: null,
        sync_status: "synced",
      };

      const db = await getDatabase();
      await db.execute(
        `INSERT INTO company_settings (
          id, business_name, address, postal_code, city, province, vat_number, fiscal_code,
          sdi_code, phone, email, logo_data_url, created_at, updated_at, updated_by, deleted_at, sync_status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'supabase',NULL,'synced')
        ON CONFLICT(id) DO UPDATE SET
          business_name = excluded.business_name, address = excluded.address,
          postal_code = excluded.postal_code, city = excluded.city, province = excluded.province,
          vat_number = excluded.vat_number, fiscal_code = excluded.fiscal_code,
          sdi_code = excluded.sdi_code, phone = excluded.phone, email = excluded.email,
          logo_data_url = excluded.logo_data_url, updated_at = excluded.updated_at,
          updated_by = excluded.updated_by, deleted_at = NULL, sync_status = 'synced'`,
        [
          SETTINGS_ID,
          parsed.business_name,
          parsed.address,
          parsed.postal_code,
          parsed.city,
          parsed.province,
          parsed.vat_number,
          parsed.fiscal_code,
          parsed.sdi_code ?? "",
          parsed.phone,
          parsed.email,
          parsed.logo_data_url,
          parsed.created_at,
          parsed.updated_at,
        ]
      );

      cachedCompanySettings = parsed;
      return parsed;
    }
  } catch (err) {
    if (requireCloud) throw err;
    console.warn("[companySettingsRepository] Errore pull company_settings da Supabase:", err);
  }
  return null;
}

export async function getCompanySettings(): Promise<CompanySettings> {
  if (cachedCompanySettings) {
    return cachedCompanySettings;
  }
  if (inFlightSettingsPromise) {
    return inFlightSettingsPromise;
  }

  inFlightSettingsPromise = (async () => {
    const db = await getDatabase();
    const rows = await db.select<CompanySettings[]>(
      "SELECT * FROM company_settings WHERE id = $1 AND deleted_at IS NULL", [SETTINGS_ID]
    );
    if (rows[0]) {
      cachedCompanySettings = rows[0];
      return rows[0];
    }

    const now = new Date().toISOString();
    const emptyDefaults: CompanySettings = {
      ...DEFAULT_COMPANY_SETTINGS,
      id: SETTINGS_ID,
      created_at: now,
      updated_at: now,
      updated_by: "system",
      deleted_at: null,
      sync_status: "synced",
    };
    cachedCompanySettings = emptyDefaults;
    return emptyDefaults;
  })();

  try {
    return await inFlightSettingsPromise;
  } finally {
    inFlightSettingsPromise = null;
  }
}

export async function saveCompanySettings(input: CompanySettingsInput): Promise<SaveCompanySettingsResult> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.execute(`
    INSERT INTO company_settings (
      id, business_name, address, postal_code, city, province, vat_number, fiscal_code,
      sdi_code, phone, email, logo_data_url, created_at, updated_at, updated_by, deleted_at, sync_status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,'system',NULL,'pending')
    ON CONFLICT(id) DO UPDATE SET
      business_name = excluded.business_name, address = excluded.address,
      postal_code = excluded.postal_code, city = excluded.city, province = excluded.province,
      vat_number = excluded.vat_number, fiscal_code = excluded.fiscal_code,
      sdi_code = excluded.sdi_code, phone = excluded.phone, email = excluded.email,
      logo_data_url = excluded.logo_data_url, updated_at = excluded.updated_at,
      updated_by = excluded.updated_by, deleted_at = NULL, sync_status = 'pending'
  `, [SETTINGS_ID, input.business_name, input.address, input.postal_code, input.city,
    input.province, input.vat_number, input.fiscal_code, input.sdi_code || "",
    input.phone, input.email, input.logo_data_url, now]);

  cachedCompanySettings = {
    ...input,
    sdi_code: input.sdi_code || "",
    id: SETTINGS_ID,
    created_at: cachedCompanySettings?.created_at || now,
    updated_at: now,
    updated_by: "system",
    deleted_at: null,
    sync_status: "pending",
  };

  const syncedCloud = await pushCompanySettingsToSupabase(input);
  return { savedLocal: true, syncedCloud };
}

import { getDatabase } from "@/shared/data-layer/database";
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
const SETTINGS_ID = "company_profile";

export const DEFAULT_COMPANY_SETTINGS: CompanySettingsInput = {
  business_name: "Ferramenta Brico Class S.A.S.",
  address: "Via di Carraia, 218",
  postal_code: "55061",
  city: "Carraia - Capannori",
  province: "LU",
  vat_number: "01601690462",
  fiscal_code: "01601690462",
  sdi_code: "M5UXCR1",
  phone: "0583.980126",
  email: "Bricoclass@live.it",
  logo_data_url: null,
};

export async function getCompanySettings(): Promise<CompanySettings> {
  const db = await getDatabase();
  const rows = await db.select<CompanySettings[]>(
    "SELECT * FROM company_settings WHERE id = $1 AND deleted_at IS NULL", [SETTINGS_ID]
  );
  if (rows[0]) return rows[0];

  // Auto-seed iniziale dei dati aziendali Brico Class se non ancora inizializzati
  await saveCompanySettings(DEFAULT_COMPANY_SETTINGS);
  const seeded = await db.select<CompanySettings[]>(
    "SELECT * FROM company_settings WHERE id = $1 AND deleted_at IS NULL", [SETTINGS_ID]
  );
  return seeded[0] ?? {
    ...DEFAULT_COMPANY_SETTINGS,
    id: SETTINGS_ID,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: "system",
    deleted_at: null,
    sync_status: "pending",
  };
}

export async function saveCompanySettings(input: CompanySettingsInput): Promise<void> {
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
    input.province, input.vat_number, input.fiscal_code, input.sdi_code || "M5UXCR1",
    input.phone, input.email, input.logo_data_url, now]);
}

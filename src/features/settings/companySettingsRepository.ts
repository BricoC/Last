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
  phone: string;
  email: string;
  logo_data_url: string | null;
}

export type CompanySettingsInput = Omit<CompanySettings, keyof BaseEntity>;
const SETTINGS_ID = "company_profile";

export async function getCompanySettings(): Promise<CompanySettings | null> {
  const db = await getDatabase();
  const rows = await db.select<CompanySettings[]>(
    "SELECT * FROM company_settings WHERE id = $1 AND deleted_at IS NULL", [SETTINGS_ID]
  );
  return rows[0] ?? null;
}

export async function saveCompanySettings(input: CompanySettingsInput): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.execute(`
    INSERT INTO company_settings (
      id, business_name, address, postal_code, city, province, vat_number, fiscal_code,
      phone, email, logo_data_url, created_at, updated_at, updated_by, deleted_at, sync_status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,'system',NULL,'pending')
    ON CONFLICT(id) DO UPDATE SET
      business_name = excluded.business_name, address = excluded.address,
      postal_code = excluded.postal_code, city = excluded.city, province = excluded.province,
      vat_number = excluded.vat_number, fiscal_code = excluded.fiscal_code,
      phone = excluded.phone, email = excluded.email, logo_data_url = excluded.logo_data_url,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by,
      deleted_at = NULL, sync_status = 'pending'
  `, [SETTINGS_ID, input.business_name, input.address, input.postal_code, input.city,
    input.province, input.vat_number, input.fiscal_code, input.phone, input.email,
    input.logo_data_url, now]);
}

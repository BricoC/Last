import { getDatabase } from "@/shared/data-layer/database";
import { Client, CreateClientInput } from "../models/client";

export class ClientRepository {
  public async getClients(search = ""): Promise<Client[]> {
    const db = await getDatabase();
    let query = `
      SELECT * FROM clients 
      WHERE deleted_at IS NULL
    `;
    const params: string[] = [];

    if (search.trim()) {
      query += ` AND (
        business_name LIKE $1 
        OR vat_number LIKE $1 
        OR fiscal_code LIKE $1 
        OR city LIKE $1
      )`;
      params.push(`%${search.trim()}%`);
    }

    query += " ORDER BY business_name ASC LIMIT 200";

    const rows = await db.select<any[]>(query, params);
    return rows.map(this.mapRowToClient);
  }

  public async getClientById(id: string): Promise<Client | null> {
    const db = await getDatabase();
    const rows = await db.select<any[]>(
      "SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapRowToClient(rows[0]);
  }

  public async createOrUpdateClient(input: CreateClientInput & { id?: string }): Promise<Client> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const id = input.id || crypto.randomUUID();
    const phonesJson = JSON.stringify(input.phones || []);

    if (input.id) {
      await db.execute(
        `UPDATE clients SET
          code = $1,
          business_name = $2,
          address = $3,
          city = $4,
          postal_code = $5,
          province = $6,
          vat_number = $7,
          fiscal_code = $8,
          sdi_code = $9,
          pec = $10,
          payment_method = $11,
          destination_name = $12,
          destination_address = $13,
          destination_city = $14,
          phones_json = $15,
          notes = $16,
          updated_at = $17,
          updated_by = 'system',
          sync_status = 'pending'
        WHERE id = $18`,
        [
          input.code || null,
          input.business_name.trim(),
          input.address || null,
          input.city || null,
          input.postal_code || null,
          input.province || null,
          input.vat_number || null,
          input.fiscal_code || null,
          input.sdi_code || null,
          input.pec || null,
          input.payment_method || null,
          input.destination_name || null,
          input.destination_address || null,
          input.destination_city || null,
          phonesJson,
          input.notes || null,
          now,
          id,
        ]
      );
    } else {
      await db.execute(
        `INSERT INTO clients (
          id, code, business_name, address, city, postal_code, province,
          vat_number, fiscal_code, sdi_code, pec, payment_method,
          destination_name, destination_address, destination_city,
          phones_json, notes, is_active, created_at, updated_at, updated_by, sync_status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 1, $18, $18, 'system', 'pending'
        )`,
        [
          id,
          input.code || null,
          input.business_name.trim(),
          input.address || null,
          input.city || null,
          input.postal_code || null,
          input.province || null,
          input.vat_number || null,
          input.fiscal_code || null,
          input.sdi_code || null,
          input.pec || null,
          input.payment_method || null,
          input.destination_name || null,
          input.destination_address || null,
          input.destination_city || null,
          phonesJson,
          input.notes || null,
          now,
        ]
      );
    }

    const saved = await this.getClientById(id);
    if (!saved) throw new Error("Errore recupero cliente salvato");
    return saved;
  }

  private mapRowToClient(row: any): Client {
    let phones: any[] = [];
    try {
      if (row.phones_json) {
        phones = JSON.parse(row.phones_json);
      }
    } catch {
      phones = [];
    }

    return {
      id: row.id,
      code: row.code || undefined,
      business_name: row.business_name,
      address: row.address || undefined,
      city: row.city || undefined,
      postal_code: row.postal_code || undefined,
      province: row.province || undefined,
      vat_number: row.vat_number || undefined,
      fiscal_code: row.fiscal_code || undefined,
      sdi_code: row.sdi_code || undefined,
      pec: row.pec || undefined,
      payment_method: row.payment_method || undefined,
      destination_name: row.destination_name || undefined,
      destination_address: row.destination_address || undefined,
      destination_city: row.destination_city || undefined,
      phones,
      notes: row.notes || undefined,
      is_active: Boolean(row.is_active),
      created_at: row.created_at,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      deleted_at: row.deleted_at || undefined,
      sync_status: row.sync_status,
    };
  }
}

export const clientRepository = new ClientRepository();

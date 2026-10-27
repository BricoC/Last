import { getDatabase } from "@/shared/data-layer/database";
import { Client, ClientPhone, CreateClientInput } from "../models/client";
import { buildMultiTermSqlSearch } from "@/shared/utils/multiTermSqlSearch";
import { deduplicateDestinations } from "../utils/destinationUtils";

export class ClientRepository {
  public async getClients(search = ""): Promise<Client[]> {
    const db = await getDatabase();
    let query = `
      SELECT * FROM clients 
      WHERE deleted_at IS NULL
    `;
    const params: string[] = [];

    const searchSql = buildMultiTermSqlSearch(
      search,
      ["business_name", "vat_number", "fiscal_code", "city"],
      { stripPunctuation: true }
    );
    if (searchSql.sql) {
      query += ` AND (${searchSql.sql})`;
      params.push(...searchSql.params);
      
      const cleanTerm = search.trim().toLowerCase();
      const punctCleanTerm = cleanTerm.replace(/[.\-_'\s]/g, "");

      params.push(cleanTerm);
      const rawIdx = params.length;

      params.push(punctCleanTerm);
      const cleanIdx = params.length;
      
      query += ` ORDER BY 
        CASE 
          WHEN LOWER(business_name) LIKE $${rawIdx} || '%' THEN 1
          WHEN REPLACE(REPLACE(LOWER(business_name), '.', ''), ' ', '') LIKE $${cleanIdx} || '%' THEN 2
          WHEN LOWER(business_name) LIKE '%' || $${rawIdx} || '%' THEN 3
          WHEN REPLACE(REPLACE(LOWER(business_name), '.', ''), ' ', '') LIKE '%' || $${cleanIdx} || '%' THEN 4
          ELSE 5
        END ASC,
        business_name ASC LIMIT 200`;
    } else {
      query += " ORDER BY business_name ASC LIMIT 200";
    }

    const rows = await db.select<ClientRow[]>(query, params);
    return rows.map(this.mapRowToClient);
  }

  public async getClientById(id: string): Promise<Client | null> {
    const db = await getDatabase();
    const rows = await db.select<ClientRow[]>(
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
    const destinationsJson = JSON.stringify(input.destinations || []);
    const priceListsJson = JSON.stringify(input.price_lists || []);

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
          email = $11,
          payment_method = $12,
          destination_name = $13,
          destination_address = $14,
          destination_city = $15,
          destinations_json = $16,
          price_lists_json = $17,
          phones_json = $18,
          notes = $19,
          is_active = $20,
          updated_at = $21,
          updated_by = $22,
          sync_status = 'pending'
        WHERE id = $23 AND deleted_at IS NULL`,
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
          input.email || null,
          input.payment_method || null,
          input.destination_name || null,
          input.destination_address || null,
          input.destination_city || null,
          destinationsJson,
          priceListsJson,
          phonesJson,
          input.notes || null,
          input.is_active === false ? 0 : 1,
          now,
          "system",
          id,
        ]
      );
    } else {
      await db.execute(
        `INSERT INTO clients (
          id, code, business_name, address, city, postal_code, province,
          vat_number, fiscal_code, sdi_code, pec, email, payment_method,
          destination_name, destination_address, destination_city,
          destinations_json, price_lists_json, phones_json, notes, is_active,
          created_at, updated_at, updated_by, sync_status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $22, $23, 'pending'
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
          input.email || null,
          input.payment_method || null,
          input.destination_name || null,
          input.destination_address || null,
          input.destination_city || null,
          destinationsJson,
          priceListsJson,
          phonesJson,
          input.notes || null,
          input.is_active === false ? 0 : 1,
          now,
          "system",
        ]
      );
    }

    const saved = await this.getClientById(id);
    if (!saved) throw new Error("Errore recupero cliente salvato");
    return saved;
  }

  public async softDeleteClient(id: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE clients SET deleted_at = $1, updated_at = $1, updated_by = $2, sync_status = 'pending'
       WHERE id = $3 AND deleted_at IS NULL`,
      [now, "system", id]
    );
  }

  /**
   * Recupera tutti i nomi dei listini clienti disponibili nel database
   */
  public async getAllAvailablePriceLists(): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.select<{ cliente: string }[]>(
      `SELECT DISTINCT cliente FROM listini_clienti 
       WHERE cliente IS NOT NULL AND TRIM(cliente) <> '' 
       ORDER BY cliente ASC`
    );
    return rows.map((r) => r.cliente.trim()).filter(Boolean);
  }

  /**
   * Recupera gli articoli e prezzi contenuti nei listini specificati
   */
  public async getPriceListArticles(priceLists: string[]): Promise<{
    id: number;
    listino: string;
    codice_articolo: string;
    descrizione: string;
    prezzo_fattura: number;
    prezzo_acquisto: number;
    ricarico: number;
    note: string | null;
  }[]> {
    if (!priceLists || priceLists.length === 0) return [];
    const db = await getDatabase();
    const placeholders = priceLists.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await db.select<{
      id: number;
      cliente: string;
      codice_articolo: string | null;
      descrizione: string | null;
      prezzo_fattura: number | null;
      prezzo_acquisto: number | null;
      ricarico: number | null;
      note: string | null;
    }[]>(
      `SELECT id, cliente, codice_articolo, descrizione, prezzo_fattura, prezzo_acquisto, ricarico, note 
       FROM listini_clienti 
       WHERE cliente IN (${placeholders})
       ORDER BY codice_articolo ASC`,
      priceLists
    );

    return rows.map((r) => ({
      id: r.id,
      listino: r.cliente,
      codice_articolo: r.codice_articolo || "",
      descrizione: r.descrizione || "",
      prezzo_fattura: r.prezzo_fattura || 0,
      prezzo_acquisto: r.prezzo_acquisto || 0,
      ricarico: r.ricarico || 0,
      note: r.note || null,
    }));
  }

  /**
   * Recupera i DDT recenti per questo cliente
   */
  public async getClientDdts(clientName: string, limit = 50): Promise<{
    id: string;
    doc_number: number | null;
    year: number;
    series: string | null;
    doc_date: string;
    destination_name: string | null;
    destination_city: string | null;
    status: string;
  }[]> {
    if (!clientName.trim()) return [];
    const db = await getDatabase();
    return db.select(
      `SELECT id, doc_number, year, series, doc_date, destination_name, destination_city, status
       FROM ddt_documents
       WHERE LOWER(TRIM(client_name)) = LOWER(TRIM($1)) AND deleted_at IS NULL
       ORDER BY doc_date DESC, doc_number DESC LIMIT $2`,
      [clientName.trim(), limit]
    );
  }

  /**
   * Unisce uno o più clienti duplicati dentro un cliente canonico (principale):
   * - Fonda recapiti, destinazioni merci e telefoni
   * - Riassegna tutti i DDT storici al cliente principale
   * - Soft-delete dei record duplicati
   */
  public async mergeClients(canonicalId: string, duplicateIds: string[]): Promise<Client> {
    const db = await getDatabase();
    const target = await this.getClientById(canonicalId);
    if (!target) throw new Error("Cliente principale non trovato.");

    const now = new Date().toISOString();
    const destinations = [...target.destinations];
    const phones = [...target.phones];
    const priceLists = new Set(target.price_lists);

    let address = target.address;
    let city = target.city;
    let postalCode = target.postal_code;
    let province = target.province;
    let vatNumber = target.vat_number;
    let fiscalCode = target.fiscal_code;
    let sdiCode = target.sdi_code;
    let pec = target.pec;
    let email = target.email;
    let paymentMethod = target.payment_method;

    for (const dupId of duplicateIds) {
      if (dupId === canonicalId) continue;
      const dup = await this.getClientById(dupId);
      if (!dup) continue;

      // Completa i campi anagrafici se mancanti nel principale
      if (!address && dup.address) address = dup.address;
      if (!city && dup.city) city = dup.city;
      if (!postalCode && dup.postal_code) postalCode = dup.postal_code;
      if (!province && dup.province) province = dup.province;
      if (!vatNumber && dup.vat_number) vatNumber = dup.vat_number;
      if (!fiscalCode && dup.fiscal_code) fiscalCode = dup.fiscal_code;
      if (!sdiCode && dup.sdi_code) sdiCode = dup.sdi_code;
      if (!pec && dup.pec) pec = dup.pec;
      if (!email && dup.email) email = dup.email;
      if (!paymentMethod && dup.payment_method) paymentMethod = dup.payment_method;

      // Fonde le destinazioni uniche
      for (const d of dup.destinations) {
        const exists = destinations.some(
          (td) => td.citta.toUpperCase() === d.citta.toUpperCase() && td.luogo.toUpperCase() === d.luogo.toUpperCase()
        );
        if (!exists) {
          destinations.push(d);
        }
      }

      // Fonde i telefoni unici
      for (const p of dup.phones) {
        const exists = phones.some((tp) => tp.numero.trim() === p.numero.trim());
        if (!exists && p.numero.trim()) {
          phones.push(p);
        }
      }

      // Fonde i listini associati
      for (const pl of dup.price_lists) {
        priceLists.add(pl);
      }

      // Riassegna tutti i DDT del duplicato al cliente principale
      await db.execute(
        `UPDATE ddt_documents 
         SET client_name = $1, client_id = $2, sync_status = 'pending', updated_at = $3
         WHERE LOWER(TRIM(client_name)) = LOWER(TRIM($4)) OR client_id = $5`,
        [target.business_name, target.id, now, dup.business_name, dup.id]
      );

      // Soft delete del record duplicato
      await db.execute(
        `UPDATE clients 
         SET deleted_at = $1, updated_at = $1, notes = coalesce(notes, '') || ' [Unito a ' || $2 || ']', sync_status = 'pending'
         WHERE id = $3`,
        [now, target.business_name, dup.id]
      );
    }

    // Salva il target arricchito
    const updatedTarget = await this.createOrUpdateClient({
      id: target.id,
      code: target.code,
      business_name: target.business_name,
      address,
      city,
      postal_code: postalCode,
      province,
      vat_number: vatNumber,
      fiscal_code: fiscalCode,
      sdi_code: sdiCode,
      pec,
      email,
      payment_method: paymentMethod,
      destinations: deduplicateDestinations(destinations),
      price_lists: Array.from(priceLists),
      phones,
      notes: target.notes,
      is_active: target.is_active,
    });

    return updatedTarget;
  }

  /**
   * Rileva gruppi di clienti con nomi quasi identici o varianti
   */
  public async detectDuplicateGroups(): Promise<{ canonical: Client; duplicates: Client[] }[]> {
    const all = await this.getClients("");
    if (all.length < 2) return [];

    const normalize = (s: string) => {
      // Regole speciali per casi noti
      let clean = s.toUpperCase().trim();
      if (clean === "CAMM" || clean === "C.A.M.M.") return "CAMM";
      if (clean.includes("LAVORO AMICO")) return "COOP LAVORO AMICO";
      if (clean.includes("FRUGOLI")) return "FAL TRIVELLAZIONI FRUGOLI";
      if (clean.startsWith("FRANZINI ANNIBALE")) return "FRANZINI ANNIBALE";
      if (clean.startsWith("DEVERIO")) return "DEVERIO";
      if (clean.startsWith("SPARES SERVICE")) return "SPARES SERVICE MACHINERY";
      if (clean === "ELETIEMME" || clean === "ELLETIEMME") return "ELLETIEMME";
      if (clean.startsWith("GIGA PIU") || clean.startsWith("GIGA PIÙ")) return "GIGA PIU";

      return clean
        .replace(/[.\-_,;:\/\\()]/g, " ")
        .replace(/\b(S\.?R\.?L\.?S?|S\.?P\.?A\.?|S\.?N\.?C\.?|S\.?A\.?S\.?|DI)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    };

    const groups = new Map<string, Client[]>();
    for (const client of all) {
      const key = normalize(client.business_name);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(client);
    }

    const results: { canonical: Client; duplicates: Client[] }[] = [];
    for (const [, list] of groups.entries()) {
      if (list.length > 1) {
        // Sceglie come canonico quello con il nome più formale o con più dati
        const sorted = [...list].sort((a, b) => {
          const scoreA = (a.vat_number ? 2 : 0) + (a.address ? 2 : 0) + a.destinations.length + a.phones.length;
          const scoreB = (b.vat_number ? 2 : 0) + (b.address ? 2 : 0) + b.destinations.length + b.phones.length;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return b.business_name.length - a.business_name.length;
        });

        const canonical = sorted[0];
        const duplicates = sorted.slice(1);
        results.push({ canonical, duplicates });
      }
    }

    return results;
  }

  private mapRowToClient(row: ClientRow): Client {
    let phones: ClientPhone[] = [];
    try {
      if (row.phones_json) {
        const parsed: unknown = JSON.parse(row.phones_json);
        if (Array.isArray(parsed)) {
          phones = parsed.filter(isClientPhone);
        }
      }
    } catch {
      phones = [];
    }

    let destinations: import("../models/client").ClientDestination[] = [];
    try {
      if (row.destinations_json) {
        const parsed: unknown = JSON.parse(row.destinations_json);
        if (Array.isArray(parsed)) {
          destinations = parsed;
        }
      }
    } catch {
      destinations = [];
    }

    let price_lists: string[] = [];
    try {
      if (row.price_lists_json) {
        const parsed: unknown = JSON.parse(row.price_lists_json);
        if (Array.isArray(parsed)) {
          price_lists = parsed.filter((p): p is string => typeof p === "string");
        }
      }
    } catch {
      price_lists = [];
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
      email: row.email || undefined,
      payment_method: row.payment_method || undefined,
      destination_name: row.destination_name || undefined,
      destination_address: row.destination_address || undefined,
      destination_city: row.destination_city || undefined,
      destinations,
      price_lists,
      phones,
      notes: row.notes || undefined,
      is_active: Boolean(row.is_active),
      created_at: row.created_at,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      deleted_at: row.deleted_at,
      sync_status: row.sync_status,
    };
  }
}

interface ClientRow {
  id: string;
  code: string | null;
  business_name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  province: string | null;
  vat_number: string | null;
  fiscal_code: string | null;
  sdi_code: string | null;
  pec: string | null;
  email: string | null;
  payment_method: string | null;
  destination_name: string | null;
  destination_address: string | null;
  destination_city: string | null;
  destinations_json: string | null;
  price_lists_json: string | null;
  phones_json: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  sync_status: "synced" | "pending";
}

function isClientPhone(value: unknown): value is ClientPhone {
  if (typeof value !== "object" || value === null) return false;
  const phone = value as Record<string, unknown>;
  return (typeof phone.id === "string" || typeof phone.id === "number")
    && typeof phone.nome === "string"
    && typeof phone.numero === "string";
}

export const clientRepository = new ClientRepository();


import { applyLocalDatabaseBatch, type SqliteWrite } from "@/shared/data-layer/localDatabaseBatch";
import { getDatabase } from "@/shared/data-layer/database";
import { resolveActiveSupabaseProjectUrl } from "@/shared/services/supabaseConfigCache";
import { Client, ClientPhone, CreateClientInput } from "../models/client";
import { rankClientsBySearch, normalizeClientCanonicalKey } from "../utils/clientSearchUtils";
import { deduplicateDestinations } from "../utils/destinationUtils";

export class ClientRepository {
  public async getClients(search = ""): Promise<Client[]> {
    const db = await getDatabase();
    const rows = await db.select<ClientRow[]>(
      "SELECT * FROM clients WHERE deleted_at IS NULL ORDER BY business_name ASC"
    );
    const clients = rows.map((r) => this.mapRowToClient(r));
    return rankClientsBySearch(clients, search);
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

    const projectUrl =
      input.project_url !== undefined ? input.project_url : await resolveActiveSupabaseProjectUrl();
    if (input.id) {
      const { sql, params } = this.clientUpdate(input, id, now);
      await db.execute(sql, params);
    } else {
      await db.execute(
        `INSERT INTO clients (
          id, code, business_name, address, city, postal_code, province,
          vat_number, fiscal_code, sdi_code, pec, email, payment_method,
          destination_name, destination_address, destination_city,
          destinations_json, price_lists_json, phones_json, notes, is_active,
          created_at, updated_at, updated_by, sync_status, project_url
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $22, $23, 'pending', $24
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
          projectUrl,
        ]
      );
    }

    const saved = await this.getClientById(id);
    if (!saved) throw new Error("Errore recupero cliente salvato");
    return saved;
  }

  private clientUpdate(input: CreateClientInput, id: string, now: string): SqliteWrite {
    const phonesJson = JSON.stringify(input.phones || []);
    const destinationsJson = JSON.stringify(input.destinations || []);
    const priceListsJson = JSON.stringify(input.price_lists || []);
    return {
      sql: `UPDATE clients SET
          code = $1,
          pending_previous_name = CASE
            WHEN LOWER(TRIM(business_name)) <> LOWER(TRIM($2))
            THEN COALESCE(pending_previous_name, business_name)
            ELSE pending_previous_name END,
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
      params: [
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
        ],
    };
  }

  /**
   * Aggiorna o crea un cliente a partire da un documento (DDT/Preventivo) senza duplicare
   * record esistenti e senza sovrascrivere listini, destinazioni, codice, PEC, email o note.
   */
  public async upsertClientFromDocument(input: CreateClientInput & { id?: string }): Promise<Client> {
    const db = await getDatabase();
    const trimmedName = input.business_name.trim();
    const hasExplicitProjectScope = input.project_url !== undefined;
    const targetProjectUrl = input.project_url ?? null;
    const matchesProjectScope = (rowProjectUrl: string | null | undefined): boolean => {
      if (!hasExplicitProjectScope) return true;
      const normalized = rowProjectUrl ?? null;
      if (targetProjectUrl === null) return normalized === null;
      return normalized === targetProjectUrl || normalized === null;
    };
    let existing: Client | null = null;

    if (input.id) {
      const candidate = await this.getClientById(input.id);
      if (candidate && matchesProjectScope(candidate.project_url)) {
        existing = candidate;
      }
    }
    if (!existing && trimmedName) {
      const rows = hasExplicitProjectScope
        ? targetProjectUrl
          ? await db.select<ClientRow[]>(
              `SELECT * FROM clients
               WHERE LOWER(TRIM(business_name)) = LOWER(TRIM($1))
                 AND deleted_at IS NULL
                 AND (project_url = $2 OR project_url IS NULL)
               ORDER BY CASE WHEN project_url = $2 THEN 0 ELSE 1 END
               LIMIT 1`,
              [trimmedName, targetProjectUrl]
            )
          : await db.select<ClientRow[]>(
              "SELECT * FROM clients WHERE LOWER(TRIM(business_name)) = LOWER(TRIM($1)) AND deleted_at IS NULL AND project_url IS NULL LIMIT 1",
              [trimmedName]
            )
        : await db.select<ClientRow[]>(
            "SELECT * FROM clients WHERE LOWER(TRIM(business_name)) = LOWER(TRIM($1)) AND deleted_at IS NULL LIMIT 1",
            [trimmedName]
          );
      if (rows.length > 0) {
        existing = this.mapRowToClient(rows[0]);
      }
    }

    if (!existing) {
      return this.createOrUpdateClient({ ...input, id: undefined });
    }

    const resolveCity = (): string | undefined => {
      const trimmedInputCity = input.city?.trim();
      if (!trimmedInputCity) return existing.city;
      const existingCity = existing.city?.trim();
      const existingProvince = existing.province?.trim();
      if (
        existingCity &&
        existingProvince &&
        trimmedInputCity.toLowerCase() === `${existingCity} (${existingProvince})`.toLowerCase()
      ) {
        return existing.city;
      }
      return trimmedInputCity;
    };

    const mergedPhones = input.phones && input.phones.length > 0 ? input.phones : existing.phones;
    const merged: CreateClientInput & { id: string } = {
      id: existing.id,
      code: existing.code,
      business_name: existing.business_name || trimmedName,
      address: input.address?.trim() || existing.address,
      city: resolveCity(),
      postal_code: existing.postal_code,
      province: existing.province,
      vat_number: input.vat_number?.trim() || existing.vat_number,
      fiscal_code: input.fiscal_code?.trim() || existing.fiscal_code,
      sdi_code: input.sdi_code?.trim() || existing.sdi_code,
      pec: existing.pec,
      email: existing.email,
      payment_method: input.payment_method?.trim() || existing.payment_method,
      destination_name: input.destination_name?.trim() || existing.destination_name,
      destination_address: input.destination_address?.trim() || existing.destination_address,
      destination_city: input.destination_city?.trim() || existing.destination_city,
      destinations: existing.destinations,
      price_lists: existing.price_lists,
      phones: mergedPhones,
      notes: existing.notes,
      is_active: existing.is_active,
    };

    const changed =
      merged.address !== existing.address ||
      merged.city !== existing.city ||
      merged.vat_number !== existing.vat_number ||
      merged.fiscal_code !== existing.fiscal_code ||
      merged.sdi_code !== existing.sdi_code ||
      merged.payment_method !== existing.payment_method ||
      merged.destination_name !== existing.destination_name ||
      merged.destination_address !== existing.destination_address ||
      merged.destination_city !== existing.destination_city ||
      JSON.stringify(merged.phones) !== JSON.stringify(existing.phones);

    if (!changed) {
      return existing;
    }

    return this.createOrUpdateClient(merged);
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
      `SELECT id, cliente, codice_articolo, descrizione, prezzo_fattura,
              COALESCE(acquisto_eur, prezzo_acquisto, 0) AS prezzo_acquisto,
              COALESCE(perc_acquisto, ricarico, 0) AS ricarico,
              note 
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
    const target = await this.getClientById(canonicalId);
    if (!target) throw new Error("Cliente principale non trovato.");

    const now = new Date().toISOString();
    const writes: SqliteWrite[] = [];
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
    let destinationName = target.destination_name;
    let destinationAddress = target.destination_address;
    let destinationCity = target.destination_city;
    const noteParts: string[] = [];
    if (target.notes?.trim()) noteParts.push(target.notes.trim());
    let mergedCount = 0;
    let skippedCrossProject = 0;

    for (const dupId of new Set(duplicateIds)) {
      if (dupId === canonicalId) continue;
      const dup = await this.getClientById(dupId);
      if (!dup) continue;
      if ((target.project_url ?? null) !== (dup.project_url ?? null)) {
        skippedCrossProject++;
        continue;
      }
      mergedCount++;

      // Completa i campi anagrafici e destinazione principale se mancanti nel principale
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
      if (!destinationName && dup.destination_name) destinationName = dup.destination_name;
      if (!destinationAddress && dup.destination_address) destinationAddress = dup.destination_address;
      if (!destinationCity && dup.destination_city) destinationCity = dup.destination_city;
      if (dup.notes?.trim() && !noteParts.includes(dup.notes.trim())) {
        noteParts.push(dup.notes.trim());
      }

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

      const mergeProjectUrl = target.project_url ?? dup.project_url ?? null;

      // Riassegna tutti i DDT del duplicato al cliente principale (inclusi quelli nel cestino per evitare client_id orfani al ripristino)
      writes.push({
        sql: `UPDATE ddt_documents
         SET client_name = $1, client_id = $2, sync_status = CASE WHEN deleted_at IS NULL THEN 'pending' ELSE sync_status END, updated_at = $3
         WHERE (client_id = $5 OR (client_id IS NULL AND LOWER(TRIM(client_name)) = LOWER(TRIM($4))))
           AND (($6 IS NULL AND project_url IS NULL) OR project_url = $6)`,
        params: [target.business_name, target.id, now, dup.business_name, dup.id, mergeProjectUrl],
      });

      // Riassegna eventuali preventivi del duplicato al cliente principale (inclusi quelli archiviati)
      writes.push({
        sql: `UPDATE quotes
         SET client_name = $1, client_id = $2, sync_status = CASE WHEN deleted_at IS NULL THEN 'pending' ELSE sync_status END, updated_at = $3
         WHERE (client_id = $5 OR (client_id IS NULL AND LOWER(TRIM(client_name)) = LOWER(TRIM($4))))
           AND (($6 IS NULL AND project_url IS NULL) OR project_url = $6)`,
        params: [target.business_name, target.id, now, dup.business_name, dup.id, mergeProjectUrl],
      });

      // Riassegna eventuali preventivi nel cestino, listini clienti e offerte referenziati per nome
      writes.push({
        sql: `UPDATE quotes_trash SET client_name = $1
         WHERE LOWER(TRIM(client_name)) = LOWER(TRIM($2))
           AND (($3 IS NULL AND project_url IS NULL) OR project_url = $3)`,
        params: [target.business_name, dup.business_name, mergeProjectUrl],
      });
      writes.push({
        sql: `UPDATE listini_clienti SET cliente = $1, updated_at = $2, sync_revision = COALESCE(sync_revision, 0) + 1
         WHERE LOWER(TRIM(cliente)) = LOWER(TRIM($3))`,
        params: [target.business_name, now, dup.business_name],
      });
      writes.push({
        sql: `UPDATE listini_clienti_cestino SET cliente = $1
         WHERE LOWER(TRIM(cliente)) = LOWER(TRIM($2))`,
        params: [target.business_name, dup.business_name],
      });
      writes.push({
        sql: `UPDATE offers SET requester = $1, updated_at = $2, sync_status = 'pending'
         WHERE LOWER(TRIM(requester)) = LOWER(TRIM($3))
           AND (($4 IS NULL AND project_url IS NULL) OR project_url = $4)`,
        params: [target.business_name, now, dup.business_name, mergeProjectUrl],
      });
      writes.push({
        sql: `UPDATE offers_trash SET requester = $1
         WHERE LOWER(TRIM(requester)) = LOWER(TRIM($2))
           AND (($3 IS NULL AND project_url IS NULL) OR project_url = $3)`,
        params: [target.business_name, dup.business_name, mergeProjectUrl],
      });

      // Soft delete del record duplicato
      writes.push({
        sql: `UPDATE clients
         SET deleted_at = $1, updated_at = $1, notes = coalesce(notes, '') || ' [Unito a ' || $2 || ']', sync_status = 'pending'
         WHERE id = $3 AND deleted_at IS NULL AND updated_at IS $4 AND project_url IS $5`,
        params: [now, target.business_name, dup.id, dup.updated_at, mergeProjectUrl],
        expectedRows: 1,
      });
    }

    if (mergedCount === 0 && skippedCrossProject > 0) {
      throw new Error("Impossibile unire clienti appartenenti a progetti Supabase diversi o legacy.");
    }

    // Salva il target arricchito
    const targetUpdate = this.clientUpdate({
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
      destination_name: destinationName,
      destination_address: destinationAddress,
      destination_city: destinationCity,
      destinations: deduplicateDestinations(destinations),
      price_lists: Array.from(priceLists),
      phones,
      notes: noteParts.length ? noteParts.join("\n") : undefined,
      is_active: target.is_active,
    }, target.id, now);
    writes.push({
      sql: targetUpdate.sql + ' AND updated_at IS $24 AND project_url IS $25',
      params: [...targetUpdate.params, target.updated_at, target.project_url ?? null],
      expectedRows: 1,
    });
    await applyLocalDatabaseBatch(writes);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ddt-data-updated"));
    }
    const updatedTarget = await this.getClientById(target.id);
    if (!updatedTarget) throw new Error("Cliente principale non trovato dopo l'unione.");
    return updatedTarget;
  }

  /**
   * Rileva gruppi di clienti con nomi quasi identici o varianti
   */
  public async detectDuplicateGroups(): Promise<{ canonical: Client; duplicates: Client[] }[]> {
    const all = await this.getClients("");
    if (all.length < 2) return [];

    const groups = new Map<string, Client[]>();
    for (const client of all) {
      const key = normalizeClientCanonicalKey(client.business_name);
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
      project_url: row.project_url ?? null,
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
  project_url?: string | null;
}

function isClientPhone(value: unknown): value is ClientPhone {
  if (typeof value !== "object" || value === null) return false;
  const phone = value as Record<string, unknown>;
  return (typeof phone.id === "string" || typeof phone.id === "number")
    && typeof phone.nome === "string"
    && typeof phone.numero === "string";
}

export const clientRepository = new ClientRepository();


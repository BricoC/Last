import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { Client, ClientDestination, ClientPhone } from "../models/client";
import { clientRepository } from "./clientRepository";
import { normalizeDestinationKey, deduplicateDestinations } from "../utils/destinationUtils";
import { normalizeClientCanonicalKey } from "../utils/clientSearchUtils";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
  configPath: string;
}

interface SupabaseClientRow {
  id: number;
  cliente: string;
  indirizzo: string | null;
  localita: string | null;
  pagamento: string | null;
  piva: string | null;
  cod_fiscale: string | null;
  sdi: string | null;
  telefono: string | null;
  telefoni: unknown;
  destinazioni: unknown;
  created_at?: string;
}

export interface SyncClientsResult {
  totalFetched: number;
  imported: number;
  matchedPriceLists: number;
}

/**
 * Dizionario di corrispondenze note storiche tra nome cliente e codice listino
 */
const KNOWN_PRICE_LIST_ALIASES: Record<string, string[]> = {
  "CARTIERE CARRARA": ["LIST_CARMA"],
  "TREVITECH": ["LIST_TREVI"],
  "WEPA ITALIA": ["LIST_WEPA LISTINO"],
  "FALEGNAMERIA BARSELLA": ["LIST_BARSELLA"],
  "ASB SERVICE": ["LIST_ASB SERVICE SRL"],
  "RENAT": ["LIST_RENAT"],
  "FIBRACEL S.R.L.": ["LIST_FIBRACEL"],
  "FIBRACEL": ["LIST_FIBRACEL"],
  "ARTE DEL SERRAMENTO": ["LIST_ARTE DEL SERRAMENTO"],
  "ASSEM": ["LIST_ASSEM"],
  "KARTOGROUP": ["LIST_KARTOGROUP"],
  "CAMM": ["LIST_C.A.M.M."],
  "C.A.M.M.": ["LIST_C.A.M.M."],
};

export class ClientSyncService {
  private async getCredentials(): Promise<SupabaseConfig> {
    const status = await invoke<ConfigStatus>("load_supabase_config");
    if (!status.config || !status.config.projectUrl || !status.config.anonKey) {
      throw new Error("Configurazione Supabase mancante o non valida.");
    }
    return status.config;
  }

  /**
   * Sincronizza e scarica tutti i clienti da Supabase nel database locale
   */
  public async syncAllFromSupabase(): Promise<SyncClientsResult> {
    const creds = await this.getCredentials();
    const availablePriceLists = await clientRepository.getAllAvailablePriceLists();

    const url = new URL("/rest/v1/clienti", creds.projectUrl);
    url.searchParams.set("select", "*");
    url.searchParams.set("order", "cliente.asc");
    url.searchParams.set("limit", "1000");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        apikey: creds.anonKey,
        Authorization: `Bearer ${creds.anonKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Errore connessione Supabase clienti: HTTP ${response.status}`);
    }

    const rows: SupabaseClientRow[] = await response.json();
    let imported = 0;
    let matchedPriceLists = 0;

    const db = await getDatabase();

    // Ottimizzazione P1: Pre-caricamento in memoria di tutti i clienti locali in una Map per eliminare query N+1
    const existingRows = await db.select<{ id: string; business_name: string; price_lists_json: string | null }[]>(
      "SELECT id, business_name, price_lists_json FROM clients WHERE deleted_at IS NULL"
    );
    const existingMap = new Map<string, { id: string; price_lists_json: string | null }>();
    for (const r of existingRows) {
      existingMap.set(r.business_name.trim().toLowerCase(), r);
    }

    interface PreparedClientWrite {
      id: string;
      businessName: string;
      address: string | null;
      city: string | null;
      province: string | null;
      vatNumber: string | null;
      fiscalCode: string | null;
      sdiCode: string | null;
      paymentMethod: string | null;
      destinationsJson: string;
      phonesJson: string;
      priceListsJson: string;
      isUpdate: boolean;
    }

    const writes: PreparedClientWrite[] = [];

    for (const row of rows) {
      const businessName = (row.cliente || "").trim();
      if (!businessName) continue;

      // Parsing localita ("TASSIGNANO - LU") -> citta e provincia
      let city = "";
      let province = "";
      if (row.localita) {
        const parts = row.localita.split(" - ");
        if (parts.length >= 2) {
          city = parts[0].trim();
          province = parts[parts.length - 1].trim();
        } else {
          city = row.localita.trim();
        }
      }

      // Parsing destinazioni
      const destinations: ClientDestination[] = [];
      if (Array.isArray(row.destinazioni)) {
        for (const d of row.destinazioni) {
          if (typeof d === "object" && d !== null) {
            const destObj = d as Record<string, unknown>;
            destinations.push({
              id: String(destObj.id || crypto.randomUUID()),
              citta: String(destObj.citta || ""),
              luogo: String(destObj.luogo || ""),
              note: typeof destObj.note === "string" ? destObj.note : undefined,
            });
          }
        }
      }

      // Parsing telefoni
      const phones: ClientPhone[] = [];
      if (Array.isArray(row.telefoni)) {
        for (const p of row.telefoni) {
          if (typeof p === "object" && p !== null) {
            const phoneObj = p as Record<string, unknown>;
            if (phoneObj.numero) {
              phones.push({
                id: String(phoneObj.id || crypto.randomUUID()),
                nome: String(phoneObj.nome || "Telefono"),
                numero: String(phoneObj.numero || ""),
              });
            }
          }
        }
      } else if (row.telefono && row.telefono.trim()) {
        phones.push({
          id: crypto.randomUUID(),
          nome: "Principale",
          numero: row.telefono.trim(),
        });
      }

      // Ricerca rapida in memoria O(1)
      const existing = existingMap.get(businessName.toLowerCase());

      let priceLists: string[] = [];
      if (existing && existing.price_lists_json) {
        try {
          const parsed = JSON.parse(existing.price_lists_json);
          if (Array.isArray(parsed) && parsed.length > 0) {
            priceLists = parsed;
          }
        } catch {
          priceLists = [];
        }
      }

      // Se non ha ancora listini associati, effettua l'auto-matching intelligente
      if (priceLists.length === 0) {
        priceLists = this.autoMatchPriceLists(businessName, availablePriceLists);
        if (priceLists.length > 0) matchedPriceLists++;
      }

      const clientId = existing ? existing.id : crypto.randomUUID();

      writes.push({
        id: clientId,
        businessName,
        address: row.indirizzo || null,
        city: city || null,
        province: province || null,
        vatNumber: row.piva || null,
        fiscalCode: row.cod_fiscale || null,
        sdiCode: row.sdi || null,
        paymentMethod: row.pagamento || null,
        destinationsJson: JSON.stringify(destinations),
        phonesJson: JSON.stringify(phones),
        priceListsJson: JSON.stringify(priceLists),
        isUpdate: !!existing,
      });

      if (!existing) {
        existingMap.set(businessName.toLowerCase(), {
          id: clientId,
          price_lists_json: JSON.stringify(priceLists),
        });
      }
    }

    // Esecuzione batch in una singola transazione atomica SQLite
    const now = new Date().toISOString();
    await db.execute("BEGIN IMMEDIATE");
    try {
      for (const w of writes) {
        if (w.isUpdate) {
          await db.execute(
            `UPDATE clients SET
              business_name = $1, address = $2, city = $3, province = $4,
              vat_number = $5, fiscal_code = $6, sdi_code = $7, payment_method = $8,
              destinations_json = $9, phones_json = $10, price_lists_json = $11,
              is_active = 1, updated_at = $12, updated_by = 'supabase_sync',
              sync_status = 'synced'
            WHERE id = $13 AND deleted_at IS NULL`,
            [
              w.businessName,
              w.address,
              w.city,
              w.province,
              w.vatNumber,
              w.fiscalCode,
              w.sdiCode,
              w.paymentMethod,
              w.destinationsJson,
              w.phonesJson,
              w.priceListsJson,
              now,
              w.id,
            ]
          );
        } else {
          await db.execute(
            `INSERT INTO clients (
              id, business_name, address, city, province, vat_number,
              fiscal_code, sdi_code, payment_method, destinations_json,
              phones_json, price_lists_json, is_active, created_at,
              updated_at, updated_by, sync_status
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1, $13, $13, 'supabase_sync', 'synced'
            )`,
            [
              w.id,
              w.businessName,
              w.address,
              w.city,
              w.province,
              w.vatNumber,
              w.fiscalCode,
              w.sdiCode,
              w.paymentMethod,
              w.destinationsJson,
              w.phonesJson,
              w.priceListsJson,
              now,
            ]
          );
        }
        imported++;
      }
      await db.execute("COMMIT");
    } catch (err) {
      await db.execute("ROLLBACK");
      throw err;
    }

    return {
      totalFetched: rows.length,
      imported,
      matchedPriceLists,
    };
  }

  /**
   * Salva o sincronizza un singolo cliente su Supabase Cloud.
   * Se il cliente è stato rinominato, ricerca per vecchio nome su Supabase per aggiornare il record esistente anziché duplicarlo.
   * Al successo dell'operazione, aggiorna lo stato locale SQLite a 'synced'.
   */
  public async pushClientToSupabase(client: Client, oldBusinessName?: string): Promise<boolean> {
    try {
      const creds = await this.getCredentials();
      const localita = [client.city, client.province].filter(Boolean).join(" - ");

      const payload = {
        cliente: client.business_name.toUpperCase(),
        indirizzo: client.address || "",
        localita: localita || "",
        pagamento: client.payment_method || "",
        piva: client.vat_number || "",
        cod_fiscale: client.fiscal_code || "",
        sdi: client.sdi_code || "",
        telefoni: client.phones || [],
        destinazioni: client.destinations || [],
      };

      let supId: number | null = null;
      const searchNames: string[] = [];
      if (oldBusinessName && oldBusinessName.trim().toUpperCase() !== client.business_name.trim().toUpperCase()) {
        searchNames.push(oldBusinessName.trim().toUpperCase());
      }
      searchNames.push(client.business_name.trim().toUpperCase());

      for (const nameToSearch of searchNames) {
        const checkUrl = new URL("/rest/v1/clienti", creds.projectUrl);
        checkUrl.searchParams.set("cliente", `eq.${nameToSearch}`);
        const checkRes = await fetch(checkUrl.toString(), {
          headers: {
            apikey: creds.anonKey,
            Authorization: `Bearer ${creds.anonKey}`,
          },
        });
        if (checkRes.ok) {
          const found = await checkRes.json();
          if (Array.isArray(found) && found.length > 0 && typeof found[0]?.id === "number") {
            supId = found[0].id;
            break;
          }
        }
      }

      // Fallback: se non trovato per nome ma presente P.IVA, cerca per P.IVA
      if (supId === null && client.vat_number && client.vat_number.trim().length >= 8) {
        const vatUrl = new URL("/rest/v1/clienti", creds.projectUrl);
        vatUrl.searchParams.set("piva", `eq.${client.vat_number.trim()}`);
        const vatRes = await fetch(vatUrl.toString(), {
          headers: {
            apikey: creds.anonKey,
            Authorization: `Bearer ${creds.anonKey}`,
          },
        });
        if (vatRes.ok) {
          const foundVat = await vatRes.json();
          if (Array.isArray(foundVat) && foundVat.length > 0 && typeof foundVat[0]?.id === "number") {
            supId = foundVat[0].id;
          }
        }
      }

      let res: Response;
      if (supId !== null) {
        const patchUrl = new URL(`/rest/v1/clienti?id=eq.${supId}`, creds.projectUrl);
        res = await fetch(patchUrl.toString(), {
          method: "PATCH",
          headers: {
            apikey: creds.anonKey,
            Authorization: `Bearer ${creds.anonKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } else {
        const insertUrl = new URL("/rest/v1/clienti", creds.projectUrl);
        res = await fetch(insertUrl.toString(), {
          method: "POST",
          headers: {
            apikey: creds.anonKey,
            Authorization: `Bearer ${creds.anonKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        const db = await getDatabase();
        await db.execute(
          "UPDATE clients SET sync_status = 'synced' WHERE id = $1",
          [client.id]
        );
        return true;
      }
      return false;
    } catch (err) {
      console.warn("[ClientSyncService] Salvataggio Supabase non riuscito (proseguito in locale):", err);
      return false;
    }
  }

  /**
   * Rileva e importa clienti presenti nei DDT locali ma non ancora in anagrafica,
   * estraendo tutti i valori disponibili (indirizzo, città, pagamenti, destinazioni multiple, p.iva).
   */
  public async importMissingClientsFromDdts(): Promise<{ added: number }> {
    const db = await getDatabase();
    const availablePriceLists = await clientRepository.getAllAvailablePriceLists();

    // Recupera tutti i DDT ordinati per data decrescente (i più recenti hanno priorità)
    const ddtRows = await db.select<{
      client_name: string;
      client_address: string | null;
      client_city: string | null;
      client_vat: string | null;
      client_fiscal_code: string | null;
      client_sdi: string | null;
      payment_method: string | null;
      destination_name: string | null;
      destination_address: string | null;
      destination_city: string | null;
    }[]>(
      `SELECT 
        client_name, client_address, client_city, client_vat, client_fiscal_code,
        client_sdi, payment_method, destination_name, destination_address, destination_city
       FROM ddt_documents 
       WHERE client_name IS NOT NULL 
         AND TRIM(client_name) <> '' 
         AND TRIM(client_name) <> 'Cliente'
         AND deleted_at IS NULL
       ORDER BY doc_date DESC`
    );

    // Recupera l'elenco dei clienti già salvati (esatti e canonici) per evitare ricreazione di duplicati (es. CAMM vs C.A.M.M.)
    const existingRows = await db.select<{ id: string; business_name: string; address: string | null }[]>(
      "SELECT id, business_name, address FROM clients WHERE deleted_at IS NULL ORDER BY CASE WHEN address IS NOT NULL AND TRIM(address) <> '' THEN 0 ELSE 1 END, LENGTH(business_name) DESC"
    );
    const existingSet = new Set<string>();
    const existingCanonicalMap = new Map<string, { id: string; business_name: string }>();
    for (const r of existingRows) {
      const exactKey = r.business_name.toUpperCase().trim();
      if (exactKey) existingSet.add(exactKey);
      const canonicalKey = normalizeClientCanonicalKey(r.business_name);
      if (canonicalKey && !existingCanonicalMap.has(canonicalKey)) {
        existingCanonicalMap.set(canonicalKey, { id: r.id, business_name: r.business_name });
      }
    }

    // Mappa per aggregare i dati dei clienti mancanti
    interface ExtractedClientData {
      business_name: string;
      address: string;
      city: string;
      province: string;
      vat_number: string;
      fiscal_code: string;
      sdi_code: string;
      payment_method: string;
      destinationsMap: Map<string, ClientDestination>;
    }

    const missingClients = new Map<string, ExtractedClientData>();
    const canonicalReassignments = new Map<string, { id: string; business_name: string }>();

    for (const row of ddtRows) {
      const rawName = row.client_name.trim();
      const normName = rawName.toUpperCase();
      if (!normName || existingSet.has(normName)) continue;

      const canonicalMatch = existingCanonicalMap.get(normalizeClientCanonicalKey(normName));
      if (canonicalMatch) {
        if (canonicalMatch.business_name.trim().toUpperCase() !== normName) {
          canonicalReassignments.set(rawName, canonicalMatch);
        }
        continue;
      }

      if (!missingClients.has(normName)) {
        // Parsing citta e provincia se presente " - "
        let city = "";
        let province = "";
        if (row.client_city) {
          const parts = row.client_city.split(" - ");
          if (parts.length >= 2) {
            city = parts[0].trim();
            province = parts[parts.length - 1].trim();
          } else {
            city = row.client_city.trim();
          }
        }

        missingClients.set(normName, {
          business_name: normName,
          address: (row.client_address || "").trim(),
          city,
          province,
          vat_number: (row.client_vat || "").trim(),
          fiscal_code: (row.client_fiscal_code || "").trim(),
          sdi_code: (row.client_sdi || "").trim(),
          payment_method: (row.payment_method || "").trim(),
          destinationsMap: new Map(),
        });
      }

      const clientData = missingClients.get(normName)!;

      // Aggiorna campi se non ancora trovati
      if (!clientData.address && row.client_address) clientData.address = row.client_address.trim();
      if (!clientData.city && row.client_city) {
        const parts = row.client_city.split(" - ");
        if (parts.length >= 2) {
          clientData.city = parts[0].trim();
          clientData.province = parts[parts.length - 1].trim();
        } else {
          clientData.city = row.client_city.trim();
        }
      }
      if (!clientData.vat_number && row.client_vat) clientData.vat_number = row.client_vat.trim();
      if (!clientData.fiscal_code && row.client_fiscal_code) clientData.fiscal_code = row.client_fiscal_code.trim();
      if (!clientData.sdi_code && row.client_sdi) clientData.sdi_code = row.client_sdi.trim();
      if (!clientData.payment_method && row.payment_method) clientData.payment_method = row.payment_method.trim();

      // Raccoglie destinazioni uniche usate nei DDT
      const destCity = (row.destination_city || "").trim().toUpperCase();
      const destLuogo = (row.destination_name || "").trim().toUpperCase();
      const destAddr = (row.destination_address || "").trim();

      if (destCity || destLuogo || destAddr) {
        const destKey = normalizeDestinationKey(destCity, destLuogo, destAddr);
        if (!clientData.destinationsMap.has(destKey)) {
          clientData.destinationsMap.set(destKey, {
            id: crypto.randomUUID(),
            citta: destCity,
            luogo: destLuogo || destAddr,
            note: destAddr && destAddr !== destLuogo ? destAddr : undefined,
          });
        }
      }
    }

    let added = 0;
    const now = new Date().toISOString();
    const savedClients: Client[] = [];

    // Ottimizzazione P1: Esecuzione in una singola transazione atomica SQLite
    await db.execute("BEGIN IMMEDIATE");
    try {
      for (const [aliasName, canonicalTarget] of canonicalReassignments.entries()) {
        await db.execute(
          `UPDATE ddt_documents
           SET client_name = $1, client_id = $2, updated_at = $3
           WHERE LOWER(TRIM(client_name)) = LOWER(TRIM($4)) AND deleted_at IS NULL`,
          [canonicalTarget.business_name, canonicalTarget.id, now, aliasName]
        );
      }

      for (const [name, data] of missingClients.entries()) {
        const autoPriceLists = this.autoMatchPriceLists(name, availablePriceLists);
        const destinationsList = deduplicateDestinations(Array.from(data.destinationsMap.values()));
        const id = crypto.randomUUID();
        const destinationsJson = JSON.stringify(destinationsList);
        const priceListsJson = JSON.stringify(autoPriceLists);
        const phonesJson = JSON.stringify([]);

        await db.execute(
          `INSERT INTO clients (
            id, business_name, address, city, province, vat_number,
            fiscal_code, sdi_code, payment_method, destinations_json,
            price_lists_json, phones_json, is_active, created_at,
            updated_at, updated_by, sync_status
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1, $13, $13, 'ddt_import', 'pending'
          )`,
          [
            id,
            name,
            data.address || null,
            data.city || null,
            data.province || null,
            data.vat_number || null,
            data.fiscal_code || null,
            data.sdi_code || null,
            data.payment_method || null,
            destinationsJson,
            priceListsJson,
            phonesJson,
            now,
          ]
        );

        savedClients.push({
          id,
          business_name: name,
          address: data.address || undefined,
          city: data.city || undefined,
          province: data.province || undefined,
          vat_number: data.vat_number || undefined,
          fiscal_code: data.fiscal_code || undefined,
          sdi_code: data.sdi_code || undefined,
          payment_method: data.payment_method || undefined,
          destinations: destinationsList,
          phones: [],
          price_lists: autoPriceLists,
          is_active: true,
          created_at: now,
          updated_at: now,
          updated_by: "ddt_import",
          deleted_at: null,
          sync_status: "pending",
        });
        added++;
      }
      await db.execute("COMMIT");
    } catch (err) {
      await db.execute("ROLLBACK");
      throw err;
    }

    // Sincronizza in background su Supabase Cloud dopo il commit locale
    for (const saved of savedClients) {
      void this.pushClientToSupabase(saved);
    }

    return { added };
  }

  /**
   * Algoritmo di abbinamento automatico intelligente tra nome cliente e listini disponibili
   */
  public autoMatchPriceLists(businessName: string, availablePriceLists: string[]): string[] {
    const normName = businessName.toUpperCase().trim();
    if (!normName) return [];

    // 1. Controllo corrispondenze note (Alias manuali storici)
    for (const [key, aliases] of Object.entries(KNOWN_PRICE_LIST_ALIASES)) {
      if (normName === key || normName.includes(key) || key.includes(normName)) {
        const matched = aliases.filter((a) => availablePriceLists.includes(a));
        if (matched.length > 0) return matched;
      }
    }

    // 2. Controllo "LIST_" + nome esatto (case-insensitive)
    const directListName = `LIST_${normName}`;
    if (availablePriceLists.includes(directListName)) {
      return [directListName];
    }

    // 3. Normalizzazione senza tipi societari e punteggiatura
    const stripCompany = (s: string) =>
      s
        .toUpperCase()
        .replace(/[.\-_,;:\/\\()]/g, " ")
        .replace(/\b(S\.?R\.?L\.?S?|S\.?P\.?A\.?|S\.?N\.?C\.?|S\.?A\.?S\.?|S\.?R\.?L|S\.?P\.?A)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    const cleanClient = stripCompany(normName);

    // Controlla se un listino ha esattamente lo stesso nome ripulito
    for (const listino of availablePriceLists) {
      const cleanListino = stripCompany(listino.replace(/^LIST_/i, ""));
      if (cleanClient === cleanListino && cleanClient.length >= 3) {
        return [listino];
      }
    }

    // Nessun match forzato su singole parole comuni: se non è una corrispondenza certa, non associare nulla
    return [];
  }
}

export const clientSyncService = new ClientSyncService();

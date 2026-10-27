import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { Client, ClientDestination, ClientPhone } from "../models/client";
import { clientRepository } from "./clientRepository";
import { normalizeDestinationKey, deduplicateDestinations } from "../utils/destinationUtils";

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

      // Trova o crea ID locale univoco
      const existing = await db.select<{ id: string; price_lists_json: string | null }[]>(
        "SELECT id, price_lists_json FROM clients WHERE LOWER(TRIM(business_name)) = LOWER(TRIM($1)) AND deleted_at IS NULL",
        [businessName]
      );

      let priceLists: string[] = [];
      if (existing.length > 0 && existing[0].price_lists_json) {
        try {
          const parsed = JSON.parse(existing[0].price_lists_json);
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

      const clientId = existing.length > 0 ? existing[0].id : crypto.randomUUID();

      await clientRepository.createOrUpdateClient({
        id: clientId,
        business_name: businessName,
        address: row.indirizzo || undefined,
        city: city || undefined,
        province: province || undefined,
        vat_number: row.piva || undefined,
        fiscal_code: row.cod_fiscale || undefined,
        sdi_code: row.sdi || undefined,
        payment_method: row.pagamento || undefined,
        destinations,
        phones,
        price_lists: priceLists,
        is_active: true,
      });

      imported++;
    }

    return {
      totalFetched: rows.length,
      imported,
      matchedPriceLists,
    };
  }

  /**
   * Salva o sincronizza un singolo cliente su Supabase Cloud
   */
  public async pushClientToSupabase(client: Client): Promise<void> {
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

      // Cerca se esiste già per nome
      const checkUrl = new URL("/rest/v1/clienti", creds.projectUrl);
      checkUrl.searchParams.set("cliente", `eq.${client.business_name.toUpperCase()}`);

      const checkRes = await fetch(checkUrl.toString(), {
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
        },
      });

      if (checkRes.ok) {
        const found = await checkRes.json();
        if (Array.isArray(found) && found.length > 0) {
          const supId = found[0].id;
          const patchUrl = new URL(`/rest/v1/clienti?id=eq.${supId}`, creds.projectUrl);
          await fetch(patchUrl.toString(), {
            method: "PATCH",
            headers: {
              apikey: creds.anonKey,
              Authorization: `Bearer ${creds.anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });
          return;
        }
      }

      // Altrimenti INSERT
      const insertUrl = new URL("/rest/v1/clienti", creds.projectUrl);
      await fetch(insertUrl.toString(), {
        method: "POST",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn("[ClientSyncService] Salvataggio Supabase non riuscito (proseguito in locale):", err);
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

    // Recupera l'elenco dei clienti già salvati
    const existingRows = await db.select<{ business_name: string }[]>(
      "SELECT business_name FROM clients WHERE deleted_at IS NULL"
    );
    const existingSet = new Set(existingRows.map((r) => r.business_name.toUpperCase().trim()));

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

    for (const row of ddtRows) {
      const normName = row.client_name.trim().toUpperCase();
      if (!normName || existingSet.has(normName)) continue;

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
    for (const [name, data] of missingClients.entries()) {
      const autoPriceLists = this.autoMatchPriceLists(name, availablePriceLists);
      const destinationsList = deduplicateDestinations(Array.from(data.destinationsMap.values()));

      const saved = await clientRepository.createOrUpdateClient({
        business_name: name,
        address: data.address || undefined,
        city: data.city || undefined,
        province: data.province || undefined,
        vat_number: data.vat_number || undefined,
        fiscal_code: data.fiscal_code || undefined,
        sdi_code: data.sdi_code || undefined,
        payment_method: data.payment_method || undefined,
        destinations: destinationsList,
        price_lists: autoPriceLists,
        is_active: true,
      });

      // Sincronizza anche su Supabase Cloud
      void this.pushClientToSupabase(saved);
      added++;
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

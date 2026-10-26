import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { ListinoGeneraleRow, ListinoClienteRow } from "../models/priceList";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
  configPath: string;
}

export interface SyncProgress {
  stage: "idle" | "general" | "vari" | "clienti" | "saving" | "completed" | "error";
  message: string;
  current: number;
  total: number;
}

const PAGE_SIZE = 1000;

async function getSupabaseCredentials(): Promise<SupabaseConfig> {
  const status = await invoke<ConfigStatus>("get_supabase_config");
  if (!status.config || !status.config.projectUrl || !status.config.anonKey) {
    throw new Error("Configurazione Supabase mancante. Configurala in Impostazioni -> Cloud & Database.");
  }
  return status.config;
}

async function fetchAllPages<T>(
  baseUrl: string,
  anonKey: string,
  table: string,
  select: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;
  let totalRows = Infinity;

  while (offset < totalRows) {
    const pageUrl = new URL(`/rest/v1/${table}`, baseUrl);
    pageUrl.searchParams.set("select", select);
    pageUrl.searchParams.set("order", "id.asc");
    pageUrl.searchParams.set("limit", String(PAGE_SIZE));
    pageUrl.searchParams.set("offset", String(offset));

    const response = await fetch(pageUrl.toString(), {
      method: "GET",
      headers: {
        apikey: anonKey,
        Prefer: "count=exact",
      },
    });

    if (!response.ok) {
      throw new Error(`Errore fetch Supabase su ${table}: HTTP ${response.status} ${response.statusText}`);
    }

    const rangeHeader = response.headers.get("content-range");
    if (rangeHeader) {
      const parts = rangeHeader.split("/");
      if (parts[1] && parts[1] !== "*") {
        totalRows = parseInt(parts[1], 10);
      }
    }

    const rows: T[] = await response.json();
    if (!rows || rows.length === 0) {
      break;
    }

    allRows.push(...rows);
    offset += rows.length;

    if (onProgress && totalRows !== Infinity) {
      onProgress(allRows.length, totalRows);
    }

    if (rows.length < PAGE_SIZE) {
      break;
    }
  }

  return allRows;
}

export class PriceListSyncService {
  /**
   * Sincronizza i listini da Supabase Cloud e li memorizza nel database SQLite locale.
   * Scarica sia `listino_generale` (8849) che `listini_vari` (914) unificandoli a 9763 voci,
   * e `listini_clienti` (18558 voci).
   */
  async syncAllFromSupabase(
    onProgress?: (prog: SyncProgress) => void
  ): Promise<{ generalCount: number; clientCount: number }> {
    const creds = await getSupabaseCredentials();
    const db = await getDatabase();

    // 1. Scarica Listino Generale
    onProgress?.({
      stage: "general",
      message: "Scaricamento Listino Generale da Supabase...",
      current: 0,
      total: 8849,
    });

    const genFields =
      "id,created_at,updated_at,cat,fornitore,codice_articolo,data,descrizione,um,perc_pub,prezzo_pubblico,perc_prof,prezzo_profess,perc_fatt,prezzo_fattura,prezzo_acquisto,aumento,r1,maga,r2,perc_iva,note";

    const rawGeneral = await fetchAllPages<any>(
      creds.projectUrl,
      creds.anonKey,
      "listino_generale",
      genFields,
      (current, total) => {
        onProgress?.({
          stage: "general",
          message: `Scaricamento Listino Generale (${current}/${total})...`,
          current,
          total,
        });
      }
    );

    // 2. Scarica Listini Vari
    onProgress?.({
      stage: "vari",
      message: "Scaricamento Listini Vari da Supabase...",
      current: 0,
      total: 914,
    });

    const rawVari = await fetchAllPages<any>(
      creds.projectUrl,
      creds.anonKey,
      "listini_vari",
      genFields,
      (current, total) => {
        onProgress?.({
          stage: "vari",
          message: `Scaricamento Listini Vari (${current}/${total})...`,
          current,
          total,
        });
      }
    );

    // 3. Scarica Listini Clienti
    onProgress?.({
      stage: "clienti",
      message: "Scaricamento Listini Clienti da Supabase...",
      current: 0,
      total: 18558,
    });

    const cliFields =
      "id,created_at,updated_at,cliente,codice_articolo,descrizione,prezzo_fattura,prezzo_acquisto,ricarico,note,note1,note2";

    const rawClienti = await fetchAllPages<any>(
      creds.projectUrl,
      creds.anonKey,
      "listini_clienti",
      cliFields,
      (current, total) => {
        onProgress?.({
          stage: "clienti",
          message: `Scaricamento Listini Clienti (${current}/${total})...`,
          current,
          total,
        });
      }
    );

    // 4. Salvataggio in SQLite con transazioni sicure
    onProgress?.({
      stage: "saving",
      message: "Salvataggio listini in SQLite locale...",
      current: 0,
      total: rawGeneral.length + rawVari.length + rawClienti.length,
    });

    // Mappatura Listino Generale unificato (Gen + Vari = 9763 voci)
    const generalRows: ListinoGeneraleRow[] = [
      ...rawGeneral.map((r: any): ListinoGeneraleRow => ({
        id: `gen_${r.id}`,
        source_table: "listino_generale",
        cat: r.cat ?? null,
        fornitore: r.fornitore ?? null,
        codice_articolo: r.codice_articolo ?? null,
        data_ref: r.data ?? null,
        descrizione: r.descrizione ?? "",
        um: r.um ?? null,
        perc_pub: r.perc_pub != null ? Number(r.perc_pub) : null,
        prezzo_pubblico: r.prezzo_pubblico != null ? Number(r.prezzo_pubblico) : null,
        perc_prof: r.perc_prof != null ? Number(r.perc_prof) : null,
        prezzo_profess: r.prezzo_profess != null ? Number(r.prezzo_profess) : null,
        perc_fatt: r.perc_fatt != null ? Number(r.perc_fatt) : null,
        prezzo_fattura: r.prezzo_fattura != null ? Number(r.prezzo_fattura) : null,
        prezzo_acquisto: r.prezzo_acquisto != null ? Number(r.prezzo_acquisto) : null,
        aumento: r.aumento != null ? Number(r.aumento) : null,
        r1: r.r1 != null ? Number(r.r1) : null,
        maga: r.maga != null ? Number(r.maga) : null,
        r2: r.r2 != null ? Number(r.r2) : null,
        perc_iva: r.perc_iva != null ? Number(r.perc_iva) : 0.22,
        note: r.note ?? null,
        created_at: r.created_at ?? undefined,
        updated_at: r.updated_at ?? undefined,
      })),
      ...rawVari.map((r: any): ListinoGeneraleRow => ({
        id: `var_${r.id}`,
        source_table: "listini_vari",
        cat: r.cat ?? null,
        fornitore: r.fornitore ?? null,
        codice_articolo: r.codice_articolo ?? null,
        data_ref: r.data ?? null,
        descrizione: r.descrizione ?? "",
        um: r.um ?? null,
        perc_pub: r.perc_pub != null ? Number(r.perc_pub) : null,
        prezzo_pubblico: r.prezzo_pubblico != null ? Number(r.prezzo_pubblico) : null,
        perc_prof: r.perc_prof != null ? Number(r.perc_prof) : null,
        prezzo_profess: r.prezzo_profess != null ? Number(r.prezzo_profess) : null,
        perc_fatt: r.perc_fatt != null ? Number(r.perc_fatt) : null,
        prezzo_fattura: r.prezzo_fattura != null ? Number(r.prezzo_fattura) : null,
        prezzo_acquisto: r.prezzo_acquisto != null ? Number(r.prezzo_acquisto) : null,
        aumento: r.aumento != null ? Number(r.aumento) : null,
        r1: r.r1 != null ? Number(r.r1) : null,
        maga: r.maga != null ? Number(r.maga) : null,
        r2: r.r2 != null ? Number(r.r2) : null,
        perc_iva: r.perc_iva != null ? Number(r.perc_iva) : 0.22,
        note: r.note ?? null,
        created_at: r.created_at ?? undefined,
        updated_at: r.updated_at ?? undefined,
      })),
    ];

    // Mappatura Listini Clienti (18558 voci)
    const clientRows: ListinoClienteRow[] = rawClienti.map((r: any): ListinoClienteRow => ({
      id: `cli_${r.id}`,
      cliente: r.cliente ?? "",
      codice_articolo: r.codice_articolo ?? null,
      descrizione: r.descrizione ?? "",
      prezzo_fattura: r.prezzo_fattura != null ? Number(r.prezzo_fattura) : null,
      prezzo_acquisto: r.prezzo_acquisto != null ? Number(r.prezzo_acquisto) : null,
      ricarico: r.ricarico != null ? Number(r.ricarico) : null,
      note: r.note ?? null,
      note1: r.note1 ?? null,
      note2: r.note2 ?? null,
      created_at: r.created_at ?? undefined,
      updated_at: r.updated_at ?? undefined,
    }));

    // Inserimento batch in SQLite
    await db.execute("BEGIN TRANSACTION;");
    try {
      // 1. Pulizia e reinserimento listino generale
      await db.execute("DELETE FROM listino_generale;");
      const BATCH_SIZE = 100;

      for (let i = 0; i < generalRows.length; i += BATCH_SIZE) {
        const chunk = generalRows.slice(i, i + BATCH_SIZE);
        for (const row of chunk) {
          await db.execute(
            `INSERT INTO listino_generale (
              id, source_table, cat, fornitore, codice_articolo, data_ref,
              descrizione, um, perc_pub, prezzo_pubblico, perc_prof, prezzo_profess,
              perc_fatt, prezzo_fattura, prezzo_acquisto, aumento, r1, maga, r2,
              perc_iva, note, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
            [
              row.id,
              row.source_table,
              row.cat,
              row.fornitore,
              row.codice_articolo,
              row.data_ref,
              row.descrizione,
              row.um,
              row.perc_pub,
              row.prezzo_pubblico,
              row.perc_prof,
              row.prezzo_profess,
              row.perc_fatt,
              row.prezzo_fattura,
              row.prezzo_acquisto,
              row.aumento,
              row.r1,
              row.maga,
              row.r2,
              row.perc_iva,
              row.note,
              row.created_at ?? null,
              row.updated_at ?? null,
            ]
          );
        }
      }

      // 2. Pulizia e reinserimento listini clienti
      await db.execute("DELETE FROM listini_clienti;");
      for (let i = 0; i < clientRows.length; i += BATCH_SIZE) {
        const chunk = clientRows.slice(i, i + BATCH_SIZE);
        for (const row of chunk) {
          await db.execute(
            `INSERT INTO listini_clienti (
              id, cliente, codice_articolo, descrizione, prezzo_fattura,
              prezzo_acquisto, ricarico, note, note1, note2, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              row.id,
              row.cliente,
              row.codice_articolo,
              row.descrizione,
              row.prezzo_fattura,
              row.prezzo_acquisto,
              row.ricarico,
              row.note,
              row.note1,
              row.note2,
              row.created_at ?? null,
              row.updated_at ?? null,
            ]
          );
        }
      }

      await db.execute("COMMIT;");
    } catch (err) {
      await db.execute("ROLLBACK;");
      console.error("[PriceListSyncService] Errore inserimento SQLite:", err);
      throw err;
    }

    onProgress?.({
      stage: "completed",
      message: `Completato! ${generalRows.length} articoli Listino Generale e ${clientRows.length} Listini Clienti sincronizzati.`,
      current: generalRows.length + clientRows.length,
      total: generalRows.length + clientRows.length,
    });

    return {
      generalCount: generalRows.length,
      clientCount: clientRows.length,
    };
  }
}

export const priceListSyncService = new PriceListSyncService();

import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import {
  ListinoGeneraleRow,
  ListinoClienteRow,
  TrashListinoRow,
  TrashListinoClienteRow,
} from "../models/priceList";

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
  const status = await invoke<ConfigStatus>("load_supabase_config");
  if (!status.config || !status.config.projectUrl || !status.config.anonKey) {
    throw new Error("Configurazione Supabase mancante. Configurala in Impostazioni -> Cloud & Database.");
  }
  return status.config;
}

function buildAuthHeaders(anonKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    ...extra,
  };
}

const CLIENT_SELECT_FIELDS =
  "id,created_at,updated_at,cliente,fornitore,codice_articolo,descrizione,prezzo_fattura,prezzo_acquisto,acquisto_eur,perc_acquisto,data_acquisto,acquisto_old,ricarico,data_ref,note,note1,note2";

function mapSupabaseClientRow(r: any): ListinoClienteRow {
  return {
    id: `cli_${r.id}`,
    cliente: r.cliente ?? "",
    fornitore: r.fornitore ?? null,
    codice_articolo: r.codice_articolo ?? null,
    descrizione: r.descrizione ?? "",
    prezzo_fattura: r.prezzo_fattura != null ? Number(r.prezzo_fattura) : null,
    prezzo_acquisto: r.prezzo_acquisto != null ? Number(r.prezzo_acquisto) : null,
    acquisto_eur: r.acquisto_eur != null ? Number(r.acquisto_eur) : null,
    perc_acquisto: r.perc_acquisto != null ? Number(r.perc_acquisto) : null,
    data_acquisto: r.data_acquisto ?? null,
    acquisto_old: r.acquisto_old ?? null,
    ricarico: r.ricarico != null ? Number(r.ricarico) : null,
    data_ref: r.data_ref ?? null,
    note: r.note ?? null,
    note1: r.note1 ?? null,
    note2: r.note2 ?? null,
    created_at: r.created_at ?? undefined,
    updated_at: r.updated_at ?? undefined,
  };
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
      headers: buildAuthHeaders(anonKey, { Prefer: "count=exact" }),
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

async function fetchPagesWithFilter<T>(
  baseUrl: string,
  anonKey: string,
  table: string,
  select: string,
  filterParam: string,
  filterVal: string
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const pageUrl = new URL(`/rest/v1/${table}`, baseUrl);
    pageUrl.searchParams.set("select", select);
    pageUrl.searchParams.set(filterParam, filterVal);
    pageUrl.searchParams.set("order", "updated_at.desc,id.asc");
    pageUrl.searchParams.set("limit", String(PAGE_SIZE));
    pageUrl.searchParams.set("offset", String(offset));

    const response = await fetch(pageUrl.toString(), {
      method: "GET",
      headers: buildAuthHeaders(anonKey),
    });

    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error(`Errore fetch Supabase su ${table}: ${response.status}`);
    }

    const rows: T[] = await response.json();
    if (!rows || rows.length === 0) break;
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += rows.length;
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

    const rawClienti = await fetchAllPages<any>(
      creds.projectUrl,
      creds.anonKey,
      "listini_clienti",
      CLIENT_SELECT_FIELDS,
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
    const clientRows: ListinoClienteRow[] = rawClienti.map(mapSupabaseClientRow);

    // Inserimento batch in SQLite preservando eventuali nuove righe locali non ancora inviate
    const { priceListRepository } = await import("./priceListRepository");
    await db.execute("DELETE FROM listino_generale WHERE id NOT LIKE 'new_%';");
    await priceListRepository.saveGeneralRows(generalRows);

    await db.execute("DELETE FROM listini_clienti WHERE id NOT LIKE 'new_%';");
    await priceListRepository.saveClientRows(clientRows);

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

  /**
   * Spinge in background un batch di modifiche o nuovi articoli verso Supabase.
   */
  async pushGeneralBatchToSupabase(
    rows: ListinoGeneraleRow[]
  ): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    if (rows.length === 0) return { success: true, updatedCount: 0 };
    try {
      const creds = await getSupabaseCredentials();
      const db = await getDatabase();

      const genRows = rows.filter((r) => r.source_table !== "listini_vari");
      const varRows = rows.filter((r) => r.source_table === "listini_vari");

      const processBatch = async (
        items: ListinoGeneraleRow[],
        table: "listino_generale" | "listini_vari"
      ) => {
        for (const r of items) {
          const isNew = r.id.startsWith("new_");
          const payload: any = {
            cat: r.cat ?? null,
            fornitore: r.fornitore ?? null,
            codice_articolo: r.codice_articolo ?? null,
            data: r.data_ref ?? null,
            descrizione: r.descrizione,
            um: r.um ?? "NR.",
            perc_pub: r.perc_pub ?? null,
            prezzo_pubblico: r.prezzo_pubblico ?? null,
            perc_prof: r.perc_prof ?? null,
            prezzo_profess: r.prezzo_profess ?? null,
            perc_fatt: r.perc_fatt ?? null,
            prezzo_fattura: r.prezzo_fattura ?? null,
            prezzo_acquisto: r.prezzo_acquisto ?? null,
            aumento: r.aumento ?? null,
            r1: r.r1 ?? null,
            maga: r.maga ?? null,
            r2: r.r2 ?? null,
            perc_iva: r.perc_iva ?? 0.22,
            note: r.note ?? null,
            updated_at: new Date().toISOString(),
          };

          if (isNew) {
            payload.created_at = new Date().toISOString();
            const res = await fetch(`${creds.projectUrl}/rest/v1/${table}`, {
              method: "POST",
              headers: buildAuthHeaders(creds.anonKey, {
                "Content-Type": "application/json",
                Prefer: "return=representation",
              }),
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              throw new Error(`Errore POST Supabase su ${table}: HTTP ${res.status}`);
            }
            const inserted = await res.json();
            if (inserted && inserted[0]?.id) {
              const prefix = table === "listino_generale" ? "gen_" : "var_";
              const newDbId = `${prefix}${inserted[0].id}`;
              await db.execute(
                "UPDATE listino_generale SET id = $1 WHERE id = $2;",
                [newDbId, r.id]
              );
              r.id = newDbId;
            }
          } else {
            const rawIdStr = r.id.replace(/^(gen_|var_)/, "");
            const numId = parseInt(rawIdStr, 10);
            const targetId = isNaN(numId) ? rawIdStr : numId;

            const res = await fetch(`${creds.projectUrl}/rest/v1/${table}?id=eq.${targetId}`, {
              method: "PATCH",
              headers: buildAuthHeaders(creds.anonKey, {
                "Content-Type": "application/json",
              }),
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              throw new Error(`Errore PATCH Supabase su ${table}: HTTP ${res.status}`);
            }
          }
        }
      };

      await processBatch(genRows, "listino_generale");
      if (varRows.length > 0) {
        await processBatch(varRows, "listini_vari");
      }

      return { success: true, updatedCount: rows.length };
    } catch (err: any) {
      console.warn(
        "[PriceListSyncService] Push Supabase asincrono non riuscito (modalità locale attiva):",
        err
      );
      return { success: false, updatedCount: 0, error: err?.message || String(err) };
    }
  }

  /**
   * Elimina un lotto di articoli da Supabase in background.
   */
  async deleteGeneralBatchFromSupabase(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const creds = await getSupabaseCredentials();
      for (const id of ids) {
        if (id.startsWith("new_")) continue;
        const isGen = id.startsWith("gen_");
        const table = isGen ? "listino_generale" : "listini_vari";
        const rawIdStr = id.replace(/^(gen_|var_)/, "");
        const numId = parseInt(rawIdStr, 10);
        const targetId = isNaN(numId) ? rawIdStr : numId;

        const res = await fetch(`${creds.projectUrl}/rest/v1/${table}?id=eq.${targetId}`, {
          method: "DELETE",
          headers: buildAuthHeaders(creds.anonKey),
        });
        if (!res.ok) {
          console.warn(`[PriceListSyncService] Delete Supabase HTTP ${res.status} su ${table}#${targetId}`);
        }
      }
    } catch (err) {
      console.warn("[PriceListSyncService] Delete Supabase asincrono non riuscito:", err);
    }
  }

  /**
   * Registra gli elementi spostati nel Cestino anche su Supabase (tabella listino_generale_cestino).
   */
  async pushTrashBatchToSupabase(rows: TrashListinoRow[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      const creds = await getSupabaseCredentials();
      const payload = rows.map((r) => ({
        id: r.id,
        deleted_at: r.deleted_at,
        deleted_by: r.deleted_by || "Operatore",
        codice_articolo: r.codice_articolo || null,
        descrizione: r.descrizione || "",
        fornitore: r.fornitore || null,
        prezzo_acquisto: r.prezzo_acquisto,
        prezzo_fattura: r.prezzo_fattura,
        prezzo_pubblico: r.prezzo_pubblico,
        perc_iva: r.perc_iva,
        um: r.um || "NR.",
      }));

      const res = await fetch(`${creds.projectUrl}/rest/v1/listino_generale_cestino`, {
        method: "POST",
        headers: buildAuthHeaders(creds.anonKey, {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        }),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn(`[PriceListSyncService] Push Cestino Supabase HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn("[PriceListSyncService] Push Cestino Supabase (asincrono / offline):", err);
    }
  }

  /**
   * Rimuove un articolo dal Cestino su Supabase al momento del ripristino.
   */
  async deleteTrashFromSupabase(id: string): Promise<void> {
    try {
      const creds = await getSupabaseCredentials();
      const res = await fetch(`${creds.projectUrl}/rest/v1/listino_generale_cestino?id=eq.${id}`, {
        method: "DELETE",
        headers: buildAuthHeaders(creds.anonKey),
      });
      if (!res.ok) {
        console.warn(`[PriceListSyncService] Delete Cestino Supabase HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn("[PriceListSyncService] Delete Cestino Supabase:", err);
    }
  }

  /**
   * Sincronizza (upsert) un batch di righe di Listini Clienti su Supabase Cloud.
   */
  async pushClientBatchToSupabase(
    rows: ListinoClienteRow[]
  ): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    if (rows.length === 0) return { success: true, updatedCount: 0 };
    try {
      const creds = await getSupabaseCredentials();
      const db = await getDatabase();

      for (const r of rows) {
        const isNew = r.id.startsWith("new_");
        const payload: any = {
          cliente: r.cliente,
          fornitore: r.fornitore ?? null,
          codice_articolo: r.codice_articolo ?? null,
          descrizione: r.descrizione,
          prezzo_fattura: r.prezzo_fattura ?? null,
          prezzo_acquisto: r.prezzo_acquisto ?? null,
          acquisto_eur: r.acquisto_eur ?? null,
          perc_acquisto: r.perc_acquisto ?? null,
          data_acquisto: r.data_acquisto ?? null,
          acquisto_old: r.acquisto_old ?? null,
          ricarico: r.ricarico ?? null,
          data_ref: r.data_ref ?? null,
          note: r.note ?? null,
          note1: r.note1 ?? null,
          note2: r.note2 ?? null,
          updated_at: new Date().toISOString(),
          modificato_da: "Operatore",
        };

        if (isNew) {
          const res = await fetch(`${creds.projectUrl}/rest/v1/listini_clienti`, {
            method: "POST",
            headers: buildAuthHeaders(creds.anonKey, {
              "Content-Type": "application/json",
              Prefer: "return=representation",
            }),
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            throw new Error(`Errore POST Supabase su listini_clienti: HTTP ${res.status}`);
          }
          const inserted = await res.json();
          if (Array.isArray(inserted) && inserted[0]?.id) {
            const newCloudId = `cli_${inserted[0].id}`;
            await db.execute("UPDATE listini_clienti SET id = $1 WHERE id = $2;", [
              newCloudId,
              r.id,
            ]);
          }
        } else {
          const rawIdStr = r.id.replace(/^cli_/, "");
          const numId = parseInt(rawIdStr, 10);
          const targetId = isNaN(numId) ? rawIdStr : numId;

          const res = await fetch(`${creds.projectUrl}/rest/v1/listini_clienti?id=eq.${targetId}`, {
            method: "PATCH",
            headers: buildAuthHeaders(creds.anonKey, {
              "Content-Type": "application/json",
            }),
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            throw new Error(`Errore PATCH Supabase su listini_clienti: HTTP ${res.status}`);
          }
        }
      }

      return { success: true, updatedCount: rows.length };
    } catch (err: any) {
      console.warn(
        "[PriceListSyncService] Push Listini Clienti Supabase non riuscito (modalità locale attiva):",
        err
      );
      return { success: false, updatedCount: 0, error: err?.message || String(err) };
    }
  }

  /**
   * Elimina righe di Listini Clienti da Supabase Cloud.
   */
  async deleteClientRowsFromSupabase(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const creds = await getSupabaseCredentials();
      for (const id of ids) {
        if (id.startsWith("new_")) continue;
        const rawIdStr = id.replace(/^cli_/, "");
        const numId = parseInt(rawIdStr, 10);
        const targetId = isNaN(numId) ? rawIdStr : numId;

        const res = await fetch(`${creds.projectUrl}/rest/v1/listini_clienti?id=eq.${targetId}`, {
          method: "DELETE",
          headers: buildAuthHeaders(creds.anonKey),
        });
        if (!res.ok) {
          console.warn(`[PriceListSyncService] Delete Clienti Supabase HTTP ${res.status} su #${targetId}`);
        }
      }
    } catch (err) {
      console.warn("[PriceListSyncService] Delete Clienti Supabase asincrono non riuscito:", err);
    }
  }

  /**
   * Sposta elementi nel Cestino Clienti su Supabase.
   */
  async pushClientTrashBatchToSupabase(rows: TrashListinoClienteRow[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      const creds = await getSupabaseCredentials();
      const payload = rows.map((r) => ({
        id: r.id,
        deleted_at: r.deleted_at,
        deleted_by: r.deleted_by || "Operatore",
        cliente: r.cliente,
        fornitore: r.fornitore || null,
        codice_articolo: r.codice_articolo || null,
        descrizione: r.descrizione || "",
        prezzo_fattura: r.prezzo_fattura,
        acquisto_eur: r.acquisto_eur,
        perc_acquisto: r.perc_acquisto,
        data_acquisto: r.data_acquisto,
        acquisto_old: r.acquisto_old,
        ricarico: r.ricarico,
        data_ref: r.data_ref,
        note: r.note,
        note1: r.note1,
        note2: r.note2,
      }));

      const res = await fetch(`${creds.projectUrl}/rest/v1/listini_clienti_cestino`, {
        method: "POST",
        headers: buildAuthHeaders(creds.anonKey, {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        }),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn(`[PriceListSyncService] Push Cestino Clienti Supabase HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn("[PriceListSyncService] Push Cestino Clienti Supabase:", err);
    }
  }

  /**
   * Rimuove un elemento dal Cestino Clienti su Supabase al momento del ripristino.
   */
  async deleteClientTrashFromSupabase(id: string): Promise<void> {
    try {
      const creds = await getSupabaseCredentials();
      const res = await fetch(`${creds.projectUrl}/rest/v1/listini_clienti_cestino?id=eq.${id}`, {
        method: "DELETE",
        headers: buildAuthHeaders(creds.anonKey),
      });
      if (!res.ok) {
        console.warn(`[PriceListSyncService] Delete Cestino Clienti Supabase HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn("[PriceListSyncService] Delete Cestino Clienti Supabase:", err);
    }
  }

  /**
   * Sincronizzazione incrementale veloce da Supabase Cloud per Listino Generale.
   * Scarica solo gli articoli modificati da altri PC successivamente all'ultimo sync locale,
   * aggiorna SQLite e restituisce il numero di righe aggiornate.
   */
  async syncIncrementalGeneralFromSupabase(): Promise<{
    updatedCount: number;
    updatedRows: ListinoGeneraleRow[];
    error?: string;
  }> {
    try {
      const creds = await getSupabaseCredentials();
      const db = await getDatabase();

      let localMaxIso: string | null = null;
      try {
        const rows = await db.select<{ max_up: string | null }[]>(
          "SELECT MAX(updated_at) as max_up FROM listino_generale WHERE updated_at IS NOT NULL;"
        );
        localMaxIso = rows[0]?.max_up || null;
      } catch {}

      let referenceDate: Date;
      if (localMaxIso && !isNaN(new Date(localMaxIso).getTime())) {
        referenceDate = new Date(localMaxIso);
      } else {
        referenceDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      }

      // 10 secondi di tolleranza per compensare differenze di orologio tra macchine
      const sinceIso = new Date(referenceDate.getTime() - 10000).toISOString();

      const genFields =
        "id,created_at,updated_at,cat,fornitore,codice_articolo,data,descrizione,um,perc_pub,prezzo_pubblico,perc_prof,prezzo_profess,perc_fatt,prezzo_fattura,prezzo_acquisto,aumento,r1,maga,r2,perc_iva,note";

      const [rawGen, rawVar] = await Promise.all([
        fetchPagesWithFilter<any>(
          creds.projectUrl,
          creds.anonKey,
          "listino_generale",
          genFields,
          "updated_at",
          `gt.${sinceIso}`
        ),
        fetchPagesWithFilter<any>(
          creds.projectUrl,
          creds.anonKey,
          "listini_vari",
          genFields,
          "updated_at",
          `gt.${sinceIso}`
        ),
      ]);

      if ((!rawGen || rawGen.length === 0) && (!rawVar || rawVar.length === 0)) {
        return { updatedCount: 0, updatedRows: [] };
      }

      const rowsToUpsert: ListinoGeneraleRow[] = [
        ...rawGen.map((r: any): ListinoGeneraleRow => ({
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
        ...rawVar.map((r: any): ListinoGeneraleRow => ({
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

      const { priceListRepository } = await import("./priceListRepository");
      await priceListRepository.saveGeneralRows(rowsToUpsert);

      return { updatedCount: rowsToUpsert.length, updatedRows: rowsToUpsert };
    } catch (err: any) {
      console.warn("[PriceListSyncService] Sincronizzazione incrementale non riuscita (modalità offline):", err);
      return { updatedCount: 0, updatedRows: [], error: err?.message || String(err) };
    }
  }

  /**
   * Sincronizzazione incrementale veloce da Supabase Cloud per Listini Clienti.
   */
  async syncIncrementalClientiFromSupabase(): Promise<{
    updatedCount: number;
    updatedRows: ListinoClienteRow[];
    error?: string;
  }> {
    try {
      const creds = await getSupabaseCredentials();
      const db = await getDatabase();

      let localMaxIso: string | null = null;
      try {
        const rows = await db.select<{ max_up: string | null }[]>(
          "SELECT MAX(updated_at) as max_up FROM listini_clienti WHERE updated_at IS NOT NULL;"
        );
        localMaxIso = rows[0]?.max_up || null;
      } catch {}

      let referenceDate: Date;
      if (localMaxIso && !isNaN(new Date(localMaxIso).getTime())) {
        referenceDate = new Date(localMaxIso);
      } else {
        referenceDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      }

      const sinceIso = new Date(referenceDate.getTime() - 10000).toISOString();

      const rawClienti = await fetchPagesWithFilter<any>(
        creds.projectUrl,
        creds.anonKey,
        "listini_clienti",
        CLIENT_SELECT_FIELDS,
        "updated_at",
        `gt.${sinceIso}`
      );

      if (!rawClienti || rawClienti.length === 0) {
        return { updatedCount: 0, updatedRows: [] };
      }

      const rowsToUpsert: ListinoClienteRow[] = rawClienti.map(mapSupabaseClientRow);

      const { priceListRepository } = await import("./priceListRepository");
      await priceListRepository.saveClientRows(rowsToUpsert);

      return { updatedCount: rowsToUpsert.length, updatedRows: rowsToUpsert };
    } catch (err: any) {
      console.warn("[PriceListSyncService] Sincronizzazione incrementale clienti fallita:", err);
      return { updatedCount: 0, updatedRows: [], error: err?.message || String(err) };
    }
  }
}

export const priceListSyncService = new PriceListSyncService();

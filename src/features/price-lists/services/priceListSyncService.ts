import { flushPendingCloudOperations, type PendingCloudOperation } from "@/shared/data-layer/pendingCloudOperations";
import { supabaseFetch } from "@/shared/services/supabaseSession";
import { normalizeSupabaseProjectUrl } from "@/shared/services/supabaseConfigCache";
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { applyLocalDatabaseBatch, type SqliteWrite } from "@/shared/data-layer/localDatabaseBatch";
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

function clientPriceListPayload(row: ListinoClienteRow, updatedAt: string) {
  return {
    cliente: row.cliente,
    fornitore: row.fornitore ?? null,
    codice_articolo: row.codice_articolo ?? null,
    descrizione: row.descrizione,
    prezzo_fattura: row.prezzo_fattura ?? null,
    prezzo_acquisto: row.prezzo_acquisto ?? null,
    acquisto_eur: row.acquisto_eur ?? null,
    perc_acquisto: row.perc_acquisto ?? null,
    data_acquisto: row.data_acquisto ?? null,
    acquisto_old: row.acquisto_old ?? null,
    ricarico: row.ricarico ?? null,
    data_ref: row.data_ref ?? null,
    note: row.note ?? null,
    note1: row.note1 ?? null,
    note2: row.note2 ?? null,
    updated_at: updatedAt,
    modificato_da: "Operatore",
  };
}

function deleteMissingPriceListRows(
  table: "listino_generale" | "listini_clienti",
  rows: { id: string }[],
  startedAt: string
): SqliteWrite {
  return {
    sql: `DELETE FROM ${table}
          WHERE sync_revision IS NULL AND id NOT GLOB 'new_*'
            AND (julianday(updated_at) IS NULL OR julianday(updated_at) < julianday($2))
            AND (sync_confirmed_at IS NULL OR julianday(sync_confirmed_at) < julianday($2))
            AND id NOT IN (SELECT value FROM json_each($1))`,
    params: [JSON.stringify(rows.map((row) => row.id)), startedAt],
  };
}

async function acknowledgePriceListWrite(
  response: Response,
  table: "listino_generale" | "listini_clienti",
  localId: string,
  prefix: string,
  revision: string | null | undefined,
  updatedAt: string
): Promise<string> {
  if (!response.ok) throw new Error(`Errore scrittura Supabase su ${table}: HTTP ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id == null) {
    throw new Error(`Supabase non ha confermato la riga ${localId}`);
  }
  const newId = localId.startsWith("new_") ? prefix + rows[0].id : localId;
  const db = await getDatabase();
  await db.execute(
    `UPDATE ${table} SET id = $1,
       updated_at = CASE WHEN sync_revision IS $2 THEN $3 ELSE updated_at END,
       sync_revision = CASE WHEN sync_revision IS $2 THEN NULL ELSE sync_revision END,
       sync_confirmed_at = $5
     WHERE id = $4`,
    [newId, revision ?? null, updatedAt, localId, new Date().toISOString()]
  );
  return newId;
}

async function fetchAllPages<T extends { id: number | string }>(
  baseUrl: string,
  anonKey: string,
  table: string,
  select: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<T[]> {
  const allRows: T[] = [];
  const ids = new Set<string>();
  let offset = 0;
  let totalRows: number | undefined;

  while (totalRows === undefined || offset < totalRows) {
    const pageUrl = new URL(`/rest/v1/${table}`, baseUrl);
    pageUrl.searchParams.set("select", select);
    pageUrl.searchParams.set("order", "id.asc");
    pageUrl.searchParams.set("limit", String(PAGE_SIZE));
    pageUrl.searchParams.set("offset", String(offset));

    const response = await supabaseFetch(pageUrl.toString(), {
      method: "GET",
      headers: buildAuthHeaders(anonKey, { Prefer: "count=exact" }),
    });

    if (!response.ok) {
      throw new Error(`Errore fetch Supabase su ${table}: HTTP ${response.status} ${response.statusText}`);
    }

    const count = response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
    const reportedTotal = count === undefined ? NaN : Number(count);
    if (!Number.isSafeInteger(reportedTotal) || (totalRows !== undefined && totalRows !== reportedTotal)) {
      throw new Error(`Conteggio Supabase assente o cambiato durante il download di ${table}`);
    }
    totalRows = reportedTotal;

    const rows: T[] = await response.json();
    if (!Array.isArray(rows)) throw new Error(`Risposta Supabase non valida per ${table}`);
    if ((rows.length === 0 && offset < totalRows) || offset + rows.length > totalRows) {
      throw new Error(`Download incompleto o incoerente di ${table}: ricevute ${offset + rows.length} di ${totalRows} righe`);
    }
    for (const row of rows) {
      const id = String(row?.id ?? "");
      if (!id || ids.has(id)) throw new Error(`ID mancante o duplicato durante il download di ${table}`);
      ids.add(id);
    }

    allRows.push(...rows);
    offset += rows.length;

    onProgress?.(allRows.length, totalRows);
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

    const response = await supabaseFetch(pageUrl.toString(), {
      method: "GET",
      headers: buildAuthHeaders(anonKey),
    });

    if (!response.ok) {
      throw new Error(`Errore fetch Supabase su ${table}: ${response.status}`);
    }

    const rows: T[] = await response.json();
    if (!Array.isArray(rows)) throw new Error(`Risposta Supabase non valida per ${table}`);
    if (rows.length === 0) break;
    allRows.push(...rows);
    offset += rows.length;
  }

  return allRows;
}

function generalPriceListPayload(r: ListinoGeneraleRow, updatedAt: string) {
  return {
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
    updated_at: updatedAt,
  };
}

type PriceListScope = "listino_generale" | "listini_clienti";

function priceListCloudTarget(scope: PriceListScope, row: ListinoGeneraleRow | ListinoClienteRow) {
  const table = scope === "listino_generale" && "source_table" in row && row.source_table === "listini_vari"
    ? "listini_vari" : scope;
  const remoteId = /^(?:gen_|var_|cli_)?(\d+)$/.exec(row.id)?.[1];
  if (!remoteId && !row.id.startsWith("new_")) throw new Error("Identificativo del listino non valido");
  return { table, remoteId };
}

export class PriceListSyncService {
  private cloudWrites = new Map<PriceListScope, Promise<unknown>>();

  private serializeWrite<T>(scope: PriceListScope, write: () => Promise<T>): Promise<T> {
    const previous = this.cloudWrites.get(scope) ?? Promise.resolve();
    const task = previous.then(write, write).finally(() => {
      if (this.cloudWrites.get(scope) === task) this.cloudWrites.delete(scope);
    });
    this.cloudWrites.set(scope, task);
    return task;
  }
  /**
   * Sincronizza i listini da Supabase Cloud e li memorizza nel database SQLite locale.
   * Scarica sia `listino_generale` (8849) che `listini_vari` (914) unificandoli a 9763 voci,
   * e `listini_clienti` (18558 voci).
   */
  syncAllFromSupabase(onProgress?: (prog: SyncProgress) => void) {
    return this.serializeWrite("listino_generale", () =>
      this.serializeWrite("listini_clienti", () => this.downloadAllPriceLists(onProgress)),
    );
  }

  private async downloadAllPriceLists(
    onProgress?: (prog: SyncProgress) => void
  ): Promise<{ generalCount: number; clientCount: number }> {
    const startedAt = new Date().toISOString();
    const creds = await getSupabaseCredentials();
    await getDatabase();

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
    await applyLocalDatabaseBatch([
      deleteMissingPriceListRows("listino_generale", generalRows, startedAt),
      ...priceListRepository.buildGeneralWrites(generalRows, "cloud"),
      deleteMissingPriceListRows("listini_clienti", clientRows, startedAt),
      ...priceListRepository.buildClientWrites(clientRows, "cloud"),
    ]);

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
  pushGeneralBatchToSupabase(rows: ListinoGeneraleRow[]) {
    return this.serializeWrite("listino_generale", () => this.pushGeneralRows(rows));
  }

  private async pushGeneralRows(
    rows: ListinoGeneraleRow[]
  ): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    if (rows.length === 0) return { success: true, updatedCount: 0 };
    try {
      const creds = await getSupabaseCredentials();
      const genRows = rows.filter((r) => r.source_table !== "listini_vari");
      const varRows = rows.filter((r) => r.source_table === "listini_vari");

      const processBatch = async (
        items: ListinoGeneraleRow[],
        table: "listino_generale" | "listini_vari"
      ) => {
        for (const r of items) {
          const localId = r.id;
          const revision = r.sync_revision;
          const isNew = localId.startsWith("new_");
          const updatedAt = new Date().toISOString();
          const payload = generalPriceListPayload(r, updatedAt);

          if (isNew) {
            const res = await supabaseFetch(`${creds.projectUrl}/rest/v1/${table}?on_conflict=last_write_key`, {
              method: "POST",
              headers: buildAuthHeaders(creds.anonKey, {
                "Content-Type": "application/json",
                Prefer: "resolution=merge-duplicates,return=representation",
              }),
              body: JSON.stringify({ ...payload, last_write_key: localId, created_at: r.created_at || updatedAt }),
            });
            const prefix = table === "listino_generale" ? "gen_" : "var_";
            r.id = await acknowledgePriceListWrite(res, "listino_generale", localId, prefix, revision, updatedAt);
          } else {
            const rawIdStr = r.id.replace(/^(gen_|var_)/, "");
            const numId = parseInt(rawIdStr, 10);
            const targetId = isNaN(numId) ? rawIdStr : numId;

            const res = await supabaseFetch(`${creds.projectUrl}/rest/v1/${table}?id=eq.${targetId}`, {
              method: "PATCH",
              headers: buildAuthHeaders(creds.anonKey, {
                "Content-Type": "application/json",
                Prefer: "return=representation",
              }),
              body: JSON.stringify(payload),
            });
            await acknowledgePriceListWrite(res, "listino_generale", localId, "", revision, updatedAt);
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
   * Sincronizza (upsert) un batch di righe di Listini Clienti su Supabase Cloud.
   */
  pushClientBatchToSupabase(rows: ListinoClienteRow[]) {
    return this.serializeWrite("listini_clienti", () => this.pushClientRows(rows));
  }

  private async pushClientRows(
    rows: ListinoClienteRow[]
  ): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    if (rows.length === 0) return { success: true, updatedCount: 0 };
    try {
      const creds = await getSupabaseCredentials();

      for (const r of rows) {
        const localId = r.id;
        const revision = r.sync_revision;
        const isNew = localId.startsWith("new_");
        const updatedAt = new Date().toISOString();
        const payload = clientPriceListPayload(r, updatedAt);

        if (isNew) {
          const res = await supabaseFetch(`${creds.projectUrl}/rest/v1/listini_clienti?on_conflict=last_write_key`, {
            method: "POST",
            headers: buildAuthHeaders(creds.anonKey, {
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates,return=representation",
            }),
            body: JSON.stringify({ ...payload, last_write_key: localId, created_at: r.created_at || updatedAt }),
          });
          r.id = await acknowledgePriceListWrite(res, "listini_clienti", localId, "cli_", revision, updatedAt);
        } else {
          const rawIdStr = r.id.replace(/^cli_/, "");
          const numId = parseInt(rawIdStr, 10);
          const targetId = isNaN(numId) ? rawIdStr : numId;

          const res = await supabaseFetch(`${creds.projectUrl}/rest/v1/listini_clienti?id=eq.${targetId}`, {
            method: "PATCH",
            headers: buildAuthHeaders(creds.anonKey, {
              "Content-Type": "application/json",
              Prefer: "return=representation",
            }),
            body: JSON.stringify(payload),
          });
          await acknowledgePriceListWrite(res, "listini_clienti", localId, "", revision, updatedAt);
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

  private async applyTrashOperation(scope: PriceListScope, operation: PendingCloudOperation): Promise<void> {
    const creds = await getSupabaseCredentials();
    const expectedProject = normalizeSupabaseProjectUrl(operation.project_url);
    const actualProject = normalizeSupabaseProjectUrl(creds.projectUrl);
    if (!expectedProject || !actualProject || expectedProject !== actualProject) {
      throw new Error("Il progetto Supabase attivo è cambiato durante l'invio dell'operazione in coda.");
    }
    const trashTable = `${scope}_cestino`;
    const url = (table: string) => new URL(`/rest/v1/${table}`, creds.projectUrl);
    const send = async (target: URL, method: string, payload?: unknown) => {
      const response = await supabaseFetch(target, {
        method,
        headers: buildAuthHeaders(creds.anonKey, {
          "Content-Type": "application/json",
          ...(method === "POST" ? { Prefer: "resolution=merge-duplicates,return=representation" } : {}),
        }),
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`${method} ${target.pathname}: HTTP ${response.status}`);
      return response;
    };
    if (operation.action === "trash") {
      const r = JSON.parse(operation.payload) as TrashListinoRow & TrashListinoClienteRow;
      const payload = scope === "listino_generale" ? {
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
      } : {
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
      };
      await send(url(trashTable), "POST", payload);
      const { table, remoteId } = priceListCloudTarget(scope, r);
      const active = url(table);
      active.searchParams.set(remoteId ? "id" : "last_write_key", `eq.${remoteId ?? r.id}`);
      await send(active, "DELETE");
      return;
    }
    if (operation.action === "restore") {
      const row = JSON.parse(operation.payload) as ListinoGeneraleRow | ListinoClienteRow;
      await this.restoreActivePriceListRow(scope, row, creds);
    } else if (operation.action !== "cleanup") {
      throw new Error("Operazione cestino non riconosciuta");
    }
    const target = url(trashTable);
    target.searchParams.set("id", `eq.${operation.record_id}`);
    await send(target, "DELETE");
  }

  private async restoreActivePriceListRow(
    scope: PriceListScope, row: ListinoGeneraleRow | ListinoClienteRow, creds: SupabaseConfig,
  ): Promise<ListinoClienteRow> {
    const { table, remoteId } = priceListCloudTarget(scope, row);
    const updatedAt = new Date().toISOString();
    const payload = scope === "listino_generale"
      ? generalPriceListPayload(row as ListinoGeneraleRow, updatedAt)
      : clientPriceListPayload(row as ListinoClienteRow, updatedAt);
    const url = new URL(`/rest/v1/${table}`, creds.projectUrl);
    url.searchParams.set("on_conflict", remoteId ? "id" : "last_write_key");
    const response = await supabaseFetch(url, {
      method: "POST",
      headers: buildAuthHeaders(creds.anonKey, {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify({
        ...payload, ...(remoteId ? { id: remoteId } : { last_write_key: row.id }),
        created_at: row.created_at || updatedAt,
      }),
    });
    if (!response.ok) throw new Error(`Ripristino listino su Supabase: HTTP ${response.status}`);
    const confirmed = await response.json();
    if (!Array.isArray(confirmed) || confirmed.length !== 1 || confirmed[0]?.id == null ||
        (remoteId && String(confirmed[0].id) !== remoteId)) {
      throw new Error("Supabase non ha confermato la riga ripristinata.");
    }
    return mapSupabaseClientRow(confirmed[0]);
  }

  flushTrash(scope: PriceListScope) {
    return this.serializeWrite(scope, () =>
      flushPendingCloudOperations(scope, (operation) => this.applyTrashOperation(scope, operation)),
    );
  }

  async restoreClientFromTrash(id: string): Promise<ListinoClienteRow | null> {
    const { priceListRepository } = await import("./priceListRepository");
    const restored = await priceListRepository.restoreFromClientTrash(id, async (row) => {
      await this.flushTrash("listini_clienti");
      const db = await getDatabase();
      const pending = await db.select<unknown[]>(
        "SELECT 1 FROM pending_cloud_operations WHERE scope = 'listini_clienti' AND record_id = $1 AND action = 'trash'", [id],
      );
      if (pending.length) throw new Error("Eliminazione cloud del listino ancora in sospeso.");
      return this.restoreActivePriceListRow("listini_clienti", row, await getSupabaseCredentials());
    });
    if (restored) await this.flushTrash("listini_clienti");
    return restored;
  }

  private pendingRetry: Promise<void> | null = null;

  retryPendingChanges(): Promise<void> {
    if (this.pendingRetry) return this.pendingRetry;
    this.pendingRetry = (async () => {
      await Promise.all([this.flushTrash("listino_generale"), this.flushTrash("listini_clienti")]);
      const db = await getDatabase();
      const pending = (table: PriceListScope) => `SELECT * FROM ${table} AS active
        WHERE active.sync_revision IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM pending_cloud_operations AS pending
          WHERE pending.scope = '${table}' AND pending.record_id = active.id
        ) ORDER BY id`;
      const general = await db.select<ListinoGeneraleRow[]>(pending("listino_generale"));
      const clients = await db.select<ListinoClienteRow[]>(pending("listini_clienti"));
      for (const row of general) await this.pushGeneralBatchToSupabase([row]);
      for (const row of clients) await this.pushClientBatchToSupabase([row]);
    })().finally(() => { this.pendingRetry = null; });
    return this.pendingRetry;
  }

  /**
   * Sincronizzazione incrementale veloce da Supabase Cloud per Listino Generale.
   * Scarica solo gli articoli modificati da altri PC successivamente all'ultimo sync locale,
   * aggiorna SQLite e restituisce il numero di righe aggiornate.
   */
  syncIncrementalGeneralFromSupabase() {
    return this.serializeWrite("listino_generale", () => this.downloadIncrementalGeneral());
  }

  private async downloadIncrementalGeneral(): Promise<{
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
          "SELECT MAX(updated_at) as max_up FROM listino_generale WHERE sync_revision IS NULL AND id NOT GLOB 'new_*';"
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
      await priceListRepository.saveGeneralRows(rowsToUpsert, "cloud");

      const updatedRows = await db.select<ListinoGeneraleRow[]>(
        "SELECT * FROM listino_generale WHERE id IN (SELECT value FROM json_each($1))",
        [JSON.stringify(rowsToUpsert.map((row) => row.id))]
      );
      return { updatedCount: updatedRows.length, updatedRows };
    } catch (err: any) {
      console.warn("[PriceListSyncService] Sincronizzazione incrementale non riuscita (modalità offline):", err);
      return { updatedCount: 0, updatedRows: [], error: err?.message || String(err) };
    }
  }

  /**
   * Sincronizzazione incrementale veloce da Supabase Cloud per Listini Clienti.
   */
  syncIncrementalClientiFromSupabase() {
    return this.serializeWrite("listini_clienti", () => this.downloadIncrementalClients());
  }

  private async downloadIncrementalClients(): Promise<{
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
          "SELECT MAX(updated_at) as max_up FROM listini_clienti WHERE sync_revision IS NULL AND id NOT GLOB 'new_*';"
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
      await priceListRepository.saveClientRows(rowsToUpsert, "cloud");

      const updatedRows = await db.select<ListinoClienteRow[]>(
        "SELECT * FROM listini_clienti WHERE id IN (SELECT value FROM json_each($1))",
        [JSON.stringify(rowsToUpsert.map((row) => row.id))]
      );
      return { updatedCount: updatedRows.length, updatedRows };
    } catch (err: any) {
      console.warn("[PriceListSyncService] Sincronizzazione incrementale clienti fallita:", err);
      return { updatedCount: 0, updatedRows: [], error: err?.message || String(err) };
    }
  }
}

export const priceListSyncService = new PriceListSyncService();

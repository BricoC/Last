import { supabaseFetch } from "@/shared/services/supabaseSession";
import { invoke } from "@tauri-apps/api/core";
import { applyLocalDatabaseBatch, type SqliteWrite } from "@/shared/data-layer/localDatabaseBatch";
import { getDatabase } from "@/shared/data-layer/database";
import {
  matchesActiveSupabaseProject,
} from "@/shared/services/supabaseConfigCache";
import {
  CloudHeader,
  CloudLine,
  mapHeaderForLocal,
  mapLineForLocal,
} from "@/features/settings/data-import/ddtReadOnlyPreviewService";
import { DdtFieldConflict, mergeDdtSnapshots } from "./ddtMergeUtils";
import { buildSnapshotFromCloud, buildSnapshotFromLocal } from "./ddtSnapshotBuilders";
import { buildDdtSnapshotWrite, ddtSnapshotSchema, getDdtBaseSnapshot } from "./ddtSnapshotService";
import { buildSupabaseDdtPayloads, type LocalDdtItemRow, type LocalDdtRow } from "./ddtCloudPayload";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
}

export interface DdtPushResult {
  success: boolean;
  docNumber?: number | null;
  merged?: boolean;
  conflicts?: DdtFieldConflict[];
  error?: string;
}

export interface DdtBatchPushResult {
  pushed: number;
  deleted: number;
  errors: number;
}

const DEFAULT_TIMEOUT_MS = 6000;
const RECENT_DELETE_TTL_MS = 30_000;

async function ddtWriteKey(payload: ReturnType<typeof buildSupabaseDdtPayloads>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await supabaseFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

class DdtCloudPushService {
  private activePushPromise: Promise<DdtBatchPushResult> | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private pendingRepush = false;
  private recentlyDeletedIds = new Map<string, number>();

  private serializeWrite<T>(task: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(task, task);
    this.writeQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async getCredentials(): Promise<SupabaseConfig | null> {
    try {
      const status = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
      if (status?.config?.projectUrl && status?.config?.anonKey) {
        return {
          projectUrl: status.config.projectUrl.trim().replace(/\/$/, ""),
          anonKey: status.config.anonKey.trim(),
        };
      }
    } catch (err) {
      console.warn("[DdtPush] Configurazione Supabase non disponibile:", err);
    }
    return null;
  }

  public isRecentlyDeleted(id: string): boolean {
    const ts = this.recentlyDeletedIds.get(id);
    if (!ts) return false;
    if (Date.now() - ts > RECENT_DELETE_TTL_MS) {
      this.recentlyDeletedIds.delete(id);
      return false;
    }
    return true;
  }

  public markRecentlyDeleted(id: string): void {
    this.recentlyDeletedIds.set(id, Date.now());
  }

  /**
   * Restituisce il numero massimo DDT presente su Supabase per l'anno indicato (0 se offline o vuoto)
   */
  public async getRemoteMaxDocNumber(year: number, timeoutMs = 2500): Promise<number> {
    const creds = await this.getCredentials();
    if (!creds) return 0;

    try {
      const url = new URL("/rest/v1/ddt", creds.projectUrl);
      url.searchParams.set("anno", `eq.${year}`);
      url.searchParams.set("select", "numero");
      url.searchParams.set("order", "numero.desc");
      url.searchParams.set("limit", "1");

      const res = await fetchWithTimeout(
        url.toString(),
        {
          headers: { apikey: creds.anonKey },
        },
        timeoutMs
      );
      if (!res.ok) return 0;
      const rows = (await res.json()) as Array<{ numero: number }>;
      const num = Number(rows?.[0]?.numero ?? 0);
      return Number.isFinite(num) && num > 0 ? num : 0;
    } catch {
      return 0;
    }
  }

  private async getCloudOwnerMetaForNumber(
    creds: SupabaseConfig,
    year: number,
    docNumber: number
  ): Promise<{ id: string; ultima_modifica: string | null } | null> {
    const url = new URL("/rest/v1/ddt", creds.projectUrl);
    url.searchParams.set("anno", `eq.${year}`);
    url.searchParams.set("numero", `eq.${docNumber}`);
    url.searchParams.set("select", "id,ultima_modifica");
    url.searchParams.set("limit", "1");

    const res = await fetchWithTimeout(url.toString(), {
      headers: { apikey: creds.anonKey },
    });
    if (!res.ok) {
      throw new Error(`Verifica numero DDT su Supabase fallita (HTTP ${res.status})`);
    }
    const rows = (await res.json()) as Array<{ id: string; ultima_modifica?: string | null }>;
    if (!rows?.[0]?.id) return null;
    return { id: rows[0].id, ultima_modifica: rows[0].ultima_modifica ?? null };
  }

  /**
   * Verifica se un numero DDT è libero, occupato o non verificabile su Supabase
   */
  public async checkNumberAvailabilityOnCloud(
    year: number,
    docNumber: number,
    excludeId?: string
  ): Promise<"available" | "taken" | "unknown"> {
    const creds = await this.getCredentials();
    if (!creds) return "unknown";
    try {
      const owner = await this.getCloudOwnerMetaForNumber(creds, year, docNumber);
      if (owner && owner.id !== excludeId) return "taken";
      return "available";
    } catch {
      return "unknown";
    }
  }

  /**
   * Verifica se un numero DDT è già occupato su Supabase da un documento con ID diverso
   */
  public async isNumberTakenOnCloud(
    year: number,
    docNumber: number,
    excludeId?: string
  ): Promise<boolean> {
    return (await this.checkNumberAvailabilityOnCloud(year, docNumber, excludeId)) === "taken";
  }

  private async fetchRemoteDdtVersion(creds: SupabaseConfig, id: string) {
    const response = await this.ddtRpc(creds, "last_ddt_snapshot", { p_id: id });
    if (!response.ok) throw new Error(`Lettura DDT: HTTP ${response.status}. Verifica la migrazione Supabase DDT.`);
    return await response.json() as {
      revision: string;
      deletedAt: string | null;
      writeKey?: string | null;
      header?: CloudHeader;
      lines?: CloudLine[];
    } | null;
  }

  private async fetchRemoteDdtFull(creds: SupabaseConfig, id: string) {
    const remote = await this.fetchRemoteDdtVersion(creds, id);
    return remote?.header && Array.isArray(remote.lines) ? { header: remote.header, lines: remote.lines } : null;
  }

  private ddtRpc(creds: SupabaseConfig, name: string, payload: unknown) {
    const url = new URL(`/rest/v1/rpc/${name}`, creds.projectUrl);
    return fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: { apikey: creds.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  private async applyMergedSnapshotToLocal(
    doc: LocalDdtRow,
    merged: ReturnType<typeof mergeDdtSnapshots>["merged"],
    totalTaxableSubunits: number,
    totalVatSubunits: number,
    totalDocumentSubunits: number,
    updatedAt: string,
    syncStatus: "pending" | "synced",
    snapshotWrite?: SqliteWrite
  ): Promise<{ updatedDoc: LocalDdtRow; updatedItems: LocalDdtItemRow[] }> {
    const db = await getDatabase();
    const h = merged.header;
    const docId = doc.id;

    const writes: SqliteWrite[] = [{
      sql: `UPDATE ddt_documents SET
        doc_date = $1, client_name = $2, client_address = $3, client_city = $4,
        client_vat = $5, client_fiscal_code = $6, client_sdi = $7,
        destination_name = $8, destination_city = $9, transport_reason = $10,
        payment_method = $11, order_reference = $12, operator = $13,
        goods_appearance = $14, carriage_terms = $15, packages_count = $16,
        weight_kg = $17, carrier = $18, internal_notes = $19,
        total_taxable_subunits = $20, total_vat_subunits = $21, total_document_subunits = $22,
        updated_at = $23, sync_status = $24
       WHERE id = $25 AND updated_at IS $26 AND deleted_at IS NULL AND sync_status IS $27`,
      params: [
        h.doc_date,
        h.client_name,
        h.client_address,
        h.client_city,
        h.client_vat,
        h.client_fiscal_code,
        h.client_sdi,
        h.destination_name,
        h.destination_city,
        h.transport_reason,
        h.payment_method,
        h.order_reference,
        h.operator,
        h.goods_appearance,
        h.carriage_terms,
        h.packages_count,
        h.weight_kg,
        h.carrier,
        h.internal_notes,
        totalTaxableSubunits,
        totalVatSubunits,
        totalDocumentSubunits,
        updatedAt,
        syncStatus,
        docId, doc.updated_at, doc.sync_status,
      ],
      expectedRows: 1,
    }];

    writes.push({
      sql: `UPDATE ddt_items SET deleted_at = $1, updated_at = $1, sync_status = $2
            WHERE ddt_id = $3 AND deleted_at IS NULL AND id NOT IN (SELECT value FROM json_each($4))`,
      params: [updatedAt, syncStatus, docId, JSON.stringify(merged.items.map((item) => item.id))],
    });

    for (const it of merged.items) {
      writes.push({
        sql: `INSERT INTO ddt_items (
          id, ddt_id, row_index, code, description, row_kind, unit, quantity,
          unit_price_subunits, discount_pct, net_amount_subunits, vat_rate,
          vat_amount_subunits, purchase_price_subunits, created_at, updated_at,
          updated_by, deleted_at, sync_status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,'sync_merge',NULL,$16)
        ON CONFLICT(id) DO UPDATE SET
          row_index = excluded.row_index, code = excluded.code, description = excluded.description,
          row_kind = excluded.row_kind, unit = excluded.unit, quantity = excluded.quantity,
          unit_price_subunits = excluded.unit_price_subunits, discount_pct = excluded.discount_pct,
          net_amount_subunits = excluded.net_amount_subunits, vat_rate = excluded.vat_rate,
          vat_amount_subunits = excluded.vat_amount_subunits,
          purchase_price_subunits = excluded.purchase_price_subunits,
          updated_at = excluded.updated_at, deleted_at = NULL, sync_status = excluded.sync_status
        WHERE ddt_items.ddt_id = excluded.ddt_id`,
        params: [
          it.id,
          docId,
          it.row_index,
          it.code,
          it.description,
          it.row_kind,
          it.unit,
          it.quantity,
          it.unit_price_subunits,
          it.discount_pct,
          it.net_amount_subunits,
          it.vat_rate,
          it.vat_amount_subunits,
          it.purchase_price_subunits,
          updatedAt,
          syncStatus,
        ],
        expectedRows: 1,
      });
    }

    if (snapshotWrite) writes.push({ sql: ddtSnapshotSchema, params: [] }, snapshotWrite);
    await applyLocalDatabaseBatch(writes);
    const updatedDocs = await db.select<LocalDdtRow[]>(
      `SELECT * FROM ddt_documents WHERE id = $1 LIMIT 1`,
      [docId]
    );
    const updatedItems = await db.select<LocalDdtItemRow[]>(
      `SELECT * FROM ddt_items WHERE ddt_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC`,
      [docId]
    );

    return { updatedDoc: updatedDocs[0], updatedItems };
  }

  private async computeNextAvailableNumber(year: number): Promise<number> {
    const db = await getDatabase();
    const localRows = await db.select<{ max_num: number }[]>(
      `SELECT COALESCE(MAX(doc_number), 0) as max_num
       FROM ddt_documents
       WHERE year = $1 AND deleted_at IS NULL`,
      [year]
    );
    const localMax = Number(localRows?.[0]?.max_num ?? 0);
    const remoteMax = await this.getRemoteMaxDocNumber(year);
    return Math.max(localMax, remoteMax) + 1;
  }

  private async upsertSingleDdt(
    creds: SupabaseConfig,
    doc: LocalDdtRow,
    reassignNumberOnConflict: boolean,
    forceOverwrite = false
  ): Promise<DdtPushResult> {
    if (doc.deleted_at || doc.status === "bozza" || doc.doc_number === null) {
      return { success: true, docNumber: doc.doc_number };
    }

    const db = await getDatabase();
    let items = await db.select<LocalDdtItemRow[]>(
      `SELECT * FROM ddt_items WHERE ddt_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC`,
      [doc.id]
    );

    let currentDoc = { ...doc };
    let wasAutoMerged = false;
    let saved = false;
    let savedRemoteModified: string | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const remoteMeta = await this.getCloudOwnerMetaForNumber(
        creds,
        currentDoc.year,
        currentDoc.doc_number!
      );

      if (remoteMeta && remoteMeta.id !== currentDoc.id) {
        if (!reassignNumberOnConflict) {
          if (typeof window !== "undefined") {
            const remoteFull = await this.fetchRemoteDdtFull(creds, remoteMeta.id).catch(() => null);
            if (remoteFull) {
              const remoteTotalSubunits = Math.round(
                (Number(remoteFull.header.totale_documento) || 0) * 100000
              );
              window.dispatchEvent(
                new CustomEvent("ddt-conflict-detected", {
                  detail: {
                    year: currentDoc.year,
                    docNumber: currentDoc.doc_number!,
                    localDoc: {
                      id: currentDoc.id,
                      client_name: currentDoc.client_name,
                      doc_date: currentDoc.doc_date,
                      total_document_subunits: currentDoc.total_document_subunits,
                      status: currentDoc.status,
                    },
                    incomingDoc: {
                      id: remoteFull.header.id,
                      client_name: remoteFull.header.cliente || "",
                      doc_date: remoteFull.header.data || "",
                      total_document_subunits: remoteTotalSubunits,
                      items_count: remoteFull.lines.length,
                      source: "Gestionale / Cloud Supabase",
                      rawHeader: mapHeaderForLocal(remoteFull.header),
                      rawLines: remoteFull.lines.map((l, idx) =>
                        mapLineForLocal(l, remoteFull.header.id, idx + 1)
                      ),
                    },
                  },
                })
              );
            }
          }
          return {
            success: false,
            docNumber: currentDoc.doc_number,
            error: `Numero DDT ${currentDoc.doc_number}/${currentDoc.year} già occupato su Supabase da un altro documento`,
          };
        }
        const nextNumber = await this.computeNextAvailableNumber(currentDoc.year);
        await applyLocalDatabaseBatch([{
          sql: "UPDATE ddt_documents SET doc_number = $1 WHERE id = $2 AND updated_at = $3 AND deleted_at IS NULL",
          params: [nextNumber, currentDoc.id, currentDoc.updated_at], expectedRows: 1,
        }]);
        currentDoc = { ...currentDoc, doc_number: nextNumber };
      }

      const remote = await this.fetchRemoteDdtVersion(creds, currentDoc.id);
      const localVersion = await db.select<{ updated_at: string; deleted_at: string | null }[]>(
        "SELECT updated_at, deleted_at FROM ddt_documents WHERE id = $1", [currentDoc.id],
      );
      if (localVersion[0]?.updated_at !== currentDoc.updated_at || localVersion[0].deleted_at) {
        return { success: false, docNumber: currentDoc.doc_number, error: "Il DDT è stato modificato durante l’invio" };
      }
      if (remote?.deletedAt && !currentDoc.cloud_restore_requested) {
        return { success: false, docNumber: currentDoc.doc_number, error: "DDT eliminato sul cloud. Ripristinalo esplicitamente per riattivarlo." };
      }
      const originalPayload = buildSupabaseDdtPayloads(currentDoc, items);
      const originalKey = await ddtWriteKey(originalPayload);
      if (remote?.writeKey === originalKey && remote.header?.ultima_modifica) {
        savedRemoteModified = remote.header.ultima_modifica;
        saved = true;
        break;
      }
      if (remote?.header && Array.isArray(remote.lines) && !forceOverwrite) {
        const baseSnap = await getDdtBaseSnapshot(currentDoc.id);
        const localSnap = buildSnapshotFromLocal(currentDoc, items);
        const remoteSnap = buildSnapshotFromCloud(remote.header, remote.lines);
        if (!baseSnap && JSON.stringify(localSnap) !== JSON.stringify(remoteSnap)) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("ddt-merge-conflict", {
              detail: { docId: currentDoc.id, year: currentDoc.year, docNumber: currentDoc.doc_number, conflicts: [], missingBaseSnapshot: true },
            }));
          }
          return { success: false, docNumber: currentDoc.doc_number, error: "Versione di base DDT assente. Scegli la versione da mantenere." };
        }
        if (baseSnap && (baseSnap.remoteUltimaModifica !== remote.header.ultima_modifica ||
             JSON.stringify(baseSnap.snapshot) !== JSON.stringify(remoteSnap))) {
            const delRows = await db.select<{ id: string }[]>(
              `SELECT id FROM ddt_items WHERE ddt_id = $1 AND deleted_at IS NOT NULL AND sync_status = 'pending'`,
              [currentDoc.id]
            );
            const localDeletedIds = new Set(delRows.map((r) => r.id));
            const mergeResult = mergeDdtSnapshots(
              baseSnap.snapshot,
              localSnap,
              localDeletedIds,
              remoteSnap
            );

            if (mergeResult.conflicts.length > 0) {
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("ddt-merge-conflict", {
                    detail: {
                      docId: currentDoc.id,
                      year: currentDoc.year,
                      docNumber: currentDoc.doc_number,
                      conflicts: mergeResult.conflicts,
                    },
                  })
                );
              }
              return {
                success: false,
                docNumber: currentDoc.doc_number,
                conflicts: mergeResult.conflicts,
                error: `Conflitto di modifica sul DDT ${currentDoc.doc_number}/${currentDoc.year}: scegli quale modifica mantenere`,
              };
            }

            if (mergeResult.autoMergedChanges > 0) {
              const mergeTs = new Date().toISOString();
              const applied = await this.applyMergedSnapshotToLocal(
                currentDoc,
                mergeResult.merged,
                mergeResult.totalTaxableSubunits,
                mergeResult.totalVatSubunits,
                mergeResult.totalDocumentSubunits,
                mergeTs,
                "pending"
              );
              if (applied.updatedDoc?.updated_at !== mergeTs) {
                return { success: false, error: "Il DDT è stato modificato durante l’unione" };
              }
              currentDoc = applied.updatedDoc;
              items = applied.updatedItems;
              wasAutoMerged = true;
            }
        }
      }

      const payload = wasAutoMerged ? buildSupabaseDdtPayloads(currentDoc, items) : originalPayload;
      const response = await this.ddtRpc(creds, "last_write_ddt", {
        p_header: payload.headerPayload,
        p_lines: payload.linePayloads,
        p_expected_revision: remote?.revision ?? null,
        p_restore: Boolean(currentDoc.cloud_restore_requested),
        p_write_key: wasAutoMerged ? await ddtWriteKey(payload) : originalKey,
      });
      if (response.ok) {
        const confirmation = await response.json() as { updatedAt?: string; revision?: string };
        if (!confirmation.updatedAt || !confirmation.revision) throw new Error("Supabase non ha confermato la versione del DDT");
        savedRemoteModified = confirmation.updatedAt;
        saved = true;
        break;
      }
      const error = await response.json().catch(() => ({})) as { code?: string; message?: string };
      if (error.code === "23505" && reassignNumberOnConflict && attempt < 2) {
        const number = await this.computeNextAvailableNumber(currentDoc.year);
        await applyLocalDatabaseBatch([{
          sql: "UPDATE ddt_documents SET doc_number = $1 WHERE id = $2 AND updated_at = $3 AND deleted_at IS NULL",
          params: [number, currentDoc.id, currentDoc.updated_at], expectedRows: 1,
        }]);
        currentDoc = { ...currentDoc, doc_number: number };
        continue;
      }
      return {
        success: false, docNumber: currentDoc.doc_number,
        error: `Errore push DDT: ${error.message || response.status}`,
      };
    }
    if (!saved) return { success: false, docNumber: currentDoc.doc_number, error: "Numero DDT non disponibile" };

    await applyLocalDatabaseBatch([
      { sql: ddtSnapshotSchema, params: [] },
      buildDdtSnapshotWrite(currentDoc.id, savedRemoteModified, buildSnapshotFromLocal(currentDoc, items)),
      {
        sql: `UPDATE ddt_items SET sync_status = 'synced' WHERE ddt_id = $1 AND EXISTS (
          SELECT 1 FROM ddt_documents WHERE id=$1 AND updated_at=$2 AND doc_number IS $3 AND deleted_at IS NULL AND project_url IS $4)`,
        params: [currentDoc.id, currentDoc.updated_at, currentDoc.doc_number, currentDoc.project_url ?? null],
      },
      {
        sql: `UPDATE ddt_documents SET sync_status='synced', cloud_restore_requested=0
          WHERE id=$1 AND updated_at=$2 AND doc_number IS $3 AND deleted_at IS NULL AND project_url IS $4`,
        params: [currentDoc.id, currentDoc.updated_at, currentDoc.doc_number, currentDoc.project_url ?? null],
      },
    ]);

    if (wasAutoMerged && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("ddt-data-merged", { detail: { docId: currentDoc.id } })
      );
    }

    return {
      success: true,
      docNumber: currentDoc.doc_number,
      ...(wasAutoMerged ? { merged: true } : {}),
    };
  }

  public resolveMergeConflict(
    docId: string,
    resolution: "keep-local" | "use-remote"
  ): Promise<DdtPushResult> {
    return this.serializeWrite(() => this.resolveMergeConflictInternal(docId, resolution));
  }

  private async resolveMergeConflictInternal(
    docId: string,
    resolution: "keep-local" | "use-remote"
  ): Promise<DdtPushResult> {
    const creds = await this.getCredentials();
    if (!creds) return { success: false, error: "Configurazione Supabase non disponibile" };

    const db = await getDatabase();
    const docs = await db.select<LocalDdtRow[]>(
      `SELECT * FROM ddt_documents WHERE id = $1 LIMIT 1`,
      [docId]
    );
    if (!docs[0]) return { success: false, error: "DDT non trovato" };
    if (docs[0].project_url && !matchesActiveSupabaseProject(docs[0].project_url, creds.projectUrl)) {
      return {
        success: false,
        docNumber: docs[0].doc_number,
        error: "DDT privo di progetto Supabase verificabile o appartenente a un altro progetto",
      };
    }

    if (resolution === "keep-local") {
      const res = await this.upsertSingleDdt(creds, docs[0], false, true);
      if (res.success && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ddt-data-updated"));
      }
      return res;
    }

    const remoteFull = await this.fetchRemoteDdtFull(creds, docId);
    if (!remoteFull) return { success: false, error: "Impossibile scaricare la versione dal Cloud" };
    const remoteSnap = buildSnapshotFromCloud(remoteFull.header, remoteFull.lines);
    let taxSub = 0;
    let vatSub = 0;
    for (const it of remoteSnap.items) {
      taxSub += it.net_amount_subunits;
      vatSub += it.vat_amount_subunits;
    }
    const ts = remoteFull.header.ultima_modifica || new Date().toISOString();
    await this.applyMergedSnapshotToLocal(docs[0], remoteSnap, taxSub, vatSub, taxSub + vatSub, ts, "synced",
      buildDdtSnapshotWrite(docId, ts, remoteSnap));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ddt-data-updated"));
    }
    return { success: true, docNumber: remoteSnap.header.doc_number };
  }

  public deleteRemoteDdt(id: string, knownProjectUrl?: string | null): Promise<boolean> {
    return this.serializeWrite(() => this.deleteRemoteDdtInternal(id, knownProjectUrl));
  }

  private async deleteRemoteDdtInternal(id: string, knownProjectUrl?: string | null): Promise<boolean> {
    this.markRecentlyDeleted(id);
    const creds = await this.getCredentials();
    if (!creds) return false;

    try {
      const db = await getDatabase();
      let docProjectUrl = knownProjectUrl;
      if (docProjectUrl === undefined) {
        const localRow = await db.select<{ project_url?: string | null }[]>(
          `SELECT project_url FROM ddt_documents WHERE id = $1 LIMIT 1`,
          [id]
        );
        docProjectUrl = localRow[0]?.project_url ?? null;
      }
      if (docProjectUrl && !matchesActiveSupabaseProject(docProjectUrl, creds.projectUrl)) {
        return false;
      }
      const [before] = await db.select<{ updated_at: string; deleted_at: string | null }[]>(
        "SELECT updated_at, deleted_at FROM ddt_documents WHERE id=$1", [id],
      );
      if (before && !before.deleted_at) return false;
      const remote = await this.fetchRemoteDdtVersion(creds, id);
      const [current] = await db.select<{ updated_at: string; deleted_at: string | null }[]>(
        "SELECT updated_at, deleted_at FROM ddt_documents WHERE id=$1", [id],
      );
      if (current?.updated_at !== before?.updated_at || current?.deleted_at !== before?.deleted_at) return false;
      const response = await this.ddtRpc(creds, "last_delete_ddt", {
        p_id: id, p_expected_revision: remote?.revision ?? null,
      });
      if (!response.ok) return false;
      if (before) await applyLocalDatabaseBatch([
        {
          sql: `UPDATE ddt_items SET sync_status='synced' WHERE ddt_id=$1 AND EXISTS (
            SELECT 1 FROM ddt_documents WHERE id=$1 AND updated_at=$2 AND deleted_at=$3)`,
          params: [id, before.updated_at, before.deleted_at],
        },
        {
          sql: "UPDATE ddt_documents SET sync_status='synced' WHERE id=$1 AND updated_at=$2 AND deleted_at=$3",
          params: [id, before.updated_at, before.deleted_at],
        },
      ]);
      return true;
    } catch (err) {
      console.warn("[DdtPush] Impossibile eliminare DDT remoto su Supabase (verrà ritentato):", err);
      return false;
    }
  }

  public pushDdtById(
    id: string,
    options?: { reassignNumberOnConflict?: boolean }
  ): Promise<DdtPushResult> {
    return this.serializeWrite(() => this.pushDdtByIdInternal(id, options));
  }

  private async pushDdtByIdInternal(
    id: string,
    options?: { reassignNumberOnConflict?: boolean }
  ): Promise<DdtPushResult> {
    const creds = await this.getCredentials();
    if (!creds) {
      return { success: false, error: "Configurazione Supabase non disponibile" };
    }

    try {
      const db = await getDatabase();
      const docs = await db.select<LocalDdtRow[]>(
        `SELECT * FROM ddt_documents WHERE id = $1 LIMIT 1`,
        [id]
      );
      if (docs.length === 0) return { success: false, error: "DDT non trovato" };

      const doc = docs[0];
      if (doc.project_url && !matchesActiveSupabaseProject(doc.project_url, creds.projectUrl)) {
        return { success: false, docNumber: doc.doc_number, error: "DDT privo di progetto Supabase verificabile o appartenente a un altro progetto" };
      }
      if (doc.deleted_at) {
        if (doc.doc_number !== null && doc.status !== "bozza") {
          const ok = await this.deleteRemoteDdtInternal(doc.id, doc.project_url ?? null);
          return { success: ok, docNumber: doc.doc_number };
        }
        return { success: true, docNumber: doc.doc_number };
      }

      const result = await this.upsertSingleDdt(
        creds,
        doc,
        Boolean(options?.reassignNumberOnConflict)
      );

      if (result.success && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ddt-data-updated"));
        window.dispatchEvent(new CustomEvent("cloud-sync-status-updated"));
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[DdtPush] Push singolo DDT non riuscito (rimane in coda pending):", msg);
      return { success: false, error: msg };
    }
  }

  public async pushPendingDdts(): Promise<DdtBatchPushResult> {
    if (this.activePushPromise) {
      this.pendingRepush = true;
      return this.activePushPromise;
    }

    this.activePushPromise = (async () => {
      let totalPushed = 0;
      let totalDeleted = 0;
      let totalErrors = 0;

      do {
        this.pendingRepush = false;
        const batch = await this.serializeWrite(() => this.executeSingleBatchPush());
        totalPushed += batch.pushed;
        totalDeleted += batch.deleted;
        totalErrors += batch.errors;
      } while (this.pendingRepush);

      if ((totalPushed > 0 || totalDeleted > 0) && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ddt-data-updated"));
        window.dispatchEvent(new CustomEvent("cloud-sync-status-updated"));
      }

      return { pushed: totalPushed, deleted: totalDeleted, errors: totalErrors };
    })().finally(() => {
      this.activePushPromise = null;
    });

    return this.activePushPromise;
  }

  private async executeSingleBatchPush(): Promise<DdtBatchPushResult> {
    const creds = await this.getCredentials();
    if (!creds) return { pushed: 0, deleted: 0, errors: 0 };

    let pushed = 0;
    let deleted = 0;
    let errors = 0;

    try {
      const db = await getDatabase();
      const pendingDocs = await db.select<LocalDdtRow[]>(
        `SELECT * FROM ddt_documents
         WHERE sync_status = 'pending'
           AND doc_number IS NOT NULL
           AND status <> 'bozza'
         ORDER BY year ASC, doc_number ASC`
      );

      for (const doc of pendingDocs) {
        if (doc.project_url && !matchesActiveSupabaseProject(doc.project_url, creds.projectUrl)) {
          continue;
        }
        if (doc.deleted_at) {
          const ok = await this.deleteRemoteDdtInternal(doc.id, doc.project_url ?? null);
          if (ok) deleted++;
          else errors++;
        } else {
          const res = await this.upsertSingleDdt(creds, doc, false);
          if (res.success) pushed++;
          else {
            console.warn(`[DdtPush] Push fallito per DDT ${doc.doc_number}/${doc.year}:`, res.error);
            errors++;
          }
        }
      }
    } catch (err) {
      console.warn("[DdtPush] Errore batch push DDT:", err);
      errors++;
    }

    return { pushed, deleted, errors };
  }
}

export const ddtCloudPushService = new DdtCloudPushService();

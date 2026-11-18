import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import {
  CloudHeader,
  CloudLine,
  HEADER_FIELDS,
  LINE_FIELDS,
  mapHeaderForLocal,
  mapLineForLocal,
} from "@/features/settings/data-import/ddtReadOnlyPreviewService";
import {
  buildSnapshotFromCloud,
  buildSnapshotFromLocal,
  DdtFieldConflict,
  mergeDdtSnapshots,
} from "./ddtMergeUtils";
import { getDdtBaseSnapshot, saveDdtBaseSnapshot } from "./ddtSnapshotService";
import { parseCascadeDiscounts } from "../utils/ddtCalculations";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
}

interface LocalDdtRow {
  id: string;
  doc_number: number | null;
  year: number;
  series: string;
  doc_date: string;
  status: string;
  client_name: string;
  client_address: string | null;
  client_city: string | null;
  client_vat: string | null;
  client_fiscal_code: string | null;
  client_sdi: string | null;
  client_phones_json: string | null;
  destination_name: string | null;
  destination_city: string | null;
  transport_reason: string | null;
  payment_method: string | null;
  order_reference: string | null;
  operator: string | null;
  goods_appearance: string | null;
  carriage_terms: string | null;
  packages_count: string | null;
  weight_kg: string | null;
  carrier: string | null;
  internal_notes: string | null;
  total_taxable_subunits: number;
  total_vat_subunits: number;
  total_document_subunits: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: string;
}

interface LocalDdtItemRow {
  id: string;
  ddt_id: string;
  row_index: number;
  code: string | null;
  description: string;
  row_kind: string | null;
  unit: string | null;
  quantity: string | null;
  unit_price_subunits: number;
  discount_pct: string | null;
  net_amount_subunits: number;
  vat_rate: number;
  purchase_price_subunits: number;
  deleted_at: string | null;
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

function parseNumericString(value: string | number | null | undefined, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (value === null || value === undefined) return fallback;
  const parsed = parseFloat(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round5(value: number): number {
  return Math.round(value * 100000) / 100000;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function buildSupabaseDdtPayloads(doc: LocalDdtRow, items: LocalDdtItemRow[]) {
  let phones: unknown[] = [];
  try {
    if (doc.client_phones_json) {
      const parsed = JSON.parse(doc.client_phones_json);
      if (Array.isArray(parsed)) phones = parsed;
    }
  } catch {
    phones = [];
  }

  const activeItems = items.filter((it) => !it.deleted_at);
  let totalPurchaseCost = 0;
  let totalDiscount = 0;

  const linePayloads = activeItems.map((it) => {
    const isNote =
      it.row_kind === "note" ||
      (Boolean(it.description?.trim()) &&
        (it.unit_price_subunits ?? 0) === 0 &&
        (it.net_amount_subunits ?? 0) === 0 &&
        (it.purchase_price_subunits ?? 0) === 0 &&
        (!it.code || !String(it.code).trim()));

    const qty = isNote ? 0 : parseNumericString(it.quantity, 1);
    const unitPrice = isNote ? 0 : (it.unit_price_subunits || 0) / 100000;
    const cascadeDiscounts = isNote ? [] : parseCascadeDiscounts(it.discount_pct);
    const discountFactor = cascadeDiscounts.reduce((acc, pct) => acc * (1 - pct / 100), 1);
    const discountDecimal = round5(1 - discountFactor);
    const netAmount = isNote ? 0 : (it.net_amount_subunits || 0) / 100000;
    const purchaseUnit = isNote ? 0 : (it.purchase_price_subunits || 0) / 100000;
    const discountedUnit = !isNote && qty > 0 ? round5(netAmount / qty) : 0;
    const lineCost = isNote ? 0 : purchaseUnit * qty;
    const lineProfit = isNote ? 0 : round5(netAmount - lineCost);

    if (!isNote) {
      totalPurchaseCost += lineCost;
      totalDiscount += Math.max(0, unitPrice * qty - netAmount);
    }

    return {
      id: it.id,
      ddt_id: doc.id,
      riga_nr: it.row_index,
      um: isNote ? "" : it.unit || "NR",
      quantita: qty,
      descrizione: it.description || "",
      prezzo: round5(unitPrice),
      sconto_pct: discountDecimal,
      importo: round5(netAmount),
      iva_pct: isNote ? 0 : Math.round(Number(it.vat_rate || 0)),
      prezzo_acquisto: round5(purchaseUnit),
      prezzo_scontato: discountedUnit,
      ricavo: lineProfit,
      anno: doc.year,
      numero_ddt: doc.doc_number,
    };
  });

  const taxable = (doc.total_taxable_subunits || 0) / 100000;
  const vat = (doc.total_vat_subunits || 0) / 100000;
  const totalDoc = (doc.total_document_subunits || 0) / 100000;
  const roundedCost = round5(totalPurchaseCost);
  const profit = round5(taxable - roundedCost);
  const markup = roundedCost > 0 ? round5(profit / roundedCost) : 0;

  const headerPayload = {
    id: doc.id,
    numero: doc.doc_number,
    anno: doc.year,
    data: doc.doc_date,
    cliente: doc.client_name,
    indirizzo: doc.client_address || "",
    citta: doc.client_city || "",
    pagamento: doc.payment_method || "",
    destinazione: doc.destination_name || "",
    citta_dest: doc.destination_city || "",
    nr_vs_ordine: doc.order_reference || "",
    causale: doc.transport_reason || "Vendita",
    porto: doc.carriage_terms || "",
    aspetto: doc.goods_appearance || "",
    colli: doc.packages_count || "",
    peso_kg: parseNumericString(doc.weight_kg, 0),
    vettore: doc.carrier || "",
    operatore: doc.operator || "",
    note: doc.internal_notes || "",
    totale_imponibile: round5(taxable),
    totale_iva: round5(vat),
    totale_documento: round5(totalDoc),
    stato: doc.status,
    created_at: doc.created_at,
    ultima_modifica: doc.updated_at,
    piva: doc.client_vat || "",
    cod_fiscale: doc.client_fiscal_code || "",
    sdi: doc.client_sdi || "",
    telefoni: phones,
    prezzo_acquisto_totale: roundedCost,
    ricavo: profit,
    ricarico_totale: markup,
    sconto_totale: round5(totalDiscount),
  };

  return { headerPayload, linePayloads };
}

class DdtCloudPushService {
  private activePushPromise: Promise<DdtBatchPushResult> | null = null;
  private pendingRepush = false;
  private recentlyDeletedIds = new Map<string, number>();

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
          headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
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
      headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id: string; ultima_modifica?: string | null }>;
    if (!rows?.[0]?.id) return null;
    return { id: rows[0].id, ultima_modifica: rows[0].ultima_modifica ?? null };
  }

  /**
   * Verifica se un numero DDT è già occupato su Supabase da un documento con ID diverso
   */
  public async isNumberTakenOnCloud(
    year: number,
    docNumber: number,
    excludeId?: string
  ): Promise<boolean> {
    const creds = await this.getCredentials();
    if (!creds) return false;
    try {
      const owner = await this.getCloudOwnerMetaForNumber(creds, year, docNumber);
      return Boolean(owner && owner.id !== excludeId);
    } catch {
      return false;
    }
  }

  private async fetchRemoteDdtFull(
    creds: SupabaseConfig,
    ddtId: string
  ): Promise<{ header: CloudHeader; lines: CloudLine[] } | null> {
    const hUrl = new URL("/rest/v1/ddt", creds.projectUrl);
    hUrl.searchParams.set("id", `eq.${ddtId}`);
    hUrl.searchParams.set("select", HEADER_FIELDS);
    hUrl.searchParams.set("limit", "1");

    const lUrl = new URL("/rest/v1/ddt_righe", creds.projectUrl);
    lUrl.searchParams.set("ddt_id", `eq.${ddtId}`);
    lUrl.searchParams.set("select", LINE_FIELDS);
    lUrl.searchParams.set("order", "riga_nr.asc");

    const [hRes, lRes] = await Promise.all([
      fetchWithTimeout(hUrl.toString(), {
        headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
      }),
      fetchWithTimeout(lUrl.toString(), {
        headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
      }),
    ]);

    if (!hRes.ok || !lRes.ok) return null;
    const headers = (await hRes.json()) as CloudHeader[];
    if (!headers?.[0]) return null;
    const lines = (await lRes.json()) as CloudLine[];
    return { header: headers[0], lines };
  }

  private async applyMergedSnapshotToLocal(
    docId: string,
    merged: ReturnType<typeof mergeDdtSnapshots>["merged"],
    totalTaxableSubunits: number,
    totalVatSubunits: number,
    totalDocumentSubunits: number,
    updatedAt: string,
    syncStatus: "pending" | "synced"
  ): Promise<{ updatedDoc: LocalDdtRow; updatedItems: LocalDdtItemRow[] }> {
    const db = await getDatabase();
    const h = merged.header;

    await db.execute(
      `UPDATE ddt_documents SET
        doc_date = $1, client_name = $2, client_address = $3, client_city = $4,
        client_vat = $5, client_fiscal_code = $6, client_sdi = $7,
        destination_name = $8, destination_city = $9, transport_reason = $10,
        payment_method = $11, order_reference = $12, operator = $13,
        goods_appearance = $14, carriage_terms = $15, packages_count = $16,
        weight_kg = $17, carrier = $18, internal_notes = $19,
        total_taxable_subunits = $20, total_vat_subunits = $21, total_document_subunits = $22,
        updated_at = $23, sync_status = $24
       WHERE id = $25`,
      [
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
        docId,
      ]
    );

    const keepIds = new Set(merged.items.map((it) => it.id));
    const existingRows = await db.select<{ id: string }[]>(
      `SELECT id FROM ddt_items WHERE ddt_id = $1 AND deleted_at IS NULL`,
      [docId]
    );
    for (const row of existingRows) {
      if (!keepIds.has(row.id)) {
        await db.execute(
          `UPDATE ddt_items SET deleted_at = $1, updated_at = $1, sync_status = $2 WHERE id = $3`,
          [updatedAt, syncStatus, row.id]
        );
      }
    }

    for (const it of merged.items) {
      await db.execute(
        `INSERT INTO ddt_items (
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
          updated_at = excluded.updated_at, deleted_at = NULL, sync_status = excluded.sync_status`,
        [
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
        ]
      );
    }

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
    let pushedHeader = false;
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
        await db.execute(`UPDATE ddt_documents SET doc_number = $1 WHERE id = $2`, [
          nextNumber,
          currentDoc.id,
        ]);
        currentDoc = { ...currentDoc, doc_number: nextNumber };
      }

      // 3-Way Merge intelligente se un altro PC ha aggiornato questo stesso DDT su Supabase
      if (!forceOverwrite && remoteMeta && remoteMeta.id === currentDoc.id) {
        const baseSnap = await getDdtBaseSnapshot(currentDoc.id);
        if (
          baseSnap?.remoteUltimaModifica &&
          remoteMeta.ultima_modifica &&
          baseSnap.remoteUltimaModifica !== remoteMeta.ultima_modifica
        ) {
          const remoteFull = await this.fetchRemoteDdtFull(creds, currentDoc.id);
          if (remoteFull) {
            const localSnap = buildSnapshotFromLocal(currentDoc, items);
            const remoteSnap = buildSnapshotFromCloud(remoteFull.header, remoteFull.lines);
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
                currentDoc.id,
                mergeResult.merged,
                mergeResult.totalTaxableSubunits,
                mergeResult.totalVatSubunits,
                mergeResult.totalDocumentSubunits,
                mergeTs,
                "pending"
              );
              currentDoc = applied.updatedDoc;
              items = applied.updatedItems;
              wasAutoMerged = true;
            }
          }
        }
      }

      const { headerPayload } = buildSupabaseDdtPayloads(currentDoc, items);
      const headerUrl = new URL("/rest/v1/ddt?on_conflict=id", creds.projectUrl);
      const headerRes = await fetchWithTimeout(headerUrl.toString(), {
        method: "POST",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation,resolution=merge-duplicates",
        },
        body: JSON.stringify([headerPayload]),
      });

      if (headerRes.ok) {
        const repRows = (await headerRes.json().catch(() => [])) as Array<{
          ultima_modifica?: string | null;
        }>;
        savedRemoteModified = repRows?.[0]?.ultima_modifica ?? currentDoc.updated_at;
        pushedHeader = true;
        break;
      }

      if (headerRes.status === 409 && reassignNumberOnConflict && attempt < 2) {
        const nextNumber = await this.computeNextAvailableNumber(currentDoc.year);
        await db.execute(`UPDATE ddt_documents SET doc_number = $1 WHERE id = $2`, [
          nextNumber,
          currentDoc.id,
        ]);
        currentDoc = { ...currentDoc, doc_number: nextNumber };
        continue;
      }

      const errBody = (await headerRes.json().catch(() => ({}))) as { message?: string };
      return {
        success: false,
        docNumber: currentDoc.doc_number,
        error: `Errore push testata DDT: ${errBody?.message || headerRes.statusText || headerRes.status}`,
      };
    }

    if (!pushedHeader) {
      return {
        success: false,
        docNumber: currentDoc.doc_number,
        error: "Impossibile assegnare un numero univoco su Supabase dopo 3 tentativi",
      };
    }

    // Upsert righe PRIMA di eliminare le righe rimosse: evita DDT a 0 righe su Supabase se cade la rete a metà
    const { linePayloads } = buildSupabaseDdtPayloads(currentDoc, items);
    if (linePayloads.length > 0) {
      const linesUrl = new URL("/rest/v1/ddt_righe?on_conflict=id", creds.projectUrl);
      const linesRes = await fetchWithTimeout(linesUrl.toString(), {
        method: "POST",
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal,resolution=merge-duplicates",
        },
        body: JSON.stringify(linePayloads),
      });

      if (!linesRes.ok) {
        const errBody = (await linesRes.json().catch(() => ({}))) as { message?: string };
        return {
          success: false,
          docNumber: currentDoc.doc_number,
          error: `Errore push righe DDT: ${errBody?.message || linesRes.statusText || linesRes.status}`,
        };
      }

      const delRemovedUrl = new URL("/rest/v1/ddt_righe", creds.projectUrl);
      delRemovedUrl.searchParams.set("ddt_id", `eq.${currentDoc.id}`);
      delRemovedUrl.searchParams.set("id", `not.in.(${linePayloads.map((l) => l.id).join(",")})`);
      await fetchWithTimeout(delRemovedUrl.toString(), {
        method: "DELETE",
        headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
      }).catch(() => {});
    } else {
      const delAllUrl = new URL("/rest/v1/ddt_righe", creds.projectUrl);
      delAllUrl.searchParams.set("ddt_id", `eq.${currentDoc.id}`);
      await fetchWithTimeout(delAllUrl.toString(), {
        method: "DELETE",
        headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
      }).catch(() => {});
    }

    // Pulisce eventuali righe orfane con stesso anno/numero e ddt_id NULL
    const delOrphanUrl = new URL("/rest/v1/ddt_righe", creds.projectUrl);
    delOrphanUrl.searchParams.set("anno", `eq.${currentDoc.year}`);
    delOrphanUrl.searchParams.set("numero_ddt", `eq.${currentDoc.doc_number}`);
    delOrphanUrl.searchParams.set("ddt_id", "is.null");
    await fetchWithTimeout(delOrphanUrl.toString(), {
      method: "DELETE",
      headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
    }).catch(() => {});

    await db.execute(`UPDATE ddt_documents SET sync_status = 'synced' WHERE id = $1`, [
      currentDoc.id,
    ]);
    await db.execute(`UPDATE ddt_items SET sync_status = 'synced' WHERE ddt_id = $1`, [
      currentDoc.id,
    ]);

    const finalSnap = buildSnapshotFromLocal(currentDoc, items);
    await saveDdtBaseSnapshot(currentDoc.id, savedRemoteModified, finalSnap);

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

  public async resolveMergeConflict(
    docId: string,
    resolution: "keep-local" | "use-remote"
  ): Promise<DdtPushResult> {
    const creds = await this.getCredentials();
    if (!creds) return { success: false, error: "Configurazione Supabase non disponibile" };

    const db = await getDatabase();
    if (resolution === "keep-local") {
      const docs = await db.select<LocalDdtRow[]>(
        `SELECT * FROM ddt_documents WHERE id = $1 LIMIT 1`,
        [docId]
      );
      if (!docs[0]) return { success: false, error: "DDT non trovato" };
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
    await this.applyMergedSnapshotToLocal(docId, remoteSnap, taxSub, vatSub, taxSub + vatSub, ts, "synced");
    await saveDdtBaseSnapshot(docId, ts, remoteSnap);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ddt-data-updated"));
    }
    return { success: true, docNumber: remoteSnap.header.doc_number };
  }

  public async deleteRemoteDdt(id: string): Promise<boolean> {
    this.markRecentlyDeleted(id);
    const creds = await this.getCredentials();
    if (!creds) return false;

    try {
      const linesUrl = new URL("/rest/v1/ddt_righe", creds.projectUrl);
      linesUrl.searchParams.set("ddt_id", `eq.${id}`);
      const delLinesRes = await fetchWithTimeout(linesUrl.toString(), {
        method: "DELETE",
        headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
      });
      if (!delLinesRes.ok) return false;

      const docUrl = new URL("/rest/v1/ddt", creds.projectUrl);
      docUrl.searchParams.set("id", `eq.${id}`);
      const delDocRes = await fetchWithTimeout(docUrl.toString(), {
        method: "DELETE",
        headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
      });
      if (!delDocRes.ok) return false;

      const db = await getDatabase();
      await db.execute(`UPDATE ddt_documents SET sync_status = 'synced' WHERE id = $1`, [id]);
      await db.execute(`UPDATE ddt_items SET sync_status = 'synced' WHERE ddt_id = $1`, [id]);
      return true;
    } catch (err) {
      console.warn("[DdtPush] Impossibile eliminare DDT remoto su Supabase (verrà ritentato):", err);
      return false;
    }
  }

  public async pushDdtById(
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
      if (doc.deleted_at) {
        if (doc.doc_number !== null && doc.status !== "bozza") {
          const ok = await this.deleteRemoteDdt(doc.id);
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
        const batch = await this.executeSingleBatchPush();
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
        if (doc.deleted_at) {
          const ok = await this.deleteRemoteDdt(doc.id);
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

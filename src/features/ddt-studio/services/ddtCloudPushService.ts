import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";

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

    const qty = isNote ? 0 : parseNumericString(it.quantity, 1) || 1;
    const unitPrice = isNote ? 0 : (it.unit_price_subunits || 0) / 100000;
    const discountPct = isNote ? 0 : parseNumericString(it.discount_pct, 0);
    const discountDecimal = round5(discountPct / 100);
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

  private async getCloudOwnerForNumber(
    creds: SupabaseConfig,
    year: number,
    docNumber: number
  ): Promise<string | null> {
    const url = new URL("/rest/v1/ddt", creds.projectUrl);
    url.searchParams.set("anno", `eq.${year}`);
    url.searchParams.set("numero", `eq.${docNumber}`);
    url.searchParams.set("select", "id");
    url.searchParams.set("limit", "1");

    const res = await fetchWithTimeout(url.toString(), {
      headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id: string }>;
    return rows?.[0]?.id ?? null;
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
      const owner = await this.getCloudOwnerForNumber(creds, year, docNumber);
      return Boolean(owner && owner !== excludeId);
    } catch {
      return false;
    }
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
    reassignNumberOnConflict: boolean
  ): Promise<DdtPushResult> {
    if (doc.deleted_at || doc.status === "bozza" || doc.doc_number === null) {
      return { success: true, docNumber: doc.doc_number };
    }

    const db = await getDatabase();
    const items = await db.select<LocalDdtItemRow[]>(
      `SELECT * FROM ddt_items WHERE ddt_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC`,
      [doc.id]
    );

    let currentDoc = { ...doc };
    let pushedHeader = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      const existingOwner = await this.getCloudOwnerForNumber(
        creds,
        currentDoc.year,
        currentDoc.doc_number!
      );

      if (existingOwner && existingOwner !== currentDoc.id) {
        if (!reassignNumberOnConflict) {
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

    // Sostituisce le righe su Supabase per evitare righe residue dopo modifiche
    const delByDdtUrl = new URL("/rest/v1/ddt_righe", creds.projectUrl);
    delByDdtUrl.searchParams.set("ddt_id", `eq.${currentDoc.id}`);
    const delRes = await fetchWithTimeout(delByDdtUrl.toString(), {
      method: "DELETE",
      headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
    });
    if (!delRes.ok) {
      return {
        success: false,
        docNumber: currentDoc.doc_number,
        error: `Errore pulizia righe remote DDT (HTTP ${delRes.status})`,
      };
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
    }

    await db.execute(`UPDATE ddt_documents SET sync_status = 'synced' WHERE id = $1`, [
      currentDoc.id,
    ]);
    await db.execute(`UPDATE ddt_items SET sync_status = 'synced' WHERE ddt_id = $1`, [
      currentDoc.id,
    ]);

    return { success: true, docNumber: currentDoc.doc_number };
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

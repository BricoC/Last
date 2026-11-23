import { getDatabase } from "@/shared/data-layer/database";
import { applyLocalDatabaseBatch, type SqliteWrite } from "@/shared/data-layer/localDatabaseBatch";
import { supabaseFetch } from "@/shared/services/supabaseSession";
import { normalizeSupabaseProjectUrl } from "@/shared/services/supabaseConfigCache";
import { mapHeaderForLocal, mapLineForLocal, type CloudHeader, type CloudLine } from "@/features/settings/data-import/ddtReadOnlyPreviewService";
import { buildSnapshotFromCloud } from "./ddtSnapshotBuilders";
import { buildDdtSnapshotWrite, ddtSnapshotSchema } from "./ddtSnapshotService";

export interface DdtChange {
  id: string;
  revision: string;
  deletedAt: string | null;
  document: { header: CloudHeader; lines: CloudLine[] } | null;
}

export async function readDdtChangePage(projectUrl: string, anonKey: string, after: string): Promise<DdtChange[]> {
  const response = await supabaseFetch(new URL("/rest/v1/rpc/last_ddt_changes", projectUrl), {
    method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_after: after, p_limit: 40 }),
  });
  if (!response.ok) throw new Error(`Download DDT: HTTP ${response.status}. Verifica la migrazione Supabase DDT.`);
  const page = await response.json() as DdtChange[];
  if (!Array.isArray(page)) throw new Error("Risposta cloud DDT non valida");
  let previous = BigInt(after);
  for (const row of page) {
    if (!/^\d+$/.test(row.revision) || BigInt(row.revision) <= previous) throw new Error("Cursore DDT cloud non valido");
    if (!row.id || (!row.document && !row.deletedAt) ||
        (row.document && (row.document.header?.id !== row.id || !Array.isArray(row.document.lines)))) {
      throw new Error("Modifica DDT cloud incompleta");
    }
    previous = BigInt(row.revision);
  }
  return page;
}

interface LocalDdt {
  id: string;
  year: number;
  doc_number: number | null;
  status: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: string;
  project_url: string | null;
  client_name: string;
  doc_date: string;
  total_document_subunits: number;
}

const schemas = [
  ddtSnapshotSchema,
  `CREATE TABLE IF NOT EXISTS ddt_pull_state (
    project_url TEXT PRIMARY KEY, revision TEXT NOT NULL, initialized INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS ddt_pull_seen (
    project_url TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(project_url,id))`,
  `CREATE TABLE IF NOT EXISTS ddt_pull_deferred (
    project_url TEXT NOT NULL, id TEXT NOT NULL, change_json TEXT NOT NULL, PRIMARY KEY(project_url,id))`,
];

export async function getDdtPullState(project: string) {
  const db = await getDatabase();
  await db.execute(schemas[1]);
  const cols = await db.select<{ name: string }[]>("PRAGMA table_info(ddt_pull_state)");
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("revision") || !colNames.has("initialized") || cols.some((c) => !["project_url", "revision", "initialized"].includes(c.name))) {
    await db.execute("DROP TABLE ddt_pull_state");
    await db.execute(schemas[1]);
  }
  const [row] = await db.select<{ revision: string; initialized: number }[]>(
    "SELECT revision, initialized FROM ddt_pull_state WHERE project_url = $1",
    [normalizeSupabaseProjectUrl(project)],
  );
  return row ?? { revision: "0", initialized: 0 };
}

function deleteDdtWrites(doc: LocalDdt, stamp: string): SqliteWrite[] {
  return [
    {
      sql: `UPDATE ddt_documents SET deleted_at=$1, updated_at=$1
        WHERE id=$2 AND updated_at IS $3 AND sync_status='synced' AND deleted_at IS NULL AND project_url IS $4`,
      params: [stamp, doc.id, doc.updated_at, doc.project_url],
      expectedRows: 1,
    },
    {
      sql: "UPDATE ddt_items SET deleted_at=$1, updated_at=$1, sync_status='synced' WHERE ddt_id=$2 AND deleted_at IS NULL",
      params: [stamp, doc.id],
    },
  ];
}

export function buildIncomingDdtWrites(
  header: CloudHeader,
  cloudLines: CloudLine[],
  project: string,
  local?: LocalDdt,
): SqliteWrite[] {
  const h = mapHeaderForLocal(header);
  const columns = [
    "id", "doc_number", "year", "doc_date", "status", "client_name", "client_address", "client_city", "client_vat",
    "client_fiscal_code", "client_sdi", "client_phones_json", "destination_name", "destination_city", "transport_reason",
    "payment_method", "order_reference", "operator", "goods_appearance", "carriage_terms", "packages_count", "weight_kg",
    "carrier", "internal_notes", "total_taxable_subunits", "total_vat_subunits", "total_document_subunits",
    "created_at", "updated_at", "project_url", "sync_status", "updated_by",
  ];
  const values = [
    h.id, h.docNumber, h.year, h.docDate, header.stato || "confermato", h.clientName, h.clientAddress, h.clientCity,
    h.clientVat, h.clientFiscalCode, h.clientSdi, h.clientPhonesJson, h.destinationName, h.destinationCity, h.transportReason,
    h.paymentMethod, h.orderReference, h.operator, h.goodsAppearance, h.carriageTerms, h.packagesCount, h.weightKg,
    h.carrier, h.internalNotes, h.totalTaxableSubunits, h.totalVatSubunits, h.totalDocumentSubunits,
    h.createdAt, h.updatedAt, project, "synced", h.operator || "supabase",
  ];
  const writes: SqliteWrite[] = [{
    sql: `INSERT INTO ddt_documents (${columns.join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")})
      ON CONFLICT(id) DO UPDATE SET ${columns.slice(1).filter((name) => name !== "created_at")
        .map((name) => `${name}=excluded.${name}`).join(",")}, deleted_at=NULL
      WHERE $${columns.length + 1}=1 AND ddt_documents.updated_at IS $${columns.length + 2}
        AND ddt_documents.project_url IS $${columns.length + 3}
        AND ddt_documents.sync_status='synced'`,
    params: [...values, local ? 1 : 0, local?.updated_at ?? null, local?.project_url ?? null],
    expectedRows: 1,
  }];
  const lines = cloudLines.map((line, i) => mapLineForLocal(line, h.id, i + 1));
  writes.push({
    sql: `UPDATE ddt_items SET deleted_at=$1, updated_at=$1, sync_status='synced'
      WHERE ddt_id=$2 AND deleted_at IS NULL AND id NOT IN (SELECT value FROM json_each($3))`,
    params: [h.updatedAt, h.id, JSON.stringify(lines.map((line) => line.id))],
  });
  for (const line of lines) {
    writes.push({
      sql: `INSERT INTO ddt_items (id,ddt_id,row_index,description,row_kind,unit,quantity,unit_price_subunits,
        discount_pct,net_amount_subunits,vat_rate,vat_amount_subunits,purchase_price_subunits,
        created_at,updated_at,updated_by,sync_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,'supabase','synced')
        ON CONFLICT(id) DO UPDATE SET row_index=excluded.row_index, description=excluded.description,
          row_kind=excluded.row_kind, unit=excluded.unit, quantity=excluded.quantity,
          unit_price_subunits=excluded.unit_price_subunits, discount_pct=excluded.discount_pct,
          net_amount_subunits=excluded.net_amount_subunits, vat_rate=excluded.vat_rate,
          vat_amount_subunits=excluded.vat_amount_subunits,purchase_price_subunits=excluded.purchase_price_subunits,
          updated_at=excluded.updated_at,deleted_at=NULL,sync_status='synced'
        WHERE ddt_items.ddt_id=excluded.ddt_id`,
      params: [line.id, h.id, line.rowIndex, line.description, line.rowKind, line.unit, line.quantity,
        line.unitPriceSubunits, line.discountPct, line.netAmountSubunits, line.vatRate, line.vatAmountSubunits,
        line.purchasePriceSubunits, h.updatedAt],
      expectedRows: 1,
    });
  }
  writes.push(buildDdtSnapshotWrite(h.id, header.ultima_modifica ?? header.created_at, buildSnapshotFromCloud(header, cloudLines)));
  return writes;
}

export async function pullDdtChanges(projectUrl: string, anonKey: string) {
  const db = await getDatabase();
  const project = normalizeSupabaseProjectUrl(projectUrl);
  if (!project) throw new Error("Progetto Supabase non disponibile");
  await applyLocalDatabaseBatch(schemas.map((sql) => ({ sql, params: [] })));
  const state = await getDdtPullState(project);
  let revision = state.revision;
  const counts = { added: 0, lines: 0, updated: 0, deleted: 0 };

  const saveChanges = async (changes: DdtChange[], nextRevision?: string) => {
    const writes: SqliteWrite[] = [];
    const inPageDeletedIds = new Set<string>();
    for (const change of changes) {
      if (!change.id || (!change.document && !change.deletedAt)) throw new Error("Modifica DDT cloud incompleta");
      const doc = change.document;
      if (doc && (doc.header?.id !== change.id || !Array.isArray(doc.lines))) throw new Error("Snapshot DDT cloud non valido");
      const candidates = await db.select<LocalDdt[]>(
        `SELECT id, year, doc_number, status, updated_at, deleted_at, sync_status, project_url,
          client_name, doc_date, total_document_subunits FROM ddt_documents
          WHERE id=$1 OR (year=$2 AND doc_number=$3 AND deleted_at IS NULL)`,
        [change.id, doc?.header.anno ?? null, doc?.header.numero ?? null],
      );
      const local = candidates.find((row) => row.id === change.id);
      const other = candidates.find((row) => row.id !== change.id && !inPageDeletedIds.has(row.id));
      const isIdenticalLegacyRestored = Boolean(
        !local &&
        other &&
        doc &&
        candidates.length === 1 &&
        other.sync_status === "synced" &&
        other.project_url === null &&
        /-restored$/i.test(other.id) &&
        (() => {
          const mapped = mapHeaderForLocal(doc.header);
          return (
            other.doc_date === mapped.docDate &&
            other.total_document_subunits === mapped.totalDocumentSubunits &&
            other.client_name.trim().toLowerCase() === mapped.clientName.trim().toLowerCase()
          );
        })(),
      );
      const blocked = Boolean(
        (other && !isIdenticalLegacyRestored) ||
        (local && (local.sync_status !== "synced" ||
          (local.project_url && normalizeSupabaseProjectUrl(local.project_url) !== project))),
      );
      if (!state.initialized && nextRevision) writes.push({
        sql: "INSERT OR IGNORE INTO ddt_pull_seen(project_url,id) VALUES ($1,$2)", params: [project, change.id],
      });
      if (blocked) {
        if (other && doc && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("ddt-conflict-detected", { detail: {
            year: doc.header.anno, docNumber: doc.header.numero, localDoc: other,
            incomingDoc: {
              id: change.id, client_name: doc.header.cliente || "", doc_date: doc.header.data || "",
              total_document_subunits: mapHeaderForLocal(doc.header).totalDocumentSubunits,
              items_count: doc.lines.length, source: "Cloud Supabase", rawHeader: mapHeaderForLocal(doc.header),
              rawLines: doc.lines.map((line, i) => mapLineForLocal(line, change.id, i + 1)),
            },
          }}));
        }
        if (nextRevision) writes.push({
          sql: `INSERT INTO ddt_pull_deferred(project_url,id,change_json) VALUES ($1,$2,$3)
            ON CONFLICT(project_url,id) DO UPDATE SET change_json=excluded.change_json`,
          params: [project, change.id, JSON.stringify(change)],
        });
        continue;
      }
      if (doc) {
        if (isIdenticalLegacyRestored && other) {
          writes.push(
            { sql: "UPDATE quotes SET converted_ddt_id = $1 WHERE converted_ddt_id = $2", params: [change.id, other.id] },
            { sql: "DELETE FROM ddt_sync_snapshots WHERE ddt_id = $1", params: [other.id] },
            { sql: "DELETE FROM ddt_items WHERE ddt_id = $1", params: [other.id] },
            {
              sql: "DELETE FROM ddt_documents WHERE id = $1 AND sync_status = 'synced' AND project_url IS NULL",
              params: [other.id],
              expectedRows: 1,
            },
          );
        }
        writes.push(...buildIncomingDdtWrites(doc.header, doc.lines, project, local));
        if ((local && !local.deleted_at) || isIdenticalLegacyRestored) counts.updated++;
        else counts.added++;
        counts.lines += doc.lines.length;
      } else if (local && !local.deleted_at && (!local.project_url || normalizeSupabaseProjectUrl(local.project_url) === project)) {
        writes.push(...deleteDdtWrites(local, change.deletedAt!));
        inPageDeletedIds.add(local.id);
        counts.deleted++;
      }
      writes.push({ sql: "DELETE FROM ddt_pull_deferred WHERE project_url=$1 AND id=$2", params: [project, change.id] });
    }
    if (nextRevision) writes.push({
      sql: `INSERT INTO ddt_pull_state(project_url,revision) VALUES ($1,$2)
        ON CONFLICT(project_url) DO UPDATE SET revision=excluded.revision`,
      params: [project, nextRevision],
    });
    try {
      await applyLocalDatabaseBatch(writes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const match = /Operazione SQLite (\d+):/.exec(msg);
      const failedWrite = match ? writes[Number(match[1]) - 1] : undefined;
      console.error("[ddtCloudPull] Batch fallito:", { msg, failedSql: failedWrite?.sql.slice(0, 140), paramsCount: failedWrite?.params.length });
      if (failedWrite && /ddt_documents/.test(failedWrite.sql)) {
        const docId = String(failedWrite.params[0] ?? "");
        const [actual] = await db.select<Record<string, unknown>[]>(
          "SELECT id, updated_at, project_url, sync_status, deleted_at FROM ddt_documents WHERE id = $1",
          [docId],
        ).catch(() => []);
        console.error("[ddtCloudPull] Stato riga ddt_documents:", { docId, actual, writeParamsTail: failedWrite.params.slice(-4) });
        throw new Error(`${msg} [id=${docId}, actual=${JSON.stringify(actual ?? null)}]`);
      }
      throw err;
    }
  };

  for (;;) {
    const page = await readDdtChangePage(projectUrl, anonKey, revision);
    if (!page.length) break;
    const next = page[page.length - 1].revision;
    await saveChanges(page, next);
    revision = next;
  }

  if (!state.initialized) {
    const absent = await db.select<LocalDdt[]>(
      `SELECT * FROM ddt_documents AS d WHERE d.project_url=$1 AND d.sync_status='synced' AND d.deleted_at IS NULL
        AND d.doc_number IS NOT NULL AND d.status <> 'bozza'
        AND NOT EXISTS (SELECT 1 FROM ddt_pull_seen s WHERE s.project_url=$1 AND s.id=d.id)`,
      [project],
    );
    const stamp = new Date().toISOString();
    await applyLocalDatabaseBatch([
      ...absent.flatMap((doc) => deleteDdtWrites(doc, stamp)),
      { sql: `INSERT INTO ddt_pull_state(project_url,revision,initialized) VALUES ($1,$2,1)
          ON CONFLICT(project_url) DO UPDATE SET initialized=1`, params: [project, revision] },
      { sql: "DELETE FROM ddt_pull_seen WHERE project_url=$1", params: [project] },
    ]);
    counts.deleted += absent.length;
  }

  const deferred = await db.select<{ change_json: string }[]>(
    "SELECT change_json FROM ddt_pull_deferred WHERE project_url=$1", [project],
  );
  for (const { change_json } of deferred) await saveChanges([JSON.parse(change_json) as DdtChange]);
  const [pending] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) AS count FROM ddt_pull_deferred WHERE project_url=$1", [project],
  );
  return { ...counts, deferred: pending.count };
}

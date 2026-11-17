import { getDatabase } from "@/shared/data-layer/database";
import { buildSnapshotFromLocal, DdtSnapshot } from "./ddtMergeUtils";

export interface StoredBaseSnapshot {
  remoteUltimaModifica: string | null;
  snapshot: DdtSnapshot;
}

let tableEnsured = false;

async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  const db = await getDatabase();
  await db.execute(
    `CREATE TABLE IF NOT EXISTS ddt_sync_snapshots (
      ddt_id TEXT PRIMARY KEY,
      remote_ultima_modifica TEXT,
      snapshot_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );
  tableEnsured = true;
}

export async function getDdtBaseSnapshot(ddtId: string): Promise<StoredBaseSnapshot | null> {
  try {
    await ensureTable();
    const db = await getDatabase();
    const rows = await db.select<
      Array<{ remote_ultima_modifica: string | null; snapshot_json: string }>
    >(
      `SELECT remote_ultima_modifica, snapshot_json FROM ddt_sync_snapshots WHERE ddt_id = $1 LIMIT 1`,
      [ddtId]
    );
    if (rows.length === 0) return null;
    const parsed = JSON.parse(rows[0].snapshot_json) as DdtSnapshot;
    return {
      remoteUltimaModifica: rows[0].remote_ultima_modifica,
      snapshot: parsed,
    };
  } catch {
    return null;
  }
}

export async function saveDdtBaseSnapshot(
  ddtId: string,
  remoteUltimaModifica: string | null,
  snapshot: DdtSnapshot
): Promise<void> {
  try {
    await ensureTable();
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT OR REPLACE INTO ddt_sync_snapshots (ddt_id, remote_ultima_modifica, snapshot_json, updated_at)
       VALUES ($1, $2, $3, $4)`,
      [ddtId, remoteUltimaModifica, JSON.stringify(snapshot), now]
    );
  } catch (err) {
    console.warn("[DdtSnapshot] Salvataggio snapshot base non riuscito:", err);
  }
}

/**
 * Inizializza in modo pigro lo snapshot Base per DDT già sincronizzati prima di questa versione
 * appena l'utente li apre per eventuali modifiche.
 */
export async function ensureDdtBaseSnapshotFromLocal(ddtId: string): Promise<void> {
  try {
    const existing = await getDdtBaseSnapshot(ddtId);
    if (existing) return;

    const db = await getDatabase();
    const docs = await db.select<Array<Record<string, unknown>>>(
      `SELECT * FROM ddt_documents WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [ddtId]
    );
    if (docs.length === 0) return;
    const doc = docs[0];
    if (doc.sync_status !== "synced" || doc.status === "bozza") return;

    const items = await db.select<Array<Record<string, unknown>>>(
      `SELECT * FROM ddt_items WHERE ddt_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC`,
      [ddtId]
    );

    const snapshot = buildSnapshotFromLocal(doc as never, items as never);
    await saveDdtBaseSnapshot(
      ddtId,
      typeof doc.updated_at === "string" ? doc.updated_at : null,
      snapshot
    );
  } catch (err) {
    console.warn("[DdtSnapshot] Init snapshot da locale non riuscito:", err);
  }
}

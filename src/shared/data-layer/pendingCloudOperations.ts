import { getDatabase } from "./database";
import type { SqliteWrite } from "./localDatabaseBatch";
import {
  createCachedSupabaseConfigLoader,
  getLastKnownSupabaseProjectUrl,
  normalizeSupabaseProjectUrl,
} from "@/shared/services/supabaseConfigCache";

export interface PendingCloudOperation {
  sequence: number;
  record_id: string;
  action: string;
  payload: string;
  project_url?: string | null;
}

const loadPendingOpConfig = createCachedSupabaseConfigLoader("pendingCloudOperations");
let legacyOperationsWarningCount = 0;

export function getLegacyPendingOperationsCount(): number {
  return legacyOperationsWarningCount;
}

export function pendingCloudWrite(
  scope: string,
  recordId: string,
  action: string,
  payload: unknown,
  projectUrl: string | null = getLastKnownSupabaseProjectUrl(),
): SqliteWrite {
  return {
    sql: "INSERT INTO pending_cloud_operations (scope, record_id, action, payload, project_url) VALUES ($1,$2,$3,$4,$5)",
    params: [scope, recordId, action, JSON.stringify(payload), normalizeSupabaseProjectUrl(projectUrl)],
  };
}

const running = new Map<string, Promise<number>>();

export function flushPendingCloudOperations(
  scope: string,
  apply: (operation: PendingCloudOperation) => Promise<void>,
  activeProjectUrl?: string | null,
): Promise<number> {
  const existing = running.get(scope);
  if (existing) return existing;
  const request = (async () => {
    const db = await getDatabase();
    const resolvedUrl = activeProjectUrl !== undefined
      ? normalizeSupabaseProjectUrl(activeProjectUrl)
      : normalizeSupabaseProjectUrl((await loadPendingOpConfig())?.projectUrl);
    const operations = await db.select<PendingCloudOperation[]>(
      "SELECT sequence, record_id, action, payload, project_url FROM pending_cloud_operations WHERE scope = $1 ORDER BY sequence",
      [scope],
    );
    const failed = new Set<string>();
    let confirmed = 0;
    let legacyHeld = 0;
    for (const operation of operations) {
      const opProject = normalizeSupabaseProjectUrl(operation.project_url);
      if (!opProject) {
        // Legacy queue item without project_url: preserve and flag instead of sending to an unverified project.
        legacyHeld++;
        continue;
      }
      if (!resolvedUrl || opProject !== resolvedUrl) {
        // Belongs to another Supabase project: keep suspended until that project is active again.
        continue;
      }
      if (failed.has(operation.record_id)) continue;
      try {
        await apply(operation);
        await db.execute("DELETE FROM pending_cloud_operations WHERE sequence = $1", [operation.sequence]);
        confirmed++;
      } catch (error) {
        failed.add(operation.record_id);
        console.warn(`[${scope}] Operazione cloud ancora in sospeso:`, error);
      }
    }
    legacyOperationsWarningCount = legacyHeld;
    if (legacyHeld > 0) {
      console.warn(
        `[${scope}] Conservate ${legacyHeld} operazioni offline legacy prive di progetto di destinazione verificabile.`,
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("pending-legacy-cloud-operations", { detail: { scope, count: legacyHeld } }),
        );
      }
    }
    return confirmed;
  })().finally(() => running.delete(scope));
  running.set(scope, request);
  return request;
}

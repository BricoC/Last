import { supabaseFetch } from "@/shared/services/supabaseSession";
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { computeTableComparison, type TableComparisonRow } from "./cloudMonitorUtils";

interface BasicConfigStatus {
  config: { projectUrl: string; anonKey: string } | null;
}

export interface ManagementConfigStatus {
  hasToken: boolean;
  accessToken: string;
  expiresAt: string;
}

export interface SupabaseCloudMetrics {
  projectRef: string;
  projectName: string;
  region: string;
  postgresVersion: string;
  projectStatus: string;
  dbSizeBytes: number;
  storageSizeBytes: number;
  egressBytes: number | null;
  tableSizes: Array<{ tableName: string; totalBytes: number }>;
}

export interface CloudMonitorSnapshot {
  checkedAt: Date;
  isOnline: boolean;
  hasAnonConfig: boolean;
  projectUrl: string;
  cloudMetrics: SupabaseCloudMetrics | null;
  cloudMetricsError: string | null;
  tables: TableComparisonRow[];
}

interface TableMonitorSpec {
  key: string;
  label: string;
  cloudTable: string;
  cloudFilterQuery?: string;
  localTable: string;
  localCountSql: string;
  localPendingSql?: string;
}

const MONITORED_TABLES: TableMonitorSpec[] = [
  {
    key: "ddt",
    label: "DDT Confermati",
    cloudTable: "ddt",
    localTable: "ddt_documents",
    localCountSql:
      "SELECT COUNT(*) as c FROM ddt_documents WHERE deleted_at IS NULL AND doc_number IS NOT NULL AND status <> 'bozza'",
    localPendingSql:
      "SELECT COUNT(*) as c FROM ddt_documents WHERE sync_status = 'pending' AND doc_number IS NOT NULL AND status <> 'bozza'",
  },
  {
    key: "ddt_righe",
    label: "Righe DDT",
    cloudTable: "ddt_righe",
    localTable: "ddt_items",
    localCountSql:
      "SELECT COUNT(*) as c FROM ddt_items i JOIN ddt_documents d ON i.ddt_id = d.id WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL AND d.doc_number IS NOT NULL AND d.status <> 'bozza'",
    localPendingSql:
      "SELECT COUNT(*) as c FROM ddt_items i JOIN ddt_documents d ON i.ddt_id = d.id WHERE i.sync_status = 'pending' AND d.doc_number IS NOT NULL AND d.status <> 'bozza'",
  },
  {
    key: "clienti",
    label: "Clienti",
    cloudTable: "clienti",
    localTable: "clients",
    localCountSql: "SELECT COUNT(*) as c FROM clients WHERE deleted_at IS NULL",
    localPendingSql: "SELECT COUNT(*) as c FROM clients WHERE deleted_at IS NULL AND sync_status = 'pending'",
  },
  {
    key: "fornitori",
    label: "Fornitori",
    cloudTable: "fornitori",
    localTable: "suppliers",
    localCountSql: "SELECT COUNT(*) as c FROM suppliers",
  },
  {
    key: "ordini",
    label: "Ordini",
    cloudTable: "ordini",
    localTable: "orders",
    localCountSql: "SELECT COUNT(*) as c FROM orders",
  },
  {
    key: "listino_generale",
    label: "Listino Generale",
    cloudTable: "listino_generale",
    localTable: "listino_generale",
    localCountSql: "SELECT COUNT(*) as c FROM listino_generale WHERE source_table = 'listino_generale'",
  },
  {
    key: "listini_vari",
    label: "Listini Vari",
    cloudTable: "listini_vari",
    localTable: "listino_generale (listini_vari)",
    localCountSql: "SELECT COUNT(*) as c FROM listino_generale WHERE source_table = 'listini_vari'",
  },
  {
    key: "listini_clienti",
    label: "Listini Clienti",
    cloudTable: "listini_clienti",
    localTable: "listini_clienti",
    localCountSql: "SELECT COUNT(*) as c FROM listini_clienti",
  },
  {
    key: "offerte",
    label: "Offerte",
    cloudTable: "offerte",
    localTable: "offers",
    localCountSql: "SELECT COUNT(*) as c FROM offers",
    localPendingSql: "SELECT COUNT(*) as c FROM offers WHERE sync_status = 'pending'",
  },
  {
    key: "note",
    label: "Note Aziendali",
    cloudTable: "note",
    localTable: "notes",
    localCountSql: "SELECT COUNT(*) as c FROM notes",
    localPendingSql: "SELECT COUNT(*) as c FROM notes WHERE sync_status = 'pending'",
  },
  {
    key: "preventivi",
    label: "Preventivi Attivi",
    cloudTable: "preventivi",
    cloudFilterQuery: "deleted_at=is.null",
    localTable: "quotes",
    localCountSql: "SELECT COUNT(*) as c FROM quotes WHERE deleted_at IS NULL",
    localPendingSql: "SELECT COUNT(*) as c FROM quotes WHERE deleted_at IS NULL AND sync_status = 'pending'",
  },
  {
    key: "fatture",
    label: "Fatture Elettroniche",
    cloudTable: "fatture_elettroniche_testate",
    localTable: "supplier_invoices",
    localCountSql: "SELECT COUNT(*) as c FROM supplier_invoices",
  },
];

async function countCloudRows(
  projectUrl: string,
  anonKey: string,
  table: string,
  filterQuery?: string
): Promise<{ count: number | null; error?: string }> {
  try {
    const querySuffix = filterQuery ? `&${filterQuery}` : "";
    const res = await supabaseFetch(`${projectUrl}/rest/v1/${table}?select=id&limit=1${querySuffix}`, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Prefer: "count=exact",
      },
    });
    if (!res.ok) {
      return { count: null, error: `HTTP ${res.status}` };
    }
    const range = res.headers.get("content-range");
    const totalStr = range?.split("/").pop();
    if (!totalStr || totalStr === "*") {
      return { count: null, error: "Conteggio assente" };
    }
    const parsed = Number(totalStr);
    return Number.isFinite(parsed) ? { count: parsed } : { count: null, error: "Formato non valido" };
  } catch (err) {
    return { count: null, error: err instanceof Error ? err.message : "Errore rete" };
  }
}

export async function loadManagementConfig(): Promise<ManagementConfigStatus> {
  return invoke<ManagementConfigStatus>("load_supabase_management_config");
}

export async function saveManagementConfig(
  accessToken: string,
  expiresAt: string
): Promise<ManagementConfigStatus> {
  return invoke<ManagementConfigStatus>("save_supabase_management_config", {
    config: { accessToken, expiresAt },
  });
}

export async function fetchCloudMonitorSnapshot(hasManagementToken: boolean): Promise<CloudMonitorSnapshot> {
  const checkedAt = new Date();
  const cfgRes = await invoke<BasicConfigStatus>("load_supabase_config").catch(() => null);
  const projectUrl = cfgRes?.config?.projectUrl?.trim().replace(/\/$/, "") || "";
  const anonKey = cfgRes?.config?.anonKey?.trim() || "";
  const hasAnonConfig = Boolean(projectUrl && anonKey);

  const db = await getDatabase();

  // 1. Query conteggi locali in SQLite
  const localStatsPromise = Promise.all(
    MONITORED_TABLES.map(async (spec) => {
      try {
        const countRows = await db.select<{ c: number }[]>(spec.localCountSql);
        const localCount = Number(countRows?.[0]?.c ?? 0);
        let pendingCount = 0;
        if (spec.localPendingSql) {
          try {
            const pendRows = await db.select<{ c: number }[]>(spec.localPendingSql);
            pendingCount = Number(pendRows?.[0]?.c ?? 0);
          } catch {
            pendingCount = 0;
          }
        }
        return { localCount, pendingCount };
      } catch {
        return { localCount: null, pendingCount: 0 };
      }
    })
  );

  // 2. Query conteggi Cloud con anonKey
  const cloudStatsPromise = hasAnonConfig
    ? Promise.all(
        MONITORED_TABLES.map((spec) =>
          countCloudRows(projectUrl, anonKey, spec.cloudTable, spec.cloudFilterQuery)
        )
      )
    : Promise.resolve(MONITORED_TABLES.map(() => ({ count: null, error: "Supabase non configurato" })));

  // 3. Query spazio DB / Storage via Management API (solo se PAT configurato)
  const cloudMetricsPromise: Promise<{ metrics: SupabaseCloudMetrics | null; error: string | null }> =
    hasAnonConfig && hasManagementToken
      ? invoke<SupabaseCloudMetrics>("fetch_supabase_cloud_metrics")
          .then((metrics) => ({ metrics, error: null }))
          .catch((err) => ({
            metrics: null,
            error: err instanceof Error ? err.message : String(err),
          }))
      : Promise.resolve({ metrics: null, error: null });

  const [localStats, cloudStats, metricsOutcome] = await Promise.all([
    localStatsPromise,
    cloudStatsPromise,
    cloudMetricsPromise,
  ]);

  const sizeByTable = new Map<string, number>();
  for (const entry of metricsOutcome.metrics?.tableSizes ?? []) {
    sizeByTable.set(entry.tableName, entry.totalBytes);
  }

  const tables = MONITORED_TABLES.map((spec, idx) =>
    computeTableComparison({
      key: spec.key,
      label: spec.label,
      cloudTable: spec.cloudTable,
      localTable: spec.localTable,
      cloudCount: cloudStats[idx].count,
      localCount: localStats[idx].localCount,
      pendingCount: localStats[idx].pendingCount,
      cloudSizeBytes: sizeByTable.get(spec.cloudTable) ?? null,
      cloudError: cloudStats[idx].error,
    })
  );

  const anyCloudReadable = cloudStats.some((c) => c.count !== null);

  return {
    checkedAt,
    isOnline: anyCloudReadable || Boolean(metricsOutcome.metrics),
    hasAnonConfig,
    projectUrl,
    cloudMetrics: metricsOutcome.metrics,
    cloudMetricsError: metricsOutcome.error,
    tables,
  };
}

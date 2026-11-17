export interface TableComparisonRow {
  key: string;
  label: string;
  cloudTable: string;
  localTable: string;
  cloudCount: number | null;
  localCount: number | null;
  pendingCount: number;
  cloudSizeBytes: number | null;
  cloudError?: string;
  delta: number | null;
  ratioPercent: number | null;
  ratioLabel: string;
  status: "aligned" | "mismatch" | "error";
}

export interface TokenExpiryInfo {
  status: "none" | "valid" | "warning" | "expired";
  daysRemaining: number | null;
  label: string;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function computeTableComparison(params: {
  key: string;
  label: string;
  cloudTable: string;
  localTable: string;
  cloudCount: number | null;
  localCount: number | null;
  pendingCount?: number;
  cloudSizeBytes?: number | null;
  cloudError?: string;
}): TableComparisonRow {
  const pendingCount = params.pendingCount ?? 0;
  const cloudSizeBytes = params.cloudSizeBytes ?? null;

  if (params.cloudCount === null || params.localCount === null || params.cloudError) {
    return {
      key: params.key,
      label: params.label,
      cloudTable: params.cloudTable,
      localTable: params.localTable,
      cloudCount: params.cloudCount,
      localCount: params.localCount,
      pendingCount,
      cloudSizeBytes,
      cloudError: params.cloudError,
      delta: null,
      ratioPercent: null,
      ratioLabel: "—",
      status: "error",
    };
  }

  const delta = params.localCount - params.cloudCount;
  let ratioPercent: number | null = null;
  let ratioLabel = "—";

  if (params.cloudCount === 0 && params.localCount === 0) {
    ratioPercent = 100;
    ratioLabel = "100.0% (0 / 0)";
  } else if (params.cloudCount === 0) {
    ratioPercent = null;
    ratioLabel = `${params.localCount} / 0`;
  } else {
    ratioPercent = Math.round((params.localCount / params.cloudCount) * 1000) / 10;
    ratioLabel = `${ratioPercent.toFixed(1)}%`;
  }

  return {
    key: params.key,
    label: params.label,
    cloudTable: params.cloudTable,
    localTable: params.localTable,
    cloudCount: params.cloudCount,
    localCount: params.localCount,
    pendingCount,
    cloudSizeBytes,
    delta,
    ratioPercent,
    ratioLabel,
    status: delta === 0 ? "aligned" : "mismatch",
  };
}

export function computeTokenExpiryInfo(
  expiresAt: string | null | undefined,
  now: Date = new Date()
): TokenExpiryInfo {
  const trimmed = (expiresAt || "").trim();
  if (!trimmed) {
    return { status: "none", daysRemaining: null, label: "Nessuna scadenza impostata" };
  }

  const parts = trimmed.split("-");
  if (parts.length !== 3) {
    return { status: "none", daysRemaining: null, label: "Data non valida" };
  }

  const expUtc = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (!Number.isFinite(expUtc)) {
    return { status: "none", daysRemaining: null, label: "Data non valida" };
  }

  const daysRemaining = Math.ceil((expUtc - todayUtc) / (1000 * 60 * 60 * 24));
  if (daysRemaining <= 0) {
    return {
      status: "expired",
      daysRemaining,
      label: daysRemaining === 0 ? "Scade oggi!" : `Scaduto da ${Math.abs(daysRemaining)} giorni`,
    };
  }
  if (daysRemaining <= 20) {
    return {
      status: "warning",
      daysRemaining,
      label: `Scadenza tra ${daysRemaining} giorni (${trimmed})`,
    };
  }
  return {
    status: "valid",
    daysRemaining,
    label: `Scadenza: ${trimmed} (${daysRemaining} giorni rimanenti)`,
  };
}

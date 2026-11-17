import React, { useState, useEffect, useCallback, useMemo } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  Cloud,
  RefreshCw,
  Database,
  HardDrive,
  Scale,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Save,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import {
  fetchCloudMonitorSnapshot,
  loadManagementConfig,
  saveManagementConfig,
  type CloudMonitorSnapshot,
} from "./cloudMonitorService";
import { computeTokenExpiryInfo, formatBytes } from "./cloudMonitorUtils";

const FREE_PLAN_DB_LIMIT_BYTES = 500 * 1024 * 1024;
const FREE_PLAN_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
const FREE_PLAN_EGRESS_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;

export const CloudMonitorPanel: React.FC = () => {
  const [snapshot, setSnapshot] = useState<CloudMonitorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [accessToken, setAccessToken] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [tokenFeedback, setTokenFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const loadAll = useCallback(async (isInitial = false) => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    if (isInitial) setLoading(true);
    else setRefreshing(true);

    try {
      const mgmt = await loadManagementConfig().catch(() => ({
        hasToken: false,
        accessToken: "",
        expiresAt: "",
      }));
      if (isInitial) {
        setAccessToken(mgmt.accessToken || "");
        setExpiresAt(mgmt.expiresAt || "");
      }
      setHasSavedToken(mgmt.hasToken);

      const snap = await fetchCloudMonitorSnapshot(mgmt.hasToken);
      setSnapshot(snap);
    } catch (err) {
      console.error("[CloudMonitorPanel] Errore caricamento monitoraggio:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAll(true);
  }, [loadAll]);

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingToken(true);
    setTokenFeedback(null);
    try {
      const saved = await saveManagementConfig(accessToken, expiresAt);
      setAccessToken(saved.accessToken);
      setExpiresAt(saved.expiresAt);
      setHasSavedToken(saved.hasToken);
      setTokenFeedback({
        type: "ok",
        text: saved.hasToken
          ? "Token e scadenza salvati in locale. Aggiornamento metriche in corso..."
          : "Token rimosso dalla configurazione locale.",
      });
      await loadAll(false);
    } catch (err) {
      setTokenFeedback({
        type: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingToken(false);
    }
  };

  const expiryInfo = useMemo(() => computeTokenExpiryInfo(expiresAt), [expiresAt]);

  const tableSummary = useMemo(() => {
    const rows = snapshot?.tables ?? [];
    const aligned = rows.filter((r) => r.status === "aligned").length;
    const mismatched = rows.filter((r) => r.status === "mismatch").length;
    const errors = rows.filter((r) => r.status === "error").length;
    const totalPending = rows.reduce((acc, r) => acc + r.pendingCount, 0);
    const totalCloudRows = rows.reduce((acc, r) => acc + (r.cloudCount ?? 0), 0);
    const totalLocalRows = rows.reduce((acc, r) => acc + (r.localCount ?? 0), 0);
    return { total: rows.length, aligned, mismatched, errors, totalPending, totalCloudRows, totalLocalRows };
  }, [snapshot]);

  const dbBytes = snapshot?.cloudMetrics?.dbSizeBytes ?? null;
  const dbPct = dbBytes !== null ? Math.min(100, (dbBytes / FREE_PLAN_DB_LIMIT_BYTES) * 100) : 0;
  const dbFreeBytes = dbBytes !== null ? Math.max(0, FREE_PLAN_DB_LIMIT_BYTES - dbBytes) : null;

  const storageBytes = snapshot?.cloudMetrics?.storageSizeBytes ?? null;
  const storagePct =
    storageBytes !== null ? Math.min(100, (storageBytes / FREE_PLAN_STORAGE_LIMIT_BYTES) * 100) : 0;
  const storageFreeBytes =
    storageBytes !== null ? Math.max(0, FREE_PLAN_STORAGE_LIMIT_BYTES - storageBytes) : null;

  const egressBytes = snapshot?.cloudMetrics?.egressBytes ?? null;
  const egressPct =
    egressBytes !== null ? Math.min(100, (egressBytes / FREE_PLAN_EGRESS_LIMIT_BYTES) * 100) : 0;

  const alignedPct =
    tableSummary.total > 0 ? Math.round((tableSummary.aligned / tableSummary.total) * 100) : 0;

  if (!isTauri()) {
    return (
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 text-xs text-[var(--muted-foreground)]">
        Il monitoraggio Cloud & Database è disponibile nell'app desktop Last.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Header Monitoraggio */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--foreground)]">
                  Monitoraggio Cloud & Database Supabase
                </h2>
                {snapshot?.isOnline ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    ONLINE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                    OFFLINE / NON CONFIGURATO
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                {snapshot?.cloudMetrics ? (
                  <>
                    Progetto: <strong className="text-[var(--foreground)]">{snapshot.cloudMetrics.projectName}</strong> (
                    {snapshot.cloudMetrics.projectRef}) · Regione: {snapshot.cloudMetrics.region} · Postgres v
                    {snapshot.cloudMetrics.postgresVersion}
                  </>
                ) : snapshot?.projectUrl ? (
                  <>Endpoint: {snapshot.projectUrl}</>
                ) : (
                  <>Configura URL e chiave anon in Cloud &amp; Database per avviare il monitoraggio.</>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {snapshot && (
              <span className="text-[11px] font-mono text-[var(--muted-foreground)]">
                Aggiornato:{" "}
                {snapshot.checkedAt.toLocaleTimeString("it-IT", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
            <button
              type="button"
              onClick={() => void loadAll(false)}
              disabled={loading || refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)] text-xs font-semibold text-[var(--foreground)] transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", (loading || refreshing) && "animate-spin text-[var(--primary)]")} />
              <span>{refreshing ? "Aggiorno..." : "Aggiorna"}</span>
            </button>
          </div>
        </div>

        {/* Avviso errore Management API o scadenza Token imminente */}
        {snapshot?.cloudMetricsError && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{snapshot.cloudMetricsError}</span>
          </div>
        )}

        {(expiryInfo.status === "expired" || expiryInfo.status === "warning") && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
              expiryInfo.status === "expired"
                ? "border-red-500/40 bg-red-950/30 text-red-300"
                : "border-amber-500/40 bg-amber-950/30 text-amber-300"
            )}
          >
            <CalendarClock className="w-4 h-4 shrink-0" />
            <span>
              <strong>Personal Access Token Supabase:</strong> {expiryInfo.label}.{" "}
              {expiryInfo.status === "expired"
                ? "Rigenera il token sbp_... su Supabase per continuare a leggere lo spazio DB (la normale sincronizzazione dati con anonKey continua comunque a funzionare)."
                : "Ricordati di rinnovarlo prima della scadenza."}
            </span>
          </div>
        )}

        {/* 2. Card Spazio Database, Storage/Egress e Rapporto Allineamento */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Card Spazio Database */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]/60 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase text-[var(--muted-foreground)]">
                <Database className="w-3.5 h-3.5 text-blue-400" />
                Spazio Database
              </span>
              <span className="text-xs font-mono font-bold text-blue-400">
                {dbBytes !== null ? `${formatBytes(dbBytes)} / 500 MB` : "Token richiesto"}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--card)] overflow-hidden border border-[var(--border)]/60">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  dbPct > 85 ? "bg-red-500" : dbPct > 65 ? "bg-amber-500" : "bg-blue-500"
                )}
                style={{ width: `${Math.max(dbBytes ? 2 : 0, dbPct)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--muted-foreground)]">
                {dbBytes !== null ? `${dbPct.toFixed(1)}% utilizzato` : "Inserisci token sbp_... in basso"}
              </span>
              <span className="font-semibold text-emerald-400">
                {dbFreeBytes !== null ? `${formatBytes(dbFreeBytes)} disponibili` : "—"}
              </span>
            </div>
          </div>

          {/* Card File Storage / Egress */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]/60 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase text-[var(--muted-foreground)]">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                File Storage {egressBytes !== null ? "& Egress" : ""}
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {storageBytes !== null ? `${formatBytes(storageBytes)} / 1.00 GB` : "—"}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--card)] overflow-hidden border border-[var(--border)]/60">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.max(storageBytes ? 2 : 0, storagePct)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--muted-foreground)]">
                {egressBytes !== null
                  ? `Egress: ${formatBytes(egressBytes)} / 5.00 GB (${egressPct.toFixed(1)}%)`
                  : storageBytes !== null
                  ? `${storagePct.toFixed(1)}% (PDF salvati in locale)`
                  : "Richiede token sbp_..."}
              </span>
              <span className="font-semibold text-emerald-400">
                {storageFreeBytes !== null ? `${formatBytes(storageFreeBytes)} liberi` : "—"}
              </span>
            </div>
          </div>

          {/* Card Rapporto Allineamento Tabelle Cloud vs Locale */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]/60 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase text-[var(--muted-foreground)]">
                <Scale className="w-3.5 h-3.5 text-purple-400" />
                Rapporto Cloud vs SQLite
              </span>
              <span
                className={cn(
                  "text-xs font-mono font-bold",
                  tableSummary.mismatched === 0 && tableSummary.errors === 0
                    ? "text-emerald-400"
                    : "text-amber-400"
                )}
              >
                {tableSummary.aligned} / {tableSummary.total} allineate
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--card)] overflow-hidden border border-[var(--border)]/60">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  tableSummary.mismatched === 0 && tableSummary.errors === 0 ? "bg-emerald-500" : "bg-amber-500"
                )}
                style={{ width: `${alignedPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--muted-foreground)]">
                Locale {tableSummary.totalLocalRows.toLocaleString("it-IT")} / Cloud{" "}
                {tableSummary.totalCloudRows.toLocaleString("it-IT")}
              </span>
              <span
                className={cn(
                  "font-semibold",
                  tableSummary.totalPending > 0 ? "text-amber-400" : "text-emerald-400"
                )}
              >
                {tableSummary.totalPending > 0
                  ? `${tableSummary.totalPending} pending locali`
                  : tableSummary.mismatched > 0
                  ? `${tableSummary.mismatched} disallineate`
                  : "Tutto allineato"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Tabella Confronto Dettagliato Cloud vs SQLite Locale */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)]">
              Conteggio Tabelle &amp; Rapporto Cloud vs SQLite Locale
            </h3>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Confronto diretto tra righe presenti su Supabase e righe attive in <code className="font-mono">LastData.db</code>: scarti o code <code className="font-mono">pending</code> evidenziano subito eventuali disallineamenti.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--background)]/80 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)]">
              <tr>
                <th className="px-3 py-2">Modulo / Tabelle</th>
                <th className="px-3 py-2 text-right">Cloud</th>
                <th className="px-3 py-2 text-right">SQLite Locale</th>
                <th className="px-3 py-2 text-right">Rapporto (Loc/Cloud)</th>
                <th className="px-3 py-2 text-right">Scarto (Δ)</th>
                <th className="px-3 py-2 text-right">Peso DB</th>
                <th className="px-3 py-2 text-center">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/60">
              {loading && !snapshot ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[var(--muted-foreground)]">
                    Caricamento conteggi Cloud e SQLite...
                  </td>
                </tr>
              ) : (
                (snapshot?.tables ?? []).map((row) => (
                  <tr key={row.key} className="hover:bg-[var(--background)]/40 transition-colors">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-[var(--foreground)]">{row.label}</div>
                      <div className="text-[10px] font-mono text-[var(--muted-foreground)]">
                        {row.cloudTable} ↔ {row.localTable}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-[var(--foreground)]">
                      {row.cloudCount !== null ? row.cloudCount.toLocaleString("it-IT") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-[var(--foreground)]">
                      <span>{row.localCount !== null ? row.localCount.toLocaleString("it-IT") : "—"}</span>
                      {row.pendingCount > 0 && (
                        <span className="ml-1.5 inline-block px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold">
                          {row.pendingCount} pending
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--foreground)]">
                      {row.ratioLabel}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-mono font-bold",
                        row.delta === null
                          ? "text-[var(--muted-foreground)]"
                          : row.delta === 0
                          ? "text-emerald-400"
                          : "text-amber-400"
                      )}
                    >
                      {row.delta === null
                        ? "—"
                        : row.delta === 0
                        ? "0"
                        : row.delta > 0
                        ? `+${row.delta.toLocaleString("it-IT")}`
                        : row.delta.toLocaleString("it-IT")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--muted-foreground)]">
                      {formatBytes(row.cloudSizeBytes)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.status === "aligned" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          Allineata
                        </span>
                      ) : row.status === "mismatch" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          <AlertTriangle className="w-3 h-3" />
                          Disallineata
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30"
                          title={row.cloudError}
                        >
                          <XCircle className="w-3 h-3" />
                          {row.cloudError || "Errore"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Configurazione Personal Access Token Supabase & Scadenza */}
      <form
        onSubmit={handleSaveToken}
        className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-[var(--foreground)]">
              Configurazione Personal Access Token Supabase
            </h3>
          </div>
          <span
            className={cn(
              "px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
              expiryInfo.status === "expired"
                ? "bg-red-500/15 text-red-400 border-red-500/30"
                : expiryInfo.status === "warning"
                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                : expiryInfo.status === "valid"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]"
            )}
          >
            {expiryInfo.label}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 space-y-1">
            <label className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
              Personal Access Token (sbp_...)
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="sbp_..."
                autoComplete="off"
                spellCheck={false}
                className="w-full pr-9 pl-3 py-2 text-xs font-mono rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)]"
              />
              <button
                type="button"
                onClick={() => setShowToken((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                title={showToken ? "Nascondi token" : "Mostra token"}
              >
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
              Data di scadenza token
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-[var(--muted-foreground)] max-w-2xl">
            La data di scadenza serve da promemoria (avviso automatico 20 giorni prima): quando un token{" "}
            <code className="font-mono">sbp_...</code> generato su Supabase scade, si blocca solo la lettura dello spazio DB, mentre la sincronizzazione di DDT/Offerte/Ordini con la <code className="font-mono">anonKey</code> continua normalmente.
          </p>

          <button
            type="submit"
            disabled={savingToken}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white text-xs font-bold transition-opacity cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingToken ? "Salvataggio..." : hasSavedToken ? "Aggiorna Token" : "Salva Token"}</span>
          </button>
        </div>

        {tokenFeedback && (
          <p
            role="status"
            className={cn(
              "text-xs font-medium",
              tokenFeedback.type === "ok" ? "text-emerald-400" : "text-red-400"
            )}
          >
            {tokenFeedback.text}
          </p>
        )}
      </form>
    </div>
  );
};

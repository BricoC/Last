import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Button } from "@/shared/components/ui/button";
import { CheckCircle2, LoaderCircle, Search, Server } from "lucide-react";
import { DdtReadOnlyPreview } from "./DdtSupabasePreviewPanel";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
  configPath: string;
}

interface VisibleTableCount {
  table: string;
  count: number | null;
  error?: string;
}

const PUBLIC_TABLES = [
  "ddt",
  "ddt_righe",
  "ddt_logs",
  "app_settings",
  "clienti",
  "preventivi",
  "listino_generale",
  "listini_clienti",
  "listini_prezzi_log",
  "fatture_elettroniche_testate",
  "fatture_elettroniche_righe",
  "note_aziendali",
  "listini_vari",
  "ordini",
  "fornitori",
  "storico_operazioni",
] as const;

const EMPTY_CONFIG: SupabaseConfig = { projectUrl: "", anonKey: "" };

async function countVisibleRows(projectUrl: string, anonKey: string, table: string): Promise<number> {
  const response = await fetch(`${projectUrl}/rest/v1/${table}?select=id&limit=1`, {
    method: "GET",
    headers: { apikey: anonKey, Prefer: "count=exact" },
  });
  if (!response.ok) {
    throw new Error(`Supabase ha negato la lettura di ${table} (HTTP ${response.status}). Controlla grants e policy RLS.`);
  }
  const range = response.headers.get("content-range");
  const total = range?.split("/").pop();
  if (!total || total === "*") throw new Error(`Supabase non ha restituito il conteggio di ${table}.`);
  return Number(total);
}

export function SupabaseConnectionFields() {
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [counts, setCounts] = useState<VisibleTableCount[] | null>(null);

  useEffect(() => {
    let active = true;
    if (!isTauri()) {
      setError("La configurazione è disponibile nell’app desktop Last.");
      setBusy(false);
      return;
    }
    void invoke<ConfigStatus>("load_supabase_config").then((loaded) => {
      if (!active) return;
      setStatus(loaded);
      if (loaded.config) setConfig(loaded.config);
    }).catch(() => {
      if (active) setError("Impossibile caricare la configurazione locale Supabase.");
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  const update = (field: keyof SupabaseConfig, value: string) => {
    setConfig((current) => ({ ...current, [field]: value }));
    setError(""); setMessage(""); setCounts(null);
  };

  const save = async () => {
    setBusy(true); setError(""); setMessage(""); setCounts(null);
    try {
      const normalized = { projectUrl: config.projectUrl.trim().replace(/\/$/, ""), anonKey: config.anonKey.trim() };
      if (!normalized.anonKey) throw new Error("Inserisci la chiave API anon/pubblica.");
      if (normalized.anonKey.startsWith("sb_secret_") || normalized.anonKey.toLowerCase().includes("service_role")) {
        throw new Error("Questa schermata accetta solo la chiave anon/pubblica, mai service_role o chiavi secret.");
      }
      const saved = await invoke<ConfigStatus>("save_supabase_config", { config: normalized });
      setStatus(saved);
      setConfig(normalized);
      setMessage("URL e chiave anon salvati sul PC.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    setChecking(true); setError(""); setMessage(""); setCounts(null);
    try {
      const projectUrl = config.projectUrl.trim().replace(/\/$/, "");
      const anonKey = config.anonKey.trim();
      if (anonKey.startsWith("sb_secret_") || anonKey.toLowerCase().includes("service_role")) {
        throw new Error("Questa verifica accetta solo la chiave anon/pubblica.");
      }
      const results = await Promise.all(PUBLIC_TABLES.map(async (table): Promise<VisibleTableCount> => {
        try {
          return { table, count: await countVisibleRows(projectUrl, anonKey, table) };
        } catch (cause) {
          return { table, count: null, error: cause instanceof Error ? cause.message : "Lettura non riuscita." };
        }
      }));
      setCounts(results);
      const readable = results.filter((entry) => entry.count !== null).length;
      if (readable === PUBLIC_TABLES.length) {
        setMessage(`Accesso verificato: tutte le ${readable} tabelle applicative sono leggibili con richieste GET.`);
      } else {
        setError(`Accesso leggibile per ${readable} tabelle su ${PUBLIC_TABLES.length}. Controlla grants e RLS per quelle segnalate.`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Verifica Supabase non riuscita."); }
    finally { setChecking(false); }
  };

  const canVerify = Boolean(status && config.projectUrl.trim() && config.anonKey.trim());

  return (
    <div className="space-y-4">
    <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4 text-[var(--foreground)]">
      <div className="flex items-start gap-3">
        <Server className="w-5 h-5 text-[var(--primary)] mt-0.5" />
        <div>
          <h2 className="text-sm font-semibold">Connessione API Supabase</h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Bastano URL progetto e chiave API anon/pubblica, gli stessi due parametri già usati da Last.
          </p>
        </div>
      </div>

      <fieldset disabled={busy || !status} className="grid grid-cols-1 gap-3">
        <label className="space-y-1 text-xs">
          <span>URL Supabase</span>
          <input value={config.projectUrl} onChange={(event) => update("projectUrl", event.target.value)} placeholder="https://<project-ref>.supabase.co" autoComplete="off" spellCheck={false} className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2" />
        </label>
        <label className="space-y-1 text-xs">
          <span>Chiave API anon/pubblica</span>
          <input type="password" value={config.anonKey} onChange={(event) => update("anonKey", event.target.value)} autoComplete="off" className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2" />
        </label>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="button" size="sm" disabled={busy || !status} onClick={save}>Salva sul PC</Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy || checking || !canVerify} onClick={verify}>
          {checking ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          Verifica accesso
        </Button>
      </div>
      {status && <p className="text-[11px] text-[var(--muted-foreground)] break-all">Configurazione locale: {status.configPath}</p>}
      {message && <p role="status" className="text-xs">{message}</p>}
      {error && <p role="alert" className="text-xs text-[var(--destructive)]">{error}</p>}
      {counts && <div className="rounded-lg border border-[var(--border)] p-3 text-xs space-y-2">
        <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-emerald-500" />Conteggio righe accessibili secondo grants e RLS</p>
        <p className="text-[11px] text-[var(--muted-foreground)]">Per ogni tabella Last usa GET con limite di una riga e conteggio esatto; non scarica i campi dei documenti.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {counts.map((entry) => <div key={entry.table} className="flex justify-between gap-3 rounded border border-[var(--border)] px-2 py-1">
            <span>{entry.table}</span>
            <span className={entry.count === null ? "text-[var(--destructive)]" : "font-medium"}>
              {entry.count === null ? "non leggibile" : entry.count.toLocaleString("it-IT")}
            </span>
          </div>)}
        </div>
      </div>}
      <p className="text-[11px] text-[var(--muted-foreground)]">
        La chiave anon/pubblica è pensata per l’uso client e non concede accesso da sola: Supabase applica grants e policy RLS. Last usa questa coppia per le richieste di lettura; non inserire service_role o chiavi secret.
      </p>
    </section>
    <DdtReadOnlyPreview projectUrl={config.projectUrl} anonKey={config.anonKey} />
    </div>
  );
}


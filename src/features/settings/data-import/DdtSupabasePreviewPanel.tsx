import { useState } from "react";
import { AlertTriangle, Database, Download, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { createDdtReadOnlyPreview, importAllReadableSupabaseDdts, type DdtImportResult, type DdtPreview } from "./ddtReadOnlyPreviewService";
import { clientSyncService } from "@/features/clients/services/clientSyncService";
import { ddtRepository } from "@/features/ddt-studio/services/ddtRepository";

interface Props { projectUrl: string; anonKey: string; }

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md border border-[var(--border)] px-3 py-2">
    <div className="text-[10px] text-[var(--muted-foreground)]">{label}</div>
    <div className="text-sm font-semibold">{typeof value === "number" ? value.toLocaleString("it-IT") : value}</div>
  </div>;
}

export function DdtReadOnlyPreview({ projectUrl, anonKey }: Props) {
  const [preview, setPreview] = useState<DdtPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState<DdtImportResult | null>(null);
  const orphanRows = preview?.orphanRows ?? [];
  const run = async () => {
    setBusy(true); setError(""); setPreview(null); setImportResult(null);
    try { setPreview(await createDdtReadOnlyPreview(projectUrl, anonKey)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Preview DDT non riuscita."); }
    finally { setBusy(false); }
  };
  const importAll = async () => {
    setImporting(true); setError(""); setImportResult(null);
    try {
      const result = await importAllReadableSupabaseDdts(projectUrl, anonKey);
      setImportResult(result);
      setPreview(await createDdtReadOnlyPreview(projectUrl, anonKey));
      // Auto-estrazione istantanea di eventuali nuovi clienti nei DDT appena importati
      await clientSyncService.importMissingClientsFromDdts();
      // Auto-arricchimento istantaneo dell'indirizzo sede e città per tutti i DDT importati
      await ddtRepository.enrichMissingDdtClientData();
    } catch (cause) {
        const detail = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : JSON.stringify(cause);
        setError(detail && detail !== "{}" ? `Importazione DDT non riuscita: ${detail}` : "Importazione DDT non riuscita.");
      }
    finally { setImporting(false); }
  };

  return <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4 text-[var(--foreground)]">
    <div className="flex items-start gap-3">
      <Database className="mt-0.5 h-5 w-5 text-[var(--primary)]" />
      <div><h2 className="text-sm font-semibold">Preview DDT Supabase</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Supabase viene letto soltanto; i DDT non in conflitto possono essere copiati nel database SQLite locale.</p>
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="secondary" disabled={busy || importing || !projectUrl.trim() || !anonKey.trim()} onClick={run}>
        {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
        {busy ? "Analisi DDT in corso…" : "Analizza DDT"}
      </Button>
      {preview && preview.candidateHeaders > 0 && <Button type="button" size="sm" disabled={busy || importing} onClick={() => void importAll()}>
        {importing ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        {importing ? "Importazione locale in corso…" : `Importa ${preview.candidateHeaders.toLocaleString("it-IT")} DDT candidati`}
      </Button>}
    </div>
    {error && <p role="alert" className="text-xs text-[var(--destructive)]">{error}</p>}
    {importResult && <div role="status" className="rounded-md border border-[var(--border)] p-3 text-xs space-y-1">
      <p className="font-semibold">Importazione SQLite completata: {importResult.importedHeaders.toLocaleString("it-IT")} testate e {importResult.importedLines.toLocaleString("it-IT")} righe.</p>
      <p>Già presenti: {importResult.alreadyPresent.toLocaleString("it-IT")} · conflitti: {importResult.conflicts.toLocaleString("it-IT")} · righe orfane escluse: {importResult.orphanLines.toLocaleString("it-IT")} · UUID riga in conflitto: {importResult.lineIdConflicts.toLocaleString("it-IT")}.</p>
      {importResult.backupPath && <p className="break-all text-[var(--muted-foreground)]">Backup SQLite: {importResult.backupPath}</p>}
      <p className="text-[var(--muted-foreground)]">Supabase è rimasto in sola lettura.</p>
    </div>}
    {preview && <div className="space-y-4" aria-live="polite">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label="Testate cloud" value={preview.headers} />
        <Metric label="Righe cloud" value={preview.lines} />
        <Metric label="Testate candidate" value={preview.candidateHeaders} />
        <Metric label="Righe candidate" value={preview.candidateLines} />
        <Metric label="Testate già presenti" value={preview.alreadyPresentHeaders} />
        <Metric label="Righe già presenti" value={preview.alreadyPresentLines} />
        <Metric label="Collegamento via UUID" value={preview.directLinks} />
        <Metric label="Collegamento anno/numero" value={preview.fallbackLinks} />
        <Metric label="Righe orfane" value={preview.orphans} />
        <Metric label="Righe in conflitto locale" value={preview.conflictLines} />
        <Metric label="UUID righe già in SQLite" value={preview.lineIdConflicts} />
      </div>
      <div className="rounded-md border border-[var(--border)] p-3 text-xs">
        <h3 className="mb-2 font-semibold">Stati e controlli</h3>
        <p>Stati testate: {Object.entries(preview.states).map(([name, count]) => `${name}: ${count.toLocaleString("it-IT")}`).join(" · ") || "nessuno"}</p>
        <p className="mt-1">Testate candidate senza righe: {preview.headerWithoutLines.toLocaleString("it-IT")}. Testate non analizzabili: {preview.invalidHeaders.toLocaleString("it-IT")}.</p>
        <p className="mt-1">Prezzo scontato a zero con prezzo/importo valorizzati: {preview.zeroDiscountPrice.toLocaleString("it-IT")}; ricavo a zero: {preview.zeroRevenue.toLocaleString("it-IT")}; aliquote IVA fuori 0–100: {preview.invalidVat.toLocaleString("it-IT")}.</p>
        <p className="mt-1">Sconti positivi: {preview.discountCount.toLocaleString("it-IT")}{preview.minDiscount !== null ? ` (da ${(preview.minDiscount * 100).toLocaleString("it-IT", { maximumFractionDigits: 2 })}% a ${((preview.maxDiscount ?? 0) * 100).toLocaleString("it-IT", { maximumFractionDigits: 2 })}%)` : ""}.</p>
        <p className="mt-1">Testate con imponibile diverso dalla somma importi righe di oltre €0,01: {preview.taxableDiscrepancies.toLocaleString("it-IT")} (scarto massimo €{preview.maxTaxableDifference.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).</p>
      </div>
      <div className="rounded-md border border-[var(--border)] p-3 text-xs">
        <h3 className="mb-2 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-[var(--primary)]" />Conflitti con SQLite locale ({preview.conflicts.length})</h3>
        {preview.conflicts.length === 0 ? <p>Nessun conflitto individuato.</p> : <ul className="space-y-1">
          {preview.conflicts.slice(0, 20).map((conflict, index) => <li key={conflict.id ?? `${conflict.year}-${conflict.number}-${index}`}>
            <span className="font-medium">DDT {conflict.year}/{conflict.number}</span>
            {conflict.date && ` · ${conflict.date}`}{conflict.client && ` · ${conflict.client}`}
            {` · ${conflict.reason} · ${conflict.lineCount ?? 0} righe cloud collegate`}
          </li>)}
          {preview.conflicts.length > 20 && <li className="text-[var(--muted-foreground)]">Altri {preview.conflicts.length - 20} conflitti omessi dalla lista.</li>}
        </ul>}
      </div>
      <div className="rounded-md border border-[var(--border)] p-3 text-xs">
        <h3 className="mb-2 font-semibold">Righe orfane ({orphanRows.length})</h3>
        {orphanRows.length === 0 ? <p>Nessuna riga orfana.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead className="text-[var(--muted-foreground)]"><tr>
              <th className="px-2 py-1">Anno / DDT</th><th className="px-2 py-1">Riga</th><th className="px-2 py-1">Descrizione</th><th className="px-2 py-1">Importo</th><th className="px-2 py-1">ddt_id</th>
            </tr></thead>
            <tbody>{orphanRows.map((row) => <tr key={row.id} className="border-t border-[var(--border)]">
              <td className="px-2 py-1">{row.year ?? "—"} / {row.number ?? "—"}</td>
              <td className="px-2 py-1">{row.rowNumber ?? "—"}</td>
              <td className="max-w-[420px] px-2 py-1">{row.description}</td>
              <td className="whitespace-nowrap px-2 py-1">€{row.amount.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="px-2 py-1 font-mono">{row.ddtId ?? "assente"}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
      <div className="rounded-md border border-[var(--border)] p-3 text-xs">
        <h3 className="mb-2 font-semibold">Campi rilevati per la futura importazione</h3>
        <p>Testate: id, anno, numero, data, stato, cliente e contatti, destinazione, causale, vettore, note e totali.</p>
        <p className="mt-1">Righe: id, ddt_id oppure associazione univoca anno/numero, riga_nr, descrizione, unità, quantità, prezzo, sconto_pct, importo e iva_pct.</p>
        <p className="mt-1 text-[var(--muted-foreground)]">Il prezzo scontato zero non sostituisce importo; sconto_pct è una frazione; destinazione richiede conferma di mappatura. La preview non calcola né salva importi.</p>
      </div>
    </div>}
  </section>;
}

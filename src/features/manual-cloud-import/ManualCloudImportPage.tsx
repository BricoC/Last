import React, { useState, useMemo } from "react";
import {
  FileSpreadsheet,
  CloudUpload,
  Database,
  Search,
  RefreshCw,
  FolderOpen,
  ShieldCheck,
  Layers,
} from "lucide-react";
import {
  scanAndParseLocalFiles,
  fetchCloudPriceListMap,
  uploadRowsToSupabase,
  syncRowsToLocalSqlite,
  getSupabaseConfig,
  AnalysisResult,
  CloudPriceListHeader,
  UploadBatchStats,
} from "./services/manualPriceListImportService";

export const ManualCloudImportPage: React.FC = () => {
  const [folderPath, setFolderPath] = useState<string>("D:\\BricoClassFiles\\Offline\\ListiniClienti");
  const [ignoreOneDriveConflicts, setIgnoreOneDriveConflicts] = useState<boolean>(true);
  const [syncToLocalDb, setSyncToLocalDb] = useState<boolean>(true);

  // Stati scansione ed elaborazione
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; file: string } | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  // Mappa Cloud Supabase
  const [isFetchingCloud, setIsFetchingCloud] = useState<boolean>(false);
  const [cloudMap, setCloudMap] = useState<Map<string, CloudPriceListHeader> | null>(null);
  const [cloudFetchProgress, setCloudFetchProgress] = useState<{ loaded: number; total: number } | null>(null);

  // Upload Supabase
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [uploadStats, setUploadStats] = useState<UploadBatchStats | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Filtri tabella di anteprima
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [textOnlyFilter, setTextOnlyFilter] = useState<boolean>(false);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>("TUTTI");
  const [previewPage, setPreviewPage] = useState<number>(1);
  const pageSize = 50;

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 199)]);
  };

  // 1. Esegui analisi locale
  const handleStartAnalysis = async () => {
    if (isScanning || isUploading) return;
    setIsScanning(true);
    setAnalysis(null);
    setScanProgress(null);
    addLog(`Avvio analisi cartella: ${folderPath}`);

    try {
      const res = await scanAndParseLocalFiles(
        folderPath,
        ignoreOneDriveConflicts,
        (current, total, filename) => {
          setScanProgress({ current, total, file: filename });
        }
      );
      setAnalysis(res);
      addLog(`Analisi completata con successo! ${res.totalFiles} file, ${res.totalRows} righe trovate.`);
      addLog(`Righe con note testuali in ACQUISTO: ${res.textAcquistoCount}`);
      if (res.errors.length > 0) {
        addLog(`Attenzione: riscontrati ${res.errors.length} errori in alcuni file.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`ERRORE critico durante la scansione: ${msg}`);
      alert(`Errore scansione file: ${msg}`);
    } finally {
      setIsScanning(false);
      setScanProgress(null);
    }
  };

  // 2. Scarica mappa Supabase esistente
  const handleFetchCloudMap = async () => {
    if (isFetchingCloud) return;
    setIsFetchingCloud(true);
    setCloudFetchProgress(null);
    addLog("Connessione a Supabase in corso...");

    try {
      const config = await getSupabaseConfig();
      addLog(`Connesso a Supabase (${config.projectUrl}). Lettura listini_clienti...`);
      const map = await fetchCloudPriceListMap(
        config.projectUrl,
        config.anonKey,
        (loaded, total) => {
          setCloudFetchProgress({ loaded, total });
        }
      );
      setCloudMap(map);
      addLog(`Mappa Supabase scaricata: ${map.size} righe presenti nel Cloud.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`ERRORE lettura Supabase: ${msg}`);
      alert(`Errore connessione Supabase: ${msg}`);
    } finally {
      setIsFetchingCloud(false);
      setCloudFetchProgress(null);
    }
  };

  // 3. Avvia migrazione / caricamento su Supabase
  const handleStartUpload = async () => {
    if (!analysis || analysis.rows.length === 0) {
      alert("Nessun dato analizzato. Premi prima '1. Analizza e Verifica File Locali'.");
      return;
    }

    const confirmMsg =
      `Sei sicuro di voler caricare ${analysis.totalRows} articoli su Supabase?\n\n` +
      `- Righe con note testuali protette: ${analysis.textAcquistoCount}\n` +
      `- Aggiornamento SQLite locale: ${syncToLocalDb ? "SI" : "NO"}\n\n` +
      `Questa operazione aggiornerà i campi acquisto_old, prezzo_fattura e ricarico preservando il testo originale.`;

    if (!window.confirm(confirmMsg)) return;

    setIsUploading(true);
    setUploadProgress(null);
    setUploadStats(null);
    addLog("Avvio processo di caricamento...");

    try {
      const config = await getSupabaseConfig();

      // Se non abbiamo ancora scaricato la mappa cloud, la scarichiamo al volo
      let map = cloudMap;
      if (!map) {
        addLog("Lettura preliminare mappa ID Supabase...");
        map = await fetchCloudPriceListMap(config.projectUrl, config.anonKey);
        setCloudMap(map);
        addLog(`Mappa ID Supabase pronta (${map.size} righe).`);
      }

      addLog(`Inizio invio batch verso Supabase (${analysis.rows.length} righe)...`);
      const stats = await uploadRowsToSupabase(
        analysis.rows,
        map,
        config.projectUrl,
        config.anonKey,
        (processed, total, currentStats) => {
          setUploadProgress({ current: processed, total });
          setUploadStats({ ...currentStats });
        }
      );

      setUploadStats(stats);
      addLog(
        `Caricamento Supabase completato! Inserite: ${stats.inserted}, Aggiornate: ${stats.updated}, Errori: ${stats.failed}`
      );

      // Sincronizzazione locale opzionale
      if (syncToLocalDb) {
        addLog("Sincronizzazione in corso sul database SQLite locale di Last...");
        await syncRowsToLocalSqlite(analysis.rows, (processed, total) => {
          addLog(`Salvate ${processed} di ${total} righe in SQLite locale...`);
        });
        addLog("Sincronizzazione SQLite locale completata con successo!");
      }

      alert("Migrazione completata con successo! Verifica i risultati nella tabella sottostante.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`ERRORE durante il caricamento: ${msg}`);
      alert(`Errore caricamento: ${msg}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  // Lista clienti unici dall'analisi
  const uniqueClients = useMemo(() => {
    if (!analysis) return [];
    const set = new Set<string>();
    for (const r of analysis.rows) {
      set.add(r.cliente);
    }
    return Array.from(set).sort();
  }, [analysis]);

  // Righe filtrate per l'anteprima
  const filteredRows = useMemo(() => {
    if (!analysis) return [];
    return analysis.rows.filter((r) => {
      if (textOnlyFilter && !r.hasTextAcquisto) return false;
      if (selectedClientFilter !== "TUTTI" && r.cliente !== selectedClientFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const inDesc = r.descrizione.toLowerCase().includes(q);
        const inAcq = r.acquisto_old.toLowerCase().includes(q);
        const inCli = r.cliente.toLowerCase().includes(q);
        return inDesc || inAcq || inCli;
      }
      return true;
    });
  }, [analysis, textOnlyFilter, selectedClientFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const displayedRows = useMemo(() => {
    const start = (previewPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, previewPage, pageSize]);

  return (
    <div className="flex flex-col h-full bg-[var(--background)] text-[var(--foreground)] p-4 overflow-y-auto space-y-4">
      {/* Banner Intestazione */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-400">
            <CloudUpload className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold text-amber-400">Migrazione Listini Clienti &bull; NoManV1 &rarr; Supabase</h1>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Pannello Provvisorio Admin
              </span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Legge i file Excel storici locali e salva la colonna <strong>ACQUISTO</strong> in formato testo integrale in <strong>acquisto_old</strong>, eliminando qualsiasi corruzione numerica.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs text-amber-300/80 bg-amber-500/10 px-3 py-1.5 rounded border border-amber-500/20">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Isolato &bull; Eliminabile senza impatto</span>
        </div>
      </div>

      {/* Riquadro Configurazione e Comandi */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Colonna Sinistra: Cartella e Opzioni */}
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-3">
          <h2 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center space-x-1.5">
            <FolderOpen className="w-4 h-4 text-sky-400" />
            <span>1. Sorgente File Locali</span>
          </h2>

          <div className="space-y-1">
            <label className="text-[11px] text-[var(--muted-foreground)]">Percorso Cartella Excel:</label>
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 rounded bg-[var(--background)] border border-[var(--border)] font-mono text-[var(--foreground)]"
            />
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center space-x-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ignoreOneDriveConflicts}
                onChange={(e) => setIgnoreOneDriveConflicts(e.target.checked)}
                className="rounded border-[var(--border)] text-sky-500"
              />
              <span className="text-[var(--foreground)]">Ignora conflitti OneDrive (<code className="text-[10px] text-amber-400">-DESKTOP-</code>)</span>
            </label>

            <label className="flex items-center space-x-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncToLocalDb}
                onChange={(e) => setSyncToLocalDb(e.target.checked)}
                className="rounded border-[var(--border)] text-sky-500"
              />
              <span className="text-[var(--foreground)]">Aggiorna anche SQLite locale (<code className="text-[10px] text-sky-400">listini_clienti</code>)</span>
            </label>
          </div>

          <div className="pt-2 flex flex-col space-y-2">
            <button
              type="button"
              onClick={handleStartAnalysis}
              disabled={isScanning || isUploading}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 transition-colors shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
              <span>{isScanning ? "Analisi in corso..." : "1. Analizza e Verifica File Locali"}</span>
            </button>

            <button
              type="button"
              onClick={handleFetchCloudMap}
              disabled={isFetchingCloud || isUploading}
              className="w-full flex items-center justify-center space-x-2 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--card)] text-[var(--foreground)] disabled:opacity-50 transition-colors"
            >
              <Database className={`w-3.5 h-3.5 text-emerald-400 ${isFetchingCloud ? "animate-spin" : ""}`} />
              <span>{isFetchingCloud ? "Lettura Supabase..." : "Verifica Mappa Cloud Supabase"}</span>
            </button>
          </div>
        </div>

        {/* Colonna Centro: Statistiche KPI */}
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-3">
          <h2 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center space-x-1.5">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>2. Statistiche Rilevate</span>
          </h2>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="p-2.5 rounded bg-[var(--background)] border border-[var(--border)]">
              <span className="text-[10px] text-[var(--muted-foreground)] block">File Clienti</span>
              <span className="text-lg font-bold text-sky-400">{analysis ? analysis.totalFiles : "—"}</span>
            </div>
            <div className="p-2.5 rounded bg-[var(--background)] border border-[var(--border)]">
              <span className="text-[10px] text-[var(--muted-foreground)] block">Righe Valide</span>
              <span className="text-lg font-bold text-white">{analysis ? analysis.totalRows.toLocaleString() : "—"}</span>
            </div>
            <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30">
              <span className="text-[10px] text-emerald-400 block font-semibold">Testo in Acquisto</span>
              <span className="text-lg font-bold text-emerald-400">
                {analysis ? analysis.textAcquistoCount.toLocaleString() : "—"}
              </span>
            </div>
            <div className="p-2.5 rounded bg-[var(--background)] border border-[var(--border)]">
              <span className="text-[10px] text-[var(--muted-foreground)] block">Righe su Supabase</span>
              <span className="text-lg font-bold text-amber-400">{cloudMap ? cloudMap.size.toLocaleString() : "—"}</span>
            </div>
          </div>

          {/* Progress bar scansione o fetch */}
          {scanProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-[var(--muted-foreground)]">
                <span>File {scanProgress.current} di {scanProgress.total}</span>
                <span className="truncate max-w-[150px] font-mono text-sky-400">{scanProgress.file}</span>
              </div>
              <div className="w-full bg-[var(--background)] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-sky-500 h-full transition-all duration-150"
                  style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {cloudFetchProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-[var(--muted-foreground)]">
                <span>Righe caricate da Supabase</span>
                <span>{cloudFetchProgress.loaded} / {cloudFetchProgress.total}</span>
              </div>
              <div className="w-full bg-[var(--background)] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-150"
                  style={{ width: `${(cloudFetchProgress.loaded / cloudFetchProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Colonna Destra: Azione Upload e Monitoraggio */}
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-3 flex flex-col justify-between">
          <div>
            <h2 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center space-x-1.5">
              <CloudUpload className="w-4 h-4 text-amber-400" />
              <span>3. Esecuzione Migrazione</span>
            </h2>

            <p className="text-xs text-[var(--muted-foreground)] mt-2 leading-relaxed">
              Invia i dati a Supabase in blocchi controllati da 200 elementi. Aggiorna le righe esistenti con il campo <code>acquisto_old</code> esatto e inserisce eventuali nuovi articoli.
            </p>

            {uploadProgress && (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs font-semibold text-amber-400">
                  <span>Avanzamento invio</span>
                  <span>
                    {uploadProgress.current} / {uploadProgress.total} (
                    {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%)
                  </span>
                </div>
                <div className="w-full bg-[var(--background)] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full transition-all duration-150"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {uploadStats && (
              <div className="mt-2 text-xs flex items-center space-x-3 text-[var(--muted-foreground)]">
                <span className="text-emerald-400 font-medium">Aggiornate: {uploadStats.updated}</span>
                <span className="text-sky-400 font-medium">Nuove: {uploadStats.inserted}</span>
                {uploadStats.failed > 0 && <span className="text-red-400 font-medium">Errori: {uploadStats.failed}</span>}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleStartUpload}
            disabled={!analysis || isScanning || isUploading}
            className="w-full mt-2 flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-bold rounded-md bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40 transition-colors shadow-md"
          >
            <CloudUpload className={`w-4 h-4 ${isUploading ? "animate-spin" : ""}`} />
            <span>{isUploading ? "Caricamento in corso..." : "Avvia Caricamento Sicuro su Supabase"}</span>
          </button>
        </div>
      </div>

      {/* Barra di Filtro & Ricerca Anteprima */}
      <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              type="text"
              placeholder="Cerca per cliente, articolo, testo acquisto..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPreviewPage(1);
              }}
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder-[var(--muted-foreground)]"
            />
          </div>

          <select
            value={selectedClientFilter}
            onChange={(e) => {
              setSelectedClientFilter(e.target.value);
              setPreviewPage(1);
            }}
            className="text-xs px-2.5 py-1.5 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)]"
          >
            <option value="TUTTI">Tutti i Clienti ({uniqueClients.length})</option>
            {uniqueClients.map((c) => (
              <option key={c} value={c}>
                {c.replace(/^LIST_/, "")}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <label className="flex items-center space-x-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={textOnlyFilter}
              onChange={(e) => {
                setTextOnlyFilter(e.target.checked);
                setPreviewPage(1);
              }}
              className="rounded border-[var(--border)] text-emerald-500"
            />
            <span className="text-emerald-400 font-medium">Solo righe con testo in Acquisto</span>
          </label>

          <span className="text-[var(--muted-foreground)]">
            Trovate: <strong className="text-white">{filteredRows.length.toLocaleString()}</strong> righe
          </span>
        </div>
      </div>

      {/* Tabella di Anteprima Risultati */}
      <div className="flex-1 min-h-[300px] rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-[var(--background)] border-b border-[var(--border)] text-[11px] text-[var(--muted-foreground)] uppercase sticky top-0 z-10 select-none">
              <tr>
                <th className="py-2 px-3 w-12 text-center">#</th>
                <th className="py-2 px-3 w-64">Cliente</th>
                <th className="py-2 px-3">Descrizione Articolo</th>
                <th className="py-2 px-3 w-28 text-right">Fattura (€)</th>
                <th className="py-2 px-3 w-64 bg-amber-500/10 text-amber-300 font-bold border-x border-amber-500/20">
                  Acquisto OLD (Testo Integrale)
                </th>
                <th className="py-2 px-3 w-28 text-right">Ricarico (%)</th>
                <th className="py-2 px-3 w-36">File Excel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] font-mono">
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[var(--muted-foreground)] font-sans">
                    {analysis ? "Nessun articolo corrispondente ai filtri impostati." : "Clicca su '1. Analizza e Verifica File Locali' per visualizzare l'anteprima dei dati."}
                  </td>
                </tr>
              ) : (
                displayedRows.map((r, idx) => {
                  const globalIdx = (previewPage - 1) * pageSize + idx + 1;
                  return (
                    <tr key={`${r.cliente}_${r.descrizione}_${idx}`} className="hover:bg-[var(--background)]/60 transition-colors">
                      <td className="py-1.5 px-3 text-center text-[var(--muted-foreground)] font-sans text-[10px]">
                        {globalIdx}
                      </td>
                      <td className="py-1.5 px-3 text-amber-300 truncate max-w-[200px]" title={r.cliente}>
                        {r.cliente.replace(/^LIST_/, "")}
                      </td>
                      <td className="py-1.5 px-3 text-[var(--foreground)] font-sans font-medium" title={r.descrizione}>
                        {r.descrizione}
                      </td>
                      <td className="py-1.5 px-3 text-right text-emerald-400">
                        {r.prezzo_fattura > 0 ? r.prezzo_fattura.toFixed(2) + " €" : "—"}
                      </td>
                      <td className="py-1.5 px-3 bg-amber-500/5 border-x border-amber-500/20 font-bold">
                        {r.hasTextAcquisto ? (
                          <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                            {r.acquisto_old}
                          </span>
                        ) : r.acquisto_old ? (
                          <span className="text-[var(--foreground)]">{r.acquisto_old}</span>
                        ) : (
                          <span className="text-[var(--muted-foreground)] font-sans">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right text-sky-400">
                        {r.ricarico > 0 ? r.ricarico.toFixed(1) + "%" : "—"}
                      </td>
                      <td className="py-1.5 px-3 text-[10px] text-[var(--muted-foreground)] truncate max-w-[140px]" title={r.fileName}>
                        {r.fileName}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginazione */}
        {filteredRows.length > pageSize && (
          <div className="p-2 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-xs select-none">
            <span className="text-[var(--muted-foreground)]">
              Pagina {previewPage} di {totalPages}
            </span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                disabled={previewPage === 1}
                className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] disabled:opacity-40 hover:bg-[var(--background)]"
              >
                Precedente
              </button>
              <button
                type="button"
                onClick={() => setPreviewPage((p) => Math.min(totalPages, p + 1))}
                disabled={previewPage === totalPages}
                className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] disabled:opacity-40 hover:bg-[var(--background)]"
              >
                Successiva
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Console Log Esecuzione */}
      <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase text-[var(--muted-foreground)] flex items-center space-x-1">
            <Layers className="w-3.5 h-3.5" />
            <span>Registro Operazioni in Tempo Reale</span>
          </span>
          <button
            type="button"
            onClick={() => setLogs([])}
            className="text-[10px] text-[var(--muted-foreground)] hover:text-white"
          >
            Pulisci log
          </button>
        </div>

        <div className="h-28 overflow-y-auto font-mono text-[11px] bg-[var(--background)] p-2 rounded border border-[var(--border)] space-y-0.5">
          {logs.length === 0 ? (
            <div className="text-[var(--muted-foreground)]">In attesa di operazioni...</div>
          ) : (
            logs.map((log, i) => (
              <div
                key={i}
                className={
                  log.includes("ERRORE")
                    ? "text-red-400 font-bold"
                    : log.includes("completata") || log.includes("successo")
                    ? "text-emerald-400"
                    : "text-[var(--foreground)]"
                }
              >
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

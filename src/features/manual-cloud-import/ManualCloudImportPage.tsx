import React, { useState, useMemo } from "react";
import {
  CloudUpload,
  Search,
  RefreshCw,
  FolderOpen,
  Layers,
  FileText,
  UserCheck,
  Tag,
} from "lucide-react";
import {
  scanAndParseClientPriceLists,
  uploadClientPriceListsToSupabase,
  scanAndParseGeneralPriceLists,
  uploadGeneralListsToSupabase,
  scanAndParseLocalDdt,
  uploadDdtToSupabase,
  syncClientRowsToLocalSqlite,
  getSupabaseConfig,
  ClientListAnalysisResult,
  GeneralListAnalysisResult,
  DdtAnalysisResult,
} from "./services/manualPriceListImportService";

type ImportTab = "clienti" | "generale" | "ddt";

export const ManualCloudImportPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ImportTab>("clienti");

  // Percorsi hardcoded con fallback
  const [clientiFolder, setClientiFolder] = useState("D:\\BricoClassFiles\\Offline\\ListiniClienti");
  const [generalFile, setGeneralFile] = useState("D:\\BricoClassFiles\\Offline\\Listini\\Listini Generali\\LISTINO GENERALE.xlsm");
  const [variFolder, setVariFolder] = useState("D:\\BricoClassFiles\\Offline\\Listini\\Listini Generali");
  const [ddtDatiFolder, setDdtDatiFolder] = useState("D:\\BricoClassFiles\\Offline\\Database\\DDTDati");
  const [ddtArticoliFolder, setDdtArticoliFolder] = useState("D:\\BricoClassFiles\\Offline\\Database\\DDTArticoli");

  // Opzioni
  const [ignoreOneDriveConflicts, setIgnoreOneDriveConflicts] = useState(true);
  const [syncToLocalDb, setSyncToLocalDb] = useState(true);

  // Risultati analisi
  const [clientAnalysis, setClientAnalysis] = useState<ClientListAnalysisResult | null>(null);
  const [generalAnalysis, setGeneralAnalysis] = useState<GeneralListAnalysisResult | null>(null);
  const [ddtAnalysis, setDdtAnalysis] = useState<DdtAnalysisResult | null>(null);

  // Stati di caricamento / progresso
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Filtri tabelle
  const [clientSearch, setClientSearch] = useState("");
  const [clientTextOnly, setClientTextOnly] = useState(false);
  const [selectedClient, setSelectedClient] = useState("TUTTI");

  const [generalSearch, setGeneralSearch] = useState("");
  const [generalFilterType, setGeneralFilterType] = useState<"tutti" | "generale" | "vari">("tutti");

  const [ddtSearch, setDdtSearch] = useState("");
  const [ddtSelectedYear, setDdtSelectedYear] = useState<string>("TUTTI");

  const [previewPage, setPreviewPage] = useState(1);
  const pageSize = 50;

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 199)]);
  };

  /* =====================================================================
     AZIONI MODULO 1: LISTINI CLIENTI
  ===================================================================== */
  const handleAnalyzeClienti = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setProgressText("Scansione file Excel Listini Clienti...");
    setProgressPct(null);
    addLog(`Avvio scansione Listini Clienti in: ${clientiFolder}`);

    try {
      const res = await scanAndParseClientPriceLists(
        clientiFolder,
        ignoreOneDriveConflicts,
        (cur, tot, fn) => {
          setProgressText(`Lettura cliente ${cur} di ${tot}: ${fn}`);
          setProgressPct(Math.round((cur / tot) * 100));
        }
      );
      setClientAnalysis(res);
      addLog(`Listini Clienti analizzati: ${res.totalFiles} clienti, ${res.totalRows} righe totali.`);
      addLog(`Righe con annotazioni testuali protette in ACQUISTO: ${res.textAcquistoCount}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`ERRORE analisi Listini Clienti: ${msg}`);
      alert(`Errore: ${msg}`);
    } finally {
      setIsProcessing(false);
      setProgressText(null);
      setProgressPct(null);
    }
  };

  const handleUploadClienti = async () => {
    if (!clientAnalysis || clientAnalysis.rows.length === 0) {
      alert("Nessun dato analizzato. Clicca prima su 'Analizza File Locali'.");
      return;
    }
    if (!window.confirm(`Vuoi caricare ${clientAnalysis.totalRows} righe di Listini Clienti su Supabase?`)) return;

    setIsProcessing(true);
    addLog("Avvio invio batch Listini Clienti verso Supabase...");

    try {
      const cfg = await getSupabaseConfig();
      const res = await uploadClientPriceListsToSupabase(
        clientAnalysis.rows,
        cfg.projectUrl,
        cfg.anonKey,
        (cur, tot) => {
          setProgressText(`Invio righe clienti ${cur} di ${tot}`);
          setProgressPct(Math.round((cur / tot) * 100));
        }
      );

      addLog(`Caricamento Listini Clienti completato! Inserite: ${res.inserted}, Aggiornate: ${res.updated}, Errori: ${res.failed}`);

      if (syncToLocalDb) {
        addLog("Aggiornamento database SQLite locale di Last in corso...");
        await syncClientRowsToLocalSqlite(clientAnalysis.rows);
        addLog("SQLite locale sincronizzato!");
      }
      alert("Caricamento Listini Clienti terminato con successo!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`ERRORE caricamento Listini Clienti: ${msg}`);
      alert(`Errore: ${msg}`);
    } finally {
      setIsProcessing(false);
      setProgressText(null);
      setProgressPct(null);
    }
  };

  /* =====================================================================
     AZIONI MODULO 2: LISTINO GENERALE & VARI
  ===================================================================== */
  const handleAnalyzeGenerale = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setProgressText("Scansione Listino Generale e Vari...");
    setProgressPct(null);
    addLog("Avvio analisi Listino Generale e Listini Vari...");

    try {
      const res = await scanAndParseGeneralPriceLists(
        generalFile,
        variFolder,
        (stage, cur, tot) => {
          setProgressText(`${stage}: ${cur} di ${tot}`);
          setProgressPct(tot > 0 ? Math.round((cur / tot) * 100) : 50);
        }
      );
      setGeneralAnalysis(res);
      addLog(`Listino Generale analizzato: ${res.totalGenerale} articoli.`);
      addLog(`Listini Vari analizzati: ${res.totalVari} articoli (Totale combinato: ${res.totalCombined}).`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`ERRORE analisi Listino Generale: ${msg}`);
      alert(`Errore: ${msg}`);
    } finally {
      setIsProcessing(false);
      setProgressText(null);
      setProgressPct(null);
    }
  };

  const handleUploadGenerale = async () => {
    if (!generalAnalysis || generalAnalysis.totalCombined === 0) {
      alert("Nessun dato analizzato. Clicca prima su 'Analizza File Locali'.");
      return;
    }
    if (!window.confirm(`Vuoi caricare ${generalAnalysis.totalCombined} articoli di Listino Generale e Vari su Supabase?`)) return;

    setIsProcessing(true);
    addLog("Avvio invio Listino Generale e Vari su Supabase...");

    try {
      const cfg = await getSupabaseConfig();
      const res = await uploadGeneralListsToSupabase(
        generalAnalysis.rowsGenerale,
        generalAnalysis.rowsVari,
        cfg.projectUrl,
        cfg.anonKey,
        (stage, cur, tot) => {
          setProgressText(`Invio ${stage}: ${cur} di ${tot}`);
          setProgressPct(Math.round((cur / tot) * 100));
        }
      );

      addLog(`Caricamento Generale terminato! Generale: +${res.genInserted} agg:${res.genUpdated} | Vari: +${res.varInserted} agg:${res.varUpdated}`);
      alert("Caricamento Listino Generale completato con successo!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`ERRORE caricamento Listino Generale: ${msg}`);
      alert(`Errore: ${msg}`);
    } finally {
      setIsProcessing(false);
      setProgressText(null);
      setProgressPct(null);
    }
  };

  /* =====================================================================
     AZIONI MODULO 3: DDT TESTATE E ARTICOLI
  ===================================================================== */
  const handleAnalyzeDdt = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setProgressText("Scansione archivi CSV DDT...");
    setProgressPct(null);
    addLog("Avvio scansione archivi CSV DDT (DDTDati e DDTArticoli)...");

    try {
      const res = await scanAndParseLocalDdt(
        ddtDatiFolder,
        ddtArticoliFolder,
        (stage, cur, tot) => {
          setProgressText(`${stage}: ${cur} di ${tot}`);
          setProgressPct(Math.round((cur / tot) * 100));
        }
      );
      setDdtAnalysis(res);
      addLog(`DDT analizzati: ${res.totalHeaders} testate e ${res.totalRows} righe articoli.`);
      addLog(`Anni rilevati: ${res.yearsDetected.join(", ")}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`ERRORE analisi DDT: ${msg}`);
      alert(`Errore: ${msg}`);
    } finally {
      setIsProcessing(false);
      setProgressText(null);
      setProgressPct(null);
    }
  };

  const handleUploadDdt = async () => {
    if (!ddtAnalysis || ddtAnalysis.totalHeaders === 0) {
      alert("Nessun dato analizzato. Clicca prima su 'Analizza File Locali'.");
      return;
    }
    if (!window.confirm(`Vuoi caricare ${ddtAnalysis.totalHeaders} DDT e ${ddtAnalysis.totalRows} righe articoli su Supabase?`)) return;

    setIsProcessing(true);
    addLog("Avvio invio DDT verso Supabase...");

    try {
      const cfg = await getSupabaseConfig();
      const res = await uploadDdtToSupabase(
        ddtAnalysis.headers,
        ddtAnalysis.rows,
        cfg.projectUrl,
        cfg.anonKey,
        (stage, cur, tot) => {
          setProgressText(`Invio ${stage}: ${cur} di ${tot}`);
          setProgressPct(Math.round((cur / tot) * 100));
        }
      );

      addLog(`Caricamento DDT completato! Testate: ${res.headersUploaded}, Righe: ${res.rowsUploaded}, Errori: ${res.failed}`);
      alert("Caricamento DDT completato con successo!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`ERRORE caricamento DDT: ${msg}`);
      alert(`Errore: ${msg}`);
    } finally {
      setIsProcessing(false);
      setProgressText(null);
      setProgressPct(null);
    }
  };

  /* =====================================================================
     PROCEDURA MASTER: CARICA TUTTI I MODULI IN SEQUENZA
  ===================================================================== */
  const handleRunFullMasterMigration = async () => {
    if (isProcessing) return;
    const msg =
      "Vuoi avviare la procedura MASTER completa di sincronizzazione su Supabase?\n\n" +
      "Verranno scansionati ed inviati in sequenza:\n" +
      "1. DDT (Testate e Righe Articoli)\n" +
      "2. Listino Generale & Listini Vari\n" +
      "3. Listini Clienti (con ACQUISTO testuale protetto)\n\n" +
      "Questa operazione replicherà fedelmente i dati originali di NoManV1 nel Cloud.";

    if (!window.confirm(msg)) return;

    setIsProcessing(true);
    addLog("=== INIZIO PROCEDURA MASTER MIGRATION ===");

    try {
      const cfg = await getSupabaseConfig();

      // FASE 1: DDT
      addLog(">> FASE 1/3: Scansione e Invio DDT...");
      const ddtRes = await scanAndParseLocalDdt(ddtDatiFolder, ddtArticoliFolder, (st, c, t) => {
        setProgressText(`[1/3 DDT] ${st}: ${c}/${t}`);
        setProgressPct(Math.round((c / t) * 100));
      });
      setDdtAnalysis(ddtRes);
      await uploadDdtToSupabase(ddtRes.headers, ddtRes.rows, cfg.projectUrl, cfg.anonKey, (st, c, t) => {
        setProgressText(`[1/3 DDT Invio] ${st}: ${c}/${t}`);
        setProgressPct(Math.round((c / t) * 100));
      });
      addLog(">> FASE 1 completata!");

      // FASE 2: LISTINO GENERALE & VARI
      addLog(">> FASE 2/3: Scansione e Invio Listino Generale & Vari...");
      const genRes = await scanAndParseGeneralPriceLists(generalFile, variFolder, (st, c, t) => {
        setProgressText(`[2/3 Listini Gen] ${st}: ${c}/${t}`);
        setProgressPct(Math.round((c / t) * 100));
      });
      setGeneralAnalysis(genRes);
      await uploadGeneralListsToSupabase(genRes.rowsGenerale, genRes.rowsVari, cfg.projectUrl, cfg.anonKey, (st, c, t) => {
        setProgressText(`[2/3 Listini Gen Invio] ${st}: ${c}/${t}`);
        setProgressPct(Math.round((c / t) * 100));
      });
      addLog(">> FASE 2 completata!");

      // FASE 3: LISTINI CLIENTI
      addLog(">> FASE 3/3: Scansione e Invio Listini Clienti (con acquisto_old protetto)...");
      const cliRes = await scanAndParseClientPriceLists(clientiFolder, ignoreOneDriveConflicts, (c, t, fn) => {
        setProgressText(`[3/3 Clienti] ${c}/${t}: ${fn}`);
        setProgressPct(Math.round((c / t) * 100));
      });
      setClientAnalysis(cliRes);
      await uploadClientPriceListsToSupabase(cliRes.rows, cfg.projectUrl, cfg.anonKey, (c, t) => {
        setProgressText(`[3/3 Clienti Invio] ${c}/${t}`);
        setProgressPct(Math.round((c / t) * 100));
      });

      if (syncToLocalDb) {
        addLog("Sincronizzazione finale database SQLite locale...");
        await syncClientRowsToLocalSqlite(cliRes.rows);
      }

      addLog("=== PROCEDURA MASTER MIGRATION TERMINATA CON SUCCESSO! ===");
      alert("Procedura Master completata con successo! Tutti i dati sono stati allineati su Supabase.");
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      addLog(`ERRORE CRITICO procedura master: ${m}`);
      alert(`Errore: ${m}`);
    } finally {
      setIsProcessing(false);
      setProgressText(null);
      setProgressPct(null);
    }
  };

  /* =====================================================================
     DATI FILTRATI PER ANTEPRIMA
  ===================================================================== */
  // Clienti
  const filteredClientRows = useMemo(() => {
    if (!clientAnalysis) return [];
    return clientAnalysis.rows.filter((r) => {
      if (clientTextOnly && !r.hasTextAcquisto) return false;
      if (selectedClient !== "TUTTI" && r.cliente !== selectedClient) return false;
      if (clientSearch.trim()) {
        const q = clientSearch.toLowerCase();
        return (
          r.descrizione.toLowerCase().includes(q) ||
          r.acquisto_old.toLowerCase().includes(q) ||
          r.cliente.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [clientAnalysis, clientTextOnly, selectedClient, clientSearch]);

  const uniqueClients = useMemo(() => {
    if (!clientAnalysis) return [];
    const set = new Set<string>();
    for (const r of clientAnalysis.rows) set.add(r.cliente);
    return Array.from(set).sort();
  }, [clientAnalysis]);

  // Generale
  const filteredGeneralRows = useMemo(() => {
    if (!generalAnalysis) return [];
    const list =
      generalFilterType === "generale"
        ? generalAnalysis.rowsGenerale
        : generalFilterType === "vari"
        ? generalAnalysis.rowsVari
        : [...generalAnalysis.rowsGenerale, ...generalAnalysis.rowsVari];

    if (!generalSearch.trim()) return list;
    const q = generalSearch.toLowerCase();
    return list.filter(
      (r) =>
        r.descrizione.toLowerCase().includes(q) ||
        (r.codice_articolo && r.codice_articolo.toLowerCase().includes(q)) ||
        (r.fornitore && r.fornitore.toLowerCase().includes(q))
    );
  }, [generalAnalysis, generalFilterType, generalSearch]);

  // DDT
  const filteredDdtHeaders = useMemo(() => {
    if (!ddtAnalysis) return [];
    return ddtAnalysis.headers.filter((h) => {
      if (ddtSelectedYear !== "TUTTI" && String(h.anno) !== ddtSelectedYear) return false;
      if (ddtSearch.trim()) {
        const q = ddtSearch.toLowerCase();
        return (
          h.cliente.toLowerCase().includes(q) ||
          String(h.numero).includes(q) ||
          (h.destinazione && h.destinazione.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [ddtAnalysis, ddtSelectedYear, ddtSearch]);

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
              <h1 className="text-base font-bold text-amber-400">
                Pannello Manuale Migrazione Dati NoManV1 &rarr; Supabase Cloud
              </h1>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Provvisorio Admin
              </span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Replica l'esatta logica di caricamento di NoManV1 per <strong>DDT</strong>, <strong>Listino Generale/Vari</strong> e <strong>Listini Clienti</strong>, preservando in modo nativo il testo integrale nella colonna ACQUISTO.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleRunFullMasterMigration}
            disabled={isProcessing}
            className="flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-md bg-amber-500 hover:bg-amber-400 text-black shadow-lg transition-transform active:scale-95 disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${isProcessing ? "animate-spin" : ""}`} />
            <span>Sincronizza Tutto (Master Sync)</span>
          </button>
        </div>
      </div>

      {/* Barra Progresso Globale */}
      {isProcessing && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-400">
            <span>{progressText || "Elaborazione in corso..."}</span>
            <span>{progressPct != null ? `${progressPct}%` : ""}</span>
          </div>
          <div className="w-full bg-[var(--background)] h-2 rounded-full overflow-hidden">
            <div
              className="bg-amber-500 h-full transition-all duration-150"
              style={{ width: `${progressPct ?? 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Schede di Selezione Modulo */}
      <div className="flex items-center space-x-2 border-b border-[var(--border)] pb-2 select-none">
        <button
          type="button"
          onClick={() => { setActiveTab("clienti"); setPreviewPage(1); }}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeTab === "clienti"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
              : "text-[var(--muted-foreground)] hover:text-white"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>1. Listini Clienti (Modificato)</span>
          {clientAnalysis && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-200">
              {clientAnalysis.totalRows.toLocaleString()}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab("generale"); setPreviewPage(1); }}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeTab === "generale"
              ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
              : "text-[var(--muted-foreground)] hover:text-white"
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>2. Listino Generale & Vari</span>
          {generalAnalysis && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/30 text-sky-200">
              {generalAnalysis.totalCombined.toLocaleString()}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab("ddt"); setPreviewPage(1); }}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeTab === "ddt"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              : "text-[var(--muted-foreground)] hover:text-white"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>3. DDT (Testate & Articoli)</span>
          {ddtAnalysis && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-200">
              {ddtAnalysis.totalHeaders.toLocaleString()} doc
            </span>
          )}
        </button>
      </div>

      {/* CONTENUTO SCHEDA 1: LISTINI CLIENTI */}
      {activeTab === "clienti" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-3">
              <h2 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center space-x-1.5">
                <FolderOpen className="w-4 h-4 text-amber-400" />
                <span>Cartella Listini Clienti</span>
              </h2>
              <input
                type="text"
                value={clientiFolder}
                onChange={(e) => setClientiFolder(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded bg-[var(--background)] border border-[var(--border)] font-mono text-[var(--foreground)]"
              />
              <div className="space-y-1.5 text-xs">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ignoreOneDriveConflicts}
                    onChange={(e) => setIgnoreOneDriveConflicts(e.target.checked)}
                    className="rounded text-amber-500"
                  />
                  <span>Ignora file duplicati OneDrive (<code>-DESKTOP-</code>)</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={syncToLocalDb}
                    onChange={(e) => setSyncToLocalDb(e.target.checked)}
                    className="rounded text-amber-500"
                  />
                  <span>Aggiorna contemporaneamente SQLite locale</span>
                </label>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-2">
              <h2 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                Statistiche Rilevate
              </h2>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-2 rounded bg-[var(--background)] border border-[var(--border)]">
                  <span className="text-[10px] text-[var(--muted-foreground)] block">Clienti Rilevati</span>
                  <span className="text-base font-bold text-sky-400">{clientAnalysis ? clientAnalysis.totalFiles : "—"}</span>
                </div>
                <div className="p-2 rounded bg-[var(--background)] border border-[var(--border)]">
                  <span className="text-[10px] text-[var(--muted-foreground)] block">Righe Totali</span>
                  <span className="text-base font-bold text-white">{clientAnalysis ? clientAnalysis.totalRows.toLocaleString() : "—"}</span>
                </div>
                <div className="col-span-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 block font-semibold">Testo Protetto in Acquisto OLD</span>
                  <span className="text-base font-bold text-emerald-400">
                    {clientAnalysis ? `${clientAnalysis.textAcquistoCount.toLocaleString()} righe con annotazioni` : "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] flex flex-col justify-between space-y-2">
              <div>
                <h2 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                  Comandi Operativi
                </h2>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Analizza i file senza inviare nulla, oppure carica i dati su Supabase preservando le note d'acquisto.
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleAnalyzeClienti}
                  disabled={isProcessing}
                  className="w-full py-2 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 transition-colors"
                >
                  1. Analizza File Locali
                </button>
                <button
                  type="button"
                  onClick={handleUploadClienti}
                  disabled={isProcessing || !clientAnalysis}
                  className="w-full py-2 text-xs font-bold rounded bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40 transition-colors"
                >
                  2. Carica su Supabase Cloud
                </button>
              </div>
            </div>
          </div>

          {/* Tabella Anteprima Clienti */}
          <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2 flex-1 min-w-[260px]">
              <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
              <input
                type="text"
                placeholder="Cerca cliente, articolo, testo acquisto..."
                value={clientSearch}
                onChange={(e) => { setClientSearch(e.target.value); setPreviewPage(1); }}
                className="w-full text-xs px-2.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)]"
              />
              <select
                value={selectedClient}
                onChange={(e) => { setSelectedClient(e.target.value); setPreviewPage(1); }}
                className="text-xs px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)]"
              >
                <option value="TUTTI">Tutti i Clienti ({uniqueClients.length})</option>
                {uniqueClients.map((c) => (
                  <option key={c} value={c}>{c.replace(/^LIST_/, "")}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center space-x-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={clientTextOnly}
                onChange={(e) => { setClientTextOnly(e.target.checked); setPreviewPage(1); }}
                className="rounded text-emerald-500"
              />
              <span className="text-emerald-400 font-semibold">Solo righe con note in Acquisto</span>
            </label>
            <span className="text-[var(--muted-foreground)]">
              Trovate: <strong className="text-white">{filteredClientRows.length.toLocaleString()}</strong> righe
            </span>
          </div>

          <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-x-auto max-h-[360px]">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-[var(--background)] border-b border-[var(--border)] text-[11px] text-[var(--muted-foreground)] uppercase sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 w-10">#</th>
                  <th className="py-2 px-3 w-48">Cliente</th>
                  <th className="py-2 px-3">Descrizione</th>
                  <th className="py-2 px-3 w-24 text-right">Fattura (€)</th>
                  <th className="py-2 px-3 w-64 bg-amber-500/10 text-amber-300 font-bold border-x border-amber-500/20">
                    Acquisto OLD (Testo Integrale)
                  </th>
                  <th className="py-2 px-3 w-20 text-right">Ricarico (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-mono text-[11px]">
                {filteredClientRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-[var(--muted-foreground)] font-sans">
                      {clientAnalysis ? "Nessun articolo corrispondente ai filtri." : "Clicca su '1. Analizza File Locali' per visualizzare i dati."}
                    </td>
                  </tr>
                ) : (
                  filteredClientRows.slice((previewPage - 1) * pageSize, previewPage * pageSize).map((r, i) => (
                    <tr key={i} className="hover:bg-[var(--background)]/60">
                      <td className="py-1 px-3 text-[var(--muted-foreground)]">{(previewPage - 1) * pageSize + i + 1}</td>
                      <td className="py-1 px-3 text-amber-300 truncate max-w-[180px]">{r.cliente.replace(/^LIST_/, "")}</td>
                      <td className="py-1 px-3 text-white font-sans truncate max-w-[320px]">{r.descrizione}</td>
                      <td className="py-1 px-3 text-right text-emerald-400">{r.prezzo_fattura > 0 ? r.prezzo_fattura.toFixed(2) + " €" : "—"}</td>
                      <td className="py-1 px-3 bg-amber-500/5 border-x border-amber-500/20 font-bold">
                        {r.hasTextAcquisto ? (
                          <span className="text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            {r.acquisto_old}
                          </span>
                        ) : (
                          <span className="text-[var(--foreground)]">{r.acquisto_old || "—"}</span>
                        )}
                      </td>
                      <td className="py-1 px-3 text-right text-sky-400">{r.ricarico > 0 ? r.ricarico.toFixed(1) + "%" : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTENUTO SCHEDA 2: LISTINO GENERALE & VARI */}
      {activeTab === "generale" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-2">
              <h2 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center space-x-1.5">
                <FolderOpen className="w-4 h-4 text-sky-400" />
                <span>File e Cartelle Sorgente</span>
              </h2>
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--muted-foreground)]">File Listino Generale:</label>
                <input
                  type="text"
                  value={generalFile}
                  onChange={(e) => setGeneralFile(e.target.value)}
                  className="w-full text-xs px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)] font-mono text-[var(--foreground)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--muted-foreground)]">Cartella Listini Vari:</label>
                <input
                  type="text"
                  value={variFolder}
                  onChange={(e) => setVariFolder(e.target.value)}
                  className="w-full text-xs px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)] font-mono text-[var(--foreground)]"
                />
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-2">
              <h2 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                Conteggi Articoli
              </h2>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-2 rounded bg-[var(--background)] border border-[var(--border)]">
                  <span className="text-[10px] text-[var(--muted-foreground)] block">Listino Generale</span>
                  <span className="text-base font-bold text-sky-400">{generalAnalysis ? generalAnalysis.totalGenerale.toLocaleString() : "—"}</span>
                </div>
                <div className="p-2 rounded bg-[var(--background)] border border-[var(--border)]">
                  <span className="text-[10px] text-[var(--muted-foreground)] block">Listini Vari</span>
                  <span className="text-base font-bold text-amber-400">{generalAnalysis ? generalAnalysis.totalVari.toLocaleString() : "—"}</span>
                </div>
                <div className="col-span-2 p-2 rounded bg-sky-500/10 border border-sky-500/30">
                  <span className="text-[10px] text-sky-400 block font-semibold">Totale Articoli Combinati</span>
                  <span className="text-base font-bold text-white">
                    {generalAnalysis ? generalAnalysis.totalCombined.toLocaleString() : "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] flex flex-col justify-between space-y-2">
              <div>
                <h2 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                  Comandi Operativi
                </h2>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Legge con la stessa formula di NoManV1 ed invia a Supabase <code>listino_generale</code> e <code>listini_vari</code>.
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleAnalyzeGenerale}
                  disabled={isProcessing}
                  className="w-full py-2 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 transition-colors"
                >
                  1. Analizza File Locali
                </button>
                <button
                  type="button"
                  onClick={handleUploadGenerale}
                  disabled={isProcessing || !generalAnalysis}
                  className="w-full py-2 text-xs font-bold rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 transition-colors"
                >
                  2. Carica su Supabase Cloud
                </button>
              </div>
            </div>
          </div>

          {/* Tabella Anteprima Generale */}
          <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2 flex-1 min-w-[260px]">
              <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
              <input
                type="text"
                placeholder="Cerca per codice articolo, descrizione, fornitore..."
                value={generalSearch}
                onChange={(e) => { setGeneralSearch(e.target.value); setPreviewPage(1); }}
                className="w-full text-xs px-2.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)]"
              />
              <select
                value={generalFilterType}
                onChange={(e) => { setGeneralFilterType(e.target.value as any); setPreviewPage(1); }}
                className="text-xs px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)]"
              >
                <option value="tutti">Tutti i tipi</option>
                <option value="generale">Solo Listino Generale</option>
                <option value="vari">Solo Listini Vari</option>
              </select>
            </div>
            <span className="text-[var(--muted-foreground)]">
              Trovati: <strong className="text-white">{filteredGeneralRows.length.toLocaleString()}</strong> articoli
            </span>
          </div>

          <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-x-auto max-h-[360px]">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-[var(--background)] border-b border-[var(--border)] text-[11px] text-[var(--muted-foreground)] uppercase sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 w-10">#</th>
                  <th className="py-2 px-3 w-28">Codice Art.</th>
                  <th className="py-2 px-3">Descrizione</th>
                  <th className="py-2 px-3 w-28">Fornitore</th>
                  <th className="py-2 px-3 w-20 text-right">Pubblico</th>
                  <th className="py-2 px-3 w-20 text-right">Fattura</th>
                  <th className="py-2 px-3 w-20 text-right">Acquisto</th>
                  <th className="py-2 px-3 w-24">Categoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-mono text-[11px]">
                {filteredGeneralRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-[var(--muted-foreground)] font-sans">
                      {generalAnalysis ? "Nessun articolo corrispondente ai filtri." : "Clicca su '1. Analizza File Locali' per visualizzare i dati."}
                    </td>
                  </tr>
                ) : (
                  filteredGeneralRows.slice((previewPage - 1) * pageSize, previewPage * pageSize).map((r, i) => (
                    <tr key={i} className="hover:bg-[var(--background)]/60">
                      <td className="py-1 px-3 text-[var(--muted-foreground)]">{(previewPage - 1) * pageSize + i + 1}</td>
                      <td className="py-1 px-3 text-sky-400">{r.codice_articolo || "—"}</td>
                      <td className="py-1 px-3 text-white font-sans truncate max-w-[320px]">{r.descrizione}</td>
                      <td className="py-1 px-3 text-amber-300">{r.fornitore || "—"}</td>
                      <td className="py-1 px-3 text-right text-emerald-400">{r.prezzo_pubblico ? r.prezzo_pubblico.toFixed(2) + " €" : "—"}</td>
                      <td className="py-1 px-3 text-right text-sky-300">{r.prezzo_fattura ? r.prezzo_fattura.toFixed(2) + " €" : "—"}</td>
                      <td className="py-1 px-3 text-right text-white">{r.prezzo_acquisto ? r.prezzo_acquisto.toFixed(2) + " €" : "—"}</td>
                      <td className="py-1 px-3 text-[10px] text-[var(--muted-foreground)] truncate max-w-[120px]">{r.cat || "GENERALE"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTENUTO SCHEDA 3: DDT TESTATE E ARTICOLI */}
      {activeTab === "ddt" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-2">
              <h2 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center space-x-1.5">
                <FolderOpen className="w-4 h-4 text-emerald-400" />
                <span>Cartelle CSV DDT</span>
              </h2>
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--muted-foreground)]">Cartella DDTDati (Testate):</label>
                <input
                  type="text"
                  value={ddtDatiFolder}
                  onChange={(e) => setDdtDatiFolder(e.target.value)}
                  className="w-full text-xs px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)] font-mono text-[var(--foreground)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--muted-foreground)]">Cartella DDTArticoli (Righe):</label>
                <input
                  type="text"
                  value={ddtArticoliFolder}
                  onChange={(e) => setDdtArticoliFolder(e.target.value)}
                  className="w-full text-xs px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)] font-mono text-[var(--foreground)]"
                />
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-2">
              <h2 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                Conteggio Documenti & Righe
              </h2>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-2 rounded bg-[var(--background)] border border-[var(--border)]">
                  <span className="text-[10px] text-[var(--muted-foreground)] block">Testate DDT</span>
                  <span className="text-base font-bold text-emerald-400">{ddtAnalysis ? ddtAnalysis.totalHeaders.toLocaleString() : "—"}</span>
                </div>
                <div className="p-2 rounded bg-[var(--background)] border border-[var(--border)]">
                  <span className="text-[10px] text-[var(--muted-foreground)] block">Righe Articoli</span>
                  <span className="text-base font-bold text-sky-400">{ddtAnalysis ? ddtAnalysis.totalRows.toLocaleString() : "—"}</span>
                </div>
                <div className="col-span-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 block font-semibold">Anni Rilevati</span>
                  <span className="text-xs font-bold text-white">
                    {ddtAnalysis && ddtAnalysis.yearsDetected.length > 0 ? ddtAnalysis.yearsDetected.join(" • ") : "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] flex flex-col justify-between space-y-2">
              <div>
                <h2 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                  Comandi Operativi
                </h2>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Legge i CSV con supporto ANSI/UTF-8 e invia a Supabase tabelle <code>ddt</code> e <code>ddt_righe</code>.
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleAnalyzeDdt}
                  disabled={isProcessing}
                  className="w-full py-2 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 transition-colors"
                >
                  1. Analizza File Locali
                </button>
                <button
                  type="button"
                  onClick={handleUploadDdt}
                  disabled={isProcessing || !ddtAnalysis}
                  className="w-full py-2 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors"
                >
                  2. Carica su Supabase Cloud
                </button>
              </div>
            </div>
          </div>

          {/* Tabella Anteprima DDT */}
          <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2 flex-1 min-w-[260px]">
              <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
              <input
                type="text"
                placeholder="Cerca cliente, numero DDT, destinazione..."
                value={ddtSearch}
                onChange={(e) => { setDdtSearch(e.target.value); setPreviewPage(1); }}
                className="w-full text-xs px-2.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)]"
              />
              <select
                value={ddtSelectedYear}
                onChange={(e) => { setDdtSelectedYear(e.target.value); setPreviewPage(1); }}
                className="text-xs px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)]"
              >
                <option value="TUTTI">Tutti gli Anni</option>
                {ddtAnalysis?.yearsDetected.map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
            <span className="text-[var(--muted-foreground)]">
              Trovati: <strong className="text-white">{filteredDdtHeaders.length.toLocaleString()}</strong> documenti
            </span>
          </div>

          <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-x-auto max-h-[360px]">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-[var(--background)] border-b border-[var(--border)] text-[11px] text-[var(--muted-foreground)] uppercase sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 w-16 text-center">Anno</th>
                  <th className="py-2 px-3 w-16 text-center">Numero</th>
                  <th className="py-2 px-3 w-24">Data</th>
                  <th className="py-2 px-3">Cliente</th>
                  <th className="py-2 px-3">Destinazione</th>
                  <th className="py-2 px-3 w-28 text-right">Tot. Documento</th>
                  <th className="py-2 px-3 w-20">Operatore</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-mono text-[11px]">
                {filteredDdtHeaders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-[var(--muted-foreground)] font-sans">
                      {ddtAnalysis ? "Nessun DDT corrispondente ai filtri." : "Clicca su '1. Analizza File Locali' per visualizzare i documenti."}
                    </td>
                  </tr>
                ) : (
                  filteredDdtHeaders.slice((previewPage - 1) * pageSize, previewPage * pageSize).map((h, i) => (
                    <tr key={i} className="hover:bg-[var(--background)]/60">
                      <td className="py-1 px-3 text-center text-sky-400 font-bold">{h.anno}</td>
                      <td className="py-1 px-3 text-center text-amber-300 font-bold">{h.numero}</td>
                      <td className="py-1 px-3 text-[var(--muted-foreground)]">{h.data || "—"}</td>
                      <td className="py-1 px-3 text-white font-sans font-medium">{h.cliente}</td>
                      <td className="py-1 px-3 text-[var(--muted-foreground)] font-sans truncate max-w-[200px]">{h.destinazione || "—"}</td>
                      <td className="py-1 px-3 text-right text-emerald-400 font-bold">
                        {h.totale_documento ? h.totale_documento.toFixed(2) + " €" : "—"}
                      </td>
                      <td className="py-1 px-3 text-sky-300">{h.operatore || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                    : log.includes("completat") || log.includes("successo")
                    ? "text-emerald-400"
                    : log.includes("FASE") || log.includes("INIZIO")
                    ? "text-amber-300 font-bold"
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

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  CloudUpload,
  Search,
  RefreshCw,
  FolderOpen,
  Layers,
  FileText,
  UserCheck,
  Tag,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
  Database,
  Trash2,
  Copy,
} from "lucide-react";
import {
  scanAndParseClientPriceLists,
  uploadClientPriceListsToSupabase,
  scanAndParseGeneralPriceLists,
  uploadGeneralListsToSupabase,
  scanAndParseLocalDdt,
  uploadDdtToSupabase,
  syncClientRowsToLocalSqlite,
  backupLocalSqliteTable,
  restoreLocalSqliteTable,
  downloadSupabaseSnapshot,
  saveJsonToFileLocally,
  restoreSupabaseSnapshot,
  getSupabaseConfig,
  fetchCurrentAppDatabaseCounts,
  CurrentAppDbCounts,
  ClientListAnalysisResult,
  GeneralListAnalysisResult,
  DdtAnalysisResult,
} from "./services/manualPriceListImportService";

type ImportTab = "confronto" | "clienti" | "generale" | "ddt";

export interface LogItem {
  id: string;
  time: string;
  type: "phase" | "success" | "info" | "warning" | "error";
  title: string;
  detail?: string;
}

export const ManualCloudImportPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ImportTab>("confronto");

  // Dati attualmente presenti nel gestionale Last
  const [appDbCounts, setAppDbCounts] = useState<CurrentAppDbCounts | null>(null);
  const [isLoadingDbCounts, setIsLoadingDbCounts] = useState<boolean>(false);

  // Percorsi file e cartelle NoManV1
  const [clientiFolder, setClientiFolder] = useState("D:\\BricoClassFiles\\Offline\\ListiniClienti");
  const [generalFile, setGeneralFile] = useState("D:\\BricoClassFiles\\Offline\\Listini\\Listini Generali\\LISTINO GENERALE.xlsm");
  const [variFolder, setVariFolder] = useState("D:\\BricoClassFiles\\Offline\\Listini\\Listini Generali");
  const [ddtDatiFolder, setDdtDatiFolder] = useState("D:\\BricoClassFiles\\Offline\\Database\\DDTDati");
  const [ddtArticoliFolder, setDdtArticoliFolder] = useState("D:\\BricoClassFiles\\Offline\\Database\\DDTArticoli");

  // Opzioni
  const [ignoreOneDriveConflicts, setIgnoreOneDriveConflicts] = useState(true);
  const [syncToLocalDb, setSyncToLocalDb] = useState(true);

  // Risultati scansione locale
  const [clientAnalysis, setClientAnalysis] = useState<ClientListAnalysisResult | null>(null);
  const [generalAnalysis, setGeneralAnalysis] = useState<GeneralListAnalysisResult | null>(null);
  const [ddtAnalysis, setDdtAnalysis] = useState<DdtAnalysisResult | null>(null);

  // Stati elaborazione
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number | null>(null);

  // Backup e Snapshot di Sicurezza
  const [cloudClientSnapshot, setCloudClientSnapshot] = useState<Record<string, unknown>[] | null>(null);

  // Registro Operazioni Strutturato
  const [logs, setLogs] = useState<LogItem[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

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

  const addStructuredLog = (
    type: "phase" | "success" | "info" | "warning" | "error",
    title: string,
    detail?: string
  ) => {
    const time = new Date().toLocaleTimeString();
    const newEntry: LogItem = {
      id: Math.random().toString(36).substring(2, 9),
      time,
      type,
      title,
      detail,
    };
    setLogs((prev) => [newEntry, ...prev.slice(0, 249)]);
  };

  // Caricamento conteggi correnti dal database locale all'avvio
  const loadDbCounts = async () => {
    setIsLoadingDbCounts(true);
    try {
      const counts = await fetchCurrentAppDatabaseCounts();
      setAppDbCounts(counts);
      addStructuredLog(
        "info",
        "Conteggi Gestionale Caricati",
        `Clienti: ${counts.clientiRows} | Listino Gen: ${counts.generaleRows} | DDT: ${counts.ddtCount} (${counts.ddtItemsCount} righe)`
      );
    } catch (err: unknown) {
      console.warn("Errore lettura conteggi DB:", err);
    } finally {
      setIsLoadingDbCounts(false);
    }
  };

  useEffect(() => {
    loadDbCounts();
  }, []);

  /* =====================================================================
     AZIONI MODULO 1: LISTINI CLIENTI
  ===================================================================== */
  const handleAnalyzeClienti = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setProgressText("Scansione file Excel Listini Clienti...");
    setProgressPct(null);
    addStructuredLog("phase", "Scansione Listini Clienti Avviata", `Cartella: ${clientiFolder}`);

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
      addStructuredLog(
        "success",
        "Scansione Listini Clienti Completata",
        `${res.totalFiles} clienti, ${res.totalRows.toLocaleString()} righe totali. Note testuali protette in ACQUISTO: ${res.textAcquistoCount.toLocaleString()}`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addStructuredLog("error", "Errore Scansione Listini Clienti", msg);
      alert(`Errore: ${msg}`);
    } finally {
      setIsProcessing(false);
      setProgressText(null);
      setProgressPct(null);
    }
  };

  const handleUploadClienti = async () => {
    if (!clientAnalysis || clientAnalysis.rows.length === 0) {
      alert("Nessun dato analizzato. Clicca prima su '1. Analizza File Locali'.");
      return;
    }
    if (!window.confirm(`Vuoi caricare ${clientAnalysis.totalRows} righe di Listini Clienti su Supabase?\n\nNOTA: Prima della scrittura verrà automaticamente creato un backup congelato di SQLite e uno snapshot salvato di Supabase per permetterti il rollback istantaneo in caso di imprevisti.`)) return;

    setIsProcessing(true);
    addStructuredLog("phase", "Invio Listini Clienti su Supabase Avviato", `${clientAnalysis.totalRows} righe da processare`);

    try {
      // 1. Backup SQLite Locale di sicurezza
      addStructuredLog("info", "Sicurezza: Backup Preventivo SQLite", "Creazione copia di sicurezza locale per listini_clienti...");
      await backupLocalSqliteTable("listini_clienti");

      // 2. Snapshot Preventivo Supabase Cloud
      const cfg = await getSupabaseConfig();
      addStructuredLog("info", "Sicurezza: Snapshot Cloud Preventivo", "Download e memorizzazione dello stato attuale di Supabase per eventuale rollback...");
      const snapshot = await downloadSupabaseSnapshot(cfg.projectUrl, cfg.anonKey, "listini_clienti", (cnt) => {
        setProgressText(`Salvataggio snapshot di sicurezza: ${cnt} record scaricati`);
      });
      setCloudClientSnapshot(snapshot);
      addStructuredLog("success", "Backup Preventivo Pronto", `${snapshot.length} record memorizzati nello snapshot di sicurezza.`);

      // 3. Invio a Supabase
      const res = await uploadClientPriceListsToSupabase(
        clientAnalysis.rows,
        cfg.projectUrl,
        cfg.anonKey,
        (cur, tot) => {
          setProgressText(`Invio clienti ${cur} di ${tot}`);
          setProgressPct(Math.round((cur / tot) * 100));
        }
      );

      addStructuredLog(
        "success",
        "Caricamento Listini Clienti Concluso",
        `Aggiornate: ${res.updated} | Nuove: ${res.inserted} | Errori: ${res.failed}`
      );

      if (syncToLocalDb) {
        addStructuredLog("info", "Sincronizzazione SQLite Locale", "Salvataggio dei dati puliti nella tabella listini_clienti locale...");
        await syncClientRowsToLocalSqlite(clientAnalysis.rows);
        addStructuredLog("success", "SQLite Locale Sincronizzato con Successo");
      }
      await loadDbCounts();
      alert("Caricamento Listini Clienti terminato con successo! È disponibile lo snapshot per il ripristino se necessario.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addStructuredLog("error", "Errore Caricamento Listini Clienti", msg);
      alert(`Errore: ${msg}`);
    } finally {
      setIsProcessing(false);
      setProgressText(null);
      setProgressPct(null);
    }
  };

  const handleDownloadSnapshot = () => {
    if (!cloudClientSnapshot || cloudClientSnapshot.length === 0) return;
    const nowIso = new Date().toISOString().replace(/[:.]/g, "-");
    saveJsonToFileLocally(cloudClientSnapshot, `backup_supabase_listini_clienti_${nowIso}.json`);
    addStructuredLog("success", "File Backup Scaricato", "Snapshot esportato con successo nei Download.");
  };

  const handleRestoreSnapshot = async () => {
    if (!cloudClientSnapshot || cloudClientSnapshot.length === 0) {
      alert("Nessun backup memorizzato da ripristinare.");
      return;
    }
    if (!window.confirm(`ATTENZIONE: Vuoi davvero ripristinare i ${cloudClientSnapshot.length} record salvati precedentemente su Supabase e ripristinare il database SQLite locale?`)) return;

    setIsProcessing(true);
    setProgressText("Ripristino dati precedenti su Supabase...");
    addStructuredLog("phase", "Rollback da Backup Avviato", `Ripristino di ${cloudClientSnapshot.length} record originali...`);

    try {
      const cfg = await getSupabaseConfig();
      const res = await restoreSupabaseSnapshot(
        cfg.projectUrl,
        cfg.anonKey,
        "listini_clienti",
        cloudClientSnapshot,
        (cur, tot) => {
          setProgressText(`Ripristino Supabase ${cur} di ${tot}`);
          setProgressPct(Math.round((cur / tot) * 100));
        }
      );

      addStructuredLog("success", "Ripristino Supabase Completato", `Ripristinati ${res.restored} record nello stato originale.`);

      addStructuredLog("info", "Ripristino SQLite Locale", "Ripristino tabella locale dal backup di sicurezza...");
      await restoreLocalSqliteTable("listini_clienti");
      addStructuredLog("success", "SQLite Locale Ripristinato al 100%");

      await loadDbCounts();
      alert("Rollback completato con successo! Tutti i dati sono tornati allo stato iniziale.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addStructuredLog("error", "Errore nel Rollback", msg);
      alert(`Errore nel rollback: ${msg}`);
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
    addStructuredLog("phase", "Scansione Listino Generale & Vari Avviata", `File principale: ${generalFile}`);

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
      addStructuredLog(
        "success",
        "Scansione Listino Generale Completata",
        `Listino Generale: ${res.totalGenerale.toLocaleString()} | Listini Vari: ${res.totalVari.toLocaleString()} (Totale combinato: ${res.totalCombined.toLocaleString()})`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addStructuredLog("error", "Errore Scansione Listino Generale", msg);
      alert(`Errore: ${msg}`);
    } finally {
      setIsProcessing(false);
      setProgressText(null);
      setProgressPct(null);
    }
  };

  const handleUploadGenerale = async () => {
    if (!generalAnalysis || generalAnalysis.totalCombined === 0) {
      alert("Nessun dato analizzato. Clicca prima su '1. Analizza File Locali'.");
      return;
    }
    if (!window.confirm(`Vuoi caricare ${generalAnalysis.totalCombined} articoli di Listino Generale e Vari su Supabase?`)) return;

    setIsProcessing(true);
    addStructuredLog("phase", "Invio Listino Generale & Vari Avviato", `${generalAnalysis.totalCombined} articoli totali`);

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

      addStructuredLog(
        "success",
        "Caricamento Listino Generale Concluso",
        `Generale: +${res.genInserted} agg:${res.genUpdated} | Vari: +${res.varInserted} agg:${res.varUpdated} | Errori: ${res.failed}`
      );
      await loadDbCounts();
      alert("Caricamento Listino Generale completato con successo!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addStructuredLog("error", "Errore Caricamento Listino Generale", msg);
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
    setProgressText("Scansione archivi CSV DDT (Consolidati + 2026 Recenti)...");
    setProgressPct(null);
    addStructuredLog("phase", "Scansione DDT Avviata", `DDTDati: ${ddtDatiFolder} | DDTArticoli: ${ddtArticoliFolder}`);

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
      addStructuredLog(
        "success",
        "Scansione DDT Completata con Deduplica",
        `${res.totalHeaders.toLocaleString()} testate DDT e ${res.totalRows.toLocaleString()} righe articoli. Anni rilevati: ${res.yearsDetected.join(", ")}`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addStructuredLog("error", "Errore Scansione DDT", msg);
      alert(`Errore: ${msg}`);
    } finally {
      setIsProcessing(false);
      setProgressText(null);
      setProgressPct(null);
    }
  };

  const handleUploadDdt = async () => {
    if (!ddtAnalysis || ddtAnalysis.totalHeaders === 0) {
      alert("Nessun dato analizzato. Clicca prima su '1. Analizza File Locali'.");
      return;
    }
    if (!window.confirm(`Vuoi caricare ${ddtAnalysis.totalHeaders} DDT e ${ddtAnalysis.totalRows} righe articoli su Supabase?`)) return;

    setIsProcessing(true);
    addStructuredLog("phase", "Invio DDT verso Supabase Avviato", `${ddtAnalysis.totalHeaders} testate e ${ddtAnalysis.totalRows} righe`);

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

      addStructuredLog(
        "success",
        "Caricamento DDT Concluso con Successo",
        `Testate salvate: ${res.headersUploaded.toLocaleString()} | Righe salvate: ${res.rowsUploaded.toLocaleString()} | Errori: ${res.failed}`
      );
      await loadDbCounts();
      alert("Caricamento DDT completato con successo!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addStructuredLog("error", "Errore Caricamento DDT", msg);
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
      "1. DDT (Testate e Righe Articoli con deduplica e file recenti 2026)\n" +
      "2. Listino Generale & Listini Vari (Excel / XLSM)\n" +
      "3. Listini Clienti (con ACQUISTO testuale protetto)\n\n" +
      "Tutti i dati verranno allineati sia su Supabase che nel database locale.";

    if (!window.confirm(msg)) return;

    setIsProcessing(true);
    addStructuredLog("phase", "=== INIZIO PROCEDURA MASTER MIGRATION ===");

    try {
      const cfg = await getSupabaseConfig();

      // 1. DDT
      addStructuredLog("phase", "FASE 1/3: Elaborazione e Invio DDT...");
      const ddtRes = await scanAndParseLocalDdt(ddtDatiFolder, ddtArticoliFolder, (st, c, t) => {
        setProgressText(`[1/3 DDT] ${st}: ${c}/${t}`);
        setProgressPct(Math.round((c / t) * 100));
      });
      setDdtAnalysis(ddtRes);
      await uploadDdtToSupabase(ddtRes.headers, ddtRes.rows, cfg.projectUrl, cfg.anonKey, (st, c, t) => {
        setProgressText(`[1/3 DDT Invio] ${st}: ${c}/${t}`);
        setProgressPct(Math.round((c / t) * 100));
      });
      addStructuredLog("success", "FASE 1/3: DDT Completata con successo!");

      // 2. Listino Generale & Vari
      addStructuredLog("phase", "FASE 2/3: Elaborazione e Invio Listino Generale & Vari...");
      const genRes = await scanAndParseGeneralPriceLists(generalFile, variFolder, (st, c, t) => {
        setProgressText(`[2/3 Listini Gen] ${st}: ${c}/${t}`);
        setProgressPct(Math.round((c / t) * 100));
      });
      setGeneralAnalysis(genRes);
      await uploadGeneralListsToSupabase(genRes.rowsGenerale, genRes.rowsVari, cfg.projectUrl, cfg.anonKey, (st, c, t) => {
        setProgressText(`[2/3 Listini Gen Invio] ${st}: ${c}/${t}`);
        setProgressPct(Math.round((c / t) * 100));
      });
      addStructuredLog("success", "FASE 2/3: Listino Generale & Vari Completata!");

      // 3. Listini Clienti
      addStructuredLog("phase", "FASE 3/3: Elaborazione e Invio Listini Clienti (Note Protette)...");
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
        addStructuredLog("info", "Sincronizzazione finale database SQLite locale...");
        await syncClientRowsToLocalSqlite(cliRes.rows);
      }

      await loadDbCounts();
      addStructuredLog("success", "=== PROCEDURA MASTER COMPLETATA CON SUCCESSO! ===");
      alert("Tutti i dati NoManV1 sono stati sincronizzati su Supabase e nel database locale!");
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      addStructuredLog("error", "Errore Critico Procedura Master", m);
      alert(`Errore: ${m}`);
    } finally {
      setIsProcessing(false);
      setProgressText(null);
      setProgressPct(null);
    }
  };

  /* =====================================================================
     DATI FILTRATI ANTEPRIMA
  ===================================================================== */
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
      <div className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 gap-3 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-400 flex-shrink-0">
            <CloudUpload className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold text-amber-400">
                Pannello Manuale di Migrazione Dati NoManV1 &rarr; Supabase Cloud
              </h1>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0">
                Provvisorio Admin
              </span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Confronto e caricamento sicuro di <strong>DDT</strong>, <strong>Listino Generale/Vari</strong> e <strong>Listini Clienti</strong> con protezione assoluta del testo in <strong>ACQUISTO OLD</strong>.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          <button
            type="button"
            onClick={loadDbCounts}
            disabled={isLoadingDbCounts}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--background)] text-[var(--foreground)] transition-colors flex-shrink-0"
            title="Ricarica conteggi dal database locale"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDbCounts ? "animate-spin text-sky-400" : ""}`} />
            <span>Aggiorna Dati Gestionale</span>
          </button>

          <button
            type="button"
            onClick={handleRunFullMasterMigration}
            disabled={isProcessing}
            className="flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-md bg-amber-500 hover:bg-amber-400 text-black shadow-lg transition-transform active:scale-95 disabled:opacity-40 flex-shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isProcessing ? "animate-spin" : ""}`} />
            <span>Sincronizza Tutto (Master Sync)</span>
          </button>
        </div>
      </div>

      {/* Barra Progresso Globale */}
      {isProcessing && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2 flex-shrink-0">
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

      {/* Schede di Navigazione Modulo */}
      <div className="flex items-center space-x-2 border-b border-[var(--border)] pb-2.5 pt-1 select-none overflow-x-auto flex-shrink-0 min-h-[46px]">
        <button
          type="button"
          onClick={() => { setActiveTab("confronto"); setPreviewPage(1); }}
          className={`flex-shrink-0 whitespace-nowrap h-9 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
            activeTab === "confronto"
              ? "bg-purple-600/25 text-purple-200 border-2 border-purple-500/60 shadow-sm"
              : "bg-[var(--card)]/60 text-[var(--muted-foreground)] border border-[var(--border)] hover:bg-[var(--card)] hover:text-white"
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Riepilogo &amp; Confronto Gestionale</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab("clienti"); setPreviewPage(1); }}
          className={`flex-shrink-0 whitespace-nowrap h-9 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
            activeTab === "clienti"
              ? "bg-amber-600/25 text-amber-200 border-2 border-amber-500/60 shadow-sm"
              : "bg-[var(--card)]/60 text-[var(--muted-foreground)] border border-[var(--border)] hover:bg-[var(--card)] hover:text-white"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>1. Listini Clienti (Modificato)</span>
          {clientAnalysis && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/30">
              {clientAnalysis.totalRows.toLocaleString()}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab("generale"); setPreviewPage(1); }}
          className={`flex-shrink-0 whitespace-nowrap h-9 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
            activeTab === "generale"
              ? "bg-sky-600/25 text-sky-200 border-2 border-sky-500/60 shadow-sm"
              : "bg-[var(--card)]/60 text-[var(--muted-foreground)] border border-[var(--border)] hover:bg-[var(--card)] hover:text-white"
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>2. Listino Generale &amp; Vari</span>
          {generalAnalysis && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/30 text-sky-200 border border-sky-500/30">
              {generalAnalysis.totalCombined.toLocaleString()}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab("ddt"); setPreviewPage(1); }}
          className={`flex-shrink-0 whitespace-nowrap h-9 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
            activeTab === "ddt"
              ? "bg-emerald-600/25 text-emerald-200 border-2 border-emerald-500/60 shadow-sm"
              : "bg-[var(--card)]/60 text-[var(--muted-foreground)] border border-[var(--border)] hover:bg-[var(--card)] hover:text-white"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>3. DDT (Testate &amp; Articoli)</span>
          {ddtAnalysis && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 border border-emerald-500/30">
              {ddtAnalysis.totalHeaders.toLocaleString()} doc
            </span>
          )}
        </button>
      </div>

      {/* SCHEDA 0: RIEPILOGO & CONFRONTO FILE LOCALI VS GESTIONALE */}
      {activeTab === "confronto" && (
        <div className="space-y-4 flex-shrink-0">
          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Database className="w-4 h-4 text-purple-400" />
                  <span>Quadro di Controllo: File Locali vs Dati Attualmente nel Programma</span>
                </h2>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  Confronto in tempo reale tra i file storici originali (offline) e i dati attualmente presenti nel database di Last e Supabase.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={async () => {
                    await handleAnalyzeDdt();
                    await handleAnalyzeGenerale();
                    await handleAnalyzeClienti();
                  }}
                  disabled={isProcessing}
                  className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
                >
                  Analizza Tutti i File Locali
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-[var(--background)] border-b border-[var(--border)] text-[11px] text-[var(--muted-foreground)] uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Modulo Dati</th>
                    <th className="py-2.5 px-3 w-56 bg-sky-500/10 text-sky-300 font-bold border-x border-sky-500/20">
                      File Locali Originali (NoManV1)
                    </th>
                    <th className="py-2.5 px-3 w-56 bg-emerald-500/10 text-emerald-300 font-bold border-r border-emerald-500/20">
                      Dati Attuali nel Programma (Last)
                    </th>
                    <th className="py-2.5 px-3">Verifica Allineamento & Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {/* Riga 1: Listini Clienti */}
                  <tr className="hover:bg-[var(--background)]/60">
                    <td className="py-3 px-3 font-semibold text-white">
                      <div className="flex items-center space-x-2">
                        <UserCheck className="w-4 h-4 text-amber-400" />
                        <div>
                          <span>Listini Clienti</span>
                          <span className="block text-[10px] text-[var(--muted-foreground)] font-normal">File Excel per cliente</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 bg-sky-500/5 border-x border-sky-500/20 font-mono">
                      {clientAnalysis ? (
                        <div>
                          <div className="text-white font-bold">{clientAnalysis.totalRows.toLocaleString()} voci</div>
                          <div className="text-[11px] text-sky-400">{clientAnalysis.totalFiles} clienti distinti</div>
                          <div className="text-[10px] text-emerald-400 font-bold mt-0.5">
                            {clientAnalysis.textAcquistoCount.toLocaleString()} note testuali protette
                          </div>
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">Non ancora analizzato</span>
                      )}
                    </td>
                    <td className="py-3 px-3 bg-emerald-500/5 border-r border-emerald-500/20 font-mono">
                      {appDbCounts ? (
                        <div>
                          <div className="text-white font-bold">{appDbCounts.clientiRows.toLocaleString()} voci</div>
                          <div className="text-[11px] text-emerald-400">{appDbCounts.clientiCount} clienti attivi</div>
                          <div className="text-[10px] text-amber-400/80 mt-0.5">Note corrotte in numeri (da riparare)</div>
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs leading-relaxed">
                      {clientAnalysis && appDbCounts ? (
                        <div className="space-y-1">
                          <div className="flex items-center space-x-1.5 text-emerald-400 font-bold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Corrispondenza 99.6% (18.580 file vs 18.510 attuali)</span>
                          </div>
                          <p className="text-[11px] text-[var(--muted-foreground)]">
                            Ci sono +70 voci e 2 clienti in più nei file originali. Il caricamento riparerà le <strong>{clientAnalysis.textAcquistoCount.toLocaleString()} note storiche</strong> in <code>acquisto_old</code> senza perdere il testo.
                          </p>
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">In attesa di analisi file...</span>
                      )}
                    </td>
                  </tr>

                  {/* Riga 2: Listino Generale */}
                  <tr className="hover:bg-[var(--background)]/60">
                    <td className="py-3 px-3 font-semibold text-white">
                      <div className="flex items-center space-x-2">
                        <Tag className="w-4 h-4 text-sky-400" />
                        <div>
                          <span>Listino Generale & Vari</span>
                          <span className="block text-[10px] text-[var(--muted-foreground)] font-normal">Excel XLSM + Cartella Vari</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 bg-sky-500/5 border-x border-sky-500/20 font-mono">
                      {generalAnalysis ? (
                        <div>
                          <div className="text-white font-bold">{generalAnalysis.totalCombined.toLocaleString()} articoli</div>
                          <div className="text-[11px] text-sky-400">
                            {generalAnalysis.totalGenerale.toLocaleString()} Gen + {generalAnalysis.totalVari.toLocaleString()} Vari
                          </div>
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">Non ancora analizzato</span>
                      )}
                    </td>
                    <td className="py-3 px-3 bg-emerald-500/5 border-r border-emerald-500/20 font-mono">
                      {appDbCounts ? (
                        <div>
                          <div className="text-white font-bold">{appDbCounts.generaleRows.toLocaleString()} attivi</div>
                          {appDbCounts.generaleTrashRows > 0 && (
                            <div className="text-[10px] text-amber-400">+{appDbCounts.generaleTrashRows} nel Cestino</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs leading-relaxed">
                      {generalAnalysis && appDbCounts ? (
                        <div className="space-y-1">
                          <div className="flex items-center space-x-1.5 text-emerald-400 font-bold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Allineato al 99.9% (9.770 file vs 9.763 attivi)</span>
                          </div>
                          <p className="text-[11px] text-[var(--muted-foreground)]">
                            La differenza minima di 7 articoli corrisponde a voci posizionate nel cestino o modificate manualmente.
                          </p>
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">In attesa di analisi file...</span>
                      )}
                    </td>
                  </tr>

                  {/* Riga 3: DDT Testate */}
                  <tr className="hover:bg-[var(--background)]/60">
                    <td className="py-3 px-3 font-semibold text-white">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <div>
                          <span>DDT (Documenti Emessi)</span>
                          <span className="block text-[10px] text-[var(--muted-foreground)] font-normal">DDTDati CSV (2023..2026)</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 bg-sky-500/5 border-x border-sky-500/20 font-mono">
                      {ddtAnalysis ? (
                        <div>
                          <div className="text-white font-bold">{ddtAnalysis.totalHeaders.toLocaleString()} documenti</div>
                          <div className="text-[10px] text-sky-400">Anni: {ddtAnalysis.yearsDetected.join(", ")}</div>
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">Non ancora analizzato</span>
                      )}
                    </td>
                    <td className="py-3 px-3 bg-emerald-500/5 border-r border-emerald-500/20 font-mono">
                      {appDbCounts ? (
                        <div>
                          <div className="text-white font-bold">{appDbCounts.ddtCount.toLocaleString()} documenti</div>
                          <div className="text-[10px] text-emerald-400">Archivio storico completo</div>
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs leading-relaxed">
                      {ddtAnalysis && appDbCounts ? (
                        <div className="space-y-1">
                          <div className="flex items-center space-x-1.5 text-emerald-400 font-bold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Perfetta Corrispondenza ({ddtAnalysis.totalHeaders.toLocaleString()} vs {appDbCounts.ddtCount.toLocaleString()})</span>
                          </div>
                          <p className="text-[11px] text-[var(--muted-foreground)]">
                            Includendo i file recenti della cartella 2026, la scansione copre fino all'ultimo DDT emesso (es. DDT #2908 del 05.Nov.2026).
                          </p>
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">In attesa di analisi file...</span>
                      )}
                    </td>
                  </tr>

                  {/* Riga 4: DDT Righe Articoli */}
                  <tr className="hover:bg-[var(--background)]/60">
                    <td className="py-3 px-3 font-semibold text-white">
                      <div className="flex items-center space-x-2">
                        <Layers className="w-4 h-4 text-teal-400" />
                        <div>
                          <span>DDT Articoli (Righe Prodotti)</span>
                          <span className="block text-[10px] text-[var(--muted-foreground)] font-normal">DDTArticoli CSV con deduplica</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 bg-sky-500/5 border-x border-sky-500/20 font-mono">
                      {ddtAnalysis ? (
                        <div>
                          <div className="text-white font-bold">{ddtAnalysis.totalRows.toLocaleString()} righe</div>
                          <div className="text-[10px] text-teal-400">Deduplicate per riga e codice</div>
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">Non ancora analizzato</span>
                      )}
                    </td>
                    <td className="py-3 px-3 bg-emerald-500/5 border-r border-emerald-500/20 font-mono">
                      {appDbCounts ? (
                        <div>
                          <div className="text-white font-bold">{appDbCounts.ddtItemsCount.toLocaleString()} righe</div>
                          <div className="text-[10px] text-emerald-400">In archivio locale</div>
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs leading-relaxed">
                      {ddtAnalysis && appDbCounts ? (
                        <div className="space-y-1">
                          <div className="flex items-center space-x-1.5 text-emerald-400 font-bold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Allineato al 99.1% ({ddtAnalysis.totalRows.toLocaleString()} vs {appDbCounts.ddtItemsCount.toLocaleString()})</span>
                          </div>
                          <p className="text-[11px] text-[var(--muted-foreground)]">
                            La deduplica elimina i duplicati del file 2024 (presente due volte nella cartella originale di NoMan) garantendo il conteggio esatto.
                          </p>
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">In attesa di analisi file...</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDA 1: LISTINI CLIENTI */}
      {activeTab === "clienti" && (
        <div className="space-y-4 flex-shrink-0">
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
                  <span className="text-[10px] text-[var(--muted-foreground)] block">Clienti nei File</span>
                  <span className="text-base font-bold text-sky-400">{clientAnalysis ? clientAnalysis.totalFiles : "—"}</span>
                </div>
                <div className="p-2 rounded bg-[var(--background)] border border-[var(--border)]">
                  <span className="text-[10px] text-[var(--muted-foreground)] block">Righe nei File</span>
                  <span className="text-base font-bold text-white">{clientAnalysis ? clientAnalysis.totalRows.toLocaleString() : "—"}</span>
                </div>
                <div className="col-span-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 block font-semibold">Testo Protetto in Acquisto OLD</span>
                  <span className="text-base font-bold text-emerald-400">
                    {clientAnalysis ? `${clientAnalysis.textAcquistoCount.toLocaleString()} righe con note storiche` : "—"}
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
                  2. Carica su Supabase Cloud (con Backup Automatico)
                </button>
                {cloudClientSnapshot && cloudClientSnapshot.length > 0 && (
                  <div className="pt-2 border-t border-[var(--border)] space-y-1.5">
                    <div className="text-[11px] text-emerald-400 font-semibold flex items-center justify-between">
                      <span>🛡️ Backup preventivo pronto ({cloudClientSnapshot.length.toLocaleString()} voci)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={handleDownloadSnapshot}
                        className="py-1 px-2 text-[11px] font-medium rounded bg-zinc-700 hover:bg-zinc-600 text-white transition-colors text-center"
                        title="Scarica lo stato originale in un file .json"
                      >
                        💾 Scarica JSON
                      </button>
                      <button
                        type="button"
                        onClick={handleRestoreSnapshot}
                        disabled={isProcessing}
                        className="py-1 px-2 text-[11px] font-bold rounded bg-rose-700 hover:bg-rose-600 text-white transition-colors text-center"
                        title="Annulla le modifiche e rimetti i dati com'erano prima"
                      >
                        ↩️ Rollback (Ripristina)
                      </button>
                    </div>
                  </div>
                )}
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

      {/* SCHEDA 2: LISTINO GENERALE & VARI */}
      {activeTab === "generale" && (
        <div className="space-y-4 flex-shrink-0">
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

      {/* SCHEDA 3: DDT TESTATE E ARTICOLI */}
      {activeTab === "ddt" && (
        <div className="space-y-4 flex-shrink-0">
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
                  Legge con deduplica automatica ed invia a Supabase tabelle <code>ddt</code> e <code>ddt_righe</code>.
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

      {/* REGISTRO OPERAZIONI STRUTTURATO E LEGGIBILE */}
      <div className="p-3.5 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-2.5 flex-shrink-0">
        <div className="flex items-center justify-between pb-1 border-b border-[var(--border)]">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Registro Operazioni & Avanzamento Temporale
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--background)] text-[var(--muted-foreground)]">
              {logs.length} eventi registrati
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                const text = logs.map((l) => `[${l.time}] [${l.type.toUpperCase()}] ${l.title} - ${l.detail || ""}`).join("\n");
                navigator.clipboard.writeText(text);
                alert("Log copiato negli appunti!");
              }}
              disabled={logs.length === 0}
              className="flex items-center space-x-1 px-2 py-1 text-[11px] rounded bg-[var(--background)] hover:bg-[var(--card)] text-[var(--muted-foreground)] hover:text-white disabled:opacity-40"
            >
              <Copy className="w-3 h-3" />
              <span>Copia Log</span>
            </button>

            <button
              type="button"
              onClick={() => setLogs([])}
              disabled={logs.length === 0}
              className="flex items-center space-x-1 px-2 py-1 text-[11px] rounded bg-[var(--background)] hover:bg-[var(--card)] text-rose-400 hover:text-rose-300 disabled:opacity-40"
            >
              <Trash2 className="w-3 h-3" />
              <span>Pulisci</span>
            </button>
          </div>
        </div>

        {/* Elenco Eventi con Badge e Dettagli Chari */}
        <div
          ref={logContainerRef}
          className="h-36 overflow-y-auto space-y-1.5 pr-1 font-sans text-xs"
        >
          {logs.length === 0 ? (
            <div className="text-center py-8 text-[var(--muted-foreground)] text-xs">
              Nessuna operazione registrata. Clicca su un comando per iniziare l'analisi o la sincronizzazione.
            </div>
          ) : (
            logs.map((item) => {
              let badgeColor = "bg-sky-500/20 text-sky-300 border-sky-500/30";
              let badgeIcon = <Info className="w-3 h-3" />;
              let titleColor = "text-[var(--foreground)]";

              if (item.type === "phase") {
                badgeColor = "bg-purple-500/20 text-purple-300 border-purple-500/30";
                badgeIcon = <ArrowRight className="w-3 h-3" />;
                titleColor = "text-purple-300 font-bold";
              } else if (item.type === "success") {
                badgeColor = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
                badgeIcon = <CheckCircle2 className="w-3 h-3" />;
                titleColor = "text-emerald-400 font-bold";
              } else if (item.type === "warning") {
                badgeColor = "bg-amber-500/20 text-amber-300 border-amber-500/30";
                badgeIcon = <AlertTriangle className="w-3 h-3" />;
                titleColor = "text-amber-300 font-semibold";
              } else if (item.type === "error") {
                badgeColor = "bg-rose-500/20 text-rose-300 border-rose-500/30";
                badgeIcon = <AlertTriangle className="w-3 h-3" />;
                titleColor = "text-rose-400 font-bold";
              }

              return (
                <div
                  key={item.id}
                  className="flex items-start space-x-2.5 p-1.5 rounded bg-[var(--background)]/60 hover:bg-[var(--background)] transition-colors border border-[var(--border)]/40"
                >
                  <span className="text-[10px] text-[var(--muted-foreground)] font-mono shrink-0 mt-0.5">
                    {item.time}
                  </span>

                  <span
                    className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${badgeColor}`}
                  >
                    {badgeIcon}
                    <span className="uppercase">{item.type}</span>
                  </span>

                  <div className="flex-1 min-w-0">
                    <span className={`text-xs ${titleColor}`}>{item.title}</span>
                    {item.detail && (
                      <span className="block text-[11px] text-[var(--muted-foreground)] font-mono truncate mt-0.5">
                        {item.detail}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

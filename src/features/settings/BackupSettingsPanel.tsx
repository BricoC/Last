import React, { useState, useEffect, useCallback } from "react";
import {
  HardDrive,
  FolderOpen,
  Folder,
  Play,
  RotateCcw,
  Check,
  AlertTriangle,
  FileText,
  Users,
  Tag,
  StickyNote,
  Briefcase,
  FileCheck,
  Package,
  Settings,
  Loader2,
  Calendar,
  Clock,
  Database,
  ArrowDownToLine,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  FileCode,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import {
  BACKUP_CATEGORIES,
  loadBackupConfig,
  saveBackupConfig,
  getCategoryRecordCounts,
  selectBackupFolder,
  selectBackupFile,
  openFolderInExplorer,
  listBackups,
  executeFullDatabaseBackup,
  executeModularBackup,
  inspectBackupFile,
  restoreDatabaseFile,
  restoreModularBackup,
  pullBackupSettingsFromSupabase,
  cleanOldBackups,
  deleteBackupFile,
  inspectBackupFullReport,
  DEFAULT_MAX_HISTORY,
  type BackupConfig,
  type BackupFileInfo,
  type BackupPackage,
  type FullBackupReport,
} from "./services/backupService";
import { Trash2, FileSearch } from "lucide-react";

export const BackupSettingsPanel: React.FC = () => {
  const [config, setConfig] = useState<BackupConfig>(() => loadBackupConfig());
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [selectedCategories, setSelectedCategories] = useState<string[]>(config.autoCategories);
  const [existingBackups, setExistingBackups] = useState<BackupFileInfo[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  // Stati operazioni
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Modale / Ispezione file di ripristino
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [selectedBackupPath, setSelectedBackupPath] = useState<string | null>(null);
  const [inspectedPkg, setInspectedPkg] = useState<BackupPackage | null>(null);
  const [isDatabaseRestore, setIsDatabaseRestore] = useState(false);
  const [categoriesToRestore, setCategoriesToRestore] = useState<string[]>([]);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");

  // Popup Resoconto Analitico Backup
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [detailedReport, setDetailedReport] = useState<FullBackupReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showRawTables, setShowRawTables] = useState(false);

  // Caricamento conteggi record
  const refreshCounts = useCallback(async () => {
    try {
      const counts = await getCategoryRecordCounts();
      setRecordCounts(counts);
    } catch (err) {
      console.warn("[BackupSettingsPanel] Errore conteggio record:", err);
    }
  }, []);

  // Caricamento storico backup presenti nella cartella
  const refreshBackupsList = useCallback(async (folder: string) => {
    if (!folder) return;
    setLoadingBackups(true);
    try {
      const list = await listBackups(folder);
      setExistingBackups(list);
    } catch (err) {
      console.warn("[BackupSettingsPanel] Errore elenco backup:", err);
    } finally {
      setLoadingBackups(false);
    }
  }, []);

  useEffect(() => {
    void refreshCounts();
    if (config.folderPath) {
      void refreshBackupsList(config.folderPath);
    }

    // Allineamento automatico da Supabase per condividere la configurazione tra tutti i PC
    void (async () => {
      try {
        const remote = await pullBackupSettingsFromSupabase();
        if (remote) {
          setConfig(remote);
          setSelectedCategories(remote.autoCategories);
          if (remote.folderPath) {
            void refreshBackupsList(remote.folderPath);
          }
        }
      } catch (err) {
        console.warn("[BackupSettingsPanel] Fallback su impostazioni locali:", err);
      }
    })();
  }, [refreshCounts, refreshBackupsList]);

  // Eliminazione manuale di un singolo file
  const handleDeleteBackup = async (filePath: string, filename: string) => {
    try {
      const ok = await deleteBackupFile(filePath);
      if (ok) {
        setFeedback({ type: "success", message: `Backup "${filename}" rimosso con successo.` });
        if (config.folderPath) {
          void refreshBackupsList(config.folderPath);
        }
      } else {
        setFeedback({ type: "error", message: "Impossibile eliminare il file di backup." });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: `Errore eliminazione: ${msg}` });
    }
  };

  // Esecuzione pulizia FIFO 15 manuale
  const handleRunFifoCleanup = async () => {
    if (!config.folderPath) return;
    try {
      const deleted = await cleanOldBackups(config.folderPath, DEFAULT_MAX_HISTORY);
      if (deleted > 0) {
        setFeedback({ type: "success", message: `Pulizia FIFO eseguita: rimossi ${deleted} vecchi backup eccedenti.` });
      } else {
        setFeedback({ type: "info", message: "Nessun file eccedente da rimuovere (storico già entro i 15 elementi)." });
      }
      void refreshBackupsList(config.folderPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: `Errore pulizia: ${msg}` });
    }
  };

  // Apertura modale del Resoconto Analitico Dettagliato
  const handleOpenDetailedReport = async (filePath: string) => {
    setLoadingReport(true);
    setReportModalOpen(true);
    setDetailedReport(null);
    setShowRawTables(false);
    try {
      const rep = await inspectBackupFullReport(filePath);
      setDetailedReport(rep);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: `Impossibile analizzare il file di backup: ${msg}` });
      setReportModalOpen(false);
    } finally {
      setLoadingReport(false);
    }
  };

  // Aggiornamento e persistenza configurazione
  const updateConfig = (patch: Partial<BackupConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    saveBackupConfig(next);
  };

  // Selezione cartella tramite explorer nativo
  const handleBrowseFolder = async () => {
    try {
      const chosen = await selectBackupFolder(config.folderPath);
      if (chosen) {
        updateConfig({ folderPath: chosen });
        void refreshBackupsList(chosen);
        setFeedback({ type: "success", message: `Cartella di backup impostata: ${chosen}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: `Impossibile selezionare la cartella: ${msg}` });
    }
  };

  // Apertura cartella in Explorer
  const handleOpenFolder = async () => {
    if (!config.folderPath) return;
    try {
      await openFolderInExplorer(config.folderPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: `Errore apertura cartella: ${msg}` });
    }
  };

  // Toggle categoria
  const handleToggleCategory = (catId: string) => {
    setSelectedCategories((prev) => {
      const next = prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId];
      updateConfig({ autoCategories: next });
      return next;
    });
  };

  // Seleziona/deseleziona tutto
  const handleToggleAllCategories = () => {
    if (selectedCategories.length === BACKUP_CATEGORIES.length) {
      setSelectedCategories([]);
      updateConfig({ autoCategories: [] });
    } else {
      const all = BACKUP_CATEGORIES.map((c) => c.id);
      setSelectedCategories(all);
      updateConfig({ autoCategories: all });
    }
  };

  // Esecuzione backup completo (.db)
  const handleRunFullBackup = async () => {
    if (!config.folderPath) {
      setFeedback({ type: "error", message: "Seleziona prima una cartella di destinazione per i backup." });
      return;
    }

    setIsExporting(true);
    setFeedback({ type: "info", message: "Creazione copia completa del database SQLite in corso..." });

    try {
      const res = await executeFullDatabaseBackup(config.folderPath);
      if (res.success) {
        const mb = (res.sizeBytes / (1024 * 1024)).toFixed(2);
        setFeedback({
          type: "success",
          message: `Backup completo creato con successo! File: ${res.filePath.split(/[\\/]/).pop()} (${mb} MB)`,
        });
        updateConfig({
          lastRunDate: new Date().toISOString().slice(0, 10),
          lastRunTimestamp: new Date().toISOString(),
        });
        void refreshBackupsList(config.folderPath);
      } else {
        setFeedback({ type: "error", message: res.error || "Errore durante il backup completo." });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: `Errore: ${msg}` });
    } finally {
      setIsExporting(false);
    }
  };

  // Esecuzione backup modulare selezionato (.lastbackup)
  const handleRunModularBackup = async () => {
    if (!config.folderPath) {
      setFeedback({ type: "error", message: "Seleziona prima una cartella di destinazione per i backup." });
      return;
    }

    if (selectedCategories.length === 0) {
      setFeedback({ type: "error", message: "Seleziona almeno una categoria di dati da includere nel backup." });
      return;
    }

    setIsExporting(true);
    setFeedback({ type: "info", message: "Esportazione delle tabelle selezionate in corso..." });

    try {
      const res = await executeModularBackup(config.folderPath, selectedCategories);
      if (res.success) {
        const kb = (res.sizeBytes / 1024).toFixed(1);
        const fileName = res.filePath.split(/[\\/]/).pop();
        setFeedback({
          type: "success",
          message: `Backup modulare salvato con successo! File: ${fileName} (${kb} KB)`,
        });
        updateConfig({
          lastRunDate: new Date().toISOString().slice(0, 10),
          lastRunTimestamp: new Date().toISOString(),
        });
        void refreshBackupsList(config.folderPath);
      } else {
        setFeedback({ type: "error", message: res.error || "Errore durante il backup modulare." });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: `Errore: ${msg}` });
    } finally {
      setIsExporting(false);
    }
  };

  // Apertura modale di ispezione ripristino a partire da un file scelto
  const handleSelectFileToRestore = async (explicitPath?: string) => {
    let filePath = explicitPath;
    if (!filePath) {
      filePath = (await selectBackupFile()) || undefined;
    }

    if (!filePath) return;

    setSelectedBackupPath(filePath);
    setFeedback(null);

    const insp = await inspectBackupFile(filePath);
    if (!insp.isValid) {
      setFeedback({ type: "error", message: insp.error || "File di backup non valido." });
      return;
    }

    setIsDatabaseRestore(insp.isDatabaseFile);
    if (insp.isDatabaseFile) {
      setInspectedPkg(null);
      setCategoriesToRestore([]);
    } else if (insp.pkg) {
      setInspectedPkg(insp.pkg);
      setCategoriesToRestore(insp.pkg.selectedCategories || BACKUP_CATEGORIES.map((c) => c.id));
    }

    setInspectModalOpen(true);
  };

  // Conferma ed esecuzione ripristino
  const handleConfirmRestore = async () => {
    if (!selectedBackupPath) return;

    setIsRestoring(true);
    setFeedback({ type: "info", message: "Ripristino dei dati in corso..." });

    try {
      if (isDatabaseRestore) {
        const res = await restoreDatabaseFile(selectedBackupPath);
        if (res.success) {
          setFeedback({
            type: "success",
            message: "Database SQLite ripristinato con successo! Ricarica le schermate per vedere i nuovi dati.",
          });
          setInspectModalOpen(false);
          void refreshCounts();
        } else {
          setFeedback({ type: "error", message: res.error || "Errore durante il ripristino del database." });
        }
      } else if (inspectedPkg) {
        if (categoriesToRestore.length === 0) {
          setFeedback({ type: "error", message: "Seleziona almeno una categoria da ripristinare." });
          setIsRestoring(false);
          return;
        }

        const res = await restoreModularBackup(inspectedPkg, categoriesToRestore, restoreMode);
        if (res.success) {
          const totalRows = Object.values(res.restoredCounts).reduce((a, b) => a + b, 0);
          setFeedback({
            type: "success",
            message: `Ripristino completato con successo! Importati ${totalRows} record nelle tabelle selezionate.`,
          });
          setInspectModalOpen(false);
          void refreshCounts();
        } else {
          setFeedback({ type: "error", message: res.error || "Errore durante il ripristino dei dati." });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: `Errore durante il ripristino: ${msg}` });
    } finally {
      setIsRestoring(false);
    }
  };

  // Icona categoria helper
  const getCategoryIcon = (id: string) => {
    switch (id) {
      case "ddt":
        return <FileText className="w-4 h-4 text-sky-400" />;
      case "clients":
        return <Users className="w-4 h-4 text-emerald-400" />;
      case "price_lists":
        return <Tag className="w-4 h-4 text-blue-400" />;
      case "notes":
        return <StickyNote className="w-4 h-4 text-amber-400" />;
      case "offers":
        return <Briefcase className="w-4 h-4 text-indigo-400" />;
      case "quotes":
        return <FileCheck className="w-4 h-4 text-purple-400" />;
      case "orders":
        return <Package className="w-4 h-4 text-rose-400" />;
      case "settings":
        return <Settings className="w-4 h-4 text-teal-400" />;
      default:
        return <Database className="w-4 h-4 text-slate-400" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <div className="space-y-6">
      {/* Banner / Messaggio di Feedback */}
      {feedback && (
        <div
          className={cn(
            "p-3.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-150",
            feedback.type === "success" && "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
            feedback.type === "error" && "bg-rose-500/10 border-rose-500/30 text-rose-300",
            feedback.type === "info" && "bg-sky-500/10 border-sky-500/30 text-sky-300"
          )}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" && <Check className="w-4 h-4 shrink-0 text-emerald-400" />}
            {feedback.type === "error" && <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />}
            {feedback.type === "info" && <Loader2 className="w-4 h-4 shrink-0 text-sky-400 animate-spin" />}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[var(--muted-foreground)] hover:text-white ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* SEZIONE 1: CARTELLA DI SALVATAGGIO */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4 shadow-xs">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
              <Folder className="w-4 h-4 text-[var(--primary)]" />
              <span>Cartella Destinazione Backup</span>
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Percorso locale o cartella di rete dove vengono archiviati i file di backup automatici e manuali.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              readOnly
              value={config.folderPath}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--foreground)] outline-none"
              placeholder="Nessuna cartella selezionata..."
            />
          </div>
          <button
            type="button"
            onClick={handleBrowseFolder}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--border)]/40 border border-[var(--border)] text-xs font-bold text-white transition-colors cursor-pointer shrink-0"
            title="Sfoglia cartelle di Windows"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Sfoglia...</span>
          </button>
          <button
            type="button"
            onClick={handleOpenFolder}
            disabled={!config.folderPath}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--border)]/40 border border-[var(--border)] text-xs font-bold text-[var(--muted-foreground)] hover:text-white transition-colors cursor-pointer shrink-0 disabled:opacity-40"
            title="Apri la cartella in Esplora Risorse"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Apri Cartella</span>
          </button>
        </div>
      </div>

      {/* SEZIONE 2: AUTOMAZIONE GIORNALIERA */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4 shadow-xs">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span>Backup Giornaliero Automatico</span>
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Se abilitato, il gestionale controlla ed esegue un backup silenzioso all'avvio una volta al giorno.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoDailyEnabled}
              onChange={(e) => updateConfig({ autoDailyEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <label
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer",
              config.autoBackupType === "full"
                ? "bg-[var(--primary)]/10 border-[var(--primary)]/50 text-white"
                : "bg-[var(--background)]/40 border-[var(--border)] text-[var(--muted-foreground)] hover:text-white"
            )}
          >
            <input
              type="radio"
              name="autoBackupType"
              value="full"
              checked={config.autoBackupType === "full"}
              onChange={() => updateConfig({ autoBackupType: "full" })}
              className="accent-[var(--primary)]"
            />
            <div className="text-xs">
              <span className="font-bold block text-white">Database Completo (.db)</span>
              <span className="text-[11px] text-[var(--muted-foreground)]">
                Copia fisica integrale di tutte le tabelle SQLite.
              </span>
            </div>
          </label>

          <label
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer",
              config.autoBackupType === "modular"
                ? "bg-[var(--primary)]/10 border-[var(--primary)]/50 text-white"
                : "bg-[var(--background)]/40 border-[var(--border)] text-[var(--muted-foreground)] hover:text-white"
            )}
          >
            <input
              type="radio"
              name="autoBackupType"
              value="modular"
              checked={config.autoBackupType === "modular"}
              onChange={() => updateConfig({ autoBackupType: "modular" })}
              className="accent-[var(--primary)]"
            />
            <div className="text-xs">
              <span className="font-bold block text-white">Backup Modulare (.lastbackup)</span>
              <span className="text-[11px] text-[var(--muted-foreground)]">
                Esporta le sole categorie selezionate nel riquadro sottostante.
              </span>
            </div>
          </label>
        </div>

        {/* Stato ultimo backup giornaliero e badge multi-utente */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 text-xs text-[var(--muted-foreground)] border-t border-[var(--border)]/50">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>
              Ultimo backup eseguito:{" "}
              {config.lastRunTimestamp ? (
                <strong className="text-white">
                  {new Date(config.lastRunTimestamp).toLocaleString("it-IT", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  {config.lastRunBy && <span className="text-[var(--primary)] font-semibold">({config.lastRunBy})</span>}
                </strong>
              ) : (
                <span className="italic">Nessun backup automatico registrato</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
            <span>👥 Controllo Multi-Utente:</span>
            <span className="text-slate-300 font-normal">1 solo backup al giorno per tutta la rete</span>
          </div>
        </div>
      </div>

      {/* SEZIONE 3: COSA INCLUDERE NEL BACKUP (Selezione Singola e Totale) */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between pb-1 border-b border-[var(--border)]/60">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>Dati da Includere (Selezione Singola e Totale)</span>
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Scegli i moduli da esportare. È possibile selezionarli tutti o solo quelli desiderati.
            </p>
          </div>

          <button
            type="button"
            onClick={handleToggleAllCategories}
            className="text-xs font-bold text-[var(--primary)] hover:underline cursor-pointer"
          >
            {selectedCategories.length === BACKUP_CATEGORIES.length ? "Deseleziona Tutto" : "Seleziona Tutto"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BACKUP_CATEGORIES.map((cat) => {
            const isSelected = selectedCategories.includes(cat.id);
            const count = recordCounts[cat.id];

            return (
              <div
                key={cat.id}
                onClick={() => handleToggleCategory(cat.id)}
                className={cn(
                  "p-3 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between gap-2.5",
                  isSelected
                    ? "bg-[var(--primary)]/10 border-[var(--primary)]/50 shadow-xs"
                    : "bg-[var(--background)]/30 border-[var(--border)] hover:border-[var(--border)]/80 opacity-75"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-[var(--background)]/60 border border-[var(--border)] shrink-0">
                      {getCategoryIcon(cat.id)}
                    </div>
                    <span className="font-bold text-xs text-white truncate">{cat.label}</span>
                  </div>

                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}} // Gestito da onClick container
                    className="accent-[var(--primary)] shrink-0 mt-0.5 cursor-pointer"
                  />
                </div>

                <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2 leading-relaxed">
                  {cat.description}
                </p>

                <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]/40 text-[10px]">
                  <span className="text-[var(--muted-foreground)] font-mono uppercase tracking-wider">Presenti:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {count !== undefined ? `${count.toLocaleString("it-IT")} record` : "..."}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SEZIONE 4: AZIONI DI BACKUP MANUALE & IMPORTAZIONE */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4 shadow-xs">
        <h2 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-purple-400" />
          <span>Esecuzione Manuale & Ripristino</span>
        </h2>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleRunFullBackup}
            disabled={isExporting || isRestoring}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-md cursor-pointer disabled:opacity-50"
            title="Esegui una copia fisica immediata di tutto il database LastData.db"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Esegui Backup Completo (.db)</span>
          </button>

          <button
            type="button"
            onClick={handleRunModularBackup}
            disabled={isExporting || isRestoring || selectedCategories.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--primary)] hover:opacity-90 text-white font-bold text-xs transition-all shadow-md cursor-pointer disabled:opacity-50"
            title="Esporta le sole categorie selezionate in un file compatto .lastbackup"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
            <span>Backup Moduli Selezionati ({selectedCategories.length})</span>
          </button>

          <button
            type="button"
            onClick={() => void handleSelectFileToRestore()}
            disabled={isExporting || isRestoring}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--card)] hover:bg-[var(--border)]/40 border border-[var(--border)] text-amber-300 font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-50"
            title="Seleziona un file di backup (.db, .lastbackup o .json) per ripristinare i dati"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" />
            <span>Importa / Ripristina Backup...</span>
          </button>
        </div>
      </div>

      {/* SEZIONE 5: STORICO DEI FILE DI BACKUP NELLA CARTELLA */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[var(--border)]/60 gap-2">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-400" />
              <span>Backup Trovati nella Cartella</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30">
                {existingBackups.length} / {DEFAULT_MAX_HISTORY} max
              </span>
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Rotazione automatica FIFO: il 16° backup rimuove automaticamente il più vecchio.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {existingBackups.length > DEFAULT_MAX_HISTORY && (
              <button
                type="button"
                onClick={handleRunFifoCleanup}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold cursor-pointer"
                title="Rimuovi subito i backup eccedenti oltre i 15 consentiti"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Pulisci Eccedenze</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void refreshBackupsList(config.folderPath)}
              disabled={loadingBackups}
              className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-white cursor-pointer px-2 py-1 rounded-lg hover:bg-[var(--border)]/40"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loadingBackups && "animate-spin text-[var(--primary)]")} />
              <span>Aggiorna</span>
            </button>
          </div>
        </div>

        {existingBackups.length === 0 ? (
          <div className="p-6 text-center text-xs text-[var(--muted-foreground)] rounded-lg border border-[var(--border)]/40 bg-[var(--background)]/20">
            Nessun file di backup trovato nella cartella configurata.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {existingBackups.map((b) => (
              <div
                key={b.path}
                className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]/40 hover:bg-[var(--background)]/70 transition-colors text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] shrink-0">
                    {b.backup_type === "full_db" ? (
                      <Database className="w-4 h-4 text-purple-400" />
                    ) : (
                      <FileCode className="w-4 h-4 text-sky-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-white block truncate">{b.filename}</span>
                    <span className="text-[11px] text-[var(--muted-foreground)]">
                      {b.backup_type === "full_db" ? "Database Completo (.db)" : "Backup Modulare (.lastbackup)"} •{" "}
                      {formatFileSize(b.size_bytes)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleOpenDetailedReport(b.path)}
                    disabled={isExporting || isRestoring}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 font-bold text-xs transition-colors cursor-pointer disabled:opacity-40"
                    title="Visualizza il resoconto analitico completo di questo backup"
                  >
                    <FileSearch className="w-3.5 h-3.5 text-sky-400" />
                    <span>Resoconto</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSelectFileToRestore(b.path)}
                    disabled={isExporting || isRestoring}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-xs transition-colors cursor-pointer disabled:opacity-40"
                    title="Seleziona questo backup per il ripristino"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Ripristina</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDeleteBackup(b.path, b.filename)}
                    disabled={isExporting || isRestoring}
                    className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-40"
                    title="Elimina questo file di backup"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* POPUP MODALE DI ISPEZIONE E CONFERMA RIPRISTINO */}
      {inspectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden w-full max-w-lg animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Header Modale */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Ripristino Dati da Backup</h3>
                  <p className="text-xs text-[var(--muted-foreground)]">Verifica e seleziona i dati da reimportare</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectModalOpen(false)}
                disabled={isRestoring}
                className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Contenuto Modale */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* File Info */}
              <div className="p-3 rounded-xl bg-[var(--background)]/60 border border-[var(--border)] space-y-1">
                <span className="text-[10px] uppercase font-bold text-[var(--muted-foreground)]">File Selezionato:</span>
                <span className="font-mono text-white block truncate">{selectedBackupPath}</span>
                {inspectedPkg && (
                  <span className="text-[11px] text-sky-400 block pt-1">
                    Creato il: {new Date(inspectedPkg.createdAt).toLocaleString("it-IT")} • Tipo:{" "}
                    {inspectedPkg.type === "full" ? "Completo" : "Modulare"}
                  </span>
                )}
              </div>

              {/* Caso 1: Database fisico .db */}
              {isDatabaseRestore ? (
                <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 space-y-2 text-purple-200">
                  <div className="flex items-center gap-2 font-bold text-purple-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Ripristino Totale del Database SQLite</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Stai per ripristinare l'intero database. Verrà automaticamente creata una copia di sicurezza
                    dello stato attuale prima della sostituzione.
                  </p>
                </div>
              ) : (
                /* Caso 2: Backup Modulare .lastbackup */
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-white block mb-1">Modalità di Ripristino:</label>
                    <div className="grid grid-cols-2 gap-2">
                      <label
                        className={cn(
                          "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer",
                          restoreMode === "merge"
                            ? "bg-[var(--primary)]/10 border-[var(--primary)]/50 text-white"
                            : "bg-[var(--background)]/30 border-[var(--border)] text-[var(--muted-foreground)]"
                        )}
                      >
                        <input
                          type="radio"
                          name="restoreMode"
                          value="merge"
                          checked={restoreMode === "merge"}
                          onChange={() => setRestoreMode("merge")}
                          className="accent-[var(--primary)]"
                        />
                        <div className="text-[11px]">
                          <strong className="block text-white">Unisci / Aggiorna</strong>
                          <span>Conserva altri dati esistenti</span>
                        </div>
                      </label>

                      <label
                        className={cn(
                          "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer",
                          restoreMode === "replace"
                            ? "bg-rose-500/10 border-rose-500/50 text-rose-300"
                            : "bg-[var(--background)]/30 border-[var(--border)] text-[var(--muted-foreground)]"
                        )}
                      >
                        <input
                          type="radio"
                          name="restoreMode"
                          value="replace"
                          checked={restoreMode === "replace"}
                          onChange={() => setRestoreMode("replace")}
                          className="accent-rose-500"
                        />
                        <div className="text-[11px]">
                          <strong className="block text-white">Sostituisci Tabelle</strong>
                          <span>Sovrascrive le tabelle scelte</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Selezione categorie da importare */}
                  <div>
                    <span className="text-xs font-bold text-white block mb-1">
                      Seleziona le Categorie da Importare:
                    </span>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {BACKUP_CATEGORIES.map((cat) => {
                        const isAvailableInPkg = inspectedPkg?.selectedCategories.includes(cat.id);
                        if (!isAvailableInPkg) return null;

                        const isChecked = categoriesToRestore.includes(cat.id);
                        const countInPkg = cat.tables.reduce((acc: number, t: string) => acc + (inspectedPkg?.tableCounts[t] || 0), 0);

                        return (
                          <label
                            key={cat.id}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors",
                              isChecked
                                ? "bg-[var(--primary)]/10 border-[var(--primary)]/40 text-white"
                                : "bg-[var(--background)]/30 border-[var(--border)] text-[var(--muted-foreground)]"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setCategoriesToRestore((prev) => [...prev, cat.id]);
                                  } else {
                                    setCategoriesToRestore((prev) => prev.filter((id) => id !== cat.id));
                                  }
                                }}
                                className="accent-[var(--primary)] shrink-0"
                              />
                              <span className="font-bold text-xs truncate">{cat.label}</span>
                            </div>
                            <span className="font-mono text-emerald-400 text-[10px] shrink-0">
                              {countInPkg} record nel backup
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Modale */}
            <div className="p-4 border-t border-[var(--border)] bg-[var(--background)]/40 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setInspectModalOpen(false)}
                disabled={isRestoring}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--border)]/50 transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isRestoring || (!isDatabaseRestore && categoriesToRestore.length === 0)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 shadow-md cursor-pointer disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Ripristino in corso...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Conferma Ripristino</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODALE RESOCONTO ANALITICO BACKUP */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden w-full max-w-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Header Modale */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  <FileSearch className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Resoconto Analitico Backup</h3>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {detailedReport ? detailedReport.fileName : "Analisi del file in corso..."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--border)]/40 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Contenuto Modale */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {loadingReport || !detailedReport ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-[var(--muted-foreground)]">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
                  <span className="font-semibold text-xs">Ispezione e conteggio analitico delle tabelle...</span>
                </div>
              ) : (
                <>
                  {/* Badge Riepilogo */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-2.5 rounded-xl bg-[var(--background)]/60 border border-[var(--border)]">
                      <span className="text-[10px] text-[var(--muted-foreground)] uppercase font-bold block">Dimensione</span>
                      <span className="text-sm font-black text-white font-mono">
                        {formatFileSize(detailedReport.sizeBytes)}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[var(--background)]/60 border border-[var(--border)]">
                      <span className="text-[10px] text-[var(--muted-foreground)] uppercase font-bold block">Tabelle Archiviate</span>
                      <span className="text-sm font-black text-purple-400 font-mono">
                        {detailedReport.totalTables} tabelle
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[var(--background)]/60 border border-[var(--border)]">
                      <span className="text-[10px] text-[var(--muted-foreground)] uppercase font-bold block">Record Totali</span>
                      <span className="text-sm font-black text-emerald-400 font-mono">
                        {detailedReport.totalRecords.toLocaleString("it-IT")} record
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[var(--background)]/60 border border-[var(--border)]">
                      <span className="text-[10px] text-[var(--muted-foreground)] uppercase font-bold block">Tipo Salvataggio</span>
                      <span className="text-xs font-bold text-sky-400 block pt-0.5">
                        {detailedReport.backupType === "full_db" ? "Database SQLite (.db)" : "Modulare (.lastbackup)"}
                      </span>
                    </div>
                  </div>

                  {/* Tabella Dettagliata per Categoria */}
                  <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--background)]/40">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[var(--card)] border-b border-[var(--border)] text-[10px] uppercase font-bold text-[var(--muted-foreground)]">
                          <th className="py-2.5 px-3">Sezione / Categoria</th>
                          <th className="py-2.5 px-3">Tabelle nel Backup</th>
                          <th className="py-2.5 px-3 text-right">Record Presenti</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]/40 font-sans">
                        {detailedReport.categories.map((cat) => (
                          <tr key={cat.id} className="hover:bg-[var(--card)]/50 transition-colors">
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="p-1 rounded bg-[var(--card)] border border-[var(--border)] shrink-0">
                                  {getCategoryIcon(cat.id)}
                                </div>
                                <span className="font-bold text-white text-xs">{cat.categoryLabel}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--muted-foreground)]">
                              <div className="flex flex-wrap gap-1">
                                {cat.tablesIncluded.map((t) => (
                                  <span key={t} className="px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[10px]">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400 text-xs">
                              {cat.recordCount.toLocaleString("it-IT")} record
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[var(--card)] border-t-2 border-[var(--border)] font-bold text-xs">
                          <td className="py-2.5 px-3 text-white uppercase text-[11px]">Totale Assoluto</td>
                          <td className="py-2.5 px-3 font-mono text-purple-300 text-[11px]">
                            {detailedReport.totalTables} Tabelle di sistema
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-400 text-sm">
                            {detailedReport.totalRecords.toLocaleString("it-IT")} record
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Toggle tabelle raw */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowRawTables(!showRawTables)}
                      className="text-[11px] font-semibold text-[var(--primary)] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>{showRawTables ? "Nascondi" : "Mostra"} tutte le {detailedReport.rawTables.length} tabelle singole di SQLite</span>
                    </button>

                    {showRawTables && (
                      <div className="mt-2 p-3 rounded-xl bg-[var(--background)]/80 border border-[var(--border)] grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono animate-in fade-in duration-150">
                        {detailedReport.rawTables.map((t) => (
                          <div key={t.name} className="flex items-center justify-between p-1.5 rounded bg-[var(--card)] border border-[var(--border)]/50">
                            <span className="text-slate-300 truncate mr-2">{t.name}</span>
                            <span className="text-emerald-400 font-bold shrink-0">{t.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer Modale */}
            <div className="p-4 border-t border-[var(--border)] bg-[var(--background)]/40 flex items-center justify-between">
              <span className="text-[11px] text-[var(--muted-foreground)] truncate max-w-xs">
                ☁️ Percorso: <span className="font-mono text-slate-300">{detailedReport?.filePath}</span>
              </span>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--border)]/50 transition-colors cursor-pointer"
                >
                  Chiudi
                </button>
                {detailedReport && (
                  <button
                    type="button"
                    onClick={() => {
                      setReportModalOpen(false);
                      void handleSelectFileToRestore(detailedReport.filePath);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 shadow-md cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Ripristina Questo Backup</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


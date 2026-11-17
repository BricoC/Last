import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FileSpreadsheet,
  FolderOpen,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Users,
  CheckSquare,
  Square,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { priceListRepository } from "@/features/price-lists/services/priceListRepository";
import {
  CustomerClientSummary,
  exportCustomerPriceListsExcel,
  exportGeneralPriceListExcel,
  getExcelExportFolder,
  getExportableCustomerPriceListSummary,
  resetExcelExportFolderToDesktop,
  saveExcelExportFolder,
} from "@/features/price-lists/services/priceListExcelExportService";

export const PriceListExcelExportPanel: React.FC = () => {
  const [folderPath, setFolderPath] = useState("");
  const [generalCount, setGeneralCount] = useState<number>(0);
  const [clients, setClients] = useState<CustomerClientSummary[]>([]);
  const [selectedClientNames, setSelectedClientNames] = useState<Set<string>>(new Set());
  const [clientSearch, setClientSearch] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  const [isExportingGeneral, setIsExportingGeneral] = useState(false);
  const [isExportingClients, setIsExportingClients] = useState(false);
  const [clientProgress, setClientProgress] = useState<{
    current: number;
    total: number;
    clientName: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
    openPath?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const init = async () => {
      setLoadingData(true);
      try {
        const [resolvedFolder, genCnt, cliList] = await Promise.all([
          getExcelExportFolder(),
          priceListRepository.getGeneralCount().catch(() => 0),
          getExportableCustomerPriceListSummary().catch(() => []),
        ]);
        if (!active) return;
        setFolderPath(resolvedFolder);
        setGeneralCount(genCnt);
        setClients(cliList);
        setSelectedClientNames(new Set(cliList.map((c) => c.clientName)));
      } finally {
        if (active) setLoadingData(false);
      }
    };
    void init();
    return () => {
      active = false;
    };
  }, []);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.clientName.toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const selectedCount = selectedClientNames.size;
  const isBusy = isExportingGeneral || isExportingClients;

  const handleChooseFolder = async () => {
    try {
      const selected = await invoke<string | null>("select_folder_dialog", {
        defaultPath: folderPath || undefined,
      });
      if (selected && selected.trim()) {
        setFolderPath(selected.trim());
        saveExcelExportFolder(selected.trim());
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Impossibile selezionare la cartella: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const handleResetDesktop = async () => {
    const desktop = await resetExcelExportFolderToDesktop();
    setFolderPath(desktop);
  };

  const handleOpenFolder = async (targetPath: string) => {
    if (!targetPath) return;
    try {
      await invoke("open_folder_in_explorer", { folderPath: targetPath });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Impossibile aprire la cartella: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const handleExportGeneral = async () => {
    if (isBusy || !folderPath) return;
    setIsExportingGeneral(true);
    setFeedback(null);
    try {
      const res = await exportGeneralPriceListExcel(folderPath);
      setFeedback({
        type: "success",
        message: `Listino Generale esportato con formule (${res.rowCount.toLocaleString("it-IT")} articoli) in: ${res.filePath}`,
        openPath: folderPath,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Errore esportazione Listino Generale: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsExportingGeneral(false);
    }
  };

  const handleExportClients = async () => {
    if (isBusy || !folderPath || selectedCount === 0) return;
    setIsExportingClients(true);
    setFeedback(null);
    setClientProgress({ current: 0, total: selectedCount, clientName: "Preparazione..." });
    try {
      const selectedList = clients
        .filter((c) => selectedClientNames.has(c.clientName))
        .map((c) => c.clientName);

      const res = await exportCustomerPriceListsExcel(
        folderPath,
        selectedList,
        (current, total, clientName) => {
          setClientProgress({ current, total, clientName });
        }
      );

      setFeedback({
        type: "success",
        message: `Esportati ${res.filesCreated} file Excel (${res.totalRows.toLocaleString("it-IT")} voci totali) nella cartella: ${res.outputFolder}`,
        openPath: res.outputFolder,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Errore esportazione Listini Clienti: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsExportingClients(false);
      setClientProgress(null);
    }
  };

  const toggleClient = (name: string) => {
    setSelectedClientNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedClientNames(new Set(clients.map((c) => c.clientName)));
  };

  const deselectAll = () => {
    setSelectedClientNames(new Set());
  };

  const selectFiltered = () => {
    setSelectedClientNames((prev) => {
      const next = new Set(prev);
      for (const c of filteredClients) next.add(c.clientName);
      return next;
    });
  };

  return (
    <div className="space-y-5 text-[var(--foreground)]">
      {/* 1. Cartella di destinazione locale */}
      <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Export Backup Excel Listini (con Formule)</h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                Esporta i listini in file Excel (.xlsx) modificabili completi di formule di calcolo e formattazione. La cartella viene salvata solo su questo PC.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-1 space-y-2">
          <label className="text-xs font-medium text-[var(--muted-foreground)] block">
            Cartella di salvataggio locale (predefinita: Desktop)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[260px] px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--background)] font-mono text-xs truncate">
              {folderPath || "Rilevamento Desktop..."}
            </div>
            <button
              type="button"
              onClick={() => void handleChooseFolder()}
              disabled={isBusy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Scegli Cartella</span>
            </button>
            <button
              type="button"
              onClick={() => void handleResetDesktop()}
              disabled={isBusy}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors disabled:opacity-50"
              title="Reimposta sul Desktop di questo PC"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Desktop</span>
            </button>
            <button
              type="button"
              onClick={() => void handleOpenFolder(folderPath)}
              disabled={!folderPath}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors disabled:opacity-50"
              title="Apri cartella in Esplora Risorse"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Apri</span>
            </button>
          </div>
        </div>
      </section>

      {/* Messaggio esito */}
      {feedback && (
        <div
          className={cn(
            "rounded-xl border p-3.5 text-xs flex flex-wrap items-center justify-between gap-3",
            feedback.type === "success"
              ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/30 border-rose-500/40 text-rose-300"
          )}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span className="break-all">{feedback.message}</span>
          </div>
          {feedback.openPath && (
            <button
              type="button"
              onClick={() => void handleOpenFolder(feedback.openPath!)}
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Apri cartella</span>
            </button>
          )}
        </div>
      )}

      {/* 2. Listino Generale Unificato */}
      <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <span>Listino Generale (+ Listini Vari)</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-blue-500/15 text-blue-300 border border-blue-500/30">
              {loadingData ? "..." : `${generalCount.toLocaleString("it-IT")} articoli`}
            </span>
          </h3>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Esporta un singolo file <code className="font-mono">.xlsx</code> identico alla struttura storica (colonne A–S) con formule dinamiche su{" "}
            <strong>R1</strong>, <strong>R2</strong>, <strong>Fattura</strong>, <strong>Profess</strong> e <strong>Pubblico</strong>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleExportGeneral()}
          disabled={isBusy || loadingData || !folderPath || generalCount === 0}
          className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExportingGeneral ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span>{isExportingGeneral ? "Esportazione..." : "Esporta Listino Generale (.xlsx)"}</span>
        </button>
      </section>

      {/* 3. Listini Clienti (1 file per cliente + selettore) */}
      <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Listini Clienti (1 file Excel per cliente)</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {loadingData ? "..." : `${clients.length} clienti`}
              </span>
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Genera un file <code className="font-mono">&lt;NOME CLIENTE&gt;.xlsx</code> per ogni cliente selezionato con formula vendita automatica da costo + %.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleExportClients()}
            disabled={isBusy || loadingData || !folderPath || selectedCount === 0}
            className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExportingClients ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>
              {isExportingClients
                ? "Esportazione..."
                : selectedCount === clients.length
                ? `Esporta Tutti i Clienti (${selectedCount} file)`
                : `Esporta Selezionati (${selectedCount} file)`}
            </span>
          </button>
        </div>

        {/* Barra progresso export multi-file */}
        {clientProgress && isExportingClients && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-emerald-300 font-medium">
              <span className="truncate">
                Creazione file {clientProgress.current}/{clientProgress.total}:{" "}
                <strong>{clientProgress.clientName}</strong>
              </span>
              <span className="font-mono ml-2">
                {Math.round((clientProgress.current / Math.max(1, clientProgress.total)) * 100)}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-150"
                style={{
                  width: `${Math.round(
                    (clientProgress.current / Math.max(1, clientProgress.total)) * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Toolbar filtro & selettore rapido clienti */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Cerca cliente da selezionare..."
              className="w-full pl-8 pr-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] text-xs outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[var(--muted-foreground)]">
              Selezionati: <strong className="text-[var(--foreground)]">{selectedCount}</strong> / {clients.length}
            </span>
            {clientSearch.trim().length > 0 && filteredClients.length > 0 && (
              <button
                type="button"
                onClick={selectFiltered}
                disabled={isBusy}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[11px] font-medium cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Seleziona filtrati ({filteredClients.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={selectAll}
              disabled={isBusy}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-[11px] font-medium cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span>Seleziona tutti</span>
            </button>
            <button
              type="button"
              onClick={deselectAll}
              disabled={isBusy}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-[11px] font-medium cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 text-slate-400" />
              <span>Deseleziona tutti</span>
            </button>
          </div>
        </div>

        {/* Griglia checkbox clienti */}
        <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
          {filteredClients.length === 0 ? (
            <div className="col-span-full py-6 text-center text-xs text-[var(--muted-foreground)]">
              {loadingData ? "Caricamento clienti..." : "Nessun cliente trovato."}
            </div>
          ) : (
            filteredClients.map((c) => {
              const checked = selectedClientNames.has(c.clientName);
              return (
                <label
                  key={c.clientName}
                  className={cn(
                    "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer transition-colors select-none",
                    checked
                      ? "bg-emerald-500/10 border-emerald-500/40 text-[var(--foreground)]"
                      : "bg-[var(--card)]/40 border-[var(--border)]/60 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isBusy}
                      onChange={() => toggleClient(c.clientName)}
                      className="rounded border-slate-600 accent-emerald-500 cursor-pointer shrink-0"
                    />
                    <span className="truncate font-medium">{c.clientName}</span>
                  </span>
                  <span className="text-[10px] font-mono text-[var(--muted-foreground)] shrink-0">
                    {c.rowCount}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};

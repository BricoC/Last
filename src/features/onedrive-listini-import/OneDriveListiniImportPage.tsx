import React, { useMemo, useState } from "react";
import {
  FileSpreadsheet,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  UploadCloud,
  Layers,
  Users,
} from "lucide-react";
import {
  getOneDriveClientiDir,
  getOneDriveGeneraleFile,
  getOneDriveGeneraliDir,
  analyzeOneDriveClientLists,
  analyzeOneDriveGeneralLists,
  importOneDriveClientDiffItems,
  importOneDriveGeneralDiffItems,
  type ClientOneDriveAnalysis,
  type GeneralOneDriveAnalysis,
} from "./services/oneDriveListiniDiffService";

type TabType = "generale" | "clienti";
type StatusFilter = "all" | "new" | "updated";

export const OneDriveListiniImportPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>("generale");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>("ALL");

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "warn" | "err"; text: string } | null>(
    null
  );

  const [generalAnalysis, setGeneralAnalysis] = useState<GeneralOneDriveAnalysis | null>(null);
  const [selectedGeneralKeys, setSelectedGeneralKeys] = useState<Set<string>>(new Set());

  const [clientAnalysis, setClientAnalysis] = useState<ClientOneDriveAnalysis | null>(null);
  const [selectedClientKeys, setSelectedClientKeys] = useState<Set<string>>(new Set());

  const handleAnalyze = async () => {
    setIsScanning(true);
    setFeedback(null);
    try {
      if (activeTab === "generale") {
        setScanProgress("Lettura Listini Generali in sola lettura...");
        const res = await analyzeOneDriveGeneralLists((stage, cur, tot) => {
          setScanProgress(`${stage} (${cur}/${tot})`);
        });
        setGeneralAnalysis(res);
        setSelectedGeneralKeys(new Set(res.diffItems.map((d) => d.key)));
        setFeedback({
          type: res.errors.length > 0 ? "warn" : "ok",
          text: `Analisi completata: ${res.totalParsed} righe lette · ${res.newCount} nuove · ${res.updatedCount} aggiornate · ${res.unchangedCount} già allineate.`,
        });
      } else {
        setScanProgress("Lettura Listini Clienti in sola lettura...");
        const res = await analyzeOneDriveClientLists((cur, tot, fn) => {
          setScanProgress(`${fn} (${cur}/${tot})`);
        });
        setClientAnalysis(res);
        setSelectedClientFilter("ALL");
        setSelectedClientKeys(new Set(res.diffItems.map((d) => d.key)));
        setFeedback({
          type: res.errors.length > 0 ? "warn" : "ok",
          text: `Analisi completata: ${res.totalFiles} file (${res.clientsCount} clienti), ${res.totalParsed} righe lette · ${res.newCount} nuove · ${res.updatedCount} aggiornate · ${res.unchangedCount} già allineate.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: "err",
        text: `Errore durante la lettura: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsScanning(false);
      setScanProgress("");
    }
  };

  const filteredGeneralItems = useMemo(() => {
    if (!generalAnalysis) return [];
    const q = searchTerm.trim().toLowerCase();
    return generalAnalysis.diffItems.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.parsed.descrizione.toLowerCase().includes(q) ||
        (item.parsed.codice_articolo || "").toLowerCase().includes(q) ||
        (item.parsed.fornitore || "").toLowerCase().includes(q) ||
        (item.parsed.cat || "").toLowerCase().includes(q)
      );
    });
  }, [generalAnalysis, searchTerm, statusFilter]);

  const availableClients = useMemo(() => {
    if (!clientAnalysis) return [];
    const set = new Set(clientAnalysis.diffItems.map((i) => i.parsed.cliente));
    return Array.from(set).sort();
  }, [clientAnalysis]);

  const filteredClientItems = useMemo(() => {
    if (!clientAnalysis) return [];
    const q = searchTerm.trim().toLowerCase();
    return clientAnalysis.diffItems.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (selectedClientFilter !== "ALL" && item.parsed.cliente !== selectedClientFilter)
        return false;
      if (!q) return true;
      return (
        item.parsed.descrizione.toLowerCase().includes(q) ||
        item.parsed.cliente.toLowerCase().includes(q)
      );
    });
  }, [clientAnalysis, searchTerm, statusFilter, selectedClientFilter]);

  const handleImportGeneral = async (onlyNew: boolean) => {
    if (!generalAnalysis) return;
    const toImport = generalAnalysis.diffItems.filter((item) =>
      onlyNew ? item.status === "new" : selectedGeneralKeys.has(item.key)
    );
    if (toImport.length === 0) return;

    setIsImporting(true);
    setFeedback(null);
    try {
      const res = await importOneDriveGeneralDiffItems(toImport);
      const importFeedback = {
        type: res.cloudSynced ? ("ok" as const) : ("warn" as const),
        text: res.cloudSynced
          ? `Importate ${res.imported} voci nel Listino Generale e sincronizzate su Supabase.`
          : `Importate ${res.imported} voci in locale, sync Supabase in attesa: ${res.cloudError}`,
      };
      await handleAnalyze();
      setFeedback(importFeedback);
    } catch (err) {
      setFeedback({
        type: "err",
        text: `Errore importazione: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportClients = async (onlyNew: boolean) => {
    if (!clientAnalysis) return;
    const toImport = clientAnalysis.diffItems.filter((item) =>
      onlyNew ? item.status === "new" : selectedClientKeys.has(item.key)
    );
    if (toImport.length === 0) return;

    setIsImporting(true);
    setFeedback(null);
    try {
      const res = await importOneDriveClientDiffItems(toImport);
      const importFeedback = {
        type: res.cloudSynced ? ("ok" as const) : ("warn" as const),
        text: res.cloudSynced
          ? `Importate ${res.imported} voci nei Listini Clienti e sincronizzate su Supabase.`
          : `Importate ${res.imported} voci in locale, sync Supabase in attesa: ${res.cloudError}`,
      };
      await handleAnalyze();
      setFeedback(importFeedback);
    } catch (err) {
      setFeedback({
        type: "err",
        text: `Errore importazione: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const toggleAllVisible = () => {
    if (activeTab === "generale") {
      const allSelected =
        filteredGeneralItems.length > 0 &&
        filteredGeneralItems.every((i) => selectedGeneralKeys.has(i.key));
      const next = new Set(selectedGeneralKeys);
      for (const i of filteredGeneralItems) {
        if (allSelected) next.delete(i.key);
        else next.add(i.key);
      }
      setSelectedGeneralKeys(next);
    } else {
      const allSelected =
        filteredClientItems.length > 0 &&
        filteredClientItems.every((i) => selectedClientKeys.has(i.key));
      const next = new Set(selectedClientKeys);
      for (const i of filteredClientItems) {
        if (allSelected) next.delete(i.key);
        else next.add(i.key);
      }
      setSelectedClientKeys(next);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--background)] text-[var(--foreground)] p-4 gap-3 overflow-hidden">
      {/* Header + Dogma Sola Lettura */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--card)] border border-[var(--border)] rounded-xl p-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold flex items-center gap-2">
              <span>Importazione Listini OneDrive</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Solo Admin
              </span>
            </h1>
            <p className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Modalità <strong>Sola Lettura</strong>: i file in OneDrive vengono solo letti e non vengono mai modificati.
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("generale")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
              activeTab === "generale"
                ? "bg-blue-600/20 text-blue-300 border-blue-500"
                : "bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Listini Generali</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("clienti")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
              activeTab === "clienti"
                ? "bg-blue-600/20 text-blue-300 border-blue-500"
                : "bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Listini Clienti</span>
          </button>
        </div>
      </div>

      {/* Percorsi sorgente + Bottone Analizza */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--card)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-xs">
        <div className="text-[var(--muted-foreground)] truncate">
          {activeTab === "generale" ? (
            <span>
              Sorgente (sola lettura):{" "}
              <code className="text-[var(--foreground)]">
                {getOneDriveGeneraleFile() || "Non configurato (Impostazioni → Parametri Generali)"}
              </code>{" "}
              +{" "}
              <code className="text-[var(--foreground)]">
                {getOneDriveGeneraliDir() || "Non configurato"}
              </code>
            </span>
          ) : (
            <span>
              Sorgente (sola lettura):{" "}
              <code className="text-[var(--foreground)]">
                {getOneDriveClientiDir() || "Non configurato (Impostazioni → Parametri Generali)"}
              </code>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {scanProgress && <span className="text-[11px] text-amber-300">{scanProgress}</span>}
          <button
            type="button"
            disabled={isScanning || isImporting}
            onClick={handleAnalyze}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
            <span>{isScanning ? "Analisi in corso..." : "Analizza File OneDrive"}</span>
          </button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${
            feedback.type === "ok"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : feedback.type === "warn"
              ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          {feedback.type === "ok" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Barra Filtri + Azioni Importazione */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--card)] border border-[var(--border)] rounded-xl px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca descrizione, codice, cliente..."
              className="pl-8 pr-3 py-1 text-xs rounded-lg bg-[var(--background)] border border-[var(--border)] outline-none focus:border-blue-500 w-64"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-2.5 py-1 text-xs rounded-lg bg-[var(--background)] border border-[var(--border)] outline-none"
          >
            <option value="all">Tutte le differenze</option>
            <option value="new">Solo Nuove</option>
            <option value="updated">Solo Aggiornate</option>
          </select>

          {activeTab === "clienti" && availableClients.length > 0 && (
            <select
              value={selectedClientFilter}
              onChange={(e) => setSelectedClientFilter(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg bg-[var(--background)] border border-[var(--border)] outline-none max-w-[220px]"
            >
              <option value="ALL">Tutti i clienti ({availableClients.length})</option>
              {availableClients.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/^LIST_/, "")}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "generale" && generalAnalysis && (
            <>
              <button
                type="button"
                disabled={isImporting || generalAnalysis.newCount === 0}
                onClick={() => handleImportGeneral(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs disabled:opacity-40"
              >
                Importa Solo Nuove ({generalAnalysis.newCount})
              </button>
              <button
                type="button"
                disabled={isImporting || selectedGeneralKeys.size === 0}
                onClick={() => handleImportGeneral(false)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-40"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>
                  {isImporting
                    ? "Importazione..."
                    : `Importa Selezionate (${selectedGeneralKeys.size})`}
                </span>
              </button>
            </>
          )}

          {activeTab === "clienti" && clientAnalysis && (
            <>
              <button
                type="button"
                disabled={isImporting || clientAnalysis.newCount === 0}
                onClick={() => handleImportClients(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs disabled:opacity-40"
              >
                Importa Solo Nuove ({clientAnalysis.newCount})
              </button>
              <button
                type="button"
                disabled={isImporting || selectedClientKeys.size === 0}
                onClick={() => handleImportClients(false)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-40"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>
                  {isImporting
                    ? "Importazione..."
                    : `Importa Selezionate (${selectedClientKeys.size})`}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Legenda rapida */}
      <div className="flex flex-wrap items-center gap-4 px-3 py-1.5 rounded-lg bg-[var(--card)]/60 border border-[var(--border)] text-[11px] text-[var(--muted-foreground)]">
        <span>
          <strong className="text-emerald-300">Valore (File)</strong> = letto da OneDrive (sola lettura)
        </span>
        <span>·</span>
        <span>
          <strong className="text-[var(--foreground)]">Valore (Last)</strong> = attualmente salvato in Last
        </span>
        <span>·</span>
        <span>
          <strong className="text-amber-300">Cosa cambia</strong> = campo che verrà sostituito importando
        </span>
      </div>

      {/* Tabella Anteprima Differenze */}
      <div className="flex-1 overflow-auto bg-[var(--card)] border border-[var(--border)] rounded-xl">
        {activeTab === "generale" ? (
          !generalAnalysis ? (
            <div className="h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]">
              Premi "Analizza File OneDrive" per confrontare i 5 file dei Listini Generali con Last.
            </div>
          ) : filteredGeneralItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-emerald-400">
              Nessuna differenza trovata rispetto ai file selezionati.
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-[var(--background)] border-b border-[var(--border)] text-[var(--muted-foreground)]">
                <tr>
                  <th className="p-2 text-left w-8">
                    <input
                      type="checkbox"
                      checked={
                        filteredGeneralItems.length > 0 &&
                        filteredGeneralItems.every((i) => selectedGeneralKeys.has(i.key))
                      }
                      onChange={toggleAllVisible}
                    />
                  </th>
                  <th className="p-2 text-left">Stato</th>
                  <th className="p-2 text-left">Categoria / File</th>
                  <th className="p-2 text-left">Fornitore / Cod.</th>
                  <th className="p-2 text-left">Descrizione</th>
                  <th className="p-2 text-right">Fattura €</th>
                  <th className="p-2 text-right">Acquisto €</th>
                  <th className="p-2 text-left">Attuale in Last</th>
                </tr>
              </thead>
              <tbody>
                {filteredGeneralItems.slice(0, 500).map((item) => {
                  const checked = selectedGeneralKeys.has(item.key);
                  return (
                    <tr
                      key={item.key}
                      className="border-b border-[var(--border)]/50 hover:bg-[var(--background)]/50"
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(selectedGeneralKeys);
                            if (checked) next.delete(item.key);
                            else next.add(item.key);
                            setSelectedGeneralKeys(next);
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            item.status === "new"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-amber-500/15 text-amber-300"
                          }`}
                        >
                          {item.status === "new" ? "NUOVO" : "AGGIORNATO"}
                        </span>
                      </td>
                      <td className="p-2 text-[var(--muted-foreground)]">
                        {item.parsed.cat || "LISTINO GENERALE"}
                      </td>
                      <td className="p-2 font-mono">
                        {[item.parsed.fornitore, item.parsed.codice_articolo]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td className="p-2 font-medium">{item.parsed.descrizione}</td>
                      <td className="p-2 text-right font-mono">
                        {item.parsed.prezzo_fattura != null
                          ? `€ ${item.parsed.prezzo_fattura.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {item.parsed.prezzo_acquisto != null
                          ? `€ ${item.parsed.prezzo_acquisto.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="p-2 text-[var(--muted-foreground)]">
                        {item.existingSummary || "Assente"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : !clientAnalysis ? (
          <div className="h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]">
            Premi "Analizza File OneDrive" per confrontare i Listini Clienti con Last.
          </div>
        ) : filteredClientItems.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-emerald-400">
            Nessuna differenza trovata rispetto ai Listini Clienti.
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[var(--background)] border-b border-[var(--border)] text-[var(--muted-foreground)]">
              <tr>
                <th className="p-2 text-left w-8">
                  <input
                    type="checkbox"
                    checked={
                      filteredClientItems.length > 0 &&
                      filteredClientItems.every((i) => selectedClientKeys.has(i.key))
                    }
                    onChange={toggleAllVisible}
                  />
                </th>
                <th className="p-2 text-left">Stato</th>
                <th className="p-2 text-left">Cliente</th>
                <th className="p-2 text-left">Descrizione</th>
                <th className="p-2 text-right">Fattura (File)</th>
                <th className="p-2 text-right">Fattura (Last)</th>
                <th className="p-2 text-left">Acquisto (File)</th>
                <th className="p-2 text-left">Acquisto (Last)</th>
                <th className="p-2 text-left">Cosa cambia / Sostituisce</th>
              </tr>
            </thead>
            <tbody>
              {filteredClientItems.slice(0, 500).map((item) => {
                const checked = selectedClientKeys.has(item.key);
                const fileAcq =
                  item.parsed.acquisto_old ||
                  (item.parsed.prezzo_acquisto != null
                    ? `€ ${item.parsed.prezzo_acquisto.toFixed(2)}`
                    : "—");
                const lastAcq =
                  item.status === "new"
                    ? "Assente"
                    : item.existingAcquistoOld ||
                      (item.existingAcquisto != null
                        ? `€ ${item.existingAcquisto.toFixed(2)}`
                        : "—");
                return (
                  <tr
                    key={item.key}
                    className="border-b border-[var(--border)]/50 hover:bg-[var(--background)]/50"
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = new Set(selectedClientKeys);
                          if (checked) next.delete(item.key);
                          else next.add(item.key);
                          setSelectedClientKeys(next);
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          item.status === "new"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {item.status === "new" ? "NUOVO" : "AGGIORNATO"}
                      </span>
                    </td>
                    <td className="p-2 font-semibold">
                      {item.parsed.cliente.replace(/^LIST_/, "")}
                    </td>
                    <td className="p-2">{item.parsed.descrizione}</td>
                    <td className="p-2 text-right font-mono text-emerald-300">
                      {item.parsed.prezzo_fattura != null
                        ? `€ ${item.parsed.prezzo_fattura.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="p-2 text-right font-mono text-[var(--muted-foreground)]">
                      {item.status === "new"
                        ? "Assente"
                        : item.existingFattura != null
                        ? `€ ${item.existingFattura.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="p-2 font-mono text-emerald-300">{fileAcq}</td>
                    <td className="p-2 font-mono text-[var(--muted-foreground)]">{lastAcq}</td>
                    <td className="p-2">
                      {item.status === "new" ? (
                        <span className="text-emerald-400">Nuova voce da inserire</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(item.changeBadges || [item.existingSummary || "Modificato"]).map(
                            (badge, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-mono"
                              >
                                {badge}
                              </span>
                            )
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

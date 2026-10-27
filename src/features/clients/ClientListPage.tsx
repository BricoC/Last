import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  CloudDownload,
  Tag,
  MapPin,
  Building2,
  BarChart3,
  Edit2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  GitMerge,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Client, CreateClientInput } from "./models/client";
import { clientRepository } from "./services/clientRepository";
import { clientSyncService, SyncClientsResult } from "./services/clientSyncService";
import { ClientFormPanel } from "./components/ClientFormPanel";
import { ClientMergeModal } from "./components/ClientMergeModal";
import { DDTClientArticleHistoryModal } from "@/features/ddt-studio/components/DDTClientArticleHistoryModal";

type FilterTab = "all" | "active" | "with_list" | "inactive";

export function ClientListPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [loading, setLoading] = useState(true);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [importingDdts, setImportingDdts] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [editing, setEditing] = useState<Client | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);

  // Modale Storico Articoli DDT
  const [historyClientName, setHistoryClientName] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Scorciatoia F4 per focalizzare la ricerca rapida
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F4") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const reload = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const data = await clientRepository.getClients(search);
      setClients(data);
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Caricamento clienti non riuscito.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload(query);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query, reload]);

  // Se al primo avvio non ci sono clienti nel database locale, suggeriamo il sync automatico
  useEffect(() => {
    void clientRepository.getClients("").then((res) => {
      if (res.length === 0) {
        // Nessun cliente locale: proviamo a sincronizzare automaticamente da Supabase
        void handleSyncSupabase(true);
      }
    });
  }, []);

  const handleSyncSupabase = async (silent = false) => {
    setSyncingCloud(true);
    setFeedback(null);
    try {
      const res: SyncClientsResult = await clientSyncService.syncAllFromSupabase();
      await reload(query);
      setFeedback({
        type: "success",
        text: `Sincronizzazione completata: scaricati ${res.totalFetched} clienti da Supabase (${res.matchedPriceLists} listini abbinati in automatico).`,
      });
    } catch (err: unknown) {
      if (!silent) {
        setFeedback({
          type: "error",
          text: err instanceof Error ? err.message : "Sincronizzazione da Supabase non riuscita.",
        });
      }
    } finally {
      setSyncingCloud(false);
    }
  };

  const handleImportFromDdts = async () => {
    setImportingDdts(true);
    setFeedback(null);
    try {
      const res = await clientSyncService.importMissingClientsFromDdts();
      await reload(query);
      setFeedback({
        type: "success",
        text:
          res.added > 0
            ? `Rilevati e importati con successo ${res.added} nuovi clienti presenti nei DDT.`
            : "Tutti i clienti presenti nei DDT sono già registrati in anagrafica.",
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Rilevamento clienti da DDT non riuscito.",
      });
    } finally {
      setImportingDdts(false);
    }
  };

  const saveClient = async (input: CreateClientInput & { id?: string }) => {
    const saved = await clientRepository.createOrUpdateClient(input);
    // Sincronizza anche su Supabase Cloud
    void clientSyncService.pushClientToSupabase(saved);

    setFormOpen(false);
    setEditing(null);
    await reload(query);
    setFeedback({
      type: "success",
      text: `Cliente “${saved.business_name}” salvato e sincronizzato sul Cloud.`,
    });
  };

  const deleteClient = async () => {
    if (!editing) return;
    if (!window.confirm(`Archiviare il cliente “${editing.business_name}”?`)) return;
    try {
      await clientRepository.softDeleteClient(editing.id);
      setFormOpen(false);
      setEditing(null);
      await reload(query);
      setFeedback({
        type: "success",
        text: `Cliente “${editing.business_name}” archiviato con successo.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Archiviazione non riuscita.",
      });
    }
  };

  // Filtraggio Clienti in base alla tab attiva
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (activeTab === "active") return c.is_active;
      if (activeTab === "inactive") return !c.is_active;
      if (activeTab === "with_list") return (c.price_lists?.length ?? 0) > 0;
      return true;
    });
  }, [clients, activeTab]);

  // Contatori
  const counts = useMemo(() => {
    return {
      all: clients.length,
      active: clients.filter((c) => c.is_active).length,
      with_list: clients.filter((c) => (c.price_lists?.length ?? 0) > 0).length,
      inactive: clients.filter((c) => !c.is_active).length,
    };
  }, [clients]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* 1. HEADER TOOLBAR SUPERIORE */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5 select-none">
        {/* Titolo e contatori */}
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-[var(--foreground)]">Anagrafica Clienti</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--primary)]/15 text-[var(--primary)]">
                {counts.all}
              </span>
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Gestione rubrica, condizioni commerciali e listini dedicati (Cloud Supabase)
            </p>
          </div>
        </div>

        {/* Ricerca e Azioni Globali */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Barra Ricerca con scorciatoia F4 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca cliente, P.IVA, città o listino (F4)..."
              className="h-8.5 w-72 rounded-md border border-[var(--border)] bg-[var(--background)] pl-8 pr-12 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] font-medium"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-2.5 text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                ✕
              </button>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void reload(query)}
            disabled={loading}
            title="Ricarica elenco clienti"
            className="h-8.5 px-2.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>

          {/* Sincronizza Supabase */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSyncSupabase(false)}
            disabled={syncingCloud}
            title="Sincronizza e scarica clienti da Supabase Cloud"
            className="h-8.5 text-xs font-semibold text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
          >
            <CloudDownload className={`h-3.5 w-3.5 mr-1.5 ${syncingCloud ? "animate-bounce" : ""}`} />
            {syncingCloud ? "Sincronizzazione..." : "Sincronizza Supabase"}
          </Button>

          {/* Rileva da DDT */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleImportFromDdts()}
            disabled={importingDdts}
            title="Confronta i DDT e importa clienti mancanti"
            className="h-8.5 text-xs text-sky-400 border-sky-500/30 hover:bg-sky-500/10"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
            {importingDdts ? "Rilevamento..." : "Rileva da DDT"}
          </Button>

          {/* Unisci Duplicati */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMergeModalOpen(true)}
            title="Rileva e unisci clienti duplicati (punteggiatura, varianti)"
            className="h-8.5 text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
          >
            <GitMerge className="h-3.5 w-3.5 mr-1.5" />
            Unisci Duplicati
          </Button>

          {/* Nuovo Cliente */}
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="h-8.5 text-xs font-semibold px-3"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nuovo Cliente
          </Button>
        </div>
      </header>

      {/* 2. NOTIFICHE DI FEEDBACK */}
      {feedback && (
        <div
          className={`flex items-center justify-between px-4 py-2 text-xs border-b ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
              : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[10px] opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. FILTRI RAPIDI TABELLA */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[var(--border)] bg-[var(--card)]/40 select-none text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === "all"
              ? "bg-[var(--primary)] text-white shadow-xs"
              : "text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)]"
          }`}
        >
          <span>Tutti i Clienti</span>
          <span className="text-[10px] opacity-80 font-mono">({counts.all})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("with_list")}
          className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === "with_list"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-emerald-400"
          }`}
        >
          <Tag className="w-3 h-3" />
          <span>Con Listino Dedicato</span>
          <span className="text-[10px] opacity-80 font-mono">({counts.with_list})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("active")}
          className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === "active"
              ? "bg-sky-600 text-white shadow-xs"
              : "text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)]"
          }`}
        >
          <span>Attivi</span>
          <span className="text-[10px] opacity-80 font-mono">({counts.active})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("inactive")}
          className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === "inactive"
              ? "bg-amber-600 text-white shadow-xs"
              : "text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)]"
          }`}
        >
          <span>Inattivi</span>
          <span className="text-[10px] opacity-80 font-mono">({counts.inactive})</span>
        </button>

        <span className="ml-auto text-[11px] text-[var(--muted-foreground)] font-mono">
          Visualizzati: {filteredClients.length} su {clients.length}
        </span>
      </div>

      {/* 4. TABELLA CLIENTI */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && clients.length === 0 ? (
          <div className="flex flex-col flex-1 items-center justify-center h-64 text-sm text-[var(--muted-foreground)] gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-[var(--primary)]" />
            <p>Caricamento archivio clienti...</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <Card className="max-w-md text-center p-6 space-y-3">
              <Building2 className="mx-auto h-8 w-8 text-[var(--primary)] opacity-60" />
              <h2 className="font-bold text-sm text-[var(--foreground)]">
                {query ? "Nessun cliente trovato" : "Archivio clienti vuoto"}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                {query
                  ? `Nessun risultato corrisponde alla ricerca “${query}”.`
                  : "Puoi scaricare l'archivio già presente su Supabase oppure creare una nuova scheda."}
              </p>
              {!query && (
                <div className="flex justify-center gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleSyncSupabase(false)}
                    className="text-xs text-emerald-400 border-emerald-500/30"
                  >
                    <CloudDownload className="mr-1 h-3.5 w-3.5" />
                    Scarica da Supabase
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                    className="text-xs"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Crea Cliente
                  </Button>
                </div>
              )}
            </Card>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs select-none">
            <thead className="sticky top-0 bg-[var(--card)] border-b border-[var(--border)] text-[var(--muted-foreground)] font-semibold shadow-xs z-10">
              <tr>
                <th className="py-2.5 px-3 w-72">Ragione Sociale</th>
                <th className="py-2.5 px-3 w-52">Listini Collegati</th>
                <th className="py-2.5 px-3 w-48">Sede / Località</th>
                <th className="py-2.5 px-3 w-36">Destinazioni Merci</th>
                <th className="py-2.5 px-3 w-36">Partita IVA / CF</th>
                <th className="py-2.5 px-3 w-36">Telefono</th>
                <th className="py-2.5 px-3 w-48">Condizioni Pagamento</th>
                <th className="py-2.5 px-3 w-20 text-center">Stato</th>
                <th className="py-2.5 px-3 w-28 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11px]">
              {filteredClients.map((client) => {
                const hasPriceList = (client.price_lists?.length ?? 0) > 0;
                const destCount = client.destinations?.length ?? 0;
                const phone = client.phones?.[0]?.numero || "";

                return (
                  <tr
                    key={client.id}
                    onDoubleClick={() => {
                      setEditing(client);
                      setFormOpen(true);
                    }}
                    className="hover:bg-[var(--card)]/80 transition-colors group cursor-default"
                  >
                    {/* Ragione Sociale */}
                    <td className="py-2.5 px-3 font-bold text-[var(--foreground)] font-sans">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[260px] tracking-tight">
                          {client.business_name}
                        </span>
                      </div>
                    </td>

                    {/* Listini Collegati */}
                    <td className="py-2.5 px-3">
                      {hasPriceList ? (
                        <div className="flex flex-wrap gap-1">
                          {client.price_lists.map((pl) => (
                            <span
                              key={pl}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 truncate max-w-[190px]"
                              title={pl}
                            >
                              <Tag className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{pl}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-[var(--muted-foreground)] italic font-sans">
                          Listino Generale
                        </span>
                      )}
                    </td>

                    {/* Sede / Località */}
                    <td className="py-2.5 px-3 font-sans text-[var(--muted-foreground)]">
                      <div className="truncate max-w-[180px]">
                        {[client.city, client.province].filter(Boolean).join(" (") +
                          (client.province ? ")" : "") || "-"}
                      </div>
                    </td>

                    {/* Destinazioni Merci */}
                    <td className="py-2.5 px-3 font-sans">
                      {destCount > 1 ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30"
                          title={client.destinations.map((d) => d.citta || d.luogo).join(", ")}
                        >
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          <span>{destCount} destinazioni</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--muted-foreground)] italic">
                          Sede legale
                        </span>
                      )}
                    </td>

                    {/* Partita IVA */}
                    <td className="py-2.5 px-3 text-[var(--muted-foreground)]">
                      {client.vat_number || client.fiscal_code || "-"}
                    </td>

                    {/* Telefono */}
                    <td className="py-2.5 px-3 text-[var(--muted-foreground)]">
                      {phone || "-"}
                    </td>

                    {/* Condizioni Pagamento */}
                    <td className="py-2.5 px-3 font-sans text-[11px] text-[var(--muted-foreground)] truncate max-w-[180px]">
                      {client.payment_method || "-"}
                    </td>

                    {/* Stato */}
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold uppercase ${
                          client.is_active
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}
                      >
                        {client.is_active ? "Attivo" : "Inattivo"}
                      </span>
                    </td>

                    {/* Azioni Rapide */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-90 group-hover:opacity-100">
                        {/* Storico Venduto DDT */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryClientName(client.business_name);
                          }}
                          className="h-7 w-7 p-0 text-sky-400 hover:bg-sky-500/10"
                          title="Apri Storico Articoli / Venduto DDT"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                        </Button>

                        {/* Modifica Scheda */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(client);
                            setFormOpen(true);
                          }}
                          className="h-7 w-7 p-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                          title="Apri e Modifica Scheda Cliente"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 5. MODALE SCHEDA CLIENTE */}
      {formOpen && (
        <ClientFormPanel
          client={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSave={saveClient}
          onDelete={editing ? () => void deleteClient() : undefined}
          onOpenArticleHistory={(name) => setHistoryClientName(name)}
        />
      )}

      {/* 6. MODALE STORICO ARTICOLI DDT CLIENTE */}
      {historyClientName && (
        <DDTClientArticleHistoryModal
          isOpen={Boolean(historyClientName)}
          onClose={() => setHistoryClientName(null)}
          clientName={historyClientName}
          articleDescription=""
        />
      )}

      {/* 7. MODALE UNIONE CLIENTI DUPLICATI */}
      <ClientMergeModal
        isOpen={mergeModalOpen}
        onClose={() => setMergeModalOpen(false)}
        onMerged={() => void reload(query)}
      />
    </div>
  );
}

export default ClientListPage;

import { useCallback, useEffect, useMemo, useState } from "react";
import { GridCell, GridCellKind, GridColumn, Item } from "@glideapps/glide-data-grid";
import { AlertCircle, MapPin, Plus, RefreshCw, Search, Users } from "lucide-react";
import { ExcelGrid } from "@/shared/components/data-grid/ExcelGrid";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Client, CreateClientInput } from "./models/client";
import { clientRepository } from "./services/clientRepository";
import { ClientFormPanel } from "./components/ClientFormPanel";

export function ClientListPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const reload = useCallback(async (search: string) => {
    setLoading(true);
    setError(null);
    try {
      setClients(await clientRepository.getClients(search));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Caricamento clienti non riuscito.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(query); }, 180);
    return () => window.clearTimeout(timer);
  }, [query, reload]);

  const columns = useMemo<GridColumn[]>(() => [
    { id: "business_name", title: "Ragione sociale", width: 260 },
    { id: "vat_number", title: "Partita IVA", width: 140 },
    { id: "fiscal_code", title: "Codice fiscale", width: 155 },
    { id: "city", title: "Città", width: 150 },
    { id: "province", title: "Prov.", width: 70 },
    { id: "phone", title: "Telefono", width: 160 },
    { id: "pec", title: "PEC", width: 220 },
    { id: "status", title: "Stato", width: 90 },
  ], []);

  const getCellContent = useCallback(([column, row]: Item): GridCell => {
    const client = clients[row];
    if (!client) return { kind: GridCellKind.Text, allowOverlay: false, data: "", displayData: "" };
    const values = [client.business_name, client.vat_number ?? "", client.fiscal_code ?? "", client.city ?? "", client.province ?? "", client.phones[0]?.numero ?? "", client.pec ?? "", client.is_active ? "Attivo" : "Inattivo"];
    const value = values[column] ?? "";
    return { kind: GridCellKind.Text, allowOverlay: false, data: value, displayData: value };
  }, [clients]);

  const saveClient = async (input: CreateClientInput & { id?: string }) => {
    await clientRepository.createOrUpdateClient(input);
    setFormOpen(false);
    setEditing(null);
    await reload(query);
  };

  const openClient = ([, row]: Item) => {
    const client = clients[row];
    if (client) { setEditing(client); setFormOpen(true); }
  };

  const deleteClient = async () => {
    if (!editing) return;
    if (!window.confirm(`Archiviare il cliente “${editing.business_name}”?`)) return;
    try {
      await clientRepository.softDeleteClient(editing.id);
      setFormOpen(false);
      setEditing(null);
      await reload(query);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Archiviazione cliente non riuscita.");
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-[var(--radius)] bg-[var(--primary)]/10 p-2 text-[var(--primary)]"><Users className="h-4 w-4" /></span>
          <div><h1 className="text-sm font-semibold">Anagrafica clienti</h1><p className="text-xs text-[var(--muted-foreground)]">{clients.length} {clients.length === 1 ? "cliente" : "clienti"} visualizzati</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ragione sociale, P.IVA o città…" className="h-9 w-64 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] pl-8 pr-3 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
          </label>
          <Button size="sm" variant="outline" onClick={() => void reload(query)} title="Ricarica clienti"><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-1 h-3.5 w-3.5" /> Nuovo cliente</Button>
        </div>
      </header>
      {error && <div role="alert" className="flex items-center gap-2 border-b border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-4 py-2 text-xs text-[var(--destructive)]"><AlertCircle className="h-4 w-4" />{error}</div>}
      {loading && clients.length === 0 ? <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted-foreground)]">Caricamento archivio locale…</div>
        : clients.length === 0 ? <div className="flex flex-1 items-center justify-center p-6"><Card className="max-w-md text-center"><MapPin className="mx-auto mb-3 h-6 w-6 text-[var(--primary)]" /><h2 className="font-semibold">{query ? "Nessun cliente trovato" : "Archivio clienti vuoto"}</h2><p className="my-2 text-sm text-[var(--muted-foreground)]">{query ? "Prova con un'altra ragione sociale, partita IVA o città." : "Crea la prima scheda cliente per iniziare."}</p>{!query && <Button size="sm" variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-1 h-4 w-4" /> Crea cliente</Button>}</Card></div>
          : <div className="relative min-h-0 flex-1"><ExcelGrid columns={columns} rows={clients.length} getCellContent={getCellContent} onCellClicked={openClient} /></div>}
      {formOpen && <ClientFormPanel client={editing} onClose={() => { setFormOpen(false); setEditing(null); }} onSave={saveClient} onDelete={() => void deleteClient()} />}
    </div>
  );
}

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, Clock3, FileText, MapPin, Truck, User, Wallet } from "lucide-react";
import { clientRepository } from "@/features/clients/services/clientRepository";
import type { Client } from "@/features/clients/models/client";
import type { QuoteDraft } from "../models/quoteDraft";

export function QuoteClientFields({ draft, onChange }: { draft: QuoteDraft; onChange: (updates: Partial<QuoteDraft>) => void }) {
  const [term, setTerm] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    if (term.trim().length >= 2) clientRepository.getClients(term).then((list) => {
      if (active) { setClients(list); setOpen(list.length > 0); }
    }).catch(() => { if (active) setClients([]); });
    else { setClients([]); setOpen(false); }
    return () => { active = false; };
  }, [term]);

  const choose = (client: Client) => {
    onChange({ client_id: client.id, client_name: client.business_name, client_address: client.address ?? "",
      client_city: client.city ?? "", client_postal_code: client.postal_code ?? "", client_province: client.province ?? "",
      client_vat: client.vat_number ?? "", client_fiscal_code: client.fiscal_code ?? "", client_sdi: client.sdi_code ?? "",
      client_pec: client.pec ?? "", client_phones: client.phones, destination_name: client.destination_name || client.business_name,
      destination_address: client.destination_address || client.address || "", destination_city: client.destination_city || client.city || "",
      payment_method: client.payment_method || draft.payment_method || "" });
    setTerm(""); setOpen(false);
  };

  return <section className="grid grid-cols-12 items-end gap-2 border-b border-[var(--border)] pb-3">
    <div className="relative col-span-12 min-w-0 md:col-span-3"><FieldLabel icon={<User />} title="Cliente" />
      <input value={term || draft.client_name || ""} onChange={(event) => {
        const value = event.target.value; setTerm(value); onChange({ client_id: null, client_name: value });
      }} onFocus={() => setTerm(draft.client_name ?? "")} placeholder="Seleziona o digita cliente…" className={inputClass} />
      {open && <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-[var(--border)] bg-[var(--card)] shadow-lg">
        {clients.map((client) => <button key={client.id} type="button" onClick={() => choose(client)} className="block w-full border-b border-[var(--border)] px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background)]">
          <span className="font-medium">{client.business_name}</span><span className="ml-2 text-xs text-[var(--muted-foreground)]">{[client.vat_number, client.city].filter(Boolean).join(" · ")}</span>
        </button>)}</div>}</div>
    <FieldBox className="col-span-12 md:col-span-2" label="Oggetto / Titolo" icon={<FileText />} value={draft.subject ?? ""} onChange={(value) => onChange({ subject: value })} />
    <FieldBox className="col-span-6 md:col-span-1" label="Data" icon={<CalendarDays />} type="date" value={draft.quote_date ?? ""} onChange={(value) => onChange({ quote_date: value })} />
    <FieldBox className="col-span-3 md:col-span-1" label="Validità" icon={<Clock3 />} type="number" value={String(draft.validity_days ?? 30)} onChange={(value) => onChange({ validity_days: Number(value) || 0 })} />
    <FieldBox className="col-span-3 md:col-span-1" label="Consegna" icon={<Truck />} type="date" value={draft.delivery_date ?? ""} onChange={(value) => onChange({ delivery_date: value })} />
    <FieldBox className="col-span-6 md:col-span-2" label="Destinazione" icon={<MapPin />} value={draft.destination_address || draft.destination_name || ""} title={draft.destination_city ?? ""}
      onChange={(value) => onChange({ destination_name: value, destination_address: value })} />
    <FieldBox className="col-span-6 md:col-span-2" label="Pagamento" icon={<Wallet />} value={draft.payment_method ?? ""} onChange={(value) => onChange({ payment_method: value })} />
  </section>;
}

function FieldBox({ label, icon, value, onChange, type = "text", className, title }: {
  label: string; icon: ReactNode; value: string; onChange: (value: string) => void;
  type?: string; className?: string; title?: string;
}) {
  return <label className={`${className ?? ""} min-w-0`} title={title}><FieldLabel icon={icon} title={label} />
    <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} />
  </label>;
}

function FieldLabel({ icon, title }: { icon: ReactNode; title: string }) {
  return <span className="mb-1 flex items-center gap-1 truncate text-[9px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
    <span className="text-[var(--primary)] [&>svg]:h-3 [&>svg]:w-3">{icon}</span>{title}
  </span>;
}

const inputClass = "h-[34px] w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]";

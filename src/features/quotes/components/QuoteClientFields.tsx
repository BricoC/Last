import { useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import { CalendarDays, Clock3, FileText, MapPin, Truck, User, Wallet, X } from "lucide-react";
import { clientRepository } from "@/features/clients/services/clientRepository";
import type { Client } from "@/features/clients/models/client";
import type { QuoteDraft } from "../models/quoteDraft";

export function QuoteClientFields({ draft, onChange }: { draft: QuoteDraft; onChange: (updates: Partial<QuoteDraft>) => void }) {
  const [term, setTerm] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Carica clienti in base al testo o tutti i clienti se la textbox è vuota
  useEffect(() => {
    let active = true;
    const q = isTyping ? term.trim() : (draft.client_name?.trim() || "");
    const isFull = !isTyping && !term.trim();
    const queryToFetch = isFull ? "" : q;

    clientRepository.getClients(queryToFetch).then((list) => {
      if (!active) return;
      setClients(list);
      if (isFull && draft.client_name) {
        const foundIdx = list.findIndex(
          (c) => c.business_name.trim().toLowerCase() === draft.client_name?.trim().toLowerCase()
        );
        setSelectedIndex(foundIdx >= 0 ? foundIdx : 0);
      } else {
        setSelectedIndex(0);
      }
    }).catch(() => {
      if (active) setClients([]);
    });

    return () => { active = false; };
  }, [term, isTyping, draft.client_name]);

  // Click fuori per chiudere la tendina
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setIsTyping(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Scorrimento automatico dell'elemento evidenziato
  useEffect(() => {
    if (open && listRef.current && listRef.current.children[selectedIndex]) {
      (listRef.current.children[selectedIndex] as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, open]);

  const choose = (client: Client) => {
    let destName = client.destination_name || client.business_name;
    let destAddress = client.destination_address || client.address || "";
    let destCity = client.destination_city || client.city || "";

    if (client.destinations && client.destinations.length > 0) {
      const firstDest = client.destinations[0];
      destName = firstDest.luogo || client.business_name;
      destAddress = firstDest.luogo || destAddress;
      destCity = firstDest.citta || destCity;
    }

    onChange({
      client_id: client.id,
      client_name: client.business_name,
      client_address: client.address ?? "",
      client_city: client.city ?? "",
      client_postal_code: client.postal_code ?? "",
      client_province: client.province ?? "",
      client_vat: client.vat_number ?? "",
      client_fiscal_code: client.fiscal_code ?? "",
      client_sdi: client.sdi_code ?? "",
      client_pec: client.pec ?? "",
      client_phones: client.phones,
      destination_name: destName,
      destination_address: destAddress,
      destination_city: destCity,
      payment_method: client.payment_method || draft.payment_method || "",
    });
    setTerm("");
    setIsTyping(false);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (open && clients.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < clients.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : clients.length - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < clients.length) {
          choose(clients[selectedIndex]);
        }
        return;
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setIsTyping(false);
    }
  };

  return (
    <section className="grid grid-cols-12 items-end gap-2 border-b border-[var(--border)] pb-3">
      <div className="relative col-span-12 min-w-0 md:col-span-3" ref={containerRef}>
        <FieldLabel icon={<User />} title="Cliente" />
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            value={isTyping ? term : (draft.client_name || "")}
            onChange={(event) => {
              const value = event.target.value;
              setIsTyping(true);
              setTerm(value);
              setOpen(true);
              onChange({ client_id: null, client_name: value });
            }}
            onClick={() => {
              setOpen(true);
            }}
            onFocus={() => {
              setIsTyping(true);
              setTerm(draft.client_name ?? "");
              setOpen(true);
              setTimeout(() => inputRef.current?.select(), 50);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Seleziona o digita cliente…"
            className={`${inputClass} pr-7 cursor-pointer focus:cursor-text`}
          />
          {draft.client_name && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange({ client_id: null, client_name: "" });
                setTerm("");
                setIsTyping(true);
                setOpen(true);
                inputRef.current?.focus();
              }}
              className="absolute right-2 text-[var(--muted-foreground)] hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer"
              title="Rimuovi cliente"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {open && (
          <div
            ref={listRef}
            className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-[var(--border)] bg-[var(--card)] shadow-2xl divide-y divide-[var(--border)]/40"
          >
            {clients.length === 0 ? (
              <div className="px-3 py-3 text-xs text-center text-[var(--muted-foreground)] italic">
                Nessun cliente trovato {term.trim() ? `per "${term.trim()}"` : ""}
              </div>
            ) : (
              clients.map((client, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => choose(client)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`block w-full px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-blue-600 text-white font-semibold"
                        : "text-[var(--foreground)] hover:bg-[var(--background)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold truncate">{client.business_name}</span>
                      <span className={`text-[10px] shrink-0 ${isSelected ? "text-blue-100" : "text-[var(--muted-foreground)]"}`}>
                        {[client.vat_number, client.city].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <FieldBox className="col-span-12 md:col-span-2" label="Oggetto / Titolo" icon={<FileText />} value={draft.subject ?? ""} onChange={(value) => onChange({ subject: value })} />
      <FieldBox className="col-span-6 md:col-span-1" label="Data" icon={<CalendarDays />} type="date" value={draft.quote_date ?? ""} onChange={(value) => onChange({ quote_date: value })} />
      <FieldBox className="col-span-3 md:col-span-1" label="Validità" icon={<Clock3 />} type="number" value={String(draft.validity_days ?? 30)} onChange={(value) => onChange({ validity_days: Number(value) || 0 })} />
      <FieldBox className="col-span-3 md:col-span-1" label="Consegna" icon={<Truck />} type="date" value={draft.delivery_date ?? ""} onChange={(value) => onChange({ delivery_date: value })} />
      <FieldBox className="col-span-6 md:col-span-2" label="Destinazione" icon={<MapPin />} value={draft.destination_address || draft.destination_name || ""} title={draft.destination_city ?? ""}
        onChange={(value) => onChange({ destination_name: value, destination_address: value })} />
      <FieldBox className="col-span-6 md:col-span-2" label="Pagamento" icon={<Wallet />} value={draft.payment_method ?? ""} onChange={(value) => onChange({ payment_method: value })} />
    </section>
  );
}

function FieldBox({ label, icon, value, onChange, type = "text", className, title }: {
  label: string; icon: ReactNode; value: string; onChange: (value: string) => void;
  type?: string; className?: string; title?: string;
}) {
  return (
    <label className={`${className ?? ""} min-w-0`} title={title}>
      <FieldLabel icon={icon} title={label} />
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} />
    </label>
  );
}

function FieldLabel({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <span className="mb-1 flex items-center gap-1 truncate text-[9px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
      <span className="text-[var(--primary)] [&>svg]:h-3 [&>svg]:w-3">{icon}</span>{title}
    </span>
  );
}

const inputClass = "h-[34px] w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]";

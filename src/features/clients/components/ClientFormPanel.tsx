import { FormEvent, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Client, ClientPhone, CreateClientInput } from "../models/client";

interface ClientFormPanelProps {
  client: Client | null;
  onClose: () => void;
  onSave: (input: CreateClientInput & { id?: string }) => Promise<void>;
  onDelete?: () => void;
}

type FormValues = CreateClientInput;
const emptyValues: FormValues = { business_name: "", phones: [], is_active: true };

export function ClientFormPanel({ client, onClose, onSave, onDelete }: ClientFormPanelProps) {
  const [values, setValues] = useState<FormValues>(() => client ? {
    code: client.code,
    business_name: client.business_name,
    address: client.address,
    city: client.city,
    postal_code: client.postal_code,
    province: client.province,
    vat_number: client.vat_number,
    fiscal_code: client.fiscal_code,
    sdi_code: client.sdi_code,
    pec: client.pec,
    payment_method: client.payment_method,
    destination_name: client.destination_name,
    destination_address: client.destination_address,
    destination_city: client.destination_city,
    phones: client.phones,
    notes: client.notes,
    is_active: client.is_active,
  } : emptyValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (key: keyof FormValues, value: string | boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
  };
  const changePhone = (index: number, key: keyof ClientPhone, value: string) => {
    setValues((current) => ({
      ...current,
      phones: (current.phones ?? []).map((phone, phoneIndex) =>
        phoneIndex === index ? { ...phone, [key]: value } : phone
      ),
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...values, business_name: values.business_name?.trim() ?? "", id: client?.id });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Salvataggio cliente non riuscito.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "h-9 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]";
  const field = (label: string, key: keyof FormValues, placeholder?: string) => (
    <label className="grid gap-1.5 text-xs text-[var(--muted-foreground)]" key={key}>
      {label}
      <input className={inputClass} value={String(values[key] ?? "")} placeholder={placeholder}
        onChange={(event) => change(key, event.target.value)} />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[var(--foreground)]/35" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <form onSubmit={submit} className="flex h-full w-full max-w-2xl flex-col border-l border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-xl" aria-label="Scheda cliente">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div><h2 className="text-base font-semibold">{client ? "Modifica cliente" : "Nuovo cliente"}</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Dati anagrafici, fiscali e destinazione della merce</p></div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Chiudi scheda"><X className="h-4 w-4" /></Button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">{field("Ragione sociale *", "business_name", "Ragione sociale o nominativo")}</div>
            {field("Codice cliente", "code")}
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={values.is_active !== false} onChange={(event) => change("is_active", event.target.checked)} /> Cliente attivo</label>
            {field("Partita IVA", "vat_number")}
            {field("Codice fiscale", "fiscal_code")}
            {field("Codice SDI", "sdi_code")}
            {field("PEC", "pec")}
          </section>
          <section className="space-y-3 border-t border-[var(--border)] pt-4">
            <h3 className="text-sm font-semibold">Sede legale</h3>
            {field("Indirizzo", "address")}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{field("CAP", "postal_code")}{field("Città", "city")}{field("Provincia", "province")}</div>
          </section>
          <section className="space-y-3 border-t border-[var(--border)] pt-4">
            <h3 className="text-sm font-semibold">Destinazione merci alternativa</h3>
            {field("Nome / Ragione sociale", "destination_name")}
            {field("Indirizzo", "destination_address")}
            {field("Città", "destination_city")}
          </section>
          <section className="space-y-3 border-t border-[var(--border)] pt-4">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Telefoni</h3>
              <Button type="button" size="sm" variant="outline" onClick={() => setValues((current) => ({ ...current, phones: [...(current.phones ?? []), { id: crypto.randomUUID(), nome: "", numero: "" }] }))}><Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi</Button></div>
            {(values.phones ?? []).map((phone, index) => <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={phone.id}>
              <input className={inputClass} aria-label="Nome telefono" placeholder="Etichetta (es. Ufficio)" value={phone.nome} onChange={(event) => changePhone(index, "nome", event.target.value)} />
              <input className={inputClass} aria-label="Numero telefono" placeholder="Numero" value={phone.numero} onChange={(event) => changePhone(index, "numero", event.target.value)} />
              <Button type="button" variant="ghost" size="sm" aria-label="Rimuovi telefono" onClick={() => setValues((current) => ({ ...current, phones: (current.phones ?? []).filter((_, i) => i !== index) }))}><Trash2 className="h-4 w-4" /></Button>
            </div>)}
          </section>
          <section className="space-y-3 border-t border-[var(--border)] pt-4">
            {field("Metodo di pagamento", "payment_method")}
            <label className="grid gap-1.5 text-xs text-[var(--muted-foreground)]">Note<textarea className={`${inputClass} h-20 resize-y py-2`} value={values.notes ?? ""} onChange={(event) => change("notes", event.target.value)} /></label>
          </section>
          {error && <p role="alert" className="rounded-[var(--radius)] border border-[var(--destructive)] p-3 text-sm text-[var(--destructive)]">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          {client && onDelete && <Button type="button" variant="danger" className="mr-auto" onClick={onDelete} disabled={saving}>Archivia cliente</Button>}
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          <Button type="submit" variant="primary" disabled={saving || !values.business_name?.trim()}>{saving ? "Salvataggio…" : "Salva cliente"}</Button>
        </footer>
      </form>
    </div>
  );
}

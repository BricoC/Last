import { useEffect, useState } from "react";
import { getCompanySettings, saveCompanySettings, type CompanySettingsInput } from "./companySettingsRepository";

const emptySettings: CompanySettingsInput = {
  business_name: "", address: "", postal_code: "", city: "", province: "",
  vat_number: "", fiscal_code: "", phone: "", email: "", logo_data_url: null,
};

export function CompanySettingsPanel() {
  const [values, setValues] = useState<CompanySettingsInput>(emptySettings);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { getCompanySettings().then((settings) => {
    if (settings) setValues({ ...settings, logo_data_url: settings.logo_data_url });
  }).catch(() => setMessage("Impossibile leggere i dati aziendali.")); }, []);

  const set = (field: keyof CompanySettingsInput, value: string | null) => setValues((current) => ({ ...current, [field]: value }));
  const loadLogo = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") set("logo_data_url", reader.result); };
    reader.readAsDataURL(file);
  };
  const save = async () => {
    setSaving(true); setMessage("");
    try { await saveCompanySettings(values); setMessage("Dati aziendali salvati."); }
    catch { setMessage("Salvataggio dei dati aziendali non riuscito."); }
    finally { setSaving(false); }
  };

  return <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
    <div><h2 className="text-sm font-semibold">Dati aziendali</h2>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">Queste informazioni compaiono nell’intestazione dei preventivi stampati.</p></div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field label="Ragione sociale" value={values.business_name} onChange={(value) => set("business_name", value)} />
      <Field label="Indirizzo" value={values.address} onChange={(value) => set("address", value)} />
      <Field label="CAP" value={values.postal_code} onChange={(value) => set("postal_code", value)} />
      <Field label="Città" value={values.city} onChange={(value) => set("city", value)} />
      <Field label="Provincia" value={values.province} onChange={(value) => set("province", value)} />
      <Field label="Partita IVA" value={values.vat_number} onChange={(value) => set("vat_number", value)} />
      <Field label="Codice fiscale" value={values.fiscal_code} onChange={(value) => set("fiscal_code", value)} />
      <Field label="Telefono" value={values.phone} onChange={(value) => set("phone", value)} />
      <Field label="Email" value={values.email} onChange={(value) => set("email", value)} />
      <label className="text-xs text-[var(--muted-foreground)]">Logo aziendale
        <input type="file" accept="image/*" onChange={(event) => loadLogo(event.target.files?.[0])}
          className="mt-1 block w-full text-sm text-[var(--foreground)]" />
      </label>
    </div>
    {values.logo_data_url && <img src={values.logo_data_url} alt="Anteprima logo" className="max-h-16 max-w-48 object-contain" />}
    <div className="flex items-center gap-3"><button type="button" disabled={saving} onClick={() => void save()}
      className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-60">{saving ? "Salvataggio…" : "Salva dati aziendali"}</button>
      {message && <span role="status" className="text-sm text-[var(--muted-foreground)]">{message}</span>}</div>
  </section>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs text-[var(--muted-foreground)]">{label}
    <input value={value} onChange={(event) => onChange(event.target.value)}
      className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-sm text-[var(--foreground)]" />
  </label>;
}

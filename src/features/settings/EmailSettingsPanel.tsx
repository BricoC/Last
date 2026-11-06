import React, { useEffect, useState } from "react";
import {
  getEmailSettings,
  saveEmailSettings,
  pullEmailSettingsFromSupabase,
  DEFAULT_EMAIL_SETTINGS,
  type EmailSettingsInput,
} from "./emailSettingsRepository";
import {
  Mail,
  Building,
  Landmark,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Cloud,
  CloudCheck,
  RefreshCw,
} from "lucide-react";

export const EmailSettingsPanel: React.FC = () => {
  const [values, setValues] = useState<EmailSettingsInput>(DEFAULT_EMAIL_SETTINGS);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [syncingCloud, setSyncingCloud] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    // 1. Carica subito da SQLite locale (offline-first, zero attesa)
    getEmailSettings()
      .then((settings) => {
        if (mounted) {
          setValues(settings);
          setLoading(false);
        }
        // 2. Prova a verificare se c'è un aggiornamento su Supabase Cloud
        pullEmailSettingsFromSupabase()
          .then((remote) => {
            if (remote && mounted) {
              setValues(remote);
            }
          })
          .catch(() => {
            // Silenzioso: la copia locale è già disponibile
          });
      })
      .catch((err) => {
        console.error("Errore caricamento impostazioni email:", err);
        if (mounted) {
          setStatusMessage({ text: "Impossibile caricare le impostazioni email da SQLite.", type: "error" });
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleChange = (field: keyof EmailSettingsInput, val: string) => {
    setValues((prev) => ({ ...prev, [field]: val }));
    if (statusMessage) setStatusMessage(null);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await saveEmailSettings(values);
      if (res.syncedCloud) {
        setStatusMessage({
          text: "Configurazione email salvata in SQLite locale e sincronizzata su Supabase Cloud con successo.",
          type: "success",
        });
      } else {
        setStatusMessage({
          text: "Configurazione salvata in SQLite locale. Connessione Cloud non riuscita o tabella Supabase da verificare.",
          type: "info",
        });
      }
    } catch (err: any) {
      console.error("Errore salvataggio impostazioni email:", err);
      setStatusMessage({
        text: err?.message || "Errore durante il salvataggio dei parametri email.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePullCloud = async () => {
    setSyncingCloud(true);
    setStatusMessage(null);
    try {
      const remote = await pullEmailSettingsFromSupabase();
      if (remote) {
        setValues(remote);
        setStatusMessage({
          text: "Impostazioni email aggiornate con successo da Supabase Cloud.",
          type: "success",
        });
      } else {
        setStatusMessage({
          text: "Nessun dato remoto trovato su Supabase Cloud o connessione non disponibile.",
          type: "info",
        });
      }
    } catch (err: any) {
      setStatusMessage({
        text: err?.message || "Errore durante il recupero da Supabase Cloud.",
        type: "error",
      });
    } finally {
      setSyncingCloud(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
        Caricamento parametri email in corso...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Mail className="w-4 h-4 text-[var(--primary)]" />
            Configurazione Recapiti Email (Cloud Supabase + SQLite)
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Parametri email condivisi tra tutte le postazioni via Supabase Cloud e memorizzati localmente per operare offline.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handlePullCloud()}
            disabled={syncingCloud || saving}
            title="Sincronizza manualmente da Supabase Cloud"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs text-[var(--foreground)] hover:border-[var(--primary)] disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingCloud ? "animate-spin text-[var(--primary)]" : ""}`} />
            <span>{syncingCloud ? "Aggiornamento..." : "Aggiorna da Cloud"}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-sm"
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>{saving ? "Salvataggio..." : "Salva su SQLite & Cloud"}</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium border ${
            statusMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : statusMessage.type === "info"
              ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : statusMessage.type === "info" ? (
            <CloudCheck className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Sezione 1: Cartiere Carrara */}
      <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
          <Building className="w-4 h-4 text-amber-500" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Cartiere Carrara SpA</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Destinatari predefiniti per invio DDT multipli, solleciti e invii singoli OR Numbers
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EmailField
            label="Email Principale (A / TO)"
            value={values.carrara_to}
            placeholder="es. alessio.piccinini@cartierecarrara.com"
            onChange={(val) => handleChange("carrara_to", val)}
          />
          <EmailField
            label="Email in Copia Conoscenza (CC)"
            value={values.carrara_cc}
            placeholder="es. federica.bianchi@cartierecarrara.com"
            onChange={(val) => handleChange("carrara_cc", val)}
          />
        </div>
      </section>

      {/* Sezione 2: Wepa */}
      <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
          <Building className="w-4 h-4 text-blue-500" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Wepa Italia Srl</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Separazione automatica per stabilimento di destinazione merci
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <span className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider block mb-2">
              Stabilimento Salanetti
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <EmailField
                label="Email Salanetti (A / TO)"
                value={values.wepa_salanetti_to}
                placeholder="es. Roberto.Lazzareschi@wepa.eu"
                onChange={(val) => handleChange("wepa_salanetti_to", val)}
              />
              <EmailField
                label="Email Salanetti (CC)"
                value={values.wepa_salanetti_cc}
                placeholder="es. Massimiliano.Giusti@wepa.eu"
                onChange={(val) => handleChange("wepa_salanetti_cc", val)}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)]">
            <span className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider block mb-2">
              Stabilimento Ralletta & Altre Destinazioni
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <EmailField
                label="Email Ralletta (A / TO)"
                value={values.wepa_ralletta_to}
                placeholder="es. Davide.Petrucci@wepa.eu"
                onChange={(val) => handleChange("wepa_ralletta_to", val)}
              />
              <EmailField
                label="Email Ralletta (CC)"
                value={values.wepa_ralletta_cc}
                placeholder="es. Massimiliano.Giusti@wepa.eu"
                onChange={(val) => handleChange("wepa_ralletta_cc", val)}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Sezione 3: Banca & Commercialista */}
      <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
          <Landmark className="w-4 h-4 text-emerald-500" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Banca & Commercialista</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Recapiti di riferimento per comunicazioni amministrative, contabili e finanziarie
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Landmark className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider">
                Istituto Bancario
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <EmailField
                label="Email Banca Principale (A / TO)"
                value={values.bank_to}
                placeholder="es. rachele.neri@bpc.bcc.it"
                onChange={(val) => handleChange("bank_to", val)}
              />
              <EmailField
                label="Email Referente / Filiale (CC)"
                value={values.bank_cc}
                placeholder="es. capannori@bpc.bcc.it"
                onChange={(val) => handleChange("bank_cc", val)}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)]">
            <div className="flex items-center gap-1.5 mb-2">
              <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider">
                Studio Commercialista
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <EmailField
                label="Email Studio Commercialista (A / TO)"
                value={values.accountant_to}
                placeholder="es. contabilita@studiotaddeucci.it"
                onChange={(val) => handleChange("accountant_to", val)}
              />
              <EmailField
                label="Email Collaboratore / CC"
                value={values.accountant_cc}
                placeholder="es. fiscale@studiocommercialista.it"
                onChange={(val) => handleChange("accountant_cc", val)}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

function EmailField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-[var(--muted-foreground)] space-y-1">
      <span className="font-medium text-[var(--foreground)]">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50 focus:border-[var(--primary)] focus:outline-none transition-colors"
      />
    </label>
  );
}

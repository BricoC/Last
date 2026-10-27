import React, { FormEvent, useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Users,
  MapPin,
  Tag,
  CreditCard,
  FileText,
  Save,
  AlertCircle,
  Building2,
  Phone,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Client, ClientPhone, CreateClientInput } from "../models/client";
import { ClientPriceListTab } from "./ClientPriceListTab";
import { ClientDestinationsTab } from "./ClientDestinationsTab";
import { ClientDdtHistoryTab } from "./ClientDdtHistoryTab";
import { clientRepository } from "../services/clientRepository";

interface ClientFormPanelProps {
  client: Client | null;
  onClose: () => void;
  onSave: (input: CreateClientInput & { id?: string }) => Promise<void>;
  onDelete?: () => void;
  onOpenArticleHistory?: (clientName: string) => void;
}

type TabKey = "anagrafica" | "destinazioni" | "listini" | "pagamento" | "ddt";

const emptyValues: CreateClientInput = {
  business_name: "",
  destinations: [],
  price_lists: [],
  phones: [],
  is_active: true,
};

export const ClientFormPanel: React.FC<ClientFormPanelProps> = ({
  client,
  onClose,
  onSave,
  onDelete,
  onOpenArticleHistory,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>("anagrafica");
  const [allPriceLists, setAllPriceLists] = useState<string[]>([]);
  const [values, setValues] = useState<CreateClientInput>(() =>
    client
      ? {
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
          email: client.email,
          payment_method: client.payment_method,
          destination_name: client.destination_name,
          destination_address: client.destination_address,
          destination_city: client.destination_city,
          destinations: client.destinations || [],
          price_lists: client.price_lists || [],
          phones: client.phones || [],
          notes: client.notes,
          is_active: client.is_active,
        }
      : emptyValues
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carica tutti i listini disponibili per il menù a tendina
  useEffect(() => {
    void clientRepository.getAllAvailablePriceLists().then(setAllPriceLists);
  }, []);

  // Gestione tasto Escape a due livelli:
  // 1. Se un input/textarea ha il focus, il primo Esc toglie il focus (chiude la modifica)
  // 2. Se nessun campo ha il focus, il secondo Esc chiude l'intero popup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const activeEl = document.activeElement;
        const isInputFocused =
          activeEl &&
          (activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            activeEl.tagName === "SELECT");

        if (isInputFocused) {
          (activeEl as HTMLElement).blur();
          e.preventDefault();
          e.stopPropagation();
        } else {
          if (!saving) {
            onClose();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  const change = (key: keyof CreateClientInput, value: unknown) => {
    setValues((cur) => ({ ...cur, [key]: value }));
  };

  const changePhone = (index: number, key: keyof ClientPhone, value: string) => {
    setValues((cur) => ({
      ...cur,
      phones: (cur.phones ?? []).map((p, i) => (i === index ? { ...p, [key]: value } : p)),
    }));
  };

  const addPhone = () => {
    setValues((cur) => ({
      ...cur,
      phones: [
        ...(cur.phones ?? []),
        { id: crypto.randomUUID(), nome: "Ufficio", numero: "" },
      ],
    }));
  };

  const removePhone = (index: number) => {
    setValues((cur) => ({
      ...cur,
      phones: (cur.phones ?? []).filter((_, i) => i !== index),
    }));
  };

  const submit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!values.business_name?.trim()) {
      setError("La Ragione Sociale è obbligatoria.");
      setActiveTab("anagrafica");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...values,
        business_name: values.business_name.trim().toUpperCase(),
        id: client?.id,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Salvataggio non riuscito.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex flex-col w-full max-w-4xl h-[90vh] max-h-[850px] rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95">
        {/* HEADER MODALE */}
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--card)]/80 select-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
                <span>{client ? client.business_name : "Nuova Scheda Cliente"}</span>
                {values.is_active === false && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                    Inattivo
                  </span>
                )}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {client
                  ? `Codice: ${client.code || "N/D"} · P.IVA: ${client.vat_number || "Non specificata"}`
                  : "Compila i dati anagrafici e associa i listini dedicati"}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-full hover:bg-[var(--background)]"
          >
            <X className="w-4 h-4" />
          </Button>
        </header>

        {/* BARRA TAB DI NAVIGAZIONE */}
        <div className="flex items-center gap-1 px-4 border-b border-[var(--border)] bg-[var(--background)]/70 overflow-x-auto select-none no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab("anagrafica")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "anagrafica"
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Anagrafica & Sede</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("destinazioni")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "destinazioni"
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Destinazioni Merci</span>
            {(values.destinations?.length ?? 0) > 1 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-sky-500/15 text-sky-400 font-bold">
                {values.destinations?.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("listini")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "listini"
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Listini Collegati & Prezzi</span>
            {(values.price_lists?.length ?? 0) > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/15 text-emerald-400 font-bold">
                {values.price_lists?.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pagamento")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "pagamento"
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Pagamento & Note</span>
          </button>

          {client && (
            <button
              type="button"
              onClick={() => setActiveTab("ddt")}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                activeTab === "ddt"
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Storico DDT</span>
            </button>
          )}
        </div>

        {/* CONTENUTO TAB */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: ANAGRAFICA & SEDE */}
          {activeTab === "anagrafica" && (
            <div className="space-y-5">
              {/* Sezione Principale */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Dati Aziendali
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                      Ragione Sociale / Denominazione *
                    </label>
                    <input
                      type="text"
                      value={values.business_name}
                      onChange={(e) => change("business_name", e.target.value)}
                      placeholder="es. CARTIERE CARRARA S.P.A."
                      className={`${inputClass} font-semibold`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                      Codice Cliente
                    </label>
                    <input
                      type="text"
                      value={values.code || ""}
                      onChange={(e) => change("code", e.target.value)}
                      placeholder="es. CLI-0023"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                      Partita IVA
                    </label>
                    <input
                      type="text"
                      value={values.vat_number || ""}
                      onChange={(e) => change("vat_number", e.target.value)}
                      placeholder="es. IT01234567890"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                      Codice Fiscale
                    </label>
                    <input
                      type="text"
                      value={values.fiscal_code || ""}
                      onChange={(e) => change("fiscal_code", e.target.value)}
                      placeholder="Codice Fiscale"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                      Codice SDI
                    </label>
                    <input
                      type="text"
                      value={values.sdi_code || ""}
                      onChange={(e) => change("sdi_code", e.target.value)}
                      placeholder="7 caratteri (o 0000000)"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                      PEC
                    </label>
                    <input
                      type="email"
                      value={values.pec || ""}
                      onChange={(e) => change("pec", e.target.value)}
                      placeholder="pec@azienda.it"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                    Email Ordinaria / Amministrazione
                  </label>
                  <input
                    type="email"
                    value={values.email || ""}
                    onChange={(e) => change("email", e.target.value)}
                    placeholder="amministrazione@azienda.it"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Sede Legale */}
              <div className="pt-4 border-t border-[var(--border)] space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Sede Legale
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                      Indirizzo (Via / Piazza e n. civico)
                    </label>
                    <input
                      type="text"
                      value={values.address || ""}
                      onChange={(e) => change("address", e.target.value)}
                      placeholder="es. VIA CAV. LAV. MARIO CARRARA"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                      Città / Località
                    </label>
                    <input
                      type="text"
                      value={values.city || ""}
                      onChange={(e) => change("city", e.target.value)}
                      placeholder="es. TASSIGNANO"
                      className={inputClass}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                        Prov.
                      </label>
                      <input
                        type="text"
                        maxLength={2}
                        value={values.province || ""}
                        onChange={(e) => change("province", e.target.value.toUpperCase())}
                        placeholder="LU"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                        CAP
                      </label>
                      <input
                        type="text"
                        value={values.postal_code || ""}
                        onChange={(e) => change("postal_code", e.target.value)}
                        placeholder="55012"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Rubrica Telefoni & Referenti */}
              <div className="pt-4 border-t border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Telefoni & Referenti ({values.phones?.length ?? 0})
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addPhone}
                    className="h-7 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Aggiungi Contatto
                  </Button>
                </div>

                <div className="space-y-2">
                  {(values.phones ?? []).map((phone, idx) => (
                    <div
                      key={phone.id}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_auto] gap-2 items-center p-2 rounded-md bg-[var(--background)] border border-[var(--border)]"
                    >
                      <input
                        type="text"
                        value={phone.nome}
                        onChange={(e) => changePhone(idx, "nome", e.target.value)}
                        placeholder="Etichetta (es. Ufficio, Mario Acquisti...)"
                        className={inputClass}
                      />
                      <div className="relative">
                        <Phone className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                        <input
                          type="text"
                          value={phone.numero}
                          onChange={(e) => changePhone(idx, "numero", e.target.value)}
                          placeholder="Numero di telefono / cellulare"
                          className={`${inputClass} pl-8`}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removePhone(idx)}
                        className="h-8 w-8 p-0 text-[var(--muted-foreground)] hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}

                  {(values.phones ?? []).length === 0 && (
                    <p className="text-xs text-[var(--muted-foreground)] italic">
                      Nessun numero di telefono o contatto inserito.
                    </p>
                  )}
                </div>
              </div>

              {/* Stato Cliente */}
              <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-[var(--foreground)]">Stato Cliente</span>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Se disattivato, il cliente non apparirà nelle selezioni rapide dei nuovi documenti.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={values.is_active !== false}
                    onChange={(e) => change("is_active", e.target.checked)}
                    className="rounded border-[var(--border)]"
                  />
                  <span>Cliente Attivo</span>
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: DESTINAZIONI MERCI */}
          {activeTab === "destinazioni" && (
            <ClientDestinationsTab
              destinations={values.destinations || []}
              onChangeDestinations={(d) => change("destinations", d)}
            />
          )}

          {/* TAB 3: LISTINI COLLEGATI & PREZZI */}
          {activeTab === "listini" && (
            <ClientPriceListTab
              selectedPriceLists={values.price_lists || []}
              allAvailablePriceLists={allPriceLists}
              onChangePriceLists={(l) => change("price_lists", l)}
              onOpenArticleHistory={
                client && onOpenArticleHistory ? () => onOpenArticleHistory(client.business_name) : undefined
              }
            />
          )}

          {/* TAB 4: PAGAMENTO & NOTE */}
          {activeTab === "pagamento" && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                  Metodo di Pagamento Predefinito
                </label>
                <input
                  type="text"
                  value={values.payment_method || ""}
                  onChange={(e) => change("payment_method", e.target.value)}
                  placeholder="es. RI.BA. 60 GG F.M., RIMESSA DIRETTA, BONIFICO 90 GG..."
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">
                  Note Interne & Promemoria Cliente
                </label>
                <textarea
                  rows={6}
                  value={values.notes || ""}
                  onChange={(e) => change("notes", e.target.value)}
                  placeholder="Inserisci eventuali accordi commerciali, istruzioni o note speciali per questo cliente..."
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>
            </div>
          )}

          {/* TAB 5: STORICO DDT */}
          {activeTab === "ddt" && client && (
            <ClientDdtHistoryTab
              clientName={client.business_name}
              onOpenArticleHistory={
                onOpenArticleHistory ? () => onOpenArticleHistory(client.business_name) : undefined
              }
            />
          )}
        </div>

        {/* FOOTER AZIONI */}
        <footer className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--border)] bg-[var(--card)]/80 select-none">
          <div>
            {client && onDelete && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDelete}
                disabled={saving}
                className="text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
              >
                Archivia Cliente
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={saving}
              className="text-xs"
            >
              Annulla
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void submit()}
              disabled={saving}
              className="text-xs font-semibold px-4"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saving ? "Salvataggio..." : "Salva e Sincronizza"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from "react";
import { User, MapPin, Save, Copy } from "lucide-react";
import { DdtDocument } from "../models/ddt";
import { Client } from "@/features/clients/models/client";
import { clientRepository } from "@/features/clients/services/clientRepository";

export interface DDTClienteCardProps {
  ddt: Partial<DdtDocument>;
  setDdt: React.Dispatch<React.SetStateAction<Partial<DdtDocument>>>;
  onSaveClientToDb?: () => void;
}

export const DDTClienteCard: React.FC<DDTClienteCardProps> = ({
  ddt,
  setDdt,
  onSaveClientToDb,
}) => {
  const [clientSearch, setClientSearch] = useState("");
  const [matchingClients, setMatchingClients] = useState<Client[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Ricerca autocompletamento clienti in tempo reale da SQLite
  useEffect(() => {
    let active = true;
    if (clientSearch.trim().length >= 2) {
      clientRepository.getClients(clientSearch).then((results) => {
        if (active) {
          setMatchingClients(results);
          setShowDropdown(results.length > 0);
        }
      });
    } else {
      setMatchingClients([]);
      setShowDropdown(false);
    }
    return () => {
      active = false;
    };
  }, [clientSearch]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const handleSelectClient = (c: Client) => {
    setDdt((prev) => ({
      ...prev,
      client_id: c.id,
      client_name: c.business_name,
      client_address: c.address || "",
      client_city: c.city || "",
      client_vat: c.vat_number || "",
      client_fiscal_code: c.fiscal_code || "",
      client_sdi: c.sdi_code || "",
      payment_method: c.payment_method || prev.payment_method || "RIMESSA DIRETTA",
      destination_name: c.destination_name || prev.destination_name || c.business_name,
      destination_address: c.destination_address || prev.destination_address || c.address || "",
      destination_city: c.destination_city || prev.destination_city || c.city || "",
      client_phones: c.phones || prev.client_phones || [],
    }));
    setShowDropdown(false);
  };

  const copyLegalToDestination = () => {
    setDdt((prev) => ({
      ...prev,
      destination_name: prev.client_name || "",
      destination_address: prev.client_address || "",
      destination_city: prev.client_city || "",
    }));
  };

  const isBozza = ddt.status === "bozza" || ddt.doc_number === null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 bg-[var(--background)]">
      {/* 1. CARD DOCUMENTO (2.5 colonne) */}
      <div className="lg:col-span-3 bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 flex flex-col justify-between">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
          <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider flex items-center space-x-1">
            <span>Documento</span>
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
              isBozza
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
            }`}
          >
            {isBozza ? "Bozza" : "Confermato"}
          </span>
        </div>

        <div className="space-y-2 pt-2">
          <div>
            <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
              N° Documento
            </label>
            <input
              type="text"
              readOnly
              value={ddt.doc_number !== null
                ? `${ddt.series ? `${ddt.series}/` : ""}${ddt.doc_number}`
                : "Provvisorio (Assegnato al Salva)"}
              className="w-full mt-0.5 px-2.5 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded font-semibold text-[var(--foreground)] outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
                Data DDT
              </label>
              <input
                type="date"
                value={ddt.doc_date || ""}
                onChange={(e) => setDdt((p) => ({ ...p, doc_date: e.target.value }))}
                className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
                Anno
              </label>
              <input
                type="number"
                value={ddt.year || new Date().getFullYear()}
                onChange={(e) => setDdt((p) => ({ ...p, year: parseInt(e.target.value, 10) || 2026 }))}
                className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. CARD SPETTABILE DITTA (CLIENTE) (4.5 colonne) */}
      <div className="lg:col-span-5 bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 relative flex flex-col justify-between">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
          <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider flex items-center space-x-1.5">
            <User className="w-3.5 h-3.5 text-blue-400" />
            <span>Spettabile Ditta (Cliente)</span>
          </span>

          {onSaveClientToDb && (
            <button
              type="button"
              onClick={onSaveClientToDb}
              className="text-[11px] px-2 py-0.5 rounded bg-[var(--background)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--foreground)] flex items-center space-x-1 transition-colors"
            >
              <Save className="w-3 h-3 text-[var(--primary)]" />
              <span>Salva Cliente</span>
            </button>
          )}
        </div>

        <div className="space-y-2 pt-2" ref={dropdownRef}>
          {/* Ragione Sociale con Autocompletamento */}
          <div className="relative">
            <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
              Ragione Sociale / Nome Cliente *
            </label>
            <input
              type="text"
              value={ddt.client_name || ""}
              onChange={(e) => {
                const val = e.target.value;
                setDdt((p) => ({ ...p, client_name: val }));
                setClientSearch(val);
              }}
              onFocus={() => {
                if (ddt.client_name && ddt.client_name.length >= 2) {
                  setClientSearch(ddt.client_name);
                }
              }}
              placeholder="Digita per cercare cliente..."
              className="w-full mt-0.5 px-2.5 py-1 text-xs uppercase bg-[var(--background)] border border-[var(--border)] rounded font-medium text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
            />

            {/* Menu a tendina autocompletamento */}
            {showDropdown && matchingClients.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-md shadow-xl z-50 divide-y divide-[var(--border)]/60">
                {matchingClients.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleSelectClient(c)}
                    className="p-2 hover:bg-[var(--background)] cursor-pointer text-xs flex flex-col"
                  >
                    <span className="font-semibold text-[var(--foreground)] uppercase">{c.business_name}</span>
                    <span className="text-[10.5px] text-[var(--muted-foreground)]">
                      {c.address ? `${c.address}, ` : ""}{c.city || ""} {c.vat_number ? `— P.IVA: ${c.vat_number}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
                Indirizzo Sede
              </label>
              <input
                type="text"
                value={ddt.client_address || ""}
                onChange={(e) => setDdt((p) => ({ ...p, client_address: e.target.value }))}
                className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
                Città / CAP / Prov
              </label>
              <input
                type="text"
                value={ddt.client_city || ""}
                onChange={(e) => setDdt((p) => ({ ...p, client_city: e.target.value }))}
                className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
                Partita IVA
              </label>
              <input
                type="text"
                value={ddt.client_vat || ""}
                onChange={(e) => setDdt((p) => ({ ...p, client_vat: e.target.value }))}
                className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
                Codice Fiscale
              </label>
              <input
                type="text"
                value={ddt.client_fiscal_code || ""}
                onChange={(e) => setDdt((p) => ({ ...p, client_fiscal_code: e.target.value }))}
                className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
                SDI / Univoco
              </label>
              <input
                type="text"
                value={ddt.client_sdi || ""}
                onChange={(e) => setDdt((p) => ({ ...p, client_sdi: e.target.value }))}
                className="w-full mt-0.5 px-2 py-1 text-xs uppercase bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. CARD DESTINAZIONE MERCE & COMMERCIALE (4 colonne) */}
      <div className="lg:col-span-4 bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 flex flex-col justify-between">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
          <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider flex items-center space-x-1.5">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>Destinazione Merce & Commerciale</span>
          </span>
          <button
            type="button"
            onClick={copyLegalToDestination}
            className="text-[10.5px] text-[var(--primary)] hover:underline flex items-center space-x-1"
          >
            <Copy className="w-3 h-3" />
            <span>Copia da Sede Legale</span>
          </button>
        </div>

        <div className="space-y-2 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
                Luogo / Cantiere
              </label>
              <input
                type="text"
                value={ddt.destination_name || ""}
                onChange={(e) => setDdt((p) => ({ ...p, destination_name: e.target.value }))}
                className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
                Città Destinazione
              </label>
              <input
                type="text"
                value={ddt.destination_city || ""}
                onChange={(e) => setDdt((p) => ({ ...p, destination_city: e.target.value }))}
                className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
                Causale Trasporto
              </label>
              <input
                type="text"
                value={ddt.transport_reason || "Vendita"}
                onChange={(e) => setDdt((p) => ({ ...p, transport_reason: e.target.value }))}
                className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
                Pagamento
              </label>
              <input
                type="text"
                value={ddt.payment_method || "RIMESSA DIRETTA"}
                onChange={(e) => setDdt((p) => ({ ...p, payment_method: e.target.value }))}
                className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-7">
              <label className="text-[10.5px] uppercase font-semibold text-[var(--muted-foreground)]">
                Rif. Ordine Nr.
              </label>
              <input
                type="text"
                value={ddt.order_reference || ""}
                onChange={(e) => setDdt((p) => ({ ...p, order_reference: e.target.value }))}
                className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>

            {/* Checkbox In conto / A Saldo */}
            <div className="col-span-5 flex items-center space-x-3 pt-3">
              <label className="flex items-center space-x-1 text-xs text-[var(--foreground)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={ddt.account_or_balance === "in_conto"}
                  onChange={(e) =>
                    setDdt((p) => ({
                      ...p,
                      account_or_balance: e.target.checked ? "in_conto" : "",
                    }))
                  }
                  className="rounded border-[var(--border)] accent-[var(--primary)]"
                />
                <span>In conto</span>
              </label>
              <label className="flex items-center space-x-1 text-xs text-[var(--foreground)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={ddt.account_or_balance === "a_saldo"}
                  onChange={(e) =>
                    setDdt((p) => ({
                      ...p,
                      account_or_balance: e.target.checked ? "a_saldo" : "",
                    }))
                  }
                  className="rounded border-[var(--border)] accent-[var(--primary)]"
                />
                <span>A Saldo</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

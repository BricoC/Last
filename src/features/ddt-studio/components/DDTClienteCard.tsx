import React, { useState, useEffect, useRef } from "react";
import { Building2, MapPin, X, ChevronDown, ChevronUp, SlidersHorizontal, Plus, Check } from "lucide-react";
import { DdtDocument, DdtAccountOrBalance } from "../models/ddt";
import { Client, ClientDestination } from "@/features/clients/models/client";
import { clientRepository } from "@/features/clients/services/clientRepository";
import { deduplicateDestinations } from "@/features/clients/utils/destinationUtils";
import { getDestinationInfo } from "../utils/destinationCleaner";

export interface DDTClienteCardProps {
  ddt: Partial<DdtDocument>;
  setDdt: React.Dispatch<React.SetStateAction<Partial<DdtDocument>>>;
}

/** Formatta la data YYYY-MM-DD nel formato italiano gg/mm/aaaa */
function formatItDate(dateStr?: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export const DDTClienteCard: React.FC<DDTClienteCardProps> = ({
  ddt,
  setDdt,
}) => {
  const [clientSearch, setClientSearch] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [matchingClients, setMatchingClients] = useState<Client[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Modal Nuova Destinazione
  const [isNewDestModalOpen, setIsNewDestModalOpen] = useState(false);
  const [newDestAddress, setNewDestAddress] = useState("");
  const [newDestCity, setNewDestCity] = useState("");
  const [newDestName, setNewDestName] = useState("");
  const [saveToClient, setSaveToClient] = useState(true);
  const newDestInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isNewDestModalOpen) {
      setTimeout(() => {
        newDestInputRef.current?.focus();
        newDestInputRef.current?.select();
      }, 50);
    }
  }, [isNewDestModalOpen]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<(HTMLDivElement | null)[]>([]);

  // Tendina scelta rapida destinazione merci
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  const destDropdownRef = useRef<HTMLDivElement>(null);
  const destInputRef = useRef<HTMLInputElement>(null);

  // Caricamento lista clienti da SQLite (completa o filtrata)
  useEffect(() => {
    let active = true;
    const query = clientSearch.trim();
    const isFull = !query || query.toLowerCase() === (ddt.client_name || "").trim().toLowerCase();
    const termToFetch = isFull ? "" : query;

    clientRepository
      .getClients(termToFetch)
      .then((results) => {
        if (!active) return;
        setMatchingClients(results);
        if (isFull && ddt.client_name) {
          const foundIdx = results.findIndex(
            (c) => c.business_name.trim().toLowerCase() === ddt.client_name?.trim().toLowerCase()
          );
          setSelectedIndex(foundIdx >= 0 ? foundIdx : 0);
        } else {
          setSelectedIndex(0);
        }
      })
      .catch((err) => {
        console.error("Errore caricamento clienti:", err);
      });

    return () => {
      active = false;
    };
  }, [clientSearch, ddt.client_name]);

  // Se ddt ha client_id o client_name, recuperiamo l'anagrafica cliente e sincronizziamo
  // SEMPRE indirizzo sede, città, p.iva e destinazione se mancanti nel ddt
  useEffect(() => {
    let active = true;
    if (ddt.client_id) {
      clientRepository.getClientById(ddt.client_id).then((c) => {
        if (!active || !c) return;
        setSelectedClient(c);
        setDdt((prev) => {
          const needsAddress = !prev.client_address && c.address;
          const needsCity = !prev.client_city && c.city;
          const needsVat = !prev.client_vat && c.vat_number;
          const needsSdi = !prev.client_sdi && c.sdi_code;

          // Se destination_city contiene il codice di una destinazione alternativa del cliente (es. CV5),
          // spostiamolo in destination_address e azzeriamo destination_city
          const matchingDestInCity = c.destinations?.find(
            (d) => d.citta && d.citta.trim().toUpperCase() === (prev.destination_city || "").trim().toUpperCase()
          );

          if (needsAddress || needsCity || needsVat || needsSdi || matchingDestInCity) {
            return {
              ...prev,
              client_address: prev.client_address || c.address || "",
              client_city: prev.client_city || [c.city, c.province].filter(Boolean).join(" (") + (c.province ? ")" : ""),
              client_vat: prev.client_vat || c.vat_number || "",
              client_fiscal_code: prev.client_fiscal_code || c.fiscal_code || "",
              client_sdi: prev.client_sdi || c.sdi_code || "",
              destination_address: matchingDestInCity ? matchingDestInCity.citta : prev.destination_address,
              destination_city: matchingDestInCity ? "" : prev.destination_city,
            };
          }
          return prev;
        });
      });
    } else if (ddt.client_name?.trim()) {
      clientRepository.getClients(ddt.client_name).then((res) => {
        if (!active || res.length === 0) return;
        const exact =
          res.find((item) => item.business_name.trim().toUpperCase() === ddt.client_name?.trim().toUpperCase()) ||
          res[0];

        if (exact) {
          setSelectedClient(exact);
          setDdt((prev) => {
            const needsAddress = !prev.client_address && exact.address;
            const needsCity = !prev.client_city && exact.city;
            const needsVat = !prev.client_vat && exact.vat_number;
            const needsSdi = !prev.client_sdi && exact.sdi_code;
            const needsClientId = !prev.client_id;

            const matchingDestInCity = exact.destinations?.find(
              (d) => d.citta && d.citta.trim().toUpperCase() === (prev.destination_city || "").trim().toUpperCase()
            );

            if (needsAddress || needsCity || needsVat || needsSdi || needsClientId || matchingDestInCity) {
              return {
                ...prev,
                client_id: prev.client_id || exact.id,
                client_address: prev.client_address || exact.address || "",
                client_city: prev.client_city || [exact.city, exact.province].filter(Boolean).join(" (") + (exact.province ? ")" : ""),
                client_vat: prev.client_vat || exact.vat_number || "",
                client_fiscal_code: prev.client_fiscal_code || exact.fiscal_code || "",
                client_sdi: prev.client_sdi || exact.sdi_code || "",
                destination_address: matchingDestInCity ? matchingDestInCity.citta : prev.destination_address,
                destination_city: matchingDestInCity ? "" : prev.destination_city,
              };
            }
            return prev;
          });
        }
      });
    } else {
      setSelectedClient(null);
    }
    return () => {
      active = false;
    };
  }, [ddt.client_id, ddt.client_name]);

  // Listener globale ESC per chiudere tendine o testata espansa
  useEffect(() => {
    if (!isExpanded && !showDestDropdown && !showDropdown) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDestDropdown) {
          setShowDestDropdown(false);
          return;
        }
        if (showDropdown) {
          setShowDropdown(false);
          setIsTyping(false);
          return;
        }
        if (isExpanded) {
          e.preventDefault();
          e.stopPropagation();
          setIsExpanded(false);
        }
      }
    };
    window.addEventListener("keydown", handleEsc, true);
    return () => window.removeEventListener("keydown", handleEsc, true);
  }, [isExpanded, showDestDropdown, showDropdown]);

  // Chiusura dropdown clienti e destinazioni al click esterno
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setShowDropdown(false);
        setIsTyping(false);
      }
      if (destDropdownRef.current && !destDropdownRef.current.contains(target)) {
        setShowDestDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Scroll automatico dell'elemento evidenziato con le freccette
  useEffect(() => {
    if (showDropdown && itemsRef.current[selectedIndex]) {
      itemsRef.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, showDropdown]);

  const handleSelectClient = (c: Client) => {
    setSelectedClient(c);

    // Destinazione merci: predefinita su destinazione alternativa (sigla in Indirizzo Consegna, città vuota)
    let destName = c.business_name;
    let destAddress = c.address || "";
    let destCity = c.city || "";

    if (c.destinations && c.destinations.length > 0) {
      const firstDest = c.destinations[0];
      const destInfo = getDestinationInfo(firstDest, c.business_name);
      destName = firstDest.luogo || c.business_name;
      destAddress = destInfo.addressValue;
      destCity = "";
    } else if (c.destination_name || c.destination_city) {
      destName = c.destination_name || c.business_name;
      destAddress = c.destination_address || c.address || "";
      destCity = c.destination_city || c.city || "";
    }

    setDdt((prev) => ({
      ...prev,
      client_id: c.id,
      client_name: c.business_name,
      client_address: c.address || "",
      client_city: [c.city, c.province].filter(Boolean).join(" (") + (c.province ? ")" : ""),
      client_vat: c.vat_number || "",
      client_fiscal_code: c.fiscal_code || "",
      client_sdi: c.sdi_code || "",
      payment_method: c.payment_method || prev.payment_method || "RIMESSA DIRETTA",
      destination_name: destName,
      destination_address: destAddress,
      destination_city: destCity,
      client_phones: c.phones || [],
    }));

    setShowDropdown(false);
    setIsTyping(false);
    setClientSearch("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown && matchingClients.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < matchingClients.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : matchingClients.length - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < matchingClients.length) {
          handleSelectClient(matchingClients[selectedIndex]);
        }
        return;
      }
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setShowDropdown(false);
      setIsTyping(false);
      setClientSearch("");
      e.currentTarget.blur();
    }
  };

  const handleClearClient = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClient(null);
    setClientSearch("");
    setIsTyping(true);
    setShowDropdown(true);
    setDdt((prev) => ({
      ...prev,
      client_id: undefined,
      client_name: "",
      client_address: "",
      client_city: "",
      client_vat: "",
      client_fiscal_code: "",
      client_sdi: "",
      destination_name: "",
      destination_address: "",
      destination_city: "",
      client_phones: [],
    }));
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };


  const handleOpenNewDestModal = () => {
    setNewDestAddress("");
    setNewDestCity("");
    setNewDestName(selectedClient?.business_name || ddt.client_name || "");
    setSaveToClient(Boolean(selectedClient?.id));
    setIsNewDestModalOpen(true);
  };


  const handleSaveNewDestination = async () => {
    const cleanAddr = newDestAddress.trim();
    const cleanCity = newDestCity.trim();
    const cleanName = newDestName.trim() || selectedClient?.business_name || ddt.client_name || "";

    if (!cleanAddr && !cleanCity) return;

    // 1. Applica subito al DDT corrente
    setDdt((prev) => ({
      ...prev,
      destination_name: cleanName,
      destination_address: cleanAddr || cleanCity,
      destination_city: cleanAddr ? cleanCity : "",
    }));

    // 2. Se richiesto e il cliente esiste, salva anche nell'anagrafica cliente
    if (saveToClient && selectedClient?.id) {
      try {
        const newDestEntry: ClientDestination = {
          id: crypto.randomUUID(),
          citta: cleanAddr || cleanCity,
          luogo: cleanCity && cleanAddr ? `${cleanName} · ${cleanCity}` : cleanName,
          note: "",
        };

        const updatedDestinations = deduplicateDestinations([
          ...(selectedClient.destinations || []),
          newDestEntry,
        ]);

        const updatedClient = await clientRepository.createOrUpdateClient({
          ...selectedClient,
          destinations: updatedDestinations,
        });

        setSelectedClient(updatedClient);
      } catch (err) {
        console.error("Errore salvataggio nuova destinazione nel cliente:", err);
      }
    }

    setIsNewDestModalOpen(false);
  };

  const handleAccountOrBalanceChange = (target: "in_conto" | "a_saldo") => {
    setDdt((prev) => {
      const current = prev.account_or_balance;
      const next: DdtAccountOrBalance = current === target ? "" : target;
      return { ...prev, account_or_balance: next };
    });
  };

  return (
    <div className="bg-[var(--card)] border-b border-[var(--border)] transition-all select-none">
      {/* 1. BARRA TESTATA COMPATTA (SEMPRE VISIBILE) */}
      <div className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-xs">
        {/* Sinistra: N° DDT, Ricerca Cliente, Destinazione, Rif. Ordine, In Conto / A Saldo */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {/* Numero DDT e Data compatti */}
          <div className="flex items-center gap-1 font-mono shrink-0">
            <span className="font-bold text-[var(--foreground)] text-sm tracking-tight">
              DDT {ddt.doc_number ?? "Bozza"}
            </span>
            <span className="text-[var(--muted-foreground)] text-xs">
              del {formatItDate(ddt.doc_date)}
            </span>
          </div>

          <div className="h-4 w-px bg-[var(--border)] shrink-0" />

          {/* Textbox Cliente con Autocompletamento integrato */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <div className="flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <div className="relative flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={isTyping ? clientSearch : (ddt.client_name || "")}
                  onChange={(e) => {
                    setIsTyping(true);
                    setClientSearch(e.target.value);
                    setShowDropdown(true);
                  }}
                  onClick={() => {
                    setShowDropdown(true);
                  }}
                  onFocus={() => {
                    setIsTyping(true);
                    setClientSearch(ddt.client_name || "");
                    setShowDropdown(true);
                    setTimeout(() => inputRef.current?.select(), 50);
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      if (!showDropdown) {
                        setIsTyping(false);
                        if (clientSearch.trim() && clientSearch !== ddt.client_name) {
                          setDdt((p) => ({ ...p, client_name: clientSearch.trim() }));
                        }
                      }
                    }, 200);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Seleziona o cerca cliente..."
                  className="w-56 sm:w-64 px-2 py-0.5 pr-6 text-xs font-semibold bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/60 focus:border-[var(--primary)] outline-none cursor-pointer focus:cursor-text"
                />
                {ddt.client_name && (
                  <button
                    type="button"
                    onClick={handleClearClient}
                    className="absolute right-1 text-[var(--muted-foreground)] hover:text-red-400 p-0.5 rounded transition-colors"
                    title="Rimuovi cliente"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Menu a tendina dei clienti */}
            {showDropdown && (
              <div className="absolute left-0 top-full mt-1 w-80 sm:w-96 max-h-80 overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-md shadow-2xl z-50 divide-y divide-[var(--border)]/50">
                <div className="px-3 py-1 bg-[var(--muted)]/50 text-[10px] font-bold text-[var(--muted-foreground)] sticky top-0 z-10 backdrop-blur-xs flex items-center justify-between">
                  <span>
                    {clientSearch.trim() && clientSearch.trim().toLowerCase() !== (ddt.client_name || "").trim().toLowerCase()
                      ? "CLIENTI FILTRATI"
                      : "TUTTI I CLIENTI"}
                  </span>
                  <span className="font-mono">{matchingClients.length} clienti</span>
                </div>
                {matchingClients.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-center text-[var(--muted-foreground)] italic">
                    Nessun cliente trovato {clientSearch.trim() ? `per "${clientSearch.trim()}"` : ""}
                  </div>
                ) : (
                  matchingClients.map((c, idx) => {
                    const isSelected =
                      selectedClient?.id === c.id ||
                      (!selectedClient &&
                        ddt.client_name?.trim().toUpperCase() === c.business_name.trim().toUpperCase());
                    const isHighlighted = idx === selectedIndex;
                    return (
                      <div
                        key={c.id}
                        ref={(el) => {
                          itemsRef.current[idx] = el;
                        }}
                        onClick={() => handleSelectClient(c)}
                        className={`px-3 py-1.5 cursor-pointer text-xs transition-colors flex items-center justify-between ${
                          isHighlighted
                            ? "bg-[var(--primary)] text-white"
                            : isSelected
                            ? "bg-[var(--primary)]/15 text-[var(--foreground)] font-semibold"
                            : "hover:bg-[var(--primary)]/10 text-[var(--foreground)]"
                        }`}
                      >
                        <div className="truncate flex items-center gap-1.5 min-w-0">
                          {isSelected && (
                            <Check
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isHighlighted ? "text-white" : "text-emerald-400"
                              }`}
                            />
                          )}
                          <span className="font-bold truncate">{c.business_name}</span>
                          {c.city && (
                            <span
                              className={`text-[11px] shrink-0 ${
                                isHighlighted ? "text-white/80" : "text-[var(--muted-foreground)]"
                              }`}
                            >
                              ({c.city})
                            </span>
                          )}
                        </div>
                        {c.destinations && c.destinations.length > 1 && (
                          <span
                            className={`text-[10px] px-1 rounded font-mono shrink-0 ml-2 ${
                              isHighlighted
                                ? "bg-white/20 text-white"
                                : "bg-[var(--border)] text-[var(--muted-foreground)]"
                            }`}
                          >
                            {c.destinations.length} sedi
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-[var(--border)] shrink-0" />

          {/* Destinazione Merce con Input Modificabile + Menù Scelta Rapida */}
          <div className="flex items-center gap-1.5 shrink-0">
            <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-[var(--muted-foreground)] text-[11px] font-semibold">Dest:</span>

            <div className="relative flex items-center" ref={destDropdownRef}>
              <div className="relative flex items-center">
                <input
                  ref={destInputRef}
                  type="text"
                  value={ddt.destination_address || ""}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setDdt((prev) => ({
                      ...prev,
                      destination_address: nextVal,
                      destination_name: prev.destination_name || selectedClient?.business_name || prev.client_name || "",
                    }));
                  }}
                  placeholder="Sede Legale o indirizzo..."
                  className="h-6 pl-2 pr-6 text-xs font-bold text-sky-300 bg-[var(--background)] border border-sky-500/40 hover:border-sky-400 focus:border-sky-400 rounded focus:outline-none w-44 sm:w-56 transition-colors placeholder:text-sky-500/40"
                  title="Indirizzo di consegna merci (modificabile liberamente, es. CV7 7.6)"
                />
                <button
                  type="button"
                  onClick={() => setShowDestDropdown((prev) => !prev)}
                  className="absolute right-1 text-sky-400 hover:text-sky-200 p-0.5 rounded transition-colors"
                  title="Scegli tra le sedi di consegna salvate"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDestDropdown ? "rotate-180" : ""}`} />
                </button>
              </div>

              {/* Menu a tendina delle destinazioni */}
              {showDestDropdown && (
                <div className="absolute left-0 top-full mt-1 w-64 max-h-72 overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-md shadow-2xl z-50 divide-y divide-[var(--border)]/50">
                  <div className="px-3 py-1 bg-[var(--muted)]/50 text-[10px] font-bold text-[var(--muted-foreground)] sticky top-0 z-10 backdrop-blur-xs flex items-center justify-between">
                    <span>SEDI DI CONSEGNA</span>
                    <span className="font-mono">{(selectedClient?.destinations?.length ?? 0) + 1} sedi</span>
                  </div>

                  {/* Sede Legale */}
                  <div
                    onClick={() => {
                      setDdt((prev) => ({
                        ...prev,
                        destination_name: selectedClient?.business_name || prev.client_name || "",
                        destination_address: selectedClient?.address || prev.client_address || "",
                        destination_city: selectedClient?.city || prev.client_city || "",
                      }));
                      setShowDestDropdown(false);
                      setTimeout(() => {
                        destInputRef.current?.focus();
                        destInputRef.current?.select();
                      }, 50);
                    }}
                    className={`px-3 py-1.5 cursor-pointer text-xs transition-colors hover:bg-sky-500/15 flex items-center justify-between ${
                      !ddt.destination_address || ddt.destination_address === selectedClient?.address
                        ? "bg-sky-500/10 text-sky-300 font-bold"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    <span className="truncate">
                      Sede Legale {selectedClient?.city ? `(${selectedClient.city})` : ""}
                    </span>
                    {(!ddt.destination_address || ddt.destination_address === selectedClient?.address) && (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                  </div>

                  {/* Destinazioni anagrafica (pulite dal nome del cliente) */}
                  {selectedClient?.destinations && selectedClient.destinations.map((d, dIdx) => {
                    const { label, addressValue } = getDestinationInfo(d, selectedClient.business_name);
                    const isSelected =
                      (ddt.destination_address || "").trim().toUpperCase() === addressValue.trim().toUpperCase() ||
                      (ddt.destination_address || "").trim().toUpperCase().startsWith(addressValue.trim().toUpperCase());

                    return (
                      <div
                        key={d.id || dIdx}
                        onClick={() => {
                          setDdt((prev) => ({
                            ...prev,
                            destination_name: d.luogo || selectedClient.business_name || prev.client_name || "",
                            destination_address: addressValue,
                            destination_city: "",
                          }));
                          setShowDestDropdown(false);
                          setTimeout(() => {
                            if (destInputRef.current) {
                              destInputRef.current.focus();
                              const len = addressValue.length;
                              destInputRef.current.setSelectionRange(len, len);
                            }
                          }, 50);
                        }}
                        className={`px-3 py-1.5 cursor-pointer text-xs transition-colors hover:bg-sky-500/15 flex items-center justify-between ${
                          isSelected ? "bg-sky-500/10 text-sky-300 font-bold" : "text-[var(--foreground)]"
                        }`}
                      >
                        <span className="truncate">{label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </div>
                    );
                  })}

                  {/* Pulsante Nuova destinazione permanente */}
                  <div
                    onClick={() => {
                      setShowDestDropdown(false);
                      handleOpenNewDestModal();
                    }}
                    className="px-3 py-2 cursor-pointer text-xs text-emerald-400 hover:bg-emerald-500/10 font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Nuova destinazione permanente...</span>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleOpenNewDestModal}
              className="h-6 px-1.5 flex items-center gap-1 rounded bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 hover:text-white border border-sky-500/40 hover:border-sky-400 transition-all shrink-0 text-[11px] font-bold cursor-pointer"
              title="Aggiungi una nuova destinazione merci"
            >
              <Plus className="w-3 h-3 text-sky-400" />
              <span>Nuova</span>
            </button>
          </div>

          <div className="h-4 w-px bg-[var(--border)] shrink-0" />

          {/* Rif. Ordine (inserito subito tra Destinazione e In Conto / A Saldo) - ingrandito del 50% (w-36) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-[var(--muted-foreground)] font-semibold whitespace-nowrap">
              Rif. Ordine:
            </span>
            <input
              type="text"
              value={ddt.order_reference || ""}
              onChange={(e) => setDdt((p) => ({ ...p, order_reference: e.target.value }))}
              placeholder="Es. ORD-01"
              className="w-36 px-2 py-0.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50 focus:border-[var(--primary)] outline-none font-medium transition-all"
            />
          </div>

          <div className="h-4 w-px bg-[var(--border)] shrink-0" />

          {/* In Conto / A Saldo */}
          <div className="flex items-center gap-3 shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={ddt.account_or_balance === "in_conto"}
                onChange={() => handleAccountOrBalanceChange("in_conto")}
                className="rounded border-[var(--border)] text-blue-500 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer accent-blue-500"
              />
              <span
                className={
                  ddt.account_or_balance === "in_conto"
                    ? "font-bold text-blue-400"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }
              >
                In conto
              </span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={ddt.account_or_balance === "a_saldo"}
                onChange={() => handleAccountOrBalanceChange("a_saldo")}
                className="rounded border-[var(--border)] text-emerald-500 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer accent-emerald-500"
              />
              <span
                className={
                  ddt.account_or_balance === "a_saldo"
                    ? "font-bold text-emerald-400"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }
              >
                A saldo
              </span>
            </label>
          </div>
        </div>

        {/* Destra: Pulsante Tendina Modifica Testata */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border transition-all cursor-pointer ${
              isExpanded
                ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm"
                : "text-[var(--foreground)] bg-[var(--background)] hover:bg-[var(--border)]/60 border-[var(--border)]"
            }`}
            title={isExpanded ? "Chiudi tendina testata (Esc)" : "Apri tendina per modificare tutti i dati testata"}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Modifica Testata</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 2. TENDINA A DISCESA ESPANDIBILE (SI ABBASSA E MOSTRA TUTTE LE OPZIONI, CHIUDIBILE CON ESC) */}
      {isExpanded && (
        <div className="border-t border-[var(--border)] bg-[var(--card)] p-3.5 shadow-inner animate-in slide-in-from-top-1 duration-150">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Blocco 1: Dati Cliente & Sede Legale */}
            <div className="space-y-2 p-3 bg-[var(--background)] rounded-lg border border-[var(--border)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
                <span className="font-bold text-[var(--foreground)] flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                  Dati Anagrafici & Sede Legale
                </span>
              </div>

              <div>
                <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                  Ragione Sociale
                </label>
                <input
                  type="text"
                  value={ddt.client_name || ""}
                  onChange={(e) => setDdt((p) => ({ ...p, client_name: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                  Indirizzo Sede
                </label>
                <input
                  type="text"
                  value={ddt.client_address || ""}
                  onChange={(e) => setDdt((p) => ({ ...p, client_address: e.target.value }))}
                  placeholder="Es. Via di Tiglio"
                  className="w-full mt-0.5 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                    Città / Prov.
                  </label>
                  <input
                    type="text"
                    value={ddt.client_city || ""}
                    onChange={(e) => setDdt((p) => ({ ...p, client_city: e.target.value }))}
                    placeholder="Es. Carraia (LU)"
                    className="w-full mt-0.5 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                    P.IVA / C.F.
                  </label>
                  <input
                    type="text"
                    value={ddt.client_vat || ddt.client_fiscal_code || ""}
                    onChange={(e) => setDdt((p) => ({ ...p, client_vat: e.target.value, client_fiscal_code: e.target.value }))}
                    className="w-full mt-0.5 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] focus:border-[var(--primary)] outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                    Codice SDI
                  </label>
                  <input
                    type="text"
                    value={ddt.client_sdi || ""}
                    onChange={(e) => setDdt((p) => ({ ...p, client_sdi: e.target.value }))}
                    placeholder="0000000"
                    className="w-full mt-0.5 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] focus:border-[var(--primary)] outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                    Pagamento
                  </label>
                  <input
                    type="text"
                    value={ddt.payment_method || ""}
                    onChange={(e) => setDdt((p) => ({ ...p, payment_method: e.target.value }))}
                    placeholder="Es. RIMESSA DIRETTA"
                    className="w-full mt-0.5 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Blocco 2: Destinazione Merci */}
            <div className="space-y-2 p-3 bg-[var(--background)] rounded-lg border border-[var(--border)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
                <span className="font-bold text-[var(--foreground)] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-400" />
                  Luogo di Consegna / Destinazione
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDdt((prev) => ({
                      ...prev,
                      destination_name: prev.client_name || "",
                      destination_address: prev.client_address || "",
                      destination_city: prev.client_city || "",
                    }));
                  }}
                  className="text-[10px] text-sky-400 hover:underline font-semibold"
                >
                  Copia Sede Legale
                </button>
              </div>

              <div>
                <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                  Destinazione (Rag. Soc. / Luogo)
                </label>
                <input
                  type="text"
                  value={ddt.destination_name || ""}
                  onChange={(e) => setDdt((p) => ({ ...p, destination_name: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                  Indirizzo Consegna
                </label>
                <input
                  type="text"
                  value={ddt.destination_address || ""}
                  onChange={(e) => setDdt((p) => ({ ...p, destination_address: e.target.value }))}
                  placeholder="Es. Via di Tiglio"
                  className="w-full mt-0.5 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                  Città / Località Destinazione
                </label>
                <input
                  type="text"
                  value={ddt.destination_city || ""}
                  onChange={(e) => setDdt((p) => ({ ...p, destination_city: e.target.value }))}
                  placeholder="Es. Lucca"
                  className="w-full mt-0.5 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                />
              </div>
            </div>

            {/* Blocco 3: Dati Commerciali & Trasporto */}
            <div className="space-y-2 p-3 bg-[var(--background)] rounded-lg border border-[var(--border)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
                <span className="font-bold text-[var(--foreground)] flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                  Dati Commerciali & Consegna
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  Premi Esc per chiudere
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                    Causale Trasporto
                  </label>
                  <input
                    type="text"
                    value={ddt.transport_reason || "Vendita"}
                    onChange={(e) => setDdt((p) => ({ ...p, transport_reason: e.target.value }))}
                    className="w-full mt-0.5 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                    Rif. Ordine
                  </label>
                  <input
                    type="text"
                    value={ddt.order_reference || ""}
                    onChange={(e) => setDdt((p) => ({ ...p, order_reference: e.target.value }))}
                    placeholder="Es. ORD-01"
                    className="w-full mt-0.5 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                    Aspetto Beni
                  </label>
                  <input
                    type="text"
                    value={ddt.goods_appearance || "A vista"}
                    onChange={(e) => setDdt((p) => ({ ...p, goods_appearance: e.target.value }))}
                    className="w-full mt-0.5 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                    Porto
                  </label>
                  <input
                    type="text"
                    value={ddt.carriage_terms || "Franco stabilimento"}
                    onChange={(e) => setDdt((p) => ({ ...p, carriage_terms: e.target.value }))}
                    className="w-full mt-0.5 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="px-3 py-1 bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] rounded text-xs font-semibold text-[var(--foreground)] transition-colors cursor-pointer"
                >
                  Chiudi Tendina (Esc)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MODAL NUOVA / ALTRA DESTINAZIONE */}
      {isNewDestModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-100"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setIsNewDestModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md bg-[#0f172a] border border-sky-500/40 rounded-xl shadow-2xl p-5 flex flex-col space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-sky-500/30 pb-2.5">
              <div className="flex items-center space-x-2 text-sky-400">
                <MapPin className="w-5 h-5 text-sky-400" />
                <span className="font-black text-sm tracking-wide uppercase text-white">
                  Nuova Destinazione Merci
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsNewDestModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedClient && (
              <div className="px-3 py-2 rounded-lg bg-sky-950/40 border border-sky-500/30 text-xs">
                <span className="text-slate-400">Cliente: </span>
                <span className="font-bold text-sky-300">{selectedClient.business_name}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  Destinazione / Indirizzo Consegna / Sigla Cantiere <span className="text-rose-400">*</span>
                </label>
                <input
                  ref={newDestInputRef}
                  type="text"
                  value={newDestAddress}
                  onChange={(e) => setNewDestAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSaveNewDestination();
                    }
                  }}
                  placeholder="Es. CV8 - CARTIERE CARRARA, Via Roma 12, Cantiere Sud"
                  className="w-full px-3 py-2 bg-[#1e293b] border border-sky-500/50 rounded-lg text-white font-medium outline-none focus:ring-2 focus:ring-sky-400 placeholder:text-slate-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">
                    Città / Località
                  </label>
                  <input
                    type="text"
                    value={newDestCity}
                    onChange={(e) => setNewDestCity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSaveNewDestination();
                      }
                    }}
                    placeholder="Es. Capannori"
                    className="w-full px-3 py-2 bg-[#1e293b] border border-slate-700 focus:border-sky-500 rounded-lg text-white font-medium outline-none focus:ring-1 focus:ring-sky-400 placeholder:text-slate-500 text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">
                    Rag. Soc. Destinazione
                  </label>
                  <input
                    type="text"
                    value={newDestName}
                    onChange={(e) => setNewDestName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSaveNewDestination();
                      }
                    }}
                    placeholder={selectedClient?.business_name || "Nome destinatario"}
                    className="w-full px-3 py-2 bg-[#1e293b] border border-slate-700 focus:border-sky-500 rounded-lg text-white font-medium outline-none focus:ring-1 focus:ring-sky-400 placeholder:text-slate-500 text-xs"
                  />
                </div>
              </div>

              {selectedClient?.id && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveToClient}
                    onChange={(e) => setSaveToClient(e.target.checked)}
                    className="rounded border-slate-700 text-sky-500 focus:ring-0 h-4 w-4 accent-sky-500 cursor-pointer"
                  />
                  <span className="text-slate-300 text-xs font-semibold">
                    Salva permanentemente nell'anagrafica cliente per i prossimi DDT
                  </span>
                </label>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsNewDestModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={!newDestAddress.trim() && !newDestCity.trim()}
                onClick={() => void handleSaveNewDestination()}
                className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-black text-xs shadow-lg shadow-sky-500/20 transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Applica al DDT</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

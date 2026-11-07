import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Calendar,
  User,
  Phone,
  FileText,
  Check,
  Trash2,
  Archive,
  ArchiveRestore,
  Zap,
  Clock,
  Plus,
} from "lucide-react";
import type { OfferRecord, OfferStatus } from "../types/offer";
import { OFFER_STATUSES, OFFER_STATUS_STYLES } from "../types/offer";
import { cn } from "@/shared/utils/cn";

interface OfferEditModalProps {
  offer: OfferRecord | null; // null se è in modalità Creazione ("Nuova Offerta")
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    id: string | null,
    data: {
      offer_date: string;
      requester: string;
      contact: string | null;
      items_text: string;
      status: OfferStatus;
      is_urgent: number;
    }
  ) => Promise<void>;
  onToggleArchive?: (id: string, isArchived: boolean) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  currentUserName: string;
}

export const OfferEditModal: React.FC<OfferEditModalProps> = ({
  offer,
  isOpen,
  onClose,
  onSave,
  onToggleArchive,
  onDelete,
  currentUserName,
}) => {
  const isCreate = !offer;

  const getTodayIso = () => {
    const d = new Date();
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${yr}-${mo}-${da}`;
  };

  const [offerDate, setOfferDate] = useState("");
  const [requester, setRequester] = useState("");
  const [contact, setContact] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [status, setStatus] = useState<OfferStatus>("Da preparare");
  const [isUrgent, setIsUrgent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Riferimenti per la navigazione da tastiera tramite TAB ed ENTER
  const dateRef = useRef<HTMLInputElement>(null);
  const requesterRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<HTMLTextAreaElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (offer) {
      setOfferDate(offer.offer_date || getTodayIso());
      setRequester(offer.requester || "");
      setContact(offer.contact || "");
      setItemsText(offer.items_text || "");
      setStatus(offer.status || "Da preparare");
      setIsUrgent(Boolean(offer.is_urgent));
    } else {
      // Modalità Nuova Offerta (default pulito)
      setOfferDate(getTodayIso());
      setRequester("");
      setContact("");
      setItemsText("");
      setStatus("Da preparare");
      setIsUrgent(false);
    }
  }, [offer, isOpen]);

  // All'apertura della modale, posiziona automaticamente il cursore su Richiedente
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        requesterRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!requester.trim()) {
      requesterRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(offer ? offer.id : null, {
        offer_date: offerDate || getTodayIso(),
        requester: requester.trim(),
        contact: contact.trim() || null,
        items_text: itemsText.trim(),
        status,
        is_urgent: isUrgent ? 1 : 0,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!offer || !onToggleArchive) return;
    setIsSubmitting(true);
    try {
      await onToggleArchive(offer.id, !offer.is_archived);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!offer || !onDelete) return;
    setIsSubmitting(true);
    try {
      await onDelete(offer.id);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Navigazione da tastiera logica con Tab ed Enter tra i campi
  const handleKeyDownDate = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      requesterRef.current?.focus();
    }
  };

  const handleKeyDownRequester = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      contactRef.current?.focus();
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      contactRef.current?.focus();
    }
  };

  const handleKeyDownContact = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      itemsRef.current?.focus();
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      itemsRef.current?.focus();
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      requesterRef.current?.focus();
    }
  };

  const handleKeyDownItems = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    } else if (e.key === "Tab" && !e.shiftKey) {
      // Con Tab dal testo, salta direttamente al pulsante Salva / Crea (invece di Elimina!)
      e.preventDefault();
      saveBtnRef.current?.focus();
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      contactRef.current?.focus();
    }
  };

  const handleKeyDownSaveBtn = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      itemsRef.current?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="w-[96vw] max-w-6xl h-[92vh] max-h-[92vh] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl flex flex-col overflow-hidden text-[var(--foreground)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modale */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3.5 bg-[var(--background)]/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "p-2 rounded-lg border",
                isCreate
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  : "bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/20"
              )}
            >
              {isCreate ? <Plus className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {isCreate ? "Nuova Offerta & Richiesta Cliente" : "Modifica Offerta"}
              </h3>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {isCreate ? (
                  <span>Inserimento offerta con salvataggio offline e cloud Supabase</span>
                ) : (
                  <span>
                    Richiedente: <span className="text-white font-semibold">{offer.requester}</span>
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-white transition-colors cursor-pointer"
            title="Chiudi (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body - occupa l'intero spazio con textarea flessibile */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
            {/* Data */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">
                Data Offerta
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] pointer-events-none" />
                <input
                  ref={dateRef}
                  type="date"
                  value={offerDate}
                  onChange={(e) => setOfferDate(e.target.value)}
                  onKeyDown={handleKeyDownDate}
                  required
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)] text-white focus:outline-hidden focus:border-[var(--primary)] font-mono"
                />
              </div>
            </div>

            {/* Richiedente */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">
                Richiedente / Cliente *
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] pointer-events-none" />
                <input
                  ref={requesterRef}
                  type="text"
                  value={requester}
                  onChange={(e) => setRequester(e.target.value)}
                  onKeyDown={handleKeyDownRequester}
                  required
                  autoComplete="off"
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)] text-white focus:outline-hidden focus:border-[var(--primary)] font-medium"
                />
              </div>
            </div>

            {/* Contatto */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">
                Recapito (Tel / Email)
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] pointer-events-none" />
                <input
                  ref={contactRef}
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  onKeyDown={handleKeyDownContact}
                  autoComplete="off"
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)] text-white focus:outline-hidden focus:border-[var(--primary)]"
                />
              </div>
            </div>
          </div>

          {/* Selezione Stato e Urgente */}
          <div className="shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase">
                Stato Offerta
              </label>
              {/* Pulsante Urgente: solo fulmine grigio anonimo se disattivo, viola fluo se attivo */}
              {isUrgent ? (
                <button
                  type="button"
                  onClick={() => setIsUrgent(false)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-black bg-fuchsia-600 text-white border-fuchsia-300 shadow-[0_0_14px_rgba(217,70,239,0.7)] animate-pulse transition-all cursor-pointer select-none"
                  title="Offerta URGENTE (clicca per disattivare)"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>URGENTE</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsUrgent(true)}
                  className="p-1.5 rounded-lg border border-zinc-700/50 bg-zinc-800/30 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-all cursor-pointer select-none"
                  title="Contrassegna come Urgente"
                >
                  <Zap className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {OFFER_STATUSES.map((st) => {
                const isSelected = status === st;
                const style = OFFER_STATUS_STYLES[st];
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatus(st)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer select-none",
                      isSelected
                        ? cn(style.badgeClass, "ring-1 ring-white/20 shadow-xs")
                        : "border-[var(--border)] bg-[var(--background)]/60 text-[var(--muted-foreground)] hover:text-white"
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full", style.dot)} />
                    <span>{st}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Riquadri Tracciamento Creazione e Ultima Modifica */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-lg bg-[var(--background)]/40 border border-[var(--border)]/50 text-[11px] shrink-0">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-[var(--muted-foreground)]">
                {isCreate ? "Operatore in Creazione:" : "Creazione Offerta:"}
              </span>
              <div className="text-white font-mono flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-blue-400" />
                <span>
                  {isCreate
                    ? "In salvataggio"
                    : offer?.created_at
                    ? new Date(offer.created_at).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-"}
                </span>
                <span className="text-blue-300 font-sans font-semibold">
                  ({isCreate ? currentUserName : offer?.created_by || "Operatore"})
                </span>
              </div>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-[var(--muted-foreground)]">
                {isCreate ? "Stato Salvataggio:" : "Ultima Modifica:"}
              </span>
              <div className="text-white font-mono flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>
                  {isCreate
                    ? "Nuovo documento"
                    : offer?.updated_at
                    ? new Date(offer.updated_at).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-"}
                </span>
                <span className="text-amber-300 font-sans font-semibold">
                  ({isCreate ? "Offline + Cloud Sync" : offer?.updated_by || "Operatore"})
                </span>
              </div>
            </div>
          </div>

          {/* Articoli e Materiale - Occupa tutto lo spazio rimanente (senza placeholder) */}
          <div className="flex-1 flex flex-col min-h-[260px]">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] uppercase">
                Materiale / Articoli Richiesti & Note
              </label>
              <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                Suggerimento: Premi <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold border border-zinc-700">Tab</kbd> per andare a Salva • <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold border border-zinc-700">Ctrl+Invio</kbd> per salvare subito
              </span>
            </div>
            <textarea
              ref={itemsRef}
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
              onKeyDown={handleKeyDownItems}
              className="flex-1 w-full p-4 text-xs font-mono rounded-lg border border-[var(--border)] bg-[var(--background)] text-white focus:outline-hidden focus:border-[var(--primary)] leading-relaxed resize-y select-text min-h-[220px]"
            />
          </div>

          {/* Footer Bottoni Azione */}
          <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] shrink-0">
            <div className="flex items-center gap-2">
              {!isCreate && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 bg-red-950/30 hover:bg-red-900/40 text-xs font-medium transition-colors cursor-pointer"
                  title="Elimina definitivamente"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Elimina</span>
                </button>
              )}

              {!isCreate && onToggleArchive && offer && (
                <button
                  type="button"
                  onClick={handleArchiveToggle}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 bg-amber-950/30 hover:bg-amber-900/40 text-xs font-medium transition-colors cursor-pointer"
                  title={offer.is_archived ? "Ripristina nelle offerte attive" : "Sposta in archivio"}
                >
                  {offer.is_archived ? (
                    <>
                      <ArchiveRestore className="w-3.5 h-3.5" />
                      <span>Ripristina da Archivio</span>
                    </>
                  ) : (
                    <>
                      <Archive className="w-3.5 h-3.5" />
                      <span>Sposta in Archivio</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--background)] transition-colors cursor-pointer"
              >
                Annulla
              </button>

              <button
                ref={saveBtnRef}
                type="submit"
                disabled={isSubmitting || !requester.trim()}
                onKeyDown={handleKeyDownSaveBtn}
                className="flex items-center gap-1.5 px-5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                {isCreate ? (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? "Creazione..." : "Crea Offerta"}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? "Salvataggio..." : "Salva Modifiche"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

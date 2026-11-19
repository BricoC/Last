import { SUPABASE_SESSION_UPDATED, getSupabaseSessionEmail } from "@/shared/services/supabaseSession";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ClipboardList,
  Search,
  Plus,
  RefreshCw,
  Archive,
  ArchiveRestore,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  Phone,
  ChevronDown,
  ChevronUp,
  X,
  Copy,
  Check,
  Zap,
  Printer,
} from "lucide-react";
import type { OfferRecord, OfferStatus } from "./types/offer";
import { OFFER_STATUSES, OFFER_STATUS_STYLES } from "./types/offer";
import { offersRepository } from "./services/offersRepository";
import { offersSyncService } from "./services/offersSyncService";
import { OfferEditModal } from "./components/OfferEditModal";
import { OffersTrashModal } from "./components/OffersTrashModal";
import { sortOffers } from "./utils/offerSorting";
import { matchesFragmentSearch } from "@/shared/hooks/useFragmentSearch";
import { useUserStore } from "@/shared/stores/useUserStore";
import { registerDirtyCheck, registerWindowCloseGuard, useWindowStore } from "@/shared/stores/useWindowStore";
import { UnsavedChangesModal } from "@/shared/components/ui/UnsavedChangesModal";
import { cn } from "@/shared/utils/cn";
import { useEasterEggStore } from "@/shared/easter-eggs/useEasterEggStore";
import { MgsAlertOverlay } from "@/shared/easter-eggs/MgsAlertOverlay";

export const OffersPage: React.FC<{ windowId?: string }> = ({ windowId }) => {
  const { currentUser } = useUserStore();
  const currentUserName = currentUser?.name || "Operatore";
  const activeWindowId = useWindowStore((s) => s.activeWindowId);

  // Tab attiva: "active" | "archived"
  const [currentTab, setCurrentTab] = useState<"active" | "archived">("active");

  // Dati
  const [allOffers, setAllOffers] = useState<OfferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ activeCount: 0, archivedCount: 0, pendingSyncCount: 0 });

  // Ricerca e filtri
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("ALL");

  // Easter Egg MGS Alert
  const { isMgsAlertActive, startMgsAlert, stopMgsAlert } = useEasterEggStore();

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Scorciatoia [Ctrl + Shift + 1] o [Ctrl + Shift + !] per l'Alert
      if (e.ctrlKey && e.shiftKey && (e.key === "1" || e.key === "!")) {
        e.preventDefault();
        startMgsAlert();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [startMgsAlert]);

  // Modale Unificata (per Creazione ed Edizione)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalOffer, setModalOffer] = useState<OfferRecord | null>(null);

  // Stato sincronizzazione
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isSupabaseTableMissing, setIsSupabaseTableMissing] = useState(false);
  const [archivingSent, setArchivingSent] = useState(false);

  // Stato Cestino Offerte (max 10 elementi)
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [trashCount, setTrashCount] = useState(0);

  // Monitoraggio modifiche non salvate per chiusura finestra / tab
  const isOfferModalDirtyRef = useRef(false);
  const saveCurrentOfferModalRef = useRef<(() => Promise<boolean>) | null>(null);
  const [showTabCloseUnsavedModal, setShowTabCloseUnsavedModal] = useState(false);
  const tabCloseResolveRef = useRef<((choice: "save" | "discard" | "cancel") => void) | null>(null);

  useEffect(() => {
    if (!windowId) return;
    return registerDirtyCheck(windowId, () => isOfferModalDirtyRef.current);
  }, [windowId]);

  useEffect(() => {
    if (!windowId) return;
    return registerWindowCloseGuard(windowId, async () => {
      if (!isOfferModalDirtyRef.current) return true;
      const choice = await new Promise<"save" | "discard" | "cancel">((resolve) => {
        tabCloseResolveRef.current = resolve;
        setShowTabCloseUnsavedModal(true);
      });
      setShowTabCloseUnsavedModal(false);
      tabCloseResolveRef.current = null;

      if (choice === "cancel") return false;
      if (choice === "discard") {
        isOfferModalDirtyRef.current = false;
        setIsModalOpen(false);
        return true;
      }
      if (choice === "save") {
        if (saveCurrentOfferModalRef.current) {
          const ok = await saveCurrentOfferModalRef.current();
          if (ok) {
            isOfferModalDirtyRef.current = false;
            setIsModalOpen(false);
            return true;
          }
          return false;
        }
        return true;
      }
      return false;
    });
  }, [windowId]);

  const loadTrashCount = useCallback(async () => {
    try {
      const count = await offersRepository.getTrashCount();
      setTrashCount(count);
    } catch (err) {
      console.warn("[OffersPage] Errore conteggio cestino:", err);
    }
  }, []);

  // Espansione testo articoli per le singole schede (gestita per override manuale)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  // Feedback copia testo
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Offerta attualmente pronta per stampa A4
  const [printingOffer, setPrintingOffer] = useState<OfferRecord | null>(null);

  // Menu rapido cambio stato card
  const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [list, c] = await Promise.all([
        offersRepository.getAllOffers(),
        offersRepository.getCounts(),
      ]);
      setAllOffers(list);
      setCounts(c);
    } catch (err) {
      console.error("[OffersPage] Errore caricamento offerte:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
    void loadTrashCount();
  }, [loadData, loadTrashCount]);

  // Ascolta aggiornamenti locali, remoti o sync in background
  useEffect(() => {
    const handleUpdate = () => {
      void loadData(true);
    };
    window.addEventListener("offers-data-updated", handleUpdate);
    return () => window.removeEventListener("offers-data-updated", handleUpdate);
  }, [loadData]);

  const handleSync = useCallback(async (silent = false) => {
    if (!silent) {
      setSyncing(true);
      setSyncMessage(null);
    }
    try {
      const res = await offersSyncService.sync();
      if (res.success) {
        setIsSupabaseTableMissing(false);
        if (!silent) {
          setSyncMessage(`Sincronizzato: +${res.pushed} inviati, +${res.pulled} scaricati`);
          setTimeout(() => setSyncMessage(null), 4000);
        }
        await loadData(true);
      } else if (res.error) {
        if (
          res.error.includes("public.offerte") ||
          res.error.includes("Could not find the table") ||
          res.error.includes("PGRST205") ||
          res.error.includes("404")
        ) {
          setIsSupabaseTableMissing(true);
          if (!silent) setSyncMessage("Tabella 'offerte' non presente su Supabase.");
        } else if (!silent) {
          setSyncMessage(`Errore sync: ${res.error}`);
          setTimeout(() => setSyncMessage(null), 6000);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("public.offerte") || msg.includes("404")) {
        setIsSupabaseTableMissing(true);
        if (!silent) setSyncMessage("Tabella 'offerte' non presente su Supabase.");
      } else if (!silent) {
        setSyncMessage("Offline / Errore connessione Supabase");
        setTimeout(() => setSyncMessage(null), 5000);
      }
    } finally {
      if (!silent) setSyncing(false);
    }
  }, [loadData]);

  // Sincronizzazione iniziale, Realtime Supabase, polling periodico (10s) e refresh su focus/online
  useEffect(() => {
    void handleSync(true);
    const unsubscribeRealtime = offersSyncService.subscribeRealtime();

    const triggerSilentSync = () => {
      if (typeof navigator === "undefined" || navigator.onLine) {
        void handleSync(true);
      }
    };

    const interval = setInterval(triggerSilentSync, 10_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        triggerSilentSync();
      }
    };

    const onSessionUpdated = () => {
      if (getSupabaseSessionEmail()) triggerSilentSync();
    };
    window.addEventListener(SUPABASE_SESSION_UPDATED, onSessionUpdated);
    window.addEventListener("focus", triggerSilentSync);
    window.addEventListener("online", triggerSilentSync);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener(SUPABASE_SESSION_UPDATED, onSessionUpdated);
      window.removeEventListener("focus", triggerSilentSync);
      window.removeEventListener("online", triggerSilentSync);
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribeRealtime();
    };
  }, [handleSync]);

  // Quando si ritorna sulla scheda Offerte (senza chiudere/riaprire il tab), aggiorna subito
  useEffect(() => {
    if (windowId && activeWindowId === windowId) {
      void handleSync(true);
    }
  }, [windowId, activeWindowId, handleSync]);

  const handleOpenCreate = () => {
    setModalOffer(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: OfferRecord) => {
    setModalOffer(item);
    setIsModalOpen(true);
  };

  const handleSaveModal = async (
    id: string | null,
    data: {
      offer_date: string;
      requester: string;
      contact: string | null;
      items_text: string;
      status: OfferStatus;
      is_urgent: number;
    }
  ) => {
    try {
      if (id) {
        await offersRepository.updateOffer(id, {
          ...data,
          updated_by: currentUserName,
        });
      } else {
        await offersRepository.createOffer({
          ...data,
          contact: data.contact || undefined,
          is_urgent: Boolean(data.is_urgent),
          created_by: currentUserName,
        });
        setCurrentTab("active");
        if (selectedStatusFilter !== "ALL" && selectedStatusFilter !== data.status) {
          setSelectedStatusFilter("ALL");
        }
      }
      await loadData(true);
    } catch (err) {
      console.error("[OffersPage] Errore salvataggio offerta:", err);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: OfferStatus) => {
    setOpenStatusMenuId(null);
    try {
      await offersRepository.updateStatus(id, newStatus, currentUserName);
      await loadData(true);
    } catch (err) {
      console.error("[OffersPage] Errore aggiornamento stato:", err);
    }
  };

  const handleToggleUrgent = async (id: string, currentUrgent: boolean) => {
    try {
      await offersRepository.toggleUrgent(id, !currentUrgent, currentUserName);
      await loadData(true);
    } catch (err) {
      console.error("[OffersPage] Errore cambio urgenza:", err);
    }
  };

  const handleToggleArchive = async (id: string, isArchived: boolean) => {
    try {
      await offersRepository.toggleArchive(id, isArchived, currentUserName);
      await loadData(true);
    } catch (err) {
      console.error("[OffersPage] Errore archiviazione offerta:", err);
    }
  };

  const sentActiveCount = useMemo(
    () => allOffers.filter((o) => !o.is_archived && o.status === "Inviata").length,
    [allOffers]
  );

  const handleArchiveSentOffers = async () => {
    if (sentActiveCount === 0 || archivingSent) return;
    setArchivingSent(true);
    try {
      const archivedCount = await offersRepository.archiveSentOffers(currentUserName);
      await loadData(true);
      if (archivedCount > 0) {
        setSyncMessage(
          `${archivedCount} ${archivedCount === 1 ? "offerta inviata archiviata" : "offerte inviate archiviate"}`
        );
        setTimeout(() => setSyncMessage(null), 4000);
      }
    } catch (err) {
      console.error("[OffersPage] Errore archiviazione offerte inviate:", err);
    } finally {
      setArchivingSent(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await offersRepository.moveToTrash(id, currentUserName);
      await loadData(true);
      void loadTrashCount();
    } catch (err) {
      console.error("[OffersPage] Errore spostamento offerta nel cestino:", err);
    }
  };

  const handleCopyItems = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePrintOffer = (offer: OfferRecord) => {
    setPrintingOffer(offer);
  };

  useEffect(() => {
    if (!printingOffer) return;
    let cancelled = false;
    const handleAfterPrint = () => {
      if (!cancelled) setPrintingOffer(null);
    };
    window.addEventListener("afterprint", handleAfterPrint);
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          window.print();
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [printingOffer]);

  const toggleRowExpansion = (id: string) => {
    setExpandedRows((prev) => {
      const current =
        prev[id] !== undefined
          ? prev[id]
          : allOffers.find((o) => o.id === id)?.status === "Da preparare";
      return { ...prev, [id]: !current };
    });
  };

  // Filtro offerte con ricerca multi-parola operante anche sulle archiviate
  const filteredOffers = useMemo(() => {
    const isSearching = Boolean(searchQuery.trim());
    let result = allOffers;

    // Se NON c'è ricerca, filtra in base alla tab selezionata (Attive o Archiviate)
    if (!isSearching) {
      result = result.filter((o) =>
        currentTab === "archived" ? Boolean(o.is_archived) : !o.is_archived
      );
    } else {
      // Con ricerca attiva:
      // Se si è esplicitamente sulla tab Archiviate, cerca tra le sole archiviate.
      // Se si è sulla tab Attive, cerca su TUTTE le offerte (sia attive che archiviate),
      // contrassegnando visivamente quelle archiviate con il badge arancione!
      if (currentTab === "archived") {
        result = result.filter((o) => Boolean(o.is_archived));
      }
    }

    // Filtro per stato se selezionato
    if (selectedStatusFilter !== "ALL") {
      result = result.filter((o) => o.status === selectedStatusFilter);
    }

    // Ricerca multi-termine su richiedente, articoli, contatto, stato, data, creatore e urgente
    if (isSearching) {
      result = result.filter((item) =>
        matchesFragmentSearch(
          [
            item.requester,
            item.items_text,
            item.contact || "",
            item.status,
            item.offer_date,
            item.created_by || "",
            item.updated_by || "",
            item.is_urgent ? "urgente" : "",
            item.is_archived ? "archiviata archivio" : "",
          ],
          searchQuery
        )
      );
    }

    return sortOffers(result);
  }, [allOffers, currentTab, selectedStatusFilter, searchQuery]);

  const formatDateTimeDisplay = (isoStr: string) => {
    if (!isoStr) return "-";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--background)] text-[var(--foreground)] overflow-hidden select-none">
      {/* 1. Header Toolbar Principale */}
      <div className="border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5 flex items-center justify-between shrink-0 gap-3">
        {/* Titolo e Icona */}
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-xs">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black text-white tracking-wide uppercase">
                Offerte & Richieste Clienti
              </h1>
              {counts.pendingSyncCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-400 border border-amber-500/30">
                  <AlertCircle className="w-3 h-3" />
                  {counts.pendingSyncCount} in coda locale
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  Sincronizzato
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Appunti, quotazioni e richieste materiali con salvataggio offline e cloud Supabase
            </p>
          </div>
        </div>

        {/* Tab Attive / Archiviate, Tasto Nuova Offerta e Tasto Sincronizzazione */}
        <div className="flex items-center gap-2.5">
          {/* Tab Switcher */}
          <div className="flex items-center p-0.5 rounded-lg border border-[var(--border)] bg-[var(--background)]">
            <button
              type="button"
              onClick={() => setCurrentTab("active")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer",
                currentTab === "active"
                  ? "bg-[var(--card)] text-white shadow-xs"
                  : "text-[var(--muted-foreground)] hover:text-white"
              )}
            >
              <span>Attive</span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                  currentTab === "active"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-[var(--card)] text-[var(--muted-foreground)]"
                )}
              >
                {counts.activeCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentTab("archived")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer",
                currentTab === "archived"
                  ? "bg-[var(--card)] text-white shadow-xs"
                  : "text-[var(--muted-foreground)] hover:text-white"
              )}
            >
              <Archive className="w-3 h-3" />
              <span>Archiviate</span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                  currentTab === "archived"
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-[var(--card)] text-[var(--muted-foreground)]"
                )}
              >
                {counts.archivedCount}
              </span>
            </button>
          </div>

          {/* Pulsante Principale: + Nuova Offerta */}
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer active:scale-95"
            title="Crea una nuova offerta (apre finestra a schermo intero)"
          >
            <Plus className="w-4 h-4" />
            <span>Nuova Offerta</span>
          </button>

          {/* Bottone Cestino Offerte (max 10 elementi) */}
          <button
            type="button"
            onClick={() => setShowTrashModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-xs text-[var(--muted-foreground)] hover:text-white transition-colors cursor-pointer relative"
            title="Cestino Offerte (ultime 10 eliminate)"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Cestino</span>
            {trashCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-bold">
                {trashCount}
              </span>
            )}
          </button>

          {/* Bottone Sincronizza */}
          <button
            type="button"
            onClick={() => void handleSync(false)}
            disabled={syncing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-xs text-[var(--muted-foreground)] hover:text-white transition-colors cursor-pointer"
            title="Sincronizza ora con Supabase"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin text-blue-400")} />
            <span className="hidden sm:inline">{syncing ? "Sincronizzo..." : "Sincronizza"}</span>
          </button>
        </div>
      </div>

      {/* Banner di avviso se la tabella non è stata creata su Supabase */}
      {isSupabaseTableMissing && (
        <div className="bg-amber-950/70 border-b border-amber-500/40 px-4 py-2 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Attenzione:</strong> La tabella{" "}
              <code className="bg-black/40 px-1 py-0.5 rounded font-mono text-amber-300">offerte</code>{" "}
              non è ancora presente nel tuo database Supabase. Le offerte vengono salvate in locale.
            </span>
          </div>
          <span>Verifica lo schema in Impostazioni → Cloud &amp; Database.</span>
        </div>
      )}

      {/* Notifica Rapida Sync */}
      {syncMessage && (
        <div className="bg-blue-950/40 border-b border-blue-500/30 px-4 py-1 text-[11px] text-blue-300 flex items-center justify-between animate-in fade-in duration-150">
          <span>{syncMessage}</span>
          <button type="button" onClick={() => setSyncMessage(null)} className="text-blue-400 hover:text-white cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 2. Barra Filtri e Ricerca Globale Multi-Parola (senza placeholder) */}
      <div className="border-b border-[var(--border)] bg-[var(--card)]/40 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim().toLowerCase() === "stop" && isMgsAlertActive) {
                  e.preventDefault();
                  setSearchQuery("");
                  stopMgsAlert();
                }
              }}
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)] text-white focus:outline-hidden focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-white p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtro per Stato */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Stato:</span>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="py-1 px-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)] text-white focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">Tutti gli stati</option>
              {OFFER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {currentTab === "active" && (
            <button
              type="button"
              onClick={handleArchiveSentOffers}
              disabled={sentActiveCount === 0 || archivingSent}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all",
                sentActiveCount > 0 && !archivingSent
                  ? "border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/50 text-amber-300 hover:text-amber-200 cursor-pointer active:scale-95"
                  : "border-[var(--border)]/60 bg-[var(--background)]/40 text-[var(--muted-foreground)]/50 cursor-not-allowed"
              )}
              title={
                sentActiveCount > 0
                  ? `Archivia tutte le ${sentActiveCount} offerte con stato "Inviata"`
                  : 'Nessuna offerta attiva con stato "Inviata" da archiviare'
              }
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{archivingSent ? "Archiviazione..." : "Archivia inviate"}</span>
              {sentActiveCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                  {sentActiveCount}
                </span>
              )}
            </button>
          )}

          <div className="text-xs text-[var(--muted-foreground)] font-mono">
            {filteredOffers.length} {filteredOffers.length === 1 ? "offerta" : "offerte"}
            {searchQuery && ` (filtrate su ${allOffers.length})`}
          </div>
        </div>
      </div>

      {/* 3. Area Contenuto: Elenco Verticale Compatto (Una Sotto l'Altra) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-xs text-[var(--muted-foreground)]">
            <RefreshCw className="w-4 h-4 animate-spin mr-2 text-blue-400" />
            Caricamento offerte...
          </div>
        ) : filteredOffers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-6 space-y-3">
            <ClipboardList className="w-10 h-10 text-[var(--muted-foreground)]/40" />
            <h3 className="text-sm font-bold text-white">Nessuna offerta trovata</h3>
            <p className="text-xs text-[var(--muted-foreground)] max-w-sm">
              {searchQuery
                ? "Nessuna offerta corrisponde ai termini di ricerca inseriti."
                : currentTab === "active"
                ? "Non ci sono offerte attive. Clicca su '+ Nuova Offerta' in alto per crearne una subito."
                : "L'archivio delle offerte è vuoto."}
            </p>
            {!searchQuery && currentTab === "active" && (
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nuova Offerta</span>
              </button>
            )}
          </div>
        ) : (
          filteredOffers.map((item) => {
            const statusStyle =
              OFFER_STATUS_STYLES[item.status] || OFFER_STATUS_STYLES["Da preparare"];
            const isExpanded =
              expandedRows[item.id] !== undefined
                ? expandedRows[item.id]
                : item.status === "Da preparare";

            const lines = item.items_text ? item.items_text.split("\n").filter(Boolean) : [];
            const hasMultipleLines = lines.length > 2;

            return (
              <div
                key={item.id}
                onDoubleClick={(e) => {
                  const target = e.target as HTMLElement | null;
                  if (target?.closest("button, input, select, textarea, a")) {
                    return;
                  }
                  handleOpenEdit(item);
                }}
                className={cn(
                  "rounded-lg border border-[var(--border)]/60 bg-[var(--card)]/40 hover:bg-[var(--card)]/80 transition-all px-3 py-2 text-xs shadow-2xs select-none cursor-pointer",
                  item.is_urgent && "border-l-4 border-l-fuchsia-500 bg-purple-950/15 ring-1 ring-fuchsia-500/30"
                )}
                title="Doppio click per aprire e modificare l'offerta"
              >
                {/* Riga Unica di Intestazione: Data, Autore, Richiedente, Contatto, Stato, Urgente, Modifica, e Azioni */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-[var(--border)]/40">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Data Creazione e Autore */}
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-white bg-[var(--background)] px-2 py-0.5 rounded border border-[var(--border)]">
                      <Calendar className="w-3 h-3 text-blue-400" />
                      <span>{formatDateTimeDisplay(item.created_at || item.offer_date)}</span>
                      <span className="text-blue-300 font-sans font-semibold ml-0.5">
                        ({item.created_by || "Operatore"})
                      </span>
                    </span>

                    {/* Nome Richiedente */}
                    <strong className="text-sm font-black text-white tracking-wide">
                      {item.requester}
                    </strong>

                    {/* Recapito Contatto */}
                    {item.contact && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                        <Phone className="w-2.5 h-2.5" />
                        {item.contact}
                      </span>
                    )}

                    {/* Dropdown Rapido Stato Offerta */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenStatusMenuId(openStatusMenuId === item.id ? null : item.id)
                        }
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-bold transition-all hover:scale-105 cursor-pointer shadow-2xs",
                          statusStyle.badgeClass
                        )}
                        title="Clicca per cambiare stato rapidamente"
                      >
                        <span className={cn("w-2 h-2 rounded-full", statusStyle.dot)} />
                        <span>{item.status}</span>
                        <ChevronDown className="w-2.5 h-2.5 opacity-70" />
                      </button>

                      {openStatusMenuId === item.id && (
                        <div className="absolute top-full left-0 mt-1 z-30 w-40 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-2xl animate-in fade-in zoom-in-95 duration-100 backdrop-blur-md">
                          {OFFER_STATUSES.map((st) => {
                            const s = OFFER_STATUS_STYLES[st];
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleUpdateStatus(item.id, st)}
                                className={cn(
                                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                                  item.status === st
                                    ? "bg-[var(--background)] text-white"
                                    : "text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--background)]/60"
                                )}
                              >
                                <span className={cn("w-2 h-2 rounded-full", s.dot)} />
                                <span>{st}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Pulsante Urgente */}
                    {item.is_urgent ? (
                      <button
                        type="button"
                        onClick={() => handleToggleUrgent(item.id, true)}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-black bg-fuchsia-600 hover:bg-fuchsia-500 text-white border-fuchsia-300 shadow-[0_0_14px_rgba(217,70,239,0.75)] animate-pulse cursor-pointer select-none transition-all"
                        title="Offerta URGENTE (clicca per rimuovere)"
                      >
                        <Zap className="w-3 h-3" />
                        <span>URGENTE</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleUrgent(item.id, false)}
                        className="p-1 rounded-full border border-zinc-700/50 bg-zinc-800/30 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 cursor-pointer select-none transition-colors"
                        title="Contrassegna come Urgente"
                      >
                        <Zap className="w-3 h-3" />
                      </button>
                    )}

                    {/* Data Ultima Modifica (solo se diversa dalla creazione) */}
                    {item.updated_at && item.updated_at !== item.created_at && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] font-mono">
                        <Clock className="w-2.5 h-2.5 text-amber-400" />
                        <span>Mod: {formatDateTimeDisplay(item.updated_at)}</span>
                        <span className="text-amber-300 font-sans">({item.updated_by || "Operatore"})</span>
                      </span>
                    )}

                    {/* Badge Archiviata quando visualizzata tra i risultati di ricerca */}
                    {Boolean(item.is_archived) && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-400 border border-amber-500/30">
                        <Archive className="w-2.5 h-2.5" />
                        Archiviata
                      </span>
                    )}

                    {/* Badge In Attesa di Sync */}
                    {item.sync_status === "pending" && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950/40 text-amber-400 border border-amber-500/30">
                        In attesa sync
                      </span>
                    )}
                  </div>

                  {/* Azioni Rapide a Destra */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handlePrintOffer(item)}
                      className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border)]/70 bg-[var(--background)] hover:bg-[var(--card)] text-[11px] text-[var(--muted-foreground)] hover:text-white transition-colors cursor-pointer"
                      title="Stampa offerta (o salva in PDF)"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Stampa</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyItems(item.id, item.items_text)}
                      className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border)]/70 bg-[var(--background)] hover:bg-[var(--card)] text-[11px] text-[var(--muted-foreground)] hover:text-white transition-colors cursor-pointer"
                      title="Copia articoli negli appunti"
                    >
                      {copiedId === item.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">Copiato!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copia</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(item)}
                      className="p-1.5 rounded border border-[var(--border)]/70 bg-[var(--background)] hover:bg-[var(--card)] text-[var(--muted-foreground)] hover:text-white transition-colors cursor-pointer"
                      title="Modifica offerta"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleArchive(item.id, !item.is_archived)}
                      className="p-1.5 rounded border border-[var(--border)]/70 bg-[var(--background)] hover:bg-[var(--card)] text-[var(--muted-foreground)] hover:text-white transition-colors cursor-pointer"
                      title={item.is_archived ? "Ripristina tra le offerte attive" : "Archivia offerta"}
                    >
                      {item.is_archived ? (
                        <ArchiveRestore className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Archive className="w-3.5 h-3.5 text-amber-400" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 rounded border border-red-500/20 bg-red-950/20 hover:bg-red-900/40 text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                      title="Elimina definitivamente"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Testo Articoli / Richiesta: fluido, senza riquadri pesanti nidificati */}
                {item.items_text && (
                  <div className="pt-2">
                    <div
                      className={cn(
                        "font-mono text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap select-text pl-1",
                        !isExpanded && hasMultipleLines && "max-h-24 overflow-hidden"
                      )}
                    >
                      {item.items_text}
                    </div>

                    {hasMultipleLines && (
                      <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] mt-1.5 pt-1 border-t border-[var(--border)]/30">
                        <span>
                          {lines.length} {lines.length === 1 ? "voce" : "voci"}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleRowExpansion(item.id)}
                          className="flex items-center gap-0.5 text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
                        >
                          {isExpanded ? (
                            <>
                              <span>Mostra meno</span>
                              <ChevronUp className="w-3 h-3" />
                            </>
                          ) : (
                            <>
                              <span>Espandi tutto</span>
                              <ChevronDown className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 4. Modale Unificata Nuova Offerta / Modifica Offerta */}
      <OfferEditModal
        offer={modalOffer}
        isOpen={isModalOpen}
        onClose={() => {
          isOfferModalDirtyRef.current = false;
          setIsModalOpen(false);
        }}
        currentUserName={currentUserName}
        onSave={handleSaveModal}
        onToggleArchive={handleToggleArchive}
        onDelete={handleDelete}
        onDirtyChange={(dirty) => {
          isOfferModalDirtyRef.current = dirty;
        }}
        onRequestSave={(trigger) => {
          saveCurrentOfferModalRef.current = trigger;
        }}
      />

      {/* Modale Conferma Chiusura Scheda Tab */}
      <UnsavedChangesModal
        isOpen={showTabCloseUnsavedModal}
        title="Modifiche all'offerta"
        message="Vuoi mantenere le modifiche apportate all'offerta prima di chiudere la scheda?"
        saveLabel="Mantieni"
        discardLabel="Non mantenere"
        cancelLabel="Annulla"
        onSave={() => tabCloseResolveRef.current?.("save")}
        onDiscard={() => tabCloseResolveRef.current?.("discard")}
        onCancel={() => tabCloseResolveRef.current?.("cancel")}
      />

      {/* 5. Modale Cestino Offerte (max 10 elementi) */}
      <OffersTrashModal
        isOpen={showTrashModal}
        onClose={() => setShowTrashModal(false)}
        onOfferRestored={() => {
          void loadData();
          void loadTrashCount();
        }}
      />

      {/* Easter Egg MGS Alert Overlay */}
      <MgsAlertOverlay isActive={isMgsAlertActive} onStop={stopMgsAlert} />

      {/* Portale dedicato alla Stampa A4 della singola offerta */}
      {typeof document !== "undefined" &&
        printingOffer &&
        createPortal(
          <div
            id="offer-print-portal"
            style={{
              position: "fixed",
              left: "-99999px",
              top: 0,
              width: "210mm",
              opacity: 1,
              pointerEvents: "none",
              zIndex: -99999,
            }}
          >
            <div style={{ borderBottom: "2px solid #0f172a", paddingBottom: "10px", marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px" }}>
                <span style={{ fontSize: "9.5pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569" }}>
                  Offerta / Richiesta Cliente
                </span>
                <span style={{ fontSize: "9.5pt", fontWeight: 700, color: "#0f172a" }}>
                  Stato: {printingOffer.status}
                  {printingOffer.is_urgent ? " • URGENTE" : ""}
                </span>
              </div>
              <h1 style={{ fontSize: "19pt", fontWeight: 800, margin: "6px 0 4px 0", color: "#0f172a" }}>
                {printingOffer.requester}
              </h1>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "10pt", color: "#334155" }}>
                <span>
                  <strong>Data:</strong> {formatDateTimeDisplay(printingOffer.created_at || printingOffer.offer_date)}
                </span>
                {printingOffer.contact && (
                  <span>
                    <strong>Contatto:</strong> {printingOffer.contact}
                  </span>
                )}
                <span>
                  <strong>Operatore:</strong> {printingOffer.created_by || "Operatore"}
                </span>
                {printingOffer.updated_at && printingOffer.updated_at !== printingOffer.created_at && (
                  <span>
                    <strong>Ultima modifica:</strong> {formatDateTimeDisplay(printingOffer.updated_at)} ({printingOffer.updated_by || "Operatore"})
                  </span>
                )}
              </div>
            </div>

            <div
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                fontSize: "10.5pt",
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
                color: "#0f172a",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "12px 14px",
                backgroundColor: "#ffffff",
              }}
            >
              {printingOffer.items_text || "(Nessun articolo specificato)"}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

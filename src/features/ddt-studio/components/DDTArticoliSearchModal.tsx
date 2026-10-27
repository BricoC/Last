import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from "react";
import { Search, X, Check, ShoppingCart, ArrowDownUp, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { ListinoGeneraleRow, ListinoClienteRow } from "@/features/price-lists/models/priceList";
import { priceListRepository } from "@/features/price-lists/services/priceListRepository";
import { getClientArticleHistory, ClientArticleHistoryRow } from "../services/ddtReadModelsRepository";
import { formatDdtViewDate } from "../services/ddtViewFormatting";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { AppPreferencesService } from "@/shared/services/appPreferencesService";
import { AppUserService } from "@/shared/services/appUserService";

export interface DDTArticoliSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientName?: string;
  onSelectArticle: (article: {
    code?: string;
    description: string;
    unit?: string;
    quantity: string;
    unit_price: number;
    purchase_price?: number;
    vat_rate?: number;
  }) => void;
}

interface PendingArticleInsert {
  code?: string;
  description: string;
  unit?: string;
  unit_price: number;
  purchase_price?: number;
  vat_rate?: number;
}

export const DDTArticoliSearchModal: React.FC<DDTArticoliSearchModalProps> = ({
  isOpen,
  onClose,
  clientName,
  onSelectArticle,
}) => {
  const [sourceTab, setSourceTab] = useState<"generale" | "cliente">("generale");
  const [prezziIvaEnabled, setPrezziIvaEnabled] = useState(true);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  // Dissolvenza: quando si clicca fuori dal popup, entra in dissolvenza (trasparente ~20%)
  // senza chiudersi (si chiude solo con X o Esc). Cliccando sul popup la dissolvenza va via.
  const [isFaded, setIsFaded] = useState(false);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Dimensioni personalizzabili memorizzate stabilmente per utente/postazione
  const [modalWidth, setModalWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const activeId = AppUserService.getActiveUserId();
      const cached =
        localStorage.getItem(`user_${activeId}_ddt_search_modal_width`) ||
        localStorage.getItem("ddt_search_modal_width");
      if (cached) {
        const val = parseInt(cached, 10);
        if (!isNaN(val) && val >= 380 && val <= 900) return val;
      }
    }
    return 540;
  });

  const [modalHeight, setModalHeight] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const activeId = AppUserService.getActiveUserId();
      const cached =
        localStorage.getItem(`user_${activeId}_ddt_search_modal_height`) ||
        localStorage.getItem("ddt_search_modal_height");
      if (cached) {
        const val = parseInt(cached, 10);
        if (!isNaN(val) && val >= 300 && val <= 900) return val;
      }
    }
    return 580;
  });

  const [isResizing, setIsResizing] = useState(false);

  // Caricamento stabile da SQLite all'avvio con isolamento per utente/postazione
  useEffect(() => {
    void AppPreferencesService.getUserPreference("ddt_search_modal_width", "540").then((saved) => {
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 380 && parsed <= 900) {
          setModalWidth(parsed);
          const activeId = AppUserService.getActiveUserId();
          localStorage.setItem(`user_${activeId}_ddt_search_modal_width`, String(parsed));
        }
      }
    });

    void AppPreferencesService.getUserPreference("ddt_search_modal_height", "580").then((saved) => {
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 300 && parsed <= 900) {
          setModalHeight(parsed);
          const activeId = AppUserService.getActiveUserId();
          localStorage.setItem(`user_${activeId}_ddt_search_modal_height`, String(parsed));
        }
      }
    });
  }, []);

  // 1. Ridimensionamento laterale (bordo sinistro)
  const handleMouseDownResizeWidth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startW = modalWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const newW = Math.max(380, Math.min(900, startW + deltaX));
      setModalWidth(newW);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      const deltaX = startX - upEvent.clientX;
      const finalW = Math.max(380, Math.min(900, startW + deltaX));
      setModalWidth(finalW);
      const activeId = AppUserService.getActiveUserId();
      localStorage.setItem(`user_${activeId}_ddt_search_modal_width`, String(finalW));
      void AppPreferencesService.setUserPreference("ddt_search_modal_width", String(finalW));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // 2. Ridimensionamento verticale (bordo inferiore)
  const handleMouseDownResizeHeight = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startY = e.clientY;
    const startH = modalHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newH = Math.max(300, Math.min(900, startH + deltaY));
      setModalHeight(newH);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      const deltaY = upEvent.clientY - startY;
      const finalH = Math.max(300, Math.min(900, startH + deltaY));
      setModalHeight(finalH);
      const activeId = AppUserService.getActiveUserId();
      localStorage.setItem(`user_${activeId}_ddt_search_modal_height`, String(finalH));
      void AppPreferencesService.setUserPreference("ddt_search_modal_height", String(finalH));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // 3. Ridimensionamento obliquo / diagonale (angolo in basso a sinistra)
  const handleMouseDownResizeOblique = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = modalWidth;
    const startH = modalHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const deltaY = moveEvent.clientY - startY;
      const newW = Math.max(380, Math.min(900, startW + deltaX));
      const newH = Math.max(300, Math.min(900, startH + deltaY));
      setModalWidth(newW);
      setModalHeight(newH);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      const deltaX = startX - upEvent.clientX;
      const deltaY = upEvent.clientY - startY;
      const finalW = Math.max(380, Math.min(900, startW + deltaX));
      const finalH = Math.max(300, Math.min(900, startH + deltaY));
      setModalWidth(finalW);
      setModalHeight(finalH);
      const activeId = AppUserService.getActiveUserId();
      localStorage.setItem(`user_${activeId}_ddt_search_modal_width`, String(finalW));
      localStorage.setItem(`user_${activeId}_ddt_search_modal_height`, String(finalH));
      void AppPreferencesService.setUserPreference("ddt_search_modal_width", String(finalW));
      void AppPreferencesService.setUserPreference("ddt_search_modal_height", String(finalH));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Dati Listino Generale & Cliente
  const [generalItems, setGeneralItems] = useState<ListinoGeneraleRow[]>([]);
  const [clientItems, setClientItems] = useState<ListinoClienteRow[]>([]);
  const [historyItems, setHistoryItems] = useState<ClientArticleHistoryRow[]>([]);

  // Navigazione tastiera & focus ('list' in alto, 'history' in basso)
  const [activePane, setActivePane] = useState<"list" | "history">("list");
  const [selectedListIdx, setSelectedListIdx] = useState(0);
  const [selectedHistIdx, setSelectedHistIdx] = useState(0);

  // Popup "INSERIMENTO ARTICOLO" con specifica quantità
  const [pendingInsert, setPendingInsert] = useState<PendingArticleInsert | null>(null);
  const [insertQuantity, setInsertQuantity] = useState("1");
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listener globale ESC: chiude il popup solo se non si sta modificando testo in una cella del DDT
  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      // Verifichiamo se l'utente sta modificando del testo all'interno di una cella del DDT
      const activeEl = (e.target as HTMLElement | null) || (document.activeElement as HTMLElement | null);
      const isEditingCellText = Boolean(
        activeEl &&
        (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) &&
        Boolean(activeEl.closest(".ag-cell-inline-editing, .ag-cell-editing, .ag-popup-editor, .ag-cell")) &&
        !modalContainerRef.current?.contains(activeEl)
      );

      // Se si sta modificando del testo nella cella, l'Esc chiude la cella e lascia il popup aperto
      if (isEditingCellText) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (pendingInsert) {
        setPendingInsert(null);
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown, true);
  }, [isOpen, pendingInsert, onClose]);

  // Gestione dissolvenza: se l'utente clicca fuori dal popup, questo entra in dissolvenza
  // (trasparente ~20%) senza chiudersi (si chiude solo con X o Esc).
  // Cliccando sopra il popup, la dissolvenza scompare e torna solido al 100%.
  useEffect(() => {
    if (!isOpen) {
      setIsFaded(false);
      return;
    }

    const handleDocumentMouseDown = (e: MouseEvent) => {
      if (pendingInsert) return;

      if (modalContainerRef.current && !modalContainerRef.current.contains(e.target as Node)) {
        setIsFaded(true);
      }
    };

    window.addEventListener("mousedown", handleDocumentMouseDown, true);
    return () => window.removeEventListener("mousedown", handleDocumentMouseDown, true);
  }, [isOpen, pendingInsert]);

  // Focus automatico sul popup quantità
  useEffect(() => {
    if (pendingInsert) {
      setTimeout(() => {
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
      }, 50);
    }
  }, [pendingInsert]);

  // Inizializzazione all'apertura
  useEffect(() => {
    if (isOpen) {
      setPendingInsert(null);
      setInsertQuantity("1");
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      void loadInitialData();
    }
  }, [isOpen, clientName]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const genRows = await priceListRepository.searchGeneral("", 10000);
      setGeneralItems(genRows);

      if (clientName && clientName.trim()) {
        const cleanName = clientName.trim().replace(/^LIST_/, "");
        const cliRows = await priceListRepository.searchClientPrices("", cleanName, 10000);
        setClientItems(cliRows);
        if (cliRows.length > 0) {
          setSourceTab("cliente");
        } else {
          setSourceTab("generale");
        }
      } else {
        setClientItems([]);
        setSourceTab("generale");
      }
    } catch (e) {
      console.error("Errore caricamento dati modale F3:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Caricamento storico vendite per il cliente corrente
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    const timer = setTimeout(async () => {
      if (!clientName || !clientName.trim()) {
        if (isMounted) setHistoryItems([]);
        return;
      }

      try {
        const cleanClient = clientName.trim().replace(/^LIST_/, "");
        const hist = await getClientArticleHistory({
          clientName: cleanClient,
          description: deferredSearch,
          onlyThisClient: true,
          limit: 100,
        });
        if (isMounted) {
          setHistoryItems(hist);
          setSelectedHistIdx(0);
        }
      } catch (err) {
        console.error("Errore caricamento storico prezzi praticati cliente:", err);
      }
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [deferredSearch, clientName, isOpen]);

  // Filtraggio tokenizzato lista superiore
  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  const filteredClientItems = useMemo(() => {
    if (searchTokens.length === 0) return clientItems;
    return clientItems.filter((item) => {
      const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.cliente}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }, [clientItems, searchTokens]);

  const filteredGeneralItems = useMemo(() => {
    if (searchTokens.length === 0) return generalItems;
    return generalItems.filter((item) => {
      const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }, [generalItems, searchTokens]);

  const filteredListItems = sourceTab === "generale" ? filteredGeneralItems : filteredClientItems;

  // Gestione tastiera fluida tra tabella sopra e tabella sotto
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (pendingInsert) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (activePane === "list") {
        if (selectedListIdx >= filteredListItems.length - 1 && historyItems.length > 0) {
          // Passa alla tabella storico sottostante
          setActivePane("history");
          setSelectedHistIdx(0);
        } else {
          setSelectedListIdx((prev) => Math.min(prev + 1, Math.max(0, filteredListItems.length - 1)));
        }
      } else {
        setSelectedHistIdx((prev) => Math.min(prev + 1, Math.max(0, historyItems.length - 1)));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (activePane === "history") {
        if (selectedHistIdx <= 0 && filteredListItems.length > 0) {
          // Torna alla tabella listino soprastante
          setActivePane("list");
          setSelectedListIdx(filteredListItems.length - 1);
        } else {
          setSelectedHistIdx((prev) => Math.max(prev - 1, 0));
        }
      } else {
        setSelectedListIdx((prev) => Math.max(prev - 1, 0));
      }
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      // Toggle rapido tra pannello sopra e pannello sotto
      if (activePane === "list" && historyItems.length > 0) {
        setActivePane("history");
      } else {
        setActivePane("list");
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleOpenQuantityModal();
    }
  };

  // Apertura popup quantità articolo
  const handleOpenQuantityModal = () => {
    if (activePane === "list") {
      const selected = filteredListItems[selectedListIdx];
      if (!selected) return;

      if (sourceTab === "generale") {
        const item = selected as ListinoGeneraleRow;
        setPendingInsert({
          code: item.codice_articolo || undefined,
          description: item.descrizione,
          unit: item.um || "NR.",
          unit_price: prezziIvaEnabled ? (item.prezzo_fattura || item.prezzo_pubblico || 0) : 0,
          purchase_price: item.prezzo_acquisto || 0,
          vat_rate: prezziIvaEnabled ? Math.round((item.perc_iva || 0.22) * 100) : 22,
        });
      } else {
        const item = selected as ListinoClienteRow;
        setPendingInsert({
          code: item.codice_articolo || undefined,
          description: item.descrizione,
          unit: "NR.",
          unit_price: prezziIvaEnabled ? (item.prezzo_fattura || 0) : 0,
          purchase_price: item.prezzo_acquisto || 0,
          vat_rate: 22,
        });
      }
      setInsertQuantity("1");
    } else {
      const hist = historyItems[selectedHistIdx];
      if (!hist) return;
      setPendingInsert({
        code: hist.code || undefined,
        description: hist.description,
        unit: hist.unit || "NR.",
        unit_price: prezziIvaEnabled ? hist.unitPriceSubunits / 100000 : 0,
        purchase_price: hist.purchasePriceSubunits ? hist.purchasePriceSubunits / 100000 : 0,
        vat_rate: hist.vatRate || 22,
      });
      setInsertQuantity(hist.quantity || "1");
    }
  };

  // Conferma inserimento nel DDT
  const handleConfirmInsert = () => {
    if (!pendingInsert) return;
    onSelectArticle({
      ...pendingInsert,
      quantity: insertQuantity.trim() || "1",
    });
    setPendingInsert(null);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  };

  const formatEuro = (val: number | null | undefined, digits: number = 2) => {
    if (val == null || isNaN(val)) return "0,00 €";
    return `${val.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: digits,
    })} €`;
  };

  if (!isOpen) return null;

  const displayClientName = clientName ? clientName.trim().replace(/^LIST_/, "") : "";

  return (
    <>
      {/* 
        Contenitore Modale F3 Laterale: Ancorato a destra (come Excel dell'utente),
        lasciando l'intero foglio DDT visibile e compilabile a sinistra!
        Supporta ridimensionamento a 3 vie:
        - Bordo sinistro (orizzontale)
        - Bordo inferiore (verticale)
        - Angolo in basso a sinistra (obliquo / diagonale)
      */}
      <div
        ref={modalContainerRef}
        onClick={() => {
          if (isFaded) {
            setIsFaded(false);
          }
        }}
        className={`absolute top-1 right-2 z-50 pointer-events-auto select-none animate-in fade-in duration-100 transition-opacity duration-200 ease-out ${
          isFaded ? "opacity-50 hover:opacity-85 ring-2 ring-[var(--primary)]/60 shadow-2xl" : "opacity-100"
        }`}
        onKeyDown={handleKeyDown}
        style={{ width: `${modalWidth}px` }}
      >
        <div
          style={{ height: `${modalHeight}px` }}
          className={`relative bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-[0_25px_60px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden ${
            isResizing ? "select-none pointer-events-none" : ""
          }`}
        >
          {/* 1. Header Finestra: Titolo Stile Excel Ricerca Articoli - CLIENTE */}
          <div className="px-3.5 py-2 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)] shrink-0">
            <div className="flex items-center space-x-2 min-w-0">
              <div className="p-1 rounded bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20 shrink-0">
                <Search className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-[var(--foreground)] truncate block">
                  Ricerca Articoli —{" "}
                  <span className="text-[var(--primary)] font-black">
                    {displayClientName ? displayClientName.toUpperCase() : "NESSUN CLIENTE"}
                  </span>
                </span>
              </div>
            </div>

            {/* Pillole selezione Listino & Toggle Prezzi */}
            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSourceTab("cliente");
                  setActivePane("list");
                  setSelectedListIdx(0);
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center space-x-1 transition-all ${
                  sourceTab === "cliente"
                    ? "bg-amber-500 text-black font-bold shadow-sm"
                    : "bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
                }`}
                title="Visualizza Listino Cliente"
              >
                <span>Cliente</span>
                <span className="px-1 py-0.1 rounded-full text-[9px] bg-black/20 font-bold">
                  {clientItems.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceTab("generale");
                  setActivePane("list");
                  setSelectedListIdx(0);
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center space-x-1 transition-all ${
                  sourceTab === "generale"
                    ? "bg-[var(--primary)] text-white font-bold shadow-sm"
                    : "bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
                }`}
                title="Visualizza Listino Generale"
              >
                <span>Generale</span>
                <span className="px-1 py-0.1 rounded-full text-[9px] bg-white/20 font-bold">
                  {generalItems.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPrezziIvaEnabled(!prezziIvaEnabled)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                  prezziIvaEnabled
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-bold"
                    : "bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)]"
                }`}
                title="Attiva o disattiva l'inserimento di Prezzo & IVA nel DDT"
              >
                €: {prezziIvaEnabled ? "ON" : "OFF"}
              </button>

              {/* Tasto rapido manuale Dissolvenza */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFaded(!isFaded);
                }}
                className={`p-1 rounded text-xs border transition-colors ${
                  isFaded
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
                title={
                  isFaded
                    ? "Dissolvenza attiva (clicca per tornare opaco)"
                    : "Attiva dissolvenza (trasparente per vedere sotto)"
                }
              >
                {isFaded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={onClose}
                className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] transition-colors ml-1"
                title="Chiudi (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2. Barra Ricerca & Contatori Filtrati Live */}
          <div className="p-2 border-b border-[var(--border)] bg-[var(--card)] flex items-center space-x-2 shrink-0">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] absolute left-2.5 top-2" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedListIdx(0);
                }}
                placeholder="CERCA ARTICOLO O STORICO..."
                className="w-full pl-8 pr-7 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-bold tracking-wide uppercase"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Badges conteggi compatti */}
            <div className="flex items-center space-x-1.5 text-[11px] font-mono shrink-0 px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded-md select-none">
              <button
                type="button"
                onClick={() => {
                  setSourceTab("cliente");
                  setActivePane("list");
                }}
                className={`flex items-center space-x-1 ${
                  sourceTab === "cliente" && activePane === "list" ? "text-amber-400 font-bold" : "text-[var(--muted-foreground)]"
                }`}
                title="Elementi Listino Clienti"
              >
                <span>Cli:</span>
                <span className="text-amber-400 font-bold">{filteredClientItems.length}</span>
              </button>
              <span className="text-[var(--border)]">•</span>
              <button
                type="button"
                onClick={() => {
                  setSourceTab("generale");
                  setActivePane("list");
                }}
                className={`flex items-center space-x-1 ${
                  sourceTab === "generale" && activePane === "list" ? "text-blue-400 font-bold" : "text-[var(--muted-foreground)]"
                }`}
                title="Elementi Listino Generale"
              >
                <span>Gen:</span>
                <span className="text-blue-400 font-bold">{filteredGeneralItems.length}</span>
              </button>
              <span className="text-[var(--border)]">•</span>
              <button
                type="button"
                onClick={() => {
                  if (historyItems.length > 0) setActivePane("history");
                }}
                className={`flex items-center space-x-1 ${
                  activePane === "history" ? "text-emerald-400 font-bold" : "text-[var(--muted-foreground)]"
                }`}
                title="Elementi Storico"
              >
                <span>Sto:</span>
                <span className="text-emerald-400 font-bold">{historyItems.length}</span>
              </button>
            </div>
          </div>

          {/* 3. Sezione a 2 Tabelle Sovrapposte Verticalmente (Top = Listino, Bottom = Storico) */}
          <div className="flex-1 flex flex-col overflow-hidden divide-y-2 divide-[var(--border)]">
            {/* TABELLA SUPERIORE: Listino Cliente / Generale */}
            <div
              className={`flex-1 flex flex-col overflow-hidden min-h-[140px] ${
                activePane === "list" ? "ring-1 ring-inset ring-[var(--primary)]/50" : ""
              }`}
              onClick={() => setActivePane("list")}
            >
              <div className="px-3 py-1 bg-[var(--background)] border-b border-[var(--border)] flex items-center justify-between text-[10.5px] font-bold text-[var(--muted-foreground)] uppercase shrink-0">
                <span className="truncate">
                  DESCRIZIONE ({sourceTab === "generale" ? "LISTINO GENERALE" : `LISTINO CLIENTE`})
                </span>
                <span className="w-24 text-right shrink-0">PREZZO (€)</span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/30">
                {isLoading ? (
                  <div className="p-6 text-center text-xs text-[var(--muted-foreground)]">
                    Caricamento listino in corso...
                  </div>
                ) : filteredListItems.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--muted-foreground)]">
                    Nessun articolo trovato per "{search}".
                  </div>
                ) : (
                  <table className="w-full border-collapse text-xs">
                    <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11px]">
                      {filteredListItems.slice(0, 300).map((row, idx) => {
                        const isSelected = activePane === "list" && selectedListIdx === idx;
                        const priceVal =
                          sourceTab === "generale"
                            ? (row as ListinoGeneraleRow).prezzo_fattura
                            : (row as ListinoClienteRow).prezzo_fattura;

                        return (
                          <tr
                            key={row.id}
                            onClick={() => {
                              setActivePane("list");
                              setSelectedListIdx(idx);
                            }}
                            onDoubleClick={handleOpenQuantityModal}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-[var(--primary)] text-white font-bold"
                                : "hover:bg-[var(--background)] text-[var(--foreground)]"
                            }`}
                          >
                            <td className="px-3 py-1 font-sans truncate" title={row.descrizione}>
                              {row.descrizione}
                            </td>
                            <td
                              className={`px-3 py-1 text-right w-24 whitespace-nowrap font-bold ${
                                isSelected ? "text-white" : "text-amber-400"
                              }`}
                            >
                              {formatEuro(priceVal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* TABELLA INFERIORE: Storico Vendite (Data, Descrizione, Prezzo) Esattamente come Screenshot */}
            <div
              className={`flex-1 flex flex-col overflow-hidden min-h-[140px] bg-[var(--background)]/15 ${
                activePane === "history" ? "ring-1 ring-inset ring-emerald-500/50" : ""
              }`}
              onClick={() => setActivePane("history")}
            >
              <div className="px-3 py-1 bg-[var(--background)] border-b border-[var(--border)] flex items-center justify-between text-[10.5px] font-bold text-emerald-400 uppercase shrink-0">
                <div className="flex items-center space-x-1.5 truncate">
                  <ArrowDownUp className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="truncate">
                    STORICO PREZZI PRATICATI: {displayClientName || "—"}
                  </span>
                </div>
                <span className="text-[var(--muted-foreground)] font-mono text-[10px] shrink-0 ml-2">
                  {historyItems.length} voci
                </span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/30">
                {!clientName || !clientName.trim() ? (
                  <div className="p-6 text-center text-xs text-[var(--muted-foreground)]">
                    Seleziona un cliente nel DDT per visualizzare lo storico prezzi.
                  </div>
                ) : historyItems.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--muted-foreground)]">
                    Nessuna vendita precedente registrata per "{search || displayClientName}".
                  </div>
                ) : (
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-[var(--background)] sticky top-0 text-[10px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)]">
                      <tr>
                        <th className="px-2 py-1 text-left w-20">Data</th>
                        <th className="px-2 py-1 text-left">Descrizione</th>
                        <th className="px-2.5 py-1 text-right w-24">Prezzo (€)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11px]">
                      {historyItems.map((h, idx) => {
                        const isSelected = activePane === "history" && selectedHistIdx === idx;
                        const priceVal = h.unitPriceSubunits / 100000;

                        return (
                          <tr
                            key={`${h.ddtId}_${idx}`}
                            onClick={() => {
                              setActivePane("history");
                              setSelectedHistIdx(idx);
                            }}
                            onDoubleClick={handleOpenQuantityModal}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-emerald-600 text-white font-bold"
                                : "hover:bg-[var(--card)] text-[var(--foreground)]"
                            }`}
                          >
                            <td className="px-2 py-1 text-[var(--muted-foreground)] whitespace-nowrap text-[10.5px]">
                              {formatDdtViewDate(h.date)}
                            </td>
                            <td className="px-2 py-1 font-sans truncate" title={h.description}>
                              <span className="text-[var(--foreground)]">{h.description}</span>
                            </td>
                            <td
                              className={`px-2.5 py-1 text-right font-bold whitespace-nowrap ${
                                isSelected ? "text-white" : "text-emerald-400"
                              }`}
                            >
                              {formatEuro(priceVal, 2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* 4. Footer Modale con Azioni Rapide */}
          <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-xs shrink-0">
            <div className="text-[10px] text-[var(--muted-foreground)] font-medium">
              <span>Invio / DblClick inserisce • Frecce ↑↓ scorrono</span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                tabIndex={-1}
                onClick={onClose}
                className="px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--background)] text-[var(--foreground)] font-medium text-xs transition-colors"
              >
                Chiudi (Esc)
              </button>

              <button
                type="button"
                onClick={handleOpenQuantityModal}
                className="flex items-center space-x-1.5 px-3 py-1 rounded-md bg-[var(--primary)] text-white hover:opacity-95 font-bold text-xs shadow-md transition-all"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Inserisci</span>
              </button>
            </div>
          </div>

          {/* 5. GESTIONE RIDIMENSIONAMENTO A 3 VIE */}
          {/* Maniglia Bordo Sinistro (Orizzontale) */}
          <div
            onMouseDown={handleMouseDownResizeWidth}
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-[var(--primary)]/30 transition-colors z-20"
            title="Trascina verso sinistra/destra per regolare la larghezza"
          />

          {/* Maniglia Bordo Inferiore (Verticale) */}
          <div
            onMouseDown={handleMouseDownResizeHeight}
            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-[var(--primary)]/30 transition-colors z-20"
            title="Trascina verso l'alto/basso per regolare l'altezza"
          />

          {/* Maniglia Angolo in Basso a Sinistra (Obliquo / Diagonale) */}
          <div
            onMouseDown={handleMouseDownResizeOblique}
            className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize hover:bg-[var(--primary)]/50 rounded-bl-xl transition-colors z-30 flex items-end justify-start p-0.5 group"
            title="Trascina in diagonale per ridimensionare larghezza e altezza contemporaneamente"
          >
            <div className="w-2 h-2 border-l-2 border-b-2 border-[var(--primary)] group-hover:border-white transition-colors" />
          </div>
        </div>
      </div>

      {/* POPUP "INSERIMENTO ARTICOLO" CON QUANTITA' */}
      {pendingInsert && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-100">
          <div className="w-full max-w-lg bg-[#0f172a] border border-blue-500/40 rounded-xl shadow-2xl p-5 flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-blue-500/30 pb-2.5">
              <div className="flex items-center space-x-2 text-blue-400">
                <CheckCircle2 className="w-5 h-5 text-blue-400" />
                <span className="font-black text-sm tracking-wide text-white uppercase">
                  INSERIMENTO ARTICOLO
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPendingInsert(null)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">Articolo Selezionato:</label>
              <div className="mt-1 p-3 rounded-lg bg-[#1e293b] border border-blue-500/30">
                <p className="font-bold text-sm text-amber-300 leading-snug">
                  {pendingInsert.description}
                </p>
                {pendingInsert.code && (
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    Codice: {pendingInsert.code}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <label className="text-sm font-bold text-white">Specifica Quantità:</label>
              <input
                ref={qtyInputRef}
                type="number"
                min="0.001"
                step="any"
                value={insertQuantity}
                onChange={(e) => setInsertQuantity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleConfirmInsert();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setPendingInsert(null);
                  }
                }}
                className="w-28 px-3 py-1.5 text-center text-sm font-black bg-[#1e293b] border border-blue-500 rounded-lg text-white outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-slate-700/50">
              <button
                type="button"
                onClick={() => setPendingInsert(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmInsert}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-lg shadow-blue-500/20 transition-all flex items-center space-x-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Conferma e Inserisci (Invio)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

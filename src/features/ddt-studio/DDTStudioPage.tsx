import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { DdtArchiveEntry, DdtDocument, DdtItem } from "./models/ddt";
import { ddtRepository } from "./services/ddtRepository";
import { subscribeToOpenDdt } from "./services/ddtNavigation";
import { clientRepository } from "@/features/clients/services/clientRepository";
import { money, isPositivePrice } from "@/shared/domain/monetaryValue";
import { registerWindowCloseGuard } from "@/shared/stores/useWindowStore";
import { calculateRowAmounts, calculateDdtTotals } from "./utils/ddtCalculations";

import { DDTStudioHeader } from "./components/DDTStudioHeader";
import { DDTStudioSidebar } from "./components/DDTStudioSidebar";
import { DDTClienteCard } from "./components/DDTClienteCard";
import { DDTArticoliTable, DDTArticoliTableHandle } from "./components/DDTArticoliTable";
import { DDTFinancialBar } from "./components/DDTFinancialBar";
import { DDTLogisticaCard } from "./components/DDTLogisticaCard";
import { DDTA4Document } from "./document/DDTA4Document";
import { DDTArticoliSearchModal } from "./components/DDTArticoliSearchModal";
import { DDTMultiListinoModal } from "./components/DDTMultiListinoModal";
import { DDTPrintCopiesModal } from "./components/DDTPrintCopiesModal";
import {
  exportDdtPdfToDesktop,
  executeDdtPrint,
} from "./utils/ddtExportManager";

export const TOTAL_PRESET_ROWS = 500;

export function makeEmptyDdt(): Partial<DdtDocument> {
  const now = new Date();
  const year = now.getFullYear();
  const todayIso = now.toISOString().split("T")[0];

  return {
    id: crypto.randomUUID(),
    doc_number: null,
    series: "",
    year,
    doc_date: todayIso,
    status: "bozza",
    client_name: "",
    client_address: "",
    client_city: "",
    client_vat: "",
    client_fiscal_code: "",
    client_sdi: "",
    destination_name: "",
    destination_address: "",
    destination_city: "",
    transport_reason: "Vendita",
    payment_method: "RIMESSA DIRETTA",
    order_reference: "",
    account_or_balance: "",
    operator: "",
    goods_appearance: "",
    carriage_terms: "Franco stabilimento",
    packages_count: "",
    weight_kg: "",
    carrier: "",
    pickup_date_time: "",
    internal_notes: "",
    total_taxable: money(0),
    total_vat: money(0),
    total_document: money(0),
  };
}

export function makeEmptyItems(): DdtItem[] {
  const now = new Date().toISOString();
  return Array.from({ length: TOTAL_PRESET_ROWS }, (_, i) => ({
    id: `empty-row-${i + 1}`,
    created_at: now,
    updated_at: now,
    updated_by: "system",
    deleted_at: null,
    sync_status: "pending",
    ddt_id: "",
    row_index: i + 1,
    code: "",
    description: "",
    unit: "",
    quantity: "",
    unit_price: money(0),
    discount_pct: "",
    net_amount: money(0),
    vat_rate: "",
    vat_amount: money(0),
    purchase_price: money(0),
  }));
}

export function makeTest48Items(): DdtItem[] {
  const sampleDescriptions = [
    { code: "VTE430", desc: "VITE TSP BRONZATA 4X30 (100 PZ)", um: "CF", q: "5", p: "3.50000", v: "22" },
    { code: "TSX6", desc: "TASSELLO NYLON SX 6 CON VITE (100 PZ)", um: "CF", q: "2", p: "8.20000", v: "22" },
    { code: "SILTR", desc: "SILICONE TRASPARENTE ACETICO 280 ML", um: "PZ", q: "12", p: "4.10000", v: "22" },
    { code: "SCHPOL", desc: "SCHIUMA POLIURETANICA MANUALE 750 ML", um: "PZ", q: "6", p: "6.90000", v: "22" },
    { code: "DISC115", desc: "DISCO DA TAGLIO FERRO 115X1.0 MM", um: "PZ", q: "25", p: "1.20000", v: "22" },
    { code: "NASTIS", desc: "NASTRO ISOLANTE NERO 25M X 19MM", um: "RT", q: "10", p: "1.50000", v: "22" },
    { code: "PENN40", desc: "PENNELLO PIATTO TRIPLE SETOLA 40 MM", um: "PZ", q: "4", p: "2.80000", v: "22" },
    { code: "CARTA80", desc: "CARTA VETRATA ABRASIVA GRANA 80 (50M)", um: "RT", q: "1", p: "24.50000", v: "22" },
    { code: "MANRST", desc: "MANIGLIA ALLUMINIO BRONZATO ROSETTA", um: "CP", q: "8", p: "14.00000", v: "22" },
    { code: "LUCCH50", desc: "LUCCHETTO OTTONE ARCO LUNGO 50 MM", um: "PZ", q: "3", p: "11.50000", v: "22" },
    { code: "METRO5", desc: "FLESSOMETRO PROFESSIONALE 5 METRI", um: "PZ", q: "2", p: "7.90000", v: "22" },
    { code: "CUTTER18", desc: "CUTTER PROFESSIONALE LAMA 18 MM", um: "PZ", q: "5", p: "3.20000", v: "22" },
  ];

  const fullList = makeEmptyItems();
  for (let i = 0; i < 48; i++) {
    const s = sampleDescriptions[i % sampleDescriptions.length];
    const qty = String(parseInt(s.q, 10) + (i % 3));
    const pr = money(s.p);
    const disc = i % 4 === 0 ? "10" : "";
    const { netAmount, vatAmount } = calculateRowAmounts(qty, pr, disc, s.v);
    fullList[i] = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: "system",
      deleted_at: null,
      sync_status: "pending",
      ddt_id: "",
      row_index: i + 1,
      code: `${s.code}-${String(i + 1).padStart(2, "0")}`,
      description: `${s.desc} - Serie ${i + 1}`,
      unit: s.um,
      quantity: qty,
      unit_price: pr,
      base_price: pr,
      discount_pct: disc,
      base_discount_pct: disc,
      net_amount: netAmount,
      vat_rate: s.v,
      vat_amount: vatAmount,
      purchase_price: pr.times(0.6),
    };
  }
  return fullList;
}

export function makeTestDdt(): Partial<DdtDocument> {
  const base = makeEmptyDdt();
  return {
    ...base,
    doc_number: 2729,
    doc_date: "2026-10-22",
    status: "confermato",
    client_name: "FERRAMENTA E COLORI ROSSI S.R.L.",
    client_address: "VIA DELLE INDUSTRIE 45",
    client_city: "55049 VIAREGGIO LU",
    client_vat: "01847290461",
    client_fiscal_code: "01847290461",
    destination_name: "CANTIERE NAVALE BARSANTI",
    destination_address: "VIA COPPINO 12",
    destination_city: "55049 VIAREGGIO LU",
    transport_reason: "Vendita",
    payment_method: "RIMESSA DIRETTA 30 GG",
    operator: "Samu",
    goods_appearance: "A vista",
    carriage_terms: "Porto franco",
    packages_count: "5",
    weight_kg: "48.50",
    carrier: "CORRIERE ESPRESSO BARTOLINI",
    pickup_date_time: "22/10/2026 14:30",
    internal_notes: "CONSEGNA ENTRO LE ORE 12:00 - CONTROLLARE INTEGRITA COLLI",
  };
}

type DdtCloseChoice = "emit" | "draft" | "discard" | "cancel";

export const DDTStudioPage: React.FC<{ windowId: string }> = ({ windowId }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<"editor" | "a4">("editor");
  const [showMargini, setShowMargini] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchSidebar, setSearchSidebar] = useState("");
  const [recentDdts, setRecentDdts] = useState<DdtArchiveEntry[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [loadingDdtId, setLoadingDdtId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrintCopiesModalOpen, setIsPrintCopiesModalOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [closePrompt, setClosePrompt] = useState<((choice: DdtCloseChoice) => void) | null>(null);
  const savedSignature = React.useRef<string | null>(null);
  const ddtLoadRequest = React.useRef(0);

  // Stato DDT Corrente
  const [ddt, setDdt] = useState<Partial<DdtDocument>>(makeEmptyDdt());
  const [items, setItems] = useState<DdtItem[]>(makeEmptyItems());

  // Input Finanziari Immediati (Sconto Righe e Maggiorazione %)
  const [globalDiscount, setGlobalDiscount] = useState("");
  const [globalMarkup, setGlobalMarkup] = useState("");

  const currentDdtIdRef = React.useRef<string | undefined>(ddt.id);
  useEffect(() => {
    currentDdtIdRef.current = ddt.id;
  }, [ddt.id]);

  const signature = useCallback(
    (doc: Partial<DdtDocument>, rows: DdtItem[], discount: string, markup: string) => {
      const activeRows = rows
        .filter((r) => r.description?.trim() || isPositivePrice(r.unit_price) || (r.code && r.code.trim()) || r.quantity?.trim())
        .map((r) => [
          r.row_index,
          r.code || "",
          r.description || "",
          r.unit || "",
          r.quantity || "",
          r.unit_price?.toSubunits?.() ?? 0,
          r.discount_pct || "",
          r.vat_rate ?? "",
          r.purchase_price?.toSubunits?.() ?? 0,
        ]);
      return JSON.stringify({
        id: doc.id,
        doc_number: doc.doc_number,
        series: doc.series,
        year: doc.year,
        doc_date: doc.doc_date,
        status: doc.status,
        client_name: doc.client_name,
        client_address: doc.client_address,
        client_city: doc.client_city,
        client_vat: doc.client_vat,
        client_fiscal_code: doc.client_fiscal_code,
        client_sdi: doc.client_sdi,
        destination_name: doc.destination_name,
        destination_address: doc.destination_address,
        destination_city: doc.destination_city,
        transport_reason: doc.transport_reason,
        payment_method: doc.payment_method,
        order_reference: doc.order_reference,
        account_or_balance: doc.account_or_balance,
        operator: doc.operator,
        goods_appearance: doc.goods_appearance,
        carriage_terms: doc.carriage_terms,
        packages_count: doc.packages_count,
        weight_kg: doc.weight_kg,
        carrier: doc.carrier,
        pickup_date_time: doc.pickup_date_time,
        internal_notes: doc.internal_notes,
        discount,
        markup,
        activeRows,
      });
    },
    []
  );
  const currentSignature = useMemo(
    () => signature(ddt, items, globalDiscount, globalMarkup),
    [ddt, items, globalDiscount, globalMarkup, signature]
  );
  const isDirty = savedSignature.current !== null && currentSignature !== savedSignature.current;

  useEffect(() => {
    savedSignature.current = signature(ddt, items, globalDiscount, globalMarkup);
  }, []);

  // Riferimento per controllo imperativo tabella (es. pulizia focus cella)
  const tableRef = React.useRef<DDTArticoliTableHandle>(null);

  const handleClearTableFocus = useCallback(() => {
    tableRef.current?.clearFocusedCell();
  }, []);

  // Pannello ricerca articoli F3 (docked a lato della tabella, attivo di default)
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(true);

  // Sincronizzazione testo digitato nella cella Descrizione con il box di ricerca articoli
  const [searchQuery, setSearchQuery] = useState("");
  const [f3FocusTrigger, setF3FocusTrigger] = useState(0);
  const activeRowIndexRef = React.useRef<number | null>(null);
  const lastActiveCellRef = React.useRef<{ rowIndex: number; colId: string }>({ rowIndex: 0, colId: "description" });
  const isF3NavigatingRef = React.useRef(false);

  const handleActiveRowChange = useCallback((idx: number | null) => {
    activeRowIndexRef.current = idx;
  }, []);

  const handleActiveCellChange = useCallback((rowIndex: number, colId: string) => {
    lastActiveCellRef.current = { rowIndex, colId };
  }, []);

  const handleReturnToTable = useCallback(() => {
    const { rowIndex, colId } = lastActiveCellRef.current;
    tableRef.current?.focusCell(rowIndex, colId, true);
  }, []);

  const handleDescriptionEditingStopped = useCallback(() => {
    // Se la cella descrizione si chiude normalmente (Enter, Tab, click fuori), resetta il testo di ricerca
    if (!isF3NavigatingRef.current) {
      setSearchQuery("");
    }
  }, []);

  const [searchPanelWidth, setSearchPanelWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ddt_search_panel_width");
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 320 && val <= 850) return val;
      }
    }
    return 480;
  });

  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = searchPanelWidth;
    let rafId: number | null = null;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.max(320, Math.min(850, startWidth + delta));
        setSearchPanelWidth(newWidth);
      });
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      const delta = startX - upEvent.clientX;
      const finalWidth = Math.max(320, Math.min(850, startWidth + delta));
      setSearchPanelWidth(finalWidth);
      localStorage.setItem("ddt_search_panel_width", String(finalWidth));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [searchPanelWidth]);

  // Modale Alex (Ricerca Multi-Listino 4 finestre)
  const [isAlexModalOpen, setIsAlexModalOpen] = useState(false);
  const isQuantityModalOpenRef = useRef(false);

  // Scorciatoie tastiera: F4 apre/chiude il pannello, F3 apre e sposta il focus direttamente sulla prima voce del listino
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      // Se è aperto il popup quantità "INSERIMENTO ARTICOLO", disabilita completamente F3 e F4 per evitare chiusure/conflitti
      if (isQuantityModalOpenRef.current && (e.key === "F3" || e.key === "F4")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (e.key === "F4") {
        e.preventDefault();
        e.stopPropagation();
        setIsSearchModalOpen((prev) => !prev);
      } else if (e.key === "F3") {
        e.preventDefault();
        e.stopPropagation();

        // Se il focus è già nel pannello ricerca articoli, F3 torna alla posizione precedente nella tabella DDT!
        const searchEl = document.getElementById("ddt-search-modal-container");
        const isInsideSearch = searchEl && (searchEl === document.activeElement || searchEl.contains(document.activeElement));
        if (isInsideSearch) {
          handleReturnToTable();
          return;
        }

        isF3NavigatingRef.current = true;
        if (tableRef.current?.clearFocusedCell) {
          tableRef.current.clearFocusedCell();
        }
        setIsSearchModalOpen(true);
        setF3FocusTrigger((prev) => prev + 1);
        setTimeout(() => {
          isF3NavigatingRef.current = false;
        }, 400);
      }
    };
    window.addEventListener("keydown", handleGlobalShortcuts, true);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts, true);
  }, []);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Caricamento lista DDT recenti da SQLite
  const loadRecentDdts = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const list = await ddtRepository.getRecentDdts(selectedYear, searchSidebar);
      setRecentDdts(list);
    } catch (e) {
      console.error("Errore caricamento lista DDT:", e);
    } finally {
      setIsLoadingList(false);
    }
  }, [selectedYear, searchSidebar]);

  useEffect(() => {
    loadRecentDdts();
  }, [loadRecentDdts]);

  // Aggiornamento reattivo quando la sincronizzazione in background scarica nuovi DDT
  useEffect(() => {
    const handleSyncUpdate = () => {
      void loadRecentDdts();
    };
    window.addEventListener("ddt-data-updated", handleSyncUpdate);
    return () => window.removeEventListener("ddt-data-updated", handleSyncUpdate);
  }, [loadRecentDdts]);

  useEffect(() => {
    const handleQuoteConversion = (event: Event) => {
      const detail = (event as CustomEvent<{ ddt: Partial<DdtDocument>; items: DdtItem[] }>).detail;
      if (!detail?.ddt?.id) return;
      const blanks = makeEmptyItems();
      const padded = [...detail.items, ...blanks.slice(detail.items.length)].map((item) => ({
        ...item, ddt_id: detail.ddt.id!,
      }));
      setDdt(detail.ddt);
      setItems(padded);
      setGlobalDiscount("");
      setGlobalMarkup("");
      setShowMargini(false);
      setActiveView("editor");
      showToast("Preventivo convertito in bozza DDT");
    };
    window.addEventListener("quote-converted-to-ddt", handleQuoteConversion);
    return () => window.removeEventListener("quote-converted-to-ddt", handleQuoteConversion);
  }, []);

  // Carica un DDT esistente selezionato dalla sidebar
  const handleSelectDdt = useCallback(async (id: string) => {
    if (currentDdtIdRef.current === id) return;
    const requestId = ++ddtLoadRequest.current;
    setLoadingDdtId(id);
    try {
      const fullDoc = await ddtRepository.getDdtById(id);
      if (requestId !== ddtLoadRequest.current) return;
      if (!fullDoc) return;

      currentDdtIdRef.current = fullDoc.id;
      setDdt(fullDoc);
      // Keep the archive sidebar on the same year as a DDT opened from List or Articles.
      setSelectedYear((prev) => (prev === fullDoc.year ? prev : fullDoc.year));

      // Inizializza esattamente 500 righe per la griglia
      const docId = fullDoc.id;
      const blankRowTimestamp = new Date().toISOString();
      const padded: DdtItem[] = Array.from({ length: TOTAL_PRESET_ROWS }, (_, i) => ({
        id: `${docId}-blank-${i + 1}`,
        created_at: blankRowTimestamp,
        updated_at: blankRowTimestamp,
        updated_by: "system",
        deleted_at: null,
        sync_status: "pending",
        ddt_id: docId,
        row_index: i + 1,
        code: "",
        description: "",
        unit: "",
        quantity: "",
        unit_price: money(0),
        base_price: money(0),
        discount_pct: "",
        net_amount: money(0),
        vat_rate: "",
        vat_amount: money(0),
        purchase_price: money(0),
      }));

      // Inserisci ogni riga memorizzata esattamente al suo row_index originale (1-indexed)
      // preservando fedelmente le righe vuote e la posizione voluta dall'utente (es. PAGATO alla riga 5)
      for (const it of fullDoc.items || []) {
        const itemWithDefaults: DdtItem = {
          ...it,
          base_price: it.base_price && isPositivePrice(it.base_price) ? it.base_price : it.unit_price,
          base_discount_pct: it.base_discount_pct !== undefined ? it.base_discount_pct : it.discount_pct,
        };
        const targetIdx = it.row_index && it.row_index >= 1 && it.row_index <= TOTAL_PRESET_ROWS
          ? it.row_index - 1
          : -1;

        if (targetIdx >= 0 && (!padded[targetIdx].description?.trim() && !isPositivePrice(padded[targetIdx].unit_price))) {
          padded[targetIdx] = { ...itemWithDefaults, row_index: targetIdx + 1 };
        } else {
          // Se la riga indicata è occupata o non valida, trova il primo slot libero a partire da targetIdx
          const startSearch = targetIdx >= 0 ? targetIdx : 0;
          let freeIdx = -1;
          for (let i = startSearch; i < TOTAL_PRESET_ROWS; i++) {
            if (!padded[i].description?.trim() && !isPositivePrice(padded[i].unit_price)) {
              freeIdx = i;
              break;
            }
          }
          if (freeIdx === -1) {
            freeIdx = padded.findIndex((slot) => !slot.description?.trim() && !isPositivePrice(slot.unit_price));
          }
          if (freeIdx >= 0) {
            padded[freeIdx] = { ...itemWithDefaults, row_index: freeIdx + 1 };
          }
        }
      }
      setGlobalDiscount("");
      setGlobalMarkup("");
      setItems(padded);
      savedSignature.current = signature(fullDoc, padded, "", "");
      const identifier = fullDoc.doc_number === null
        ? "Bozza"
        : `${fullDoc.series ? `${fullDoc.series}/` : ""}${fullDoc.doc_number}`;
      showToast(`DDT #${identifier} caricato`);
    } catch (e) {
      if (requestId !== ddtLoadRequest.current) return;
      console.error("Errore apertura DDT:", e);
      showToast("Non è stato possibile caricare il DDT selezionato");
    } finally {
      if (requestId === ddtLoadRequest.current) setLoadingDdtId(null);
    }
  }, [signature]);

  useEffect(() => subscribeToOpenDdt((id) => { void handleSelectDdt(id); }), []);

  // Calcola e assegna il prossimo numero DDT disponibile se documento vuoto
  useEffect(() => {
    let active = true;
    if (ddt.doc_number === null) {
      ddtRepository.getNextDocNumber(ddt.year || new Date().getFullYear(), ddt.series || "").then((num) => {
        if (active && num) {
          setDdt((prev) => (prev.doc_number === null ? { ...prev, doc_number: num } : prev));
        }
      });
    }
    return () => { active = false; };
  }, []);

  // Nuovo DDT vuoto con numero progressivo già visibile
  const handleNewDdt = async () => {
    ddtLoadRequest.current += 1;
    setLoadingDdtId(null);
    const nextDdt = makeEmptyDdt();
    const nextItems = makeEmptyItems();
    try {
      const nextNum = await ddtRepository.getNextDocNumber(nextDdt.year || new Date().getFullYear(), nextDdt.series || "");
      nextDdt.doc_number = nextNum;
    } catch (e) {
      console.warn("Impossibile calcolare prossimo numero DDT:", e);
    }
    setDdt(nextDdt);
    setItems(nextItems);
    setGlobalDiscount("");
    setGlobalMarkup("");
    savedSignature.current = signature(nextDdt, nextItems, "", "");
    showToast(`Nuova Bozza DDT creata (N° ${nextDdt.doc_number || "Provvisorio"})`);
  };

  // Salva Bozza
  const handleSaveDraft = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const saved = await ddtRepository.saveDraft(ddt, items);
      setDdt(saved);
      savedSignature.current = signature(saved, items, globalDiscount, globalMarkup);
      await loadRecentDdts();

      // Salvataggio automatico silenzioso del cliente in anagrafica
      if (ddt.client_name?.trim()) {
        void clientRepository.createOrUpdateClient({
          business_name: ddt.client_name.trim(),
          address: ddt.client_address || undefined,
          city: ddt.client_city || undefined,
          vat_number: ddt.client_vat || undefined,
          fiscal_code: ddt.client_fiscal_code || undefined,
          sdi_code: ddt.client_sdi || undefined,
          payment_method: ddt.payment_method || undefined,
          destination_name: ddt.destination_name || undefined,
          destination_address: ddt.destination_address || undefined,
          destination_city: ddt.destination_city || undefined,
          phones: ddt.client_phones || [],
        }).catch((e) => console.warn("Auto-salvataggio cliente bozza:", e));
      }

      showToast("Bozza salvata con successo");
      return true;
    } catch (e) {
      console.error("Errore salvataggio bozza:", e);
      showToast(`Errore salvataggio bozza: ${getErrorMessage(e)}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Salva e Conferma DDT (Emissione con numero progressivo)
  const handleEmitDdt = async (): Promise<boolean> => {
    if (!ddt.client_name?.trim()) {
      showToast("Attenzione: Inserisci il nome del cliente prima di salvare il DDT!");
      return false;
    }

    setIsSaving(true);
    try {
      const saved = await ddtRepository.emitDdt(ddt, items);
      setDdt(saved);
      savedSignature.current = signature(saved, items, globalDiscount, globalMarkup);
      await loadRecentDdts();

      // Salvataggio automatico del cliente in anagrafica
      if (saved.client_name?.trim()) {
        void clientRepository.createOrUpdateClient({
          business_name: saved.client_name.trim(),
          address: saved.client_address || undefined,
          city: saved.client_city || undefined,
          vat_number: saved.client_vat || undefined,
          fiscal_code: saved.client_fiscal_code || undefined,
          sdi_code: saved.client_sdi || undefined,
          payment_method: saved.payment_method || undefined,
          destination_name: saved.destination_name || undefined,
          destination_address: saved.destination_address || undefined,
          destination_city: saved.destination_city || undefined,
          phones: saved.client_phones || [],
        }).catch((e) => console.warn("Auto-salvataggio cliente emissione:", e));
      }

      const identifier = `${saved.series ? `${saved.series}/` : ""}${saved.doc_number}`;
      showToast(`DDT emesso con successo! Numero assegnato: #${identifier}`);
      return true;
    } catch (e) {
      console.error("Errore emissione DDT:", e);
      showToast(`Errore emissione DDT: ${getErrorMessage(e)}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => registerWindowCloseGuard(windowId, async () => {
    if (!isDirty) return true;
    const choice = await new Promise<DdtCloseChoice>((resolve) => setClosePrompt(() => resolve));
    setClosePrompt(null);
    if (choice === "discard") return true;
    if (choice === "draft") return handleSaveDraft();
    if (choice === "emit") return handleEmitDdt();
    return false;
  }), [windowId, isDirty, handleSaveDraft, handleEmitDdt]);

  // Duplica DDT
  const handleDuplicateDdt = async () => {
    if (!ddt.id) return;
    setIsSaving(true);
    try {
      const dup = await ddtRepository.duplicateDdt(ddt.id);
      setDdt(dup);
      await handleSelectDdt(dup.id);
      await loadRecentDdts();
      showToast("DDT duplicato come nuova bozza non numerata");
    } catch (e) {
      console.error("Errore duplicazione:", e);
      showToast("Errore durante la duplicazione del DDT");
    } finally {
      setIsSaving(false);
    }
  };

  // Elimina DDT
  const handleDeleteDdt = async () => {
    if (!ddt.id) return;
    if (!confirm("Sei sicuro di voler eliminare questo DDT?")) return;

    try {
      await ddtRepository.deleteDdt(ddt.id);
      handleNewDdt();
      await loadRecentDdts();
      showToast("DDT eliminato");
    } catch (e) {
      console.error("Errore eliminazione:", e);
    }
  };

  const handleDeleteArchivedDdt = async (id: string): Promise<boolean> => {
    try {
      await ddtRepository.deleteDdt(id);
      if (ddt.id === id) handleNewDdt();
      await loadRecentDdts();
      showToast("DDT eliminato dall’archivio");
      return true;
    } catch (e) {
      console.error("Errore eliminazione DDT dall’archivio:", e);
      showToast(`Errore eliminazione DDT: ${getErrorMessage(e)}`);
      return false;
    }
  };

  // Inserimento articolo selezionato da modale ricerca F3 o Alex
  const handleInsertArticle = (article: {
    code?: string;
    description: string;
    unit?: string;
    quantity: string;
    unit_price: number;
    purchase_price?: number;
    vat_rate?: number;
  }) => {
    setItems((prev) => {
      const copy = [...prev];
      const activeIdx = activeRowIndexRef.current;
      let targetIdx = activeIdx !== null && activeIdx >= 0 && activeIdx < copy.length ? activeIdx : -1;
      if (targetIdx === -1) {
        targetIdx = copy.findIndex(
          (it) => !it.description?.trim().length && !isPositivePrice(it.unit_price)
        );
      }
      if (targetIdx === -1) targetIdx = 0;

      const price = money(article.unit_price || 0);
      const purchasePrice = money(article.purchase_price || 0);
      const q = article.quantity || "1";

      let effectivePrice = price;
      const markupClean = globalMarkup.trim().replace("%", "").replace(",", ".");
      const markupNum = parseFloat(markupClean);
      if (!isNaN(markupNum) && markupNum !== 0) {
        effectivePrice = price.times(1 + markupNum / 100);
      }
      const disc = globalDiscount.trim();
      const vat = article.vat_rate !== undefined && article.vat_rate !== null && String(article.vat_rate).trim() !== "" ? article.vat_rate : "";
      const { netAmount, vatAmount } = calculateRowAmounts(q, effectivePrice, disc, vat);

      copy[targetIdx] = {
        ...copy[targetIdx],
        code: article.code || "",
        description: (article.description || "").toUpperCase().slice(0, 55),
        unit: article.unit || "NR",
        quantity: q,
        unit_price: effectivePrice,
        base_price: price,
        discount_pct: disc,
        base_discount_pct: "",
        net_amount: netAmount,
        vat_rate: vat,
        vat_amount: vatAmount,
        purchase_price: purchasePrice,
      };

      return copy;
    });

    setSearchQuery("");
    showToast(`Inserito: ${article.description}`);
  };

  // Stampa diretta con popup numero copie e lato singolo (Simplex)
  const handleConfirmPrint = async (copies: number) => {
    setIsPrintCopiesModalOpen(false);
    setIsPrinting(true);
    showToast(`Invio stampa di ${copies} ${copies === 1 ? "copia" : "copie"} in corso...`);
    try {
      await executeDdtPrint(copies);
      showToast(`Stampa inviata alla stampante predefinita (${copies} ${copies === 1 ? "copia" : "copie"})`);
    } catch (e: any) {
      console.error("Errore stampa:", e);
      showToast(`Errore durante la stampa: ${e?.message || e}`);
    } finally {
      setIsPrinting(false);
    }
  };

  // Salva PDF multipagina del DDT direttamente sul Desktop (ad altissima fedeltà)
  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    showToast("Generazione PDF multipagina del DDT in corso...");
    try {
      const { filename } = await exportDdtPdfToDesktop(ddt);
      showToast(`PDF salvato sul Desktop: ${filename}`);
    } catch (e: any) {
      console.error("Errore salvataggio PDF:", e);
      showToast(`Errore salvataggio PDF: ${e?.message || e}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Popola 48 righe ed esporta direttamente sul Desktop il PDF
  const handleGenerateTest48 = async () => {
    const testDoc = makeTestDdt();
    const testItems = makeTest48Items();
    setDdt(testDoc);
    setItems(testItems);
    setActiveView("a4");
    showToast("Compilate 48 righe! Esportazione PDF in corso...");

    // Breve pausa per consentire al DOM di renderizzare le 2 pagine A4
    setTimeout(async () => {
      try {
        setIsExportingPdf(true);
        const pdfRes = await exportDdtPdfToDesktop(testDoc);
        showToast(`PDF salvato su Desktop: ${pdfRes.filename}`);
      } catch (err: any) {
        console.error("Errore salvataggio test:", err);
        showToast(`Errore salvataggio test: ${err?.message || err}`);
      } finally {
        setIsExportingPdf(false);
      }
    }, 500);
  };

  // Modifica istantanea sconto globale (singolo o a cascata es. 10+3) retroattiva su tutte le righe (vecchie e nuove)
  // Preserva lo sconto base originario di ogni riga e lo ripristina quando la casella viene svuotata ("torna come prima")
  const handleChangeGlobalDiscount = (val: string) => {
    setGlobalDiscount(val);
    const cleanDisc = val.trim();

    React.startTransition(() => {
      // Se l'utente svuota o cancella il valore, ripristina lo sconto che c'era prima per ogni singola riga
      if (cleanDisc === "") {
        setItems((prev) =>
          prev.map((item) => {
            const restoredDisc =
              item.base_discount_pct !== undefined ? item.base_discount_pct : (item.discount_pct || "");
            const hasPrice = isPositivePrice(item.unit_price);
            const { netAmount, vatAmount } = calculateRowAmounts(
              item.quantity || (hasPrice ? "1" : ""),
              item.unit_price,
              restoredDisc,
              item.vat_rate
            );
            return {
              ...item,
              discount_pct: restoredDisc,
              base_discount_pct: undefined,
              net_amount: netAmount,
              vat_amount: vatAmount,
            };
          })
        );
        return;
      }

      // Applica il nuovo sconto preservando lo sconto originale prima dell'inizio della sovrascrittura
      setItems((prev) =>
        prev.map((item) => {
          const originalBase =
            item.base_discount_pct !== undefined ? item.base_discount_pct : (item.discount_pct || "");
          const hasPrice = isPositivePrice(item.unit_price);
          const { netAmount, vatAmount } = calculateRowAmounts(
            item.quantity || (hasPrice ? "1" : ""),
            item.unit_price,
            cleanDisc,
            item.vat_rate
          );
          return {
            ...item,
            base_discount_pct: originalBase,
            discount_pct: cleanDisc,
            net_amount: netAmount,
            vat_amount: vatAmount,
          };
        })
      );
    });
  };

  // Modifica istantanea maggiorazione % su tutti i prezzi della DDT (con ripristino istantaneo se cancellato)
  const handleChangeGlobalMarkup = (val: string) => {
    setGlobalMarkup(val);
    const trimmed = val.trim();

    React.startTransition(() => {
      // Se l'utente svuota o cancella l'input: ripristina all'istante i prezzi base ("torna come prima")
      if (trimmed === "") {
        setItems((prev) =>
          prev.map((item) => {
            if (item.base_price && isPositivePrice(item.base_price)) {
              const restoredPrice = item.base_price;
              const { netAmount, vatAmount } = calculateRowAmounts(
                item.quantity || "1",
                restoredPrice,
                item.discount_pct,
                item.vat_rate
              );
              return {
                ...item,
                unit_price: restoredPrice,
                net_amount: netAmount,
                vat_amount: vatAmount,
              };
            }
            return item;
          })
        );
        return;
      }

      const clean = trimmed.replace("%", "").replace(",", ".");
      const num = parseFloat(clean);
      if (isNaN(num)) {
        // Sta digitando un carattere parziale (es. "+", "-"): attendiamo senza alterare i prezzi
        return;
      }

      // Applica moltiplicatore istantaneo rispetto al prezzo base originale
      const multiplier = 1 + num / 100;
      setItems((prev) =>
        prev.map((item) => {
          const base =
            item.base_price && isPositivePrice(item.base_price)
              ? item.base_price
              : isPositivePrice(item.unit_price)
              ? item.unit_price
              : null;

          if (base) {
            const newPrice = base.times(multiplier);
            const { netAmount, vatAmount } = calculateRowAmounts(
              item.quantity || "1",
              newPrice,
              item.discount_pct,
              item.vat_rate
            );
            return {
              ...item,
              base_price: base,
              unit_price: newPrice,
              net_amount: netAmount,
              vat_amount: vatAmount,
            };
          }
          return item;
        })
      );
    });
  };

  const totals = calculateDdtTotals(items);

  return (
    <div
      className="flex flex-col h-full w-full bg-[#181a20] overflow-hidden"
      onMouseDownCapture={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (!target.closest("input, textarea, select, [contenteditable='true']")) return;
        if (target.closest(".ddt-items-grid")) return;
        tableRef.current?.clearFocusedCell();
      }}
    >
      {/* Toast Notifica */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-[var(--primary)] text-white px-4 py-2 rounded-lg shadow-2xl text-xs font-semibold z-50 flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2">
          <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {closePrompt && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="presentation">
        <section role="dialog" aria-modal="true" aria-labelledby="ddt-close-title" className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-[var(--foreground)] shadow-2xl">
          <h2 id="ddt-close-title" className="text-base font-semibold">DDT con modifiche non salvate</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Scegli come conservare il lavoro prima di chiudere.</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => closePrompt("cancel")} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">Annulla</button>
            <button type="button" onClick={() => closePrompt("discard")} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">Chiudi senza salvare</button>
            <button type="button" disabled={isSaving} onClick={() => closePrompt("draft")} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50">Salva in bozze</button>
            <button type="button" disabled={isSaving} onClick={() => closePrompt("emit")} className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-50">Emetti DDT</button>
          </div>
        </section>
      </div>}

      {/* Header Operativo DDT Studio */}
      <DDTStudioHeader
        ddt={ddt}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activeView={activeView}
        setActiveView={setActiveView}
        onNewDdt={handleNewDdt}
        onSaveDraft={handleSaveDraft}
        onEmitDdt={handleEmitDdt}
        onOpenPrintModal={() => setIsPrintCopiesModalOpen(true)}
        onExportPdf={handleExportPdf}
        onGenerateTest48={handleGenerateTest48}
        onDuplicateDdt={handleDuplicateDdt}
        onDeleteDdt={handleDeleteDdt}
        isSaving={isSaving}
        isExportingPdf={isExportingPdf}
        isPrinting={isPrinting}
      />

      {/* Corpo Principale: Sidebar Riducibile / Espandibile + Area Lavoro */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Archivio DDT (Compatta a 50px se chiusa, Completa se aperta) */}
        <DDTStudioSidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          ddtList={recentDdts}
          currentDdtId={ddt.id}
          loadingDdtId={loadingDdtId}
          onSelectDdt={handleSelectDdt}
          onNewDdt={handleNewDdt}
          onDeleteDdt={handleDeleteArchivedDdt}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          search={searchSidebar}
          setSearch={setSearchSidebar}
          isLoading={isLoadingList}
        />

        {/* Area di Lavoro */}
        <div className="relative flex-1 flex flex-col overflow-hidden bg-[#181a20]">
          {loadingDdtId && (
            <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)]/95 px-3 py-2 text-xs font-medium text-[var(--foreground)] shadow-lg" role="status" aria-live="polite">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
              Caricamento DDT...
            </div>
          )}
          {activeView === "editor" ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Card Cliente & Testata */}
              <div className="shrink-0">
                <DDTClienteCard
                  ddt={ddt}
                  setDdt={setDdt}
                />
              </div>

              {/* Area Centrale: Tabella Articoli + Splitter + Cerca Articoli Docked */}
              <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-row">
                {/* Sinistra: Tabella Articoli DDT */}
                <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
                  <DDTArticoliTable
                    ref={tableRef}
                    items={items}
                    setItems={setItems}
                    showMargini={showMargini}
                    globalDiscount={globalDiscount}
                    globalMarkup={globalMarkup}
                    onOpenSearchModal={() => setIsSearchModalOpen((p) => !p)}
                    onDescriptionTyping={setSearchQuery}
                    onDescriptionEditingStopped={handleDescriptionEditingStopped}
                    onActiveRowChange={handleActiveRowChange}
                    onActiveCellChange={handleActiveCellChange}
                  />
                </div>

                {/* Destra: Splitter e Pannello Cerca Articoli Docked */}
                {isSearchModalOpen && (
                  <>
                    <div
                      onMouseDown={handleSplitterMouseDown}
                      className="w-1.5 hover:w-2 bg-[var(--border)] hover:bg-[var(--primary)] cursor-col-resize shrink-0 transition-colors z-10 flex items-center justify-center select-none group"
                      title="Trascina per ridimensionare tabella e cerca articoli"
                    >
                      <div className="w-0.5 h-8 bg-[var(--muted-foreground)]/40 group-hover:bg-white rounded" />
                    </div>

                    <div
                      style={{ width: `${searchPanelWidth}px` }}
                      className="h-full shrink-0 flex flex-col border-l border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-lg"
                    >
                      <DDTArticoliSearchModal
                        isOpen={isSearchModalOpen}
                        onClose={() => {
                          setIsSearchModalOpen(false);
                          setSearchQuery("");
                        }}
                        clientName={ddt.client_name}
                        onSelectArticle={handleInsertArticle}
                        searchQuery={searchQuery}
                        onSearchQueryChange={setSearchQuery}
                        f3FocusTrigger={f3FocusTrigger}
                        onReturnToTable={handleReturnToTable}
                        onPendingInsertChange={(isOpen) => {
                          isQuantityModalOpenRef.current = isOpen;
                        }}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Barra Finanziaria Colorata (Tot. Acquisto, Totale Netto, Ricavo, Ricarico % + Alex + Sconto & Maggiorazione) */}
              <DDTFinancialBar
                ddt={ddt}
                setDdt={setDdt}
                totals={totals}
                showMargini={showMargini}
                setShowMargini={setShowMargini}
                onOpenSearchModal={() => setIsSearchModalOpen((p) => !p)}
                onOpenAlexModal={() => setIsAlexModalOpen(true)}
                globalDiscount={globalDiscount}
                onChangeGlobalDiscount={handleChangeGlobalDiscount}
                globalMarkup={globalMarkup}
                onChangeGlobalMarkup={handleChangeGlobalMarkup}
                onClearTableFocus={handleClearTableFocus}
              />

              {/* Card Logistica e Riepilogo Economico */}
              <div className="shrink-0">
                <DDTLogisticaCard
                  ddt={ddt}
                  setDdt={setDdt}
                  items={items}
                  onOpenSearchModal={() => setIsSearchModalOpen((p) => !p)}
                />
              </div>
            </div>
          ) : (
            /* Vista Foglio A4 Millimetrico (Sfondo scuro di contrasto, identico a Foto 4) */
            <div className="flex-1 overflow-y-auto bg-[#18181b] p-6 flex justify-center">
              <DDTA4Document ddt={ddt} items={items} />
            </div>
          )}
        </div>
      </div>

      {/* Modale Alex: Ricerca Multi-Listino (4 Finestre Sincronizzate) */}
      <DDTMultiListinoModal
        isOpen={isAlexModalOpen}
        onClose={() => setIsAlexModalOpen(false)}
        currentClientName={ddt.client_name}
        currentDdtItems={items}
        onUpdateDdtItems={setItems}
        onSelectArticle={handleInsertArticle}
      />

      {/* Modale Numero Copie Stampa */}
      <DDTPrintCopiesModal
        isOpen={isPrintCopiesModalOpen}
        onClose={() => setIsPrintCopiesModalOpen(false)}
        onConfirm={handleConfirmPrint}
        isPrinting={isPrinting}
      />

      {/* Portale Dedicato alla Stampa & Esportazione Immagine (In coordinate stabili offscreen) */}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            id="ddt-print-portal"
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
            <DDTA4Document ddt={ddt} items={items} isPrintOnly={true} />
          </div>,
          document.body
        )}
    </div>
  );
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error) ?? String(error);
}

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { DdtArchiveEntry, DdtDocument, DdtItem } from "./models/ddt";
import { makeEmptyDdt, makeEmptyItems, buildPaddedDdtItems } from "./ddtStudioDefaults";
import { ddtRepository } from "./services/ddtRepository";
import { subscribeToOpenDdt } from "./services/ddtNavigation";
import { ensureDdtBaseSnapshotFromLocal } from "./services/ddtSnapshotService";
import { registerWindowCloseGuard, registerDirtyCheck } from "@/shared/stores/useWindowStore";
import { UnsavedChangesModal } from "@/shared/components/ui/UnsavedChangesModal";
import { calculateDdtTotals } from "./utils/ddtCalculations";
import { DDTStudioHeader } from "./components/DDTStudioHeader";
import { DDTStudioSidebar } from "./components/DDTStudioSidebar";
import { DDTClienteCard } from "./components/DDTClienteCard";
import { DDTArticoliTable, DDTArticoliTableHandle } from "./components/DDTArticoliTable";
import { DDTFinancialBar } from "./components/DDTFinancialBar";
import { DDTLogisticaCard } from "./components/DDTLogisticaCard";
import { DDTA4Document } from "./document/DDTA4Document";
import { DDTArticoliSearchModal } from "./components/DDTArticoliSearchModal";
import { DdtConflictDetail } from "./components/DdtConflictModal";
import { PurchaseHistoryCandidateRow } from "./components/DdtPurchaseHistoryModal";
import { DdtMergeConflictState } from "./components/DdtMergeConflictModal";
import {
  DdtGapModalState,
  DdtOperatorPromptState,
  DdtPurchaseHistoryModalState,
  DdtStudioModals,
} from "./components/DdtStudioModals";
import { useDdtSearchPanelResize } from "./hooks/useDdtSearchPanelResize";
import { useDdtLiveSync } from "./hooks/useDdtLiveSync";
import { useDdtDocumentActions } from "./hooks/useDdtDocumentActions";
import {
  addIgnoredDdtGaps,
  applyGlobalDiscountToDdtItems,
  applyGlobalMarkupToDdtItems,
  applyPurchaseHistoryPrices,
  computeDdtDirtySignature,
  formatDdtIdentifier,
  getDdtErrorMessage,
  getIgnoredDdtGaps,
  insertArticleIntoDdtItems,
  InsertDdtArticlePayload,
} from "./utils/ddtStudioEditorUtils";

type DdtCloseChoice = "save" | "discard" | "cancel";

export const DDTStudioPage: React.FC<{ windowId: string }> = ({ windowId }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<"editor" | "a4">("editor");
  const [showMargini, setShowMargini] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [searchSidebar, setSearchSidebar] = useState("");
  const [recentDdts, setRecentDdts] = useState<DdtArchiveEntry[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [loadingDdtId, setLoadingDdtId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrintCopiesModalOpen, setIsPrintCopiesModalOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [operatorPrompt, setOperatorPrompt] = useState<DdtOperatorPromptState | null>(null);
  const [closePrompt, setClosePrompt] = useState<((choice: DdtCloseChoice) => void) | null>(null);
  const savedSignature = React.useRef<string | null>(null);
  const printPortalRef = React.useRef<HTMLDivElement>(null);
  const ddtLoadRequest = React.useRef(0);

  // Stato Cestino DDT Studio (15 voci) & Conflitti
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [trashCount, setTrashCount] = useState(0);
  const [numberingStatus, setNumberingStatus] = useState<{
    missing: number[];
    maxNumber: number;
    totalCount: number;
    year: number;
  } | null>(null);
  const [gapModalState, setGapModalState] = useState<DdtGapModalState | null>(null);
  const [activeConflict, setActiveConflict] = useState<DdtConflictDetail | null>(null);
  const [remoteUpdateNotice, setRemoteUpdateNotice] = useState<string | null>(null);
  const [mergeConflict, setMergeConflict] = useState<DdtMergeConflictState | null>(null);
  const [resolvingMerge, setResolvingMerge] = useState(false);

  const refreshTrashCount = useCallback(async () => {
    try {
      const count = await ddtRepository.getTrashCount();
      setTrashCount(count);
    } catch (e) {
      console.warn("Errore conteggio cestino DDT:", e);
    }
  }, []);

  const refreshNumberingStatus = useCallback(async (targetYear?: number | null) => {
    const yearToCheck = targetYear || selectedYear || new Date().getFullYear();
    try {
      const status = await ddtRepository.getMissingDocNumbers(yearToCheck);
      setNumberingStatus({ ...status, year: yearToCheck });
    } catch (e) {
      console.warn("Errore controllo continuità numerazione DDT:", e);
    }
  }, [selectedYear]);

  useEffect(() => {
    void refreshTrashCount();
  }, [refreshTrashCount]);

  useEffect(() => {
    void refreshNumberingStatus(selectedYear);
  }, [refreshNumberingStatus, selectedYear]);

  // Stato DDT Corrente
  const [ddt, setDdt] = useState<Partial<DdtDocument>>(makeEmptyDdt());
  const [items, setItems] = useState<DdtItem[]>(makeEmptyItems());

  // Input Finanziari Immediati (Sconto Righe e Maggiorazione %)
  const [globalDiscount, setGlobalDiscount] = useState("");
  const [globalMarkup, setGlobalMarkup] = useState("");

  const currentDdtIdRef = React.useRef<string | undefined>(ddt.id);
  const ddtUpdatedAtRef = React.useRef<string | undefined>(ddt.updated_at);
  const isSavingRef = React.useRef<boolean>(isSaving);
  useEffect(() => {
    currentDdtIdRef.current = ddt.id;
    ddtUpdatedAtRef.current = ddt.updated_at;
  }, [ddt.id, ddt.updated_at]);
  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  const signature = useCallback(
    (doc: Partial<DdtDocument>, rows: DdtItem[], discount: string, markup: string) =>
      computeDdtDirtySignature(doc, rows, discount, markup),
    []
  );
  const currentSignature = useMemo(
    () => signature(ddt, items, globalDiscount, globalMarkup),
    [ddt, items, globalDiscount, globalMarkup, signature]
  );
  const isDirty = savedSignature.current !== null && currentSignature !== savedSignature.current;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    return registerDirtyCheck(windowId, () => isDirtyRef.current);
  }, [windowId]);

  const handleSaveDraftRef = useRef<() => Promise<boolean>>(async () => false);

  const promptUnsavedChanges = useCallback(async (): Promise<boolean> => {
    if (!isDirtyRef.current) return true;
    const choice = await new Promise<DdtCloseChoice>((resolve) => setClosePrompt(() => resolve));
    setClosePrompt(null);
    if (choice === "discard") return true;
    if (choice === "save") return await handleSaveDraftRef.current();
    return false;
  }, []);

  useEffect(() => {
    savedSignature.current = signature(ddt, items, globalDiscount, globalMarkup);
  }, []);

  // Riferimento per controllo imperativo tabella (es. pulizia focus cella)
  const tableRef = React.useRef<DDTArticoliTableHandle>(null);

  const handleClearTableFocus = useCallback(() => {
    tableRef.current?.clearFocusedCell();
  }, []);

  // Pannello ricerca articoli F4 / F3 (docked a lato della tabella, chiuso di default)
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

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
    if (isSearchModalOpen) return;
    if (!isF3NavigatingRef.current) {
      setSearchQuery("");
    }
  }, [isSearchModalOpen]);

  const { searchPanelWidth, handleSplitterMouseDown } = useDdtSearchPanelResize();

  // Modale Alex (Ricerca Multi-Listino 4 finestre)
  const [isAlexModalOpen, setIsAlexModalOpen] = useState(false);
  const isQuantityModalOpenRef = useRef(false);

  // Scorciatoie tastiera: F4 apre/chiude il pannello, F3 apre e sposta il focus direttamente sulla prima voce del listino
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
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
  }, [handleReturnToTable]);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

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

  const loadAvailableYears = useCallback(async () => {
    try {
      const years = await ddtRepository.getAvailableYears();
      setAvailableYears(years);
    } catch (e) {
      console.warn("Errore caricamento anni disponibili:", e);
    }
  }, []);

  useEffect(() => {
    loadRecentDdts();
  }, [loadRecentDdts]);

  useEffect(() => {
    loadAvailableYears();
  }, [loadAvailableYears]);

  // Sincronizzazione live Realtime / 3-way merge / conflitti / conversione preventivo
  useDdtLiveSync({
    selectedYear,
    globalDiscount,
    globalMarkup,
    currentDdtIdRef,
    ddtUpdatedAtRef,
    isSavingRef,
    isDirtyRef,
    savedSignature,
    signature,
    loadRecentDdts,
    loadAvailableYears,
    refreshNumberingStatus,
    setDdt,
    setItems,
    setGlobalDiscount,
    setGlobalMarkup,
    setShowMargini,
    setActiveView,
    setRemoteUpdateNotice,
    setActiveConflict,
    setMergeConflict,
    showToast,
  });

  // Carica un DDT esistente selezionato dalla sidebar
  const handleSelectDdt = useCallback(async (id: string) => {
    if (currentDdtIdRef.current === id) return;
    if (isDirtyRef.current) {
      const allowed = await promptUnsavedChanges();
      if (!allowed) return;
    }
    const requestId = ++ddtLoadRequest.current;
    setLoadingDdtId(id);
    try {
      const fullDoc = await ddtRepository.getDdtById(id);
      if (requestId !== ddtLoadRequest.current) return;
      if (!fullDoc) return;

      currentDdtIdRef.current = fullDoc.id;
      setRemoteUpdateNotice(null);
      setDdt(fullDoc);
      void ensureDdtBaseSnapshotFromLocal(fullDoc.id);
      setSelectedYear((prev) => {
        if (prev === null) return null;
        return prev === fullDoc.year ? prev : fullDoc.year;
      });

      const padded = buildPaddedDdtItems(fullDoc.id, fullDoc.items || []);
      setGlobalDiscount("");
      setGlobalMarkup("");
      setItems(padded);
      savedSignature.current = signature(fullDoc, padded, "", "");
      showToast(`DDT #${formatDdtIdentifier(fullDoc)} caricato`);
    } catch (e) {
      if (requestId !== ddtLoadRequest.current) return;
      console.error("Errore apertura DDT:", e);
      showToast("Non è stato possibile caricare il DDT selezionato");
    } finally {
      if (requestId === ddtLoadRequest.current) setLoadingDdtId(null);
    }
  }, [signature, promptUnsavedChanges, showToast]);

  useEffect(() => subscribeToOpenDdt((id) => { void handleSelectDdt(id); }), [handleSelectDdt]);

  // Calcola e assegna il prossimo numero DDT disponibile se documento vuoto
  useEffect(() => {
    let active = true;
    if (ddt.doc_number === null) {
      ddtRepository.getNextDocNumberWithCloud(ddt.year || new Date().getFullYear()).then((num) => {
        if (active && num) {
          setDdt((prev) => {
            if (prev.doc_number === null) {
              const updated = { ...prev, doc_number: num };
              if (savedSignature.current === signature(prev, items, globalDiscount, globalMarkup)) {
                savedSignature.current = signature(updated, items, globalDiscount, globalMarkup);
              }
              return updated;
            }
            return prev;
          });
        }
      });
    }
    return () => { active = false; };
  }, [ddt.id, ddt.doc_number, ddt.year, signature]);

  const createDraftWithNumber = (docNumber: number | null) => {
    ddtLoadRequest.current += 1;
    setLoadingDdtId(null);
    const nextDdt = makeEmptyDdt();
    const nextItems = makeEmptyItems();
    nextDdt.doc_number = docNumber;
    setDdt(nextDdt);
    setItems(nextItems);
    setGlobalDiscount("");
    setGlobalMarkup("");
    savedSignature.current = signature(nextDdt, nextItems, "", "");
    showToast(`Nuova Bozza DDT creata (N° ${nextDdt.doc_number || "Provvisorio"})`);
  };

  // Nuovo DDT vuoto con numero progressivo già visibile (e controllo buchi di numerazione)
  const handleNewDdt = async () => {
    if (isDirtyRef.current) {
      const allowed = await promptUnsavedChanges();
      if (!allowed) return;
    }
    const targetYear = new Date().getFullYear();
    let nextNum: number | null = null;
    try {
      nextNum = await ddtRepository.getNextDocNumberWithCloud(targetYear);
    } catch (e) {
      console.warn("Impossibile calcolare prossimo numero DDT:", e);
    }

    try {
      const status = await ddtRepository.getMissingDocNumbers(targetYear);
      setNumberingStatus({ ...status, year: targetYear });
      const ignored = getIgnoredDdtGaps(targetYear);
      const unignoredMissing = status.missing.filter((n) => !ignored.has(n));
      if (unignoredMissing.length > 0) {
        setGapModalState({
          isOpen: true,
          mode: "new_ddt",
          missingNumbers: unignoredMissing,
          nextSequentialNumber: nextNum,
          year: targetYear,
        });
        return;
      }
    } catch (e) {
      console.warn("Errore verifica numeri saltati:", e);
    }

    createDraftWithNumber(nextNum);
  };

  const {
    handleSaveDraft,
    handleEmitDdt,
    handleTheOne,
    handleDuplicateDdt,
    handleDeleteDdt,
    handleDeleteArchivedDdt,
    handleResolveConflict,
    handleConfirmPrint,
    handleExportPdf,
    handleGenerateTest48,
    handleResolveMergeConflictChoice,
  } = useDdtDocumentActions({
    ddt,
    items,
    globalDiscount,
    globalMarkup,
    isSaving,
    isPrinting,
    currentSignature,
    activeConflict,
    mergeConflict,
    isSavingRef,
    isDirtyRef,
    ddtUpdatedAtRef,
    savedSignature,
    printPortalRef,
    handleSaveDraftRef,
    signature,
    setDdt,
    setItems,
    setIsSaving,
    setIsPrinting,
    setIsExportingPdf,
    setIsPrintCopiesModalOpen,
    setActiveView,
    setRemoteUpdateNotice,
    setOperatorPrompt,
    setActiveConflict,
    setMergeConflict,
    setResolvingMerge,
    loadRecentDdts,
    refreshTrashCount,
    promptUnsavedChanges,
    handleSelectDdt,
    handleNewDdt,
    showToast,
  });

  useEffect(() => registerWindowCloseGuard(windowId, async () => {
    return await promptUnsavedChanges();
  }), [windowId, promptUnsavedChanges]);

  const [isFillingPurchasePrices, setIsFillingPurchasePrices] = useState(false);
  const [purchaseHistoryModal, setPurchaseHistoryModal] = useState<DdtPurchaseHistoryModalState | null>(null);

  const handleFillPurchasePricesFromHistory = async () => {
    const clientName = ddt.client_name?.trim() || "";
    const clientId = ddt.client_id || null;
    if (!clientName && !clientId) {
      showToast("Seleziona prima un cliente per cercare nello storico acquisti.");
      return;
    }

    const describedRows = items
      .map((it, idx) => ({ item: it, rowIndex: idx }))
      .filter(({ item }) => Boolean(item.description?.trim()));

    if (describedRows.length === 0) {
      showToast("Inserisci almeno una voce con descrizione per cercare nello storico.");
      return;
    }

    setIsFillingPurchasePrices(true);
    try {
      const detailsMap = await ddtRepository.getLatestPurchasePriceDetailsForClient({
        clientId,
        clientName,
        descriptions: describedRows.map(({ item }) => item.description!.trim()),
        excludeDdtId: ddt.id || null,
      });

      if (detailsMap.size === 0) {
        showToast(`Nessun prezzo di acquisto trovato nello storico di ${clientName || "questo cliente"}.`);
        return;
      }

      const candidateRows: PurchaseHistoryCandidateRow[] = describedRows.map(({ item, rowIndex }) => {
        const descNorm = (item.description || "").trim().toUpperCase();
        return {
          rowKey: item.id || `row-${rowIndex}`,
          rowIndex,
          description: item.description!.trim(),
          currentPurchasePrice: item.purchase_price,
          history: detailsMap.get(descNorm) ?? null,
        };
      });

      setPurchaseHistoryModal({
        isOpen: true,
        clientName: clientName || "Cliente",
        rows: candidateRows,
      });
    } catch (err) {
      console.error("Errore caricamento prezzi acquisto da storico:", err);
      showToast(`Errore storico acquisti: ${getDdtErrorMessage(err)}`);
    } finally {
      setIsFillingPurchasePrices(false);
    }
  };

  const handleConfirmPurchaseHistory = (
    selected: Array<{ rowKey: string; purchasePriceSubunits: number }>
  ) => {
    if (selected.length === 0) {
      setPurchaseHistoryModal(null);
      return;
    }
    setItems((prev) => applyPurchaseHistoryPrices(prev, selected));
    setPurchaseHistoryModal(null);
    showToast(`Inseriti ${selected.length} prezzi di acquisto dallo storico.`);
  };

  // Inserimento articolo selezionato da modale ricerca F3 o Alex
  const handleInsertArticle = (article: InsertDdtArticlePayload) => {
    let insertedIdx = -1;
    setItems((prev) => {
      const result = insertArticleIntoDdtItems(
        prev,
        article,
        searchQuery,
        globalMarkup,
        globalDiscount
      );
      insertedIdx = result.insertedIdx;
      activeRowIndexRef.current = Math.min(insertedIdx + 1, result.nextItems.length - 1);
      return result.nextItems;
    });

    if (insertedIdx >= 0) {
      const nextIdx = insertedIdx + 1;
      if (!isSearchModalOpen) {
        setTimeout(() => {
          tableRef.current?.focusCell(nextIdx, "description", false);
        }, 50);
      }
    }

    showToast(`Inserito: ${article.description}`);
  };

  // Modifica istantanea sconto globale (singolo o a cascata es. 10+3)
  const handleChangeGlobalDiscount = (val: string) => {
    setGlobalDiscount(val);
    React.startTransition(() => {
      setItems((prev) => applyGlobalDiscountToDdtItems(prev, val));
    });
  };

  // Modifica istantanea maggiorazione % su tutti i prezzi della DDT
  const handleChangeGlobalMarkup = (val: string) => {
    setGlobalMarkup(val);
    React.startTransition(() => {
      setItems((prev) => {
        const next = applyGlobalMarkupToDdtItems(prev, val);
        return next ?? prev;
      });
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
      <UnsavedChangesModal
        isOpen={Boolean(closePrompt)}
        title="DDT con modifiche non salvate"
        message="Attenzione: sono presenti modifiche non salvate in questo DDT. Se prosegui senza salvare, tutte le modifiche apportate verranno cancellate definitivamente."
        onCancel={() => closePrompt?.("cancel")}
        onDiscard={() => closePrompt?.("discard")}
        onSave={() => closePrompt?.("save")}
        saveLabel="Salva"
        discardLabel="Non salvare"
        cancelLabel="Annulla"
        isSaving={isSaving}
      />

      {/* Banner avviso aggiornamento remoto mentre si sta editando */}
      {remoteUpdateNotice && (
        <div className="bg-amber-500/15 border-b border-amber-500/40 text-amber-200 px-4 py-1.5 text-xs flex items-center justify-between gap-2">
          <span>{remoteUpdateNotice}</span>
          <button
            type="button"
            onClick={() => setRemoteUpdateNotice(null)}
            className="text-[11px] underline hover:text-white shrink-0"
          >
            Chiudi
          </button>
        </div>
      )}

      {/* Header Operativo DDT Studio */}
      <DDTStudioHeader
        ddt={ddt}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activeView={activeView}
        setActiveView={setActiveView}
        selectedYear={selectedYear}
        trashCount={trashCount}
        toastMessage={toastMessage}
        numberingStatus={numberingStatus}
        onOpenGapModal={() => {
          if (!numberingStatus || numberingStatus.missing.length === 0) return;
          setGapModalState({
            isOpen: true,
            mode: "inspect",
            missingNumbers: numberingStatus.missing,
            nextSequentialNumber: null,
            year: numberingStatus.year,
          });
        }}
        onOpenTrash={() => setIsTrashOpen(true)}
        onNewDdt={handleNewDdt}
        onSaveDraft={handleSaveDraft}
        onEmitDdt={handleEmitDdt}
        onTheOne={handleTheOne}
        onOpenPrintModal={() => setIsPrintCopiesModalOpen(true)}
        onExportPdf={handleExportPdf}
        onGenerateTest48={handleGenerateTest48}
        onDuplicateDdt={handleDuplicateDdt}
        onDeleteDdt={handleDeleteDdt}
        isSaving={isSaving}
        isExportingPdf={isExportingPdf}
        isPrinting={isPrinting}
        isDirty={isDirty}
      />

      {/* Corpo Principale: Sidebar Riducibile / Espandibile + Area Lavoro */}
      <div className="flex-1 flex overflow-hidden">
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
          availableYears={availableYears}
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
                  onSilentEnrichDdt={(updater) => {
                    setDdt((prev) => {
                      const updated = updater(prev);
                      if (
                        updated !== prev &&
                        savedSignature.current === signature(prev, items, globalDiscount, globalMarkup)
                      ) {
                        savedSignature.current = signature(updated, items, globalDiscount, globalMarkup);
                      }
                      return updated;
                    });
                  }}
                />
              </div>

              {/* Area Centrale: Tabella Articoli + Splitter + Cerca Articoli Docked */}
              <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-row">
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
                    isSearchModalOpen={isSearchModalOpen}
                    onFocusSearchModal={() => setF3FocusTrigger((p) => p + 1)}
                  />
                </div>

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

              {/* Barra Finanziaria Colorata */}
              <DDTFinancialBar
                ddt={ddt}
                setDdt={setDdt}
                totals={totals}
                showMargini={showMargini}
                setShowMargini={setShowMargini}
                onOpenSearchModal={() => setIsSearchModalOpen((p) => !p)}
                onOpenAlexModal={() => setIsAlexModalOpen(true)}
                onFillPurchasePricesFromHistory={handleFillPurchasePricesFromHistory}
                isFillingPurchasePrices={isFillingPurchasePrices}
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
            <div className="flex-1 overflow-y-auto bg-[#18181b] p-6 flex justify-center">
              <DDTA4Document ddt={ddt} items={items} />
            </div>
          )}
        </div>
      </div>

      {/* Modali DDT Studio */}
      <DdtStudioModals
        ddt={ddt}
        items={items}
        setItems={setItems}
        isAlexModalOpen={isAlexModalOpen}
        onCloseAlexModal={() => setIsAlexModalOpen(false)}
        onInsertArticle={handleInsertArticle}
        isPrintCopiesModalOpen={isPrintCopiesModalOpen}
        onClosePrintCopiesModal={() => setIsPrintCopiesModalOpen(false)}
        onConfirmPrint={handleConfirmPrint}
        isPrinting={isPrinting}
        isTrashOpen={isTrashOpen}
        onCloseTrash={() => setIsTrashOpen(false)}
        onDdtRestored={async () => {
          await loadRecentDdts();
          await refreshTrashCount();
        }}
        purchaseHistoryModal={purchaseHistoryModal}
        onClosePurchaseHistory={() => setPurchaseHistoryModal(null)}
        onConfirmPurchaseHistory={handleConfirmPurchaseHistory}
        gapModalState={gapModalState}
        onCloseGapModal={() => setGapModalState(null)}
        onRecoverGapNumber={(num) => {
          setGapModalState(null);
          createDraftWithNumber(num);
        }}
        onCreateGapPlaceholder={async (num) => {
          if (!gapModalState) return;
          await ddtRepository.createPlaceholderDdt(gapModalState.year, num);
          await loadRecentDdts();
          await refreshNumberingStatus(gapModalState.year);
          showToast(`Placeholder creato per DDT #${num}/${gapModalState.year}`);
          const remaining = gapModalState.missingNumbers.filter((n) => n !== num);
          if (remaining.length === 0) {
            if (gapModalState.mode === "new_ddt") {
              createDraftWithNumber(gapModalState.nextSequentialNumber);
            }
            setGapModalState(null);
          } else {
            setGapModalState({ ...gapModalState, missingNumbers: remaining });
          }
        }}
        onIgnoreGapsAndContinue={(nums) => {
          if (!gapModalState) return;
          addIgnoredDdtGaps(gapModalState.year, nums);
          const nextNum = gapModalState.nextSequentialNumber;
          setGapModalState(null);
          createDraftWithNumber(nextNum);
        }}
        activeConflict={activeConflict}
        onCloseConflict={() => setActiveConflict(null)}
        onResolveConflict={handleResolveConflict}
        mergeConflict={mergeConflict}
        resolvingMerge={resolvingMerge}
        onUseRemoteMerge={() => void handleResolveMergeConflictChoice("use-remote")}
        onKeepLocalMerge={() => void handleResolveMergeConflictChoice("keep-local")}
        operatorPrompt={operatorPrompt}
        onSelectOperator={(op) => {
          const resolver = operatorPrompt?.resolve;
          setOperatorPrompt(null);
          resolver?.(op);
        }}
        onCancelOperator={() => {
          const resolver = operatorPrompt?.resolve;
          setOperatorPrompt(null);
          resolver?.(null);
        }}
      />

      {/* Portale Dedicato alla Stampa & Esportazione Immagine (In coordinate stabili offscreen) */}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            ref={printPortalRef}
            id={`ddt-print-portal-${windowId || ddt.id || "main"}`}
            className="ddt-print-portal"
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

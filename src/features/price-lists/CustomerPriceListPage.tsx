import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useDeferredValue,
  useCallback,
} from "react";
import { ListinoClienteRow } from "./models/priceList";
import { priceListRepository } from "./services/priceListRepository";
import { priceListSyncService } from "./services/priceListSyncService";
import { orderRepository } from "@/features/orders/services/orderRepository";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { useUserStore } from "@/shared/stores/useUserStore";
import { registerWindowCloseGuard, registerDirtyCheck, useWindowStore } from "@/shared/stores/useWindowStore";
import { UnsavedChangesModal } from "@/shared/components/ui/UnsavedChangesModal";
import { CustomerPriceListTrashModal } from "./components/CustomerPriceListTrashModal";
import { useClientColumnVisibility } from "./hooks/useColumnVisibility";
import { useEasterEggStore } from "@/shared/easter-eggs/useEasterEggStore";
import { CustomerPriceListToolbar } from "./components/CustomerPriceListToolbar";
import { CustomerPriceListTableHeader } from "./components/CustomerPriceListTableHeader";
import { CustomerPriceListRow } from "./components/CustomerPriceListRow";
import {
  buildClientPriceChangeLogs,
  createBlankClientRow,
  CUSTOMER_LIST_BATCH_SIZE,
  CustomerPriceListSortField,
  CustomerPriceListTab,
  EDITABLE_CLIENT_COL_ORDER,
  filterAndSortClientPriceItems,
  updateClientRowWithField,
} from "./utils/customerPriceListViewUtils";

export interface CustomerPriceListPageProps {
  windowId?: string;
}

export const CustomerPriceListPage: React.FC<CustomerPriceListPageProps> = ({ windowId }) => {
  const { currentUser } = useUserStore();
  const canEdit = Boolean(currentUser?.is_admin || currentUser?.can_edit_price_lists);

  // Visibilità Colonne
  const {
    columns: allColumns,
    visibleColumns,
    isVisible,
    toggleColumn,
    resetDefaultColumns,
  } = useClientColumnVisibility(currentUser?.id);

  // Dati
  const [items, setItems] = useState<ListinoClienteRow[]>([]);
  const [totalDbCount, setTotalDbCount] = useState<number>(0);
  const [distinctClients, setDistinctClients] = useState<string[]>([]);
  const [orderSuppliers, setOrderSuppliers] = useState<string[]>([]);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>("TUTTI");
  const [activeTab, setActiveTab] = useState<CustomerPriceListTab>("tutti");

  useEffect(() => {
    if (!windowId) return;
    const nextTitle =
      selectedClientFilter && selectedClientFilter !== "TUTTI"
        ? selectedClientFilter
        : null;
    useWindowStore.getState().updateWindowTitle(windowId, nextTitle);
  }, [windowId, selectedClientFilter]);

  const [error, setError] = useState<string | null>(null);

  // 1 Riga vuota sempre in cima per creazione nuovi articoli
  const [newTopRow, setNewTopRow] = useState<ListinoClienteRow>(() => createBlankClientRow());

  // Tracciamento modifiche non salvate & Undo Stack
  const [dirtyRows, setDirtyRows] = useState<Map<string, ListinoClienteRow>>(new Map());
  const [undoStack, setUndoStack] = useState<{ rowId: string; prevRow?: ListinoClienteRow; isNewRow?: boolean }[]>([]);
  const [originalRowsSnapshot, setOriginalRowsSnapshot] = useState<Map<string, ListinoClienteRow>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(() => {
    const saved = localStorage.getItem("client_price_list_last_saved_time");
    return saved ? new Date(saved) : null;
  });

  // Cella attiva ed editing Excel
  const [activeCell, setActiveCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [initialEditChar, setInitialEditChar] = useState<string | undefined>(undefined);
  const isKeyboardNavRef = useRef(false);

  // Cestino
  const [trashCount, setTrashCount] = useState<number>(0);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);

  // Ricerca
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { triggerNier } = useEasterEggStore();

  const [visibleCount, setVisibleCount] = useState(CUSTOMER_LIST_BATCH_SIZE);
  const [sortField, setSortField] = useState<CustomerPriceListSortField>("cliente");
  const [sortAsc, setSortAsc] = useState(true);

  // Ref container per scroll infinito e virtualizzazione progressiva
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Auto-save timer
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Aggiorna cliente predefinito su newTopRow quando cambia il filtro cliente
  const handleClientFilterChange = (filter: string) => {
    setSelectedClientFilter(filter);
    if (filter !== "TUTTI") {
      setNewTopRow((prev) => ({
        ...prev,
        cliente: filter,
      }));
    } else {
      setNewTopRow((prev) => ({
        ...prev,
        cliente: "",
      }));
    }
  };

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [count, clients, rows, tCount, supps] = await Promise.all([
        priceListRepository.getClientPriceCount(),
        priceListRepository.getDistinctClients(),
        priceListRepository.searchClientPrices("", undefined, 50000),
        priceListRepository.getClientTrashCount().catch(() => 0),
        orderRepository.getSuppliers().catch(() => []),
      ]);
      setTotalDbCount(count);
      setDistinctClients(clients);
      setItems(rows);
      setTrashCount(tCount);

      const supplierNames = Array.from(
        new Set(supps.map((s) => s.name?.trim()).filter(Boolean))
      ).sort();
      setOrderSuppliers(supplierNames);

      const snapshot = new Map<string, ListinoClienteRow>();
      for (const r of rows) {
        snapshot.set(r.id, { ...r });
      }
      setOriginalRowsSnapshot(snapshot);
      setDirtyRows(new Map());
      setUndoStack([]);

      // Sincronizzazione incrementale Cloud in background
      void (async () => {
        try {
          const syncRes = await priceListSyncService.syncIncrementalClientiFromSupabase();
          if (syncRes.updatedCount > 0) {
            console.log(`[CustomerPriceListPage] Sincronizzati dal Cloud ${syncRes.updatedCount} articoli listini clienti.`);
            const refreshedRows = await priceListRepository.searchClientPrices("", undefined, 50000);
            setItems(refreshedRows);
            setTotalDbCount(refreshedRows.length);
            setOriginalRowsSnapshot((prev) => {
              const next = new Map(prev);
              for (const r of syncRes.updatedRows) {
                next.set(r.id, { ...r });
              }
              return next;
            });
          }
        } catch (e) {
          console.warn("[CustomerPriceListPage] Sync incrementale fallito:", e);
        }
      })();
    } catch (err) {
      console.error("Errore caricamento listini clienti da SQLite:", err);
      setError(err instanceof Error ? err.message : "Errore lettura database locale.");
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Controllo automatico aggiornamenti Cloud al ritorno su finestra/rete o dopo Cloud Sync globale
  useEffect(() => {
    let lastFocusCheck = Date.now();
    const refreshClientiFromSqlite = async () => {
      const [clients, refreshedRows] = await Promise.all([
        priceListRepository.getDistinctClients(),
        priceListRepository.searchClientPrices("", undefined, 50000),
      ]);
      setDistinctClients(clients);
      setItems(refreshedRows);
      setTotalDbCount(refreshedRows.length);
      setOriginalRowsSnapshot(new Map(refreshedRows.map((r) => [r.id, { ...r }])));
    };

    const handleAutoSync = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const now = Date.now();
      if (now - lastFocusCheck > 30000 && dirtyRows.size === 0) {
        lastFocusCheck = now;
        priceListSyncService
          .syncIncrementalClientiFromSupabase()
          .then((res) => {
            if (res.updatedCount > 0) {
              void refreshClientiFromSqlite();
            }
          })
          .catch(() => {});
      }
    };

    const handleGlobalCloudSync = () => {
      if (dirtyRows.size === 0) {
        void refreshClientiFromSqlite().catch(() => {});
      }
    };

    window.addEventListener("focus", handleAutoSync);
    window.addEventListener("online", handleAutoSync);
    window.addEventListener("cloud-sync-status-updated", handleGlobalCloudSync);
    return () => {
      window.removeEventListener("focus", handleAutoSync);
      window.removeEventListener("online", handleAutoSync);
      window.removeEventListener("cloud-sync-status-updated", handleGlobalCloudSync);
    };
  }, [dirtyRows.size]);

  // Scorciatoia F4 per ricerca
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F4") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  const filteredItems = useMemo(
    () =>
      filterAndSortClientPriceItems(
        items,
        originalRowsSnapshot,
        selectedClientFilter,
        activeTab,
        searchTokens,
        sortField,
        sortAsc
      ),
    [items, selectedClientFilter, activeTab, searchTokens, sortField, sortAsc, originalRowsSnapshot]
  );

  // Gestione scroll infinito
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      if (scrollHeight - scrollTop - clientHeight < 500) {
        setVisibleCount((prev) =>
          prev < filteredItems.length
            ? Math.min(prev + CUSTOMER_LIST_BATCH_SIZE, filteredItems.length)
            : prev
        );
      }
    },
    [filteredItems.length]
  );

  // Reset del conteggio visibile e riporto scroll in cima al cambio di filtri
  useEffect(() => {
    setVisibleCount(CUSTOMER_LIST_BATCH_SIZE);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [deferredSearch, selectedClientFilter, activeTab]);

  // Pre-carica elementi successivi se lo schermo è alto e non c'è scrollbar
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight && visibleCount < filteredItems.length) {
      setVisibleCount((prev) => Math.min(prev + CUSTOMER_LIST_BATCH_SIZE, filteredItems.length));
    }
  }, [visibleCount, filteredItems.length]);

  // Salvataggio effettivo
  const saveAllPendingChanges = useCallback(async () => {
    if (dirtyRows.size === 0 || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const rowsToSave = Array.from(dirtyRows.values());
      const nowIso = new Date().toISOString();
      const operatorName = currentUser?.name || currentUser?.station_name || "Operatore";
      const logEntries = buildClientPriceChangeLogs(
        rowsToSave,
        originalRowsSnapshot,
        operatorName,
        nowIso
      );

      await priceListRepository.saveClientRows(rowsToSave);

      if (logEntries.length > 0) {
        await priceListRepository.logPriceChanges(logEntries);
      }

      setOriginalRowsSnapshot((prev) => {
        const next = new Map(prev);
        for (const r of rowsToSave) {
          next.set(r.id, { ...r });
        }
        return next;
      });

      setDirtyRows(new Map());
      setUndoStack([]);
      const now = new Date();
      setLastSavedTime(now);
      try {
        localStorage.setItem("client_price_list_last_saved_time", now.toISOString());
      } catch {}

      void priceListSyncService.pushClientBatchToSupabase(rowsToSave.map((r) => ({ ...r }))).catch((e) => {
        console.warn("[CustomerPriceListPage] Push Supabase asincrono non riuscito:", e);
      });
    } catch (err: any) {
      console.error("[CustomerPriceListPage] Errore salvataggio:", err);
      setError(`Errore salvataggio: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  }, [dirtyRows, isSaving, originalRowsSnapshot, currentUser]);

  // Gestione timer auto-save silenzioso
  const scheduleSilentAutoSaveIfNeeded = useCallback(() => {
    if (autoSaveTimerRef.current !== null) {
      return;
    }
    const savedMinStr = localStorage.getItem("price_list_autosave_minutes");
    const intervalMin = savedMinStr ? Math.max(1, parseInt(savedMinStr, 10)) : 30;
    const intervalMs = intervalMin * 60 * 1000;

    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void saveAllPendingChanges();
    }, intervalMs);
  }, [saveAllPendingChanges]);

  // Annulla ultima modifica (inclusa la creazione di nuove righe)
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    if (lastAction.isNewRow) {
      setItems((prev) => prev.filter((r) => r.id !== lastAction.rowId));
      setDirtyRows((prevDirty) => {
        const next = new Map(prevDirty);
        next.delete(lastAction.rowId);
        return next;
      });
      return;
    }

    const restoredRow = lastAction.prevRow;
    if (!restoredRow) return;
    setItems((prev) => prev.map((r) => (r.id === restoredRow.id ? restoredRow : r)));

    const original = originalRowsSnapshot.get(restoredRow.id);
    setDirtyRows((prevDirty) => {
      const nextDirty = new Map(prevDirty);
      if (original && JSON.stringify(original) === JSON.stringify(restoredRow)) {
        nextDirty.delete(restoredRow.id);
      } else {
        nextDirty.set(restoredRow.id, restoredRow);
      }
      return nextDirty;
    });
  }, [undoStack, originalRowsSnapshot]);

  // Scarta tutte le modifiche pendenti
  const handleDiscardAllChanges = useCallback(() => {
    if (dirtyRows.size === 0) return;
    if (!window.confirm(`Vuoi davvero annullare tutte le ${dirtyRows.size} modifiche non salvate?`)) return;
    setItems((prev) =>
      prev
        .filter((r) => !r.id.startsWith("new_") || originalRowsSnapshot.has(r.id))
        .map((r) => originalRowsSnapshot.get(r.id) || r)
    );
    setDirtyRows(new Map());
    setUndoStack([]);
  }, [dirtyRows.size, originalRowsSnapshot]);

  // Scorciatoia Ctrl+Z per annulla
  useEffect(() => {
    const handleUndoKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (!editingCell) {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener("keydown", handleUndoKeyDown);
    return () => window.removeEventListener("keydown", handleUndoKeyDown);
  }, [handleUndo, editingCell]);

  // Blocco chiusura per modifiche non salvate
  const [closePrompt, setClosePrompt] = useState<((choice: "save" | "discard" | "cancel") => void) | null>(null);

  const confirmIfDirty = useCallback(async (): Promise<boolean> => {
    if (dirtyRows.size === 0) return true;
    const choice = await new Promise<"save" | "discard" | "cancel">((resolve) => setClosePrompt(() => resolve));
    setClosePrompt(null);
    if (choice === "discard") {
      setDirtyRows(new Map());
      setUndoStack([]);
      return true;
    }
    if (choice === "save") {
      await saveAllPendingChanges();
      return true;
    }
    return false;
  }, [dirtyRows, saveAllPendingChanges]);

  useEffect(() => {
    if (!windowId) return;
    return registerDirtyCheck(windowId, () => dirtyRows.size > 0);
  }, [windowId, dirtyRows.size]);

  useEffect(() => {
    if (!windowId) return;
    return registerWindowCloseGuard(windowId, async () => {
      return await confirmIfDirty();
    });
  }, [windowId, confirmIfDirty]);

  // Applica modifica ad una cella
  const applyCellChange = useCallback(
    (rowId: string, colId: string, value: string | number | null) => {
      if (rowId === newTopRow.id) {
        const updatedTop = updateClientRowWithField(newTopRow, colId, value);
        const hasData = Boolean(
          updatedTop.descrizione?.trim() ||
            updatedTop.codice_articolo?.trim() ||
            updatedTop.fornitore?.trim() ||
            updatedTop.prezzo_fattura != null ||
            updatedTop.acquisto_eur != null
        );

        if (hasData) {
          const effectiveClient =
            updatedTop.cliente.trim() ||
            (selectedClientFilter !== "TUTTI" ? selectedClientFilter : "CLIENTE GENERICO");
          const completedRow: ListinoClienteRow = {
            ...updatedTop,
            cliente: effectiveClient,
          };

          setItems((prev) => [completedRow, ...prev]);
          setDirtyRows((prev) => new Map(prev).set(completedRow.id, completedRow));
          setUndoStack((uPrev) => [...uPrev.slice(-49), { rowId: completedRow.id, isNewRow: true }]);
          setNewTopRow(
            createBlankClientRow(
              selectedClientFilter !== "TUTTI" ? selectedClientFilter : undefined
            )
          );
          scheduleSilentAutoSaveIfNeeded();
        } else {
          setNewTopRow(updatedTop);
        }
        return;
      }

      setItems((prev) =>
        prev.map((r) => {
          if (r.id !== rowId) return r;
          setUndoStack((uPrev) => [...uPrev.slice(-49), { rowId, prevRow: { ...r } }]);
          const updated = updateClientRowWithField(r, colId, value);
          setDirtyRows((prevDirty) => new Map(prevDirty).set(rowId, updated));
          scheduleSilentAutoSaveIfNeeded();
          return updated;
        })
      );
    },
    [newTopRow, selectedClientFilter, scheduleSilentAutoSaveIfNeeded]
  );

  // Apertura editor cella
  const selectCell = useCallback((rowId: string, colId: string, fromKeyboard = false) => {
    isKeyboardNavRef.current = fromKeyboard;
    setActiveCell({ rowId, colId });
    setEditingCell(null);
    setInitialEditChar(undefined);
  }, []);

  const startEditing = useCallback(
    (rowId: string, colId: string, char?: string) => {
      if (!canEdit || colId === "data_ref") return;
      setActiveCell({ rowId, colId });
      setEditingCell({ rowId, colId });
      setInitialEditChar(char);
    },
    [canEdit]
  );

  const commitCellEdit = useCallback(
    (rowId: string, colId: string, committedValue: string) => {
      applyCellChange(rowId, colId, committedValue);
      setEditingCell(null);
    },
    [applyCellChange]
  );

  const cancelCellEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  // Navigazione tastiera tra celle
  const moveActiveCell = useCallback(
    (direction: "ArrowDown" | "ArrowUp" | "ArrowLeft" | "ArrowRight") => {
      if (!activeCell) return;
      const { rowId, colId } = activeCell;

      const visibleCols = EDITABLE_CLIENT_COL_ORDER.filter((c) => isVisible(c));
      const currentColIndex = visibleCols.indexOf(colId as any);

      const allDisplayRows: string[] = [newTopRow.id, ...filteredItems.map((it) => it.id)];
      const currentRowIndex = allDisplayRows.indexOf(rowId);

      if (currentColIndex === -1 || currentRowIndex === -1) return;

      let nextColIndex = currentColIndex;
      let nextRowIndex = currentRowIndex;

      switch (direction) {
        case "ArrowLeft":
          if (currentColIndex > 0) nextColIndex--;
          break;
        case "ArrowRight":
          if (currentColIndex < visibleCols.length - 1) nextColIndex++;
          break;
        case "ArrowUp":
          if (currentRowIndex > 0) nextRowIndex--;
          break;
        case "ArrowDown":
          if (currentRowIndex < allDisplayRows.length - 1) nextRowIndex++;
          break;
      }

      if (nextColIndex !== currentColIndex || nextRowIndex !== currentRowIndex) {
        selectCell(allDisplayRows[nextRowIndex], visibleCols[nextColIndex], true);
      }
    },
    [activeCell, filteredItems, newTopRow.id, isVisible, selectCell]
  );

  // Gestione tasti cella
  const handleCellKeyDown = useCallback(
    (
      e: React.KeyboardEvent,
      rowId: string,
      colId: string,
      currentValStr: string
    ) => {
      if (colId === "data_ref") return;

      if (!editingCell) {
        if (
          e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight"
        ) {
          e.preventDefault();
          moveActiveCell(e.key);
          return;
        }

        if (e.key === "Tab") {
          e.preventDefault();
          moveActiveCell(e.shiftKey ? "ArrowLeft" : "ArrowRight");
          return;
        }

        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          startEditing(rowId, colId);
          return;
        }

        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          if (canEdit) applyCellChange(rowId, colId, null);
          return;
        }

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (canEdit && colId !== "data_ref") {
            e.preventDefault();
            startEditing(rowId, colId, e.key);
          }
          return;
        }
      } else {
        if (e.key === "Enter") {
          e.preventDefault();
          commitCellEdit(rowId, colId, currentValStr);
          moveActiveCell("ArrowDown");
          return;
        }

        if (e.key === "Tab") {
          e.preventDefault();
          commitCellEdit(rowId, colId, currentValStr);
          moveActiveCell(e.shiftKey ? "ArrowLeft" : "ArrowRight");
          return;
        }

        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          commitCellEdit(rowId, colId, currentValStr);
          moveActiveCell(e.key);
          return;
        }
      }
    },
    [editingCell, canEdit, moveActiveCell, startEditing, commitCellEdit, applyCellChange]
  );

  // Eliminazione articolo e spostamento nel Cestino
  const handleDeleteRow = useCallback(
    async (row: ListinoClienteRow) => {
      try {
        const operatorName = currentUser?.name || currentUser?.station_name || "Operatore";
        await priceListRepository.moveToClientTrash([row], operatorName);
        setItems((prev) => prev.filter((r) => r.id !== row.id));
        setDirtyRows((prev) => {
          const next = new Map(prev);
          next.delete(row.id);
          return next;
        });
        setTrashCount((c) => Math.min(50, c + 1));
        void priceListSyncService.flushTrash("listini_clienti").catch(console.warn);
      } catch (err) {
        console.error("Errore cancellazione articolo:", err);
      }
    },
    [currentUser]
  );

  const handleItemRestored = useCallback((restored: ListinoClienteRow) => {
    setItems((prev) => [restored, ...prev.filter((row) => row.id !== restored.id)]);
    setOriginalRowsSnapshot((prev) => new Map(prev).set(restored.id, { ...restored }));
    setTrashCount((c) => Math.max(0, c - 1));
  }, []);

  const handleToggleSort = (field: CustomerPriceListSortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const unsavedCount = dirtyRows.size;

  return (
    <div className="flex flex-col h-full bg-[var(--background)] text-[var(--foreground)] overflow-hidden">
      {/* Autocomplete Datalist per Clienti */}
      <datalist id="distinct-clients-autocomplete">
        {distinctClients.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* Autocomplete Datalist per Fornitori (da Order Manager) */}
      <datalist id="order-suppliers-autocomplete">
        {orderSuppliers.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {/* Toolbar Unificata + Error Banner */}
      <CustomerPriceListToolbar
        search={search}
        onChangeSearch={(value) => {
          setSearch(value);
          setVisibleCount(CUSTOMER_LIST_BATCH_SIZE);
        }}
        onSearchFocus={() => setActiveCell(null)}
        searchInputRef={searchInputRef}
        onTriggerNier={triggerNier}
        trashCount={trashCount}
        onOpenTrashModal={() => setIsTrashModalOpen(true)}
        allColumns={allColumns}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onResetDefaultColumns={resetDefaultColumns}
        canEdit={canEdit}
        undoCount={undoStack.length}
        onUndo={handleUndo}
        unsavedCount={unsavedCount}
        onDiscardAllChanges={handleDiscardAllChanges}
        isSaving={isSaving}
        lastSavedTime={lastSavedTime}
        onSaveAllPendingChanges={() => void saveAllPendingChanges()}
        distinctClients={distinctClients}
        selectedClientFilter={selectedClientFilter}
        onClientFilterChange={handleClientFilterChange}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        filteredCount={filteredItems.length}
        totalDbCount={totalDbCount}
        error={error}
      />

      {/* Griglia Tabellare Excel-alike con Virtual Scroll Progressivo */}
      <div
        ref={tableContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-[var(--background)]"
      >
        <table className="w-full text-xs text-left border-collapse border-spacing-0">
          <CustomerPriceListTableHeader
            isVisible={isVisible}
            onToggleSort={handleToggleSort}
            newTopRow={newTopRow}
            selectedClientFilter={selectedClientFilter}
            activeCell={activeCell}
            editingCell={editingCell}
            shouldScrollTopRow={activeCell?.rowId === newTopRow.id && isKeyboardNavRef.current}
            initialEditChar={initialEditChar}
            canEdit={canEdit}
            onSelectCell={selectCell}
            onStartEdit={startEditing}
            onCommitCell={commitCellEdit}
            onCancelEdit={cancelCellEdit}
            onCellKeyDown={handleCellKeyDown}
          />

          <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11.5px]">
            {filteredItems.slice(0, visibleCount).map((item) => {
              const isRowActive = activeCell?.rowId === item.id;
              const isRowEditing = editingCell?.rowId === item.id;
              return (
                <CustomerPriceListRow
                  key={item.id}
                  item={item}
                  isDirty={dirtyRows.has(item.id)}
                  isRowActive={isRowActive}
                  shouldScrollRow={isRowActive && isKeyboardNavRef.current}
                  activeColId={isRowActive ? activeCell.colId : null}
                  editingColId={isRowEditing ? editingCell.colId : null}
                  initialEditChar={isRowEditing ? initialEditChar : undefined}
                  canEdit={canEdit}
                  isVisible={isVisible}
                  onDeleteRow={(row) => void handleDeleteRow(row)}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommitCell={commitCellEdit}
                  onCancelEdit={cancelCellEdit}
                  onCellKeyDown={handleCellKeyDown}
                />
              );
            })}
          </tbody>
        </table>

        {/* Caricamento progressivo automatico allo scroll */}
        {filteredItems.length > visibleCount && (
          <div className="py-2.5 text-center border-t border-[var(--border)]/40 text-xs text-[var(--muted-foreground)] flex items-center justify-center gap-2 select-none">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Caricamento automatico voci successive... ({visibleCount} di {filteredItems.length})</span>
          </div>
        )}
      </div>

      {/* Barra di Stato / Footer */}
      <div className="px-4 py-1.5 bg-[var(--card)] border-t border-[var(--border)] text-xs text-[var(--muted-foreground)] flex items-center justify-between flex-shrink-0 select-none">
        <span>
          Visualizzati: <strong className="text-[var(--foreground)]">{Math.min(visibleCount, filteredItems.length)}</strong> su <strong className="text-[var(--foreground)]">{filteredItems.length}</strong> voci filtrate (Totale DB: {totalDbCount})
        </span>
        {filteredItems.length > visibleCount && (
          <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            Scorri verso il basso per caricare automaticamente
          </span>
        )}
      </div>

      {/* Cestino Modale */}
      <CustomerPriceListTrashModal
        isOpen={isTrashModalOpen}
        onClose={() => setIsTrashModalOpen(false)}
        onItemRestored={handleItemRestored}
      />

      {/* Popup di blocco chiusura per modifiche non salvate */}
      <UnsavedChangesModal
        isOpen={Boolean(closePrompt)}
        title="Listino Clienti con modifiche non salvate"
        message={`Attenzione: sono presenti ${dirtyRows.size} articoli modificati non ancora salvati. Se esci senza salvare, le modifiche apportate andranno perse definitivamente.`}
        onCancel={() => closePrompt?.("cancel")}
        onDiscard={() => closePrompt?.("discard")}
        onSave={() => closePrompt?.("save")}
        saveLabel="Salva e Chiudi"
        discardLabel="Non salvare ed Esci"
        cancelLabel="Annulla"
        isSaving={isSaving}
      />
    </div>
  );
};

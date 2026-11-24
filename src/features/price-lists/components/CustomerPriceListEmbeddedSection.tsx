import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { ListinoClienteRow } from "../models/priceList";
import { priceListRepository } from "../services/priceListRepository";
import { priceListSyncService } from "../services/priceListSyncService";
import { orderRepository } from "@/features/orders/services/orderRepository";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { useUserStore } from "@/shared/stores/useUserStore";
import { CustomerPriceListTrashModal } from "./CustomerPriceListTrashModal";
import { useClientColumnVisibility } from "../hooks/useColumnVisibility";
import { PriceListSectionHandle } from "../types/priceListSectionHandle";
import {
  createBlankClientRow,
  CUSTOMER_LIST_BATCH_SIZE,
  CustomerPriceListSortField,
  EDITABLE_CLIENT_COL_ORDER,
} from "../utils/customerPriceListViewUtils";
import {
  filterAndSortEmbeddedClientItems,
  updateEmbeddedClientRowWithField,
} from "../utils/customerEmbeddedViewUtils";
import { CustomerEmbeddedHeaderBar } from "./CustomerEmbeddedHeaderBar";
import { CustomerEmbeddedTableHeader } from "./CustomerEmbeddedTableHeader";
import { CustomerEmbeddedRow } from "./CustomerEmbeddedRow";

export interface CustomerPriceListEmbeddedSectionProps {
  currentClientName?: string;
  currentClientPls?: Set<string>;
  globalSearch?: string;
  layoutMode?: "horizontal" | "vertical" | "grid";
  onSelectArticle?: (article: {
    code?: string;
    description: string;
    unit?: string;
    unit_price: number;
    purchase_price?: number;
    vat_rate?: number;
  }) => void;
}

export const CustomerPriceListEmbeddedSection = forwardRef<
  PriceListSectionHandle,
  CustomerPriceListEmbeddedSectionProps
>(({
  currentClientName,
  currentClientPls,
  globalSearch = "",
  layoutMode = "horizontal",
  onSelectArticle,
}, ref) => {
  const { currentUser } = useUserStore();
  const isAlexOrAdmin = Boolean(
    currentUser?.is_admin ||
    currentUser?.name?.trim().toLowerCase() === "alex" ||
    currentUser?.can_edit_price_lists
  );
  const canEdit = isAlexOrAdmin;

  const {
    columns,
    visibleColumns,
    toggleColumn,
    resetDefaultColumns,
    isVisible,
  } = useClientColumnVisibility(currentUser?.id);

  // Dati
  const [items, setItems] = useState<ListinoClienteRow[]>([]);
  const [distinctClients, setDistinctClients] = useState<string[]>([]);
  const [orderSuppliers, setOrderSuppliers] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Riga vuota in cima per immissione nuovi articoli
  const [newTopRow, setNewTopRow] = useState<ListinoClienteRow>(() => createBlankClientRow());

  // Tracciamento modifiche non salvate & Undo Stack
  const [dirtyRows, setDirtyRows] = useState<Map<string, ListinoClienteRow>>(new Map());
  const [undoStack, setUndoStack] = useState<{ rowId: string; prevRow?: ListinoClienteRow; isNewRow?: boolean }[]>([]);
  const [originalRowsSnapshot, setOriginalRowsSnapshot] = useState<Map<string, ListinoClienteRow>>(new Map());
  const [isSaving, setIsSaving] = useState(false);

  // Cella attiva ed editing Excel
  const [activeCell, setActiveCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [initialEditChar, setInitialEditChar] = useState<string | undefined>(undefined);

  // Ordinamento
  const [sortField, setSortField] = useState<CustomerPriceListSortField>("descrizione");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Cestino & Paginazione
  const [trashCount, setTrashCount] = useState<number>(0);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(CUSTOMER_LIST_BATCH_SIZE);

  // Ref container per scroll infinito progressivo
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Timer salvataggio automatico (5 secondi)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Caricamento dati iniziali da SQLite
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [clients, rows, tCount, supps] = await Promise.all([
        priceListRepository.getDistinctClients(),
        priceListRepository.searchClientPrices("", undefined, 20000),
        priceListRepository.getClientTrashCount().catch(() => 0),
        orderRepository.getSuppliers().catch(() => []),
      ]);
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
    } catch (err) {
      console.error("Errore caricamento Listino Clienti embedded:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Aggiorna cliente predefinito su newTopRow quando cambia il cliente del DDT o il filtro
  useEffect(() => {
    const effectiveCli = clientFilter.trim() || currentClientName || "";
    setNewTopRow((prev) => ({
      ...prev,
      cliente: prev.cliente || effectiveCli,
    }));
  }, [clientFilter, currentClientName]);

  const handleToggleSort = (field: CustomerPriceListSortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const searchTokens = useMemo(() => tokenizeSearch(globalSearch), [globalSearch]);

  const filteredItems = useMemo(
    () =>
      filterAndSortEmbeddedClientItems(
        items,
        originalRowsSnapshot,
        clientFilter,
        currentClientName,
        currentClientPls,
        searchTokens,
        sortField,
        sortAsc
      ),
    [
      items,
      clientFilter,
      currentClientName,
      currentClientPls,
      searchTokens,
      sortField,
      sortAsc,
      originalRowsSnapshot,
    ]
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

  // Reset del conteggio visibile e scroll in cima al cambio di filtri
  useEffect(() => {
    setVisibleCount(CUSTOMER_LIST_BATCH_SIZE);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [globalSearch, clientFilter, currentClientName]);

  // Pre-carica elementi successivi se lo schermo è ampio e non c'è scrollbar
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight && visibleCount < filteredItems.length) {
      setVisibleCount((prev) => Math.min(prev + CUSTOMER_LIST_BATCH_SIZE, filteredItems.length));
    }
  }, [visibleCount, filteredItems.length]);

  // Salvataggio di tutte le modifiche pendenti
  const saveAllPendingChanges = useCallback(async () => {
    if (dirtyRows.size === 0) return;
    setIsSaving(true);
    try {
      const rowsToSave = Array.from(dirtyRows.values());
      await priceListRepository.saveClientRows(rowsToSave);
      void priceListSyncService.pushClientBatchToSupabase(rowsToSave);

      setOriginalRowsSnapshot((prev) => {
        const next = new Map(prev);
        for (const r of rowsToSave) {
          next.set(r.id, { ...r });
        }
        return next;
      });
      setDirtyRows(new Map());
    } catch (err) {
      console.error("Errore salvataggio modifiche listino clienti:", err);
    } finally {
      setIsSaving(false);
    }
  }, [dirtyRows]);

  // Pianificazione salvataggio automatico (5s)
  const scheduleSilentAutoSaveIfNeeded = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      void saveAllPendingChanges();
    }, 5000);
  }, [saveAllPendingChanges]);

  // Annulla ultima modifica
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

  // Scorciatoia Ctrl+Z
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

  // Applica modifica a una cella
  const applyCellChange = useCallback(
    (rowId: string, colId: string, value: string | number | null, richHtml?: string | null) => {
      if (rowId === newTopRow.id) {
        const updatedTop = updateEmbeddedClientRowWithField(newTopRow, colId, value, richHtml);
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
            clientFilter.trim() ||
            currentClientName ||
            "CLIENTE GENERICO";
          const completedRow: ListinoClienteRow = {
            ...updatedTop,
            cliente: effectiveClient,
          };

          setItems((prev) => [completedRow, ...prev]);
          setDirtyRows((prev) => {
            const next = new Map(prev);
            next.set(completedRow.id, completedRow);
            return next;
          });
          setUndoStack((uPrev) => [...uPrev.slice(-49), { rowId: completedRow.id, isNewRow: true }]);
          setNewTopRow(createBlankClientRow(effectiveClient));
          scheduleSilentAutoSaveIfNeeded();
        } else {
          setNewTopRow(updatedTop);
        }
        return;
      }

      setItems((prev) => {
        const target = prev.find((r) => r.id === rowId);
        if (!target) return prev;
        const prevSnapshot = { ...target };
        const updated = updateEmbeddedClientRowWithField(target, colId, value, richHtml);

        setUndoStack((uPrev) => [...uPrev.slice(-49), { rowId, prevRow: prevSnapshot }]);

        setDirtyRows((dirtyPrev) => {
          const next = new Map(dirtyPrev);
          next.set(rowId, updated);
          return next;
        });

        scheduleSilentAutoSaveIfNeeded();
        return prev.map((r) => (r.id === rowId ? updated : r));
      });
    },
    [newTopRow, clientFilter, currentClientName, scheduleSilentAutoSaveIfNeeded]
  );

  // Selezione ed editing cella
  const selectCell = useCallback((rowId: string, colId: string) => {
    setActiveCell({ rowId, colId });
    setEditingCell(null);
    setInitialEditChar(undefined);
  }, []);

  const startEditing = useCallback(
    (rowId: string, colId: string, char?: string) => {
      if (!canEdit) return;
      setActiveCell({ rowId, colId });
      setEditingCell({ rowId, colId });
      setInitialEditChar(char);
    },
    [canEdit]
  );

  const commitCellEdit = useCallback(
    (rowId: string, colId: string, val: string, richHtml?: string | null) => {
      applyCellChange(rowId, colId, val, richHtml);
      setEditingCell(null);
      setInitialEditChar(undefined);
    },
    [applyCellChange]
  );

  const cancelCellEdit = useCallback(() => {
    setEditingCell(null);
    setInitialEditChar(undefined);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      isEditingCell: () => editingCell !== null,
      cancelCellEdit: () => {
        cancelCellEdit();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      },
      hasUnsavedChanges: () => dirtyRows.size > 0,
      saveChanges: async () => {
        await saveAllPendingChanges();
      },
      discardChanges: () => {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }
        setItems((prev) =>
          prev
            .filter((r) => !r.id.startsWith("temp_new_"))
            .map((r) => originalRowsSnapshot.get(r.id) || r)
        );
        setDirtyRows(new Map());
        setUndoStack([]);
        setNewTopRow(createBlankClientRow(currentClientName));
        setEditingCell(null);
        setInitialEditChar(undefined);
      },
    }),
    [editingCell, cancelCellEdit, dirtyRows, saveAllPendingChanges, originalRowsSnapshot, currentClientName]
  );

  // Spostamento cella attiva (frecce, tab, enter)
  const moveActiveCell = useCallback(
    (direction: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") => {
      if (!activeCell) return;
      const visibleCols = EDITABLE_CLIENT_COL_ORDER.filter((c) => isVisible(c));
      if (visibleCols.length === 0) return;

      const allRowIds = [newTopRow.id, ...filteredItems.slice(0, visibleCount).map((r) => r.id)];
      const currentRowIdx = allRowIds.indexOf(activeCell.rowId);
      const currentColIdx = visibleCols.indexOf(activeCell.colId as any);

      if (currentRowIdx === -1 || currentColIdx === -1) return;

      let nextRowIdx = currentRowIdx;
      let nextColIdx = currentColIdx;

      switch (direction) {
        case "ArrowUp":
          if (nextRowIdx > 0) nextRowIdx -= 1;
          break;
        case "ArrowDown":
          if (nextRowIdx < allRowIds.length - 1) nextRowIdx += 1;
          break;
        case "ArrowLeft":
          if (nextColIdx > 0) nextColIdx -= 1;
          break;
        case "ArrowRight":
          if (nextColIdx < visibleCols.length - 1) nextColIdx += 1;
          break;
      }

      setActiveCell({
        rowId: allRowIds[nextRowIdx],
        colId: visibleCols[nextColIdx],
      });
      setEditingCell(null);
    },
    [activeCell, filteredItems, isVisible, newTopRow.id, visibleCount]
  );

  const handleCellKeyDown = useCallback(
    (
      e: React.KeyboardEvent,
      rowId: string,
      colId: string,
      currentValStr: string,
      currentRichHtml?: string | null
    ) => {
      const isEditing = editingCell?.rowId === rowId && editingCell?.colId === colId;

      if (!isEditing) {
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          startEditing(rowId, colId);
          return;
        }

        if (e.key === "Tab") {
          e.preventDefault();
          moveActiveCell(e.shiftKey ? "ArrowLeft" : "ArrowRight");
          return;
        }

        if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          moveActiveCell(e.key);
          return;
        }

        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          if (canEdit) applyCellChange(rowId, colId, null, null);
          return;
        }

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (canEdit) {
            startEditing(rowId, colId, e.key);
          }
          return;
        }
      } else {
        if (e.key === "Enter") {
          e.preventDefault();
          commitCellEdit(rowId, colId, currentValStr, currentRichHtml);
          moveActiveCell("ArrowDown");
          return;
        }

        if (e.key === "Tab") {
          e.preventDefault();
          commitCellEdit(rowId, colId, currentValStr, currentRichHtml);
          moveActiveCell(e.shiftKey ? "ArrowLeft" : "ArrowRight");
          return;
        }

        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          commitCellEdit(rowId, colId, currentValStr, currentRichHtml);
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

  // Ripristino articolo dal cestino
  const handleItemRestored = useCallback((restored: ListinoClienteRow) => {
    setItems((prev) => [restored, ...prev.filter((row) => row.id !== restored.id)]);
    setTrashCount((c) => Math.max(0, c - 1));
  }, []);

  // Inserimento rapido nel DDT
  const handleInsertIntoDdt = (item: ListinoClienteRow) => {
    if (!onSelectArticle) return;
    onSelectArticle({
      code: item.codice_articolo || undefined,
      description: item.descrizione,
      unit: "NR.",
      unit_price: item.prezzo_fattura || 0,
      purchase_price: 0,
      vat_rate: undefined,
    });
  };

  const unsavedCount = dirtyRows.size;

  return (
    <div
      data-avorio-customer-pricelist=""
      className={`flex flex-col overflow-hidden bg-[var(--card)] ${
        layoutMode === "horizontal" ? "flex-1 min-h-[160px]" : "flex-1 min-w-[280px]"
      }`}
    >
      {/* HEADER FINESTRA 2: Listino Clienti con tutti i pulsanti */}
      <CustomerEmbeddedHeaderBar
        filteredCount={filteredItems.length}
        clientFilter={clientFilter}
        onChangeClientFilter={setClientFilter}
        currentClientName={currentClientName}
        trashCount={trashCount}
        onOpenTrashModal={() => setIsTrashModalOpen(true)}
        columns={columns}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onResetDefaultColumns={resetDefaultColumns}
        loading={loading}
        isSaving={isSaving}
        onReload={() => void loadData()}
        canEdit={canEdit}
        undoCount={undoStack.length}
        onUndo={handleUndo}
        unsavedCount={unsavedCount}
        onSaveAllPendingChanges={() => void saveAllPendingChanges()}
      />

      {/* Datalist per autocompletamento Clienti e Fornitori */}
      <datalist id="distinct-clients-autocomplete">
        {distinctClients.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="order-suppliers-autocomplete">
        {orderSuppliers.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {/* TABELLA EDITABILE STILE EXCEL CON VIRTUAL SCROLL */}
      <div
        ref={tableContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-[var(--background)]"
      >
        <table className="w-full text-xs text-left border-collapse border-spacing-0">
          <CustomerEmbeddedTableHeader
            isVisible={isVisible}
            onToggleSort={handleToggleSort}
            canEdit={canEdit}
            newTopRow={newTopRow}
            clientFilter={clientFilter}
            currentClientName={currentClientName}
            activeCell={activeCell}
            editingCell={editingCell}
            initialEditChar={initialEditChar}
            onSelectCell={selectCell}
            onStartEdit={startEditing}
            onCommitCell={commitCellEdit}
            onCancelEdit={cancelCellEdit}
            onCellKeyDown={handleCellKeyDown}
          />

          {/* RIGHE TABELLA */}
          <tbody className="divide-y divide-[var(--border)]/30 font-mono text-xs">
            {filteredItems.slice(0, visibleCount).map((item) => {
              const isRowActive = activeCell?.rowId === item.id;
              const isRowEditing = editingCell?.rowId === item.id;

              return (
                <CustomerEmbeddedRow
                  key={item.id}
                  item={item}
                  isDirty={dirtyRows.has(item.id)}
                  isNewlyAdded={item.id.startsWith("new_") && !originalRowsSnapshot.has(item.id)}
                  activeColId={isRowActive ? activeCell.colId : null}
                  editingColId={isRowEditing ? editingCell.colId : null}
                  initialEditChar={isRowEditing ? initialEditChar : undefined}
                  canEdit={canEdit}
                  hasOnSelectArticle={Boolean(onSelectArticle)}
                  isVisible={isVisible}
                  onDeleteRow={(row) => void handleDeleteRow(row)}
                  onInsertIntoDdt={handleInsertIntoDdt}
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
      <div className="px-3 py-1.5 bg-[var(--card)] border-t border-[var(--border)] text-xs text-[var(--muted-foreground)] flex items-center justify-between flex-shrink-0 select-none">
        <span>
          Visualizzati: <strong className="text-[var(--foreground)]">{Math.min(visibleCount, filteredItems.length)}</strong> su <strong className="text-[var(--foreground)]">{filteredItems.length}</strong> voci
        </span>
        {filteredItems.length > visibleCount && (
          <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            Scorri verso il basso per caricare automaticamente
          </span>
        )}
      </div>

      {/* Cestino Modale Condiviso */}
      <CustomerPriceListTrashModal
        isOpen={isTrashModalOpen}
        onClose={() => setIsTrashModalOpen(false)}
        onItemRestored={handleItemRestored}
      />
    </div>
  );
});

CustomerPriceListEmbeddedSection.displayName = "CustomerPriceListEmbeddedSection";

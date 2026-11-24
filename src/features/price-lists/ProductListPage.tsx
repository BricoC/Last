import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useDeferredValue,
  useCallback,
} from "react";
import { formatPriceListInput } from "./utils/priceListInput";
import { ListinoGeneraleRow } from "./models/priceList";
import { priceListRepository } from "./services/priceListRepository";
import { priceListSyncService } from "./services/priceListSyncService";
import { orderRepository } from "@/features/orders/services/orderRepository";
import { ElectronicInvoicesPage } from "@/features/invoices/ElectronicInvoicesPage";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { useUserStore } from "@/shared/stores/useUserStore";
import { ItemPriceHistoryModal } from "./components/ItemPriceHistoryModal";
import { PriceListTrashModal } from "./components/PriceListTrashModal";
import { registerWindowCloseGuard, registerDirtyCheck } from "@/shared/stores/useWindowStore";
import { UnsavedChangesModal } from "@/shared/components/ui/UnsavedChangesModal";
import { useColumnVisibility } from "./hooks/useColumnVisibility";
import { useEasterEggStore } from "@/shared/easter-eggs/useEasterEggStore";
import { BulkOperationPayload } from "./components/BulkEditToolbar";
import { GeneralPriceListToolbar } from "./components/GeneralPriceListToolbar";
import { GeneralPriceListTableHeader } from "./components/GeneralPriceListTableHeader";
import { GeneralPriceListNewTopRow } from "./components/GeneralPriceListNewTopRow";
import { GeneralPriceListRow } from "./components/GeneralPriceListRow";
import { PriceListZoomControl, usePriceListZoom } from "./components/PriceListZoomControl";
import {
  applyBulkActionToGeneralRow,
  buildGeneralPriceChangeLogs,
  createBlankGeneralRow,
  EDITABLE_COL_ORDER,
  EditableColumnKey,
  filterAndSortGeneralItems,
  formatPriceListDateTime,
  PRODUCT_LIST_BATCH_SIZE,
  ProductListSortField,
  updateGeneralRowWithField,
} from "./utils/productListViewUtils";

export interface ProductListPageProps {
  windowId?: string;
}

export const ProductListPage: React.FC<ProductListPageProps> = ({ windowId }) => {
  const { currentUser } = useUserStore();
  const canEdit = Boolean(currentUser?.is_admin || currentUser?.can_edit_price_lists);

  // Visibilità Colonne personalizzata per utente
  const {
    visibleColumns,
    toggleColumn,
    resetDefaultColumns,
  } = useColumnVisibility(currentUser?.id);

  // Dati
  const [items, setItems] = useState<ListinoGeneraleRow[]>([]);
  const [totalDbCount, setTotalDbCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1 Riga vuota sempre in cima per creazione nuovi articoli
  const [newTopRow, setNewTopRow] = useState<ListinoGeneraleRow>(() => createBlankGeneralRow());

  // Tracciamento modifiche non salvate
  const [dirtyRows, setDirtyRows] = useState<Map<string, ListinoGeneraleRow>>(new Map());
  const [undoStack, setUndoStack] = useState<{ rowId: string; prevRow?: ListinoGeneraleRow; isNewRow?: boolean }[]>([]);
  const [originalRowsSnapshot, setOriginalRowsSnapshot] = useState<Map<string, ListinoGeneraleRow>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(() => {
    const saved = localStorage.getItem("price_list_last_saved_time");
    return saved ? new Date(saved) : null;
  });
  const [lastDbModTime, setLastDbModTime] = useState<Date | null>(null);
  const [lastAccessTime] = useState<Date>(() => {
    const now = new Date();
    try {
      localStorage.setItem("price_list_last_access_time", now.toISOString());
    } catch {}
    return now;
  });

  const mostRecentModTime = useMemo(() => {
    if (lastSavedTime && lastDbModTime) {
      return lastSavedTime.getTime() >= lastDbModTime.getTime() ? lastSavedTime : lastDbModTime;
    }
    return lastSavedTime || lastDbModTime;
  }, [lastSavedTime, lastDbModTime]);

  const saveButtonTooltip = useMemo(() => {
    if (dirtyRows.size > 0) {
      return `Salva subito ${dirtyRows.size} articoli modificati`;
    }
    const lines: string[] = [];
    if (mostRecentModTime) {
      lines.push(`Ultima modifica listino: ${formatPriceListDateTime(mostRecentModTime)}`);
    }
    lines.push(`Ultimo accesso al listino: ${formatPriceListDateTime(lastAccessTime)}`);
    return lines.join("\n");
  }, [dirtyRows.size, mostRecentModTime, lastAccessTime]);

  // Selezione righe per Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Ricerca rapida e ordinamento
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // MGS Easter Egg Codec
  const { openMgsCodec } = useEasterEggStore();

  const [visibleCount, setVisibleCount] = useState(PRODUCT_LIST_BATCH_SIZE);
  const [sortField, setSortField] = useState<ProductListSortField | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Cella attiva ed editing
  const [activeCell, setActiveCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [initialEditChar, setInitialEditChar] = useState<string | undefined>(undefined);

  // Modale Storico Variazioni Riga (Colonna A...)
  const [historyModalItem, setHistoryModalItem] = useState<ListinoGeneraleRow | null>(null);

  // Modale Popup Fatture Elettroniche (pre-filtrata su articolo)
  const [invoicesModalSearch, setInvoicesModalSearch] = useState<string | null>(null);

  // Fornitori unificati per Autocomplete colonna fornitore
  const [generalSuppliers, setGeneralSuppliers] = useState<string[]>([]);

  // Modale Cestino Articoli Eliminati (Max 30 FIFO)
  const [trashCount, setTrashCount] = useState<number>(0);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);

  // Riferimento container tabella
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Timer auto-save silenzioso
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Caricamento iniziale da SQLite locale con sincronizzazione incrementale Supabase in background
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const count = await priceListRepository.getGeneralCount();
      setTotalDbCount(count);
      const rows = await priceListRepository.searchGeneral("", 15000);
      setItems(rows);

      try {
        const tCount = await priceListRepository.getTrashCount();
        setTrashCount(tCount);
      } catch (e) {
        console.warn("[ProductListPage] Errore lettura conteggio cestino:", e);
      }

      try {
        const lastMod = await priceListRepository.getLastModificationTime();
        if (lastMod) {
          const modDate = new Date(lastMod);
          if (!isNaN(modDate.getTime())) {
            setLastDbModTime(modDate);
          }
        }
      } catch (e) {
        console.warn("[ProductListPage] Errore lettura data ultima modifica:", e);
      }

      // Caricamento fornitori per autocomplete
      try {
        const [orderSupps, dbSupps] = await Promise.all([
          orderRepository.getSuppliers().catch(() => []),
          priceListRepository.getDistinctGeneralSuppliers().catch(() => []),
        ]);
        const merged = Array.from(
          new Set([
            ...orderSupps.map((s) => s.name?.trim()).filter(Boolean),
            ...dbSupps,
          ])
        ).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
        setGeneralSuppliers(merged);
      } catch (e) {
        console.warn("[ProductListPage] Errore caricamento fornitori:", e);
      }

      const snapshot = new Map<string, ListinoGeneraleRow>();
      for (const r of rows) {
        snapshot.set(r.id, { ...r });
      }
      setOriginalRowsSnapshot(snapshot);
      setDirtyRows(new Map());

      // Sincronizzazione incrementale Cloud in background
      void (async () => {
        try {
          const syncRes = await priceListSyncService.syncIncrementalGeneralFromSupabase();
          if (syncRes.updatedCount > 0) {
            console.log(`[ProductListPage] Sincronizzati dal Cloud ${syncRes.updatedCount} articoli.`);
            const refreshedRows = await priceListRepository.searchGeneral("", 15000);
            setItems(refreshedRows);
            setTotalDbCount(refreshedRows.length);
            setOriginalRowsSnapshot((prev) => {
              const next = new Map(prev);
              for (const r of syncRes.updatedRows) {
                next.set(r.id, { ...r });
              }
              return next;
            });
            const lastMod = await priceListRepository.getLastModificationTime();
            if (lastMod) {
              setLastDbModTime(new Date(lastMod));
            }
          }
        } catch (err) {
          console.warn("[ProductListPage] Sync incrementale cloud in background fallito:", err);
        }
      })();
    } catch (err) {
      console.error("Errore caricamento listino generale da SQLite:", err);
      setError(err instanceof Error ? err.message : "Errore lettura database locale.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenInvoices = useCallback((item: ListinoGeneraleRow) => {
    const searchKey = item.codice_articolo?.trim() || item.descrizione?.trim() || "";
    setInvoicesModalSearch(searchKey);
  }, []);

  // Controllo automatico aggiornamenti Cloud al ritorno su finestra/rete o dopo Cloud Sync globale
  useEffect(() => {
    let lastFocusCheck = Date.now();
    const refreshGeneralFromSqlite = async () => {
      const refreshedRows = await priceListRepository.searchGeneral("", 15000);
      setItems(refreshedRows);
      setTotalDbCount(refreshedRows.length);
      setOriginalRowsSnapshot(new Map(refreshedRows.map((r) => [r.id, { ...r }])));
      const lastMod = await priceListRepository.getLastModificationTime().catch(() => null);
      if (lastMod) {
        const modDate = new Date(lastMod);
        if (!isNaN(modDate.getTime())) setLastDbModTime(modDate);
      }
    };

    const handleAutoSync = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const now = Date.now();
      if (now - lastFocusCheck > 30000 && dirtyRows.size === 0) {
        lastFocusCheck = now;
        priceListSyncService
          .syncIncrementalGeneralFromSupabase()
          .then((res) => {
            if (res.updatedCount > 0) {
              void refreshGeneralFromSqlite();
            }
          })
          .catch(() => {});
      }
    };

    const handleGlobalCloudSync = () => {
      if (dirtyRows.size === 0) {
        void refreshGeneralFromSqlite().catch(() => {});
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

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Scorciatoia F4 per ricerca rapida
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
      filterAndSortGeneralItems(
        items,
        originalRowsSnapshot,
        searchTokens,
        sortField,
        sortAsc
      ),
    [items, originalRowsSnapshot, searchTokens, sortField, sortAsc]
  );

  // Gestione scroll infinito
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 300) {
      setVisibleCount((prev) => Math.min(prev + PRODUCT_LIST_BATCH_SIZE, filteredItems.length));
    }
  };

  const handleToggleSort = (field: ProductListSortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Salvataggio effettivo
  const saveAllPendingChanges = useCallback(async () => {
    if (dirtyRows.size === 0 || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const rowsToSave = Array.from(dirtyRows.values());
      const nowIso = new Date().toISOString();
      const operatorName = currentUser?.name || currentUser?.station_name || "Operatore";
      const logEntries = buildGeneralPriceChangeLogs(
        rowsToSave,
        originalRowsSnapshot,
        operatorName,
        nowIso
      );

      await priceListRepository.saveGeneralRows(rowsToSave);

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
      const now = new Date();
      setLastSavedTime(now);
      try {
        localStorage.setItem("price_list_last_saved_time", now.toISOString());
      } catch {}

      void priceListSyncService.pushGeneralBatchToSupabase(rowsToSave).catch((e) => {
        console.warn("[ProductListPage] Push Supabase asincrono non riuscito:", e);
      });
    } catch (err: any) {
      console.error("[ProductListPage] Errore salvataggio:", err);
      setError(`Errore salvataggio: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  }, [dirtyRows, isSaving, originalRowsSnapshot, currentUser]);

  // Gestione timer auto-save silenzioso (predefinito: 30 minuti)
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

  // Gestione popup blocco chiusura per modifiche non salvate
  const [closePrompt, setClosePrompt] = useState<((choice: "save" | "discard" | "cancel") => void) | null>(null);

  const confirmIfDirty = useCallback(async (): Promise<boolean> => {
    if (dirtyRows.size === 0) return true;
    const choice = await new Promise<"save" | "discard" | "cancel">((resolve) => setClosePrompt(() => resolve));
    setClosePrompt(null);
    if (choice === "discard") {
      setDirtyRows(new Map());
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
    (rowId: string, colId: string, value: string | number | null, richHtml?: string | null) => {
      if (rowId === newTopRow.id) {
        const updatedTop = updateGeneralRowWithField(newTopRow, colId, value, richHtml);

        const hasData = Boolean(
          updatedTop.descrizione?.trim() ||
            updatedTop.codice_articolo?.trim() ||
            updatedTop.prezzo_acquisto != null ||
            updatedTop.prezzo_fattura != null
        );

        if (hasData) {
          setItems((prev) => {
            const newOnes = prev.filter((r) => r.id.startsWith("new_") || !originalRowsSnapshot.has(r.id));
            const dbOnes = prev.filter((r) => !r.id.startsWith("new_") && originalRowsSnapshot.has(r.id));
            return [...newOnes, updatedTop, ...dbOnes];
          });
          setDirtyRows((prev) => {
            const next = new Map(prev);
            next.set(updatedTop.id, updatedTop);
            return next;
          });
          setUndoStack((uPrev) => [...uPrev.slice(-49), { rowId: updatedTop.id, isNewRow: true }]);
          setNewTopRow(createBlankGeneralRow());
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
          const updated = updateGeneralRowWithField(r, colId, value, richHtml);
          setDirtyRows((dirtyPrev) => {
            const next = new Map(dirtyPrev);
            next.set(rowId, updated);
            return next;
          });
          return updated;
        })
      );
      scheduleSilentAutoSaveIfNeeded();
    },
    [newTopRow, scheduleSilentAutoSaveIfNeeded, originalRowsSnapshot]
  );

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

  const isKeyboardNavRef = useRef(false);

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

  const [tableZoom, setTableZoom] = usePriceListZoom("price_list_zoom_general");

  const commitCellEdit = useCallback(
    (rowId: string, colId: string, committedValue: string, richHtml?: string | null) => {
      applyCellChange(rowId, colId, committedValue, richHtml);
      setEditingCell(null);
      setInitialEditChar(undefined);
    },
    [applyCellChange]
  );

  const cancelCellEdit = useCallback(() => {
    setEditingCell(null);
    setInitialEditChar(undefined);
  }, []);

  const moveActiveCell = useCallback(
    (direction: "ArrowDown" | "ArrowUp" | "ArrowLeft" | "ArrowRight") => {
      if (!activeCell) return;
      const allVisibleCols = EDITABLE_COL_ORDER.filter((c) => visibleColumns[c] !== false);
      const colIdx = allVisibleCols.indexOf(activeCell.colId as EditableColumnKey);
      const allRows = [newTopRow, ...filteredItems.slice(0, visibleCount)];
      const rowIdx = allRows.findIndex((r) => r.id === activeCell.rowId);

      if (rowIdx === -1 || colIdx === -1) return;

      if (direction === "ArrowDown" && rowIdx < allRows.length - 1) {
        selectCell(allRows[rowIdx + 1].id, activeCell.colId, true);
      } else if (direction === "ArrowUp" && rowIdx > 0) {
        selectCell(allRows[rowIdx - 1].id, activeCell.colId, true);
      } else if (direction === "ArrowRight" && colIdx < allVisibleCols.length - 1) {
        selectCell(activeCell.rowId, allVisibleCols[colIdx + 1], true);
      } else if (direction === "ArrowLeft" && colIdx > 0) {
        selectCell(activeCell.rowId, allVisibleCols[colIdx - 1], true);
      }
    },
    [activeCell, visibleColumns, newTopRow, filteredItems, visibleCount, selectCell]
  );

  const handleCellKeyDown = useCallback(
    (
      e: React.KeyboardEvent,
      rowId: string,
      colId: string,
      currentValStr: string,
      currentRichHtml?: string | null
    ) => {
      const isEditing = Boolean(editingCell && editingCell.rowId === rowId && editingCell.colId === colId);
      const allVisibleCols = EDITABLE_COL_ORDER.filter((c) => visibleColumns[c] !== false);
      const colIdx = allVisibleCols.indexOf(colId as EditableColumnKey);
      const allRows = [newTopRow, ...filteredItems.slice(0, visibleCount)];
      const rowIdx = allRows.findIndex((r) => r.id === rowId);

      if (e.key === "Enter") {
        e.preventDefault();
        if (isEditing) {
          commitCellEdit(rowId, colId, currentValStr, currentRichHtml);
          if (rowIdx < allRows.length - 1) {
            selectCell(allRows[rowIdx + 1].id, colId, true);
          }
        } else {
          startEditing(rowId, colId);
        }
      } else if (e.key === "F2") {
        e.preventDefault();
        if (!isEditing) {
          startEditing(rowId, colId);
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (isEditing) {
          commitCellEdit(rowId, colId, currentValStr, currentRichHtml);
        }
        if (e.shiftKey) {
          if (colIdx > 0) {
            selectCell(rowId, allVisibleCols[colIdx - 1], true);
          } else if (rowIdx > 0) {
            const prevRow = allRows[rowIdx - 1];
            selectCell(prevRow.id, allVisibleCols[allVisibleCols.length - 1], true);
          }
        } else {
          if (colIdx < allVisibleCols.length - 1) {
            selectCell(rowId, allVisibleCols[colIdx + 1], true);
          } else if (rowIdx < allRows.length - 1) {
            const nextRow = allRows[rowIdx + 1];
            selectCell(nextRow.id, allVisibleCols[0], true);
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelCellEdit();
      } else if (isEditing && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        commitCellEdit(rowId, colId, currentValStr, currentRichHtml);
        if (e.key === "ArrowDown" && rowIdx < allRows.length - 1) {
          selectCell(allRows[rowIdx + 1].id, colId, true);
        } else if (e.key === "ArrowUp" && rowIdx > 0) {
          selectCell(allRows[rowIdx - 1].id, colId, true);
        }
      } else if (!isEditing) {
        if (e.key === "ArrowDown" && rowIdx < allRows.length - 1) {
          e.preventDefault();
          e.stopPropagation();
          selectCell(allRows[rowIdx + 1].id, colId, true);
        } else if (e.key === "ArrowUp" && rowIdx > 0) {
          e.preventDefault();
          e.stopPropagation();
          selectCell(allRows[rowIdx - 1].id, colId, true);
        } else if (e.key === "ArrowRight" && colIdx < allVisibleCols.length - 1) {
          e.preventDefault();
          e.stopPropagation();
          selectCell(rowId, allVisibleCols[colIdx + 1], true);
        } else if (e.key === "ArrowLeft" && colIdx > 0) {
          e.preventDefault();
          e.stopPropagation();
          selectCell(rowId, allVisibleCols[colIdx - 1], true);
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (canEdit && colId !== "data_ref") {
            e.preventDefault();
            e.stopPropagation();
            startEditing(rowId, colId, e.key);
          }
        }
      }
    },
    [
      editingCell,
      visibleColumns,
      newTopRow,
      filteredItems,
      visibleCount,
      commitCellEdit,
      selectCell,
      startEditing,
      cancelCellEdit,
      canEdit,
    ]
  );

  // Incolla stile Excel
  const handleGridPaste = (e: React.ClipboardEvent) => {
    if (!canEdit || !activeCell || editingCell) return;
    const clipText = e.clipboardData.getData("text/plain");
    if (!clipText) return;

    e.preventDefault();
    const rows = clipText.split(/\r?\n/).filter((line) => line.length > 0);
    if (rows.length === 0) return;

    const allVisibleCols = EDITABLE_COL_ORDER.filter((c) => visibleColumns[c] !== false);
    const startColIdx = allVisibleCols.indexOf(activeCell.colId as EditableColumnKey);
    if (startColIdx === -1) return;

    const allRows = [newTopRow, ...filteredItems];
    const startRowIdx = allRows.findIndex((r) => r.id === activeCell.rowId);
    if (startRowIdx === -1) return;

    rows.forEach((rowStr, rOffset) => {
      const targetRowIdx = startRowIdx + rOffset;
      const cells = rowStr.split("\t");

      let targetRow: ListinoGeneraleRow;
      if (targetRowIdx < allRows.length) {
        targetRow = allRows[targetRowIdx];
      } else {
        targetRow = createBlankGeneralRow();
        setItems((prev) => [...prev, targetRow]);
      }

      cells.forEach((cellVal, cOffset) => {
        const targetColIdx = startColIdx + cOffset;
        if (targetColIdx < allVisibleCols.length) {
          const colId = allVisibleCols[targetColIdx];
          applyCellChange(targetRow.id, colId, cellVal.trim());
        }
      });
    });
  };

  // Copia TSV
  const handleGridCopy = (e: React.KeyboardEvent) => {
    if (e.key === "c" && (e.ctrlKey || e.metaKey) && !editingCell) {
      if (selectedIds.size > 0) {
        e.preventDefault();
        const selectedRows = items.filter((r) => selectedIds.has(r.id));
        const allVisibleCols = EDITABLE_COL_ORDER.filter((c) => visibleColumns[c] !== false);
        const tsv = selectedRows
          .map((r) => allVisibleCols.map((col) => formatPriceListInput(r[col], col)).join("\t"))
          .join("\n");
        void navigator.clipboard.writeText(tsv);
      } else if (activeCell) {
        e.preventDefault();
        const allRows = [newTopRow, ...filteredItems];
        const row = allRows.find((r) => r.id === activeCell.rowId);
        if (row) {
          const val = formatPriceListInput(row[activeCell.colId as EditableColumnKey], activeCell.colId);
          void navigator.clipboard.writeText(val);
        }
      }
    }
  };

  // Applicazione Bulk Action da Toolbar
  const handleApplyBulkAction = async (payload: BulkOperationPayload) => {
    if (!canEdit || selectedIds.size === 0) return;

    if (payload.action === "delete") {
      const idsToDelete = Array.from(selectedIds);
      const rowsToDelete = items.filter((r) => selectedIds.has(r.id));
      const opName = currentUser?.name || "Admin";
      await priceListRepository.moveToTrash(rowsToDelete, opName);
      setItems((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      setTotalDbCount((prev) => Math.max(0, prev - idsToDelete.length));
      try {
        const tCount = await priceListRepository.getTrashCount();
        setTrashCount(tCount);
      } catch {}
      setDirtyRows((prev) => {
        const next = new Map(prev);
        idsToDelete.forEach((id) => next.delete(id));
        return next;
      });
      setSelectedIds(new Set());
      void priceListSyncService.flushTrash("listino_generale").catch(console.warn);
      return;
    }

    setItems((prev) =>
      prev.map((r) => {
        if (!selectedIds.has(r.id)) return r;
        const updated = applyBulkActionToGeneralRow(r, payload);
        setDirtyRows((dirtyPrev) => {
          const next = new Map(dirtyPrev);
          next.set(updated.id, updated);
          return next;
        });
        return updated;
      })
    );

    setSelectedIds(new Set());
    scheduleSilentAutoSaveIfNeeded();
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleToggleSelectRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Spostamento immediato di una singola riga nel Cestino (FIFO max 50) SENZA POPUP
  const handleDeleteRow = useCallback(
    async (row: ListinoGeneraleRow) => {
      if (!canEdit) return;
      try {
        const opName = currentUser?.name || "Admin";
        await priceListRepository.moveToTrash([row], opName);
        setItems((prev) => prev.filter((r) => r.id !== row.id));
        setTotalDbCount((prev) => Math.max(0, prev - 1));
        setTrashCount((prev) => Math.min(50, prev + 1));
        setDirtyRows((prev) => {
          const next = new Map(prev);
          next.delete(row.id);
          return next;
        });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
        void priceListSyncService.flushTrash("listino_generale").catch(console.warn);
      } catch (err: any) {
        console.error("Errore spostamento nel cestino:", err);
        setError(`Errore eliminazione articolo: ${err?.message || err}`);
      }
    },
    [canEdit, currentUser]
  );

  // Ripristino di un articolo dal Cestino nel Listino Generale attivo
  const handleItemRestored = useCallback((restoredItem: ListinoGeneraleRow) => {
    setItems((prev) => [restoredItem, ...prev]);
    setTotalDbCount((prev) => prev + 1);
    setTrashCount((prev) => Math.max(0, prev - 1));
    void priceListSyncService.flushTrash("listino_generale").catch(console.warn);
  }, []);

  return (
    <div
      ref={tableContainerRef}
      onPaste={handleGridPaste}
      onKeyDown={handleGridCopy}
      className="flex flex-col h-full bg-[var(--background)] text-[var(--foreground)] select-none outline-none"
      tabIndex={0}
    >
      {/* Autocomplete Datalist per Fornitori Listino Generale */}
      <datalist id="general-suppliers-autocomplete">
        {generalSuppliers.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {/* 1. Header Toolbar + BulkEditToolbar + Error Banner */}
      <GeneralPriceListToolbar
        search={search}
        onChangeSearch={(value) => {
          setSearch(value);
          setVisibleCount(PRODUCT_LIST_BATCH_SIZE);
        }}
        onSearchFocus={() => setActiveCell(null)}
        searchInputRef={searchInputRef}
        onOpenMgsCodec={openMgsCodec}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onResetDefaultColumns={resetDefaultColumns}
        canEdit={canEdit}
        undoCount={undoStack.length}
        onUndo={handleUndo}
        dirtyCount={dirtyRows.size}
        onDiscardAllChanges={handleDiscardAllChanges}
        isSaving={isSaving}
        saveButtonTooltip={saveButtonTooltip}
        onSaveAllPendingChanges={() => void saveAllPendingChanges()}
        trashCount={trashCount}
        onOpenTrashModal={() => setIsTrashModalOpen(true)}
        totalDbCount={totalDbCount}
        selectedCount={selectedIds.size}
        totalFilteredCount={filteredItems.length}
        onClearSelection={() => setSelectedIds(new Set())}
        onSelectAllFiltered={() => setSelectedIds(new Set(filteredItems.map((i) => i.id)))}
        onApplyBulkAction={handleApplyBulkAction}
        error={error}
        onClearError={() => setError(null)}
      />

      {/* 2. Griglia Interattiva Excel-Like */}
      <div
        tabIndex={0}
        className="flex-1 overflow-auto bg-[var(--card)] divide-y divide-[var(--border)]/40 focus:outline-none"
        onScroll={handleScroll}
        onKeyDown={(e) => {
          if (!editingCell && activeCell && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            moveActiveCell(e.key as any);
          }
        }}
      >
        <table
          className="w-full border-collapse text-left text-xs whitespace-nowrap"
          style={{ zoom: `${tableZoom}%` }}
        >
          <GeneralPriceListTableHeader
            visibleColumns={visibleColumns}
            canEdit={canEdit}
            allSelected={selectedIds.size > 0 && selectedIds.size === filteredItems.length}
            onToggleSelectAll={handleToggleSelectAll}
            onToggleSort={handleToggleSort}
          />

          <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11.5px]">
            {canEdit && (
              <GeneralPriceListNewTopRow
                newTopRow={newTopRow}
                activeCell={activeCell}
                editingCell={editingCell}
                initialEditChar={initialEditChar}
                canEdit={canEdit}
                visibleColumns={visibleColumns}
                onSelectCell={selectCell}
                onStartEdit={startEditing}
                onCommitCell={commitCellEdit}
                onCancelEdit={cancelCellEdit}
                onCellKeyDown={handleCellKeyDown}
              />
            )}

            {filteredItems.slice(0, visibleCount).map((item) => {
              const isDirty = dirtyRows.has(item.id);
              const isSelected = selectedIds.has(item.id);
              const isRowActive = activeCell?.rowId === item.id;
              const isRowEditing = editingCell?.rowId === item.id;

              return (
                <GeneralPriceListRow
                  key={item.id}
                  item={item}
                  isDirty={isDirty}
                  isSelected={isSelected}
                  isRowActive={isRowActive}
                  shouldScroll={isRowActive && isKeyboardNavRef.current}
                  activeColId={isRowActive ? activeCell.colId : null}
                  editingColId={isRowEditing ? editingCell.colId : null}
                  initialEditChar={isRowEditing ? initialEditChar : undefined}
                  canEdit={canEdit}
                  visibleColumns={visibleColumns}
                  onToggleSelectRow={handleToggleSelectRow}
                  onOpenHistory={setHistoryModalItem}
                  onOpenInvoices={handleOpenInvoices}
                  onDeleteRow={handleDeleteRow}
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

        {filteredItems.length === 0 && !loading && (
          <div className="p-12 text-center text-xs text-[var(--muted-foreground)]">
            Nessun articolo corrispondente ai criteri di ricerca.
          </div>
        )}
      </div>

      {/* 3. Footer */}
      <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-[11px] text-[var(--muted-foreground)] font-mono">
        <span>
          Visualizzati: {Math.min(visibleCount, filteredItems.length)} su {filteredItems.length} filtrati (Totale DB: {totalDbCount})
        </span>
        <PriceListZoomControl zoom={tableZoom} onChangeZoom={setTableZoom} />
      </div>

      <ItemPriceHistoryModal
        isOpen={Boolean(historyModalItem)}
        onClose={() => setHistoryModalItem(null)}
        item={historyModalItem}
        originalItem={historyModalItem ? originalRowsSnapshot.get(historyModalItem.id) : undefined}
        pendingItem={historyModalItem ? dirtyRows.get(historyModalItem.id) : undefined}
      />

      <PriceListTrashModal
        isOpen={isTrashModalOpen}
        onClose={() => setIsTrashModalOpen(false)}
        onItemRestored={handleItemRestored}
      />

      <UnsavedChangesModal
        isOpen={Boolean(closePrompt)}
        title="Listino Generale con modifiche non salvate"
        message={`Attenzione: sono presenti ${dirtyRows.size} articoli modificati non ancora salvati. Se esci senza salvare, le modifiche apportate andranno perse definitivamente.`}
        onCancel={() => closePrompt?.("cancel")}
        onDiscard={() => closePrompt?.("discard")}
        onSave={() => closePrompt?.("save")}
        saveLabel="Salva e Chiudi"
        discardLabel="Non salvare ed Esci"
        cancelLabel="Annulla"
        isSaving={isSaving}
      />

      {/* Modale Popup Fatture Elettroniche (pre-filtrata sull'articolo selezionato) */}
      {invoicesModalSearch !== null && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setInvoicesModalSearch(null)}
        >
          <div
            className="w-full h-full max-w-[1780px] max-h-[96vh] bg-[var(--background)] border border-slate-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            <ElectronicInvoicesPage
              initialSearch={invoicesModalSearch}
              isModal={true}
              onClose={() => setInvoicesModalSearch(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  memo,
} from "react";
import {
  Trash2,
  RefreshCw,
  RotateCcw,
  Save,
  Plus,
  X,
  ArrowUpDown,
} from "lucide-react";
import { ListinoClienteRow } from "../models/priceList";
import { priceListRepository } from "../services/priceListRepository";
import { priceListSyncService } from "../services/priceListSyncService";
import { orderRepository } from "@/features/orders/services/orderRepository";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { useUserStore } from "@/shared/stores/useUserStore";
import { CustomerPriceListTrashModal } from "./CustomerPriceListTrashModal";
import { useClientColumnVisibility } from "../hooks/useColumnVisibility";
import { ColumnVisibilityMenu } from "./ColumnVisibilityMenu";
import { round5 } from "../utils/priceFormulas";
import { isClientMatching } from "@/features/ddt-studio/utils/clientPriceListMatcher";

const BATCH_SIZE = 150;

type SortField =
  | "cliente"
  | "fornitore"
  | "codice_articolo"
  | "data_ref"
  | "descrizione"
  | "prezzo_fattura"
  | "perc_acquisto"
  | "acquisto_eur"
  | "data_acquisto"
  | "acquisto_old"
  | "ricarico";

const EDITABLE_CLIENT_COL_ORDER = [
  "cliente",
  "fornitore",
  "codice_articolo",
  "descrizione",
  "prezzo_fattura",
  "perc_acquisto",
  "acquisto_eur",
  "data_acquisto",
  "acquisto_old",
  "note",
  "note1",
  "note2",
];

function getTodayAaaaMmGg(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function createBlankClientRow(defaultClient?: string): ListinoClienteRow {
  return {
    id: `new_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    cliente: defaultClient || "",
    fornitore: "",
    codice_articolo: "",
    descrizione: "",
    prezzo_fattura: null,
    prezzo_acquisto: null,
    acquisto_eur: null,
    perc_acquisto: null,
    data_acquisto: null,
    acquisto_old: "",
    ricarico: null,
    data_ref: getTodayAaaaMmGg(),
    note: "",
    note1: null,
    note2: null,
  };
}

function formatEuro(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  return `€ ${val.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

function formatPercent(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  return `${val.toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

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

export const CustomerPriceListEmbeddedSection: React.FC<CustomerPriceListEmbeddedSectionProps> = ({
  currentClientName,
  currentClientPls,
  globalSearch = "",
  layoutMode = "horizontal",
  onSelectArticle,
}) => {
  const { currentUser } = useUserStore();
  const canEdit = Boolean(currentUser?.is_admin || currentUser?.can_edit_price_lists);

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
  const [sortField, setSortField] = useState<SortField>("descrizione");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Cestino & Paginazione
  const [trashCount, setTrashCount] = useState<number>(0);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

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

  // Ordinamento colonne
  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Filtraggio articoli
  const searchTokens = useMemo(() => tokenizeSearch(globalSearch), [globalSearch]);

  const filteredItems = useMemo(() => {
    let result = items;

    // 1. Filtro Cliente
    const effectiveFilter = clientFilter.trim();
    if (effectiveFilter) {
      const filterClean = effectiveFilter;
      const matchesCurrentClient = currentClientName && isClientMatching(filterClean, currentClientName);

      result = result.filter((item) => {
        if (matchesCurrentClient && currentClientPls && currentClientPls.has(item.cliente.toUpperCase())) {
          return true;
        }
        if (isClientMatching(filterClean, item.cliente)) {
          return true;
        }
        const rawCli = item.cliente.toLowerCase();
        const cleanCli = item.cliente.replace(/^LIST_/, "").toLowerCase();
        const normCli = `${rawCli} ${cleanCli}`;
        const clientTokens = tokenizeSearch(filterClean);
        return clientTokens.every((tok) => normCli.includes(tok));
      });
    } else if (currentClientName && currentClientName.trim()) {
      // Nessun filtro digitato manualmente: mostra automaticamente il listino associato al cliente del DDT
      result = result.filter((item) => {
        if (currentClientPls && currentClientPls.has(item.cliente.toUpperCase())) {
          return true;
        }
        return isClientMatching(currentClientName, item.cliente);
      });
    }

    // 2. Ricerca globale di Alex
    if (searchTokens.length > 0) {
      result = result.filter((item) => {
        const text = `${item.cliente} ${item.fornitore || ""} ${item.descrizione} ${item.codice_articolo || ""} ${item.note || ""}`.toLowerCase();
        return searchTokens.every((token) => text.includes(token));
      });
    }

    // 3. Ordinamento
    const newItems = result.filter((i) => i.id.startsWith("new_") && !originalRowsSnapshot.has(i.id));
    const dbItems = result.filter((i) => !i.id.startsWith("new_") || originalRowsSnapshot.has(i.id));

    dbItems.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (valA == null) valA = "";
      if (valB == null) valB = "";

      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }

      return sortAsc
        ? String(valA).localeCompare(String(valB), "it", { numeric: true })
        : String(valB).localeCompare(String(valA), "it", { numeric: true });
    });

    return [...newItems, ...dbItems];
  }, [
    items,
    clientFilter,
    currentClientName,
    currentClientPls,
    searchTokens,
    sortField,
    sortAsc,
    originalRowsSnapshot,
  ]);

  // Aggiornamento campi con formule dinamiche bidirezionali e data automatica
  const updateRowWithField = useCallback(
    (
      row: ListinoClienteRow,
      field: string,
      rawValue: string | number | null
    ): ListinoClienteRow => {
      const updated = { ...row };

      const parseNumberInput = (v: string | number | null): number | null => {
        if (v == null) return null;
        if (typeof v === "number") return isNaN(v) ? null : round5(v);
        const s = v.trim().replace(/€/g, "").replace(/%/g, "").trim();
        if (!s) return null;
        let normalized = s;
        if (s.includes(",") && s.includes(".")) {
          normalized = s.replace(/\./g, "").replace(",", ".");
        } else if (s.includes(",")) {
          normalized = s.replace(",", ".");
        }
        const num = parseFloat(normalized);
        return isNaN(num) ? null : round5(num);
      };

      const today = getTodayAaaaMmGg();
      updated.data_ref = today;

      switch (field) {
        case "cliente":
          updated.cliente = String(rawValue || "").trim();
          break;
        case "fornitore":
          updated.fornitore = String(rawValue || "").trim() || null;
          break;
        case "codice_articolo":
          updated.codice_articolo = String(rawValue || "").trim() || null;
          break;
        case "descrizione":
          updated.descrizione = String(rawValue || "").trim();
          break;
        case "data_acquisto":
          updated.data_acquisto = String(rawValue || "").trim() || null;
          break;
        case "acquisto_old":
          updated.acquisto_old = String(rawValue || "").trim() || null;
          break;
        case "note":
          updated.note = String(rawValue || "").trim() || null;
          break;
        case "note1":
          updated.note1 = String(rawValue || "").trim() || null;
          break;
        case "note2":
          updated.note2 = String(rawValue || "").trim() || null;
          break;

        case "perc_acquisto": {
          const newPerc = parseNumberInput(rawValue);
          updated.perc_acquisto = newPerc;
          if (updated.acquisto_eur != null && newPerc != null) {
            updated.prezzo_fattura = round5(updated.acquisto_eur * (1 + newPerc / 100));
          } else if (newPerc == null) {
            // Se % acquisto cancellata, non azzera forzatamente prezzo_fattura
          }
          break;
        }

        case "prezzo_fattura": {
          const newVendita = parseNumberInput(rawValue);
          updated.prezzo_fattura = newVendita;
          if (updated.acquisto_eur != null && updated.acquisto_eur > 0 && newVendita != null) {
            const perc = ((newVendita - updated.acquisto_eur) / updated.acquisto_eur) * 100;
            updated.perc_acquisto = round5(perc);
          }
          break;
        }

        case "acquisto_eur": {
          const newAcq = parseNumberInput(rawValue);
          updated.acquisto_eur = newAcq;
          if (!updated.data_acquisto && newAcq != null) {
            updated.data_acquisto = today;
          }
          if (newAcq != null && updated.perc_acquisto != null) {
            updated.prezzo_fattura = round5(newAcq * (1 + updated.perc_acquisto / 100));
          } else if (newAcq != null && updated.prezzo_fattura != null && newAcq > 0) {
            const perc = ((updated.prezzo_fattura - newAcq) / newAcq) * 100;
            updated.perc_acquisto = round5(perc);
          }
          break;
        }

        case "ricarico": {
          const newRic = parseNumberInput(rawValue);
          updated.ricarico = newRic;
          break;
        }

        default:
          (updated as any)[field] = rawValue;
      }

      return updated;
    },
    []
  );

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
    (rowId: string, colId: string, value: string | number | null) => {
      if (rowId === newTopRow.id) {
        const updatedTop = updateRowWithField(newTopRow, colId, value);
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
        const updated = updateRowWithField(target, colId, value);

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
    [newTopRow, updateRowWithField, clientFilter, currentClientName, scheduleSilentAutoSaveIfNeeded]
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
    (rowId: string, colId: string, val: string) => {
      applyCellChange(rowId, colId, val);
      setEditingCell(null);
      setInitialEditChar(undefined);
    },
    [applyCellChange]
  );

  const cancelCellEdit = useCallback(() => {
    setEditingCell(null);
    setInitialEditChar(undefined);
  }, []);

  // Spostamento cella attiva (frecce, tab, enter)
  const moveActiveCell = useCallback(
    (direction: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") => {
      if (!activeCell) return;
      const visibleCols = EDITABLE_CLIENT_COL_ORDER.filter((c) => isVisible(c));
      if (visibleCols.length === 0) return;

      const allRowIds = [newTopRow.id, ...filteredItems.slice(0, visibleCount).map((r) => r.id)];
      const currentRowIdx = allRowIds.indexOf(activeCell.rowId);
      const currentColIdx = visibleCols.indexOf(activeCell.colId);

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
    (e: React.KeyboardEvent, rowId: string, colId: string, currentValStr: string) => {
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
          if (canEdit) applyCellChange(rowId, colId, null);
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
        setItems((prev) => prev.filter((r) => r.id !== row.id));
        setDirtyRows((prev) => {
          const next = new Map(prev);
          next.delete(row.id);
          return next;
        });

        if (!row.id.startsWith("new_")) {
          const operatorName = currentUser?.name || currentUser?.station_name || "Operatore";
          const trashEntries = await priceListRepository.moveToClientTrash([row], operatorName);
          setTrashCount((c) => Math.min(50, c + 1));
          void priceListSyncService.pushClientTrashBatchToSupabase(trashEntries);
          void priceListSyncService.deleteClientRowsFromSupabase([row.id]);
        }
      } catch (err) {
        console.error("Errore cancellazione articolo:", err);
      }
    },
    [currentUser]
  );

  // Ripristino articolo dal cestino
  const handleItemRestored = useCallback((restored: ListinoClienteRow) => {
    setItems((prev) => [restored, ...prev]);
    setTrashCount((c) => Math.max(0, c - 1));
  }, []);

  // Inserimento rapido nel DDT (tramite pulsante o doppio clic su cella non in modifica)
  const handleInsertIntoDdt = (item: ListinoClienteRow) => {
    if (!onSelectArticle) return;
    onSelectArticle({
      code: item.codice_articolo || undefined,
      description: item.descrizione,
      unit: "NR.",
      unit_price: item.prezzo_fattura || 0,
      purchase_price: item.acquisto_eur || item.prezzo_acquisto || 0,
      vat_rate: 22,
    });
  };

  const unsavedCount = dirtyRows.size;

  return (
    <div
      className={`flex flex-col overflow-hidden bg-[var(--card)] ${
        layoutMode === "horizontal" ? "flex-1 min-h-[160px]" : "flex-1 min-w-[280px]"
      }`}
    >
      {/* HEADER FINESTRA 2: Listino Clienti con tutti i pulsanti */}
      <div className="px-3 py-1.5 bg-amber-950/40 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-300 shrink-0 gap-2 flex-wrap select-none">
        {/* Sinistra: Titolo e Conteggio Voci */}
        <div className="flex items-center space-x-2">
          <span className="font-bold whitespace-nowrap flex items-center space-x-1.5">
            <span className="text-sm">Listino Clienti</span>
            <span className="text-[11px] opacity-80 font-normal">
              ({filteredItems.length} voci)
            </span>
          </span>
        </div>

        {/* Centro/Destra: Filtro Cliente + Pulsanti Azione */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          {/* Filtro Cliente */}
          <div className="flex items-center space-x-1.5">
            <span className="text-xs text-[var(--muted-foreground)] font-semibold">Filtro:</span>
            <div className="relative">
              <input
                type="text"
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                placeholder={currentClientName ? `Filtro: ${currentClientName}` : "Cerca cliente..."}
                className="pl-2.5 pr-6 py-0.5 text-xs bg-[var(--background)] border border-amber-500/40 rounded text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none w-48 font-medium"
              />
              {clientFilter && (
                <button
                  type="button"
                  onClick={() => setClientFilter("")}
                  className="absolute right-1.5 top-1 text-[var(--muted-foreground)] hover:text-white"
                  title="Azzera filtro"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="h-4 w-px bg-amber-500/30" />

          {/* 1. Cestino */}
          <button
            type="button"
            onClick={() => setIsTrashModalOpen(true)}
            className="flex items-center space-x-1.5 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-xs font-semibold text-[var(--foreground)] transition-colors cursor-pointer"
            title="Cestino articoli eliminati"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Cestino</span>
            {trashCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-400 border border-rose-500/30">
                {trashCount}
              </span>
            )}
          </button>

          {/* 2. Menu Colonne */}
          <ColumnVisibilityMenu
            columns={columns}
            visibleColumns={visibleColumns}
            onToggleColumn={toggleColumn}
            onResetDefault={resetDefaultColumns}
          />

          {/* 3. Ricarica */}
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading || isSaving}
            className="p-1 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
            title="Ricarica da database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          {/* 4. Annulla Modifiche */}
          {canEdit && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-xs font-semibold transition-colors ${
                undoStack.length > 0
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 cursor-pointer"
                  : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] opacity-50 cursor-not-allowed"
              }`}
              title="Annulla ultima modifica (Ctrl+Z)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Annulla {undoStack.length > 0 ? `(${undoStack.length})` : ""}</span>
            </button>
          )}

          {/* 5. Salva Modifiche */}
          {canEdit && (
            <button
              type="button"
              onClick={() => void saveAllPendingChanges()}
              disabled={unsavedCount === 0 && !isSaving}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md border text-xs font-bold transition-all ${
                unsavedCount > 0
                  ? "bg-amber-600 hover:bg-amber-500 text-white border-amber-400 shadow-md animate-pulse cursor-pointer"
                  : "bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] opacity-60 cursor-not-allowed"
              }`}
              title="Salva tutte le modifiche"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? "Salvataggio..." : `Salva Modifiche ${unsavedCount > 0 ? `(${unsavedCount})` : ""}`}</span>
            </button>
          )}
        </div>
      </div>

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

      {/* TABELLA EDITABILE STILE EXCEL */}
      <div className="flex-1 overflow-auto bg-[var(--background)]">
        <table className="w-full text-xs text-left border-collapse border-spacing-0">
          <thead className="bg-[var(--card)] border-b border-[var(--border)] text-[var(--muted-foreground)] font-mono text-[11px] sticky top-0 z-20 select-none shadow-sm">
            <tr>
              {isVisible("actions") && (
                <th className="px-2 py-1.5 text-center w-14 border-r border-[var(--border)]/40">#</th>
              )}
              {isVisible("cliente") && (
                <th
                  className="px-2.5 py-1.5 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-40"
                  onClick={() => handleToggleSort("cliente")}
                >
                  <div className="flex items-center justify-between">
                    <span>CLIENTE</span>
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </div>
                </th>
              )}
              {isVisible("fornitore") && (
                <th
                  className="px-2.5 py-1.5 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28 text-sky-400"
                  onClick={() => handleToggleSort("fornitore")}
                >
                  <div className="flex items-center justify-between">
                    <span>FORNITORE</span>
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </div>
                </th>
              )}
              {isVisible("codice_articolo") && (
                <th
                  className="px-2.5 py-1.5 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-32"
                  onClick={() => handleToggleSort("codice_articolo")}
                >
                  <div className="flex items-center justify-between">
                    <span>CODICE ART.</span>
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </div>
                </th>
              )}
              {isVisible("data_ref") && (
                <th
                  className="px-2.5 py-1.5 text-center cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28 text-amber-300"
                  onClick={() => handleToggleSort("data_ref")}
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>DATA</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}
              {isVisible("descrizione") && (
                <th
                  className="px-2.5 py-1.5 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 min-w-[220px]"
                  onClick={() => handleToggleSort("descrizione")}
                >
                  <div className="flex items-center justify-between">
                    <span>DESCRIZIONE ARTICOLO</span>
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </div>
                </th>
              )}
              {isVisible("prezzo_fattura") && (
                <th
                  className="px-2.5 py-1.5 text-right cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28 bg-emerald-950/15 text-emerald-400"
                  onClick={() => handleToggleSort("prezzo_fattura")}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>PREZZO VENDITA (€)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}
              {isVisible("perc_acquisto") && (
                <th
                  className="px-2.5 py-1.5 text-right cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-24 bg-sky-950/15 text-sky-400"
                  onClick={() => handleToggleSort("perc_acquisto")}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>% ACQUISTO</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}
              {isVisible("acquisto_eur") && (
                <th
                  className="px-2.5 py-1.5 text-right cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28 bg-blue-950/15 text-blue-400"
                  onClick={() => handleToggleSort("acquisto_eur")}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>ACQUISTO (€)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}
              {isVisible("data_acquisto") && (
                <th
                  className="px-2.5 py-1.5 text-center cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28"
                  onClick={() => handleToggleSort("data_acquisto")}
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>DATA ACQUISTO</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}
              {isVisible("acquisto_old") && (
                <th
                  className="px-2.5 py-1.5 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-32"
                  onClick={() => handleToggleSort("acquisto_old")}
                >
                  <div className="flex items-center justify-between">
                    <span>ACQUISTO OLD</span>
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </div>
                </th>
              )}
              {isVisible("ricarico") && (
                <th
                  className="px-2.5 py-1.5 text-right cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28"
                  onClick={() => handleToggleSort("ricarico")}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>RICARICO (%) OLD</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}
              {isVisible("note") && (
                <th className="px-2.5 py-1.5 text-left border-r border-[var(--border)]/40 w-32">NOTE</th>
              )}
              {isVisible("note1") && (
                <th className="px-2.5 py-1.5 text-left border-r border-[var(--border)]/40 w-28">NOTE 1</th>
              )}
              {isVisible("note2") && (
                <th className="px-2.5 py-1.5 text-left border-r border-[var(--border)]/40 w-28">NOTE 2</th>
              )}
            </tr>

            {/* RIGA FISSA SUPERIORE PER NUOVO ARTICOLO (newTopRow) */}
            <tr className="bg-emerald-500/10 border-b-2 border-emerald-500/40 text-[var(--foreground)] font-mono text-[11px]">
              {isVisible("actions") && (
                <td className="px-2 py-1.5 text-center border-r border-[var(--border)]/40">
                  <span title="Nuova riga: inserisci i dati per salvare" className="text-emerald-400 font-bold">
                    <Plus className="w-4 h-4 mx-auto" />
                  </span>
                </td>
              )}
              {isVisible("cliente") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="cliente"
                  value={newTopRow.cliente}
                  displayValue={newTopRow.cliente || (clientFilter.trim() || currentClientName || "+ Cliente...")}
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "cliente"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "cliente"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "cliente" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="font-bold text-amber-400 border-r border-[var(--border)]/40"
                />
              )}
              {isVisible("fornitore") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="fornitore"
                  value={newTopRow.fornitore}
                  displayValue={newTopRow.fornitore || "+ Fornitore"}
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "fornitore"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "fornitore"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "fornitore" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 text-sky-400 font-semibold"
                />
              )}
              {isVisible("codice_articolo") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="codice_articolo"
                  value={newTopRow.codice_articolo}
                  displayValue={newTopRow.codice_articolo || "+ Codice"}
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "codice_articolo"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "codice_articolo"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "codice_articolo" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 text-[var(--primary)]"
                />
              )}
              {isVisible("data_ref") && (
                <td className="px-2.5 py-1.5 text-center border-r border-[var(--border)]/40 text-[var(--muted-foreground)] font-mono whitespace-nowrap">
                  {newTopRow.data_ref || getTodayAaaaMmGg()}
                </td>
              )}
              {isVisible("descrizione") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="descrizione"
                  value={newTopRow.descrizione}
                  displayValue={newTopRow.descrizione || "+ Descrizione nuovo articolo..."}
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "descrizione"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "descrizione"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "descrizione" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 font-medium"
                />
              )}
              {isVisible("prezzo_fattura") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="prezzo_fattura"
                  value={newTopRow.prezzo_fattura}
                  displayValue={newTopRow.prezzo_fattura != null ? formatEuro(newTopRow.prezzo_fattura) : "0,00 €"}
                  align="right"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "prezzo_fattura"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_fattura"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_fattura" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 font-bold text-emerald-400 bg-emerald-950/10"
                />
              )}
              {isVisible("perc_acquisto") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="perc_acquisto"
                  value={newTopRow.perc_acquisto}
                  displayValue={newTopRow.perc_acquisto != null ? formatPercent(newTopRow.perc_acquisto) : "0%"}
                  align="right"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_acquisto"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_acquisto"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_acquisto" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 text-sky-400 bg-sky-950/10"
                />
              )}
              {isVisible("acquisto_eur") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="acquisto_eur"
                  value={newTopRow.acquisto_eur}
                  displayValue={newTopRow.acquisto_eur != null ? formatEuro(newTopRow.acquisto_eur) : "0,00 €"}
                  align="right"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "acquisto_eur"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "acquisto_eur"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "acquisto_eur" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 font-bold text-blue-400 bg-blue-950/10"
                />
              )}
              {isVisible("data_acquisto") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="data_acquisto"
                  value={newTopRow.data_acquisto}
                  displayValue={newTopRow.data_acquisto || "—"}
                  align="center"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "data_acquisto"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "data_acquisto"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "data_acquisto" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 text-[var(--muted-foreground)] whitespace-nowrap"
                />
              )}
              {isVisible("acquisto_old") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="acquisto_old"
                  value={newTopRow.acquisto_old}
                  displayValue={newTopRow.acquisto_old || "—"}
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "acquisto_old"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "acquisto_old"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "acquisto_old" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 text-amber-400/80 text-xs truncate max-w-[160px]"
                />
              )}
              {isVisible("ricarico") && (
                <td className="px-2.5 py-1.5 text-right border-r border-[var(--border)]/40 text-[var(--muted-foreground)]">
                  —
                </td>
              )}
              {isVisible("note") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="note"
                  value={newTopRow.note}
                  displayValue={newTopRow.note || "+ Note"}
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "note"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "note"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "note" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 text-[var(--muted-foreground)]"
                />
              )}
              {isVisible("note1") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="note1"
                  value={newTopRow.note1}
                  displayValue={newTopRow.note1 || "+ Note 1"}
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "note1"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "note1"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "note1" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 text-[var(--muted-foreground)]"
                />
              )}
              {isVisible("note2") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="note2"
                  value={newTopRow.note2}
                  displayValue={newTopRow.note2 || "+ Note 2"}
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "note2"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "note2"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "note2" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 text-[var(--muted-foreground)]"
                />
              )}
            </tr>
          </thead>

          {/* RIGHE TABELLA */}
          <tbody className="divide-y divide-[var(--border)]/30 font-mono text-xs">
            {filteredItems.slice(0, visibleCount).map((item) => {
              const isDirty = dirtyRows.has(item.id);
              const isNewlyAdded = item.id.startsWith("new_") && !originalRowsSnapshot.has(item.id);

              return (
                <tr
                  key={item.id}
                  onDoubleClick={(e) => {
                    // Se il doppio clic non proviene da un input già in modifica, inserisce nel DDT
                    if ((e.target as HTMLElement).tagName !== "INPUT") {
                      handleInsertIntoDdt(item);
                    }
                  }}
                  className={`hover:bg-amber-500/10 cursor-pointer transition-colors group ${
                    isNewlyAdded
                      ? "bg-emerald-500/5 font-semibold"
                      : isDirty
                      ? "bg-amber-500/5"
                      : ""
                  }`}
                  title="Doppio clic o pulsante ➕ per inserire nel DDT. Clicca su una cella per modificarla."
                >
                  {/* # Colonna Azioni: Cestino & Inserisci nel DDT */}
                  {isVisible("actions") && (
                    <td className="px-1.5 py-1 text-center border-r border-[var(--border)]/30 w-14">
                      <div className="flex items-center justify-center space-x-1">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteRow(item);
                            }}
                            className="p-1 rounded text-[var(--muted-foreground)] hover:text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
                            title="Elimina articolo (sposta nel Cestino)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onSelectArticle && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInsertIntoDdt(item);
                            }}
                            className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                            title="Inserisci articolo nel DDT"
                          >
                            <Plus className="w-3.5 h-3.5 font-bold" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}

                  {isVisible("cliente") && (
                    <EditableCell
                      rowId={item.id}
                      colId="cliente"
                      value={item.cliente}
                      displayValue={item.cliente}
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "cliente"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "cliente"}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "cliente" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="font-bold text-amber-400 border-r border-[var(--border)]/30 truncate max-w-[140px]"
                    />
                  )}

                  {isVisible("fornitore") && (
                    <EditableCell
                      rowId={item.id}
                      colId="fornitore"
                      value={item.fornitore}
                      displayValue={item.fornitore || "—"}
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "fornitore"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "fornitore"}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "fornitore" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 text-sky-400 font-semibold truncate max-w-[120px]"
                    />
                  )}

                  {isVisible("codice_articolo") && (
                    <EditableCell
                      rowId={item.id}
                      colId="codice_articolo"
                      value={item.codice_articolo}
                      displayValue={item.codice_articolo || "—"}
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "codice_articolo"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "codice_articolo"}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "codice_articolo" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 text-[var(--muted-foreground)] truncate max-w-[110px]"
                    />
                  )}

                  {isVisible("data_ref") && (
                    <td className="px-2.5 py-1.5 text-center border-r border-[var(--border)]/30 text-[var(--muted-foreground)] font-mono whitespace-nowrap">
                      {item.data_ref || "—"}
                    </td>
                  )}

                  {isVisible("descrizione") && (
                    <EditableCell
                      rowId={item.id}
                      colId="descrizione"
                      value={item.descrizione}
                      displayValue={item.descrizione}
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "descrizione"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "descrizione"}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "descrizione" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 text-[var(--foreground)] truncate max-w-[280px] font-sans text-[12px] font-medium"
                    />
                  )}

                  {isVisible("prezzo_fattura") && (
                    <EditableCell
                      rowId={item.id}
                      colId="prezzo_fattura"
                      value={item.prezzo_fattura}
                      displayValue={formatEuro(item.prezzo_fattura)}
                      align="right"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "prezzo_fattura"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "prezzo_fattura"}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "prezzo_fattura" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 font-bold text-emerald-400 bg-emerald-950/10"
                    />
                  )}

                  {isVisible("perc_acquisto") && (
                    <EditableCell
                      rowId={item.id}
                      colId="perc_acquisto"
                      value={item.perc_acquisto}
                      displayValue={formatPercent(item.perc_acquisto)}
                      align="right"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "perc_acquisto"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "perc_acquisto"}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "perc_acquisto" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 text-sky-400 bg-sky-950/10"
                    />
                  )}

                  {isVisible("acquisto_eur") && (
                    <EditableCell
                      rowId={item.id}
                      colId="acquisto_eur"
                      value={item.acquisto_eur}
                      displayValue={formatEuro(item.acquisto_eur)}
                      align="right"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "acquisto_eur"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "acquisto_eur"}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "acquisto_eur" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 font-bold text-blue-400 bg-blue-950/10"
                    />
                  )}

                  {isVisible("data_acquisto") && (
                    <EditableCell
                      rowId={item.id}
                      colId="data_acquisto"
                      value={item.data_acquisto}
                      displayValue={item.data_acquisto || "—"}
                      align="center"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "data_acquisto"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "data_acquisto"}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "data_acquisto" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 text-[var(--muted-foreground)] whitespace-nowrap"
                    />
                  )}

                  {isVisible("acquisto_old") && (
                    <EditableCell
                      rowId={item.id}
                      colId="acquisto_old"
                      value={item.acquisto_old || (item.prezzo_acquisto ? String(item.prezzo_acquisto) : "")}
                      displayValue={item.acquisto_old || (item.prezzo_acquisto ? String(item.prezzo_acquisto) : "—")}
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "acquisto_old"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "acquisto_old"}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "acquisto_old" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 text-amber-400/80 text-xs truncate max-w-[160px]"
                    />
                  )}

                  {isVisible("ricarico") && (
                    <td className="px-2.5 py-1.5 text-right border-r border-[var(--border)]/30 text-[var(--muted-foreground)]">
                      {formatPercent(item.ricarico)}
                    </td>
                  )}

                  {isVisible("note") && (
                    <EditableCell
                      rowId={item.id}
                      colId="note"
                      value={item.note}
                      displayValue={item.note || "—"}
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "note"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "note"}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "note" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 text-[var(--muted-foreground)] truncate max-w-[140px]"
                    />
                  )}

                  {isVisible("note1") && (
                    <td className="px-2.5 py-1.5 text-left border-r border-[var(--border)]/30 text-[var(--muted-foreground)] truncate max-w-[110px]">
                      {item.note1 || "—"}
                    </td>
                  )}

                  {isVisible("note2") && (
                    <td className="px-2.5 py-1.5 text-left border-r border-[var(--border)]/30 text-[var(--muted-foreground)] truncate max-w-[110px]">
                      {item.note2 || "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Paginazione progressiva */}
        {filteredItems.length > visibleCount && (
          <div className="p-3 text-center border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + BATCH_SIZE)}
              className="px-3 py-1.5 rounded-lg bg-[var(--card)] hover:bg-[var(--accent)] border border-[var(--border)] text-xs font-semibold text-[var(--foreground)] transition-colors cursor-pointer"
            >
              Carica altri {Math.min(BATCH_SIZE, filteredItems.length - visibleCount)} elementi ({visibleCount} di {filteredItems.length})
            </button>
          </div>
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
};

// Componente Editor Input Cella con supporto Autocomplete (Clienti & Fornitori)
interface CellInputEditorProps {
  rowId: string;
  colId: string;
  initialValue: string;
  isInitialCharTyped: boolean;
  alignClass: string;
  className?: string;
  onCommit: (rowId: string, colId: string, val: string) => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent, rowId: string, colId: string, currentValStr: string) => void;
}

const CellInputEditor: React.FC<CellInputEditorProps> = ({
  rowId,
  colId,
  initialValue,
  isInitialCharTyped,
  alignClass,
  className = "",
  onCommit,
  onCancel,
  onKeyDown,
}) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      if (isInitialCharTyped) {
        inputRef.current.selectionStart = inputRef.current.value.length;
        inputRef.current.selectionEnd = inputRef.current.value.length;
      } else {
        inputRef.current.select();
      }
    }
  }, [isInitialCharTyped]);

  const datalistId =
    colId === "cliente"
      ? "distinct-clients-autocomplete"
      : colId === "fornitore"
      ? "order-suppliers-autocomplete"
      : undefined;

  return (
    <td className={`p-0 relative ${alignClass} ${className}`}>
      <input
        ref={inputRef}
        autoFocus
        type="text"
        list={datalistId}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => onCommit(rowId, colId, localValue)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
            return;
          }
          onKeyDown(e, rowId, colId, localValue);
        }}
        className="w-full h-full px-2.5 py-1 text-xs font-mono bg-blue-900/30 text-[var(--foreground)] border-2 border-blue-500 rounded-none outline-none shadow-inner"
      />
    </td>
  );
};

// Componente Cella Editabile
interface EditableCellProps {
  rowId: string;
  colId: string;
  value: any;
  displayValue: string;
  align?: "left" | "center" | "right";
  isActive?: boolean;
  isEditing?: boolean;
  initialChar?: string;
  canEdit?: boolean;
  className?: string;
  onSelectCell: (rowId: string, colId: string) => void;
  onStartEdit: (rowId: string, colId: string, char?: string) => void;
  onCommit: (rowId: string, colId: string, val: string) => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent, rowId: string, colId: string, currentValStr: string) => void;
}

const EditableCell: React.FC<EditableCellProps> = memo(
  ({
    rowId,
    colId,
    value,
    displayValue,
    align = "left",
    isActive = false,
    isEditing = false,
    initialChar,
    canEdit = true,
    className = "",
    onSelectCell,
    onStartEdit,
    onCommit,
    onCancel,
    onKeyDown,
  }) => {
    const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

    if (isEditing) {
      return (
        <CellInputEditor
          rowId={rowId}
          colId={colId}
          initialValue={initialChar !== undefined ? initialChar : value != null ? String(value) : ""}
          isInitialCharTyped={initialChar !== undefined}
          alignClass={alignClass}
          className={className}
          onCommit={onCommit}
          onCancel={onCancel}
          onKeyDown={onKeyDown}
        />
      );
    }

    return (
      <td
        tabIndex={0}
        onClick={() => onSelectCell(rowId, colId)}
        onDoubleClick={() => {
          if (canEdit) onStartEdit(rowId, colId);
        }}
        onKeyDown={(e) => onKeyDown(e, rowId, colId, value != null ? String(value) : "")}
        className={`px-2.5 py-1.5 transition-colors relative outline-none cursor-pointer ${alignClass} ${
          isActive
            ? "ring-2 ring-blue-500 ring-inset bg-blue-500/10 font-bold"
            : "hover:bg-[var(--accent)]/30"
        } ${className}`}
      >
        <span className="truncate block">{displayValue}</span>
      </td>
    );
  }
);
EditableCell.displayName = "EditableCell";

import { formatPriceListInput } from "../utils/priceListInput";
import React, { useState, useEffect, useRef, useMemo, useCallback, memo, forwardRef, useImperativeHandle } from "react";
import { Plus, RotateCcw, Save, Loader2 } from "lucide-react";
import { ListinoGeneraleRow } from "../models/priceList";
import { parseItalianNumber } from "@/shared/utils/numberUtils";
import { priceListRepository } from "../services/priceListRepository";
import {
  getCachedGeneralList,
  setCachedGeneralList,
} from "../services/priceListGeneralCache";
import { useUserStore } from "@/shared/stores/useUserStore";
import { PriceListSectionHandle } from "../types/priceListSectionHandle";
import {
  round5,
  calculateR1,
  calculateR2,
  calculateCostoMaggiorato,
  calculatePrezzoFattura,
  calculatePercFattura,
  calculatePrezzoPubblico,
  calculatePercPubblico,
  calculatePrezzoProfess,
  calculatePercProfess,
} from "../utils/priceFormulas";

const BATCH_SIZE = 60;

const EDITABLE_COL_ORDER = [
  "fornitore",
  "codice_articolo",
  "data_ref",
  "descrizione",
  "um",
  "perc_pub",
  "prezzo_pubblico",
  "perc_prof",
  "prezzo_profess",
  "perc_fatt",
  "prezzo_fattura",
  "prezzo_acquisto",
  "perc_iva",
] as const;

type EditableColKey = (typeof EDITABLE_COL_ORDER)[number];

function getTodayAaaaMmGg(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function formatDateAaaaMmGg(rawDate: string | null | undefined): string {
  if (!rawDate) return "—";
  const str = String(rawDate).trim();
  if (!str) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str.replace(/-/g, ".");
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(str)) return str;
  if (str.includes("T")) {
    const p = str.split("T")[0].split("-");
    if (p.length === 3) return `${p[0]}.${p[1]}.${p[2]}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [g, m, a] = str.split("/");
    return `${a}.${m}.${g}`;
  }
  if (/^\d{6}$/.test(str)) {
    const yy = str.slice(0, 2);
    const mm = str.slice(2, 4);
    const dd = str.slice(4, 6);
    const yyyy = Number(yy) > 50 ? `19${yy}` : `20${yy}`;
    return `${yyyy}.${mm}.${dd}`;
  }
  return str;
}

function createBlankGeneralRow(): ListinoGeneraleRow {
  return {
    id: `new_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    source_table: "listino_generale",
    cat: "",
    fornitore: "",
    codice_articolo: "",
    data_ref: getTodayAaaaMmGg(),
    descrizione: "",
    um: "NR.",
    perc_pub: null,
    prezzo_pubblico: null,
    perc_prof: null,
    prezzo_profess: null,
    perc_fatt: null,
    prezzo_fattura: null,
    prezzo_acquisto: null,
    aumento: 0,
    r1: null,
    maga: 0,
    r2: null,
    perc_iva: 0.22,
    note: null,
  };
}

function parseInputNumber(val: string): number | null {
  const num = parseItalianNumber(val);
  return num == null ? null : round5(num);
}

function parseInputPercent(val: string): number | null {
  const num = parseInputNumber(val);
  if (num == null) return null;
  return round5(num / 100);
}

function formatEuro(val: number | null | undefined, decimals = 2): string {
  if (val == null || isNaN(val)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
}

function formatPercent(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  const p = val * 100;
  return `${Math.round(p * 100) / 100}%`;
}

function tokenizeSearch(rawQuery: string): string[] {
  return rawQuery
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((tok) => tok.length > 0);
}

export interface GeneralPriceListEmbeddedSectionProps {
  globalSearch?: string;
  layoutMode?: "horizontal" | "vertical";
}

export const GeneralPriceListEmbeddedSection = forwardRef<
  PriceListSectionHandle,
  GeneralPriceListEmbeddedSectionProps
>(({
  globalSearch = "",
  layoutMode = "horizontal",
}, ref) => {
  const { currentUser } = useUserStore();
  const isAlexOrAdmin = Boolean(
    currentUser?.is_admin ||
    currentUser?.name?.trim().toLowerCase() === "alex" ||
    currentUser?.can_edit_price_lists
  );
  const canEdit = isAlexOrAdmin;

  const [items, setItems] = useState<ListinoGeneraleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  // Nuova riga in cima (stile Listino Clienti)
  const [newTopRow, setNewTopRow] = useState<ListinoGeneraleRow>(() => createBlankGeneralRow());

  // Tracciamento modifiche non salvate & Snapshot
  const [dirtyRows, setDirtyRows] = useState<Map<string, ListinoGeneraleRow>>(new Map());
  const [originalRowsSnapshot, setOriginalRowsSnapshot] = useState<Map<string, ListinoGeneraleRow>>(new Map());
  const [undoStack, setUndoStack] = useState<{ rowId: string; prevRow?: ListinoGeneraleRow; isNewRow?: boolean }[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Cella attiva ed editing
  const [activeCell, setActiveCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [initialEditChar, setInitialEditChar] = useState<string | undefined>(undefined);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Caricamento dati da SQLite (o cache globale)
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getCachedGeneralList(50000);
      setItems(rows);

      const snapshot = new Map<string, ListinoGeneraleRow>();
      for (const r of rows) {
        snapshot.set(r.id, { ...r });
      }
      setOriginalRowsSnapshot(snapshot);
      setDirtyRows(new Map());
      setUndoStack([]);
    } catch (err) {
      console.error("[GeneralPriceListEmbedded] Errore caricamento:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Reset conteggio visibile su cambio ricerca
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [globalSearch]);

  // Filtraggio con token di ricerca Alex
  const searchTokens = useMemo(() => tokenizeSearch(globalSearch), [globalSearch]);

  const filteredItems = useMemo(() => {
    if (searchTokens.length === 0) return items;
    return items.filter((item) => {
      const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }, [items, searchTokens]);

  // Funzione di aggiornamento riga con formule automatiche
  const updateRowWithField = useCallback(
    (prevRow: ListinoGeneraleRow, colId: string, rawVal: string | number | null): ListinoGeneraleRow => {
      const updated: ListinoGeneraleRow = { ...prevRow };

      if (colId !== "data_ref") {
        updated.data_ref = getTodayAaaaMmGg();
      }

      switch (colId) {
        case "fornitore":
          updated.fornitore = rawVal ? String(rawVal).trim().toUpperCase() : null;
          break;
        case "codice_articolo":
          updated.codice_articolo = rawVal ? String(rawVal).trim() : null;
          break;
        case "data_ref":
          updated.data_ref = rawVal ? String(rawVal).trim() : null;
          break;
        case "descrizione":
          updated.descrizione = rawVal ? String(rawVal) : "";
          break;
        case "um":
          updated.um = rawVal ? String(rawVal).trim().toUpperCase() : "NR.";
          break;
        case "prezzo_acquisto": {
          const num = typeof rawVal === "number" ? rawVal : parseInputNumber(String(rawVal ?? ""));
          updated.prezzo_acquisto = num;
          const r1 = calculateR1(num, updated.aumento);
          const r2 = calculateR2(r1, updated.maga);
          updated.r1 = r1;
          updated.r2 = r2;
          updated.prezzo_fattura = calculatePrezzoFattura(r2, updated.perc_fatt);
          updated.prezzo_pubblico = calculatePrezzoPubblico(r2, updated.perc_pub, updated.perc_iva);
          updated.prezzo_profess = calculatePrezzoProfess(r2, updated.perc_prof, updated.perc_iva);
          break;
        }
        case "perc_pub": {
          const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal ?? ""));
          updated.perc_pub = num;
          const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
          updated.prezzo_pubblico = calculatePrezzoPubblico(costoMaggiorato, num, updated.perc_iva);
          break;
        }
        case "prezzo_pubblico": {
          const num = typeof rawVal === "number" ? rawVal : parseInputNumber(String(rawVal ?? ""));
          updated.prezzo_pubblico = num;
          const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
          if (num != null && costoMaggiorato > 0) {
            updated.perc_pub = round5(calculatePercPubblico(num, costoMaggiorato, updated.perc_iva) / 100);
          }
          break;
        }
        case "perc_prof": {
          const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal ?? ""));
          updated.perc_prof = num;
          const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
          updated.prezzo_profess = calculatePrezzoProfess(costoMaggiorato, num, updated.perc_iva);
          break;
        }
        case "prezzo_profess": {
          const num = typeof rawVal === "number" ? rawVal : parseInputNumber(String(rawVal ?? ""));
          updated.prezzo_profess = num;
          const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
          if (num != null && costoMaggiorato > 0) {
            updated.perc_prof = round5(calculatePercProfess(num, costoMaggiorato, updated.perc_iva) / 100);
          }
          break;
        }
        case "perc_fatt": {
          const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal ?? ""));
          updated.perc_fatt = num;
          const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
          updated.prezzo_fattura = calculatePrezzoFattura(costoMaggiorato, num);
          break;
        }
        case "prezzo_fattura": {
          const num = typeof rawVal === "number" ? rawVal : parseInputNumber(String(rawVal ?? ""));
          updated.prezzo_fattura = num;
          const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
          if (num != null && costoMaggiorato > 0) {
            updated.perc_fatt = round5(calculatePercFattura(num, costoMaggiorato) / 100);
          }
          break;
        }
        case "perc_iva": {
          const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal ?? ""));
          updated.perc_iva = num ?? 0.22;
          const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
          updated.prezzo_pubblico = calculatePrezzoPubblico(costoMaggiorato, updated.perc_pub, updated.perc_iva);
          updated.prezzo_profess = calculatePrezzoProfess(costoMaggiorato, updated.perc_prof, updated.perc_iva);
          break;
        }
        default:
          break;
      }

      return updated;
    },
    []
  );

  // Salvataggio effettivo
  const executeSave = useCallback(
    async (rowsToSave: ListinoGeneraleRow[]) => {
      if (rowsToSave.length === 0) return;
      setIsSaving(true);
      try {
        await priceListRepository.saveGeneralRows(rowsToSave);

        // Aggiorna snapshot locale
        setOriginalRowsSnapshot((prev) => {
          const next = new Map(prev);
          for (const r of rowsToSave) {
            next.set(r.id, { ...r });
          }
          return next;
        });

        // Pulisce dirtyRows per le righe salvate
        setDirtyRows((prev) => {
          const next = new Map(prev);
          for (const r of rowsToSave) {
            next.delete(r.id);
          }
          return next;
        });

        // Aggiorna la cache globale condivisa in memoria
        setCachedGeneralList(items);
      } catch (err) {
        console.error("[GeneralPriceListEmbedded] Errore salvataggio:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [items]
  );

  const scheduleSilentAutoSaveIfNeeded = useCallback(
    (rowsMap: Map<string, ListinoGeneraleRow>) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        const rows = Array.from(rowsMap.values());
        if (rows.length > 0) {
          void executeSave(rows);
        }
      }, 5000);
    },
    [executeSave]
  );

  // Selezione e avvio modifica cella
  const selectCell = useCallback((rowId: string, colId: string) => {
    setActiveCell({ rowId, colId });
  }, []);

  const startEditing = useCallback((rowId: string, colId: string, char?: string) => {
    if (!canEdit) return;
    setActiveCell({ rowId, colId });
    setEditingCell({ rowId, colId });
    setInitialEditChar(char);
  }, [canEdit]);

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
        const rows = Array.from(dirtyRows.values());
        if (rows.length > 0) {
          await executeSave(rows);
        }
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
        setNewTopRow(createBlankGeneralRow());
        setEditingCell(null);
        setInitialEditChar(undefined);
      },
    }),
    [editingCell, cancelCellEdit, dirtyRows, executeSave, originalRowsSnapshot]
  );

  // Commit modifica di una cella
  const commitCellEdit = useCallback(
    (rowId: string, colId: string, value: string) => {
      setEditingCell(null);
      setInitialEditChar(undefined);
      if (!canEdit) return;

      // 1. Modifica sulla riga di inserimento in cima (newTopRow)
      if (rowId === newTopRow.id) {
        const updatedTop = updateRowWithField(newTopRow, colId, value);

        // Se la descrizione è compilata, crea effettivamente l'articolo
        if (updatedTop.descrizione.trim().length > 0 && (colId === "descrizione" || colId === "prezzo_fattura" || colId === "prezzo_acquisto")) {
          const completeNewRow: ListinoGeneraleRow = {
            ...updatedTop,
            data_ref: updatedTop.data_ref || getTodayAaaaMmGg(),
          };

          setItems((prev) => [completeNewRow, ...prev]);
          setDirtyRows((prev) => {
            const next = new Map(prev);
            next.set(completeNewRow.id, completeNewRow);
            scheduleSilentAutoSaveIfNeeded(next);
            return next;
          });
          setUndoStack((uPrev) => [...uPrev.slice(-49), { rowId: completeNewRow.id, isNewRow: true }]);
          setNewTopRow(createBlankGeneralRow());
        } else {
          setNewTopRow(updatedTop);
        }
        return;
      }

      // 2. Modifica su riga esistente
      const prevRow = items.find((i) => i.id === rowId);
      if (!prevRow || value === formatPriceListInput(prevRow[colId as EditableColKey], colId)) return;

      const updatedRow = updateRowWithField(prevRow, colId, value);
      setItems((prev) => prev.map((r) => (r.id === rowId ? updatedRow : r)));

      setDirtyRows((prev) => {
        const next = new Map(prev);
        next.set(rowId, updatedRow);
        scheduleSilentAutoSaveIfNeeded(next);
        return next;
      });

      setUndoStack((uPrev) => [...uPrev.slice(-49), { rowId, prevRow }]);
    },
    [newTopRow, items, updateRowWithField, scheduleSilentAutoSaveIfNeeded, canEdit]
  );

  // Inserimento forzato con pulsante '+' su newTopRow
  const handleAddNewTopRowExplicitly = useCallback(() => {
    if (!newTopRow.descrizione.trim()) return;
    const completeNewRow: ListinoGeneraleRow = {
      ...newTopRow,
      data_ref: newTopRow.data_ref || getTodayAaaaMmGg(),
    };

    setItems((prev) => [completeNewRow, ...prev]);
    setDirtyRows((prev) => {
      const next = new Map(prev);
      next.set(completeNewRow.id, completeNewRow);
      scheduleSilentAutoSaveIfNeeded(next);
      return next;
    });
    setUndoStack((uPrev) => [...uPrev.slice(-49), { rowId: completeNewRow.id, isNewRow: true }]);
    setNewTopRow(createBlankGeneralRow());
  }, [newTopRow, scheduleSilentAutoSaveIfNeeded]);

  // Gestione tastiera tipo Excel (Frecce, Tab, Invio)
  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent, rowId: string, colId: string, currentValStr: string) => {
      const allRows = [newTopRow, ...filteredItems.slice(0, visibleCount)];
      const rowIdx = allRows.findIndex((r) => r.id === rowId);
      const colIdx = EDITABLE_COL_ORDER.indexOf(colId as EditableColKey);
      const isEditing = editingCell?.rowId === rowId && editingCell.colId === colId;

      if (e.key === "Tab") {
        e.preventDefault();
        if (canEdit && isEditing) commitCellEdit(rowId, colId, currentValStr);
        const nextColIdx = e.shiftKey ? colIdx - 1 : colIdx + 1;
        if (nextColIdx >= 0 && nextColIdx < EDITABLE_COL_ORDER.length) {
          selectCell(rowId, EDITABLE_COL_ORDER[nextColIdx]);
        } else if (nextColIdx >= EDITABLE_COL_ORDER.length && rowIdx < allRows.length - 1) {
          selectCell(allRows[rowIdx + 1].id, EDITABLE_COL_ORDER[0]);
        }
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (canEdit && isEditing) commitCellEdit(rowId, colId, currentValStr);
        if (rowIdx < allRows.length - 1) {
          selectCell(allRows[rowIdx + 1].id, colId);
        }
        return;
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        if (!editingCell) {
          e.preventDefault();
          if (e.key === "ArrowUp" && rowIdx > 0) selectCell(allRows[rowIdx - 1].id, colId);
          if (e.key === "ArrowDown" && rowIdx < allRows.length - 1) selectCell(allRows[rowIdx + 1].id, colId);
          if (e.key === "ArrowLeft" && colIdx > 0) selectCell(rowId, EDITABLE_COL_ORDER[colIdx - 1]);
          if (e.key === "ArrowRight" && colIdx < EDITABLE_COL_ORDER.length - 1) selectCell(rowId, EDITABLE_COL_ORDER[colIdx + 1]);
        }
      }
    },
    [newTopRow, filteredItems, visibleCount, commitCellEdit, selectCell, editingCell, canEdit]
  );

  // Annulla ultima modifica
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    if (lastAction.isNewRow) {
      setItems((prev) => prev.filter((r) => r.id !== lastAction.rowId));
      setDirtyRows((prev) => {
        const next = new Map(prev);
        next.delete(lastAction.rowId);
        return next;
      });
      return;
    }

    if (lastAction.prevRow) {
      const restored = lastAction.prevRow;
      setItems((prev) => prev.map((r) => (r.id === lastAction.rowId ? restored : r)));
      setDirtyRows((prev) => {
        const next = new Map(prev);
        const original = originalRowsSnapshot.get(lastAction.rowId);
        if (original && JSON.stringify(original) === JSON.stringify(restored)) {
          next.delete(lastAction.rowId);
        } else {
          next.set(lastAction.rowId, restored);
        }
        return next;
      });
    }
  }, [undoStack, originalRowsSnapshot]);

  const unsavedCount = dirtyRows.size;

  return (
    <div
      className={`flex flex-col overflow-hidden bg-[var(--card)] ${
        layoutMode === "horizontal" ? "flex-1 min-h-[140px]" : "flex-1 min-w-[280px]"
      }`}
    >
      {/* Intestazione Sezione con Controlli e Statistiche */}
      <div className="px-3 py-1 bg-blue-950/40 border-b border-blue-500/30 flex items-center justify-between text-xs text-blue-300 shrink-0">
        <div className="flex items-center space-x-2">
          <span className="font-bold flex items-center space-x-1">
            <span>Listino Generale</span>
            <span className="text-[10px] opacity-80">({filteredItems.length} voci)</span>
          </span>
          {unsavedCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
              {unsavedCount} non salvate
            </span>
          )}
        </div>

        {/* Azioni: Annulla & Salva Modifiche */}
        <div className="flex items-center space-x-2">
          {undoStack.length > 0 && (
            <button
              type="button"
              onClick={handleUndo}
              className="flex items-center space-x-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] transition-colors cursor-pointer"
              title="Annulla ultima modifica (Ctrl+Z)"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Annulla</span>
            </button>
          )}

          {canEdit && unsavedCount > 0 && (
            <button
              type="button"
              onClick={() => executeSave(Array.from(dirtyRows.values()))}
              disabled={isSaving}
              className="flex items-center space-x-1 px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-xs transition-colors cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              <span>Salva Modifiche</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabella con Scroll Infinito Progressivo */}
      <div
        className="flex-1 overflow-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
            setVisibleCount((prev) => Math.min(prev + 60, filteredItems.length));
          }
        }}
      >
        <table className="w-full border-collapse text-xs whitespace-nowrap">
          <thead className="bg-[var(--background)] sticky top-0 text-[11.5px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)] font-bold z-10">
            <tr>
              <th className="px-2 py-1.5 text-center w-8">#</th>
              <th className="px-2.5 py-1.5 text-left w-20">Fornit</th>
              <th className="px-2.5 py-1.5 text-left w-24">Art</th>
              <th className="px-2 py-1.5 text-center w-16">Data</th>
              <th className="px-3 py-1.5 text-left">Descrizione</th>
              <th className="px-2 py-1.5 text-center w-12">UM</th>
              <th className="px-2.5 py-1.5 text-right w-16">% Pub</th>
              <th className="px-3 py-1.5 text-right w-24">Pubblico</th>
              <th className="px-2.5 py-1.5 text-right w-16">% Prof</th>
              <th className="px-3 py-1.5 text-right w-24">Profess</th>
              <th className="px-2.5 py-1.5 text-right w-16">% Fatt</th>
              <th className="px-3 py-1.5 text-right w-24 bg-blue-500/10 text-amber-300 font-bold">Fattura</th>
              <th className="px-3 py-1.5 text-right w-24">Acquisto</th>
              <th className="px-2 py-1.5 text-center w-12">IVA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/30 font-mono text-xs">
            {/* RIGA VERDE IN CIMA PER INSERIMENTO NUOVO ARTICOLO NEL LISTINO GENERALE */}
            {canEdit && (
              <tr className="bg-emerald-500/10 hover:bg-emerald-500/15 border-b-2 border-emerald-500/40">
                <td className="px-2 py-1 text-center bg-[var(--card)] sticky left-0 z-10">
                  <button
                    type="button"
                    onClick={handleAddNewTopRowExplicitly}
                    disabled={!newTopRow.descrizione.trim()}
                    className="inline-flex items-center justify-center text-emerald-400 hover:text-emerald-300 disabled:opacity-40 p-0.5 cursor-pointer"
                    title="Aggiungi nuovo articolo al listino generale"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </td>

                {/* Fornitore */}
                <EditableGeneralCell
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
                  className="italic text-emerald-300/80 max-w-[85px] truncate"
                />

                {/* Codice Articolo */}
                <EditableGeneralCell
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
                  className="italic font-bold text-emerald-400 max-w-[95px] truncate"
                />

                {/* Data */}
                <td className="px-2 py-1 text-center text-emerald-400/80 text-[11px] font-mono">
                  {formatDateAaaaMmGg(newTopRow.data_ref)}
                </td>

                {/* Descrizione */}
                <EditableGeneralCell
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
                  className="italic font-medium text-emerald-200"
                />

                {/* UM */}
                <EditableGeneralCell
                  rowId={newTopRow.id}
                  colId="um"
                  value={newTopRow.um}
                  displayValue={newTopRow.um || "NR."}
                  align="center"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "um"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "um"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "um" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="text-emerald-300"
                />

                {/* % Pub */}
                <EditableGeneralCell
                  rowId={newTopRow.id}
                  colId="perc_pub"
                  value={newTopRow.perc_pub}
                  displayValue={formatPercent(newTopRow.perc_pub)}
                  align="right"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_pub"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_pub"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_pub" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                />

                {/* Pubblico */}
                <EditableGeneralCell
                  rowId={newTopRow.id}
                  colId="prezzo_pubblico"
                  value={newTopRow.prezzo_pubblico}
                  displayValue={formatEuro(newTopRow.prezzo_pubblico)}
                  align="right"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "prezzo_pubblico"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_pubblico"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_pubblico" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                />

                {/* % Prof */}
                <EditableGeneralCell
                  rowId={newTopRow.id}
                  colId="perc_prof"
                  value={newTopRow.perc_prof}
                  displayValue={formatPercent(newTopRow.perc_prof)}
                  align="right"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_prof"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_prof"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_prof" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                />

                {/* Profess */}
                <EditableGeneralCell
                  rowId={newTopRow.id}
                  colId="prezzo_profess"
                  value={newTopRow.prezzo_profess}
                  displayValue={formatEuro(newTopRow.prezzo_profess)}
                  align="right"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "prezzo_profess"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_profess"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_profess" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                />

                {/* % Fatt */}
                <EditableGeneralCell
                  rowId={newTopRow.id}
                  colId="perc_fatt"
                  value={newTopRow.perc_fatt}
                  displayValue={formatPercent(newTopRow.perc_fatt)}
                  align="right"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_fatt"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_fatt"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_fatt" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                />

                {/* Fattura */}
                <EditableGeneralCell
                  rowId={newTopRow.id}
                  colId="prezzo_fattura"
                  value={newTopRow.prezzo_fattura}
                  displayValue={formatEuro(newTopRow.prezzo_fattura)}
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
                  className="font-bold text-amber-300 bg-blue-500/10"
                />

                {/* Acquisto */}
                <EditableGeneralCell
                  rowId={newTopRow.id}
                  colId="prezzo_acquisto"
                  value={newTopRow.prezzo_acquisto}
                  displayValue={formatEuro(newTopRow.prezzo_acquisto)}
                  align="right"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "prezzo_acquisto"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_acquisto"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_acquisto" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                />

                {/* IVA */}
                <EditableGeneralCell
                  rowId={newTopRow.id}
                  colId="perc_iva"
                  value={newTopRow.perc_iva}
                  displayValue={formatPercent(newTopRow.perc_iva)}
                  align="center"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_iva"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_iva"}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_iva" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                />
              </tr>
            )}

            {/* RIGHE ESISTENTI NEL LISTINO GENERALE */}
            {filteredItems.slice(0, visibleCount).map((item, idx) => {
              const isDirty = dirtyRows.has(item.id);
              const isNewlyAdded = item.id.startsWith("new_") && !originalRowsSnapshot.has(item.id);

              return (
                <tr
                  key={item.id}
                  className={`hover:bg-blue-600/15 cursor-pointer transition-colors group ${
                    isNewlyAdded
                      ? "bg-emerald-500/5 font-semibold"
                      : isDirty
                      ? "bg-amber-500/5"
                      : ""
                  }`}
                  title="Fai clic o doppio clic su una cella per modificarla"
                >
                  <td className="px-2 py-1.5 text-center text-[var(--muted-foreground)]/60 text-[10px]">
                    {idx + 1}
                  </td>

                  {/* Fornitore */}
                  <EditableGeneralCell
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
                    className="text-[var(--muted-foreground)] truncate max-w-[75px]"
                  />

                  {/* Art */}
                  <EditableGeneralCell
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
                    className="font-bold text-blue-400 truncate max-w-[90px]"
                  />

                  {/* Data */}
                  <td className="px-2 py-1.5 text-center text-[var(--muted-foreground)] text-[11px]">
                    {formatDateAaaaMmGg(item.data_ref)}
                  </td>

                  {/* Descrizione */}
                  <EditableGeneralCell
                    rowId={item.id}
                    colId="descrizione"
                    value={item.descrizione}
                    displayValue={item.descrizione || "—"}
                    isActive={activeCell?.rowId === item.id && activeCell?.colId === "descrizione"}
                    isEditing={editingCell?.rowId === item.id && editingCell?.colId === "descrizione"}
                    initialChar={editingCell?.rowId === item.id && editingCell?.colId === "descrizione" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onSelectCell={selectCell}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="font-sans text-[var(--foreground)] truncate max-w-[320px] text-[12.5px] font-medium"
                  />

                  {/* UM */}
                  <EditableGeneralCell
                    rowId={item.id}
                    colId="um"
                    value={item.um}
                    displayValue={item.um || "NR"}
                    align="center"
                    isActive={activeCell?.rowId === item.id && activeCell?.colId === "um"}
                    isEditing={editingCell?.rowId === item.id && editingCell?.colId === "um"}
                    initialChar={editingCell?.rowId === item.id && editingCell?.colId === "um" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onSelectCell={selectCell}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="text-[var(--muted-foreground)]"
                  />

                  {/* % Pub */}
                  <EditableGeneralCell
                    rowId={item.id}
                    colId="perc_pub"
                    value={item.perc_pub}
                    displayValue={formatPercent(item.perc_pub)}
                    align="right"
                    isActive={activeCell?.rowId === item.id && activeCell?.colId === "perc_pub"}
                    isEditing={editingCell?.rowId === item.id && editingCell?.colId === "perc_pub"}
                    initialChar={editingCell?.rowId === item.id && editingCell?.colId === "perc_pub" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onSelectCell={selectCell}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="text-[var(--muted-foreground)]"
                  />

                  {/* Pubblico */}
                  <EditableGeneralCell
                    rowId={item.id}
                    colId="prezzo_pubblico"
                    value={item.prezzo_pubblico}
                    displayValue={formatEuro(item.prezzo_pubblico)}
                    align="right"
                    isActive={activeCell?.rowId === item.id && activeCell?.colId === "prezzo_pubblico"}
                    isEditing={editingCell?.rowId === item.id && editingCell?.colId === "prezzo_pubblico"}
                    initialChar={editingCell?.rowId === item.id && editingCell?.colId === "prezzo_pubblico" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onSelectCell={selectCell}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="font-medium"
                  />

                  {/* % Prof */}
                  <EditableGeneralCell
                    rowId={item.id}
                    colId="perc_prof"
                    value={item.perc_prof}
                    displayValue={formatPercent(item.perc_prof)}
                    align="right"
                    isActive={activeCell?.rowId === item.id && activeCell?.colId === "perc_prof"}
                    isEditing={editingCell?.rowId === item.id && editingCell?.colId === "perc_prof"}
                    initialChar={editingCell?.rowId === item.id && editingCell?.colId === "perc_prof" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onSelectCell={selectCell}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="text-[var(--muted-foreground)]"
                  />

                  {/* Profess */}
                  <EditableGeneralCell
                    rowId={item.id}
                    colId="prezzo_profess"
                    value={item.prezzo_profess}
                    displayValue={formatEuro(item.prezzo_profess)}
                    align="right"
                    isActive={activeCell?.rowId === item.id && activeCell?.colId === "prezzo_profess"}
                    isEditing={editingCell?.rowId === item.id && editingCell?.colId === "prezzo_profess"}
                    initialChar={editingCell?.rowId === item.id && editingCell?.colId === "prezzo_profess" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onSelectCell={selectCell}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="font-medium"
                  />

                  {/* % Fatt */}
                  <EditableGeneralCell
                    rowId={item.id}
                    colId="perc_fatt"
                    value={item.perc_fatt}
                    displayValue={formatPercent(item.perc_fatt)}
                    align="right"
                    isActive={activeCell?.rowId === item.id && activeCell?.colId === "perc_fatt"}
                    isEditing={editingCell?.rowId === item.id && editingCell?.colId === "perc_fatt"}
                    initialChar={editingCell?.rowId === item.id && editingCell?.colId === "perc_fatt" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onSelectCell={selectCell}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="text-[var(--muted-foreground)]"
                  />

                  {/* Fattura */}
                  <EditableGeneralCell
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
                    className="font-bold text-amber-300 bg-blue-500/10"
                  />

                  {/* Acquisto */}
                  <EditableGeneralCell
                    rowId={item.id}
                    colId="prezzo_acquisto"
                    value={item.prezzo_acquisto}
                    displayValue={formatEuro(item.prezzo_acquisto)}
                    align="right"
                    isActive={activeCell?.rowId === item.id && activeCell?.colId === "prezzo_acquisto"}
                    isEditing={editingCell?.rowId === item.id && editingCell?.colId === "prezzo_acquisto"}
                    initialChar={editingCell?.rowId === item.id && editingCell?.colId === "prezzo_acquisto" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onSelectCell={selectCell}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="text-[var(--muted-foreground)]"
                  />

                  {/* IVA */}
                  <EditableGeneralCell
                    rowId={item.id}
                    colId="perc_iva"
                    value={item.perc_iva}
                    displayValue={formatPercent(item.perc_iva)}
                    align="center"
                    isActive={activeCell?.rowId === item.id && activeCell?.colId === "perc_iva"}
                    isEditing={editingCell?.rowId === item.id && editingCell?.colId === "perc_iva"}
                    initialChar={editingCell?.rowId === item.id && editingCell?.colId === "perc_iva" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onSelectCell={selectCell}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="text-[var(--muted-foreground)]"
                  />
                </tr>
              );
            })}
          </tbody>
        </table>

        {loading && (
          <div className="flex items-center justify-center p-6 text-xs text-[var(--muted-foreground)] space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span>Caricamento listino generale in corso...</span>
          </div>
        )}
      </div>
    </div>
  );
});

GeneralPriceListEmbeddedSection.displayName = "GeneralPriceListEmbeddedSection";

// Componente Editor Input Cella
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
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (isInitialCharTyped) {
        inputRef.current.selectionStart = inputRef.current.value.length;
        inputRef.current.selectionEnd = inputRef.current.value.length;
      } else {
        inputRef.current.select();
      }
    }
  }, [isInitialCharTyped]);

  return (
    <td className={`p-0 relative ${alignClass} ${className}`}>
      <input
        ref={inputRef}
        autoFocus
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          if (skipBlurCommitRef.current) return;
          onCommit(rowId, colId, localValue);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            skipBlurCommitRef.current = true;
            onCancel();
            return;
          }
          if (e.key === "Enter" || e.key === "Tab") skipBlurCommitRef.current = true;
          onKeyDown(e, rowId, colId, localValue);
        }}
        className="w-full h-full px-2.5 py-1 text-xs font-mono bg-blue-900/30 text-[var(--foreground)] border-2 border-blue-500 rounded-none outline-none shadow-inner"
      />
    </td>
  );
};

// Componente Cella Editabile
interface EditableGeneralCellProps {
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

const EditableGeneralCell: React.FC<EditableGeneralCellProps> = memo(
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
          initialValue={initialChar ?? formatPriceListInput(value, colId)}
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
        onKeyDown={(e) => onKeyDown(e, rowId, colId, "")}
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

EditableGeneralCell.displayName = "EditableGeneralCell";

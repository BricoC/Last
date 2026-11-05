import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useDeferredValue,
  useCallback,
} from "react";
import {
  Search,
  RefreshCw,
  AlertCircle,
  X,
  ArrowUpDown,
  RotateCcw,
  Save,
  CheckCircle2,
  FileSpreadsheet,
} from "lucide-react";
import { ListinoGeneraleRow, PriceListLogEntry } from "./models/priceList";
import { priceListRepository } from "./services/priceListRepository";
import { priceListSyncService } from "./services/priceListSyncService";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { useUserStore } from "@/shared/stores/useUserStore";
import { ItemPriceHistoryModal } from "./components/ItemPriceHistoryModal";
import {
  useColumnVisibility,
  ALL_GENERAL_COLUMNS,
} from "./hooks/useColumnVisibility";
import { ColumnVisibilityMenu } from "./components/ColumnVisibilityMenu";
import {
  BulkEditToolbar,
  BulkOperationPayload,
} from "./components/BulkEditToolbar";
import {
  calculateR1,
  calculateR2,
  calculateCostoMaggiorato,
  calculatePrezzoFattura,
  calculatePercFattura,
  calculatePrezzoPubblico,
  calculatePercPubblico,
  calculatePrezzoProfess,
  calculatePercProfess,
} from "./utils/priceFormulas";

const BATCH_SIZE = 150;
const BUFFER_EMPTY_ROWS_COUNT = 10;

type SortField =
  | "descrizione"
  | "codice_articolo"
  | "fornitore"
  | "cat"
  | "data_ref"
  | "prezzo_fattura"
  | "prezzo_pubblico"
  | "prezzo_profess"
  | "prezzo_acquisto"
  | "costo_maggiorato";

// ID delle colonne modificabili nella griglia Excel
const EDITABLE_COL_ORDER = [
  "cat",
  "fornitore",
  "codice_articolo",
  "data_ref",
  "descrizione",
  "um",
  "prezzo_acquisto",
  "aumento",
  "maga",
  "perc_pub",
  "prezzo_pubblico",
  "perc_prof",
  "prezzo_profess",
  "perc_fatt",
  "prezzo_fattura",
  "perc_iva",
] as const;

type EditableColumnKey = (typeof EDITABLE_COL_ORDER)[number];

function createEmptyBufferRow(idx: number): ListinoGeneraleRow {
  return {
    id: `new_temp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
    source_table: "listino_generale",
    cat: "",
    fornitore: "",
    codice_articolo: "",
    data_ref: new Date().toISOString().split("T")[0],
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
  const clean = val.trim().replace("€", "").replace("%", "").replace(/\s+/g, "").replace(",", ".");
  if (clean === "") return null;
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

function parseInputPercent(val: string): number | null {
  const num = parseInputNumber(val);
  if (num == null) return null;
  // Se l'utente digita 30 o 30%, in DB lo normalizziamo se > 2 -> num / 100
  return num > 2 ? num / 100 : num;
}

export const ProductListPage: React.FC = () => {
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

  // 10 Righe vuote sempre in fondo per inserimento continuo
  const [bufferRows, setBufferRows] = useState<ListinoGeneraleRow[]>(() =>
    Array.from({ length: BUFFER_EMPTY_ROWS_COUNT }, (_, i) => createEmptyBufferRow(i))
  );

  // Tracciamento modifiche non salvate (mappa id -> riga)
  const [dirtyRows, setDirtyRows] = useState<Map<string, ListinoGeneraleRow>>(new Map());
  const [originalRowsSnapshot, setOriginalRowsSnapshot] = useState<Map<string, ListinoGeneraleRow>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [autoSaveCountdown, setAutoSaveCountdown] = useState<number | null>(null);

  // Selezione righe per Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Ricerca rapida e ordinamento
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [sortField, setSortField] = useState<SortField>("descrizione");
  const [sortAsc, setSortAsc] = useState(true);

  // Cella attiva ed editing stile Excel
  const [activeCell, setActiveCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [cellEditValue, setCellEditValue] = useState<string>("");
  const cellInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Modale Storico Variazioni Riga (Colonna A...)
  const [historyModalItem, setHistoryModalItem] = useState<ListinoGeneraleRow | null>(null);

  // Caricamento iniziale da SQLite locale
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const count = await priceListRepository.getGeneralCount();
      setTotalDbCount(count);
      const rows = await priceListRepository.searchGeneral("", 15000);
      setItems(rows);

      // Crea snapshot iniziale per calcolo differenze log
      const snapshot = new Map<string, ListinoGeneraleRow>();
      for (const r of rows) {
        snapshot.set(r.id, { ...r });
      }
      setOriginalRowsSnapshot(snapshot);
      setDirtyRows(new Map());
    } catch (err) {
      console.error("Errore caricamento listino generale da SQLite:", err);
      setError(err instanceof Error ? err.message : "Errore lettura database locale.");
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Ricerca tokenizzata
  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  const filteredItems = useMemo(() => {
    let result = items;

    if (searchTokens.length > 0) {
      result = result.filter((item) => {
        const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""} ${item.cat || ""}`.toLowerCase();
        return searchTokens.every((token) => text.includes(token));
      });
    }

    return [...result].sort((a, b) => {
      let valA: any = sortField === "costo_maggiorato" ? null : (a as any)[sortField];
      let valB: any = sortField === "costo_maggiorato" ? null : (b as any)[sortField];

      if (sortField === "costo_maggiorato") {
        valA = a.r2 ?? calculateCostoMaggiorato(a.prezzo_acquisto, a.aumento, a.maga);
        valB = b.r2 ?? calculateCostoMaggiorato(b.prezzo_acquisto, b.aumento, b.maga);
      }

      if (valA == null) valA = "";
      if (valB == null) valB = "";

      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }

      return sortAsc
        ? String(valA).localeCompare(String(valB), "it", { numeric: true })
        : String(valB).localeCompare(String(valA), "it", { numeric: true });
    });
  }, [items, searchTokens, sortField, sortAsc]);

  // Gestione scroll infinito
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 300) {
      setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filteredItems.length));
    }
  };

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Funzione unificata di aggiornamento riga con calcoli bidirezionali
  const updateRowWithField = useCallback(
    (
      prevRow: ListinoGeneraleRow,
      colId: EditableColumnKey | string,
      rawVal: string | number | null
    ): ListinoGeneraleRow => {
      const updated: ListinoGeneraleRow = { ...prevRow };

      switch (colId) {
        case "cat":
          updated.cat = rawVal ? String(rawVal).trim() : null;
          break;
        case "fornitore":
          updated.fornitore = rawVal ? String(rawVal).trim() : null;
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
          const num = typeof rawVal === "number" ? rawVal : parseInputNumber(String(rawVal || ""));
          updated.prezzo_acquisto = num;
          // Ricalcola R1, R2
          const r1 = calculateR1(num, updated.aumento);
          const r2 = calculateR2(r1, updated.maga);
          updated.r1 = r1;
          updated.r2 = r2;
          // Aggiorna prezzi di vendita mantenendo le percentuali fisse
          updated.prezzo_fattura = calculatePrezzoFattura(r2, updated.perc_fatt);
          updated.prezzo_pubblico = calculatePrezzoPubblico(r2, updated.perc_pub, updated.perc_iva);
          updated.prezzo_profess = calculatePrezzoProfess(r2, updated.perc_prof, updated.perc_iva);
          break;
        }
        case "aumento": {
          const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal || ""));
          updated.aumento = num;
          const r1 = calculateR1(updated.prezzo_acquisto, num);
          const r2 = calculateR2(r1, updated.maga);
          updated.r1 = r1;
          updated.r2 = r2;
          updated.prezzo_fattura = calculatePrezzoFattura(r2, updated.perc_fatt);
          updated.prezzo_pubblico = calculatePrezzoPubblico(r2, updated.perc_pub, updated.perc_iva);
          updated.prezzo_profess = calculatePrezzoProfess(r2, updated.perc_prof, updated.perc_iva);
          break;
        }
        case "maga": {
          const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal || ""));
          updated.maga = num;
          const r1 = calculateR1(updated.prezzo_acquisto, updated.aumento);
          const r2 = calculateR2(r1, num);
          updated.r1 = r1;
          updated.r2 = r2;
          updated.prezzo_fattura = calculatePrezzoFattura(r2, updated.perc_fatt);
          updated.prezzo_pubblico = calculatePrezzoPubblico(r2, updated.perc_pub, updated.perc_iva);
          updated.prezzo_profess = calculatePrezzoProfess(r2, updated.perc_prof, updated.perc_iva);
          break;
        }
        case "perc_pub": {
          const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal || ""));
          updated.perc_pub = num;
          const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
          updated.prezzo_pubblico = calculatePrezzoPubblico(costoMaggiorato, num, updated.perc_iva);
          break;
        }
        case "prezzo_pubblico": {
          const num = typeof rawVal === "number" ? rawVal : parseInputNumber(String(rawVal || ""));
          updated.prezzo_pubblico = num;
          const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
          if (num != null && costoMaggiorato > 0) {
            updated.perc_pub = calculatePercPubblico(num, costoMaggiorato, updated.perc_iva) / 100;
          }
          break;
        }
        case "perc_prof": {
          const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal || ""));
          updated.perc_prof = num;
          const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
          updated.prezzo_profess = calculatePrezzoProfess(costoMaggiorato, num, updated.perc_iva);
          break;
        }
        case "prezzo_profess": {
          const num = typeof rawVal === "number" ? rawVal : parseInputNumber(String(rawVal || ""));
          updated.prezzo_profess = num;
          const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
          if (num != null && costoMaggiorato > 0) {
            updated.perc_prof = calculatePercProfess(num, costoMaggiorato, updated.perc_iva) / 100;
          }
          break;
        }
        case "perc_fatt": {
          const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal || ""));
          updated.perc_fatt = num;
          const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
          updated.prezzo_fattura = calculatePrezzoFattura(costoMaggiorato, num);
          break;
        }
        case "prezzo_fattura": {
          const num = typeof rawVal === "number" ? rawVal : parseInputNumber(String(rawVal || ""));
          updated.prezzo_fattura = num;
          const costoMaggiorato = calculateCostoMaggiorato(updated.prezzo_acquisto, updated.aumento, updated.maga);
          if (num != null && costoMaggiorato > 0) {
            updated.perc_fatt = calculatePercFattura(num, costoMaggiorato) / 100;
          }
          break;
        }
        case "perc_iva": {
          const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal || ""));
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

  // Applica una modifica ad una riga esistente o ad una delle 10 righe vuote
  const applyCellChange = useCallback(
    (rowId: string, colId: string, value: string | number | null) => {
      // 1. Controlla se la modifica è su una delle 10 righe vuote del buffer in fondo
      const bufferIndex = bufferRows.findIndex((r) => r.id === rowId);
      if (bufferIndex !== -1) {
        const targetRow = bufferRows[bufferIndex];
        const updatedRow = updateRowWithField(targetRow, colId, value);

        // Se la riga ha ora almeno una descrizione o codice o prezzo, viene promossa a riga attiva
        const hasContent = Boolean(
          updatedRow.descrizione?.trim() ||
            updatedRow.codice_articolo?.trim() ||
            updatedRow.prezzo_acquisto != null ||
            updatedRow.prezzo_fattura != null
        );

        if (hasContent) {
          // Promuovi a riga reale
          setItems((prev) => [updatedRow, ...prev]);
          setDirtyRows((prev) => {
            const next = new Map(prev);
            next.set(updatedRow.id, updatedRow);
            return next;
          });
          // Rimpiazza lo slot nel buffer per mantenere SEMPRE esattamente 10 righe vuote
          setBufferRows((prev) => {
            const next = [...prev];
            next.splice(bufferIndex, 1);
            next.push(createEmptyBufferRow(Date.now()));
            return next;
          });
        } else {
          // Aggiorna solo nello stato del buffer
          setBufferRows((prev) => {
            const next = [...prev];
            next[bufferIndex] = updatedRow;
            return next;
          });
        }
        return;
      }

      // 2. Modifica su una riga normale già presente in items
      setItems((prev) =>
        prev.map((r) => {
          if (r.id !== rowId) return r;
          const updated = updateRowWithField(r, colId, value);
          setDirtyRows((dirtyPrev) => {
            const next = new Map(dirtyPrev);
            next.set(rowId, updated);
            return next;
          });
          return updated;
        })
      );
    },
    [bufferRows, updateRowWithField]
  );

  // Salvataggio effettivo (SQLite locale + Log + Supabase asincrono)
  const saveAllPendingChanges = useCallback(async () => {
    if (dirtyRows.size === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const rowsToSave = Array.from(dirtyRows.values());

      // 1. Prepara log delle variazioni di prezzo per listini_prezzi_log
      const logEntries: Omit<PriceListLogEntry, "id">[] = [];
      const nowIso = new Date().toISOString();
      const operatorName = currentUser?.name || currentUser?.station_name || "Operatore";

      for (const row of rowsToSave) {
        const original = originalRowsSnapshot.get(row.id);
        if (original) {
          // Prezzo Acquisto
          if (original.prezzo_acquisto !== row.prezzo_acquisto && row.codice_articolo) {
            const oldV = original.prezzo_acquisto ?? 0;
            const newV = row.prezzo_acquisto ?? 0;
            const pct = oldV > 0 ? ((newV - oldV) / oldV) * 100 : 0;
            logEntries.push({
              created_at: nowIso,
              tipo_listino: "generale",
              cliente: "",
              codice_articolo: row.codice_articolo,
              descrizione: row.descrizione,
              campo_modificato: "prezzo_acquisto",
              vecchio_valore: oldV,
              nuovo_valore: newV,
              variazione_pct: Math.round(pct * 100) / 100,
              operatore: operatorName,
              motivo: "Modifica Excel Listino Generale",
            });
          }
          // Prezzo Fattura
          if (original.prezzo_fattura !== row.prezzo_fattura && row.codice_articolo) {
            const oldV = original.prezzo_fattura ?? 0;
            const newV = row.prezzo_fattura ?? 0;
            const pct = oldV > 0 ? ((newV - oldV) / oldV) * 100 : 0;
            logEntries.push({
              created_at: nowIso,
              tipo_listino: "generale",
              cliente: "",
              codice_articolo: row.codice_articolo,
              descrizione: row.descrizione,
              campo_modificato: "prezzo_fattura",
              vecchio_valore: oldV,
              nuovo_valore: newV,
              variazione_pct: Math.round(pct * 100) / 100,
              operatore: operatorName,
              motivo: "Modifica Excel Listino Generale",
            });
          }
          // Prezzo Pubblico
          if (original.prezzo_pubblico !== row.prezzo_pubblico && row.codice_articolo) {
            const oldV = original.prezzo_pubblico ?? 0;
            const newV = row.prezzo_pubblico ?? 0;
            const pct = oldV > 0 ? ((newV - oldV) / oldV) * 100 : 0;
            logEntries.push({
              created_at: nowIso,
              tipo_listino: "generale",
              cliente: "",
              codice_articolo: row.codice_articolo,
              descrizione: row.descrizione,
              campo_modificato: "prezzo_pubblico",
              vecchio_valore: oldV,
              nuovo_valore: newV,
              variazione_pct: Math.round(pct * 100) / 100,
              operatore: operatorName,
              motivo: "Modifica Excel Listino Generale",
            });
          }
        }
      }

      // 2. Salva in SQLite locale
      await priceListRepository.saveGeneralRows(rowsToSave);

      // 3. Salva logs in SQLite se presenti
      if (logEntries.length > 0) {
        await priceListRepository.logPriceChanges(logEntries);
      }

      // 4. Aggiorna snapshot locale
      setOriginalRowsSnapshot((prev) => {
        const next = new Map(prev);
        for (const r of rowsToSave) {
          next.set(r.id, { ...r });
        }
        return next;
      });

      // 5. Pulisci dirtyRows
      setDirtyRows(new Map());
      setLastSavedTime(new Date());

      // 6. Push asincrono verso Supabase Cloud (senza bloccare la UI)
      void priceListSyncService.pushGeneralBatchToSupabase(rowsToSave).then((res) => {
        if (!res.success && res.error) {
          console.warn("[ProductListPage] Push Supabase asincrono:", res.error);
        }
      });
    } catch (err: any) {
      console.error("[ProductListPage] Errore salvataggio:", err);
      setError(`Errore salvataggio: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  }, [dirtyRows, isSaving, originalRowsSnapshot, currentUser]);

  // Gestione Timer Auto-Save (10 secondi dall'ultima modifica)
  useEffect(() => {
    if (dirtyRows.size === 0) {
      setAutoSaveCountdown(null);
      return;
    }

    setAutoSaveCountdown(10);
    const interval = setInterval(() => {
      setAutoSaveCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          void saveAllPendingChanges();
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [dirtyRows, saveAllPendingChanges]);

  // Gestione Apertura/Chiusura Editor Cella
  const startEditing = (rowId: string, colId: string, initialVal?: string) => {
    if (!canEdit) return;
    setActiveCell({ rowId, colId });
    setEditingCell({ rowId, colId });

    // Cerca il valore corrente
    const allRows = [...filteredItems, ...bufferRows];
    const row = allRows.find((r) => r.id === rowId);
    let valStr = initialVal ?? "";
    if (initialVal === undefined && row) {
      const v = (row as any)[colId];
      if (v != null) {
        if (
          colId === "perc_pub" ||
          colId === "perc_prof" ||
          colId === "perc_fatt" ||
          colId === "aumento" ||
          colId === "maga" ||
          colId === "perc_iva"
        ) {
          const pct = v > 2 ? v : v * 100;
          valStr = `${Math.round(pct * 10) / 10}%`;
        } else {
          valStr = String(v);
        }
      }
    }
    setCellEditValue(valStr);
    setTimeout(() => {
      cellInputRef.current?.focus();
      cellInputRef.current?.select();
    }, 20);
  };

  const commitCellEdit = () => {
    if (editingCell) {
      applyCellChange(editingCell.rowId, editingCell.colId, cellEditValue);
      setEditingCell(null);
    }
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
    setCellEditValue("");
  };

  // Navigazione tastiera stile Excel (Invio, Tab, Frecce, Escape)
  const handleCellKeyDown = (e: React.KeyboardEvent, rowId: string, colId: string) => {
    const isEditing = Boolean(editingCell && editingCell.rowId === rowId && editingCell.colId === colId);
    const allVisibleCols = EDITABLE_COL_ORDER.filter((c) => visibleColumns[c] !== false);
    const colIdx = allVisibleCols.indexOf(colId as EditableColumnKey);
    const allDisplayRows = [...filteredItems.slice(0, visibleCount), ...bufferRows];
    const rowIdx = allDisplayRows.findIndex((r) => r.id === rowId);

    if (e.key === "Enter") {
      e.preventDefault();
      if (isEditing) {
        commitCellEdit();
      }
      // Sposta in basso sulla stessa colonna
      if (rowIdx < allDisplayRows.length - 1) {
        const nextRow = allDisplayRows[rowIdx + 1];
        setActiveCell({ rowId: nextRow.id, colId });
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (isEditing) {
        commitCellEdit();
      }
      if (e.shiftKey) {
        // Sposta a sinistra
        if (colIdx > 0) {
          setActiveCell({ rowId, colId: allVisibleCols[colIdx - 1] });
        } else if (rowIdx > 0) {
          const prevRow = allDisplayRows[rowIdx - 1];
          setActiveCell({ rowId: prevRow.id, colId: allVisibleCols[allVisibleCols.length - 1] });
        }
      } else {
        // Sposta a destra
        if (colIdx < allVisibleCols.length - 1) {
          setActiveCell({ rowId, colId: allVisibleCols[colIdx + 1] });
        } else if (rowIdx < allDisplayRows.length - 1) {
          const nextRow = allDisplayRows[rowIdx + 1];
          setActiveCell({ rowId: nextRow.id, colId: allVisibleCols[0] });
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelCellEdit();
    } else if (!isEditing) {
      if (e.key === "ArrowDown" && rowIdx < allDisplayRows.length - 1) {
        e.preventDefault();
        setActiveCell({ rowId: allDisplayRows[rowIdx + 1].id, colId });
      } else if (e.key === "ArrowUp" && rowIdx > 0) {
        e.preventDefault();
        setActiveCell({ rowId: allDisplayRows[rowIdx - 1].id, colId });
      } else if (e.key === "ArrowRight" && colIdx < allVisibleCols.length - 1) {
        e.preventDefault();
        setActiveCell({ rowId, colId: allVisibleCols[colIdx + 1] });
      } else if (e.key === "ArrowLeft" && colIdx > 0) {
        e.preventDefault();
        setActiveCell({ rowId, colId: allVisibleCols[colIdx - 1] });
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Se si inizia a digitare un carattere qualsiasi, entra in edit mode con quel carattere
        startEditing(rowId, colId, e.key);
      }
    }
  };

  // Supporto Incolla a più celle/righe/colonne stile Excel (TSV / Tab-delimited)
  const handleGridPaste = (e: React.ClipboardEvent) => {
    if (!canEdit) return;
    const clipText = e.clipboardData.getData("text/plain");
    if (!clipText || !activeCell) return;

    // Se stiamo già editando una specifica casella di testo con cursore dentro, lascia fare al browser
    if (editingCell) return;

    e.preventDefault();
    const rows = clipText.split(/\r?\n/).filter((line) => line.length > 0);
    if (rows.length === 0) return;

    const allVisibleCols = EDITABLE_COL_ORDER.filter((c) => visibleColumns[c] !== false);
    const startColIdx = allVisibleCols.indexOf(activeCell.colId as EditableColumnKey);
    if (startColIdx === -1) return;

    const allDisplayRows = [...filteredItems, ...bufferRows];
    const startRowIdx = allDisplayRows.findIndex((r) => r.id === activeCell.rowId);
    if (startRowIdx === -1) return;

    let modifiedCount = 0;

    // Itera sulle righe e colonne incollate
    rows.forEach((rowStr, rOffset) => {
      const targetRowIdx = startRowIdx + rOffset;
      const cells = rowStr.split("\t");

      let targetRow: ListinoGeneraleRow;
      if (targetRowIdx < allDisplayRows.length) {
        targetRow = allDisplayRows[targetRowIdx];
      } else {
        // Genera nuova riga se l'incolla va oltre le righe disponibili
        targetRow = createEmptyBufferRow(Date.now() + rOffset);
        setBufferRows((prev) => [...prev, targetRow]);
      }

      cells.forEach((cellVal, cOffset) => {
        const targetColIdx = startColIdx + cOffset;
        if (targetColIdx < allVisibleCols.length) {
          const colId = allVisibleCols[targetColIdx];
          applyCellChange(targetRow.id, colId, cellVal.trim());
          modifiedCount++;
        }
      });
    });

    console.info(`[Excel Paste] Incollate ${modifiedCount} celle da appunti.`);
  };

  // Supporto Copia TSV di righe/celle selezionate (Ctrl+C)
  const handleGridCopy = (e: React.KeyboardEvent) => {
    if (e.key === "c" && (e.ctrlKey || e.metaKey) && !editingCell) {
      if (selectedIds.size > 0) {
        e.preventDefault();
        const selectedRows = items.filter((r) => selectedIds.has(r.id));
        const allVisibleCols = EDITABLE_COL_ORDER.filter((c) => visibleColumns[c] !== false);
        const tsv = selectedRows
          .map((r) => allVisibleCols.map((col) => String((r as any)[col] ?? "")).join("\t"))
          .join("\n");
        void navigator.clipboard.writeText(tsv);
      } else if (activeCell) {
        e.preventDefault();
        const allDisplayRows = [...filteredItems, ...bufferRows];
        const row = allDisplayRows.find((r) => r.id === activeCell.rowId);
        if (row) {
          const val = String((row as any)[activeCell.colId] ?? "");
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
      // Elimina da SQLite locale
      await priceListRepository.deleteGeneralRows(idsToDelete);
      // Rimuovi da stato
      setItems((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      setDirtyRows((prev) => {
        const next = new Map(prev);
        idsToDelete.forEach((id) => next.delete(id));
        return next;
      });
      setSelectedIds(new Set());
      // Elimina da Supabase in background
      void priceListSyncService.deleteGeneralBatchFromSupabase(idsToDelete);
      return;
    }

    // Applica variazioni di massa
    setItems((prev) =>
      prev.map((r) => {
        if (!selectedIds.has(r.id)) return r;

        let updated = { ...r };
        const numVal = typeof payload.value === "number" ? payload.value : parseFloat(String(payload.value));

        switch (payload.action) {
          case "var_acq_perc": {
            if (!isNaN(numVal)) {
              const currentAcq = updated.prezzo_acquisto || 0;
              const newAcq = currentAcq * (1 + numVal / 100);
              updated = updateRowWithField(updated, "prezzo_acquisto", newAcq);
            }
            break;
          }
          case "var_acq_val": {
            if (!isNaN(numVal)) {
              const currentAcq = updated.prezzo_acquisto || 0;
              const newAcq = Math.max(0, currentAcq + numVal);
              updated = updateRowWithField(updated, "prezzo_acquisto", newAcq);
            }
            break;
          }
          case "set_aumento": {
            if (!isNaN(numVal)) {
              updated = updateRowWithField(updated, "aumento", numVal / 100);
            }
            break;
          }
          case "set_maga": {
            if (!isNaN(numVal)) {
              updated = updateRowWithField(updated, "maga", numVal / 100);
            }
            break;
          }
          case "var_pub_perc": {
            if (!isNaN(numVal)) {
              const currentPub = updated.prezzo_pubblico || 0;
              const newPub = currentPub * (1 + numVal / 100);
              updated = updateRowWithField(updated, "prezzo_pubblico", newPub);
            }
            break;
          }
          case "var_prof_perc": {
            if (!isNaN(numVal)) {
              const currentProf = updated.prezzo_profess || 0;
              const newProf = currentProf * (1 + numVal / 100);
              updated = updateRowWithField(updated, "prezzo_profess", newProf);
            }
            break;
          }
          case "var_fatt_perc": {
            if (!isNaN(numVal)) {
              const currentFatt = updated.prezzo_fattura || 0;
              const newFatt = currentFatt * (1 + numVal / 100);
              updated = updateRowWithField(updated, "prezzo_fattura", newFatt);
            }
            break;
          }
          case "set_perc_fatt": {
            if (!isNaN(numVal)) {
              updated = updateRowWithField(updated, "perc_fatt", numVal / 100);
            }
            break;
          }
          case "set_cat": {
            updated = updateRowWithField(updated, "cat", String(payload.value).trim());
            break;
          }
          case "set_fornitore": {
            updated = updateRowWithField(updated, "fornitore", String(payload.value).trim());
            break;
          }
          case "set_iva": {
            if (!isNaN(numVal)) {
              updated = updateRowWithField(updated, "perc_iva", numVal / 100);
            }
            break;
          }
          default:
            break;
        }

        setDirtyRows((dirtyPrev) => {
          const next = new Map(dirtyPrev);
          next.set(updated.id, updated);
          return next;
        });

        return updated;
      })
    );

    setSelectedIds(new Set());
  };

  // Seleziona / Deseleziona tutto ciò che è filtrato
  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Formattatori numerici
  const formatEuro = (val: number | null | undefined, digits: number = 3) => {
    if (val == null) return "—";
    return `€ ${val.toLocaleString("it-IT", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })}`;
  };

  const formatPercent = (val: number | null | undefined) => {
    if (val == null) return "—";
    const pct = val > 2 ? val : val * 100;
    return `${Math.round(pct * 10) / 10}%`;
  };

  return (
    <div
      ref={tableContainerRef}
      onPaste={handleGridPaste}
      onKeyDown={handleGridCopy}
      className="flex flex-col h-full bg-[var(--background)] text-[var(--foreground)] select-none outline-none"
      tabIndex={0}
    >
      {/* 1. Header Toolbar */}
      <div className="p-2.5 border-b border-[var(--border)] bg-[var(--card)] flex items-center space-x-3 shrink-0">
        {/* Ricerca Rapida F4 */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-2.5" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(BATCH_SIZE);
            }}
            placeholder="Quick Filter (F4 per cercare, Categoria, Codice, Fornitore, Descrizione)..."
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-medium"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Azioni destra */}
        <div className="flex items-center space-x-2 text-xs shrink-0">
          {/* Menu Scelta Colonne Personalizzate */}
          <ColumnVisibilityMenu
            columns={ALL_GENERAL_COLUMNS}
            visibleColumns={visibleColumns}
            onToggleColumn={toggleColumn}
            onResetDefault={resetDefaultColumns}
          />

          {/* Ricarica Locale */}
          <button
            type="button"
            onClick={loadData}
            disabled={loading || isSaving}
            className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            title="Ricarica lista da SQLite locale"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          {/* Tasto Salvataggio Manuale con Badge Modifiche Pendenti */}
          {canEdit && (
            <button
              type="button"
              onClick={saveAllPendingChanges}
              disabled={dirtyRows.size === 0 || isSaving}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-all ${
                dirtyRows.size > 0
                  ? "bg-amber-500 hover:bg-amber-600 text-white animate-pulse"
                  : "bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] cursor-default"
              }`}
              title={
                dirtyRows.size > 0
                  ? `Salva subito ${dirtyRows.size} articoli modificati (auto-save in ${autoSaveCountdown ?? 0}s)`
                  : "Tutte le modifiche sono sincronizzate"
              }
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvataggio...</span>
                </>
              ) : dirtyRows.size > 0 ? (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Salva ({dirtyRows.size})</span>
                  {autoSaveCountdown !== null && (
                    <span className="text-[10px] opacity-80 font-mono ml-0.5">
                      ({autoSaveCountdown}s)
                    </span>
                  )}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Salvato</span>
                </>
              )}
            </button>
          )}

          {/* Badge Articoli Presenti */}
          <span className="px-2.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] font-semibold text-[var(--primary)]">
            Articoli: {totalDbCount}
          </span>
        </div>
      </div>

      {/* Toolbar Modifiche di Massa (se ci sono righe selezionate) */}
      {canEdit && (
        <BulkEditToolbar
          selectedCount={selectedIds.size}
          totalFilteredCount={filteredItems.length}
          onClearSelection={() => setSelectedIds(new Set())}
          onSelectAllFiltered={() => setSelectedIds(new Set(filteredItems.map((i) => i.id)))}
          onApplyBulkAction={handleApplyBulkAction}
        />
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border-b border-red-500/30 text-red-400 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="p-1 hover:text-red-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Griglia Interattiva Excel-Like */}
      <div
        className="flex-1 overflow-auto bg-[var(--card)] divide-y divide-[var(--border)]/40 focus:outline-none"
        onScroll={handleScroll}
      >
        <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
          <thead className="bg-[var(--background)] sticky top-0 z-20 text-[11px] uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)] shadow-sm">
            <tr>
              {/* Checkbox selezione multipla */}
              <th className="px-2 py-2 w-8 text-center bg-[var(--background)] sticky left-0 z-20">
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === filteredItems.length}
                  onChange={handleToggleSelectAll}
                  className="rounded border-[var(--border)]"
                />
              </th>

              {/* Colonna A... Storico Variazioni */}
              {visibleColumns.history !== false && (
                <th className="px-2 py-2 w-10 text-center" title="Storico modifiche riga">
                  A...
                </th>
              )}

              {/* Categoria */}
              {visibleColumns.cat !== false && (
                <th
                  className="px-2 py-2 w-20 max-w-[90px] cursor-pointer hover:text-[var(--foreground)]"
                  onClick={() => handleToggleSort("cat")}
                >
                  <div className="flex items-center space-x-1">
                    <span>CAT.</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}

              {/* Fornitore */}
              {visibleColumns.fornitore !== false && (
                <th
                  className="px-2.5 py-2 w-20 max-w-[85px] cursor-pointer hover:text-[var(--foreground)]"
                  onClick={() => handleToggleSort("fornitore")}
                >
                  <div className="flex items-center space-x-1">
                    <span>FORNITORE</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}

              {/* Codice Articolo */}
              {visibleColumns.codice_articolo !== false && (
                <th
                  className="px-2.5 py-2 w-24 max-w-[95px] cursor-pointer hover:text-[var(--foreground)]"
                  onClick={() => handleToggleSort("codice_articolo")}
                >
                  <div className="flex items-center space-x-1">
                    <span>ARTICOLO</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}

              {/* Data */}
              {visibleColumns.data_ref !== false && (
                <th className="px-2 py-2 text-center w-20">DATA</th>
              )}

              {/* Descrizione */}
              {visibleColumns.descrizione !== false && (
                <th
                  className="px-3 py-2 cursor-pointer hover:text-[var(--foreground)] min-w-[280px]"
                  onClick={() => handleToggleSort("descrizione")}
                >
                  <div className="flex items-center space-x-1">
                    <span>DESCRIZIONE</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--primary)]" />
                  </div>
                </th>
              )}

              {/* U.M. */}
              {visibleColumns.um !== false && (
                <th className="px-2 py-2 text-center w-14">U.M.</th>
              )}

              {/* Acquisto Base (€) */}
              {visibleColumns.prezzo_acquisto !== false && (
                <th
                  className="px-3 py-2 text-right w-24 cursor-pointer hover:text-[var(--foreground)] bg-sky-950/20"
                  onClick={() => handleToggleSort("prezzo_acquisto")}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>ACQUISTO BASE</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}

              {/* Aumento (%) */}
              {visibleColumns.aumento !== false && (
                <th className="px-2.5 py-2 text-right w-16 bg-sky-950/20">AUMENTO %</th>
              )}

              {/* Magazzino (%) */}
              {visibleColumns.maga !== false && (
                <th className="px-2.5 py-2 text-right w-16 bg-sky-950/20">MAGAZZINO %</th>
              )}

              {/* Acquisto Maggiorato (R2) */}
              {visibleColumns.costo_maggiorato !== false && (
                <th
                  className="px-3 py-2 text-right w-28 bg-sky-900/40 text-sky-300 font-bold border-x border-sky-500/30 cursor-pointer"
                  onClick={() => handleToggleSort("costo_maggiorato")}
                  title="Costo base + Aumento% + Magazzino% (Riferimento per tutti i ricarichi)"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>ACQ. MAGG.</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}

              {/* % Pubblico */}
              {visibleColumns.perc_pub !== false && (
                <th className="px-2.5 py-2 text-right w-16">% PUB</th>
              )}

              {/* Prezzo Pubblico (€) */}
              {visibleColumns.prezzo_pubblico !== false && (
                <th
                  className="px-3 py-2 text-right w-24 cursor-pointer hover:text-[var(--foreground)]"
                  onClick={() => handleToggleSort("prezzo_pubblico")}
                >
                  PUBBLICO
                </th>
              )}

              {/* % Profess */}
              {visibleColumns.perc_prof !== false && (
                <th className="px-2.5 py-2 text-right w-16">% PROF</th>
              )}

              {/* Prezzo Profess (€) */}
              {visibleColumns.prezzo_profess !== false && (
                <th
                  className="px-3 py-2 text-right w-24 cursor-pointer hover:text-[var(--foreground)]"
                  onClick={() => handleToggleSort("prezzo_profess")}
                >
                  PROFESS
                </th>
              )}

              {/* % Fattura */}
              {visibleColumns.perc_fatt !== false && (
                <th className="px-2.5 py-2 text-right w-16">% FATT</th>
              )}

              {/* Prezzo Fattura (€) - Evidenziato */}
              {visibleColumns.prezzo_fattura !== false && (
                <th
                  className="px-3 py-2 text-right w-28 bg-amber-500/20 text-amber-300 font-bold border-x border-amber-500/30 cursor-pointer"
                  onClick={() => handleToggleSort("prezzo_fattura")}
                >
                  FATTURA
                </th>
              )}

              {/* Aliquota IVA */}
              {visibleColumns.perc_iva !== false && (
                <th className="px-2.5 py-2 text-center w-14">IVA</th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11.5px]">
            {/* Righe filtrate e visualizzate */}
            {filteredItems.slice(0, visibleCount).map((item) => {
              const isDirty = dirtyRows.has(item.id);
              const isSelected = selectedIds.has(item.id);
              const costoMagg =
                item.r2 ?? calculateCostoMaggiorato(item.prezzo_acquisto, item.aumento, item.maga);

              return (
                <tr
                  key={item.id}
                  className={`transition-colors group cursor-default ${
                    isSelected
                      ? "bg-primary/15 hover:bg-primary/20"
                      : isDirty
                      ? "bg-amber-500/10 hover:bg-amber-500/15"
                      : "hover:bg-[var(--background)]"
                  }`}
                >
                  {/* Checkbox */}
                  <td className="px-2 py-1 text-center bg-[var(--card)] sticky left-0 z-10">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelectRow(item.id)}
                      className="rounded border-[var(--border)]"
                    />
                  </td>

                  {/* Storico Modifiche A... */}
                  {visibleColumns.history !== false && (
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => setHistoryModalItem(item)}
                        className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--card)] transition-colors"
                        title="Visualizza storico modifiche riga (max 15)"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}

                  {/* Categoria */}
                  {visibleColumns.cat !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="cat"
                      value={item.cat || ""}
                      displayValue={item.cat || "—"}
                      align="left"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "cat"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "cat"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="font-sans font-medium text-[var(--foreground)] truncate max-w-[90px]"
                    />
                  )}

                  {/* Fornitore */}
                  {visibleColumns.fornitore !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="fornitore"
                      value={item.fornitore || ""}
                      displayValue={item.fornitore || "—"}
                      align="left"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "fornitore"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "fornitore"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="font-sans font-medium text-[var(--foreground)] truncate max-w-[85px]"
                    />
                  )}

                  {/* Codice Articolo */}
                  {visibleColumns.codice_articolo !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="codice_articolo"
                      value={item.codice_articolo || ""}
                      displayValue={item.codice_articolo || "—"}
                      align="left"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "codice_articolo"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "codice_articolo"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="font-bold text-[var(--primary)] truncate max-w-[95px]"
                    />
                  )}

                  {/* Data Ref */}
                  {visibleColumns.data_ref !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="data_ref"
                      value={item.data_ref || ""}
                      displayValue={item.data_ref || "—"}
                      align="center"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "data_ref"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "data_ref"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="text-[var(--muted-foreground)]"
                    />
                  )}

                  {/* Descrizione */}
                  {visibleColumns.descrizione !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="descrizione"
                      value={item.descrizione}
                      displayValue={item.descrizione}
                      align="left"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "descrizione"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "descrizione"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="font-sans font-medium text-[var(--foreground)] truncate max-w-[420px]"
                    />
                  )}

                  {/* U.M. */}
                  {visibleColumns.um !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="um"
                      value={item.um || "NR."}
                      displayValue={item.um || "NR."}
                      align="center"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "um"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "um"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="text-[var(--muted-foreground)] w-14"
                    />
                  )}

                  {/* Acquisto Base (€) */}
                  {visibleColumns.prezzo_acquisto !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="prezzo_acquisto"
                      value={item.prezzo_acquisto ?? ""}
                      displayValue={formatEuro(item.prezzo_acquisto, 4)}
                      align="right"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "prezzo_acquisto"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "prezzo_acquisto"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="text-[var(--foreground)] font-medium bg-sky-950/10"
                    />
                  )}

                  {/* Aumento (%) */}
                  {visibleColumns.aumento !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="aumento"
                      value={item.aumento ?? ""}
                      displayValue={formatPercent(item.aumento)}
                      align="right"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "aumento"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "aumento"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="text-[var(--muted-foreground)] bg-sky-950/10"
                    />
                  )}

                  {/* Magazzino (%) */}
                  {visibleColumns.maga !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="maga"
                      value={item.maga ?? ""}
                      displayValue={formatPercent(item.maga)}
                      align="right"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "maga"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "maga"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="text-[var(--muted-foreground)] bg-sky-950/10"
                    />
                  )}

                  {/* Acquisto Maggiorato (R2) - Calcolato */}
                  {visibleColumns.costo_maggiorato !== false && (
                    <td
                      className="px-3 py-1 text-right font-bold bg-sky-900/20 text-sky-200 border-x border-sky-500/20"
                      title="Prezzo acquisto base maggiorato da aumento e magazzino"
                    >
                      {formatEuro(costoMagg, 4)}
                    </td>
                  )}

                  {/* % Pubblico */}
                  {visibleColumns.perc_pub !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="perc_pub"
                      value={item.perc_pub ?? ""}
                      displayValue={formatPercent(item.perc_pub)}
                      align="right"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "perc_pub"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "perc_pub"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="text-[var(--muted-foreground)]"
                    />
                  )}

                  {/* Prezzo Pubblico (€) */}
                  {visibleColumns.prezzo_pubblico !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="prezzo_pubblico"
                      value={item.prezzo_pubblico ?? ""}
                      displayValue={formatEuro(item.prezzo_pubblico)}
                      align="right"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "prezzo_pubblico"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "prezzo_pubblico"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="font-medium text-[var(--foreground)]"
                    />
                  )}

                  {/* % Profess */}
                  {visibleColumns.perc_prof !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="perc_prof"
                      value={item.perc_prof ?? ""}
                      displayValue={formatPercent(item.perc_prof)}
                      align="right"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "perc_prof"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "perc_prof"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="text-[var(--muted-foreground)]"
                    />
                  )}

                  {/* Prezzo Profess (€) */}
                  {visibleColumns.prezzo_profess !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="prezzo_profess"
                      value={item.prezzo_profess ?? ""}
                      displayValue={formatEuro(item.prezzo_profess)}
                      align="right"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "prezzo_profess"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "prezzo_profess"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="font-medium text-[var(--foreground)]"
                    />
                  )}

                  {/* % Fattura */}
                  {visibleColumns.perc_fatt !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="perc_fatt"
                      value={item.perc_fatt ?? ""}
                      displayValue={formatPercent(item.perc_fatt)}
                      align="right"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "perc_fatt"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "perc_fatt"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="text-[var(--muted-foreground)]"
                    />
                  )}

                  {/* Prezzo Fattura (€) - Evidenziato Giallino */}
                  {visibleColumns.prezzo_fattura !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="prezzo_fattura"
                      value={item.prezzo_fattura ?? ""}
                      displayValue={formatEuro(item.prezzo_fattura)}
                      align="right"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "prezzo_fattura"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "prezzo_fattura"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="font-bold bg-amber-500/15 text-amber-200 border-x border-amber-500/20"
                    />
                  )}

                  {/* IVA */}
                  {visibleColumns.perc_iva !== false && (
                    <EditableCell
                      rowId={item.id}
                      colId="perc_iva"
                      value={item.perc_iva ?? 0.22}
                      displayValue={formatPercent(item.perc_iva)}
                      align="center"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "perc_iva"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "perc_iva"}
                      editValue={cellEditValue}
                      canEdit={canEdit}
                      onStartEdit={startEditing}
                      onChangeValue={setCellEditValue}
                      onCommit={commitCellEdit}
                      onKeyDown={handleCellKeyDown}
                      inputRef={cellInputRef}
                      className="text-[var(--muted-foreground)]"
                    />
                  )}
                </tr>
              );
            })}

            {/* 10 RIGHE VUOTE SEMPRE IN FONDO PER CREAZIONE CONTINUA NUOVI ARTICOLI */}
            {canEdit &&
              bufferRows.map((bufRow, bufIdx) => {
                const costoMagg =
                  bufRow.r2 ??
                  calculateCostoMaggiorato(bufRow.prezzo_acquisto, bufRow.aumento, bufRow.maga);

                return (
                  <tr
                    key={bufRow.id}
                    className="bg-[var(--card)]/40 hover:bg-[var(--background)]/80 text-[var(--muted-foreground)]/80 transition-colors"
                  >
                    <td className="px-2 py-1 text-center font-mono text-[10px] text-[var(--muted-foreground)]/50">
                      +{bufIdx + 1}
                    </td>

                    {visibleColumns.history !== false && (
                      <td className="px-2 py-1 text-center text-[var(--muted-foreground)]/30">—</td>
                    )}

                    {visibleColumns.cat !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="cat"
                        value={bufRow.cat || ""}
                        displayValue={bufRow.cat || "Nuova Cat..."}
                        align="left"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "cat"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "cat"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                        className="italic text-[var(--muted-foreground)]/60"
                      />
                    )}

                    {visibleColumns.fornitore !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="fornitore"
                        value={bufRow.fornitore || ""}
                        displayValue={bufRow.fornitore || "Fornitore..."}
                        align="left"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "fornitore"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "fornitore"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                        className="italic text-[var(--muted-foreground)]/60"
                      />
                    )}

                    {visibleColumns.codice_articolo !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="codice_articolo"
                        value={bufRow.codice_articolo || ""}
                        displayValue={bufRow.codice_articolo || "Codice..."}
                        align="left"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "codice_articolo"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "codice_articolo"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                        className="italic text-[var(--muted-foreground)]/60"
                      />
                    )}

                    {visibleColumns.data_ref !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="data_ref"
                        value={bufRow.data_ref || ""}
                        displayValue={bufRow.data_ref || "—"}
                        align="center"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "data_ref"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "data_ref"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                      />
                    )}

                    {visibleColumns.descrizione !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="descrizione"
                        value={bufRow.descrizione}
                        displayValue={bufRow.descrizione || "Digita descrizione nuovo articolo..."}
                        align="left"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "descrizione"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "descrizione"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                        className="italic text-[var(--muted-foreground)]/60"
                      />
                    )}

                    {visibleColumns.um !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="um"
                        value={bufRow.um || "NR."}
                        displayValue={bufRow.um || "NR."}
                        align="center"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "um"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "um"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                      />
                    )}

                    {visibleColumns.prezzo_acquisto !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="prezzo_acquisto"
                        value={bufRow.prezzo_acquisto ?? ""}
                        displayValue={formatEuro(bufRow.prezzo_acquisto, 4)}
                        align="right"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "prezzo_acquisto"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "prezzo_acquisto"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                      />
                    )}

                    {visibleColumns.aumento !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="aumento"
                        value={bufRow.aumento ?? ""}
                        displayValue={formatPercent(bufRow.aumento)}
                        align="right"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "aumento"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "aumento"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                      />
                    )}

                    {visibleColumns.maga !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="maga"
                        value={bufRow.maga ?? ""}
                        displayValue={formatPercent(bufRow.maga)}
                        align="right"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "maga"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "maga"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                      />
                    )}

                    {visibleColumns.costo_maggiorato !== false && (
                      <td className="px-3 py-1 text-right font-medium text-[var(--muted-foreground)]/50 border-x border-[var(--border)]/30">
                        {formatEuro(costoMagg, 4)}
                      </td>
                    )}

                    {visibleColumns.perc_pub !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="perc_pub"
                        value={bufRow.perc_pub ?? ""}
                        displayValue={formatPercent(bufRow.perc_pub)}
                        align="right"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "perc_pub"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "perc_pub"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                      />
                    )}

                    {visibleColumns.prezzo_pubblico !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="prezzo_pubblico"
                        value={bufRow.prezzo_pubblico ?? ""}
                        displayValue={formatEuro(bufRow.prezzo_pubblico)}
                        align="right"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "prezzo_pubblico"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "prezzo_pubblico"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                      />
                    )}

                    {visibleColumns.perc_prof !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="perc_prof"
                        value={bufRow.perc_prof ?? ""}
                        displayValue={formatPercent(bufRow.perc_prof)}
                        align="right"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "perc_prof"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "perc_prof"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                      />
                    )}

                    {visibleColumns.prezzo_profess !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="prezzo_profess"
                        value={bufRow.prezzo_profess ?? ""}
                        displayValue={formatEuro(bufRow.prezzo_profess)}
                        align="right"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "prezzo_profess"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "prezzo_profess"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                      />
                    )}

                    {visibleColumns.perc_fatt !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="perc_fatt"
                        value={bufRow.perc_fatt ?? ""}
                        displayValue={formatPercent(bufRow.perc_fatt)}
                        align="right"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "perc_fatt"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "perc_fatt"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                      />
                    )}

                    {visibleColumns.prezzo_fattura !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="prezzo_fattura"
                        value={bufRow.prezzo_fattura ?? ""}
                        displayValue={formatEuro(bufRow.prezzo_fattura)}
                        align="right"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "prezzo_fattura"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "prezzo_fattura"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                        className="border-x border-amber-500/20"
                      />
                    )}

                    {visibleColumns.perc_iva !== false && (
                      <EditableCell
                        rowId={bufRow.id}
                        colId="perc_iva"
                        value={bufRow.perc_iva ?? 0.22}
                        displayValue={formatPercent(bufRow.perc_iva)}
                        align="center"
                        isActive={activeCell?.rowId === bufRow.id && activeCell?.colId === "perc_iva"}
                        isEditing={editingCell?.rowId === bufRow.id && editingCell?.colId === "perc_iva"}
                        editValue={cellEditValue}
                        canEdit={canEdit}
                        onStartEdit={startEditing}
                        onChangeValue={setCellEditValue}
                        onCommit={commitCellEdit}
                        onKeyDown={handleCellKeyDown}
                        inputRef={cellInputRef}
                      />
                    )}
                  </tr>
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

      {/* 3. Footer con conteggio e stato Excel */}
      <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-[11px] text-[var(--muted-foreground)] font-mono">
        <div className="flex items-center space-x-3">
          <span>
            Visualizzati: {Math.min(visibleCount, filteredItems.length)} su {filteredItems.length} filtrati (Totale DB: {totalDbCount})
          </span>
          {canEdit && (
            <span className="text-emerald-500/90 flex items-center space-x-1">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Modalità Excel attiva (Frecce, Tab, Invio, Ctrl+C / Ctrl+V supportati)</span>
            </span>
          )}
        </div>
        <div className="flex items-center space-x-3">
          {lastSavedTime && (
            <span className="text-xs text-[var(--muted-foreground)]">
              Ultimo salvataggio: {lastSavedTime.toLocaleTimeString()}
            </span>
          )}
          <span>Listino Generale + Listini Vari (Unificati)</span>
        </div>
      </div>

      {/* Modale Storico Modifiche Riga */}
      <ItemPriceHistoryModal
        isOpen={Boolean(historyModalItem)}
        onClose={() => setHistoryModalItem(null)}
        item={historyModalItem}
      />
    </div>
  );
};

// Componente Cella Editabile Stile Excel
interface EditableCellProps {
  rowId: string;
  colId: string;
  value: any;
  displayValue: string;
  align?: "left" | "center" | "right";
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  canEdit: boolean;
  onStartEdit: (rowId: string, colId: string) => void;
  onChangeValue: (v: string) => void;
  onCommit: () => void;
  onKeyDown: (e: React.KeyboardEvent, rowId: string, colId: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  className?: string;
}

const EditableCell: React.FC<EditableCellProps> = ({
  rowId,
  colId,
  displayValue,
  align = "left",
  isActive,
  isEditing,
  editValue,
  canEdit,
  onStartEdit,
  onChangeValue,
  onCommit,
  onKeyDown,
  inputRef,
  className = "",
}) => {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  if (isEditing) {
    return (
      <td className={`p-0 relative ${alignClass} ${className}`}>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => onChangeValue(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => onKeyDown(e, rowId, colId)}
          className={`w-full h-full px-2 py-1 bg-[var(--background)] text-[var(--foreground)] outline-none border-2 border-[var(--primary)] text-[11.5px] font-mono shadow-inner ${alignClass}`}
        />
      </td>
    );
  }

  return (
    <td
      onClick={() => onStartEdit(rowId, colId)}
      onDoubleClick={() => onStartEdit(rowId, colId)}
      onKeyDown={(e) => onKeyDown(e, rowId, colId)}
      tabIndex={canEdit ? 0 : -1}
      className={`px-2.5 py-1.5 transition-all outline-none cursor-pointer select-none ${alignClass} ${className} ${
        isActive
          ? "ring-2 ring-[var(--primary)] ring-inset bg-[var(--primary)]/10 font-semibold"
          : ""
      }`}
      title={displayValue}
    >
      {displayValue}
    </td>
  );
};

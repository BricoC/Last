import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useDeferredValue,
  useCallback,
  useLayoutEffect,
  memo,
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
  Plus,
  Trash2,
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
} from "./utils/priceFormulas";

const BATCH_SIZE = 150;

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

// Ordine esatto colonne modificabili richiesto:
// ... | U.M. | % PUB | PUBBLICO | % PROF | PROFESS | % FATT | FATTURA | ACQUISTO BASE | IVA | AUMENTO % | MAGAZZINO % | ACQ. MAGG.
const EDITABLE_COL_ORDER = [
  "cat",
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
  "prezzo_acquisto", // tra fattura ed iva
  "perc_iva",
  "aumento", // dopo iva
  "maga", // dopo iva
] as const;

type EditableColumnKey = (typeof EDITABLE_COL_ORDER)[number];

function createBlankRow(): ListinoGeneraleRow {
  return {
    id: `new_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
  return isNaN(num) ? null : round5(num);
}

function parseInputPercent(val: string): number | null {
  const num = parseInputNumber(val);
  if (num == null) return null;
  return round5(num > 2 ? num / 100 : num);
}

function formatEuro5(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  const rounded = round5(val);
  return `€ ${rounded.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 5,
  })}`;
}

function formatPercentClean(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  const pct = val > 2 ? val : val * 100;
  const rounded = Math.round(pct * 100) / 100;
  return `${rounded.toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function getFormattedInitValue(val: any, col: string, char?: string): string {
  if (char !== undefined) return char;
  if (val == null) return "";
  if (
    col === "perc_pub" ||
    col === "perc_prof" ||
    col === "perc_fatt" ||
    col === "aumento" ||
    col === "maga" ||
    col === "perc_iva"
  ) {
    const pct = val > 2 ? val : val * 100;
    return `${round5(pct)}%`;
  }
  return String(val);
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

  // 1 Riga vuota sempre in cima per creazione nuovi articoli
  const [newTopRow, setNewTopRow] = useState<ListinoGeneraleRow>(() => createBlankRow());

  // Tracciamento modifiche non salvate
  const [dirtyRows, setDirtyRows] = useState<Map<string, ListinoGeneraleRow>>(new Map());
  const [originalRowsSnapshot, setOriginalRowsSnapshot] = useState<Map<string, ListinoGeneraleRow>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  // Selezione righe per Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Ricerca rapida e ordinamento
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Cella attiva ed editing
  const [activeCell, setActiveCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [initialEditChar, setInitialEditChar] = useState<string | undefined>(undefined);

  // Modale Storico Variazioni Riga (Colonna A...)
  const [historyModalItem, setHistoryModalItem] = useState<ListinoGeneraleRow | null>(null);

  // Riferimento container tabella
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Timer auto-save silenzioso ogni 10 minuti (configurabile)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Caricamento iniziale da SQLite locale
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const count = await priceListRepository.getGeneralCount();
      setTotalDbCount(count);
      const rows = await priceListRepository.searchGeneral("", 15000);
      setItems(rows);

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

  // Visualizzazione elementi: filtrati per ricerca rapida, ma l'ordine rimane STABILE durante l'editing!
  const filteredItems = useMemo(() => {
    let result = items;

    if (searchTokens.length > 0) {
      result = result.filter((item) => {
        const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""} ${item.cat || ""}`.toLowerCase();
        return searchTokens.every((token) => text.includes(token));
      });
    }

    if (!sortField) {
      return result;
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

  // Funzione di calcolo riga con formule bidirezionali e data aggiornata automaticamente
  const updateRowWithField = useCallback(
    (
      prevRow: ListinoGeneraleRow,
      colId: EditableColumnKey | string,
      rawVal: string | number | null
    ): ListinoGeneraleRow => {
      const updated: ListinoGeneraleRow = { ...prevRow };

      // Aggiorna automaticamente la data ad oggi (AAAA-MM-GG) ad ogni modifica effettuata
      const todayIso = new Date().toISOString().split("T")[0];
      if (colId !== "data_ref") {
        updated.data_ref = todayIso;
      }

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
        case "aumento": {
          const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal ?? ""));
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
          const num = typeof rawVal === "number" ? rawVal : parseInputPercent(String(rawVal ?? ""));
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
  const saveAllPendingChanges = useCallback(async () => {
    if (dirtyRows.size === 0 || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const rowsToSave = Array.from(dirtyRows.values());

      const logEntries: Omit<PriceListLogEntry, "id">[] = [];
      const nowIso = new Date().toISOString();
      const operatorName = currentUser?.name || currentUser?.station_name || "Operatore";

      for (const row of rowsToSave) {
        const original = originalRowsSnapshot.get(row.id);
        if (original && row.codice_articolo) {
          if (original.prezzo_acquisto !== row.prezzo_acquisto) {
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
              variazione_pct: round5(pct),
              operatore: operatorName,
              motivo: "Modifica Excel Listino Generale",
            });
          }
          if (original.prezzo_fattura !== row.prezzo_fattura) {
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
              variazione_pct: round5(pct),
              operatore: operatorName,
              motivo: "Modifica Excel Listino Generale",
            });
          }
          if (original.prezzo_pubblico !== row.prezzo_pubblico) {
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
              variazione_pct: round5(pct),
              operatore: operatorName,
              motivo: "Modifica Excel Listino Generale",
            });
          }
        }
      }

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
      setLastSavedTime(new Date());

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

  // Gestione timer auto-save silenzioso
  const scheduleSilentAutoSaveIfNeeded = useCallback(() => {
    if (autoSaveTimerRef.current !== null) {
      return;
    }
    const savedMinStr = localStorage.getItem("price_list_autosave_minutes");
    const intervalMin = savedMinStr ? Math.max(1, parseInt(savedMinStr, 10)) : 10;
    const intervalMs = intervalMin * 60 * 1000;

    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void saveAllPendingChanges();
    }, intervalMs);
  }, [saveAllPendingChanges]);

  // Applica modifica ad una cella
  const applyCellChange = useCallback(
    (rowId: string, colId: string, value: string | number | null) => {
      if (rowId === newTopRow.id) {
        const updatedTop = updateRowWithField(newTopRow, colId, value);

        const hasData = Boolean(
          updatedTop.descrizione?.trim() ||
            updatedTop.codice_articolo?.trim() ||
            updatedTop.prezzo_acquisto != null ||
            updatedTop.prezzo_fattura != null
        );

        if (hasData) {
          setItems((prev) => [updatedTop, ...prev]);
          setDirtyRows((prev) => {
            const next = new Map(prev);
            next.set(updatedTop.id, updatedTop);
            return next;
          });
          setNewTopRow(createBlankRow());
          scheduleSilentAutoSaveIfNeeded();
        } else {
          setNewTopRow(updatedTop);
        }
        return;
      }

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
      scheduleSilentAutoSaveIfNeeded();
    },
    [newTopRow, updateRowWithField, scheduleSilentAutoSaveIfNeeded]
  );

  // Apertura editor cella istantanea
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
    (rowId: string, colId: string, committedValue: string) => {
      applyCellChange(rowId, colId, committedValue);
      setEditingCell(null);
      setInitialEditChar(undefined);
    },
    [applyCellChange]
  );

  const cancelCellEdit = useCallback(() => {
    setEditingCell(null);
    setInitialEditChar(undefined);
  }, []);

  // Navigazione tastiera stile Excel
  const handleCellKeyDown = useCallback(
    (
      e: React.KeyboardEvent,
      rowId: string,
      colId: string,
      currentValStr: string
    ) => {
      const isEditing = Boolean(editingCell && editingCell.rowId === rowId && editingCell.colId === colId);
      const allVisibleCols = EDITABLE_COL_ORDER.filter((c) => visibleColumns[c] !== false);
      const colIdx = allVisibleCols.indexOf(colId as EditableColumnKey);
      const allRows = [newTopRow, ...filteredItems.slice(0, visibleCount)];
      const rowIdx = allRows.findIndex((r) => r.id === rowId);

      if (e.key === "Enter") {
        e.preventDefault();
        if (isEditing) {
          commitCellEdit(rowId, colId, currentValStr);
        }
        if (rowIdx < allRows.length - 1) {
          const nextRow = allRows[rowIdx + 1];
          startEditing(nextRow.id, colId);
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (isEditing) {
          commitCellEdit(rowId, colId, currentValStr);
        }
        if (e.shiftKey) {
          if (colIdx > 0) {
            startEditing(rowId, allVisibleCols[colIdx - 1]);
          } else if (rowIdx > 0) {
            const prevRow = allRows[rowIdx - 1];
            startEditing(prevRow.id, allVisibleCols[allVisibleCols.length - 1]);
          }
        } else {
          if (colIdx < allVisibleCols.length - 1) {
            startEditing(rowId, allVisibleCols[colIdx + 1]);
          } else if (rowIdx < allRows.length - 1) {
            const nextRow = allRows[rowIdx + 1];
            startEditing(nextRow.id, allVisibleCols[0]);
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelCellEdit();
      } else if (!isEditing) {
        if (e.key === "ArrowDown" && rowIdx < allRows.length - 1) {
          e.preventDefault();
          e.stopPropagation();
          startEditing(allRows[rowIdx + 1].id, colId);
        } else if (e.key === "ArrowUp" && rowIdx > 0) {
          e.preventDefault();
          e.stopPropagation();
          startEditing(allRows[rowIdx - 1].id, colId);
        } else if (e.key === "ArrowRight" && colIdx < allVisibleCols.length - 1) {
          e.preventDefault();
          e.stopPropagation();
          startEditing(rowId, allVisibleCols[colIdx + 1]);
        } else if (e.key === "ArrowLeft" && colIdx > 0) {
          e.preventDefault();
          e.stopPropagation();
          startEditing(rowId, allVisibleCols[colIdx - 1]);
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          startEditing(rowId, colId, e.key);
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
      startEditing,
      cancelCellEdit,
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
        targetRow = createBlankRow();
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
          .map((r) => allVisibleCols.map((col) => String((r as any)[col] ?? "")).join("\t"))
          .join("\n");
        void navigator.clipboard.writeText(tsv);
      } else if (activeCell) {
        e.preventDefault();
        const allRows = [newTopRow, ...filteredItems];
        const row = allRows.find((r) => r.id === activeCell.rowId);
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
      await priceListRepository.deleteGeneralRows(idsToDelete);
      setItems((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      setDirtyRows((prev) => {
        const next = new Map(prev);
        idsToDelete.forEach((id) => next.delete(id));
        return next;
      });
      setSelectedIds(new Set());
      void priceListSyncService.deleteGeneralBatchFromSupabase(idsToDelete);
      return;
    }

    setItems((prev) =>
      prev.map((r) => {
        if (!selectedIds.has(r.id)) return r;

        let updated = { ...r };
        const numVal = typeof payload.value === "number" ? payload.value : parseFloat(String(payload.value));

        switch (payload.action) {
          case "var_acq_perc": {
            if (!isNaN(numVal)) {
              const currentAcq = updated.prezzo_acquisto || 0;
              const newAcq = round5(currentAcq * (1 + numVal / 100));
              updated = updateRowWithField(updated, "prezzo_acquisto", newAcq);
            }
            break;
          }
          case "var_acq_val": {
            if (!isNaN(numVal)) {
              const currentAcq = updated.prezzo_acquisto || 0;
              const newAcq = round5(Math.max(0, currentAcq + numVal));
              updated = updateRowWithField(updated, "prezzo_acquisto", newAcq);
            }
            break;
          }
          case "set_aumento": {
            if (!isNaN(numVal)) {
              updated = updateRowWithField(updated, "aumento", round5(numVal / 100));
            }
            break;
          }
          case "set_maga": {
            if (!isNaN(numVal)) {
              updated = updateRowWithField(updated, "maga", round5(numVal / 100));
            }
            break;
          }
          case "var_pub_perc": {
            if (!isNaN(numVal)) {
              const currentPub = updated.prezzo_pubblico || 0;
              const newPub = round5(currentPub * (1 + numVal / 100));
              updated = updateRowWithField(updated, "prezzo_pubblico", newPub);
            }
            break;
          }
          case "var_prof_perc": {
            if (!isNaN(numVal)) {
              const currentProf = updated.prezzo_profess || 0;
              const newProf = round5(currentProf * (1 + numVal / 100));
              updated = updateRowWithField(updated, "prezzo_profess", newProf);
            }
            break;
          }
          case "var_fatt_perc": {
            if (!isNaN(numVal)) {
              const currentFatt = updated.prezzo_fattura || 0;
              const newFatt = round5(currentFatt * (1 + numVal / 100));
              updated = updateRowWithField(updated, "prezzo_fattura", newFatt);
            }
            break;
          }
          case "set_perc_fatt": {
            if (!isNaN(numVal)) {
              updated = updateRowWithField(updated, "perc_fatt", round5(numVal / 100));
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
              updated = updateRowWithField(updated, "perc_iva", round5(numVal / 100));
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

  // Eliminazione di una singola riga dal listino
  const handleDeleteRow = useCallback(
    async (row: ListinoGeneraleRow) => {
      if (!canEdit) return;
      const desc = row.descrizione || row.codice_articolo || "questo articolo";
      if (!confirm(`Sei sicuro di voler eliminare "${desc}" dal listino?`)) {
        return;
      }
      try {
        await priceListRepository.deleteGeneralRows([row.id]);
        setItems((prev) => prev.filter((r) => r.id !== row.id));
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
        void priceListSyncService.deleteGeneralBatchFromSupabase([row.id]);
      } catch (err: any) {
        console.error("Errore cancellazione articolo:", err);
        setError(`Errore cancellazione articolo: ${err?.message || err}`);
      }
    },
    [canEdit]
  );

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

        <div className="flex items-center space-x-2 text-xs shrink-0">
          <ColumnVisibilityMenu
            columns={ALL_GENERAL_COLUMNS}
            visibleColumns={visibleColumns}
            onToggleColumn={toggleColumn}
            onResetDefault={resetDefaultColumns}
          />

          <button
            type="button"
            onClick={loadData}
            disabled={loading || isSaving}
            className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            title="Ricarica lista da SQLite locale"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={saveAllPendingChanges}
              disabled={dirtyRows.size === 0 || isSaving}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors ${
                dirtyRows.size > 0
                  ? "bg-[var(--primary)] hover:opacity-90 text-white cursor-pointer"
                  : "bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] opacity-70 cursor-default"
              }`}
              title={
                dirtyRows.size > 0
                  ? `Salva subito ${dirtyRows.size} articoli modificati`
                  : "Nessuna modifica da salvare"
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
                  <span>Salva Modifiche ({dirtyRows.size})</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Salvato</span>
                </>
              )}
            </button>
          )}

          <span className="px-2.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] font-semibold text-[var(--primary)]">
            Articoli: {totalDbCount}
          </span>
        </div>
      </div>

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
              <th className="px-2 py-2 w-8 text-center bg-[var(--background)] sticky left-0 z-20">
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === filteredItems.length}
                  onChange={handleToggleSelectAll}
                  className="rounded border-[var(--border)]"
                />
              </th>

              {visibleColumns.history !== false && (
                <th className="px-2 py-2 w-10 text-center" title="Storico modifiche riga">
                  A...
                </th>
              )}

              {/* Colonna Cestino per eliminare riga singola */}
              {visibleColumns.actions !== false && canEdit && (
                <th className="px-1.5 py-2 w-8 text-center" title="Elimina riga articolo">
                  <Trash2 className="w-3.5 h-3.5 mx-auto text-[var(--muted-foreground)]" />
                </th>
              )}

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

              {visibleColumns.data_ref !== false && (
                <th className="px-2 py-2 text-center w-20">DATA</th>
              )}

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

              {visibleColumns.um !== false && (
                <th className="px-2 py-2 text-center w-14">U.M.</th>
              )}

              {visibleColumns.perc_pub !== false && (
                <th className="px-2.5 py-2 text-right w-16">% PUB</th>
              )}

              {visibleColumns.prezzo_pubblico !== false && (
                <th
                  className="px-3 py-2 text-right w-24 cursor-pointer hover:text-[var(--foreground)]"
                  onClick={() => handleToggleSort("prezzo_pubblico")}
                >
                  PUBBLICO
                </th>
              )}

              {visibleColumns.perc_prof !== false && (
                <th className="px-2.5 py-2 text-right w-16">% PROF</th>
              )}

              {visibleColumns.prezzo_profess !== false && (
                <th
                  className="px-3 py-2 text-right w-24 cursor-pointer hover:text-[var(--foreground)]"
                  onClick={() => handleToggleSort("prezzo_profess")}
                >
                  PROFESS
                </th>
              )}

              {visibleColumns.perc_fatt !== false && (
                <th className="px-2.5 py-2 text-right w-16">% FATT</th>
              )}

              {visibleColumns.prezzo_fattura !== false && (
                <th
                  className="px-3 py-2 text-right w-28 bg-amber-500/20 text-amber-300 font-bold border-x border-amber-500/30 cursor-pointer"
                  onClick={() => handleToggleSort("prezzo_fattura")}
                >
                  FATTURA
                </th>
              )}

              {/* ACQUISTO BASE (posizionato tra FATTURA ed IVA) */}
              {visibleColumns.prezzo_acquisto !== false && (
                <th
                  className="px-3 py-2 text-right w-28 cursor-pointer hover:text-[var(--foreground)] bg-sky-950/30 text-sky-200 font-semibold border-x border-sky-500/30"
                  onClick={() => handleToggleSort("prezzo_acquisto")}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>ACQ. BASE</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}

              {/* IVA */}
              {visibleColumns.perc_iva !== false && (
                <th className="px-2.5 py-2 text-center w-14">IVA</th>
              )}

              {/* Colonne create posizionate DOPO IVA */}
              {visibleColumns.aumento !== false && (
                <th className="px-2.5 py-2 text-right w-16 bg-sky-950/20">AUMENTO %</th>
              )}

              {visibleColumns.maga !== false && (
                <th className="px-2.5 py-2 text-right w-16 bg-sky-950/20">MAGAZZINO %</th>
              )}

              {visibleColumns.costo_maggiorato !== false && (
                <th
                  className="px-3 py-2 text-right w-28 bg-sky-900/40 text-sky-300 font-bold border-x border-sky-500/30 cursor-pointer"
                  onClick={() => handleToggleSort("costo_maggiorato")}
                  title="Costo base + Aumento% + Magazzino% (Riferimento per tutti i prezzi)"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>ACQ. MAGG.</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11.5px]">
            {/* RIGA VUOTA IN CIMA SEMPRE VISIBILE PER CREARE NUOVI ARTICOLI */}
            {canEdit && (
              <tr className="bg-emerald-500/10 hover:bg-emerald-500/15 border-b-2 border-emerald-500/40 sticky top-[33px] z-10 shadow-sm">
                <td className="px-2 py-1 text-center bg-[var(--card)] sticky left-0 z-10">
                  <span className="flex items-center justify-center text-emerald-400 font-bold text-[10px]">
                    <Plus className="w-3.5 h-3.5" />
                  </span>
                </td>

                {visibleColumns.history !== false && (
                  <td className="px-2 py-1 text-center text-emerald-400/60 font-semibold text-[10px]">
                    NUOVO
                  </td>
                )}

                {visibleColumns.actions !== false && canEdit && (
                  <td className="px-1.5 py-1 text-center text-[var(--muted-foreground)]/30">—</td>
                )}

                {visibleColumns.cat !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="cat"
                    value={newTopRow.cat || ""}
                    displayValue={newTopRow.cat || "Categoria..."}
                    align="left"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "cat"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "cat"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "cat" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="italic text-emerald-200/70"
                  />
                )}

                {visibleColumns.fornitore !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="fornitore"
                    value={newTopRow.fornitore || ""}
                    displayValue={newTopRow.fornitore || "Fornitore..."}
                    align="left"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "fornitore"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "fornitore"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "fornitore" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="italic text-emerald-200/70"
                  />
                )}

                {visibleColumns.codice_articolo !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="codice_articolo"
                    value={newTopRow.codice_articolo || ""}
                    displayValue={newTopRow.codice_articolo || "Codice..."}
                    align="left"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "codice_articolo"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "codice_articolo"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "codice_articolo" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="italic font-bold text-emerald-400"
                  />
                )}

                {visibleColumns.data_ref !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="data_ref"
                    value={newTopRow.data_ref || ""}
                    displayValue={newTopRow.data_ref || "—"}
                    align="center"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "data_ref"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "data_ref"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "data_ref" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                  />
                )}

                {visibleColumns.descrizione !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="descrizione"
                    value={newTopRow.descrizione}
                    displayValue={newTopRow.descrizione || "Digita per inserire nuovo articolo..."}
                    align="left"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "descrizione"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "descrizione"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "descrizione" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="italic text-emerald-200/80 font-medium"
                  />
                )}

                {visibleColumns.um !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="um"
                    value={newTopRow.um || "NR."}
                    displayValue={newTopRow.um || "NR."}
                    align="center"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "um"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "um"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "um" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                  />
                )}

                {visibleColumns.perc_pub !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="perc_pub"
                    value={newTopRow.perc_pub ?? ""}
                    displayValue={formatPercentClean(newTopRow.perc_pub)}
                    align="right"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_pub"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_pub"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_pub" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                  />
                )}

                {visibleColumns.prezzo_pubblico !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="prezzo_pubblico"
                    value={newTopRow.prezzo_pubblico ?? ""}
                    displayValue={formatEuro5(newTopRow.prezzo_pubblico)}
                    align="right"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "prezzo_pubblico"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_pubblico"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_pubblico" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                  />
                )}

                {visibleColumns.perc_prof !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="perc_prof"
                    value={newTopRow.perc_prof ?? ""}
                    displayValue={formatPercentClean(newTopRow.perc_prof)}
                    align="right"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_prof"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_prof"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_prof" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                  />
                )}

                {visibleColumns.prezzo_profess !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="prezzo_profess"
                    value={newTopRow.prezzo_profess ?? ""}
                    displayValue={formatEuro5(newTopRow.prezzo_profess)}
                    align="right"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "prezzo_profess"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_profess"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_profess" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                  />
                )}

                {visibleColumns.perc_fatt !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="perc_fatt"
                    value={newTopRow.perc_fatt ?? ""}
                    displayValue={formatPercentClean(newTopRow.perc_fatt)}
                    align="right"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_fatt"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_fatt"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_fatt" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                  />
                )}

                {visibleColumns.prezzo_fattura !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="prezzo_fattura"
                    value={newTopRow.prezzo_fattura ?? ""}
                    displayValue={formatEuro5(newTopRow.prezzo_fattura)}
                    align="right"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "prezzo_fattura"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_fattura"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_fattura" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="border-x border-amber-500/20"
                  />
                )}

                {visibleColumns.prezzo_acquisto !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="prezzo_acquisto"
                    value={newTopRow.prezzo_acquisto ?? ""}
                    displayValue={formatEuro5(newTopRow.prezzo_acquisto)}
                    align="right"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "prezzo_acquisto"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_acquisto"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_acquisto" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="border-x border-sky-500/20"
                  />
                )}

                {visibleColumns.perc_iva !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="perc_iva"
                    value={newTopRow.perc_iva ?? 0.22}
                    displayValue={formatPercentClean(newTopRow.perc_iva)}
                    align="center"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_iva"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_iva"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_iva" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                  />
                )}

                {visibleColumns.aumento !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="aumento"
                    value={newTopRow.aumento ?? ""}
                    displayValue={formatPercentClean(newTopRow.aumento)}
                    align="right"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "aumento"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "aumento"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "aumento" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                  />
                )}

                {visibleColumns.maga !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="maga"
                    value={newTopRow.maga ?? ""}
                    displayValue={formatPercentClean(newTopRow.maga)}
                    align="right"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "maga"}
                    isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "maga"}
                    initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "maga" ? initialEditChar : undefined}
                    canEdit={canEdit}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                  />
                )}

                {visibleColumns.costo_maggiorato !== false && (
                  <td className="px-3 py-1 text-right font-medium text-sky-200/70 border-x border-sky-500/20">
                    {formatEuro5(
                      newTopRow.r2 ??
                        calculateCostoMaggiorato(newTopRow.prezzo_acquisto, newTopRow.aumento, newTopRow.maga)
                    )}
                  </td>
                )}
              </tr>
            )}

            {/* RIGHE TABELLA MEMOIZZATE PER ALTE PRESTAZIONI */}
            {filteredItems.slice(0, visibleCount).map((item) => {
              const isDirty = dirtyRows.has(item.id);
              const isSelected = selectedIds.has(item.id);
              const isRowActive = activeCell?.rowId === item.id;
              const isRowEditing = editingCell?.rowId === item.id;

              return (
                <MemoizedProductRow
                  key={item.id}
                  item={item}
                  isDirty={isDirty}
                  isSelected={isSelected}
                  activeColId={isRowActive ? activeCell.colId : null}
                  editingColId={isRowEditing ? editingCell.colId : null}
                  initialEditChar={isRowEditing ? initialEditChar : undefined}
                  canEdit={canEdit}
                  visibleColumns={visibleColumns}
                  onToggleSelectRow={handleToggleSelectRow}
                  onOpenHistory={setHistoryModalItem}
                  onDeleteRow={handleDeleteRow}
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
        <div className="flex items-center space-x-3">
          <span>
            Visualizzati: {Math.min(visibleCount, filteredItems.length)} su {filteredItems.length} filtrati (Totale DB: {totalDbCount})
          </span>
          {canEdit && (
            <span className="text-emerald-500/90 flex items-center space-x-1">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Modalità Excel attiva (Click/Frecce/Tab/Invio per scrivere, Copia/Incolla rapido)</span>
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

      <ItemPriceHistoryModal
        isOpen={Boolean(historyModalItem)}
        onClose={() => setHistoryModalItem(null)}
        item={historyModalItem}
      />
    </div>
  );
};

// Componente Riga Tabella Altamente Ottimizzata (Memoized)
interface MemoizedProductRowProps {
  item: ListinoGeneraleRow;
  isDirty: boolean;
  isSelected: boolean;
  activeColId: string | null;
  editingColId: string | null;
  initialEditChar?: string;
  canEdit: boolean;
  visibleColumns: Record<string, boolean>;
  onToggleSelectRow: (id: string) => void;
  onOpenHistory: (item: ListinoGeneraleRow) => void;
  onDeleteRow: (item: ListinoGeneraleRow) => void;
  onStartEdit: (rowId: string, colId: string, char?: string) => void;
  onCommitCell: (rowId: string, colId: string, val: string) => void;
  onCancelEdit: () => void;
  onCellKeyDown: (e: React.KeyboardEvent, rowId: string, colId: string, currentValStr: string) => void;
}

const MemoizedProductRow = memo<MemoizedProductRowProps>(
  ({
    item,
    isDirty,
    isSelected,
    activeColId,
    editingColId,
    initialEditChar,
    canEdit,
    visibleColumns,
    onToggleSelectRow,
    onOpenHistory,
    onDeleteRow,
    onStartEdit,
    onCommitCell,
    onCancelEdit,
    onCellKeyDown,
  }) => {
    const costoMagg =
      item.r2 ?? calculateCostoMaggiorato(item.prezzo_acquisto, item.aumento, item.maga);

    return (
      <tr
        className={`transition-colors group cursor-default ${
          isSelected
            ? "bg-primary/15 hover:bg-primary/20"
            : isDirty
            ? "bg-amber-500/10 hover:bg-amber-500/15"
            : "hover:bg-[var(--background)]"
        }`}
      >
        <td className="px-2 py-1 text-center bg-[var(--card)] sticky left-0 z-10">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelectRow(item.id)}
            className="rounded border-[var(--border)]"
          />
        </td>

        {visibleColumns.history !== false && (
          <td className="px-2 py-1 text-center">
            <button
              type="button"
              onClick={() => onOpenHistory(item)}
              className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--card)] transition-colors"
              title="Visualizza storico modifiche riga (max 15)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </td>
        )}

        {/* Tasto Cestino Elimina Riga */}
        {visibleColumns.actions !== false && canEdit && (
          <td className="px-1.5 py-1 text-center">
            <button
              type="button"
              onClick={() => onDeleteRow(item)}
              className="p-1 rounded text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/15 transition-colors"
              title={`Elimina articolo "${item.descrizione || item.codice_articolo || ""}"`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </td>
        )}

        {visibleColumns.cat !== false && (
          <EditableCell
            rowId={item.id}
            colId="cat"
            value={item.cat || ""}
            displayValue={item.cat || "—"}
            align="left"
            isActive={activeColId === "cat"}
            isEditing={editingColId === "cat"}
            initialChar={editingColId === "cat" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="font-sans font-medium text-[var(--foreground)] truncate max-w-[90px]"
          />
        )}

        {visibleColumns.fornitore !== false && (
          <EditableCell
            rowId={item.id}
            colId="fornitore"
            value={item.fornitore || ""}
            displayValue={item.fornitore || "—"}
            align="left"
            isActive={activeColId === "fornitore"}
            isEditing={editingColId === "fornitore"}
            initialChar={editingColId === "fornitore" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="font-sans font-medium text-[var(--foreground)] truncate max-w-[85px]"
          />
        )}

        {visibleColumns.codice_articolo !== false && (
          <EditableCell
            rowId={item.id}
            colId="codice_articolo"
            value={item.codice_articolo || ""}
            displayValue={item.codice_articolo || "—"}
            align="left"
            isActive={activeColId === "codice_articolo"}
            isEditing={editingColId === "codice_articolo"}
            initialChar={editingColId === "codice_articolo" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="font-bold text-[var(--primary)] truncate max-w-[95px]"
          />
        )}

        {visibleColumns.data_ref !== false && (
          <EditableCell
            rowId={item.id}
            colId="data_ref"
            value={item.data_ref || ""}
            displayValue={item.data_ref || "—"}
            align="center"
            isActive={activeColId === "data_ref"}
            isEditing={editingColId === "data_ref"}
            initialChar={editingColId === "data_ref" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="text-[var(--muted-foreground)]"
          />
        )}

        {visibleColumns.descrizione !== false && (
          <EditableCell
            rowId={item.id}
            colId="descrizione"
            value={item.descrizione}
            displayValue={item.descrizione}
            align="left"
            isActive={activeColId === "descrizione"}
            isEditing={editingColId === "descrizione"}
            initialChar={editingColId === "descrizione" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="font-sans font-medium text-[var(--foreground)] truncate max-w-[420px]"
          />
        )}

        {visibleColumns.um !== false && (
          <EditableCell
            rowId={item.id}
            colId="um"
            value={item.um || "NR."}
            displayValue={item.um || "NR."}
            align="center"
            isActive={activeColId === "um"}
            isEditing={editingColId === "um"}
            initialChar={editingColId === "um" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="text-[var(--muted-foreground)] w-14"
          />
        )}

        {visibleColumns.perc_pub !== false && (
          <EditableCell
            rowId={item.id}
            colId="perc_pub"
            value={item.perc_pub ?? ""}
            displayValue={formatPercentClean(item.perc_pub)}
            align="right"
            isActive={activeColId === "perc_pub"}
            isEditing={editingColId === "perc_pub"}
            initialChar={editingColId === "perc_pub" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="text-[var(--muted-foreground)]"
          />
        )}

        {visibleColumns.prezzo_pubblico !== false && (
          <EditableCell
            rowId={item.id}
            colId="prezzo_pubblico"
            value={item.prezzo_pubblico ?? ""}
            displayValue={formatEuro5(item.prezzo_pubblico)}
            align="right"
            isActive={activeColId === "prezzo_pubblico"}
            isEditing={editingColId === "prezzo_pubblico"}
            initialChar={editingColId === "prezzo_pubblico" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="font-medium text-[var(--foreground)]"
          />
        )}

        {visibleColumns.perc_prof !== false && (
          <EditableCell
            rowId={item.id}
            colId="perc_prof"
            value={item.perc_prof ?? ""}
            displayValue={formatPercentClean(item.perc_prof)}
            align="right"
            isActive={activeColId === "perc_prof"}
            isEditing={editingColId === "perc_prof"}
            initialChar={editingColId === "perc_prof" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="text-[var(--muted-foreground)]"
          />
        )}

        {visibleColumns.prezzo_profess !== false && (
          <EditableCell
            rowId={item.id}
            colId="prezzo_profess"
            value={item.prezzo_profess ?? ""}
            displayValue={formatEuro5(item.prezzo_profess)}
            align="right"
            isActive={activeColId === "prezzo_profess"}
            isEditing={editingColId === "prezzo_profess"}
            initialChar={editingColId === "prezzo_profess" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="font-medium text-[var(--foreground)]"
          />
        )}

        {visibleColumns.perc_fatt !== false && (
          <EditableCell
            rowId={item.id}
            colId="perc_fatt"
            value={item.perc_fatt ?? ""}
            displayValue={formatPercentClean(item.perc_fatt)}
            align="right"
            isActive={activeColId === "perc_fatt"}
            isEditing={editingColId === "perc_fatt"}
            initialChar={editingColId === "perc_fatt" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="text-[var(--muted-foreground)]"
          />
        )}

        {visibleColumns.prezzo_fattura !== false && (
          <EditableCell
            rowId={item.id}
            colId="prezzo_fattura"
            value={item.prezzo_fattura ?? ""}
            displayValue={formatEuro5(item.prezzo_fattura)}
            align="right"
            isActive={activeColId === "prezzo_fattura"}
            isEditing={editingColId === "prezzo_fattura"}
            initialChar={editingColId === "prezzo_fattura" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="font-bold bg-amber-500/15 text-amber-200 border-x border-amber-500/20"
          />
        )}

        {visibleColumns.prezzo_acquisto !== false && (
          <EditableCell
            rowId={item.id}
            colId="prezzo_acquisto"
            value={item.prezzo_acquisto ?? ""}
            displayValue={formatEuro5(item.prezzo_acquisto)}
            align="right"
            isActive={activeColId === "prezzo_acquisto"}
            isEditing={editingColId === "prezzo_acquisto"}
            initialChar={editingColId === "prezzo_acquisto" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="text-sky-200 font-semibold bg-sky-950/20 border-x border-sky-500/20"
          />
        )}

        {visibleColumns.perc_iva !== false && (
          <EditableCell
            rowId={item.id}
            colId="perc_iva"
            value={item.perc_iva ?? 0.22}
            displayValue={formatPercentClean(item.perc_iva)}
            align="center"
            isActive={activeColId === "perc_iva"}
            isEditing={editingColId === "perc_iva"}
            initialChar={editingColId === "perc_iva" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="text-[var(--muted-foreground)]"
          />
        )}

        {visibleColumns.aumento !== false && (
          <EditableCell
            rowId={item.id}
            colId="aumento"
            value={item.aumento ?? ""}
            displayValue={formatPercentClean(item.aumento)}
            align="right"
            isActive={activeColId === "aumento"}
            isEditing={editingColId === "aumento"}
            initialChar={editingColId === "aumento" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="text-[var(--muted-foreground)] bg-sky-950/10"
          />
        )}

        {visibleColumns.maga !== false && (
          <EditableCell
            rowId={item.id}
            colId="maga"
            value={item.maga ?? ""}
            displayValue={formatPercentClean(item.maga)}
            align="right"
            isActive={activeColId === "maga"}
            isEditing={editingColId === "maga"}
            initialChar={editingColId === "maga" ? initialEditChar : undefined}
            canEdit={canEdit}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className="text-[var(--muted-foreground)] bg-sky-950/10"
          />
        )}

        {visibleColumns.costo_maggiorato !== false && (
          <td
            className="px-3 py-1 text-right font-bold bg-sky-900/20 text-sky-200 border-x border-sky-500/20"
            title="Prezzo acquisto base maggiorato da aumento e magazzino"
          >
            {formatEuro5(costoMagg)}
          </td>
        )}
      </tr>
    );
  }
);

// Componente Editor Input Cella Ultrarapido (Zero Lag)
interface CellInputEditorProps {
  rowId: string;
  colId: string;
  initialValue: string;
  alignClass: string;
  className: string;
  onCommit: (rowId: string, colId: string, val: string) => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent, rowId: string, colId: string, currentValStr: string) => void;
}

const CellInputEditor: React.FC<CellInputEditorProps> = ({
  rowId,
  colId,
  initialValue,
  alignClass,
  className,
  onCommit,
  onCancel,
  onKeyDown,
}) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (initialValue.length === 1 && !initialValue.startsWith("0")) {
        inputRef.current.setSelectionRange(1, 1);
      } else {
        inputRef.current.select();
      }
    }
  }, [initialValue]);

  return (
    <td className={`p-0 relative ${alignClass} ${className}`}>
      <input
        ref={inputRef}
        autoFocus
        type="text"
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
        className={`w-full h-full px-2 py-1 bg-[var(--background)] text-[var(--foreground)] outline-none border-2 border-[var(--primary)] text-[11.5px] font-mono shadow-inner ${alignClass}`}
      />
    </td>
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
  initialChar?: string;
  canEdit: boolean;
  onStartEdit: (rowId: string, colId: string, char?: string) => void;
  onCommit: (rowId: string, colId: string, val: string) => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent, rowId: string, colId: string, currentValStr: string) => void;
  className?: string;
}

const EditableCell: React.FC<EditableCellProps> = memo(
  ({
    rowId,
    colId,
    value,
    displayValue,
    align = "left",
    isActive,
    isEditing,
    initialChar,
    canEdit,
    onStartEdit,
    onCommit,
    onCancel,
    onKeyDown,
    className = "",
  }) => {
    const alignClass =
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

    if (isEditing) {
      return (
        <CellInputEditor
          rowId={rowId}
          colId={colId}
          initialValue={getFormattedInitValue(value, colId, initialChar)}
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
        onClick={() => onStartEdit(rowId, colId)}
        onDoubleClick={() => onStartEdit(rowId, colId)}
        onKeyDown={(e) => onKeyDown(e, rowId, colId, displayValue)}
        tabIndex={canEdit ? 0 : -1}
        className={`px-2.5 py-1.5 transition-colors outline-none cursor-pointer select-none ${alignClass} ${className} ${
          isActive
            ? "ring-2 ring-[var(--primary)] ring-inset bg-[var(--primary)]/15 font-semibold text-[var(--foreground)]"
            : ""
        }`}
        title={displayValue}
      >
        {displayValue}
      </td>
    );
  }
);

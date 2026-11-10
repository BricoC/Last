import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useDeferredValue,
  useCallback,
  memo,
} from "react";
import {
  Search,
  RefreshCw,
  X,
  ArrowUpDown,
  Tag,
  AlertCircle,
  Filter,
  Save,
  CheckCircle2,
  Trash2,
  Plus,
  RotateCcw,
  ChevronDown,
  Check,
} from "lucide-react";
import { ListinoClienteRow, PriceListLogEntry } from "./models/priceList";
import { priceListRepository } from "./services/priceListRepository";
import { priceListSyncService } from "./services/priceListSyncService";
import { orderRepository } from "@/features/orders/services/orderRepository";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { useUserStore } from "@/shared/stores/useUserStore";
import { registerWindowCloseGuard, registerDirtyCheck } from "@/shared/stores/useWindowStore";
import { UnsavedChangesModal } from "@/shared/components/ui/UnsavedChangesModal";
import { CustomerPriceListTrashModal } from "./components/CustomerPriceListTrashModal";
import { useClientColumnVisibility } from "./hooks/useColumnVisibility";
import { ColumnVisibilityMenu } from "./components/ColumnVisibilityMenu";
import { round5 } from "./utils/priceFormulas";

const BATCH_SIZE = 150;

type ClientTab = "tutti" | "duplicati" | "da_verificare";

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
] as const;

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

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str.replace(/-/g, ".");
  }
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(str)) {
    return str;
  }
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

function getFormattedInitValue(val: any, col: string, char?: string): string {
  if (char !== undefined) return char;
  if (val == null) return "";
  if (col === "perc_acquisto" || col === "ricarico") {
    return `${val}%`;
  }
  return String(val);
}

function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return typeof date === "string" ? date : "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year} alle ${hours}:${minutes}:${seconds}`;
}

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
  const [activeTab, setActiveTab] = useState<ClientTab>("tutti");

  // Dropdown Clienti personalizzato (tema scuro coordinato e ricerca)
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientDropdownSearch, setClientDropdownSearch] = useState("");
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isClientDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setIsClientDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isClientDropdownOpen]);

  const filteredDropdownClients = useMemo(() => {
    if (!clientDropdownSearch.trim()) return distinctClients;
    const term = clientDropdownSearch.toLowerCase();
    return distinctClients.filter((c) => c.toLowerCase().includes(term));
  }, [distinctClients, clientDropdownSearch]);

  const [loading, setLoading] = useState(true);
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

  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [sortField, setSortField] = useState<SortField>("cliente");
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
    setLoading(true);
    setError(null);
    try {
      const [count, clients, rows, tCount, supps] = await Promise.all([
        priceListRepository.getClientPriceCount(),
        priceListRepository.getDistinctClients(),
        priceListRepository.searchClientPrices("", undefined, 20000),
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

      // Sincronizzazione incrementale Cloud in background (zero blocco interfaccia)
      void (async () => {
        try {
          const syncRes = await priceListSyncService.syncIncrementalClientiFromSupabase();
          if (syncRes.updatedCount > 0) {
            console.log(`[CustomerPriceListPage] Sincronizzati dal Cloud ${syncRes.updatedCount} articoli listini clienti.`);
            const refreshedRows = await priceListRepository.searchClientPrices("", undefined, 20000);
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  // Ricerca tokenizzata
  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  const filteredItems = useMemo(() => {
    const newItems: ListinoClienteRow[] = [];
    const dbItems: ListinoClienteRow[] = [];

    for (const item of items) {
      if (item.id.startsWith("new_") || !originalRowsSnapshot.has(item.id)) {
        newItems.push(item);
      } else {
        dbItems.push(item);
      }
    }

    let filteredNew = newItems;
    let filteredDb = dbItems;

    // Filtro per cliente selezionato da tendina
    if (selectedClientFilter !== "TUTTI") {
      filteredNew = filteredNew.filter(
        (item) => item.cliente.toLowerCase() === selectedClientFilter.toLowerCase()
      );
      filteredDb = filteredDb.filter(
        (item) => item.cliente.toLowerCase() === selectedClientFilter.toLowerCase()
      );
    }

    // Filtro tab
    if (activeTab === "duplicati") {
      const seen = new Map<string, number>();
      for (const it of items) {
        const key = `${it.cliente}__${it.descrizione}`.toLowerCase();
        seen.set(key, (seen.get(key) || 0) + 1);
      }
      filteredDb = filteredDb.filter(
        (it) => (seen.get(`${it.cliente}__${it.descrizione}`.toLowerCase()) || 0) > 1
      );
    } else if (activeTab === "da_verificare") {
      filteredDb = filteredDb.filter((it) => !it.prezzo_fattura || it.prezzo_fattura <= 0);
    }

    if (searchTokens.length > 0) {
      filteredNew = filteredNew.filter((item) => {
        const text = `${item.cliente} ${item.fornitore || ""} ${item.descrizione} ${item.codice_articolo || ""} ${item.note || ""}`.toLowerCase();
        return searchTokens.every((token) => text.includes(token));
      });
      filteredDb = filteredDb.filter((item) => {
        const text = `${item.cliente} ${item.fornitore || ""} ${item.descrizione} ${item.codice_articolo || ""} ${item.note || ""}`.toLowerCase();
        return searchTokens.every((token) => text.includes(token));
      });
    }

    filteredDb.sort((a, b) => {
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

    return [...filteredNew, ...filteredDb];
  }, [items, selectedClientFilter, activeTab, searchTokens, sortField, sortAsc, originalRowsSnapshot]);

  // Gestione scroll infinito (caricamento progressivo automatico seamless)
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      if (scrollHeight - scrollTop - clientHeight < 500) {
        setVisibleCount((prev) =>
          prev < filteredItems.length ? Math.min(prev + BATCH_SIZE, filteredItems.length) : prev
        );
      }
    },
    [filteredItems.length]
  );

  // Reset del conteggio visibile e riporto scroll in cima al cambio di filtri
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [deferredSearch, selectedClientFilter, activeTab]);

  // Pre-carica elementi successivi se lo schermo è alto e non c'è scrollbar
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight && visibleCount < filteredItems.length) {
      setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filteredItems.length));
    }
  }, [visibleCount, filteredItems.length]);

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
      // Sempre aggiorna data_ref quando una cella viene modificata
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

        case "acquisto_eur": {
          const acq = parseNumberInput(rawValue);
          updated.acquisto_eur = acq;
          if (acq != null) {
            updated.data_acquisto = today;
          }
          // Ricalcolo Prezzo Vendita se c'è % Acquisto impostata
          if (acq != null && acq > 0 && updated.perc_acquisto != null) {
            updated.prezzo_fattura = round5(acq * (1 + updated.perc_acquisto / 100));
          } else if (acq != null && acq > 0 && updated.prezzo_fattura != null) {
            // Ricalcola % Acquisto se c'era già un Prezzo Vendita
            updated.perc_acquisto = round5(((updated.prezzo_fattura - acq) / acq) * 100);
          }
          break;
        }

        case "perc_acquisto": {
          const perc = parseNumberInput(rawValue);
          updated.perc_acquisto = perc;
          if (updated.acquisto_eur != null && updated.acquisto_eur > 0 && perc != null) {
            updated.prezzo_fattura = round5(updated.acquisto_eur * (1 + perc / 100));
          }
          break;
        }

        case "prezzo_fattura": {
          const fatt = parseNumberInput(rawValue);
          updated.prezzo_fattura = fatt;
          // Ricalcolo % Acquisto lasciando intatto l'acquisto_eur base
          if (
            fatt != null &&
            updated.acquisto_eur != null &&
            updated.acquisto_eur > 0
          ) {
            updated.perc_acquisto = round5(
              ((fatt - updated.acquisto_eur) / updated.acquisto_eur) * 100
            );
          }
          break;
        }

        case "ricarico":
          updated.ricarico = parseNumberInput(rawValue);
          break;

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
        const artCode = row.codice_articolo?.trim() || row.id;
        const artDesc = row.descrizione || "Articolo";

        if (original) {
          const checkFields: { key: keyof ListinoClienteRow; label: string }[] = [
            { key: "prezzo_fattura", label: "Prezzo Vendita" },
            { key: "perc_acquisto", label: "% Acquisto" },
            { key: "acquisto_eur", label: "Acquisto (€)" },
            { key: "data_acquisto", label: "Data Acquisto" },
            { key: "acquisto_old", label: "Acquisto OLD" },
            { key: "descrizione", label: "Descrizione" },
            { key: "codice_articolo", label: "Codice Articolo" },
            { key: "fornitore", label: "Fornitore" },
            { key: "cliente", label: "Cliente" },
            { key: "note", label: "Note" },
          ];

          for (const f of checkFields) {
            const oldV = original[f.key];
            const newV = row[f.key];
            if (oldV !== newV) {
              logEntries.push({
                row_id: row.id,
                created_at: nowIso,
                tipo_listino: "cliente",
                cliente: row.cliente,
                codice_articolo: artCode,
                descrizione: artDesc,
                campo_modificato: f.label,
                vecchio_valore: typeof oldV === "number" ? round5(oldV) : null,
                nuovo_valore: typeof newV === "number" ? round5(newV) : null,
                vecchio_testo: typeof oldV === "string" ? oldV : null,
                nuovo_testo: typeof newV === "string" ? newV : null,
                variazione_pct: null,
                operatore: operatorName,
                motivo: "Modifica Excel Listino Cliente",
              });
            }
          }
        } else {
          logEntries.push({
            row_id: row.id,
            created_at: nowIso,
            tipo_listino: "cliente",
            cliente: row.cliente,
            codice_articolo: artCode,
            descrizione: artDesc,
            campo_modificato: "Nuovo Articolo Cliente",
            vecchio_valore: null,
            nuovo_valore: row.prezzo_fattura ? round5(row.prezzo_fattura) : null,
            vecchio_testo: null,
            nuovo_testo: row.descrizione || "Nuovo Articolo",
            variazione_pct: null,
            operatore: operatorName,
            motivo: `Creazione articolo per ${row.cliente}`,
          });
        }
      }

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

      void priceListSyncService.pushClientBatchToSupabase(rowsToSave).catch((e) => {
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
          const updated = updateRowWithField(r, colId, value);
          setDirtyRows((prevDirty) => new Map(prevDirty).set(rowId, updated));
          scheduleSilentAutoSaveIfNeeded();
          return updated;
        })
      );
    },
    [newTopRow, updateRowWithField, selectedClientFilter, scheduleSilentAutoSaveIfNeeded]
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

  const handleItemRestored = useCallback((restored: ListinoClienteRow) => {
    setItems((prev) => [restored, ...prev]);
    setOriginalRowsSnapshot((prev) => new Map(prev).set(restored.id, { ...restored }));
    setTrashCount((c) => Math.max(0, c - 1));
  }, []);

  const handleToggleSort = (field: SortField) => {
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

      {/* Barra Superiore / Toolbar */}
      <div className="p-3 border-b border-[var(--border)] bg-[var(--card)] flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold text-[var(--foreground)]">Listini Clienti</h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--accent)] text-[var(--foreground)] border border-[var(--border)]">
                {filteredItems.length} di {totalDbCount} voci
              </span>
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-2">
              {unsavedCount > 0 ? (
                <span className="text-amber-400 font-semibold flex items-center gap-1 animate-pulse">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {unsavedCount} {unsavedCount === 1 ? "modifica non salvata" : "modifiche non salvate"}
                </span>
              ) : lastSavedTime ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Salvato {formatDateTime(lastSavedTime)}
                </span>
              ) : (
                "Pronto. Modifica le celle direttamente in stile Excel."
              )}
            </p>
          </div>
        </div>

        {/* Controlli Destra: Cestino, Colonne, Annulla, Salva */}
        <div className="flex items-center space-x-2">
          {/* Cestino */}
          <button
            type="button"
            onClick={() => setIsTrashModalOpen(true)}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-xs font-semibold text-[var(--foreground)] transition-colors cursor-pointer"
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

          {/* Menu Colonne */}
          <ColumnVisibilityMenu
            columns={allColumns}
            visibleColumns={visibleColumns}
            onToggleColumn={toggleColumn}
            onResetDefault={resetDefaultColumns}
          />

          {/* Ricarica */}
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading || isSaving}
            className="p-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
            title="Ricarica da database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          {/* Annulla Modifiche (Ctrl+Z) & Scarta Tutto */}
          {canEdit && (
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
                  undoStack.length > 0
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 cursor-pointer shadow-xs"
                    : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] opacity-50 cursor-not-allowed"
                }`}
                title="Annulla ultima modifica (Ctrl+Z)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Annulla {undoStack.length > 0 ? `(${undoStack.length})` : ""}</span>
              </button>

              {dirtyRows.size > 0 && (
                <button
                  type="button"
                  onClick={handleDiscardAllChanges}
                  className="px-2 py-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium transition-colors cursor-pointer"
                  title="Scarta tutte le modifiche non salvate"
                >
                  Scarta tutto
                </button>
              )}
            </div>
          )}

          {/* Salva Modifiche */}
          {canEdit && (
            <button
              type="button"
              onClick={() => void saveAllPendingChanges()}
              disabled={unsavedCount === 0 || isSaving}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm ${
                unsavedCount > 0
                  ? "bg-amber-500 hover:bg-amber-600 text-black cursor-pointer animate-pulse"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] opacity-50 cursor-not-allowed"
              }`}
            >
              <Save className={`w-3.5 h-3.5 ${isSaving ? "animate-spin" : ""}`} />
              <span>{isSaving ? "Salvataggio..." : `Salva Modifiche ${unsavedCount > 0 ? `(${unsavedCount})` : ""}`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Barra Filtri: Selezione Cliente (con Dark Mode compatibile) + Ricerca F4 + Tab */}
      <div className="p-2.5 border-b border-[var(--border)] bg-[var(--background)] flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center space-x-2">
          {/* Tendina Clienti Custom con tema scuro e ricerca integrata */}
          <div className="relative" ref={clientDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setIsClientDropdownOpen((prev) => !prev);
                setClientDropdownSearch("");
              }}
              className="flex items-center space-x-2 bg-[#181a20] hover:bg-[#20242c] px-2.5 py-1.5 rounded-md border border-[var(--border)] shadow-xs text-xs font-semibold text-gray-200 transition-colors"
            >
              <Filter className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate max-w-[200px]">
                {selectedClientFilter === "TUTTI"
                  ? `TUTTI I CLIENTI (${distinctClients.length})`
                  : selectedClientFilter}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0 ml-1" />
            </button>

            {isClientDropdownOpen && (
              <div className="absolute left-0 mt-1 w-80 bg-[#16181e] border border-[var(--border)] rounded-lg shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
                {/* Input di ricerca rapida */}
                <div className="p-2 border-b border-[var(--border)]/70 bg-[#121418]">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      autoFocus
                      type="text"
                      value={clientDropdownSearch}
                      onChange={(e) => setClientDropdownSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsClientDropdownOpen(false);
                        }
                      }}
                      placeholder="Cerca cliente..."
                      className="w-full pl-8 pr-2.5 py-1 text-xs bg-[#1a1d24] border border-[var(--border)]/70 rounded text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {/* Lista opzioni */}
                <div className="max-h-72 overflow-y-auto p-1 text-xs space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      handleClientFilterChange("TUTTI");
                      setIsClientDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between font-semibold transition-colors ${
                      selectedClientFilter === "TUTTI"
                        ? "bg-sky-500/20 text-sky-300 font-bold"
                        : "text-gray-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span>TUTTI I CLIENTI ({distinctClients.length})</span>
                    {selectedClientFilter === "TUTTI" && <Check className="w-3.5 h-3.5 text-sky-400" />}
                  </button>

                  {filteredDropdownClients.map((client) => {
                    const isSelected = selectedClientFilter.toLowerCase() === client.toLowerCase();
                    return (
                      <button
                        key={client}
                        type="button"
                        onClick={() => {
                          handleClientFilterChange(client);
                          setIsClientDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${
                          isSelected
                            ? "bg-sky-500/20 text-sky-300 font-bold"
                            : "text-gray-300 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span className="truncate">{client}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0 ml-2" />}
                      </button>
                    );
                  })}

                  {filteredDropdownClients.length === 0 && (
                    <div className="px-3 py-3 text-center text-xs text-gray-500 italic">
                      Nessun cliente trovato per "{clientDropdownSearch}"
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Tab */}
          <div className="flex items-center bg-[var(--card)] p-0.5 rounded-md border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setActiveTab("tutti")}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                activeTab === "tutti"
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Tutti
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("duplicati")}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                activeTab === "duplicati"
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Duplicati
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("da_verificare")}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                activeTab === "da_verificare"
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Senza Prezzo
            </button>
          </div>
        </div>

        {/* Ricerca F4 */}
        <div className="relative min-w-[260px] max-w-sm flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onFocus={() => setActiveCell(null)}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca cliente, fornitore, descrizione, codice... (F4)"
            className="w-full pl-8 pr-7 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded-md outline-none text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Errore */}
      {error && (
        <div className="px-4 py-2 bg-rose-500/15 border-b border-rose-500/30 flex items-center space-x-2 text-xs text-rose-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Griglia Tabellare Excel-alike con Virtual Scroll Progressivo */}
      <div
        ref={tableContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-[var(--background)]"
      >
        <table className="w-full text-xs text-left border-collapse border-spacing-0">
          <thead className="bg-[var(--card)] border-b border-[var(--border)] text-[var(--muted-foreground)] font-mono text-[11px] sticky top-0 z-20 select-none shadow-sm">
            <tr>
              {isVisible("actions") && (
                <th className="px-2 py-2 text-center w-10 border-r border-[var(--border)]/40">#</th>
              )}
              {isVisible("cliente") && (
                <th
                  className="px-2.5 py-2 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-44"
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
                  className="px-2.5 py-2 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28 text-sky-400"
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
                  className="px-2.5 py-2 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-32"
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
                  className="px-2.5 py-2 text-center cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28 text-amber-300"
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
                  className="px-2.5 py-2 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 min-w-[240px]"
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
                  className="px-2.5 py-2 text-right cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28 bg-emerald-950/15 text-emerald-400"
                  onClick={() => handleToggleSort("prezzo_fattura")}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>PREZZO VENDITA (€)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}
              {/* Inversione richiesta: PRIMA % Acquisto, POI Acquisto (€) */}
              {isVisible("perc_acquisto") && (
                <th
                  className="px-2.5 py-2 text-right cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-24 bg-sky-950/15 text-sky-400"
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
                  className="px-2.5 py-2 text-right cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28 bg-blue-950/15 text-blue-400"
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
                  className="px-2.5 py-2 text-center cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28"
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
                  className="px-2.5 py-2 text-left cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-36 text-amber-400/80"
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
                  className="px-2.5 py-2 text-right cursor-pointer hover:text-[var(--foreground)] border-r border-[var(--border)]/40 w-28"
                  onClick={() => handleToggleSort("ricarico")}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>RICARICO (%) OLD</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              )}
              {isVisible("note") && (
                <th className="px-2.5 py-2 text-left border-r border-[var(--border)]/40 w-36">NOTE</th>
              )}
              {isVisible("note1") && (
                <th className="px-2.5 py-2 text-left border-r border-[var(--border)]/40 w-32">NOTE 1</th>
              )}
              {isVisible("note2") && (
                <th className="px-2.5 py-2 text-left border-r border-[var(--border)]/40 w-32">NOTE 2</th>
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
                  displayValue={newTopRow.cliente || (selectedClientFilter !== "TUTTI" ? selectedClientFilter : "+ Cliente...")}
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "cliente"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "cliente"}
                  shouldScroll={activeCell?.rowId === newTopRow.id && isKeyboardNavRef.current}
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
                  shouldScroll={activeCell?.rowId === newTopRow.id && isKeyboardNavRef.current}
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
                  shouldScroll={activeCell?.rowId === newTopRow.id && isKeyboardNavRef.current}
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
                  shouldScroll={activeCell?.rowId === newTopRow.id && isKeyboardNavRef.current}
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
                  shouldScroll={activeCell?.rowId === newTopRow.id && isKeyboardNavRef.current}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "prezzo_fattura" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 text-emerald-400 font-bold"
                />
              )}
              {/* Inversione: % Acquisto prima di Acquisto (€) */}
              {isVisible("perc_acquisto") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="perc_acquisto"
                  value={newTopRow.perc_acquisto}
                  displayValue={newTopRow.perc_acquisto != null ? `${newTopRow.perc_acquisto}%` : "—"}
                  align="right"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "perc_acquisto"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_acquisto"}
                  shouldScroll={activeCell?.rowId === newTopRow.id && isKeyboardNavRef.current}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "perc_acquisto" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 text-sky-400"
                />
              )}
              {isVisible("acquisto_eur") && (
                <EditableCell
                  rowId={newTopRow.id}
                  colId="acquisto_eur"
                  value={newTopRow.acquisto_eur}
                  displayValue={newTopRow.acquisto_eur != null ? formatEuro(newTopRow.acquisto_eur) : "—"}
                  align="right"
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "acquisto_eur"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "acquisto_eur"}
                  shouldScroll={activeCell?.rowId === newTopRow.id && isKeyboardNavRef.current}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "acquisto_eur" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 text-blue-400 font-bold"
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
                  shouldScroll={activeCell?.rowId === newTopRow.id && isKeyboardNavRef.current}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "data_acquisto" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40"
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
                  shouldScroll={activeCell?.rowId === newTopRow.id && isKeyboardNavRef.current}
                  initialChar={editingCell?.rowId === newTopRow.id && editingCell?.colId === "acquisto_old" ? initialEditChar : undefined}
                  canEdit={canEdit}
                  onSelectCell={selectCell}
                  onStartEdit={startEditing}
                  onCommit={commitCellEdit}
                  onCancel={cancelCellEdit}
                  onKeyDown={handleCellKeyDown}
                  className="border-r border-[var(--border)]/40 text-amber-400/80"
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
                  displayValue={newTopRow.note || "—"}
                  isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "note"}
                  isEditing={editingCell?.rowId === newTopRow.id && editingCell?.colId === "note"}
                  shouldScroll={activeCell?.rowId === newTopRow.id && isKeyboardNavRef.current}
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
                <td className="px-2.5 py-1.5 text-left border-r border-[var(--border)]/40 text-[var(--muted-foreground)]">—</td>
              )}
              {isVisible("note2") && (
                <td className="px-2.5 py-1.5 text-left border-r border-[var(--border)]/40 text-[var(--muted-foreground)]">—</td>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border)]/30 font-mono text-[11.5px]">
            {filteredItems.slice(0, visibleCount).map((item) => {
              const isDirty = dirtyRows.has(item.id);
              const isRowActive = activeCell?.rowId === item.id;
              const shouldScrollRow = isRowActive && isKeyboardNavRef.current;
              return (
                <tr
                  key={item.id}
                  className={`group cursor-default ${
                    isRowActive
                      ? "bg-[#1e5b87] text-white font-medium"
                      : isDirty
                      ? "bg-amber-500/10 hover:bg-amber-500/15"
                      : "hover:bg-[var(--background)]/70"
                  }`}
                >
                  {isVisible("actions") && (
                    <td className={`px-1.5 py-1 text-center border-r border-[var(--border)]/30 ${
                      isRowActive ? "bg-[#1e5b87]" : ""
                    }`}>
                      <button
                        type="button"
                        onClick={() => void handleDeleteRow(item)}
                        className={`p-1 rounded ${
                          isRowActive
                            ? "text-sky-100 hover:text-white hover:bg-rose-500/40"
                            : "text-[var(--muted-foreground)] hover:text-rose-400 hover:bg-rose-500/20"
                        }`}
                        title="Elimina e sposta nel Cestino"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                  {isVisible("cliente") && (
                    <EditableCell
                      rowId={item.id}
                      colId="cliente"
                      value={item.cliente}
                      displayValue={item.cliente.replace(/^LIST_/, "")}
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "cliente"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "cliente"}
                      shouldScroll={shouldScrollRow}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "cliente" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="font-bold text-amber-400 border-r border-[var(--border)]/30 max-w-[170px] truncate"
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
                      shouldScroll={shouldScrollRow}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "fornitore" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 text-sky-400 uppercase truncate max-w-[120px]"
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
                      shouldScroll={shouldScrollRow}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "codice_articolo" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 text-[var(--primary)] font-bold whitespace-nowrap"
                    />
                  )}
                  {isVisible("data_ref") && (
                    <td
                      onMouseDown={() => selectCell(item.id, "descrizione")}
                      className={`px-2.5 py-1.5 text-center border-r border-[var(--border)]/30 font-mono whitespace-nowrap select-none cursor-pointer ${
                        isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"
                      }`}
                      title="Data non modificabile manualmente (aggiornata in automatico alla modifica della riga)"
                    >
                      {formatDateAaaaMmGg(item.data_ref)}
                    </td>
                  )}
                  {isVisible("descrizione") && (
                    <EditableCell
                      rowId={item.id}
                      colId="descrizione"
                      value={item.descrizione}
                      displayValue={item.descrizione || "—"}
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "descrizione"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "descrizione"}
                      shouldScroll={shouldScrollRow}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "descrizione" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 font-medium text-[var(--foreground)] truncate max-w-[320px]"
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
                      shouldScroll={shouldScrollRow}
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
                  {/* Inversione: % Acquisto prima di Acquisto (€) */}
                  {isVisible("perc_acquisto") && (
                    <EditableCell
                      rowId={item.id}
                      colId="perc_acquisto"
                      value={item.perc_acquisto}
                      displayValue={item.perc_acquisto != null ? `${item.perc_acquisto}%` : "—"}
                      align="right"
                      isActive={activeCell?.rowId === item.id && activeCell?.colId === "perc_acquisto"}
                      isEditing={editingCell?.rowId === item.id && editingCell?.colId === "perc_acquisto"}
                      shouldScroll={shouldScrollRow}
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
                      shouldScroll={shouldScrollRow}
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
                      shouldScroll={shouldScrollRow}
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
                      shouldScroll={shouldScrollRow}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "acquisto_old" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 text-amber-400/80 text-xs truncate max-w-[180px]"
                    />
                  )}
                  {isVisible("ricarico") && (
                    <td
                      onMouseDown={() => selectCell(item.id, "descrizione")}
                      className={`px-2.5 py-1.5 text-right border-r border-[var(--border)]/30 cursor-pointer ${
                        isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"
                      }`}
                    >
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
                      shouldScroll={shouldScrollRow}
                      initialChar={editingCell?.rowId === item.id && editingCell?.colId === "note" ? initialEditChar : undefined}
                      canEdit={canEdit}
                      onSelectCell={selectCell}
                      onStartEdit={startEditing}
                      onCommit={commitCellEdit}
                      onCancel={cancelCellEdit}
                      onKeyDown={handleCellKeyDown}
                      className="border-r border-[var(--border)]/30 text-[var(--muted-foreground)] truncate max-w-[160px]"
                    />
                  )}
                  {isVisible("note1") && (
                    <td
                      onMouseDown={() => selectCell(item.id, "descrizione")}
                      className={`px-2.5 py-1.5 text-left border-r border-[var(--border)]/30 truncate max-w-[120px] cursor-pointer ${
                        isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"
                      }`}
                    >
                      {item.note1 || "—"}
                    </td>
                  )}
                  {isVisible("note2") && (
                    <td
                      onMouseDown={() => selectCell(item.id, "descrizione")}
                      className={`px-2.5 py-1.5 text-left border-r border-[var(--border)]/30 truncate max-w-[120px] cursor-pointer ${
                        isRowActive ? "text-sky-100" : "text-[var(--muted-foreground)]"
                      }`}
                    >
                      {item.note2 || "—"}
                    </td>
                  )}
                </tr>
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
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            onKeyDown(e, rowId, colId, localValue);
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
  shouldScroll?: boolean;
  initialChar?: string;
  canEdit: boolean;
  onSelectCell: (rowId: string, colId: string, fromKeyboard?: boolean) => void;
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
    shouldScroll = false,
    initialChar,
    canEdit,
    onSelectCell,
    onStartEdit,
    onCommit,
    onCancel,
    onKeyDown,
    className = "",
  }) => {
    const tdRef = useRef<HTMLTableCellElement>(null);
    const alignClass =
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

    useEffect(() => {
      if (isActive && !isEditing && tdRef.current) {
        const activeEl = typeof document !== "undefined" ? document.activeElement : null;
        if (
          activeEl &&
          (activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            activeEl.getAttribute("contenteditable") === "true")
        ) {
          return;
        }
        tdRef.current.focus({ preventScroll: true });
        if (shouldScroll) {
          tdRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }
    }, [isActive, isEditing, shouldScroll]);

    if (isEditing) {
      return (
        <CellInputEditor
          rowId={rowId}
          colId={colId}
          initialValue={getFormattedInitValue(value, colId, initialChar)}
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
        ref={tdRef}
        onMouseDown={(e) => {
          if (e.button === 0) {
            onSelectCell(rowId, colId);
            tdRef.current?.focus();
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onDoubleClick={() => {
          if (canEdit && colId !== "data_ref") onStartEdit(rowId, colId);
        }}
        onKeyDown={(e) => onKeyDown(e, rowId, colId, displayValue)}
        tabIndex={canEdit ? 0 : -1}
        className={`px-2.5 py-1.5 outline-none cursor-pointer select-none ${alignClass} ${className} ${
          isActive
            ? "ring-1 ring-sky-300 ring-inset bg-white/10 font-bold shadow-sm"
            : ""
        }`}
        title={displayValue}
      >
        {displayValue}
      </td>
    );
  }
);

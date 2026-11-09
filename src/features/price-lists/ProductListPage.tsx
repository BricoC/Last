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
  Plus,
  Trash2,
  Receipt,
  CloudDownload,
} from "lucide-react";
import { ListinoGeneraleRow, PriceListLogEntry, TrashListinoRow } from "./models/priceList";
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

// Helper data odierna in formato aaaa.mm.gg
function getTodayAaaaMmGg(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

// Helper formattazione qualsiasi data in aaaa.mm.gg
function formatDateAaaaMmGg(rawDate: string | null | undefined): string {
  if (!rawDate) return "—";
  const str = String(rawDate).trim();
  if (!str) return "—";

  // Formato aaaa-mm-gg (es. 2026-11-05) -> 2026.11.05
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str.replace(/-/g, ".");
  }

  // Già aaaa.mm.gg
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(str)) {
    return str;
  }

  // ISO string (es. 2026-11-05T12:30:00)
  if (str.includes("T")) {
    const p = str.split("T")[0].split("-");
    if (p.length === 3) return `${p[0]}.${p[1]}.${p[2]}`;
  }

  // Formato gg/mm/aaaa
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [g, m, a] = str.split("/");
    return `${a}.${m}.${g}`;
  }

  // Formato numerico aammgg (es. 200925 -> 2020.09.25)
  if (/^\d{6}$/.test(str)) {
    const yy = str.slice(0, 2);
    const mm = str.slice(2, 4);
    const dd = str.slice(4, 6);
    const yyyy = Number(yy) > 50 ? `19${yy}` : `20${yy}`;
    return `${yyyy}.${mm}.${dd}`;
  }

  return str;
}

function createBlankRow(): ListinoGeneraleRow {
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

function formatSellingPrice(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  return `€ ${Number(val).toLocaleString("it-IT", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })}`;
}

function formatCostPrice(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  return `€ ${Number(val).toLocaleString("it-IT", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
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
  if (col === "prezzo_pubblico" || col === "prezzo_profess" || col === "prezzo_fattura") {
    const n = Number(val);
    if (!isNaN(n)) return (Math.round(n * 1000) / 1000).toString();
  }
  if (col === "prezzo_acquisto") {
    const n = Number(val);
    if (!isNaN(n)) return (Math.round(n * 10000) / 10000).toString();
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
  const [newTopRow, setNewTopRow] = useState<ListinoGeneraleRow>(() => createBlankRow());

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
      lines.push(`Ultima modifica listino: ${formatDateTime(mostRecentModTime)}`);
    }
    lines.push(`Ultimo accesso al listino: ${formatDateTime(lastAccessTime)}`);
    return lines.join("\n");
  }, [dirtyRows.size, mostRecentModTime, lastAccessTime]);

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

  // Modale Popup Fatture Elettroniche (pre-filtrata su articolo)
  const [invoicesModalSearch, setInvoicesModalSearch] = useState<string | null>(null);

  // Fornitori unificati per Autocomplete colonna fornitore
  const [generalSuppliers, setGeneralSuppliers] = useState<string[]>([]);

  // Stato sincronizzazione Cloud
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudSyncMessage, setCloudSyncMessage] = useState<string | null>(null);

  // Modale Cestino Articoli Eliminati (Max 30 FIFO)
  const [trashCount, setTrashCount] = useState<number>(0);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);

  // Riferimento container tabella
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Timer auto-save silenzioso ogni 10 minuti (configurabile)
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

      // Sincronizzazione incrementale Cloud in background (nessun blocco dell'interfaccia)
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

  // Sincronizzazione manuale Cloud al click dell'utente
  const handleManualCloudSync = useCallback(async () => {
    setIsSyncingCloud(true);
    setCloudSyncMessage(null);
    try {
      const syncRes = await priceListSyncService.syncIncrementalGeneralFromSupabase();
      if (syncRes.updatedCount > 0) {
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
        setCloudSyncMessage(`Sincronizzati ${syncRes.updatedCount} articoli dal Cloud`);
      } else {
        setCloudSyncMessage("Tutto aggiornato con il Cloud");
      }
    } catch (err: any) {
      console.warn("[ProductListPage] Errore sync manuale Cloud:", err);
      setCloudSyncMessage("Errore connessione Cloud");
    } finally {
      setIsSyncingCloud(false);
      setTimeout(() => setCloudSyncMessage(null), 4000);
    }
  }, []);

  // Apertura modale Fatture Elettroniche filtrata sull'articolo
  const handleOpenInvoices = useCallback((item: ListinoGeneraleRow) => {
    const searchKey = item.codice_articolo?.trim() || item.descrizione?.trim() || "";
    setInvoicesModalSearch(searchKey);
  }, []);

  // Controllo automatico aggiornamenti Cloud quando la finestra riprende il focus
  useEffect(() => {
    let lastFocusCheck = Date.now();
    const handleWindowFocus = () => {
      const now = Date.now();
      if (now - lastFocusCheck > 30000 && dirtyRows.size === 0) {
        lastFocusCheck = now;
        priceListSyncService
          .syncIncrementalGeneralFromSupabase()
          .then((res) => {
            if (res.updatedCount > 0) {
              priceListRepository.searchGeneral("", 15000).then((refreshedRows) => {
                setItems(refreshedRows);
                setTotalDbCount(refreshedRows.length);
                setOriginalRowsSnapshot(new Map(refreshedRows.map((r) => [r.id, { ...r }])));
              });
            }
          })
          .catch(() => {});
      }
    };
    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
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

  // Ricerca tokenizzata
  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  // Visualizzazione elementi: le nuove righe create rimangono SEMPRE bloccate in cima!
  const filteredItems = useMemo(() => {
    // 1. Separa le nuove righe create in questa sessione dai record già a catalogo nel DB
    const newItems: ListinoGeneraleRow[] = [];
    const dbItems: ListinoGeneraleRow[] = [];

    for (const item of items) {
      if (item.id.startsWith("new_") || !originalRowsSnapshot.has(item.id)) {
        newItems.push(item);
      } else {
        dbItems.push(item);
      }
    }

    let filteredNew = newItems;
    let filteredDb = dbItems;

    if (searchTokens.length > 0) {
      filteredNew = filteredNew.filter((item) => {
        const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""} ${item.cat || ""}`.toLowerCase();
        return searchTokens.every((token) => text.includes(token));
      });
      filteredDb = filteredDb.filter((item) => {
        const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""} ${item.cat || ""}`.toLowerCase();
        return searchTokens.every((token) => text.includes(token));
      });
    }

    if (sortField) {
      filteredDb = [...filteredDb].sort((a, b) => {
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
    }

    // Le nuove righe inserite restano SEMPRE bloccate in cima nell'ordine in cui sono state immesse
    return [...filteredNew, ...filteredDb];
  }, [items, originalRowsSnapshot, searchTokens, sortField, sortAsc]);

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

      // Aggiorna automaticamente la data ad oggi (aaaa.mm.gg) ad ogni modifica effettuata
      if (colId !== "data_ref") {
        updated.data_ref = getTodayAaaaMmGg();
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
        const artCode = row.codice_articolo?.trim() || row.id;
        const artDesc = row.descrizione || "Articolo";

        if (original) {
          // Campi numerici (prezzi, percentuali, IVA)
          const numFields: { key: keyof ListinoGeneraleRow; label: string }[] = [
            { key: "prezzo_acquisto", label: "Prezzo Acquisto" },
            { key: "prezzo_fattura", label: "Prezzo Fattura" },
            { key: "prezzo_pubblico", label: "Prezzo Pubblico" },
            { key: "prezzo_profess", label: "Prezzo Profess" },
            { key: "perc_pub", label: "% Pubblico" },
            { key: "perc_prof", label: "% Profess" },
            { key: "perc_fatt", label: "% Fattura" },
            { key: "aumento", label: "Aumento %" },
            { key: "maga", label: "Magazzino %" },
            { key: "perc_iva", label: "IVA" },
          ];

          for (const f of numFields) {
            const oldV = (original[f.key] as number | null) ?? null;
            const newV = (row[f.key] as number | null) ?? null;
            if (oldV !== newV) {
              const oldNum = oldV ?? 0;
              const newNum = newV ?? 0;
              let pct: number | null = null;
              if (oldNum > 0) {
                pct = ((newNum - oldNum) / oldNum) * 100;
              } else if (newNum > 0) {
                pct = newNum > 2 ? newNum : newNum * 100;
              }
              logEntries.push({
                row_id: row.id,
                created_at: nowIso,
                tipo_listino: "generale",
                cliente: "",
                codice_articolo: artCode,
                descrizione: artDesc,
                campo_modificato: f.label,
                vecchio_valore: oldV != null ? round5(oldV) : null,
                nuovo_valore: newV != null ? round5(newV) : null,
                vecchio_testo: null,
                nuovo_testo: null,
                variazione_pct: pct != null ? round5(pct) : null,
                operatore: operatorName,
                motivo: "Modifica Excel Listino Generale",
              });
            }
          }

          // Campi testuali
          const textFields: { key: keyof ListinoGeneraleRow; label: string }[] = [
            { key: "descrizione", label: "Descrizione" },
            { key: "codice_articolo", label: "Codice Articolo" },
            { key: "fornitore", label: "Fornitore" },
            { key: "cat", label: "Categoria" },
            { key: "um", label: "U.M." },
          ];

          for (const f of textFields) {
            const oldT = (original[f.key] as string | null) ?? "";
            const newT = (row[f.key] as string | null) ?? "";
            if (oldT !== newT) {
              logEntries.push({
                row_id: row.id,
                created_at: nowIso,
                tipo_listino: "generale",
                cliente: "",
                codice_articolo: artCode,
                descrizione: artDesc,
                campo_modificato: f.label,
                vecchio_valore: null,
                nuovo_valore: null,
                vecchio_testo: oldT || "—",
                nuovo_testo: newT || "—",
                variazione_pct: null,
                operatore: operatorName,
                motivo: `Da "${oldT || '—'}" a "${newT || '—'}"`,
              });
            }
          }
        } else {
          // Nuovo articolo aggiunto
          logEntries.push({
            row_id: row.id,
            created_at: nowIso,
            tipo_listino: "generale",
            cliente: "",
            codice_articolo: artCode,
            descrizione: artDesc,
            campo_modificato: "Nuovo Articolo",
            vecchio_valore: null,
            nuovo_valore: row.prezzo_acquisto ? round5(row.prezzo_acquisto) : null,
            vecchio_testo: null,
            nuovo_testo: row.descrizione || "Nuovo Articolo",
            variazione_pct: null,
            operatore: operatorName,
            motivo: "Creazione nuovo articolo",
          });
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
          setUndoStack((uPrev) => [...uPrev.slice(-49), { rowId, prevRow: { ...r } }]);
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
    [newTopRow, updateRowWithField, scheduleSilentAutoSaveIfNeeded, originalRowsSnapshot]
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

  // Selezione cella singola (click o navigazione con frecce, stile Excel)
  const selectCell = useCallback((rowId: string, colId: string, fromKeyboard = false) => {
    isKeyboardNavRef.current = fromKeyboard;
    setActiveCell({ rowId, colId });
    setEditingCell(null);
    setInitialEditChar(undefined);
  }, []);

  // Apertura editor cella (doppio click, F2, Invio o digitazione di un carattere)
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
      setInitialEditChar(undefined);
    },
    [applyCellChange]
  );

  const cancelCellEdit = useCallback(() => {
    setEditingCell(null);
    setInitialEditChar(undefined);
  }, []);

  // Spostamento cella attiva con le frecce (senza muovere la finestra)
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
          commitCellEdit(rowId, colId, currentValStr);
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
          e.preventDefault();
          e.stopPropagation();
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
      selectCell,
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
      void priceListSyncService.deleteGeneralBatchFromSupabase(idsToDelete);
      const nowStr = new Date().toISOString();
      const trashRows: TrashListinoRow[] = rowsToDelete.map((r) => ({
        ...r,
        deleted_at: nowStr,
        deleted_by: opName,
      }));
      void priceListSyncService.pushTrashBatchToSupabase(trashRows);
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
        void priceListSyncService.deleteGeneralBatchFromSupabase([row.id]);
        const trashRow: TrashListinoRow = {
          ...row,
          deleted_at: new Date().toISOString(),
          deleted_by: opName,
        };
        void priceListSyncService.pushTrashBatchToSupabase([trashRow]);
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
    void priceListSyncService.pushGeneralBatchToSupabase([restoredItem]);
    void priceListSyncService.deleteTrashFromSupabase(restoredItem.id);
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

          {/* Sincronizzazione Cloud manuale per scaricare istantaneamente modifiche da altri PC */}
          <button
            type="button"
            onClick={handleManualCloudSync}
            disabled={loading || isSaving || isSyncingCloud}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 transition-colors shadow-xs cursor-pointer font-medium"
            title="Sincronizza subito modifiche da altri PC (Supabase Cloud)"
          >
            <CloudDownload className={`w-3.5 h-3.5 ${isSyncingCloud ? "animate-bounce" : ""}`} />
            <span className="hidden sm:inline">{isSyncingCloud ? "Sync Cloud..." : "Sync Cloud"}</span>
          </button>

          {cloudSyncMessage && (
            <span className="text-[11px] text-sky-400 font-medium px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 animate-in fade-in">
              {cloudSyncMessage}
            </span>
          )}

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
                  className="px-2 py-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium transition-colors"
                  title="Scarta tutte le modifiche non salvate"
                >
                  Scarta tutto
                </button>
              )}
            </div>
          )}

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
              title={saveButtonTooltip}
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

          {canEdit && (
            <button
              type="button"
              onClick={() => setIsTrashModalOpen(true)}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--card)] text-[var(--muted-foreground)] hover:text-rose-400 transition-colors shadow-sm cursor-pointer"
              title={`Cestino articoli eliminati (${trashCount}/50)`}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500/80" />
              <span className="text-xs font-semibold">Cestino</span>
              {trashCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {trashCount}
                </span>
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

              {/* Mini colonna Fatture Elettroniche */}
              {visibleColumns.invoices !== false && (
                <th
                  className="px-1.5 py-2 w-8 min-w-[32px] max-w-[32px] text-center"
                  title="Cerca nelle Fatture Elettroniche (prezzi d'acquisto e storico fornitori)"
                >
                  <Receipt className="w-3.5 h-3.5 mx-auto text-amber-400" />
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
              <tr className="bg-emerald-500/10 hover:bg-emerald-500/15 border-b-2 border-emerald-500/40">
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

                {visibleColumns.invoices !== false && (
                  <td className="px-1.5 py-1 text-center text-[var(--muted-foreground)]/30">—</td>
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
                    onSelectCell={selectCell}
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
                    onSelectCell={selectCell}
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
                    onSelectCell={selectCell}
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
                    displayValue={formatDateAaaaMmGg(newTopRow.data_ref)}
                    align="center"
                    isActive={activeCell?.rowId === newTopRow.id && activeCell?.colId === "data_ref"}
                    isEditing={false}
                    canEdit={false}
                    onSelectCell={selectCell}
                    onStartEdit={() => {}}
                    onCommit={() => {}}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                    className="text-[var(--muted-foreground)] cursor-default select-none opacity-80"
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
                    onSelectCell={selectCell}
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
                    onSelectCell={selectCell}
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
                    onSelectCell={selectCell}
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
                    displayValue={formatSellingPrice(newTopRow.prezzo_pubblico)}
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
                    onSelectCell={selectCell}
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
                    displayValue={formatSellingPrice(newTopRow.prezzo_profess)}
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
                    onSelectCell={selectCell}
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
                    displayValue={formatSellingPrice(newTopRow.prezzo_fattura)}
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
                    className="border-x border-amber-500/20"
                  />
                )}

                {visibleColumns.prezzo_acquisto !== false && (
                  <EditableCell
                    rowId={newTopRow.id}
                    colId="prezzo_acquisto"
                    value={newTopRow.prezzo_acquisto ?? ""}
                    displayValue={formatCostPrice(newTopRow.prezzo_acquisto)}
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
                    onSelectCell={selectCell}
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
                    onSelectCell={selectCell}
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
                    onSelectCell={selectCell}
                    onStartEdit={startEditing}
                    onCommit={commitCellEdit}
                    onCancel={cancelCellEdit}
                    onKeyDown={handleCellKeyDown}
                  />
                )}

                {visibleColumns.costo_maggiorato !== false && (
                  <td className="px-3 py-1 text-right font-medium text-sky-200/70 border-x border-sky-500/20">
                    {formatCostPrice(
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
      <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--background)] flex items-center text-[11px] text-[var(--muted-foreground)] font-mono">
        <span>
          Visualizzati: {Math.min(visibleCount, filteredItems.length)} su {filteredItems.length} filtrati (Totale DB: {totalDbCount})
        </span>
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

// Componente Riga Tabella Altamente Ottimizzata (Memoized)
interface MemoizedProductRowProps {
  item: ListinoGeneraleRow;
  isDirty: boolean;
  isSelected: boolean;
  isRowActive: boolean;
  shouldScroll?: boolean;
  activeColId: string | null;
  editingColId: string | null;
  initialEditChar?: string;
  canEdit: boolean;
  visibleColumns: Record<string, boolean>;
  onToggleSelectRow: (id: string) => void;
  onOpenHistory: (item: ListinoGeneraleRow) => void;
  onOpenInvoices: (item: ListinoGeneraleRow) => void;
  onDeleteRow: (item: ListinoGeneraleRow) => void;
  onSelectCell: (rowId: string, colId: string) => void;
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
    isRowActive,
    shouldScroll = false,
    activeColId,
    editingColId,
    initialEditChar,
    canEdit,
    visibleColumns,
    onToggleSelectRow,
    onOpenHistory,
    onOpenInvoices,
    onDeleteRow,
    onSelectCell,
    onStartEdit,
    onCommitCell,
    onCancelEdit,
    onCellKeyDown,
  }) => {
    const costoMagg =
      item.r2 ?? calculateCostoMaggiorato(item.prezzo_acquisto, item.aumento, item.maga);
    const isHighlighted = isRowActive || isSelected;

    return (
      <tr
        className={`group cursor-default ${
          isHighlighted
            ? "bg-[#1e5b87] text-white font-medium"
            : isDirty
            ? "bg-amber-500/10 hover:bg-amber-500/15"
            : "hover:bg-[var(--background)]/70"
        }`}
      >
        <td
          className={`px-2 py-1 text-center sticky left-0 z-10 ${
            isHighlighted
              ? "bg-[#1e5b87] text-white"
              : isDirty
              ? "bg-amber-500/10"
              : "bg-[var(--card)]"
          }`}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelectRow(item.id)}
            className="rounded border-[var(--border)] accent-sky-200"
          />
        </td>

        {visibleColumns.history !== false && (
          <td className="px-2 py-1 text-center">
            <button
              type="button"
              onClick={() => onOpenHistory(item)}
              className={`p-1 rounded ${
                isHighlighted
                  ? "text-sky-100 hover:text-white hover:bg-sky-800"
                  : "text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--card)]"
              }`}
              title="Visualizza storico modifiche riga (max 15)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </td>
        )}

        {/* Mini colonna Fatture Elettroniche */}
        {visibleColumns.invoices !== false && (
          <td className="px-1.5 py-1 text-center">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onOpenInvoices(item);
              }}
              className={`p-1 rounded transition-colors cursor-pointer ${
                isHighlighted
                  ? "text-amber-200 hover:text-amber-100 hover:bg-amber-400/20"
                  : "text-amber-400/80 hover:text-amber-300 hover:bg-amber-400/10"
              }`}
              title={`Cerca "${item.codice_articolo || item.descrizione}" nelle Fatture Elettroniche`}
            >
              <Receipt className="w-3.5 h-3.5 mx-auto" />
            </button>
          </td>
        )}

        {/* Tasto Cestino Elimina Riga */}
        {visibleColumns.actions !== false && canEdit && (
          <td className="px-1.5 py-1 text-center">
            <button
              type="button"
              onClick={() => onDeleteRow(item)}
              className={`p-1 rounded ${
                isHighlighted
                  ? "text-sky-100 hover:text-red-200 hover:bg-red-600/40"
                  : "text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/15"
              }`}
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
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "cat" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-sans font-medium truncate max-w-[90px] ${
              isHighlighted ? "text-white" : "text-[var(--foreground)]"
            }`}
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
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "fornitore" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-sans font-medium truncate max-w-[85px] ${
              isHighlighted ? "text-white" : "text-[var(--foreground)]"
            }`}
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
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "codice_articolo" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`truncate max-w-[95px] font-bold ${
              isHighlighted ? "text-white font-black" : "text-[var(--primary)]"
            }`}
          />
        )}

        {visibleColumns.data_ref !== false && (
          <EditableCell
            rowId={item.id}
            colId="data_ref"
            value={item.data_ref || ""}
            displayValue={formatDateAaaaMmGg(item.data_ref)}
            align="center"
            isActive={activeColId === "data_ref"}
            isEditing={false}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            canEdit={false}
            onSelectCell={onSelectCell}
            onStartEdit={() => {}}
            onCommit={() => {}}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`cursor-default select-none ${
              isHighlighted ? "text-sky-100 font-medium" : "text-[var(--muted-foreground)] opacity-80"
            }`}
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
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "descrizione" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-sans font-medium truncate max-w-[420px] ${
              isHighlighted ? "text-white font-medium" : "text-[var(--foreground)]"
            }`}
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
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "um" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`w-14 ${isHighlighted ? "text-sky-100 font-medium" : "text-[var(--muted-foreground)]"}`}
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
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "perc_pub" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={isHighlighted ? "text-white font-medium" : "text-[var(--muted-foreground)]"}
          />
        )}

        {visibleColumns.prezzo_pubblico !== false && (
          <EditableCell
            rowId={item.id}
            colId="prezzo_pubblico"
            value={item.prezzo_pubblico ?? ""}
            displayValue={formatSellingPrice(item.prezzo_pubblico)}
            align="right"
            isActive={activeColId === "prezzo_pubblico"}
            isEditing={editingColId === "prezzo_pubblico"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "prezzo_pubblico" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-medium ${isHighlighted ? "text-white font-bold" : "text-[var(--foreground)]"}`}
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
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "perc_prof" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={isHighlighted ? "text-white font-medium" : "text-[var(--muted-foreground)]"}
          />
        )}

        {visibleColumns.prezzo_profess !== false && (
          <EditableCell
            rowId={item.id}
            colId="prezzo_profess"
            value={item.prezzo_profess ?? ""}
            displayValue={formatSellingPrice(item.prezzo_profess)}
            align="right"
            isActive={activeColId === "prezzo_profess"}
            isEditing={editingColId === "prezzo_profess"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "prezzo_profess" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-medium ${isHighlighted ? "text-white font-bold" : "text-[var(--foreground)]"}`}
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
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "perc_fatt" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={isHighlighted ? "text-white font-medium" : "text-[var(--muted-foreground)]"}
          />
        )}

        {visibleColumns.prezzo_fattura !== false && (
          <EditableCell
            rowId={item.id}
            colId="prezzo_fattura"
            value={item.prezzo_fattura ?? ""}
            displayValue={formatSellingPrice(item.prezzo_fattura)}
            align="right"
            isActive={activeColId === "prezzo_fattura"}
            isEditing={editingColId === "prezzo_fattura"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "prezzo_fattura" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-bold border-x ${
              isHighlighted
                ? "bg-[#fef08a] text-slate-950 font-black border-amber-300 shadow-sm"
                : "bg-amber-500/15 text-amber-200 border-amber-500/20"
            }`}
          />
        )}

        {visibleColumns.prezzo_acquisto !== false && (
          <EditableCell
            rowId={item.id}
            colId="prezzo_acquisto"
            value={item.prezzo_acquisto ?? ""}
            displayValue={formatCostPrice(item.prezzo_acquisto)}
            align="right"
            isActive={activeColId === "prezzo_acquisto"}
            isEditing={editingColId === "prezzo_acquisto"}
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "prezzo_acquisto" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={`font-bold border-x ${
              isHighlighted
                ? "bg-sky-800/60 text-white font-black border-sky-400/40"
                : "text-sky-200 font-semibold bg-sky-950/20 border-sky-500/20"
            }`}
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
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "perc_iva" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={isHighlighted ? "text-sky-100 font-medium" : "text-[var(--muted-foreground)]"}
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
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "aumento" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={
              isHighlighted
                ? "text-sky-100 font-medium bg-sky-800/30"
                : "text-[var(--muted-foreground)] bg-sky-950/10"
            }
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
            isRowActive={isRowActive}
            shouldScroll={shouldScroll}
            initialChar={editingColId === "maga" ? initialEditChar : undefined}
            canEdit={canEdit}
            onSelectCell={onSelectCell}
            onStartEdit={onStartEdit}
            onCommit={onCommitCell}
            onCancel={onCancelEdit}
            onKeyDown={onCellKeyDown}
            className={
              isHighlighted
                ? "text-sky-100 font-medium bg-sky-800/30"
                : "text-[var(--muted-foreground)] bg-sky-950/10"
            }
          />
        )}

        {visibleColumns.costo_maggiorato !== false && (
          <td
            className={`px-3 py-1 text-right font-bold border-x ${
              isHighlighted
                ? "bg-sky-800/60 text-white font-black border-sky-400/40"
                : "bg-sky-900/20 text-sky-200 border-sky-500/20"
            }`}
            title="Prezzo acquisto base maggiorato da aumento e magazzino"
          >
            {formatCostPrice(costoMagg)}
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
  isInitialCharTyped?: boolean;
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
  isInitialCharTyped,
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
      if (isInitialCharTyped) {
        // Cursore posizionato alla fine, NESSUNA selezione del carattere digitato
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      } else {
        // Doppio click o F2: seleziona tutto per riscrittura rapida
        inputRef.current.select();
      }
    }
  }, [isInitialCharTyped]);

  const datalistId = colId === "fornitore" ? "general-suppliers-autocomplete" : undefined;

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
  isRowActive?: boolean;
  shouldScroll?: boolean;
  initialChar?: string;
  canEdit: boolean;
  onSelectCell: (rowId: string, colId: string) => void;
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
    isRowActive: _isRowActive,
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

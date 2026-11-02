import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import {
  ColDef,
  CellValueChangedEvent,
  CellKeyDownEvent,
  CellClickedEvent,
  CellFocusedEvent,
  PostSortRowsParams,
} from "ag-grid-community";
import { OrderItem, Supplier } from "@/features/orders/types/order";
import { orderRepository, parseHighlights } from "@/features/orders/services/orderRepository";
import { orderSyncService } from "@/features/orders/services/orderSyncService";
import { orderEmailService } from "@/features/orders/services/orderEmailService";
import { orderExcelService } from "@/features/orders/services/orderExcelService";
import { TODAY, getFornitoreColor, HIGHLIGHT_COLUMN_MAP } from "@/features/orders/utils/constants";
import { OrderShortcutsModal } from "./OrderShortcutsModal";
import { ExcelTextEditor } from "./editors/ExcelTextEditor";
import { SupplierEditor } from "./editors/SupplierEditor";
import {
  Mail,
  Archive,
  Trash2,
  Highlighter,
  Download,
  Upload,
  RefreshCw,
  Keyboard,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";

interface OrdersActiveTabProps {
  suppliers: Supplier[];
  currentUser?: string;
  onRefreshData?: () => void;
  targetOrderId?: string | null;
  clearTargetOrder?: () => void;
}

const EMPTY_BUFFER_SIZE = 10;

export const OrdersActiveTab: React.FC<OrdersActiveTabProps> = ({
  suppliers,
  currentUser = "Operatore",
  onRefreshData,
  targetOrderId,
  clearTargetOrder,
}) => {
  const gridRef = useRef<AgGridReact<OrderItem>>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const focusedSupplierRef = useRef<string | null>(null);

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRows, setSelectedRows] = useState<OrderItem[]>([]);
  const [quickFilterText, setQuickFilterText] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [filledCount, setFilledCount] = useState(0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const onModelUpdated = useCallback((e: any) => {
    let count = 0;
    e.api.forEachNode((node: any) => {
      if (!node.data?.isNew) count++;
    });
    setFilledCount(count);
  }, []);

  const createEmptyRow = (idx: number = 0): OrderItem => ({
    id: `ord_draft_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
    order_date: "",
    supplier_name: "",
    article_code: "",
    description: "",
    quantity: "",
    price: "",
    ordered_date: null,
    notes: "",
    is_archived: false,
    is_deleted: false,
    highlights: {},
    created_at: "",
    updated_at: "",
    isNew: true,
  });

  // Caricamento ordini attivi direttamente da Supabase Cloud (identico a noManV1, con fallback locale offline)
  const loadActiveOrders = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = await orderSyncService.getClient();
      if (supabase) {
        const { data, error } = await supabase
          .from("ordini")
          .select("*")
          .or("archiviato.is.null,archiviato.eq.false")
          .eq("eliminato", false)
          .order("created_at", { ascending: true });

        if (!error && data) {
          const mapped: OrderItem[] = data.map((r: any) => ({
            id: r.id,
            supabase_id: r.id,
            order_date: r.data || "",
            supplier_name: r.fornitore || "",
            article_code: r.articolo || "",
            description: (r.descrizione || "").toUpperCase(),
            quantity: String(r.quantita || ""),
            price: String(r.prezzo || ""),
            ordered_date: r.ordinato || null,
            notes: r.note || "",
            user_name: r.utente || "",
            is_archived: Boolean(r.archiviato),
            is_deleted: Boolean(r.eliminato),
            highlights: parseHighlights(r.evidenze),
            created_at: r.created_at || new Date().toISOString(),
            updated_at: r.ultima_modifica || new Date().toISOString(),
            sync_status: "synced",
          }));

          const emptyRows: OrderItem[] = Array.from({ length: EMPTY_BUFFER_SIZE }, (_, i) => createEmptyRow(i));
          setOrders([...mapped, ...emptyRows]);
          return;
        }
      }

      // Fallback offline SQLite
      const active = await orderRepository.getOrders("attivi");
      const emptyRows: OrderItem[] = Array.from({ length: EMPTY_BUFFER_SIZE }, (_, i) => createEmptyRow(i));
      setOrders([...active, ...emptyRows]);
    } catch (err: any) {
      console.warn("[OrdersActiveTab] Errore Supabase, fallback SQLite:", err);
      try {
        const active = await orderRepository.getOrders("attivi");
        const emptyRows: OrderItem[] = Array.from({ length: EMPTY_BUFFER_SIZE }, (_, i) => createEmptyRow(i));
        setOrders([...active, ...emptyRows]);
      } catch {}
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActiveOrders();
  }, [loadActiveOrders]);

  // Se c'è un ordine target (dalla ricerca globale), evidenzialo e scrolla
  useEffect(() => {
    if (targetOrderId && gridRef.current?.api && orders.length > 0) {
      const api = gridRef.current.api;
      let targetNode: any = null;
      api.forEachNode((node) => {
        if (node.data?.id === targetOrderId) {
          node.setSelected(true, true);
          targetNode = node;
        }
      });
      if (targetNode) {
        api.ensureNodeVisible(targetNode, "middle");
      }
      if (clearTargetOrder) clearTargetOrder();
    }
  }, [targetOrderId, orders, clearTargetOrder]);

  // Scorciatoia globale F4 per reset filtri
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F4") {
        e.preventDefault();
        gridRef.current?.api?.setFilterModel(null);
        gridRef.current?.api?.setQuickFilter("");
        gridRef.current?.api?.applyColumnState({ defaultState: { sort: null } });
        setQuickFilterText("");
        showToast("Filtri e ordinamenti azzerati");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Ascolto in tempo reale degli aggiornamenti Supabase (da altre postazioni o da NoMan V1)
  useEffect(() => {
    const handleRemoteUpdate = (e: any) => {
      const payload = e.detail;
      if (!payload || !gridRef.current?.api) return;
      const api = gridRef.current.api;

      if (payload.eventType === "INSERT" && payload.new) {
        const item = payload.new;

        // Se questo inserimento è stato effettuato da noi, non creare duplicati
        if (orderSyncService.recentlyPushedRemoteIds.has(item.id)) {
          return;
        }

        // Verifica se la riga esiste già per supabase_id o localId
        let alreadyExists = false;
        api.forEachNode((node) => {
          if (node.data?.supabase_id === item.id || node.data?.id === "ord_" + item.id) {
            alreadyExists = true;
          }
        });
        if (alreadyExists) return;

        // Riconcilia con eventuale riga locale non ancora associata
        api.forEachNode((node) => {
          if (
            node.data &&
            !node.data.isNew &&
            !node.data.supabase_id &&
            node.data.supplier_name?.toLowerCase() === (item.fornitore || "").toLowerCase() &&
            node.data.description?.toUpperCase() === (item.descrizione || "").toUpperCase()
          ) {
            node.data.supabase_id = item.id;
            alreadyExists = true;
          }
        });
        if (alreadyExists) return;

        const isBelonging = !item.archiviato && !item.eliminato;
        if (!isBelonging) return;

        const mapped: OrderItem = {
          id: "ord_" + item.id,
          supabase_id: item.id,
          order_date: item.data || "",
          supplier_name: item.fornitore || "",
          article_code: item.articolo || "",
          description: (item.descrizione || "").toUpperCase(),
          quantity: String(item.quantita || ""),
          price: String(item.prezzo || ""),
          ordered_date: item.ordinato || null,
          notes: item.note || "",
          user_name: item.utente || "",
          is_archived: false,
          is_deleted: false,
          highlights: parseHighlights(item.evidenze),
          created_at: item.created_at || new Date().toISOString(),
          updated_at: item.ultima_modifica || new Date().toISOString(),
          sync_status: "synced",
        };

        api.applyTransaction({ add: [mapped] });
        api.onSortChanged();
      } else if (payload.eventType === "UPDATE" && payload.new) {
        const item = payload.new;
        if (orderSyncService.recentlyPushedRemoteIds.has(item.id)) {
          return;
        }

        const isBelonging = !item.archiviato && !item.eliminato;
        const targetId = "ord_" + item.id;

        let foundNode: any = null;
        api.forEachNode((node) => {
          if (node.data?.supabase_id === item.id || node.data?.id === targetId) {
            foundNode = node;
          }
        });

        if (foundNode) {
          if (!isBelonging) {
            api.applyTransaction({ remove: [foundNode.data] });
          } else {
            const editingCells = api.getEditingCells() || [];
            const isEditing = editingCells.some((c: any) => c.rowIndex === foundNode.rowIndex);
            if (!isEditing) {
              const cur = foundNode.data;
              const updated: OrderItem = {
                ...cur,
                order_date: item.data ?? cur.order_date,
                supplier_name: item.fornitore ?? cur.supplier_name,
                article_code: item.articolo ?? cur.article_code,
                description: (item.descrizione ?? cur.description).toUpperCase(),
                quantity: String(item.quantita ?? cur.quantity),
                price: String(item.prezzo ?? cur.price),
                ordered_date: item.ordinato !== undefined ? item.ordinato : cur.ordered_date,
                notes: item.note ?? cur.notes,
                highlights: parseHighlights(item.evidenze || cur.highlights),
              };
              foundNode.setData(updated);
              api.onSortChanged();
            }
          }
        } else if (isBelonging) {
          const mapped: OrderItem = {
            id: "ord_" + item.id,
            supabase_id: item.id,
            order_date: item.data || "",
            supplier_name: item.fornitore || "",
            article_code: item.articolo || "",
            description: (item.descrizione || "").toUpperCase(),
            quantity: String(item.quantita || ""),
            price: String(item.prezzo || ""),
            ordered_date: item.ordinato || null,
            notes: item.note || "",
            user_name: item.utente || "",
            is_archived: false,
            is_deleted: false,
            highlights: parseHighlights(item.evidenze),
            created_at: item.created_at || new Date().toISOString(),
            updated_at: item.ultima_modifica || new Date().toISOString(),
            sync_status: "synced",
          };
          api.applyTransaction({ add: [mapped] });
          api.onSortChanged();
        }
      } else if (payload.eventType === "DELETE" && payload.old) {
        const delId = payload.old.id;
        let foundNode: any = null;
        api.forEachNode((node) => {
          if (node.data?.supabase_id === delId || node.data?.id === "ord_" + delId) {
            foundNode = node;
          }
        });
        if (foundNode) {
          api.applyTransaction({ remove: [foundNode.data] });
          api.onSortChanged();
        }
      }
    };

    const handleOrderSynced = (e: any) => {
      const { localId, supabaseId } = e.detail || {};
      if (!localId || !supabaseId || !gridRef.current?.api) return;
      gridRef.current.api.forEachNode((node) => {
        if (node.data && node.data.id === localId) {
          node.data.supabase_id = supabaseId;
        }
      });
    };

    window.addEventListener("supabase_update_ordini", handleRemoteUpdate);
    window.addEventListener("order_synced_remote_id", handleOrderSynced);
    return () => {
      window.removeEventListener("supabase_update_ordini", handleRemoteUpdate);
      window.removeEventListener("order_synced_remote_id", handleOrderSynced);
    };
  }, []);

  // Ordinamento intelligente identico a NoManV1:
  // 1. Ordini con fornitore: raggruppati per fornitore (alfabetico) e all'interno per data di creazione crescente
  // 2. Ordini senza fornitore: ordinati rigorosamente per data di creazione crescente
  // 3. Righe vuote di buffer (isNew): sempre in fondo
  const postSortRows = useCallback((params: PostSortRowsParams) => {
    const nodes = params.nodes;
    const filledWithFornitore: any[] = [];
    const filledWithoutFornitore: any[] = [];
    const empties: any[] = [];

    for (const node of nodes) {
      if (node.data?.isNew) {
        empties.push(node);
      } else {
        const forn = node.data?.supplier_name?.trim();
        if (forn) {
          filledWithFornitore.push(node);
        } else {
          filledWithoutFornitore.push(node);
        }
      }
    }

    const parseItalianDate = (d: string | null | undefined): number => {
      if (!d) return 0;
      const parts = d.split("/");
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day).getTime() || 0;
      }
      return new Date(d).getTime() || 0;
    };

    const sortByDate = (a: any, b: any) => {
      const timeA = new Date(a.data?.created_at || 0).getTime();
      const timeB = new Date(b.data?.created_at || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      const dateA = parseItalianDate(a.data?.order_date);
      const dateB = parseItalianDate(b.data?.order_date);
      if (dateA !== dateB) return dateA - dateB;
      return (a.data?.id || "").localeCompare(b.data?.id || "");
    };

    const sortByFornitoreAndDate = (a: any, b: any) => {
      const fornA = (a.data?.supplier_name || "").toLowerCase();
      const fornB = (b.data?.supplier_name || "").toLowerCase();
      if (fornA < fornB) return -1;
      if (fornA > fornB) return 1;
      return sortByDate(a, b);
    };

    filledWithFornitore.sort(sortByFornitoreAndDate);
    filledWithoutFornitore.sort(sortByDate);

    nodes.length = 0;
    nodes.push(...filledWithFornitore, ...filledWithoutFornitore, ...empties);
  }, []);

  const onSortChanged = useCallback((e: any) => {
    const sortState = e.api.getColumnState().filter((s: any) => s.sort != null);
    localStorage.setItem("om_sort_attivi", JSON.stringify(sortState));
  }, []);

  const onGridReady = useCallback((e: any) => {
    const saved = localStorage.getItem("om_sort_attivi");
    if (saved) {
      try {
        const sortState = JSON.parse(saved);
        e.api.applyColumnState({ state: sortState });
      } catch (err) {}
    }
  }, []);

  // Memorizza il fornitore a fuoco tramite REF (senza forzare re-render React a ogni click!)
  const handleCellFocused = useCallback((e: CellFocusedEvent) => {
    if (!e.api || e.rowIndex === null || e.rowIndex === undefined) {
      focusedSupplierRef.current = null;
      return;
    }
    const node = e.api.getDisplayedRowAtIndex(e.rowIndex);
    focusedSupplierRef.current = node?.data?.supplier_name || null;
  }, []);

  // Salvataggio cella modificata a 0ms con inserimento automatico data odierna
  const onCellValueChanged = useCallback(
    async (event: CellValueChangedEvent) => {
      if (event.oldValue === event.newValue) return;
      const { data, node } = event;
      if (!data) return;

      const isDraftRow = Boolean(data.isNew);
      const hasContent =
        Boolean(data.supplier_name?.trim()) ||
        Boolean(data.article_code?.trim()) ||
        Boolean(data.description?.trim()) ||
        Boolean(data.quantity?.trim()) ||
        Boolean(data.price?.trim()) ||
        Boolean(data.notes?.trim()) ||
        Boolean(data.ordered_date?.trim());

      // Se riga bozza senza dati compilati, non salvare
      if (isDraftRow && !hasContent) return;

      // 1. Data automatica odierna alla prima compilazione di una bozza
      const autoDate = data.order_date?.trim() ? data.order_date : TODAY();
      data.order_date = autoDate;
      const wasDraft = Boolean(data.isNew);
      data.isNew = false;
      const nowIso = new Date().toISOString();
      if (wasDraft || !data.created_at) {
        data.created_at = nowIso;
      }
      data.updated_at = nowIso;
      if (data.description) {
        data.description = data.description.toUpperCase();
      }

      if (node?.data) {
        node.data.order_date = autoDate;
        node.data.isNew = false;
        node.data.updated_at = nowIso;
      }

      const itemToSave: OrderItem = {
        ...data,
        order_date: autoDate,
        description: data.description || "",
        created_at: data.created_at,
        updated_at: data.updated_at,
        isNew: false,
      };

      // 2. Se una riga vuota di fondo è stata compilata, aggiungine subito una nuova per mantenere sempre 10 vuote
      if (isDraftRow && gridRef.current?.api) {
        const freshEmpty = createEmptyRow(Date.now());
        gridRef.current.api.applyTransaction({ add: [freshEmpty] });
      }

      // 3. Salvataggio DIRETTO e IMMEDIATO su Supabase (0ms, identico a NoManV1)
      const remotePayload = {
        data: itemToSave.order_date || null,
        fornitore: itemToSave.supplier_name || "",
        articolo: itemToSave.article_code || "",
        descrizione: (itemToSave.description || "").toUpperCase(),
        quantita: String(itemToSave.quantity || ""),
        prezzo: String(itemToSave.price || ""),
        ordinato: itemToSave.ordered_date || null,
        note: itemToSave.notes || "",
        utente: itemToSave.user_name || currentUser,
        archiviato: Boolean(itemToSave.is_archived),
        eliminato: Boolean(itemToSave.is_deleted),
        evidenze: parseHighlights(itemToSave.highlights),
        ultima_modifica: nowIso,
      };

      try {
        const supabase = await orderSyncService.getClient();
        if (supabase) {
          const targetRemoteId =
            itemToSave.supabase_id ||
            (itemToSave.id && !itemToSave.id.startsWith("new_") && !itemToSave.id.startsWith("draft_")
              ? String(itemToSave.id).replace(/^ord_/, "")
              : null);

          if (targetRemoteId) {
            await supabase.from("ordini").update(remotePayload).eq("id", targetRemoteId);
          } else {
            const { data: inserted, error } = await supabase.from("ordini").insert([remotePayload]).select();
            if (!error && inserted && inserted[0]) {
              const remoteId = inserted[0].id;
              itemToSave.supabase_id = remoteId;
              itemToSave.id = remoteId;
              data.supabase_id = remoteId;
              data.id = remoteId;
              if (node?.data) {
                node.data.supabase_id = remoteId;
                node.data.id = remoteId;
              }
              orderSyncService.recentlyPushedRemoteIds.add(remoteId);
              setTimeout(() => orderSyncService.recentlyPushedRemoteIds.delete(remoteId), 30000);
            }
          }
        }
      } catch (sbErr) {
        console.warn("[OrdersActiveTab] Errore salvataggio Supabase diretto:", sbErr);
      }

      // 4. Salvataggio su database SQLite locale in background (senza re-sort durante la digitazione)
      try {
        await orderRepository.upsertOrder(itemToSave, currentUser);
      } catch (err: any) {
        console.error("[OrdersActiveTab] Errore salvataggio riga SQLite:", err);
      }
    },
    [currentUser]
  );

  // Gestione tastiera celle stile Excel puro
  const onCellKeyDown = useCallback((e: CellKeyDownEvent) => {
    const ev = e.event as KeyboardEvent;
    if (!ev) return;

    const isCopy = (ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "c";
    const isPaste = (ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "v";

    if (isCopy && e.value !== undefined && e.value !== null) {
      void navigator.clipboard.writeText(String(e.value));
      return;
    }

    if (isPaste && e.column.isCellEditable(e.node)) {
      void navigator.clipboard.readText().then((text) => {
        if (text !== undefined && text !== null) {
          e.node.setDataValue(e.column.getColId(), text);
        }
      });
      return;
    }

    // Canc o Backspace su cella selezionata: svuota il valore quando la cella NON è in modifica
    const isEditing = e.api.getEditingCells().length > 0;
    if (!isEditing && (ev.key === "Delete" || ev.key === "Backspace")) {
      if (e.column.isCellEditable(e.node)) {
        ev.preventDefault();
        e.node.setDataValue(e.column.getColId(), "");
        return;
      }
    }
  }, []);

  // Filtro rapido Shift + Clic
  const handleCellClicked = useCallback((e: CellClickedEvent) => {
    const ev = e.event as MouseEvent;
    if (ev && ev.shiftKey) {
      ev.preventDefault();
      const colId = e.column.getColId();
      const rawVal = e.data?.[colId as keyof OrderItem];
      if (rawVal === undefined || rawVal === null || rawVal === "") return;
      e.api.setFilterModel({
        [colId]: { filterType: "text", type: "contains", filter: String(rawVal) },
      });
      e.api.onFilterChanged();
      showToast(`Filtro applicato su: "${rawVal}"`);
    }
  }, []);

  // Evidenzia/disevidenzia cella attiva (immediato a video + Supabase Cloud + SQLite)
  const handleHighlightCell = async () => {
    if (!gridRef.current?.api) return;
    const cell = gridRef.current.api.getFocusedCell();
    if (!cell) {
      showToast("Seleziona prima una cella da evidenziare");
      return;
    }
    const node = gridRef.current.api.getDisplayedRowAtIndex(cell.rowIndex);
    if (!node || !node.data || node.data.isNew) return;

    const colId = cell.column.getColId();
    const cur = parseHighlights(node.data.highlights);
    const isHigh = !!cur[colId];
    const counterpart = HIGHLIGHT_COLUMN_MAP[colId];
    const newHigh = { ...cur };
    if (isHigh) {
      delete newHigh[colId];
      if (counterpart) delete newHigh[counterpart];
    } else {
      newHigh[colId] = true;
      if (counterpart) newHigh[counterpart] = true;
    }

    const updatedData = { ...node.data, highlights: newHigh };
    node.setData(updatedData);
    gridRef.current.api.redrawRows({ rowNodes: [node] });
    showToast("Evidenziazione aggiornata");

    const targetRemoteId =
      node.data.supabase_id ||
      (node.data.id && !String(node.data.id).startsWith("new_") && !String(node.data.id).startsWith("draft_")
        ? String(node.data.id).replace(/^ord_/, "")
        : null);

    if (targetRemoteId) {
      try {
        const supabase = await orderSyncService.getClient();
        if (supabase) {
          await supabase
            .from("ordini")
            .update({ evidenze: newHigh, ultima_modifica: new Date().toISOString() })
            .eq("id", targetRemoteId);
        }
      } catch (err) {
        console.warn("[OrdersActiveTab] Errore evidenziazione Supabase:", err);
      }
    }
    void orderRepository.toggleCellHighlight(node.data.id, colId);
  };

  // Sposta una singola riga nel cestino (0ms feedback visivo + Supabase diretto + SQLite)
  const handleDeleteRow = useCallback(
    (row: OrderItem) => {
      if (!row || row.isNew) return;
      const api = gridRef.current?.api;
      if (!api) return;

      // 1. Rimozione istantanea da schermo (0ms)
      api.applyTransaction({ remove: [row] });
      const freshEmpty = createEmptyRow();
      api.applyTransaction({ add: [freshEmpty] });
      api.onSortChanged();
      showToast("Spostato nel cestino");

      // 2. Persistenza asincrona Supabase + SQLite
      void orderRepository.moveToTrash([row], currentUser);
    },
    [currentUser]
  );

  // Sposta le righe selezionate nel cestino
  const handleDeleteSelected = useCallback(async () => {
    const toTrash = selectedRows.filter((r) => !r.isNew);
    if (toTrash.length === 0) return;

    const api = gridRef.current?.api;
    if (!api) return;

    // 1. Rimozione istantanea da schermo (0ms)
    api.applyTransaction({ remove: toTrash });
    const freshEmpties = Array.from({ length: toTrash.length }, (_, i) => createEmptyRow(i));
    api.applyTransaction({ add: freshEmpties });
    api.onSortChanged();
    api.deselectAll();
    setSelectedRows([]);
    showToast(`${toTrash.length} ordini spostati nel cestino`);

    // 2. Persistenza asincrona Supabase + SQLite
    void orderRepository.moveToTrash(toTrash, currentUser);
  }, [selectedRows, currentUser]);

  // Archivia tutte le righe con Data Ordine compilata (0ms a video + Supabase Cloud + SQLite)
  const handleArchiveOrdered = async () => {
    const api = gridRef.current?.api;
    if (!api) return;

    const toArchive: OrderItem[] = [];
    api.forEachNode((node) => {
      if (node.data && !node.data.isNew && node.data.ordered_date && String(node.data.ordered_date).trim() !== "") {
        toArchive.push(node.data);
      }
    });

    if (toArchive.length === 0) {
      showToast("Nessun ordine con Data Ordine compilata da archiviare");
      return;
    }

    // 1. Rimozione immediata da schermo (0ms)
    api.applyTransaction({ remove: toArchive });
    const freshEmpties = Array.from({ length: toArchive.length }, (_, i) => createEmptyRow(i));
    api.applyTransaction({ add: freshEmpties });
    api.onSortChanged();
    showToast(`${toArchive.length} ordini archiviati con successo!`);

    // 2. Persistenza diretta Supabase Cloud
    const remoteIds: string[] = [];
    for (const item of toArchive) {
      const rId =
        item.supabase_id ||
        (item.id && !String(item.id).startsWith("new_") && !String(item.id).startsWith("draft_")
          ? String(item.id).replace(/^ord_/, "")
          : null);
      if (rId && !remoteIds.includes(String(rId))) {
        remoteIds.push(String(rId));
      }
    }

    if (remoteIds.length > 0) {
      for (const rId of remoteIds) {
        orderSyncService.recentlyPushedRemoteIds.add(rId);
        setTimeout(() => orderSyncService.recentlyPushedRemoteIds.delete(rId), 30000);
      }
      try {
        const supabase = await orderSyncService.getClient();
        if (supabase) {
          await supabase
            .from("ordini")
            .update({ archiviato: true, ultima_modifica: new Date().toISOString() })
            .in("id", remoteIds);
        }
      } catch (sbErr) {
        console.warn("[OrdersActiveTab] Errore archiviazione Supabase:", sbErr);
      }
    }

    // 3. Persistenza SQLite locale in background
    void orderRepository.archiveOrderedRows(currentUser);
  };

  // Ricarica e sincronizza manualmente con Supabase Cloud
  const handleManualRefresh = async () => {
    await loadActiveOrders();
    showToast("Aggiornato da Supabase Cloud");
  };

  // Invio ordine email per fornitore della riga selezionata
  const handleSendOrderEmail = async () => {
    let targetSupplier: string | null = focusedSupplierRef.current;
    if (!targetSupplier && gridRef.current?.api) {
      const cell = gridRef.current.api.getFocusedCell();
      if (cell) {
        const node = gridRef.current.api.getDisplayedRowAtIndex(cell.rowIndex);
        if (node?.data && !node.data.isNew && node.data.supplier_name) {
          targetSupplier = node.data.supplier_name;
        }
      }
    }

    if (!targetSupplier) {
      showToast("Posizionati sulla riga del fornitore da ordinare prima di cliccare");
      return;
    }

    const itemsForSupplier: OrderItem[] = [];
    gridRef.current?.api?.forEachNode((node) => {
      if (
        node.data &&
        !node.data.isNew &&
        (node.data.supplier_name || "").trim().toLowerCase() === targetSupplier!.trim().toLowerCase() &&
        !node.data.ordered_date
      ) {
        itemsForSupplier.push(node.data);
      }
    });

    if (itemsForSupplier.length === 0) {
      showToast(`Nessun articolo in sospeso per ${targetSupplier}`);
      return;
    }

    const supData = suppliers.find(
      (s) => (s.name || "").toLowerCase() === targetSupplier!.toLowerCase()
    );

    const res = await orderEmailService.sendOrderEmail({
      supplierName: targetSupplier,
      items: itemsForSupplier,
      supplier: supData,
      currentUser,
    });

    if (res.success) {
      showToast(`Anteprima Outlook aperta per ${targetSupplier}`);
      await loadActiveOrders();
      if (onRefreshData) onRefreshData();
    } else {
      showToast(`Errore invio: ${res.error}`);
    }
  };

  // Esportazione Excel
  const handleExportExcel = async () => {
    const filled: OrderItem[] = [];
    gridRef.current?.api?.forEachNode((node) => {
      if (node.data && !node.data.isNew) {
        filled.push(node.data);
      }
    });
    const res = await orderExcelService.exportOrdersToExcel(filled, "attivi");
    if (res.success) {
      showToast("File salvato sul desktop con successo");
    } else {
      showToast(`Errore esportazione: ${res.error}`);
    }
  };

  // Importazione Excel
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const items = await orderExcelService.parseOrdersExcelFile(file);
      if (items.length === 0) {
        showToast("Il file Excel non contiene ordini validi");
        return;
      }
      for (const it of items) {
        await orderRepository.upsertOrder(
          {
            id: "ord_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
            ...it,
          } as OrderItem,
          currentUser
        );
      }
      showToast(`${items.length} ordini importati con successo!`);
      await loadActiveOrders();
      if (onRefreshData) onRefreshData();
    } catch {
      showToast("Errore durante l'importazione Excel");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Definizione Colonne AG Grid con editor nativo solido e zero refresh
  const columnDefs: ColDef<OrderItem>[] = useMemo(
    () => [
      {
        colId: "col_select",
        headerName: "",
        width: 42,
        minWidth: 42,
        pinned: "left",
        checkboxSelection: true,
        headerCheckboxSelection: true,
        headerCheckboxSelectionFilteredOnly: true,
        suppressMenu: true,
        sortable: false,
        filter: false,
        resizable: false,
        editable: false,
        cellClass: "centered-cell",
      },
      {
        field: "order_date",
        headerName: "Data",
        width: 105,
        editable: false,
      },
      {
        field: "supplier_name",
        headerName: "Fornitore",
        width: 175,
        editable: true,
        cellEditor: SupplierEditor,
        cellEditorParams: { suppliers },
        cellRenderer: (p: any) => {
          if (!p.value || p.value.trim() === "") return "";
          const color = getFornitoreColor(p.value);
          if (!color) return p.value;
          return (
            <div className="flex items-center h-full">
              <span
                style={{
                  backgroundColor: color.bg,
                  color: color.text,
                  border: `1px solid ${color.border}`,
                }}
                className="px-2 py-0.5 rounded text-[11px] font-semibold truncate max-w-[155px]"
              >
                {p.value}
              </span>
            </div>
          );
        },
      },
      {
        field: "article_code",
        headerName: "Codice Articolo",
        width: 145,
        editable: true,
        cellEditor: ExcelTextEditor,
      },
      {
        field: "description",
        headerName: "Descrizione Articolo",
        flex: 2,
        minWidth: 220,
        editable: true,
        cellEditor: ExcelTextEditor,
        valueFormatter: (p) => (p.value ? String(p.value).toUpperCase() : ""),
        valueSetter: (p) => {
          const val = p.newValue ? String(p.newValue).toUpperCase() : "";
          if (p.data.description !== val) {
            p.data.description = val;
            return true;
          }
          return false;
        },
      },
      {
        field: "quantity",
        headerName: "Quantità",
        width: 105,
        editable: true,
        cellEditor: ExcelTextEditor,
        cellClass: "centered-cell",
      },
      {
        field: "price",
        headerName: "Prezzo (€)",
        width: 120,
        editable: true,
        cellEditor: ExcelTextEditor,
      },
      {
        field: "ordered_date",
        headerName: "Data Ordine",
        width: 115,
        editable: true,
        cellEditor: ExcelTextEditor,
        cellRenderer: (p: any) => {
          if (!p.value) return "";
          return (
            <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              {p.value}
            </span>
          );
        },
      },
      {
        field: "notes",
        headerName: "Note",
        flex: 1,
        minWidth: 160,
        editable: true,
        cellEditor: ExcelTextEditor,
      },
      {
        colId: "col_actions",
        headerName: "",
        width: 50,
        sortable: false,
        filter: false,
        editable: false,
        cellClass: "centered-cell",
        cellRenderer: (p: any) => {
          if (p.data?.isNew) return null;
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteRow(p.data);
              }}
              title="Sposta nel cestino"
              className="text-red-400 hover:text-red-300 p-1 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          );
        },
      },
    ],
    [currentUser, suppliers, handleDeleteRow]
  );

  const defaultColDef: ColDef = useMemo(
    () => ({
      resizable: true,
      sortable: true,
      filter: true,
      editable: false,
      cellStyle: (p: any) => {
        const colId = p.column.getColId();
        if (
          !colId ||
          colId === "col_select" ||
          colId === "col_actions" ||
          colId === "0" ||
          colId === "1" ||
          !isNaN(Number(colId))
        ) {
          return null;
        }
        if (
          p.data?.highlights &&
          typeof p.data.highlights === "object" &&
          !Array.isArray(p.data.highlights) &&
          p.data.highlights[colId] === true
        ) {
          return { backgroundColor: "#ef4444", color: "#ffffff", fontWeight: "bold" };
        }
        return null;
      },
    }),
    []
  );

  return (
    <div className="flex flex-col h-full w-full text-[var(--foreground)] overflow-hidden">
      {/* 1. Toolbar Azioni (senza riga 'pronti da ordinare') */}
      <div className="px-4 py-2 bg-[var(--background)] border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSendOrderEmail}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-xs transition-all"
            title="Invia ordine via Outlook per il fornitore della riga selezionata"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Invia Ordine</span>
          </button>

          <button
            onClick={handleArchiveOrdered}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 cursor-pointer transition-colors"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Archivia Ordinate</span>
          </button>

          <button
            onClick={handleHighlightCell}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600/20 text-red-300 hover:bg-red-600/30 border border-red-500/30 cursor-pointer transition-colors"
            title="Evidenzia di rosso o toglie evidenziazione dalla cella selezionata"
          >
            <Highlighter className="w-3.5 h-3.5" />
            <span>Evidenzia Cella</span>
          </button>

          {selectedRows.filter((r) => !r.isNew).length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-500 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Cestina ({selectedRows.filter((r) => !r.isNew).length})</span>
            </button>
          )}

          <div className="h-5 w-px bg-[var(--border)] mx-1" />

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[var(--card)] hover:bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
            title="Esporta foglio Excel sul Desktop"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Excel</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[var(--card)] hover:bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
            title="Importa ordini da file Excel"
          >
            <Upload className="w-3.5 h-3.5 text-blue-400" />
            <span>Importa</span>
          </button>

          <button
            onClick={handleManualRefresh}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[var(--card)] hover:bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
            title="Sincronizza ordini con Supabase Cloud"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => setShowShortcuts(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[var(--card)] hover:bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
            title="Visualizza scorciatoie da tastiera"
          >
            <Keyboard className="w-3.5 h-3.5 text-yellow-400" />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportExcel}
            className="hidden"
          />
        </div>

        <div className="flex items-center gap-3 text-xs">
          {toastMessage && (
            <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium">
              {toastMessage}
            </span>
          )}

          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
            📝 {filledCount} righe piene
          </span>
          <span className="px-2.5 py-1 rounded-full bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)]">
            +10 righe vuote in fondo
          </span>
        </div>
      </div>

      {/* 2. Barra Filtro Rapido */}
      <div className="px-4 py-1.5 bg-[var(--background)] border-b border-[var(--border)] flex items-center gap-2">
        <button
          onClick={() => {
            gridRef.current?.api?.setFilterModel(null);
            gridRef.current?.api?.setQuickFilter("");
            setQuickFilterText("");
            showToast("Filtro azzerato");
          }}
          className="p-1 rounded bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 border border-yellow-500/30 cursor-pointer"
          title="Azzera filtri (F4)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <input
          type="text"
          placeholder="Filtro rapido su tutte le colonne (es: Arexons, Viti, Knipex)..."
          value={quickFilterText}
          onChange={(e) => {
            setQuickFilterText(e.target.value);
            gridRef.current?.api?.setQuickFilter(e.target.value);
          }}
          className="w-80 px-2.5 py-1 text-xs bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded outline-none focus:border-[var(--primary)] font-medium"
        />
        <span className="text-[11px] text-[var(--muted-foreground)]">
          Fai clic su una cella per modificarla subito. Premi <kbd className="px-1 py-0.5 rounded bg-[var(--card)] border border-[var(--border)]">Shift + Clic</kbd> per filtrare.
        </span>
      </div>

      {/* 3. Griglia Principale AG Grid (Excel feel, navigazione frecce nativa e zero sfarfallio) */}
      <div className="flex-1 w-full h-full overflow-hidden p-2">
        <div className="ag-theme-alpine orders-modern-grid w-full h-full">
          <AgGridReact<OrderItem>
            ref={gridRef}
            rowData={orders}
            getRowId={(p) => p.data.id}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            postSortRows={postSortRows}
            onGridReady={onGridReady}
            onSortChanged={onSortChanged}
            onCellValueChanged={onCellValueChanged}
            onModelUpdated={onModelUpdated}
            onCellKeyDown={onCellKeyDown}
            onCellClicked={handleCellClicked}
            onCellFocused={handleCellFocused}
            rowSelection="multiple"
            suppressRowClickSelection={true}
            stopEditingWhenCellsLoseFocus={true}
            enterNavigatesVertically={true}
            enterNavigatesVerticallyAfterEdit={true}
            animateRows={true}
            onSelectionChanged={(e) => setSelectedRows(e.api.getSelectedRows())}
            getRowClass={(p) => (p.data?.isNew ? "ag-row-new-entry" : "")}
          />
        </div>
      </div>

      {/* Modal Scorciatoie */}
      <OrderShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
};

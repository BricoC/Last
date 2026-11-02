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
import { orderSupabaseService } from "@/features/orders/services/orderSupabaseService";
import { orderEmailService } from "@/features/orders/services/orderEmailService";
import { orderExcelService } from "@/features/orders/services/orderExcelService";
import { TODAY, getFornitoreColor, parseHighlights, HIGHLIGHT_COLUMN_MAP } from "@/features/orders/utils/constants";
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
      const d = node.data;
      if (
        !d?.isNew &&
        (d?.description?.trim() ||
          d?.article_code?.trim() ||
          d?.supplier_name?.trim() ||
          d?.quantity?.trim() ||
          d?.price?.trim() ||
          d?.ordered_date?.trim() ||
          d?.notes?.trim())
      ) {
        count++;
      }
    });
    setFilledCount(count);
  }, []);

  const createEmptyRow = (idx: number = 0): OrderItem => {
    const k = `ord_draft_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      _rowKey: k,
      id: k,
      order_date: "",
      supplier_name: "",
      article_code: "",
      description: "",
      quantity: "",
      price: "",
      ordered_date: null,
      notes: "",
      user_name: currentUser,
      is_archived: false,
      is_deleted: false,
      highlights: {},
      created_at: "",
      updated_at: "",
      sync_status: "synced",
      isNew: true,
    };
  };

  // Caricamento ordini attivi direttamente da Supabase Cloud (con fallback offline)
  const loadActiveOrders = useCallback(async () => {
    setLoading(true);
    try {
      const active = await orderSupabaseService.fetchOrders("attivi");
      const mappedActive: OrderItem[] = active.map((r) => ({
        ...r,
        _rowKey: r._rowKey || r.id,
      }));
      const emptyRows: OrderItem[] = Array.from({ length: EMPTY_BUFFER_SIZE }, (_, i) => createEmptyRow(i));
      setOrders([...mappedActive, ...emptyRows]);
    } catch (err: any) {
      console.error("[OrdersActiveTab] Errore caricamento ordini:", err);
      showToast("Errore caricamento ordini");
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void loadActiveOrders();
  }, [loadActiveOrders]);

  // Se c'è un ordine target (dalla ricerca globale), evidenzialo e scrolla
  useEffect(() => {
    if (targetOrderId && gridRef.current?.api && orders.length > 0) {
      const api = gridRef.current.api;
      let targetNode: any = null;
      api.forEachNode((node) => {
        if (node.data?.id === targetOrderId || node.data?.supabase_id === targetOrderId) {
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

  // Ascolto in tempo reale degli aggiornamenti Supabase (identico a noManV1)
  useEffect(() => {
    const handleRemoteUpdate = (e: any) => {
      const payload = e.detail;
      if (!payload || !gridRef.current?.api) return;
      const api = gridRef.current.api;

      const findNode = (id: string | number) => {
        let found: any = null;
        const targetClean = orderSupabaseService.cleanId(id);
        api.forEachNode((node: any) => {
          if (
            String(node.data?.id) === String(id) ||
            String(node.data?.supabase_id) === String(id) ||
            String(node.data?._rowKey) === String(id) ||
            (targetClean && orderSupabaseService.cleanId(node.data?.id) === targetClean) ||
            (targetClean && orderSupabaseService.cleanId(node.data?.supabase_id) === targetClean)
          ) {
            found = node;
          }
        });
        return found;
      };

      if (payload.eventType === "INSERT" && payload.new) {
        const item = payload.new;
        if (orderSupabaseService.recentlyPushedRemoteIds.has(String(item.id))) {
          return;
        }

        const existing = findNode(item.id);
        if (existing) return;

        const isBelonging = !item.archiviato && !item.eliminato;
        if (!isBelonging) return;

        const mapped: OrderItem = {
          _rowKey: String(item.id),
          id: String(item.id),
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
        if (orderSupabaseService.recentlyPushedRemoteIds.has(String(item.id))) {
          return;
        }

        const isBelonging = !item.archiviato && !item.eliminato;
        const foundNode = findNode(item.id);

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
            }
          }
        } else if (isBelonging) {
          const mapped: OrderItem = {
            _rowKey: String(item.id),
            id: String(item.id),
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
        const foundNode = findNode(payload.old.id);
        if (foundNode) {
          api.applyTransaction({ remove: [foundNode.data] });
        }
      }
    };

    window.addEventListener("supabase_update_ordini", handleRemoteUpdate);
    return () => {
      window.removeEventListener("supabase_update_ordini", handleRemoteUpdate);
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
      const d = node.data;
      const isFilled =
        !d?.isNew &&
        (Boolean(d?.description?.trim()) ||
          Boolean(d?.article_code?.trim()) ||
          Boolean(d?.supplier_name?.trim()) ||
          Boolean(d?.quantity?.trim()) ||
          Boolean(d?.price?.trim()) ||
          Boolean(d?.notes?.trim()) ||
          Boolean(d?.ordered_date?.trim()));

      if (!isFilled) {
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

  const handleCellFocused = useCallback((e: CellFocusedEvent) => {
    if (!e.api || e.rowIndex === null || e.rowIndex === undefined) {
      focusedSupplierRef.current = null;
      return;
    }
    const node = e.api.getDisplayedRowAtIndex(e.rowIndex);
    focusedSupplierRef.current = node?.data?.supplier_name || null;
  }, []);

  // Salvataggio cella: Diretto su Supabase Cloud (con accodamento offline automatico)
  const onCellValueChanged = useCallback(
    async (event: CellValueChangedEvent) => {
      if (event.oldValue === event.newValue) return;
      const { data, node } = event;
      if (!data) return;

      const isDraftRow = Boolean(data.isNew) || String(data.id).startsWith("ord_draft_") || String(data.id).startsWith("new_");

      const hasContent =
        Boolean(data.supplier_name?.trim()) ||
        Boolean(data.article_code?.trim()) ||
        Boolean(data.description?.trim()) ||
        Boolean(data.quantity?.trim()) ||
        Boolean(data.price?.trim()) ||
        Boolean(data.notes?.trim()) ||
        Boolean(data.ordered_date?.trim());

      if (isDraftRow && !hasContent) return;

      const autoDate = data.order_date?.trim() ? data.order_date : TODAY();
      data.order_date = autoDate;
      data.isNew = false;
      const nowIso = new Date().toISOString();
      if (!data.created_at) data.created_at = nowIso;
      data.updated_at = nowIso;
      if (data.description) {
        data.description = data.description.toUpperCase();
      }

      if (node?.data) {
        node.data.order_date = autoDate;
        node.data.isNew = false;
        node.data.updated_at = nowIso;
        node.data.description = data.description;
      }

      // Rinfresca IMMEDIATAMENTE le celle (inclusa la colonna cestino col_actions e la data)
      if (gridRef.current?.api && node) {
        gridRef.current.api.refreshCells({
          rowNodes: [node],
          columns: ["col_actions", "order_date", "description"],
          force: true,
        });
      }

      // Se una riga vuota di fondo è stata compilata, aggiungine subito una nuova per mantenere il buffer
      if (isDraftRow && gridRef.current?.api) {
        const freshEmpty = createEmptyRow();
        gridRef.current.api.applyTransaction({ add: [freshEmpty] });
      }

      // Ricalcola conteggio righe piene
      if (gridRef.current?.api) {
        let count = 0;
        gridRef.current.api.forEachNode((n: any) => {
          const d = n.data;
          if (
            !d?.isNew &&
            (d?.description?.trim() ||
              d?.article_code?.trim() ||
              d?.supplier_name?.trim() ||
              d?.quantity?.trim() ||
              d?.price?.trim() ||
              d?.ordered_date?.trim() ||
              d?.notes?.trim())
          ) {
            count++;
          }
        });
        setFilledCount(count);
      }

      // Salvataggio DIRETTO su Supabase
      const res = await orderSupabaseService.saveOrder(data, isDraftRow);
      if (res.success && res.data) {
        data.id = res.data.id;
        data.supabase_id = res.data.supabase_id;
        if (node?.data) {
          node.data.id = res.data.id;
          node.data.supabase_id = res.data.supabase_id;
        }
        if (gridRef.current?.api && node) {
          gridRef.current.api.refreshCells({
            rowNodes: [node],
            columns: ["col_actions"],
            force: true,
          });
        }
      }
    },
    [currentUser]
  );

  // Gestione tastiera celle (copia/incolla Excel nativo)
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

  // Evidenzia/disevidenzia cella attiva (0ms a video + Supabase Cloud)
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

    void orderSupabaseService.updateCellHighlight(node.data.id, newHigh);
  };

  // Sposta una singola riga nel cestino (0ms feedback visivo + Supabase Cloud)
  const handleDeleteRow = useCallback(
    (row: OrderItem) => {
      if (!row) return;
      const api = gridRef.current?.api;
      if (!api) return;

      // Trova il nodo esatto nella griglia (anche se row.id o _rowKey è variato)
      let nodeToRemove: any = null;
      api.forEachNode((n: any) => {
        if (
          (row._rowKey && n.data?._rowKey === row._rowKey) ||
          (row.id && String(n.data?.id) === String(row.id)) ||
          (row.supabase_id && String(n.data?.supabase_id) === String(row.supabase_id))
        ) {
          nodeToRemove = n;
        }
      });

      if (nodeToRemove) {
        api.applyTransaction({ remove: [nodeToRemove.data] });
      } else {
        api.applyTransaction({ remove: [row] });
      }

      // Aggiungi una nuova riga vuota di buffer in fondo
      const freshEmpty = createEmptyRow();
      api.applyTransaction({ add: [freshEmpty] });

      // Ricalcola conteggio righe piene
      let count = 0;
      api.forEachNode((n: any) => {
        const d = n.data;
        if (
          !d?.isNew &&
          (d?.description?.trim() ||
            d?.article_code?.trim() ||
            d?.supplier_name?.trim() ||
            d?.quantity?.trim() ||
            d?.price?.trim() ||
            d?.ordered_date?.trim() ||
            d?.notes?.trim())
        ) {
          count++;
        }
      });
      setFilledCount(count);

      showToast("Spostato nel cestino");

      const targetId = String(row.supabase_id || row.id);
      void orderSupabaseService.moveToTrash([targetId]);
    },
    [currentUser]
  );

  // Sposta le righe selezionate nel cestino
  const handleDeleteSelected = useCallback(async () => {
    const toTrash = selectedRows.filter(
      (r) =>
        !r.isNew &&
        (r.description?.trim() || r.article_code?.trim() || r.supplier_name?.trim() || r.quantity?.trim())
    );
    if (toTrash.length === 0) return;

    const api = gridRef.current?.api;
    if (!api) return;

    api.applyTransaction({ remove: toTrash });
    const freshEmpties = Array.from({ length: toTrash.length }, (_, i) => createEmptyRow(i));
    api.applyTransaction({ add: freshEmpties });
    api.deselectAll();
    setSelectedRows([]);

    let count = 0;
    api.forEachNode((n: any) => {
      const d = n.data;
      if (
        !d?.isNew &&
        (d?.description?.trim() ||
          d?.article_code?.trim() ||
          d?.supplier_name?.trim() ||
          d?.quantity?.trim() ||
          d?.price?.trim() ||
          d?.ordered_date?.trim() ||
          d?.notes?.trim())
      ) {
        count++;
      }
    });
    setFilledCount(count);

    showToast(`${toTrash.length} ordini spostati nel cestino`);

    const ids = toTrash.map((r) => String(r.supabase_id || r.id));
    void orderSupabaseService.moveToTrash(ids);
  }, [selectedRows, currentUser]);

  // Archivia tutte le righe con Data Ordine compilata (0ms a video + Supabase Cloud)
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

    api.applyTransaction({ remove: toArchive });
    const freshEmpties = Array.from({ length: toArchive.length }, (_, i) => createEmptyRow(i));
    api.applyTransaction({ add: freshEmpties });
    api.onSortChanged();
    showToast(`${toArchive.length} ordini archiviati con successo!`);

    void orderSupabaseService.archiveOrders(toArchive.map((r) => r.id));
  };

  // Ricarica manualmente da Supabase Cloud
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
        targetSupplier = node?.data?.supplier_name || null;
      }
    }

    if (!targetSupplier || targetSupplier.trim() === "") {
      showToast("Seleziona prima una riga appartenente al fornitore che desideri ordinare");
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
        await orderSupabaseService.saveOrder(
          {
            id: "",
            ...it,
          } as OrderItem,
          true
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

  // Definizione Colonne AG Grid
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
          const hasContent =
            Boolean(p.data?.description?.trim()) ||
            Boolean(p.data?.article_code?.trim()) ||
            Boolean(p.data?.supplier_name?.trim()) ||
            Boolean(p.data?.quantity?.trim()) ||
            Boolean(p.data?.price?.trim()) ||
            Boolean(p.data?.notes?.trim()) ||
            Boolean(p.data?.ordered_date?.trim());

          if (!hasContent && p.data?.isNew) return null;
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
      floatingFilter: false,
      suppressMovable: false,
      comparator: (valueA, valueB, nodeA, nodeB, isDescending) => {
        const aBottom = nodeA.data?.isNew || String(nodeA.data?.id).startsWith("new_") || String(nodeA.data?.id).startsWith("ord_draft_");
        const bBottom = nodeB.data?.isNew || String(nodeB.data?.id).startsWith("new_") || String(nodeB.data?.id).startsWith("ord_draft_");
        if (aBottom && !bBottom) return isDescending ? -1 : 1;
        if (!aBottom && bBottom) return isDescending ? 1 : -1;
        if (aBottom && bBottom) return 0;
        if (valueA === valueB) return 0;
        return valueA > valueB ? 1 : -1;
      },
      cellStyle: (p) => {
        if (p.data && p.data.highlights) {
          const colId = p.column.getColId();
          const counterpart = HIGHLIGHT_COLUMN_MAP[colId];
          if (p.data.highlights[colId] || (counterpart && p.data.highlights[counterpart])) {
            return { backgroundColor: "#ef4444", color: "#000000", fontWeight: "bold" };
          }
        }
        return null;
      },
    }),
    []
  );

  return (
    <div className="flex flex-col h-full w-full bg-[var(--background)] select-none">
      {/* 1. Barra Strumenti Principale */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--card)] border-b border-[var(--border)] gap-2 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSendOrderEmail}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-xs cursor-pointer transition-colors"
            title="Invia ordine fornitore tramite Outlook"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Invia Ordine</span>
          </button>

          <button
            onClick={handleArchiveOrdered}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition-colors"
            title="Archivia tutti gli ordini che hanno la Data Ordine compilata"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Archivia Ordinate</span>
          </button>

          <button
            onClick={handleHighlightCell}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-xs cursor-pointer transition-colors"
            title="Evidenzia di rosso la cella selezionata"
          >
            <Highlighter className="w-3.5 h-3.5" />
            <span>Evidenzia Cella</span>
          </button>

          {selectedRows.filter((r) => !r.isNew).length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 cursor-pointer transition-colors"
              title="Sposta gli ordini selezionati nel cestino"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Sposta nel Cestino ({selectedRows.filter((r) => !r.isNew).length})</span>
            </button>
          )}

          <div className="h-4 w-px bg-[var(--border)] mx-1" />

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[var(--card)] hover:bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
            title="Esporta ordini in file Excel"
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
            title="Aggiorna ordini da Supabase Cloud"
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
          🧹
        </button>

        <input
          type="text"
          value={quickFilterText}
          onChange={(e) => {
            setQuickFilterText(e.target.value);
            gridRef.current?.api?.setQuickFilter(e.target.value);
          }}
          placeholder="Filtro rapido su tutte le colonne (es: Arexons, Viti, Knip)..."
          className="flex-1 max-w-md bg-[var(--card)] border border-[var(--border)] rounded px-2.5 py-1 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
        />

        <span className="text-[11px] text-[var(--muted-foreground)] italic ml-2">
          *Fai clic su una cella per modificarla subito. Premi <strong>Shift + Clic</strong> per Filtrare.
        </span>
      </div>

      {/* 3. Griglia Principale AG Grid (identica a noManV1) */}
      <div className="flex-1 w-full h-full overflow-hidden p-2">
        <div className="ag-theme-alpine orders-modern-grid w-full h-full">
          <AgGridReact<OrderItem>
            ref={gridRef}
            rowData={orders}
            getRowId={(p) => p.data._rowKey || String(p.data.id)}
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

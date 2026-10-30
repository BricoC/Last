import React, { useState, useEffect, useRef, useMemo, useDeferredValue, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import DDTTextEditor from "./DDTTextEditor";
import {
  Search,
  X,
  RefreshCw,
  LayoutGrid,
  Columns,
  Rows,
  CheckCircle2,
  Check,
} from "lucide-react";
import { ListinoGeneraleRow, ListinoClienteRow } from "@/features/price-lists/models/priceList";
import { priceListRepository } from "@/features/price-lists/services/priceListRepository";
import { getDdtArticleViewRows, DdtArticleViewRow } from "../services/ddtReadModelsRepository";
import { DdtItem } from "../models/ddt";
import { formatDdtViewDate } from "../services/ddtViewFormatting";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { money, safeMoney, isPositivePrice } from "@/shared/domain/monetaryValue";
import { calculateRowAmounts } from "../utils/ddtCalculations";
import { isClientMatching, resolveClientPriceLists } from "../utils/clientPriceListMatcher";

export interface DDTMultiListinoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentClientName?: string;
  currentDdtItems: DdtItem[];
  onUpdateDdtItems?: React.Dispatch<React.SetStateAction<DdtItem[]>>;
  onSelectArticle: (article: {
    code?: string;
    description: string;
    unit?: string;
    quantity: string;
    unit_price: number;
    purchase_price?: number;
    vat_rate?: number;
  }) => void;
}

interface PendingArticleInsert {
  code?: string;
  description: string;
  unit?: string;
  quantity?: string;
  unit_price: number;
  purchase_price?: number;
  vat_rate?: number;
}



export const DDTMultiListinoModal: React.FC<DDTMultiListinoModalProps> = ({
  isOpen,
  onClose,
  currentClientName,
  currentDdtItems,
  onUpdateDdtItems,
  onSelectArticle,
}) => {
  // Modalità disposizione: 'horizontal' (4 fasce orizzontali sovrapposte come Foto 3) o 'vertical' (4 colonne affiancate)
  const [layoutMode, setLayoutMode] = useState<"horizontal" | "vertical">("horizontal");

  // Ricerca globale sincronizzata su tutte le finestre
  const [globalSearch, setGlobalSearch] = useState("");
  const deferredSearch = useDeferredValue(globalSearch);

  // Toggle visibilità finestre (List. Gen, List. Clienti, Storico DDT, Articoli DDT)
  const [showGen, setShowGen] = useState(true);
  const [showCli, setShowCli] = useState(true);
  const [showHistory, setShowHistory] = useState(true);
  const [showCurrentDdt, setShowCurrentDdt] = useState(true);

  // Filtro cliente dedicato per Listini Clienti (supporta ricerca multi-parola!)
  const [clientFilter, setClientFilter] = useState<string>("");
  const [currentClientPls, setCurrentClientPls] = useState<Set<string>>(new Set());

  // Dati delle 4 finestre
  const [generalItems, setGeneralItems] = useState<ListinoGeneraleRow[]>([]);
  const [clientItems, setClientItems] = useState<ListinoClienteRow[]>([]);
  const [historyRows, setHistoryRows] = useState<DdtArticleViewRow[]>([]);

  // Grid ref per tabella Articoli nel DDT (Finestra 4 - AG Grid puro come la tabella DDT principale)
  const currentDdtGridRef = useRef<AgGridReact<DdtItem>>(null);

  // Filtra DDT corrente con ricerca
  const [filterCurrentWithSearch, setFilterCurrentWithSearch] = useState(false);

  // Popup quantita inserimento
  const [pendingInsert, setPendingInsert] = useState<PendingArticleInsert | null>(null);
  const [insertQuantity, setInsertQuantity] = useState("1");
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Caricamento dati iniziali
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [gen, cli, hist] = await Promise.all([
        priceListRepository.searchGeneral("", 10000),
        priceListRepository.searchClientPrices("", undefined, 20000),
        getDdtArticleViewRows(),
      ]);

      setGeneralItems(gen);
      setClientItems(cli);
      setHistoryRows(hist);

      if (currentClientName && currentClientName.trim()) {
        const resolved = await resolveClientPriceLists(currentClientName);
        const plSet = new Set<string>();
        resolved.forEach((p) => {
          plSet.add(p.toUpperCase());
          plSet.add(p.replace(/^LIST_/, "").toUpperCase());
        });
        setCurrentClientPls(plSet);
      } else {
        setCurrentClientPls(new Set());
      }
      setClientFilter("");
    } catch (err) {
      console.error("Errore caricamento dati Alex Multi-Listino:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setPendingInsert(null);
      setInsertQuantity("1");
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
      void loadData();
    }
  }, [isOpen]);

  // Gestione tasto ESC globale: non chiudere se una cella è attiva/in edit mode
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // 1. Cella in fase di digitazione / modifica (inline editing)
        const isEditingCell = Boolean(
          window.__isDDTCellEditing ||
          document.querySelector(".ag-cell-inline-editing, .ag-cell-editing, .ag-popup-editor") ||
          (currentDdtGridRef.current?.api?.getEditingCells?.()?.length ?? 0) > 0 ||
          (document.activeElement && document.activeElement.closest(".alex-ddt-grid") && document.activeElement.tagName === "INPUT")
        );

        if (isEditingCell) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          window.__isDDTCellEditing = false;
          currentDdtGridRef.current?.api?.stopEditing(true);
          return;
        }

        // 2. Cella selezionata / attiva nella tabella (focus)
        const focusedCell = currentDdtGridRef.current?.api?.getFocusedCell();
        const isGridFocused = Boolean(
          focusedCell ||
          (document.activeElement && document.activeElement.closest(".alex-ddt-grid"))
        );

        if (isGridFocused) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          currentDdtGridRef.current?.api?.clearFocusedCell();
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          return;
        }

        // 3. Popup quantità di inserimento
        if (pendingInsert) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setPendingInsert(null);
          return;
        }

        // 4. Nessuna cella attiva/in modifica: chiudi il popup Alex!
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, pendingInsert, onClose]);

  // Focus automatico sul popup quantità
  useEffect(() => {
    if (pendingInsert) {
      setTimeout(() => {
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
      }, 50);
    }
  }, [pendingInsert]);

  // Token ricerca unificata
  const searchTokens = useMemo(() => tokenizeSearch(deferredSearch), [deferredSearch]);

  // 1. Filtraggio Finestra Listino Generale (9763)
  const filteredGeneral = useMemo(() => {
    if (searchTokens.length === 0) return generalItems;
    return generalItems.filter((item) => {
      const text = `${item.descrizione} ${item.codice_articolo || ""} ${item.fornitore || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }, [generalItems, searchTokens]);

  // 2. Filtraggio Finestra Listini Clienti (Fedele a NoManV1: default su cliente DDT, override su filtro manuale)
  const filteredClients = useMemo(() => {
    let result = clientItems;

    // Se l'utente ha digitato un filtro manuale
    if (clientFilter.trim()) {
      const filterClean = clientFilter.trim();
      const matchesCurrentClient = currentClientName && isClientMatching(filterClean, currentClientName);

      result = result.filter((item) => {
        if (matchesCurrentClient && currentClientPls.has(item.cliente.toUpperCase())) {
          return true;
        }
        if (isClientMatching(filterClean, item.cliente)) {
          return true;
        }
        const rawCli = item.cliente.toLowerCase();
        const cleanCli = item.cliente.replace(/^LIST_/, "").toLowerCase();
        const normCli = `${rawCli} ${cleanCli} ${rawCli.replace(/[^a-z0-9]/g, " ")} ${cleanCli.replace(/[^a-z0-9]/g, " ")}`;
        const clientTokens = tokenizeSearch(filterClean);
        return clientTokens.every((tok) => normCli.includes(tok));
      });
    } else if (currentClientName && currentClientName.trim()) {
      // Nessun filtro manuale: mostra automaticamente il listino associato al cliente del DDT
      result = result.filter((item) => {
        if (currentClientPls.has(item.cliente.toUpperCase())) {
          return true;
        }
        return isClientMatching(currentClientName, item.cliente);
      });
    }

    // Filtro globale
    if (searchTokens.length > 0) {
      result = result.filter((item) => {
        const text = `${item.cliente} ${item.descrizione} ${item.codice_articolo || ""}`.toLowerCase();
        return searchTokens.every((token) => text.includes(token));
      });
    }
    return result;
  }, [clientItems, clientFilter, currentClientName, currentClientPls, searchTokens]);

  // 3. Filtraggio Finestra Storico DDT (~31k vendite)
  const filteredHistory = useMemo(() => {
    if (searchTokens.length === 0) return historyRows;
    return historyRows.filter((row) => {
      const text = `${row.description} ${row.client} ${row.docNumber || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }, [historyRows, searchTokens]);

  // 4. Filtraggio Finestra Articoli nel DDT attuale
  const nonBlankCurrentItems = useMemo(() => {
    const list = currentDdtItems.filter(
      (it) => it.description?.trim().length > 0 || (it.unit_price && it.unit_price.isPositive())
    );
    if (!filterCurrentWithSearch || searchTokens.length === 0) return list;
    return list.filter((it) => {
      const text = `${it.description} ${it.code || ""}`.toLowerCase();
      return searchTokens.every((token) => text.includes(token));
    });
  }, [currentDdtItems, filterCurrentWithSearch, searchTokens]);

  const handleOpenInsert = (article: PendingArticleInsert) => {
    setPendingInsert(article);
    setInsertQuantity(article.quantity || "1");
  };

  const handleConfirmInsert = () => {
    if (!pendingInsert) return;
    onSelectArticle({
      ...pendingInsert,
      quantity: insertQuantity.trim() || "1",
    });
    setPendingInsert(null);
  };

  // Verifica se una riga contiene solo testo/nota (es. ASDASD) senza prezzi o quantità
  const isTextOnlyRow = (item?: DdtItem | null) => {
    if (!item) return false;
    return (
      !isPositivePrice(item.unit_price) &&
      (!item.quantity || item.quantity.trim() === "" || item.quantity.trim() === "0") &&
      !isPositivePrice(item.purchase_price)
    );
  };

  // Navigazione Tab in avanti e indietro stile Excel tra le sole colonne editabili
  const tabToNextCell = useCallback(
    (params: any) => {
      const { previousCellPosition, backwards } = params;
      const editableCols = [
        "unit",
        "quantity",
        "description",
        "unit_price",
        "discount_pct",
        "vat_rate",
        "purchase_price",
        "ric_pct",
      ];

      const currentColId = previousCellPosition.column.getColId();
      let colIdx = editableCols.indexOf(currentColId);
      let rowIndex = previousCellPosition.rowIndex;

      if (colIdx === -1) {
        colIdx = backwards ? editableCols.length - 1 : 0;
      } else if (backwards) {
        colIdx--;
        if (colIdx < 0) {
          if (rowIndex > 0) {
            rowIndex--;
            colIdx = editableCols.length - 1;
          } else {
            return null;
          }
        }
      } else {
        colIdx++;
        if (colIdx >= editableCols.length) {
          if (rowIndex < nonBlankCurrentItems.length - 1) {
            rowIndex++;
            colIdx = 0;
          } else {
            return null;
          }
        }
      }

      const nextCol = params.api.getColumn(editableCols[colIdx]);
      return {
        rowIndex,
        column: nextCol,
        rowPinned: previousCellPosition.rowPinned ?? null,
      };
    },
    [nonBlankCurrentItems.length]
  );

  // Navigazione frecce orizzontali stile Excel
  const navigateToNextCell = useCallback((params: any) => {
    const { nextCellPosition, key } = params;
    if (!nextCellPosition) return null;

    const targetColId = nextCellPosition.column.getColId();
    if (key === "ArrowRight" || key === 39) {
      if (targetColId === "net_amount") {
        const vatCol = params.api.getColumn("vat_rate");
        return { ...nextCellPosition, column: vatCol };
      }
    }
    return nextCellPosition;
  }, []);

  // Gestione tastiera celle (Delete / Backspace svuota la cella come in Excel)
  const handleCurrentDdtCellKeyDown = useCallback(
    (e: any) => {
      if (!e.event) return;

      if (
        (e.event.key === "Delete" || e.event.key === "Backspace") &&
        !window.__isDDTCellEditing
      ) {
        if (e.column?.isCellEditable(e.node)) {
          const colId = e.column.getColId();
          const itemId = e.node.data.id;
          if (!onUpdateDdtItems) return;

          onUpdateDdtItems((prev) => {
            const copy = [...prev];
            const targetIdx = copy.findIndex((it) => it.id === itemId);
            if (targetIdx === -1) return prev;

            const target = copy[targetIdx];
            const updatedRow: DdtItem = { ...target };

            if (colId === "unit_price") {
              updatedRow.unit_price = money(0);
              updatedRow.base_price = money(0);
            } else if (colId === "purchase_price") {
              updatedRow.purchase_price = money(0);
            } else if (colId === "discount_pct") {
              updatedRow.discount_pct = "";
              updatedRow.base_discount_pct = "";
            } else if (colId === "vat_rate") {
              updatedRow.vat_rate = "";
            } else if (colId === "quantity") {
              updatedRow.quantity = "";
            } else if (colId === "description") {
              updatedRow.description = "";
            } else if (colId === "unit") {
              updatedRow.unit = "";
            }

            const { netAmount, vatAmount } = calculateRowAmounts(
              updatedRow.quantity || (isPositivePrice(updatedRow.unit_price) ? "1" : ""),
              safeMoney(updatedRow.unit_price),
              updatedRow.discount_pct || "0",
              updatedRow.vat_rate
            );
            updatedRow.net_amount = netAmount;
            updatedRow.vat_amount = vatAmount;

            copy[targetIdx] = updatedRow;
            return copy;
          });

          if (currentDdtGridRef.current?.api) {
            currentDdtGridRef.current.api.refreshCells({ rowNodes: [e.node], force: true });
          }
        }
      }
    },
    [onUpdateDdtItems]
  );

  // Sincronizzazione modifiche celle Finestra 4 con ricalcolo bidirezionale Prezzo <-> Ricarico
  const handleCurrentDdtCellValueChanged = useCallback(
    (params: any) => {
      if (!onUpdateDdtItems) return;
      const colId = params.column.getColId();
      const itemId = params.data.id;

      onUpdateDdtItems((prev) => {
        const copy = [...prev];
        const targetIdx = copy.findIndex((it) => it.id === itemId);
        if (targetIdx === -1) return prev;

        const target = copy[targetIdx];
        const updatedData: DdtItem = {
          ...target,
          row_kind: target.row_kind === "note" && colId !== "description" ? "item" : target.row_kind,
        };

        if (colId === "unit") {
          updatedData.unit = params.newValue ? String(params.newValue).trim().toUpperCase() : "";
        } else if (colId === "quantity") {
          updatedData.quantity = params.newValue ? String(params.newValue).trim() : "";
        } else if (colId === "description") {
          updatedData.description = params.newValue ? String(params.newValue).toUpperCase() : "";
        } else if (colId === "unit_price") {
          const parsedPrice = safeMoney(params.newValue);
          updatedData.unit_price = parsedPrice;
          updatedData.base_price = parsedPrice;
        } else if (colId === "discount_pct") {
          updatedData.discount_pct = params.newValue ? String(params.newValue).trim() : "";
          updatedData.base_discount_pct = updatedData.discount_pct;
        } else if (colId === "vat_rate") {
          if (params.newValue === "" || params.newValue === null || params.newValue === undefined) {
            updatedData.vat_rate = "";
          } else {
            const parsed = parseInt(String(params.newValue).replace("%", "").trim(), 10);
            updatedData.vat_rate = isNaN(parsed) ? "" : parsed;
          }
        } else if (colId === "purchase_price") {
          updatedData.purchase_price = safeMoney(params.newValue);
        } else if (colId === "ric_pct") {
          const clean = String(params.newValue ?? "")
            .replace("%", "")
            .replace("+", "")
            .replace(",", ".")
            .trim();
          const ricNum = parseFloat(clean);
          const pp = isPositivePrice(updatedData.purchase_price)
            ? safeMoney(updatedData.purchase_price).toNumber()
            : 0;

          if (!isNaN(ricNum) && pp > 0) {
            const newUpNum = pp * (1 + ricNum / 100);
            const newUnitPrice = money(newUpNum);
            updatedData.unit_price = newUnitPrice;
            updatedData.base_price = newUnitPrice;
          }
        }

        // Ricalcola importo netto e IVA riga
        const { netAmount, vatAmount } = calculateRowAmounts(
          updatedData.quantity || (isPositivePrice(updatedData.unit_price) ? "1" : ""),
          updatedData.unit_price,
          updatedData.discount_pct || "0",
          updatedData.vat_rate
        );
        updatedData.net_amount = netAmount;
        updatedData.vat_amount = vatAmount;

        copy[targetIdx] = updatedData;
        return copy;
      });

      if (currentDdtGridRef.current?.api) {
        currentDdtGridRef.current.api.refreshCells({ rowNodes: [params.node], force: true });
      }
    },
    [onUpdateDdtItems]
  );

  // Definizione colonne AG Grid per "Articoli nel DDT" (Finestra 4)
  const currentDdtColumnDefs: any[] = useMemo(
    () => [
      {
        headerName: "#",
        valueGetter: (p: any) => (p.node?.rowIndex ?? 0) + 1,
        width: 44,
        minWidth: 40,
        maxWidth: 50,
        pinned: "left" as const,
        editable: false,
        sortable: false,
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "monospace",
          fontSize: "11px",
          fontWeight: 700,
          color: "#c084fc",
        },
      },
      {
        headerName: "U.M.",
        field: "unit",
        width: 56,
        minWidth: 48,
        maxWidth: 65,
        editable: true,
        cellEditor: DDTTextEditor,
        valueParser: (p: any) => (p.newValue ? String(p.newValue).trim().toUpperCase() : ""),
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          return p.value ? String(p.value).trim().toUpperCase() : "NR";
        },
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: "11px",
          color: "#cbd5e1",
          textTransform: "uppercase" as const,
        },
      },
      {
        headerName: "Q.TÀ",
        field: "quantity",
        width: 68,
        minWidth: 58,
        maxWidth: 78,
        editable: true,
        cellEditor: DDTTextEditor,
        valueParser: (p: any) => (p.newValue === "" ? "" : p.newValue),
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          return p.value || "1";
        },
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#ffffff",
        },
      },
      {
        headerName: "DESCRIZIONE ARTICOLO *",
        field: "description",
        minWidth: 350,
        flex: 4,
        editable: true,
        cellEditor: DDTTextEditor,
        valueParser: (p: any) => (p.newValue ? String(p.newValue).toUpperCase() : ""),
        valueFormatter: (p: any) => (p.value ? String(p.value).toUpperCase() : ""),
        cellStyle: {
          display: "flex",
          alignItems: "center",
          fontSize: "12.5px",
          fontWeight: 600,
          color: "#f8fafc",
          textTransform: "uppercase" as const,
        },
      },
      {
        headerName: "PREZZO €",
        field: "unit_price",
        minWidth: 120,
        flex: 1.2,
        editable: true,
        cellEditor: DDTTextEditor,
        valueParser: (p: any) => safeMoney(p.newValue),
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          fontFamily: "monospace",
          fontSize: "12px",
          fontWeight: 700,
          color: "#ffffff",
        },
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          if (!p.value) return "";
          const m = safeMoney(p.value);
          return m.isZero() ? "" : m.formatIT(false);
        },
      },
      {
        headerName: "SC.%",
        field: "discount_pct",
        minWidth: 80,
        flex: 0.8,
        editable: true,
        cellEditor: DDTTextEditor,
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#cbd5e1",
        },
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          if (!p.value || p.value === "0") return "—";
          return `${p.value}%`;
        },
      },
      {
        headerName: "IMPORTO €",
        field: "net_amount",
        minWidth: 130,
        flex: 1.3,
        editable: false,
        sortable: false,
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          fontWeight: 800,
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#d8b4fe",
        },
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          if (!p.value) return "";
          const m = safeMoney(p.value);
          return m.isZero() ? "" : `€ ${m.formatIT(false)}`;
        },
      },
      {
        headerName: "IVA",
        field: "vat_rate",
        minWidth: 70,
        flex: 0.7,
        editable: true,
        cellEditor: DDTTextEditor,
        valueParser: (p: any) => {
          if (p.newValue === "" || p.newValue === null || p.newValue === undefined) return "";
          const parsed = parseInt(String(p.newValue).replace("%", "").trim(), 10);
          return isNaN(parsed) ? "" : parsed;
        },
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#94a3b8",
        },
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          if (p.value !== "" && p.value !== null && p.value !== undefined) {
            return `${p.value}%`;
          }
          return "22%";
        },
      },
      {
        headerName: "ACQ. €",
        field: "purchase_price",
        minWidth: 120,
        flex: 1.2,
        editable: true,
        cellEditor: DDTTextEditor,
        valueParser: (p: any) => safeMoney(p.newValue),
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          fontFamily: "monospace",
          fontSize: "12px",
          fontWeight: 700,
          color: "#34d399",
        },
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          if (!p.value) return "—";
          const m = safeMoney(p.value);
          return m.isZero() ? "—" : m.formatIT(false);
        },
      },
      {
        headerName: "RIC. %",
        field: "ric_pct",
        minWidth: 110,
        flex: 1.1,
        editable: true,
        cellEditor: DDTTextEditor,
        valueGetter: (p: any) => {
          const up = isPositivePrice(p.data?.unit_price) ? safeMoney(p.data?.unit_price).toNumber() : 0;
          const pp = isPositivePrice(p.data?.purchase_price) ? safeMoney(p.data?.purchase_price).toNumber() : 0;
          if (pp > 0 && up > 0) {
            return ((up - pp) / pp) * 100;
          }
          return null;
        },
        valueSetter: (params: any) => {
          const clean = String(params.newValue ?? "")
            .replace("%", "")
            .replace("+", "")
            .replace(",", ".")
            .trim();
          const ricNum = parseFloat(clean);
          const pp = isPositivePrice(params.data?.purchase_price)
            ? safeMoney(params.data?.purchase_price).toNumber()
            : 0;

          if (!isNaN(ricNum) && pp > 0) {
            const newUpNum = pp * (1 + ricNum / 100);
            params.data.unit_price = money(newUpNum);
            params.data.base_price = money(newUpNum);
          }
          return true;
        },
        valueParser: (p: any) => {
          if (p.newValue === "" || p.newValue === null || p.newValue === undefined) return null;
          const clean = String(p.newValue).replace("%", "").replace("+", "").replace(",", ".").trim();
          const parsed = parseFloat(clean);
          return isNaN(parsed) ? null : parsed;
        },
        valueFormatter: (p: any) => {
          if (isTextOnlyRow(p.data)) return "";
          if (p.value === null || p.value === undefined || p.value === "") return "—";
          const num = typeof p.value === "number" ? p.value : parseFloat(p.value);
          if (isNaN(num)) return "—";
          return `${num >= 0 ? "+" : ""}${num.toFixed(1)}%`;
        },
        cellStyle: (p: any) => {
          const num = typeof p.value === "number" ? p.value : parseFloat(p.value);
          const isPos = !isNaN(num) && num >= 0;
          return {
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            fontFamily: "monospace",
            fontSize: "12px",
            fontWeight: 800,
            color: isPos ? "#34d399" : "#fbbf24",
          };
        },
      },
    ],
    []
  );

  const formatEuro = (val: number | null | undefined, digits: number = 3) => {
    if (val == null || isNaN(val)) return "—";
    return `€ ${val.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: digits,
    })}`;
  };

  const formatPercent = (val: number | null | undefined) => {
    if (val == null) return "—";
    return `${Math.round(val * 100)}%`;
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 select-none animate-in fade-in duration-100">
        <div className="w-full h-[95vh] max-w-[99vw] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* 1. Header Globale Barra Alex */}
          <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--background)] flex items-center justify-between gap-3 shrink-0">
            {/* Titolo e Icona */}
            <div className="flex items-center space-x-2 shrink-0">
              <div className="p-1 rounded bg-purple-600/20 text-purple-400 border border-purple-500/30">
                <LayoutGrid className="w-4 h-4" />
              </div>
              <span className="font-black text-xs tracking-wider text-[var(--foreground)] uppercase">
                RICERCA MULTI-LISTINO
              </span>
              {currentClientName && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  {currentClientName.replace(/^LIST_/, "")}
                </span>
              )}
            </div>

            {/* Ricerca Unificata al centro */}
            <div className="relative flex-1 max-w-xl">
              <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-2" />
              <input
                ref={searchInputRef}
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Cerca in tutte le finestre attive..."
                className="w-full pl-9 pr-8 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-bold tracking-wide"
              />
              {globalSearch && (
                <button
                  type="button"
                  onClick={() => setGlobalSearch("")}
                  className="absolute right-2.5 top-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Pulsanti Attivazione / Disattivazione Finestre + Switch Layout */}
            <div className="flex items-center space-x-1.5 shrink-0">
              {/* Pillola List. Gen */}
              <button
                type="button"
                onClick={() => setShowGen(!showGen)}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                  showGen
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] opacity-60"
                }`}
              >
                <span>List. Gen</span>
              </button>

              {/* Pillola List. Clienti */}
              <button
                type="button"
                onClick={() => setShowCli(!showCli)}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                  showCli
                    ? "bg-amber-500 text-black shadow-sm"
                    : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] opacity-60"
                }`}
              >
                <span>List. Clienti</span>
              </button>

              {/* Pillola Storico DDT */}
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                  showHistory
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] opacity-60"
                }`}
              >
                <span>Storico DDT</span>
              </button>

              {/* Pillola Articoli nel DDT */}
              <button
                type="button"
                onClick={() => setShowCurrentDdt(!showCurrentDdt)}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                  showCurrentDdt
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] opacity-60"
                }`}
              >
                <span>Articoli DDT ({nonBlankCurrentItems.length})</span>
              </button>

              {/* Tasto Cambio Layout: Orizzontale (Fasce) vs Verticale (Colonne) */}
              <div className="flex items-center bg-[var(--card)] border border-[var(--border)] rounded-md p-0.5 ml-1">
                <button
                  type="button"
                  onClick={() => setLayoutMode("horizontal")}
                  className={`p-1 rounded transition-colors ${
                    layoutMode === "horizontal"
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                  title="Disposizione Orizzontale (4 fasce sovrapposte come noManV1)"
                >
                  <Rows className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("vertical")}
                  className={`p-1 rounded transition-colors ${
                    layoutMode === "vertical"
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                  title="Disposizione Verticale (4 colonne affiancate)"
                >
                  <Columns className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Refresh */}
              <button
                type="button"
                onClick={loadData}
                disabled={isLoading}
                className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] transition-colors"
                title="Ricarica dati"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </button>

              {/* Chiusura */}
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Chiudi modale (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 
            2. Area delle 4 Finestre
            Disposta in fasce orizzontali (se layoutMode === 'horizontal') o in colonne (se 'vertical')
          */}
          <div
            className={`flex-1 overflow-hidden bg-[var(--background)] ${
              layoutMode === "horizontal"
                ? "flex flex-col divide-y divide-[var(--border)]"
                : "flex divide-x divide-[var(--border)]"
            }`}
          >
            {/* FINESTRA 1: Listino Generale (Blu) */}
            {showGen && (
              <div
                className={`flex flex-col overflow-hidden bg-[var(--card)] ${
                  layoutMode === "horizontal" ? "flex-1 min-h-[140px]" : "flex-1 min-w-[280px]"
                }`}
              >
                <div className="px-3 py-1 bg-blue-950/40 border-b border-blue-500/30 flex items-center justify-between text-xs text-blue-300 shrink-0">
                  <span className="font-bold flex items-center space-x-1">
                    <span>Listino Generale</span>
                    <span className="text-[10px] opacity-80">({filteredGeneral.length} voci)</span>
                  </span>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse text-xs whitespace-nowrap">
                    <thead className="bg-[var(--background)] sticky top-0 text-[11.5px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)] font-bold">
                      <tr>
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
                      {filteredGeneral.slice(0, 200).map((item) => (
                        <tr
                          key={item.id}
                          onDoubleClick={() => {
                            handleOpenInsert({
                              code: item.codice_articolo || undefined,
                              description: item.descrizione,
                              unit: item.um || "NR.",
                              unit_price: item.prezzo_fattura || item.prezzo_pubblico || 0,
                              purchase_price: item.prezzo_acquisto || 0,
                              vat_rate: Math.round((item.perc_iva || 0.22) * 100),
                            });
                          }}
                          className="hover:bg-blue-600/15 cursor-pointer transition-colors group"
                          title="Doppio clic per inserire nel DDT"
                        >
                          <td className="px-2.5 py-1.5 text-[var(--muted-foreground)] truncate max-w-[75px]">{item.fornitore || "—"}</td>
                          <td className="px-2.5 py-1.5 font-bold text-blue-400 truncate max-w-[90px]">{item.codice_articolo || "—"}</td>
                          <td className="px-2 py-1.5 text-center text-[var(--muted-foreground)] text-[11px]">{item.data_ref || "—"}</td>
                          <td className="px-3 py-1.5 font-sans text-[var(--foreground)] truncate max-w-[320px] text-[12.5px] font-medium" title={item.descrizione}>{item.descrizione}</td>
                          <td className="px-2 py-1.5 text-center text-[var(--muted-foreground)]">{item.um || "NR"}</td>
                          <td className="px-2.5 py-1.5 text-right text-[var(--muted-foreground)]">{formatPercent(item.perc_pub)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatEuro(item.prezzo_pubblico, 2)}</td>
                          <td className="px-2.5 py-1.5 text-right text-[var(--muted-foreground)]">{formatPercent(item.perc_prof)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatEuro(item.prezzo_profess, 2)}</td>
                          <td className="px-2.5 py-1.5 text-right text-[var(--muted-foreground)]">{formatPercent(item.perc_fatt)}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-amber-300 bg-blue-500/10">{formatEuro(item.prezzo_fattura, 2)}</td>
                          <td className="px-3 py-1.5 text-right text-[var(--muted-foreground)]">{formatEuro(item.prezzo_acquisto, 2)}</td>
                          <td className="px-2 py-1.5 text-center text-[var(--muted-foreground)]">{formatPercent(item.perc_iva)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* FINESTRA 2: Listino Clienti (Giallo/Ambra) */}
            {showCli && (
              <div
                className={`flex flex-col overflow-hidden bg-[var(--card)] ${
                  layoutMode === "horizontal" ? "flex-1 min-h-[140px]" : "flex-1 min-w-[280px]"
                }`}
              >
                <div className="px-3 py-1.5 bg-amber-950/40 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-300 shrink-0 gap-2">
                  <span className="font-bold whitespace-nowrap flex items-center space-x-1.5">
                    <span className="text-sm">Listino Clienti</span>
                    <span className="text-[11px] opacity-80 font-normal">({filteredClients.length} voci)</span>
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs text-[var(--muted-foreground)] font-semibold">Filtro:</span>
                    <div className="relative">
                      <input
                        type="text"
                        value={clientFilter}
                        onChange={(e) => setClientFilter(e.target.value)}
                        placeholder={currentClientName ? `Filtro: ${currentClientName}` : "Cerca cliente (multi-parola)..."}
                        className="pl-2.5 pr-6 py-0.5 text-xs bg-[var(--background)] border border-amber-500/40 rounded text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none w-52 font-medium"
                      />
                      {clientFilter && (
                        <button
                          type="button"
                          onClick={() => setClientFilter("")}
                          className="absolute right-1.5 top-1 text-[var(--muted-foreground)] hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse text-xs whitespace-nowrap">
                    <thead className="bg-[var(--background)] sticky top-0 text-[11.5px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)] font-bold">
                      <tr>
                        <th className="px-3 py-1.5 text-left w-40">Cliente</th>
                        <th className="px-3 py-1.5 text-left">Descrizione</th>
                        <th className="px-3 py-1.5 text-right w-24">Fattura</th>
                        <th className="px-3 py-1.5 text-right w-24">Acquisto</th>
                        <th className="px-2.5 py-1.5 text-right w-20">Ricarico</th>
                        <th className="px-3 py-1.5 text-left w-28">Note</th>
                        <th className="px-3 py-1.5 text-left w-24">Note1</th>
                        <th className="px-3 py-1.5 text-left w-24">Note2</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]/30 font-mono text-xs">
                      {filteredClients.slice(0, 200).map((item) => (
                        <tr
                          key={item.id}
                          onDoubleClick={() => {
                            handleOpenInsert({
                              code: item.codice_articolo || undefined,
                              description: item.descrizione,
                              unit: "NR.",
                              unit_price: item.prezzo_fattura || 0,
                              purchase_price: item.prezzo_acquisto || 0,
                              vat_rate: 22,
                            });
                          }}
                          className="hover:bg-amber-500/15 cursor-pointer transition-colors group"
                          title="Doppio clic per inserire nel DDT"
                        >
                          <td className="px-3 py-1.5 font-bold text-amber-400 truncate max-w-[140px]" title={item.cliente}>{item.cliente}</td>
                          <td className="px-3 py-1.5 font-sans text-[var(--foreground)] truncate max-w-[340px] text-[12.5px] font-medium" title={item.descrizione}>{item.descrizione}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-[var(--foreground)]">{formatEuro(item.prezzo_fattura, 2)}</td>
                          <td className="px-3 py-1.5 text-right text-[var(--muted-foreground)]">{formatEuro(item.prezzo_acquisto, 2)}</td>
                          <td className="px-2.5 py-1.5 text-right text-[var(--muted-foreground)]">{item.ricarico ? `${item.ricarico.toFixed(1)}%` : "—"}</td>
                          <td className="px-3 py-1.5 font-sans text-xs text-[var(--muted-foreground)] truncate max-w-[120px]">{item.note || ""}</td>
                          <td className="px-3 py-1.5 font-sans text-xs text-[var(--muted-foreground)] truncate max-w-[100px]">{item.note1 || ""}</td>
                          <td className="px-3 py-1.5 font-sans text-xs text-[var(--muted-foreground)] truncate max-w-[100px]">{item.note2 || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* FINESTRA 3: Storico Articoli Già Dati (Smeraldo) */}
            {showHistory && (
              <div
                className={`flex flex-col overflow-hidden bg-[var(--card)] ${
                  layoutMode === "horizontal" ? "flex-1 min-h-[140px]" : "flex-1 min-w-[280px]"
                }`}
              >
                <div className="px-3 py-1.5 bg-emerald-950/40 border-b border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300 shrink-0">
                  <span className="font-bold flex items-center space-x-1.5">
                    <span className="text-sm">Storico Articoli Già Dati</span>
                    <span className="text-[11px] opacity-80 font-normal">({filteredHistory.length} vendite)</span>
                  </span>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse text-xs whitespace-nowrap">
                    <thead className="bg-[var(--background)] sticky top-0 text-[11.5px] uppercase text-[var(--muted-foreground)] border-b border-[var(--border)] font-bold">
                      <tr>
                        <th className="px-2.5 py-1.5 text-left w-24">Data</th>
                        <th className="px-2.5 py-1.5 text-center w-16">Nr. DDT</th>
                        <th className="px-3 py-1.5 text-left w-36">Cliente</th>
                        <th className="px-3 py-1.5 text-left">Descrizione</th>
                        <th className="px-3 py-1.5 text-right w-28">Prezzo Vendita</th>
                        <th className="px-3 py-1.5 text-right w-24">Prezzo Acq.</th>
                        <th className="px-3 py-1.5 text-right w-24">% Ricarico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]/30 font-mono text-xs">
                      {filteredHistory.slice(0, 200).map((row) => {
                        const priceVal = row.unitPriceSubunits / 100000;
                        const acqVal = (row.purchasePriceSubunits || 0) / 100000;
                        const ricaricoPct = acqVal > 0 ? ((priceVal - acqVal) / acqVal) * 100 : null;

                        return (
                          <tr
                            key={row.id}
                            onDoubleClick={() => {
                              handleOpenInsert({
                                description: row.description,
                                unit: row.unit || "NR.",
                                quantity: "1",
                                unit_price: priceVal,
                                purchase_price: acqVal,
                                vat_rate: row.vatRate || 22,
                              });
                            }}
                            className="hover:bg-emerald-600/15 cursor-pointer transition-colors group"
                            title="Doppio clic per inserire nel DDT"
                          >
                            <td className="px-2.5 py-1.5 text-[var(--muted-foreground)] text-xs">{formatDdtViewDate(row.date)}</td>
                            <td className="px-2.5 py-1.5 text-center font-bold text-emerald-400 text-xs">{row.series ? `${row.series}/` : ""}{row.docNumber}</td>
                            <td className="px-3 py-1.5 font-bold text-[var(--foreground)] truncate max-w-[130px] text-xs" title={row.client}>{row.client}</td>
                            <td className="px-3 py-1.5 font-sans text-[var(--foreground)] truncate max-w-[340px] text-[12.5px] font-medium" title={row.description}>{row.description}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-emerald-400 text-xs">{formatEuro(priceVal, 4)}</td>
                            <td className="px-3 py-1.5 text-right text-[var(--muted-foreground)] text-xs">{formatEuro(acqVal, 4)}</td>
                            <td className={`px-3 py-1.5 text-right font-bold text-xs ${ricaricoPct !== null && ricaricoPct >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                              {ricaricoPct !== null ? `${ricaricoPct >= 0 ? "+" : ""}${Math.round(ricaricoPct)}%` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* FINESTRA 4: Articoli nel DDT attuale (Viola - AG Grid come la tabella DDT) */}
            {showCurrentDdt && (
              <div
                className={`flex flex-col overflow-hidden bg-[var(--card)] ${
                  layoutMode === "horizontal" ? "flex-1 min-h-[160px]" : "flex-1 min-w-[280px]"
                }`}
              >
                <div className="px-3 py-1.5 bg-purple-950/40 border-b border-purple-500/30 flex items-center justify-between text-xs text-purple-300 shrink-0">
                  <span className="font-bold flex items-center space-x-1.5">
                    <span className="text-sm">Articoli nel DDT</span>
                    <span className="text-[11px] opacity-80 font-normal">({nonBlankCurrentItems.length} righe)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilterCurrentWithSearch(!filterCurrentWithSearch)}
                    className={`px-2.5 py-1 rounded text-xs font-bold border transition-colors ${
                      filterCurrentWithSearch
                        ? "bg-purple-600 text-white border-purple-400"
                        : "bg-purple-900/30 text-purple-300 border-purple-500/30 hover:bg-purple-800/40"
                    }`}
                  >
                    Filtra con ricerca: {filterCurrentWithSearch ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="alex-ddt-grid ag-theme-alpine flex-1 w-full min-h-[120px] overflow-hidden relative">
                  <style>{`
                    .alex-ddt-grid.ag-theme-alpine {
                      --ag-background-color: #0b0f19 !important;
                      --ag-foreground-color: #f8fafc !important;
                      --ag-header-background-color: #1e1b4b !important;
                      --ag-header-foreground-color: #e9d5ff !important;
                      --ag-row-hover-color: rgba(168, 85, 247, 0.15) !important;
                      --ag-selected-row-background-color: #121024 !important;
                      --ag-border-color: rgba(168, 85, 247, 0.25) !important;
                      --ag-odd-row-background-color: #080c14 !important;
                      font-size: 12px;
                    }
                    .alex-ddt-grid .ag-root-wrapper,
                    .alex-ddt-grid .ag-root,
                    .alex-ddt-grid .ag-body-viewport {
                      background-color: #0b0f19 !important;
                      border-color: rgba(168, 85, 247, 0.3) !important;
                    }
                    .alex-ddt-grid .ag-header {
                      background-color: #1e1b4b !important;
                      border-bottom: 1px solid rgba(168, 85, 247, 0.4) !important;
                    }
                    .alex-ddt-grid .ag-header-cell {
                      background-color: #1e1b4b !important;
                    }
                    .alex-ddt-grid .ag-header-cell-label {
                      justify-content: center;
                      font-weight: 700;
                      font-size: 11px;
                      color: #e9d5ff !important;
                    }
                    .alex-ddt-grid .ag-row {
                      background-color: #0b0f19 !important;
                      color: #f8fafc !important;
                      border-bottom: 1px solid rgba(148, 163, 184, 0.12) !important;
                    }
                    .alex-ddt-grid .ag-row-even,
                    .alex-ddt-grid .ag-row-even .ag-cell {
                      background-color: #0b0f19 !important;
                    }
                    .alex-ddt-grid .ag-row-odd,
                    .alex-ddt-grid .ag-row-odd .ag-cell {
                      background-color: #080c14 !important;
                    }
                    .alex-ddt-grid .ag-row.ag-row-hover,
                    .alex-ddt-grid .ag-row-hover,
                    .alex-ddt-grid .ag-row-hover .ag-cell {
                      background-color: rgba(168, 85, 247, 0.18) !important;
                    }
                    /* Selezione e Focus cella/riga: mantiene colore scuro nitido, NIENTE BIANCO */
                    .alex-ddt-grid .ag-row.ag-row-focus,
                    .alex-ddt-grid .ag-row.ag-row-selected,
                    .alex-ddt-grid .ag-row:focus {
                      background-color: #121024 !important;
                    }
                    .alex-ddt-grid .ag-row.ag-row-focus .ag-cell,
                    .alex-ddt-grid .ag-row.ag-row-selected .ag-cell,
                    .alex-ddt-grid .ag-cell-range-selected,
                    .alex-ddt-grid .ag-cell-range-single-cell {
                      background-color: #121024 !important;
                      color: #f8fafc !important;
                    }
                    .alex-ddt-grid .ag-cell {
                      color: #f8fafc !important;
                      border-right: 1px solid rgba(148, 163, 184, 0.1) !important;
                      display: flex !important;
                      align-items: center !important;
                    }
                    .alex-ddt-grid .ag-cell.ag-cell-focus {
                      outline: 2px solid #c084fc !important;
                      outline-offset: -2px !important;
                      background-color: #1c1836 !important;
                      color: #ffffff !important;
                    }
                    /* Cella in fase di digitazione / editor */
                    .alex-ddt-grid .ag-cell-inline-editing,
                    .alex-ddt-grid .ag-cell-inline-editing div,
                    .alex-ddt-grid .ag-cell-inline-editing input {
                      background-color: #1c1836 !important;
                      color: #ffffff !important;
                      outline: 2px solid #c084fc !important;
                      font-weight: 700 !important;
                    }
                  `}</style>

                  <AgGridReact<DdtItem>
                    ref={currentDdtGridRef}
                    rowData={nonBlankCurrentItems}
                    getRowId={(params) => params.data.id || String(params.data.row_index)}
                    suppressScrollOnNewData={true}
                    animateRows={true}
                    columnDefs={currentDdtColumnDefs}
                    rowHeight={30}
                    headerHeight={32}
                    onGridReady={(params) => {
                      params.api.sizeColumnsToFit();
                    }}
                    onGridSizeChanged={(params) => {
                      params.api.sizeColumnsToFit();
                    }}
                    onCellKeyDown={handleCurrentDdtCellKeyDown}
                    tabToNextCell={tabToNextCell}
                    navigateToNextCell={navigateToNextCell}
                    onCellEditingStarted={() => {
                      window.__isDDTCellEditing = true;
                    }}
                    onCellEditingStopped={() => {
                      setTimeout(() => {
                        window.__isDDTCellEditing = false;
                      }, 200);
                    }}
                    stopEditingWhenCellsLoseFocus={true}
                    enterNavigatesVertically={true}
                    enterNavigatesVerticallyAfterEdit={true}
                    onCellValueChanged={handleCurrentDdtCellValueChanged}
                    suppressMovableColumns={true}
                    overlayNoRowsTemplate='<span class="text-xs text-purple-300/70">Nessun articolo inserito finora nel DDT.</span>'
                    defaultColDef={{
                      resizable: true,
                      sortable: false,
                      filter: false,
                      headerClass: "select-none !cursor-default",
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3. Footer Modale Alex */}
          <div className="px-4 py-1.5 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-xs text-[var(--muted-foreground)] shrink-0">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-[var(--foreground)]">
                Doppio clic su qualsiasi articolo di qualsiasi finestra per inserirlo all'istante nel DDT!
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--background)] text-[var(--foreground)] font-bold text-xs transition-colors"
            >
              Chiudi (Esc)
            </button>
          </div>
        </div>
      </div>

      {/* Popup Quantità anche per Alex */}
      {pendingInsert && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-100">
          <div className="w-full max-w-lg bg-[#0f172a] border border-purple-500/40 rounded-xl shadow-2xl p-5 flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-purple-500/30 pb-2.5">
              <div className="flex items-center space-x-2 text-purple-400">
                <CheckCircle2 className="w-5 h-5 text-purple-400" />
                <span className="font-black text-sm tracking-wide text-white uppercase">
                  INSERIMENTO ARTICOLO NEL DDT
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPendingInsert(null)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">Articolo Selezionato:</label>
              <div className="mt-1 p-3 rounded-lg bg-[#1e293b] border border-purple-500/30">
                <p className="font-bold text-sm text-amber-300 leading-snug">
                  {pendingInsert.description}
                </p>
                {pendingInsert.code && (
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    Codice: {pendingInsert.code}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <label className="text-sm font-bold text-white">Specifica Quantità:</label>
              <input
                ref={qtyInputRef}
                type="number"
                min="0.001"
                step="any"
                value={insertQuantity}
                onChange={(e) => setInsertQuantity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleConfirmInsert();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setPendingInsert(null);
                  }
                }}
                className="w-28 px-3 py-1.5 text-center text-sm font-black bg-[#1e293b] border border-purple-500 rounded-lg text-white outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-slate-700/50">
              <button
                type="button"
                onClick={() => setPendingInsert(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmInsert}
                className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-black text-xs shadow-lg shadow-purple-500/20 transition-all flex items-center space-x-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Conferma e Inserisci (Invio)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { ColDef } from "ag-grid-community";
import { orderRepository } from "@/features/orders/services/orderRepository";
import { Supplier } from "@/features/orders/types/order";
import { getFornitoreColor } from "@/features/orders/utils/constants";
import {
  History,
  ShoppingCart,
  Search,
  RotateCcw,
  Plus,
  Check,
  Building2,
  Calendar,
} from "lucide-react";

interface SupplierHistoryTabProps {
  suppliers: Supplier[];
  currentUser?: string;
  onNavigateToActive?: () => void;
}

interface SupplierHistoryRow {
  supplier_name: string;
  article_code: string;
  description: string;
  last_price: string;
  last_order_date: string;
  order_count: number;
  total_quantity: number;
}

interface SupplierSummary {
  name: string;
  items: SupplierHistoryRow[];
  totalArticles: number;
  lastOrderDate: string;
  matchCount?: number;
}

export const SupplierHistoryTab: React.FC<SupplierHistoryTabProps> = ({
  currentUser = "Operatore",
  onNavigateToActive,
}) => {
  const gridRef = useRef<AgGridReact<SupplierHistoryRow>>(null);

  const [historyItems, setHistoryItems] = useState<SupplierHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSupplierName, setSelectedSupplierName] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [selectedRows, setSelectedRows] = useState<SupplierHistoryRow[]>([]);
  const [reorderedMap, setReorderedMap] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Caricamento storico completo
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await orderRepository.getSupplierHistory();
      setHistoryItems(data);
      if (data.length > 0 && !selectedSupplierName) {
        setSelectedSupplierName(data[0].supplier_name);
      }
    } catch (err) {
      console.error("[SupplierHistoryTab] Errore:", err);
      showToast("Errore caricamento storico");
    } finally {
      setLoading(false);
    }
  }, [selectedSupplierName]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Raggruppa tutti gli articoli per fornitore
  const supplierGroups = useMemo<SupplierSummary[]>(() => {
    const map = new Map<string, SupplierHistoryRow[]>();
    for (const item of historyItems) {
      const sup = item.supplier_name?.trim() || "Senza Fornitore";
      if (!map.has(sup)) {
        map.set(sup, []);
      }
      map.get(sup)!.push(item);
    }

    const groups: SupplierSummary[] = [];
    for (const [name, items] of map.entries()) {
      let lastDate = "";
      for (const it of items) {
        if (it.last_order_date && (!lastDate || it.last_order_date > lastDate)) {
          lastDate = it.last_order_date;
        }
      }
      groups.push({
        name,
        items,
        totalArticles: items.length,
        lastOrderDate: lastDate,
      });
    }

    // Ordina i fornitori per nome
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }, [historyItems]);

  // Ricerca multi-parola: cerca all'interno di ogni fornitore e dei suoi articoli
  const searchTokens = useMemo(() => {
    return searchText.toLowerCase().trim().split(/\s+/).filter(Boolean);
  }, [searchText]);

  const filteredSupplierGroups = useMemo(() => {
    if (searchTokens.length === 0) return supplierGroups;

    return supplierGroups
      .map((group) => {
        // Filtra gli articoli del fornitore che contengono i token cercati
        const matchingItems = group.items.filter((item) => {
          const combined = `${group.name} ${item.article_code} ${item.description}`.toLowerCase();
          return searchTokens.every((tok) => combined.includes(tok));
        });

        // Match anche se il nome del fornitore contiene tutti i token
        const supplierNameMatches = searchTokens.every((tok) =>
          group.name.toLowerCase().includes(tok)
        );

        const itemsToShow = supplierNameMatches ? group.items : matchingItems;

        return {
          ...group,
          items: itemsToShow,
          matchCount: matchingItems.length,
          isMatched: supplierNameMatches || matchingItems.length > 0,
        };
      })
      .filter((g) => g.isMatched);
  }, [supplierGroups, searchTokens]);

  // Seleziona automaticamente il primo fornitore disponibile se quello attuale non esiste nei filtrati
  useEffect(() => {
    if (filteredSupplierGroups.length > 0) {
      const exists = filteredSupplierGroups.some((g) => g.name === selectedSupplierName);
      if (!exists) {
        setSelectedSupplierName(filteredSupplierGroups[0].name);
      }
    } else {
      setSelectedSupplierName(null);
    }
  }, [filteredSupplierGroups, selectedSupplierName]);

  // Gruppo fornitore attualmente selezionato
  const currentGroup = useMemo(() => {
    return filteredSupplierGroups.find((g) => g.name === selectedSupplierName) || null;
  }, [filteredSupplierGroups, selectedSupplierName]);

  // Riordina un singolo articolo con 1 click
  const handleReorderSingle = async (item: SupplierHistoryRow) => {
    const key = `${item.supplier_name}_${item.article_code}`;
    try {
      await orderRepository.reorderArticles(
        [
          {
            supplier_name: item.supplier_name,
            article_code: item.article_code,
            description: item.description,
            price: item.last_price,
            quantity: "1",
            notes: "Riordinato da storico fornitore",
          },
        ],
        currentUser
      );

      setReorderedMap((prev) => ({ ...prev, [key]: true }));
      showToast(`Articolo "${item.article_code}" inserito negli Ordini Attivi!`);

      setTimeout(() => {
        setReorderedMap((prev) => ({ ...prev, [key]: false }));
      }, 3000);
    } catch {
      showToast("Errore durante il riordino");
    }
  };

  // Riordina gli articoli selezionati con le checkbox nella tabella AG Grid
  const handleReorderSelected = async () => {
    if (selectedRows.length === 0) return;
    try {
      await orderRepository.reorderArticles(
        selectedRows.map((it) => ({
          supplier_name: it.supplier_name,
          article_code: it.article_code,
          description: it.description,
          price: it.last_price,
          quantity: "1",
          notes: "Riordinato da storico fornitore",
        })),
        currentUser
      );

      gridRef.current?.api?.deselectAll();
      setSelectedRows([]);
      showToast(`${selectedRows.length} articoli inseriti con successo negli Ordini Attivi!`);
    } catch {
      showToast("Errore durante il riordino multiplo");
    }
  };

  // Definizione Colonne AG Grid (Tabella Articoli Densa e Compatta)
  const columnDefs: ColDef<SupplierHistoryRow>[] = useMemo(
    () => [
      {
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
        cellClass: "centered-cell",
      },
      {
        field: "article_code",
        headerName: "Codice Articolo",
        width: 155,
        cellRenderer: (p: any) => (
          <span className="font-mono font-bold text-xs text-[var(--foreground)]">
            {p.value}
          </span>
        ),
      },
      {
        field: "description",
        headerName: "Descrizione Articolo",
        flex: 2,
        minWidth: 240,
      },
      {
        field: "last_price",
        headerName: "Ultimo Prezzo",
        width: 125,
        cellRenderer: (p: any) => (
          <span className="font-mono font-bold text-emerald-400">
            {p.value ? `€ ${p.value}` : "-"}
          </span>
        ),
      },
      {
        field: "last_order_date",
        headerName: "Ultimo Ordine",
        width: 125,
        cellRenderer: (p: any) => (
          <span className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1">
            <Calendar className="w-3 h-3 opacity-60" />
            {p.value || "-"}
          </span>
        ),
      },
      {
        field: "order_count",
        headerName: "Ordinato",
        width: 100,
        cellClass: "centered-cell",
        cellRenderer: (p: any) => (
          <span className="px-2 py-0.5 rounded-full bg-[var(--background)] border border-[var(--border)] font-bold text-[11px]">
            {p.value}×
          </span>
        ),
      },
      {
        field: "total_quantity",
        headerName: "Qtà Totale",
        width: 100,
        cellClass: "centered-cell",
      },
      {
        headerName: "Azione",
        width: 110,
        pinned: "right",
        sortable: false,
        filter: false,
        cellClass: "centered-cell",
        cellRenderer: (p: any) => {
          const item = p.data as SupplierHistoryRow;
          const key = `${item.supplier_name}_${item.article_code}`;
          const isReordered = Boolean(reorderedMap[key]);

          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleReorderSingle(item);
              }}
              disabled={isReordered}
              className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs ${
                isReordered
                  ? "bg-emerald-600 text-white cursor-default"
                  : "bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30"
              }`}
              title="Aggiungi questo articolo agli Ordini Attivi"
            >
              {isReordered ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>Fatto!</span>
                </>
              ) : (
                <>
                  <Plus className="w-3 h-3" />
                  <span>Riordina</span>
                </>
              )}
            </button>
          );
        },
      },
    ],
    [reorderedMap]
  );

  const defaultColDef: ColDef = useMemo(
    () => ({
      resizable: true,
      sortable: true,
      filter: true,
    }),
    []
  );

  return (
    <div className="flex flex-col h-full w-full text-[var(--foreground)] bg-[var(--background)] overflow-hidden">
      {/* 1. Toolbar Globale con Ricerca Multi-Parola */}
      <div className="px-4 py-2 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
              Storico Ordini per Fornitore
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[var(--muted-foreground)] pointer-events-none" />
            <input
              type="text"
              placeholder="Cerca fornitore o articolo (es: bull, knipex 160)..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-80 pl-8 pr-3 py-1 text-xs bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--primary)] font-medium"
            />
          </div>

          {searchText && (
            <button
              onClick={() => setSearchText("")}
              className="p-1 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-white"
              title="Azzera ricerca"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {selectedRows.length > 0 && (
            <button
              onClick={handleReorderSelected}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-[var(--primary)] text-white hover:opacity-90 cursor-pointer shadow-xs transition-all"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Riordina Selezionati ({selectedRows.length})</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs">
          {toastMessage && (
            <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold animate-pulse">
              {toastMessage}
            </span>
          )}

          {onNavigateToActive && (
            <button
              onClick={onNavigateToActive}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--background)] hover:bg-[var(--border)] text-[var(--primary)] border border-[var(--border)] font-semibold text-xs cursor-pointer transition-colors"
            >
              <span>Vai agli Attivi →</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Layout Diviso: Tabella Fornitori a Sinistra + Tabella Articoli AG Grid a Destra */}
      <div className="flex-1 flex w-full h-full overflow-hidden">
        {/* COLONNA SINISTRA: TABELLA FORNITORI RAGGRUPPATI */}
        <div className="w-72 flex flex-col border-r border-[var(--border)] bg-[var(--card)] flex-shrink-0 overflow-hidden">
          <div className="px-3 py-2 bg-[var(--background)] border-b border-[var(--border)] flex items-center justify-between text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
            <span>Fornitori ({filteredSupplierGroups.length})</span>
            <span className="text-[10px] font-normal lowercase">seleziona fornitore</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]">
            {loading ? (
              <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">
                Caricamento fornitori...
              </div>
            ) : filteredSupplierGroups.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">
                Nessun fornitore corrisponde alla ricerca.
              </div>
            ) : (
              filteredSupplierGroups.map((g) => {
                const isSelected = g.name === selectedSupplierName;
                const color = getFornitoreColor(g.name);

                return (
                  <div
                    key={g.name}
                    onClick={() => setSelectedSupplierName(g.name)}
                    className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[var(--primary)]/15 border-l-4 border-[var(--primary)]"
                        : "hover:bg-[var(--background)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        style={{
                          backgroundColor: color?.bg || "rgba(59,130,246,0.15)",
                          color: color?.text || "#93c5fd",
                          borderColor: color?.border || "#3b82f6",
                        }}
                        className="w-7 h-7 rounded border flex items-center justify-center font-bold text-[10px] flex-shrink-0"
                      >
                        {g.name.substring(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-[var(--foreground)] truncate">
                          {g.name}
                        </div>
                        {g.lastOrderDate && (
                          <div className="text-[10px] text-[var(--muted-foreground)] truncate">
                            Ultimo: {g.lastOrderDate}
                          </div>
                        )}
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-full bg-[var(--background)] text-[var(--muted-foreground)] border border-[var(--border)] text-[10px] font-bold flex-shrink-0">
                      {g.totalArticles} art.
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLONNA DESTRA: TABELLA ARTICOLI DEL FORNITORE SELEZIONATO (AG GRID VERA) */}
        <div className="flex-1 flex flex-col h-full bg-[var(--background)] overflow-hidden">
          {currentGroup ? (
            <>
              {/* Header Fornitore Attivo */}
              <div className="px-4 py-2 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  {(() => {
                    const color = getFornitoreColor(currentGroup.name);
                    return (
                      <span
                        style={{
                          backgroundColor: color?.bg || "rgba(59,130,246,0.15)",
                          color: color?.text || "#93c5fd",
                          borderColor: color?.border || "#3b82f6",
                        }}
                        className="px-2.5 py-1 rounded text-xs font-bold border truncate"
                      >
                        {currentGroup.name}
                      </span>
                    );
                  })()}
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Elenco di <strong>{currentGroup.items.length}</strong> articoli ordinati storicamente
                  </span>
                </div>

                <span className="text-[11px] text-[var(--muted-foreground)]">
                  Fai clic su <strong>+ Riordina</strong> su una riga per aggiungerlo subito agli Ordini Attivi
                </span>
              </div>

              {/* Tabella AG Grid vera e propria */}
              <div className="flex-1 w-full h-full overflow-hidden p-1">
                <div className="ag-theme-alpine orders-modern-grid w-full h-full">
                  <AgGridReact<SupplierHistoryRow>
                    ref={gridRef}
                    rowData={currentGroup.items}
                    getRowId={(p) => `${p.data.supplier_name}_${p.data.article_code}`}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    rowSelection="multiple"
                    suppressRowClickSelection={true}
                    onSelectionChanged={(e) => setSelectedRows(e.api.getSelectedRows())}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-[var(--muted-foreground)]">
              <Building2 className="w-12 h-12 mb-3 opacity-30" />
              <h3 className="text-sm font-bold text-[var(--foreground)]">Nessun fornitore selezionato</h3>
              <p className="text-xs max-w-xs mt-1">
                Seleziona un fornitore dalla tabella a sinistra per visualizzarne e riordinarne gli articoli storici.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

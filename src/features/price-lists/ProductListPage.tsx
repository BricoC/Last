import React, { useState, useCallback, useMemo } from "react";
import { GridColumn, GridCell, GridCellKind, Item, EditableGridCell } from "@glideapps/glide-data-grid";
import { ExcelGrid } from "@/shared/components/data-grid/ExcelGrid";
import { useProductList } from "./hooks/useProductList";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { centsToEuro, parseEuroStringToCents, formatCentsToEuro } from "./utils/currencyUtils";
import { Plus, Search, RefreshCw, AlertCircle, Trash2 } from "lucide-react";

export const ProductListPage: React.FC = () => {
  const { products, loading, error, searchQuery, setSearchQuery, addProduct, updateProduct, deleteProduct, reload } =
    useProductList();

  const [newCode, setNewCode] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newSalePrice, setNewSalePrice] = useState("1.00");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // Colonne della griglia Excel
  const columns: GridColumn[] = useMemo(
    () => [
      { id: "code", title: "Codice Articolo", width: 140 },
      { id: "description", title: "Descrizione Articolo", width: 340 },
      { id: "unit", title: "U.M.", width: 70 },
      { id: "purchase_price", title: "Pr. Acquisto (€)", width: 120 },
      { id: "sale_price", title: "Pr. Vendita (€)", width: 120 },
      { id: "vat_rate", title: "IVA %", width: 80 },
      { id: "notes", title: "Note", width: 220 },
    ],
    []
  );

  // Callback per estrarre il contenuto delle celle per Glide Data Grid
  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const product = products[row];
      if (!product) {
        return {
          kind: GridCellKind.Text,
          allowOverlay: false,
          data: "",
          displayData: "",
        };
      }

      switch (col) {
        case 0: // Codice
          return {
            kind: GridCellKind.Text,
            allowOverlay: true,
            data: product.code,
            displayData: product.code,
          };
        case 1: // Descrizione
          return {
            kind: GridCellKind.Text,
            allowOverlay: true,
            data: product.description,
            displayData: product.description,
          };
        case 2: // U.M.
          return {
            kind: GridCellKind.Text,
            allowOverlay: true,
            data: product.unit,
            displayData: product.unit,
          };
        case 3: { // Prezzo Acquisto
          const euroVal = centsToEuro(product.purchase_price_cents);
          return {
            kind: GridCellKind.Number,
            allowOverlay: true,
            data: euroVal,
            displayData: formatCentsToEuro(product.purchase_price_cents, false),
          };
        }
        case 4: { // Prezzo Vendita
          const euroVal = centsToEuro(product.sale_price_cents);
          return {
            kind: GridCellKind.Number,
            allowOverlay: true,
            data: euroVal,
            displayData: formatCentsToEuro(product.sale_price_cents, false),
          };
        }
        case 5: // IVA %
          return {
            kind: GridCellKind.Number,
            allowOverlay: true,
            data: product.vat_rate,
            displayData: `${product.vat_rate}%`,
          };
        case 6: // Note
          return {
            kind: GridCellKind.Text,
            allowOverlay: true,
            data: product.notes || "",
            displayData: product.notes || "",
          };
        default:
          return {
            kind: GridCellKind.Text,
            allowOverlay: false,
            data: "",
            displayData: "",
          };
      }
    },
    [products]
  );

  // Modifica inline della cella con salvataggio immediato in SQLite
  const onCellEdited = useCallback(
    async ([col, row]: Item, newValue: EditableGridCell) => {
      const product = products[row];
      if (!product) return;

      setSelectedProductId(product.id);

      try {
        switch (col) {
          case 0: // Codice
            if (newValue.kind === GridCellKind.Text) {
              await updateProduct(product.id, { code: newValue.data });
            }
            break;
          case 1: // Descrizione
            if (newValue.kind === GridCellKind.Text) {
              await updateProduct(product.id, { description: newValue.data });
            }
            break;
          case 2: // U.M.
            if (newValue.kind === GridCellKind.Text) {
              await updateProduct(product.id, { unit: newValue.data });
            }
            break;
          case 3: // Prezzo Acquisto
            if (newValue.kind === GridCellKind.Number && newValue.data !== undefined) {
              const cents = parseEuroStringToCents(newValue.data);
              await updateProduct(product.id, { purchase_price_cents: cents });
            }
            break;
          case 4: // Prezzo Vendita
            if (newValue.kind === GridCellKind.Number && newValue.data !== undefined) {
              const cents = parseEuroStringToCents(newValue.data);
              await updateProduct(product.id, { sale_price_cents: cents });
            }
            break;
          case 5: // IVA
            if (newValue.kind === GridCellKind.Number && newValue.data !== undefined) {
              await updateProduct(product.id, { vat_rate: Math.round(newValue.data) });
            }
            break;
          case 6: // Note
            if (newValue.kind === GridCellKind.Text) {
              await updateProduct(product.id, { notes: newValue.data });
            }
            break;
        }
      } catch (err) {
        console.error("[ProductListPage] Errore salvataggio cella:", err);
      }
    },
    [products, updateProduct]
  );

  // Creazione rapida articolo
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newDesc.trim()) return;

    try {
      await addProduct({
        code: newCode,
        description: newDesc,
        unit: "NR",
        purchase_price_cents: 0,
        sale_price_cents: parseEuroStringToCents(newSalePrice),
        vat_rate: 22,
      });

      setNewCode("");
      setNewDesc("");
      setShowAddForm(false);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--background)] overflow-hidden">
      {/* Top Toolbar */}
      <div className="p-3 border-b border-[var(--border)] bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <h2 className="text-base font-semibold text-[var(--foreground)] tracking-tight">
            Anagrafica Articoli & Listino
          </h2>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            {products.length} {products.length === 1 ? "articolo" : "articoli"}
          </span>
        </div>

        {/* Ricerca e Azioni */}
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cerca codice o descrizione..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-3 text-xs bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius)] text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--primary)] w-56"
            />
          </div>

          <Button size="sm" variant="outline" onClick={reload} title="Ricarica da SQLite">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>

          <Button size="sm" variant="primary" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Nuovo Articolo
          </Button>

          {selectedProductId && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                deleteProduct(selectedProductId);
                setSelectedProductId(null);
              }}
              title="Elimina logicamente articolo selezionato"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Banner di Errore (se presente) */}
      {error && (
        <div className="bg-red-950/50 border-b border-red-800 px-4 py-2 flex items-center space-x-2 text-xs text-red-200">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form rapido di inserimento a comparsa */}
      {showAddForm && (
        <div className="p-3 bg-slate-900 border-b border-[var(--border)] animate-in fade-in duration-150">
          <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              placeholder="Codice (es. TAS-SX6)*"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="h-8 px-3 bg-[var(--card)] border border-[var(--border)] rounded text-slate-200 uppercase w-44"
              required
            />
            <input
              type="text"
              placeholder="Descrizione completa articolo*"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="h-8 px-3 bg-[var(--card)] border border-[var(--border)] rounded text-slate-200 flex-1 min-w-[200px]"
              required
            />
            <input
              type="text"
              placeholder="Prezzo Vendita (€)"
              value={newSalePrice}
              onChange={(e) => setNewSalePrice(e.target.value)}
              className="h-8 px-3 bg-[var(--card)] border border-[var(--border)] rounded text-slate-200 w-28"
            />
            <Button size="sm" type="submit" variant="primary">
              Salva in SQLite
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setShowAddForm(false)}>
              Annulla
            </Button>
          </form>
        </div>
      )}

      {/* Area Griglia Glide Data Grid */}
      <div className="flex-1 w-full h-full overflow-hidden relative">
        {loading && products.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 z-10 text-xs text-slate-400">
            Caricamento da SQLite...
          </div>
        ) : products.length === 0 ? (
          <div className="h-full flex items-center justify-center p-6">
            <Card className="text-center max-w-md">
              <h3 className="font-semibold text-slate-200 mb-1">Nessun articolo in archivio</h3>
              <p className="text-xs text-slate-400 mb-4">
                L'archivio SQLite locale è vuoto. Clicca sul pulsante qui sotto per inserire il primo articolo.
              </p>
              <Button size="sm" variant="primary" onClick={() => setShowAddForm(true)}>
                <Plus className="w-4 h-4 mr-1" />
                Crea Articolo
              </Button>
            </Card>
          </div>
        ) : (
          <ExcelGrid
            columns={columns}
            rows={products.length}
            getCellContent={getCellContent}
            onCellEdited={onCellEdited}
          />
        )}
      </div>
    </div>
  );
};

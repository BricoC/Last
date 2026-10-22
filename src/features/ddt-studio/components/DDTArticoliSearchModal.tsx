import React, { useState, useEffect, useRef } from "react";
import { Search, X, Check, Tag } from "lucide-react";
import { Product } from "@/features/price-lists/models/product";
import { productRepository } from "@/features/price-lists/services/productRepository";
import { money } from "@/shared/domain/monetaryValue";

export interface DDTArticoliSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (prod: Product, quantity: string) => void;
}

export const DDTArticoliSearchModal: React.FC<DDTArticoliSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectProduct,
}) => {
  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      searchProducts("");
    }
  }, [isOpen]);

  const searchProducts = async (term: string) => {
    setIsLoading(true);
    try {
      const items = await productRepository.getActiveProducts(term);
      setProducts(items.slice(0, 100));
      setSelectedIndex(0);
    } catch (e) {
      console.error("Errore ricerca articoli:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      searchProducts(search);
    }, 150);
    return () => clearTimeout(timer);
  }, [search, isOpen]);

  // Gestione tastiera per navigazione elenco
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, products.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && products[selectedIndex]) {
      e.preventDefault();
      handleConfirm(products[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const handleConfirm = (prod: Product) => {
    onSelectProduct(prod, quantity || "1");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        onKeyDown={handleKeyDown}
        className="w-full max-w-3xl bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100"
      >
        {/* Header Modale */}
        <div className="p-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]">
          <div className="flex items-center space-x-2">
            <Tag className="w-4 h-4 text-[var(--primary)]" />
            <span className="font-bold text-sm text-[var(--foreground)]">
              Ricerca Articolo dal Listino Generale (F3)
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input Ricerca e Quantità */}
        <div className="p-3 border-b border-[var(--border)] flex items-center space-x-3 bg-[var(--card)]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-2.5 top-2.5" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per codice o descrizione (es. TASSELLO, VITE, SX...)"
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-medium"
            />
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <label className="text-xs text-[var(--muted-foreground)] font-semibold">Q.tà:</label>
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-16 px-2 py-1.5 text-xs text-center font-bold bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>

        {/* Tabella Risultati */}
        <div className="flex-1 overflow-y-auto max-h-96 divide-y divide-[var(--border)]/40">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
              Ricerca articoli in corso...
            </div>
          ) : products.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
              Nessun articolo trovato per "{search}".
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="bg-[var(--background)] sticky top-0 text-[10.5px] uppercase text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-1.5 text-left w-28">Codice</th>
                  <th className="px-3 py-1.5 text-left">Descrizione</th>
                  <th className="px-2 py-1.5 text-center w-16">U.M.</th>
                  <th className="px-3 py-1.5 text-right w-28">Prezzo Vendita</th>
                  <th className="px-2 py-1.5 text-center w-16">IVA</th>
                  <th className="px-2 py-1.5 text-center w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/40 font-mono">
                {products.map((p, idx) => {
                  const isSelected = selectedIndex === idx;
                  const price5dec = money(p.sale_price_cents / 100);

                  return (
                    <tr
                      key={p.id}
                      onClick={() => {
                        setSelectedIndex(idx);
                        handleConfirm(p);
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[var(--primary)]/15 text-[var(--foreground)] font-semibold"
                          : "hover:bg-[var(--background)]/60 text-[var(--foreground)]"
                      }`}
                    >
                      <td className="px-3 py-1.5 font-sans font-medium text-[var(--primary)]">
                        {p.code}
                      </td>
                      <td className="px-3 py-1.5 font-sans uppercase">
                        {p.description}
                      </td>
                      <td className="px-2 py-1.5 text-center uppercase">
                        {p.unit || "NR"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-bold text-emerald-400">
                        € {price5dec.formatIT(false)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {p.vat_rate}%
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConfirm(p);
                          }}
                          className="p-1 rounded bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white"
                          title="Inserisci nel DDT"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info tastiera */}
        <div className="p-2 border-t border-[var(--border)] bg-[var(--background)] flex justify-between items-center text-[11px] text-[var(--muted-foreground)]">
          <span>Usa le frecce ↑ ↓ per selezionare, Invio per inserire nel DDT</span>
          <span>Esc per chiudere</span>
        </div>
      </div>
    </div>
  );
};

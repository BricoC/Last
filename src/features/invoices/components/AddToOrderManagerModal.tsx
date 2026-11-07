import React, { useState, useEffect, useRef } from "react";
import { PackagePlus, X, Check, Building2, Barcode, FileText } from "lucide-react";
import { orderSupabaseService } from "@/features/orders/services/orderSupabaseService";
import { OrderItem } from "@/features/orders/types/order";
import { TODAY } from "@/features/orders/utils/constants";
import { useUserStore } from "@/shared/stores/useUserStore";

export interface AddToOrderManagerItem {
  supplier_name: string;
  article_code: string;
  description: string;
  quantity?: number | string;
  unit_price?: number;
  discounted_price?: number;
}

interface AddToOrderManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: AddToOrderManagerItem | null;
  onSuccess?: (message: string) => void;
}

export const AddToOrderManagerModal: React.FC<AddToOrderManagerModalProps> = ({
  isOpen,
  onClose,
  item,
  onSuccess,
}) => {
  const [quantity, setQuantity] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && item) {
      const initialQty =
        item.quantity !== undefined && Number(item.quantity) > 0
          ? String(item.quantity)
          : "1";
      setQuantity(initialQty);

      // Focus immediato sul campo quantità con il testo evidenziato per sovrascrittura rapida
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, item]);

  // Gestione tasti Esc e Invio
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        void handleConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, quantity, item, isSubmitting]);

  if (!isOpen || !item) return null;

  const handleConfirm = async () => {
    if (isSubmitting) return;

    const rawQty = quantity.trim();
    const finalQty = rawQty === "" ? "1" : rawQty;
    const currentUser = useUserStore.getState().currentUser?.name || "Operatore";

    const newOrder: OrderItem = {
      id: "",
      order_date: TODAY(),
      supplier_name: (item.supplier_name || "").trim(),
      article_code: (item.article_code || "").trim(),
      description: (item.description || "").trim().toUpperCase(),
      quantity: finalQty,
      price: "",
      user_name: currentUser,
      is_archived: false,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setIsSubmitting(true);
    try {
      const res = await orderSupabaseService.saveOrder(newOrder, true);

      // Notifica immediata per aggiornare la griglia di Order Manager se aperta
      window.dispatchEvent(
        new CustomEvent("supabase_update_ordini", {
          detail: { new: res.data || newOrder },
        })
      );

      const msg = `Aggiunto a Order Manager: ${finalQty}x ${newOrder.description}`;
      if (onSuccess) onSuccess(msg);
      onClose();
    } catch (err) {
      console.error("[AddToOrderManagerModal] Errore inserimento ordine:", err);
      alert(`Errore inserimento ordine: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-[#0f172a] border border-emerald-500/50 rounded-xl shadow-2xl p-4 flex flex-col space-y-3.5 text-slate-100">
        {/* Testata Modale */}
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Aggiungi a Order Manager
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Card Informazioni Articolo */}
        <div className="p-3 bg-slate-900/80 border border-slate-700/60 rounded-lg space-y-2 text-xs">
          {/* Fornitore */}
          <div className="flex items-center gap-1.5 text-slate-300">
            <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-slate-400">Fornitore:</span>
            <strong className="text-white truncate">{item.supplier_name || "—"}</strong>
          </div>

          {/* Codice */}
          <div className="flex items-center gap-1.5 text-slate-300">
            <Barcode className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-slate-400">Codice:</span>
            <span className="font-mono text-purple-300 font-semibold">{item.article_code || "—"}</span>
          </div>

          {/* Descrizione */}
          <div className="flex items-start gap-1.5 text-slate-300 pt-0.5">
            <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <div className="leading-snug">
              <span className="text-slate-400 block text-[10.5px]">Descrizione:</span>
              <span className="font-medium text-white">{item.description}</span>
            </div>
          </div>
        </div>

        {/* Input Quantità */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-200">
            Quantità da aggiungere all'ordine:
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Es. 1, 5, 10..."
              className="w-full px-3 py-2 text-center text-lg font-bold font-mono bg-slate-950 border border-emerald-500/60 rounded-lg text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all select-text"
            />
          </div>
          <p className="text-[10.5px] text-slate-400 text-center">
            Scrivi il numero e premi <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-200">Invio</kbd> per confermare, oppure <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-200">Esc</kbd> per annullare
          </p>
        </div>

        {/* Pulsanti Azione */}
        <div className="pt-2 border-t border-slate-800 flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Annulla (Esc)
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirm}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-1.5 shadow-md shadow-emerald-950 transition-colors disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSubmitting ? "Aggiunta in corso..." : "Aggiungi a OR (Invio)"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};


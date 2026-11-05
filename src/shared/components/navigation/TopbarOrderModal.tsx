import React, { useState, useEffect } from "react";
import { X, ArrowUp, ArrowDown, RotateCcw, Check, Move } from "lucide-react";
import { NavModule } from "./TopNavBar";
import { DEFAULT_TOPBAR_ORDER } from "@/shared/services/appUserService";

interface TopbarOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  modules: NavModule[];
  currentOrder: string[];
  onSaveOrder: (newOrder: string[]) => Promise<void> | void;
}

export const TopbarOrderModal: React.FC<TopbarOrderModalProps> = ({
  isOpen,
  onClose,
  modules,
  currentOrder,
  onSaveOrder,
}) => {
  const [order, setOrder] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Combina l'ordine attuale con eventuali moduli non ancora presenti
      const base = currentOrder && currentOrder.length > 0 ? [...currentOrder] : [...DEFAULT_TOPBAR_ORDER];
      const allModuleIds = modules.map((m) => m.id);
      for (const id of allModuleIds) {
        if (!base.includes(id)) {
          base.push(id);
        }
      }
      setOrder(base.filter((id) => allModuleIds.includes(id)));
    }
  }, [isOpen, currentOrder, modules]);

  if (!isOpen) return null;

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index - 1, 0, item);
    setOrder(next);
  };

  const moveDown = (index: number) => {
    if (index >= order.length - 1) return;
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + 1, 0, item);
    setOrder(next);
  };

  const handleReset = () => {
    const allModuleIds = modules.map((m) => m.id);
    const def = DEFAULT_TOPBAR_ORDER.filter((id) => allModuleIds.includes(id));
    setOrder(def);
  };

  const handleSave = async () => {
    await onSaveOrder(order);
    onClose();
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragOverId !== id) setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const from = order.indexOf(draggedId);
    const to = order.indexOf(targetId);
    if (from !== -1 && to !== -1) {
      const next = [...order];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setOrder(next);
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-[var(--primary)]/15 text-[var(--primary)]">
              <Move className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--foreground)]">
                Ordine Finestre nella Barra
              </h3>
              <p className="text-xs text-[var(--muted-foreground)]">
                Trascina o usa le frecce per posizionare i pulsanti
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lista Moduli Riordinabili */}
        <div className="p-4 space-y-1.5 overflow-y-auto flex-1">
          {order.map((modId, index) => {
            const mod = modules.find((m) => m.id === modId);
            if (!mod) return null;
            const isDragging = draggedId === modId;
            const isOver = dragOverId === modId;

            return (
              <div
                key={mod.id}
                draggable
                onDragStart={(e) => handleDragStart(e, mod.id)}
                onDragOver={(e) => handleDragOver(e, mod.id)}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => handleDrop(e, mod.id)}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-all select-none cursor-grab active:cursor-grabbing ${
                  isDragging
                    ? "opacity-40 bg-[var(--background)] border-dashed border-[var(--primary)]"
                    : isOver
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 scale-[1.01]"
                    : "border-[var(--border)] bg-[var(--background)]/60 hover:bg-[var(--background)]"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className="w-5 text-[10px] font-mono text-[var(--muted-foreground)] text-right font-bold">
                    {index + 1}.
                  </span>
                  <span className="text-[var(--primary)]">{mod.icon}</span>
                  <span className="font-semibold text-[var(--foreground)]">{mod.title}</span>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveUp(index)}
                    title="Sposta su"
                    className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === order.length - 1}
                    onClick={() => moveDown(index)}
                    title="Sposta giù"
                    className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3.5 border-t border-[var(--border)] bg-[var(--background)]/40">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] border border-[var(--border)] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Predefinito</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] transition-colors cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-[var(--primary)] hover:opacity-90 text-[var(--primary-foreground)] text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Salva Ordine</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from "react";
import { X, ArrowUp, ArrowDown, RotateCcw, Check, Move, GripVertical } from "lucide-react";
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

  // Chiusura tramite tasto ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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
      setDraggedId(null);
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
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!draggedId || draggedId === targetId) return;

    // Scambio reattivo immediato durante il trascinamento
    setOrder((prev) => {
      const from = prev.indexOf(draggedId);
      const to = prev.indexOf(targetId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
      >
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
                Trascina le schede o usa le frecce per posizionare i pulsanti
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Chiudi (ESC)"
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
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

            return (
              <div
                key={mod.id}
                draggable
                onDragStart={(e) => handleDragStart(e, mod.id)}
                onDragOver={(e) => handleDragOver(e, mod.id)}
                onDragEnd={handleDragEnd}
                onDrop={handleDragEnd}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-all select-none cursor-grab active:cursor-grabbing ${
                  isDragging
                    ? "opacity-50 bg-[var(--primary)]/15 border-dashed border-[var(--primary)] shadow-md"
                    : "border-[var(--border)] bg-[var(--background)]/70 hover:bg-[var(--background)] hover:border-[var(--primary)]/40 shadow-xs"
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <GripVertical className="w-4 h-4 text-[var(--muted-foreground)] shrink-0 cursor-grab" />
                  <span className="w-4 text-[11px] font-mono text-[var(--muted-foreground)] font-bold text-right shrink-0">
                    {index + 1}.
                  </span>
                  <span className="text-[var(--primary)] shrink-0">{mod.icon}</span>
                  <span className="font-semibold text-[var(--foreground)] truncate">{mod.title}</span>
                </div>

                <div className="flex items-center space-x-1 shrink-0 ml-2">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveUp(index);
                    }}
                    title="Sposta su"
                    className="p-1.5 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === order.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveDown(index);
                    }}
                    title="Sposta giù"
                    className="p-1.5 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
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

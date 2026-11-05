import React, { useState, useEffect, useRef } from "react";
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
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      const base = currentOrder && currentOrder.length > 0 ? [...currentOrder] : [...DEFAULT_TOPBAR_ORDER];
      const allModuleIds = modules.map((m) => m.id);
      for (const id of allModuleIds) {
        if (!base.includes(id)) {
          base.push(id);
        }
      }
      setOrder(base.filter((id) => allModuleIds.includes(id)));
      setActiveDragId(null);
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

  // Pointer Drag Handler (Immune al cursore di divieto del sistema operativo)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (e.button !== 0) return; // solo click sinistro
    // Ignora se si cliccano i pulsanti freccia
    if ((e.target as HTMLElement).closest("button")) return;

    setActiveDragId(id);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeDragId) return;

    // Individua la riga su cui si trova il puntatore del mouse
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    const targetElement = elements.find((el) => el.getAttribute("data-module-id"));
    if (!targetElement) return;

    const targetId = targetElement.getAttribute("data-module-id");
    if (!targetId || targetId === activeDragId) return;

    setOrder((prev) => {
      const from = prev.indexOf(activeDragId);
      const to = prev.indexOf(targetId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeDragId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setActiveDragId(null);
    }
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
                Trascina le schede con il mouse o usa le frecce
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
        <div
          ref={containerRef}
          className="p-4 space-y-1.5 overflow-y-auto flex-1 select-none"
        >
          {order.map((modId, index) => {
            const mod = modules.find((m) => m.id === modId);
            if (!mod) return null;
            const isDragging = activeDragId === modId;

            return (
              <div
                key={mod.id}
                data-module-id={mod.id}
                onPointerDown={(e) => handlePointerDown(e, mod.id)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{ touchAction: "none" }}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs transition-colors select-none ${
                  isDragging
                    ? "bg-[var(--primary)]/20 border-2 border-[var(--primary)] shadow-lg scale-[1.01] cursor-grabbing z-10"
                    : "border-[var(--border)] bg-[var(--background)]/70 hover:bg-[var(--background)] hover:border-[var(--primary)]/40 shadow-xs cursor-grab"
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0 pointer-events-none">
                  <GripVertical className="w-4 h-4 text-[var(--muted-foreground)] shrink-0" />
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

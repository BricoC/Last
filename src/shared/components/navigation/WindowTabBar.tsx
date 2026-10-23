import React, { useRef } from "react";
import { requestWindowClose, useWindowStore } from "@/shared/stores/useWindowStore";
import { ChevronLeft, ChevronRight, X, LayoutGrid, FileText, ShoppingCart, Tag, Calculator, Settings as SettingsIcon, Package, Users } from "lucide-react";
import { cn } from "@/shared/utils/cn";

export const WindowTabBar: React.FC = () => {
  const { windows, activeWindowId, focusWindow } = useWindowStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 180;
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const renderIcon = (componentId: string) => {
    switch (componentId) {
      case "dashboard":
        return <LayoutGrid className="w-3.5 h-3.5" />;
      case "price-lists":
        return <Tag className="w-3.5 h-3.5" />;
      case "ddt-studio":
        return <FileText className="w-3.5 h-3.5" />;
      case "orders":
        return <ShoppingCart className="w-3.5 h-3.5" />;
      case "quotes":
        return <Calculator className="w-3.5 h-3.5" />;
      case "clients":
        return <Users className="w-3.5 h-3.5" />;
      case "settings":
        return <SettingsIcon className="w-3.5 h-3.5" />;
      default:
        return <Package className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="h-8 bg-[var(--background)] border-b border-[var(--border)] px-1 flex items-center select-none justify-between text-[var(--foreground)] transition-colors">
      {/* Freccia Scorrimento Sinistra */}
      <button
        type="button"
        onClick={() => scroll("left")}
        className="h-6 w-6 flex items-center justify-center rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] transition-colors cursor-default"
        title="Scorri schede a sinistra"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      {/* Contenitore Schede Aperte */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-center space-x-1.5 overflow-x-auto no-scrollbar px-1 h-full"
      >
        {windows.map((win) => {
          const isActive = win.id === activeWindowId;

          return (
            <div
              key={win.id}
              onClick={() => focusWindow(win.id)}
              className={cn(
                "group relative h-6 px-2.5 flex items-center space-x-1.5 text-xs font-medium rounded transition-all cursor-default border",
                isActive
                  ? "bg-[var(--card)] text-[var(--foreground)] border-[var(--primary)] shadow-sm font-semibold"
                  : win.isMinimized
                  ? "bg-[var(--card)]/30 text-[var(--muted-foreground)] opacity-60 border-[var(--border)]"
                  : "bg-[var(--card)]/60 text-[var(--muted-foreground)] border-[var(--border)] hover:bg-[var(--card)] hover:text-[var(--foreground)]"
              )}
            >
              <span className={cn(isActive ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]")}>
                {renderIcon(win.componentId)}
              </span>

              <span className="truncate max-w-[130px]">{win.title}</span>

              {/* Indicatore visivo se la finestra è ridotta a icona */}
              {win.isMinimized && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Ridotta a icona" />
              )}

              {/* Pulsantino chiusura scheda */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void requestWindowClose(win.id);
                }}
                className="p-0.5 rounded-full hover:bg-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors ml-1 cursor-default"
                title="Chiudi scheda"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Freccia Scorrimento Destra */}
      <button
        type="button"
        onClick={() => scroll("right")}
        className="h-6 w-6 flex items-center justify-center rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] transition-colors cursor-default"
        title="Scorri schede a destra"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

import React, { useState, useRef, useEffect, useCallback } from "react";
import { WindowItem, useWindowStore } from "@/shared/stores/useWindowStore";
import { Minus, Square, Copy, X, LayoutGrid, FileText, ShoppingCart, Tag, Calculator, Settings as SettingsIcon, Package, Users } from "lucide-react";
import { cn } from "@/shared/utils/cn";

interface DesktopWindowProps {
  window: WindowItem;
  renderContent: (componentId: string) => React.ReactNode;
}

export const DesktopWindow: React.FC<DesktopWindowProps> = ({ window: win, renderContent }) => {
  const {
    activeWindowId,
    focusWindow,
    minimizeWindow,
    toggleMaximizeWindow,
    closeWindow,
    updateWindowBounds,
  } = useWindowStore();

  const isFocused = activeWindowId === win.id;

  // Stato trascinamento e ridimensionamento
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
  });
  const resizeStartRef = useRef<{ mouseX: number; mouseY: number; startW: number; startH: number }>({
    mouseX: 0,
    mouseY: 0,
    startW: 0,
    startH: 0,
  });

  // Icona in base al modulo
  const renderIcon = () => {
    switch (win.componentId) {
      case "dashboard":
        return <LayoutGrid className="w-4 h-4 text-blue-400" />;
      case "price-lists":
        return <Tag className="w-4 h-4 text-emerald-400" />;
      case "ddt-studio":
        return <FileText className="w-4 h-4 text-amber-400" />;
      case "orders":
        return <ShoppingCart className="w-4 h-4 text-cyan-400" />;
      case "quotes":
        return <Calculator className="w-4 h-4 text-purple-400" />;
      case "clients":
        return <Users className="w-4 h-4 text-teal-400" />;
      case "settings":
        return <SettingsIcon className="w-4 h-4 text-slate-300" />;
      default:
        return <Package className="w-4 h-4 text-blue-400" />;
    }
  };

  // Drag handler
  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if (win.isMaximized) return;
    if ((e.target as HTMLElement).closest("button")) return; // ignora se clicchi sui pulsanti finestra

    focusWindow(win.id);
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: win.x,
      startY: win.y,
    };
  };

  // Resize handler
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (win.isMaximized) return;
    e.stopPropagation();
    focusWindow(win.id);
    setIsResizing(true);
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startW: win.width,
      startH: win.height,
    };
  };

  // Global mousemove e mouseup
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.mouseX;
        const dy = e.clientY - dragStartRef.current.mouseY;
        const newX = Math.max(0, Math.min(window.innerWidth - 100, dragStartRef.current.startX + dx));
        const newY = Math.max(0, Math.min(window.innerHeight - 120, dragStartRef.current.startY + dy));
        updateWindowBounds(win.id, { x: newX, y: newY });
      } else if (isResizing) {
        const dw = e.clientX - resizeStartRef.current.mouseX;
        const dh = e.clientY - resizeStartRef.current.mouseY;
        const newW = Math.max(450, resizeStartRef.current.startW + dw);
        const newH = Math.max(300, resizeStartRef.current.startH + dh);
        updateWindowBounds(win.id, { width: newW, height: newH });
      }
    },
    [isDragging, isResizing, win.id, updateWindowBounds]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  if (win.isMinimized) return null;

  const style: React.CSSProperties = win.isMaximized
    ? {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        zIndex: win.zIndex,
      }
    : {
        position: "absolute",
        top: `${win.y}px`,
        left: `${win.x}px`,
        width: `${win.width}px`,
        height: `${win.height}px`,
        zIndex: win.zIndex,
      };

  return (
    <div
      onMouseDown={() => focusWindow(win.id)}
      style={style}
      className={cn(
        "flex flex-col bg-[var(--card)] rounded-lg shadow-2xl overflow-hidden transition-shadow select-none",
        isFocused
          ? "border-2 border-[var(--primary)] ring-2 ring-[var(--primary)]/20 shadow-blue-950/40"
          : "border border-[var(--border)] opacity-95",
        win.isMaximized && "rounded-none border-none"
      )}
    >
      {/* Title Bar in stile Finestra Windows */}
      <div
        onMouseDown={handleTitleMouseDown}
        onDoubleClick={() => toggleMaximizeWindow(win.id)}
        className={cn(
          "h-9 px-3 flex items-center justify-between border-b cursor-grab select-none",
          isFocused
            ? "bg-[#282d38] border-[var(--border)] text-white"
            : "bg-[#21242c] border-[#363a46] text-slate-400",
          isDragging && "cursor-grabbing"
        )}
      >
        {/* Sinistra: Icona e Titolo */}
        <div className="flex items-center space-x-2 truncate">
          {renderIcon()}
          <span className="text-xs font-semibold tracking-wide truncate">{win.title}</span>
        </div>

        {/* Destra: Pulsanti Controlli Finestra Windows (Riduci, Ingrandisci, Chiudi) */}
        <div className="flex items-center space-x-1">
          {/* Riduci a icona */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              minimizeWindow(win.id);
            }}
            className="w-7 h-6 flex items-center justify-center rounded hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors"
            title="Riduci a icona"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Ingrandisci / Ripristina */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMaximizeWindow(win.id);
            }}
            className="w-7 h-6 flex items-center justify-center rounded hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors"
            title={win.isMaximized ? "Ripristina giù" : "Ingrandisci a schermo intero"}
          >
            {win.isMaximized ? (
              <Copy className="w-3.5 h-3.5" />
            ) : (
              <Square className="w-3 h-3" />
            )}
          </button>

          {/* Chiudi Finestra */}
          {win.closable && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeWindow(win.id);
              }}
              className="w-7 h-6 flex items-center justify-center rounded hover:bg-red-600 text-slate-400 hover:text-white transition-colors"
              title="Chiudi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Contenuto Finestra (con scrolling fluido e scrollbar sottile) */}
      <div className="flex-1 relative overflow-auto bg-[var(--background)]">
        {renderContent(win.componentId)}
      </div>

      {/* Maniglia di ridimensionamento angolo inferiore destro */}
      {!win.isMaximized && (
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center group"
          title="Ridimensiona finestra"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-slate-500 group-hover:bg-[var(--primary)]" />
        </div>
      )}
    </div>
  );
};

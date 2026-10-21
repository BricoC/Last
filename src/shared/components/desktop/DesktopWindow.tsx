import React, { useState, useRef, useEffect, useCallback } from "react";
import { WindowItem, useWindowStore } from "@/shared/stores/useWindowStore";
import { Minus, Square, Copy, X, LayoutGrid, FileText, ShoppingCart, Tag, Calculator, Settings as SettingsIcon, Package, Users } from "lucide-react";
import { cn } from "@/shared/utils/cn";

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

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
    setDraggingWindowId,
    setSnapFlyoutVisible,
  } = useWindowStore();

  const isFocused = activeWindowId === win.id;

  const [isDragging, setIsDragging] = useState(false);
  const [activeResizeDir, setActiveResizeDir] = useState<ResizeDirection | null>(null);

  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
  });

  const resizeStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
  });

  const snapHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if (win.isMaximized) return;
    if ((e.target as HTMLElement).closest("button")) return;

    focusWindow(win.id);
    setIsDragging(true);
    setDraggingWindowId(win.id);

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: win.x,
      startY: win.y,
    };
  };

  const handleResizeStart = (e: React.MouseEvent, dir: ResizeDirection) => {
    if (win.isMaximized) return;
    e.stopPropagation();
    e.preventDefault();

    focusWindow(win.id);
    setActiveResizeDir(dir);

    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: win.x,
      startY: win.y,
      startW: win.width,
      startH: win.height,
    };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.mouseX;
        const dy = e.clientY - dragStartRef.current.mouseY;

        // Se trascini in alto (verso la barra), attiva la modalità scelta posizionamento Windows 11 (punto 3)
        if (e.clientY <= 38) {
          setSnapFlyoutVisible(true);
        } else if (e.clientY > 85) {
          setSnapFlyoutVisible(false);
        }

        const newX = Math.max(-win.width + 100, Math.min(window.innerWidth - 80, dragStartRef.current.startX + dx));
        const newY = Math.max(0, Math.min(window.innerHeight - 80, dragStartRef.current.startY + dy));
        updateWindowBounds(win.id, { x: newX, y: newY });
      } else if (activeResizeDir) {
        const dx = e.clientX - resizeStartRef.current.mouseX;
        const dy = e.clientY - resizeStartRef.current.mouseY;
        const s = resizeStartRef.current;

        let newX = s.startX;
        let newY = s.startY;
        let newW = s.startW;
        let newH = s.startH;

        if (activeResizeDir.includes("e")) {
          newW = Math.max(380, s.startW + dx);
        }
        if (activeResizeDir.includes("w")) {
          newW = Math.max(380, s.startW - dx);
          newX = s.startX + (s.startW - newW);
        }
        if (activeResizeDir.includes("s")) {
          newH = Math.max(240, s.startH + dy);
        }
        if (activeResizeDir.includes("n")) {
          newH = Math.max(240, s.startH - dy);
          newY = s.startY + (s.startH - newH);
        }

        updateWindowBounds(win.id, { x: newX, y: newY, width: newW, height: newH });
      }
    },
    [isDragging, activeResizeDir, win.id, win.width, updateWindowBounds, setSnapFlyoutVisible]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setActiveResizeDir(null);
  }, []);

  useEffect(() => {
    if (isDragging || activeResizeDir) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, activeResizeDir, handleMouseMove, handleMouseUp]);

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
        "flex flex-col bg-[var(--card)] rounded-lg shadow-2xl overflow-hidden transition-shadow select-none cursor-default",
        isFocused
          ? "border-2 border-[var(--primary)] ring-1 ring-[var(--primary)]/30 shadow-black/60"
          : "border border-[var(--border)] opacity-95",
        win.isMaximized && "rounded-none border-none ring-0"
      )}
    >
      {/* 8 Bordi e Angoli di Ridimensionamento in Stile Windows (Punto 1) */}
      {!win.isMaximized && (
        <>
          {/* Bordi */}
          <div onMouseDown={(e) => handleResizeStart(e, "n")} className="absolute top-0 left-2 right-2 h-1.5 cursor-n-resize z-50" />
          <div onMouseDown={(e) => handleResizeStart(e, "s")} className="absolute bottom-0 left-2 right-2 h-1.5 cursor-s-resize z-50" />
          <div onMouseDown={(e) => handleResizeStart(e, "w")} className="absolute left-0 top-2 bottom-2 w-1.5 cursor-w-resize z-50" />
          <div onMouseDown={(e) => handleResizeStart(e, "e")} className="absolute right-0 top-2 bottom-2 w-1.5 cursor-e-resize z-50" />

          {/* Angoli */}
          <div onMouseDown={(e) => handleResizeStart(e, "nw")} className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-50" />
          <div onMouseDown={(e) => handleResizeStart(e, "ne")} className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-50" />
          <div onMouseDown={(e) => handleResizeStart(e, "sw")} className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-50" />
          <div onMouseDown={(e) => handleResizeStart(e, "se")} className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-50" />
        </>
      )}

      {/* Title Bar in stile Finestra Windows */}
      <div
        onMouseDown={handleTitleMouseDown}
        onDoubleClick={() => toggleMaximizeWindow(win.id)}
        className={cn(
          "h-9 px-3 flex items-center justify-between border-b select-none cursor-default",
          isFocused
            ? "bg-[#282d38] border-[var(--border)] text-white"
            : "bg-[#21242c] border-[#363a46] text-slate-400"
        )}
      >
        <div className="flex items-center space-x-2 truncate pointer-events-none">
          {renderIcon()}
          <span className="text-xs font-semibold tracking-wide truncate">{win.title}</span>
        </div>

        {/* Pulsanti Finestra Windows */}
        <div className="flex items-center space-x-1">
          {/* Riduci a icona */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              minimizeWindow(win.id);
            }}
            className="w-7 h-6 flex items-center justify-center rounded hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors cursor-default"
            title="Riduci a icona"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Ingrandisci / Ripristina (con supporto Windows 11 Snap su hover) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMaximizeWindow(win.id);
            }}
            onMouseEnter={() => {
              snapHoverTimer.current = setTimeout(() => {
                setDraggingWindowId(win.id);
                setSnapFlyoutVisible(true);
              }, 260);
            }}
            onMouseLeave={() => {
              if (snapHoverTimer.current) clearTimeout(snapHoverTimer.current);
            }}
            className="w-7 h-6 flex items-center justify-center rounded hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors cursor-default"
            title={win.isMaximized ? "Ripristina giù" : "Ingrandisci a schermo intero"}
          >
            {win.isMaximized ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3 h-3" />}
          </button>

          {/* Chiudi Finestra */}
          {win.closable && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeWindow(win.id);
              }}
              className="w-7 h-6 flex items-center justify-center rounded hover:bg-red-600 text-slate-400 hover:text-white transition-colors cursor-default"
              title="Chiudi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Contenuto Finestra */}
      <div className="flex-1 relative overflow-auto bg-[var(--background)] cursor-default">
        {renderContent(win.componentId)}
      </div>
    </div>
  );
};

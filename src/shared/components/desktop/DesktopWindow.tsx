import React, { useState, useRef, useEffect, useCallback } from "react";
import { WindowItem, useWindowStore, SnapSlotType, requestWindowClose } from "@/shared/stores/useWindowStore";
import { Minus, Square, Copy, X, Plus, Grid2X2, LayoutGrid, FileText, ShoppingCart, Tag, Calculator, Settings as SettingsIcon, Package, Users, Hash, ClipboardList, StickyNote } from "lucide-react";
import { cn } from "@/shared/utils/cn";

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MODULE_ICONS: Record<string, React.ReactNode> = {
  dashboard: <LayoutGrid className="w-4 h-4 text-blue-400" />,
  "price-lists": <Tag className="w-4 h-4 text-emerald-400" />,
  "ddt-studio": <FileText className="w-4 h-4 text-amber-400" />,
  "or-numbers": <Hash className="w-4 h-4 text-emerald-400" />,
  orders: <ShoppingCart className="w-4 h-4 text-cyan-400" />,
  quotes: <Calculator className="w-4 h-4 text-purple-400" />,
  offers: <ClipboardList className="w-4 h-4 text-blue-400" />,
  clients: <Users className="w-4 h-4 text-teal-400" />,
  notes: <StickyNote className="w-4 h-4 text-amber-400" />,
  settings: <SettingsIcon className="w-4 h-4 text-slate-300" />,
};

interface DesktopWindowProps {
  window: WindowItem;
  renderContent: (componentId: string, windowId: string) => React.ReactNode;
}

export const DesktopWindow: React.FC<DesktopWindowProps> = ({ window: win, renderContent }) => {
  const {
    activeWindowId,
    focusWindow,
    minimizeWindow,
    toggleMaximizeWindow,
    duplicateWindow,
    updateWindowBounds,
    setDraggingWindowId,
    setSnapFlyoutVisible,
    setHoveredSnapSlot,
    snapWindowToSlot,
  } = useWindowStore();

  const isFocused = activeWindowId === win.id;
  const [isDragging, setIsDragging] = useState(false);
  const [activeResizeDir, setActiveResizeDir] = useState<ResizeDirection | null>(null);
  const [isSnapMenuOpen, setIsSnapMenuOpen] = useState(false);
  const snapMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSnapMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (snapMenuRef.current && !snapMenuRef.current.contains(e.target as Node)) {
        setIsSnapMenuOpen(false);
        setHoveredSnapSlot(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsSnapMenuOpen(false);
        setHoveredSnapSlot(null);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSnapMenuOpen, setHoveredSnapSlot]);

  const handleQuickSnap = (slot: SnapSlotType) => {
    snapWindowToSlot(win.id, slot);
    setIsSnapMenuOpen(false);
  };

  const pendingSnapRef = useRef<SnapSlotType | "maximize" | null>(null);
  const winWidthRef = useRef<number>(win.width || 960);
  winWidthRef.current = win.width || 960;

  const dragStartRef = useRef({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
    wasMaximized: false,
    hasMoved: false,
  });

  const resizeStartRef = useRef({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
  });

  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    focusWindow(win.id);
    setIsDragging(true);
    setDraggingWindowId(win.id);

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: win.x,
      startY: win.y,
      wasMaximized: win.isMaximized,
      hasMoved: false,
    };
  };

  const handleTitleDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    toggleMaximizeWindow(win.id);
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
        const dist = Math.hypot(dx, dy);

        if (dist > 3) dragStartRef.current.hasMoved = true;

        // Se trascini una finestra massimizzata, la ripristina e l'aggancia al cursore (Punto 3)
        if (dragStartRef.current.wasMaximized && dist > 4) {
          const ratio = Math.max(0.1, Math.min(0.9, e.clientX / window.innerWidth));
          const restoredW = win.width || 960;
          const restoredX = Math.max(0, Math.min(window.innerWidth - restoredW, e.clientX - restoredW * ratio));
          const restoredY = Math.max(0, e.clientY - 16);

          updateWindowBounds(win.id, { x: restoredX, y: restoredY, isMaximized: false });
          dragStartRef.current.wasMaximized = false;
          dragStartRef.current.startX = restoredX;
          dragStartRef.current.startY = restoredY;
          dragStartRef.current.mouseX = e.clientX;
          dragStartRef.current.mouseY = e.clientY;
          return;
        }

        if (!dragStartRef.current.wasMaximized && dragStartRef.current.hasMoved) {
          const currentW = winWidthRef.current;
          const newX = Math.max(-currentW + 100, Math.min(window.innerWidth - 80, dragStartRef.current.startX + dx));
          const newY = Math.max(0, Math.min(window.innerHeight - 80, dragStartRef.current.startY + dy));
          updateWindowBounds(win.id, { x: newX, y: newY });

          // Comportamento Nativo Windows: si attiva SOLO quando il cursore del mouse tocca il bordo dello schermo
          const isTouchingLeftBorder = e.clientX <= 12;
          const isTouchingRightBorder = e.clientX >= window.innerWidth - 12;
          const isTouchingTopBorder = e.clientY <= 15;

          // Rileva se il cursore è sopra uno dei riquadri del flyout di snap
          const elemUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
          const hoveredSlotElem = elemUnderCursor?.closest("[data-snap-slot]")?.getAttribute("data-snap-slot") as SnapSlotType | null;

          // PRIORITÀ 1: Bordo Sinistro (Tocca il bordo sinistro: ombra blu 50% sinistra)
          if (isTouchingLeftBorder && !hoveredSlotElem) {
            setSnapFlyoutVisible(false);
            setHoveredSnapSlot("left-half");
            pendingSnapRef.current = "left-half";
          }
          // PRIORITÀ 2: Bordo Destro (Tocca il bordo destro: ombra blu 50% destra)
          else if (isTouchingRightBorder && !hoveredSlotElem) {
            setSnapFlyoutVisible(false);
            setHoveredSnapSlot("right-half");
            pendingSnapRef.current = "right-half";
          }
          // PRIORITÀ 3: Bordo Superiore (Tocca il bordo superiore: flyout e anteprima massimizza)
          else if (isTouchingTopBorder) {
            setSnapFlyoutVisible(true);
            setDraggingWindowId(win.id);

            if (hoveredSlotElem) {
              setHoveredSnapSlot(hoveredSlotElem);
              pendingSnapRef.current = hoveredSlotElem;
            } else {
              setHoveredSnapSlot("maximize");
              pendingSnapRef.current = "maximize";
            }
          }
          // PRIORITÀ 4: Cursore sopra un riquadro del flyout aperto
          else if (hoveredSlotElem) {
            setHoveredSnapSlot(hoveredSlotElem);
            pendingSnapRef.current = hoveredSlotElem;
          }
          // PRIORITÀ 5: Spazio libero centrale del desktop
          else {
            if (pendingSnapRef.current === "left-half" || pendingSnapRef.current === "right-half") {
              setHoveredSnapSlot(null);
              pendingSnapRef.current = null;
            }
            if (e.clientY > 160 || e.clientX < window.innerWidth / 2 - 320 || e.clientX > window.innerWidth / 2 + 320) {
              setSnapFlyoutVisible(false);
              if (pendingSnapRef.current === "maximize") {
                setHoveredSnapSlot(null);
                pendingSnapRef.current = null;
              }
            }
          }
        }
      } else if (activeResizeDir) {
        const dx = e.clientX - resizeStartRef.current.mouseX;
        const dy = e.clientY - resizeStartRef.current.mouseY;
        const s = resizeStartRef.current;

        let newX = s.startX;
        let newY = s.startY;
        let newW = s.startW;
        let newH = s.startH;

        if (activeResizeDir.includes("e")) newW = Math.max(380, s.startW + dx);
        if (activeResizeDir.includes("w")) {
          newW = Math.max(380, s.startW - dx);
          newX = s.startX + (s.startW - newW);
        }
        if (activeResizeDir.includes("s")) newH = Math.max(240, s.startH + dy);
        if (activeResizeDir.includes("n")) {
          newH = Math.max(240, s.startH - dy);
          newY = s.startY + (s.startH - newH);
        }

        updateWindowBounds(win.id, { x: newX, y: newY, width: newW, height: newH });
      }
    },
    [isDragging, activeResizeDir, win.id, updateWindowBounds, setSnapFlyoutVisible, setDraggingWindowId, setHoveredSnapSlot]
  );

  // Al rilascio del tasto del mouse (mouseup): se è su uno slot aggancia allo slot, se a sx/dx affianca al 50%, se la schermata di scelta era visibile massimizza e chiude (Punto 1, 2, 3)
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      const { hoveredSnapSlot, isSnapFlyoutVisible } = useWindowStore.getState();

      if (hoveredSnapSlot) {
        snapWindowToSlot(win.id, hoveredSnapSlot);
      } else if (pendingSnapRef.current === "left-half") {
        snapWindowToSlot(win.id, "left-half");
      } else if (pendingSnapRef.current === "right-half") {
        snapWindowToSlot(win.id, "right-half");
      } else if (pendingSnapRef.current === "maximize" || isSnapFlyoutVisible) {
        updateWindowBounds(win.id, { isMaximized: true });
        setSnapFlyoutVisible(false);
        setHoveredSnapSlot(null);
      } else {
        setSnapFlyoutVisible(false);
        setHoveredSnapSlot(null);
      }
    }

    pendingSnapRef.current = null;
    setIsDragging(false);
    setDraggingWindowId(null);
    setActiveResizeDir(null);
  }, [isDragging, win.id, snapWindowToSlot, updateWindowBounds, setSnapFlyoutVisible, setHoveredSnapSlot, setDraggingWindowId]);

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
    ? { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", zIndex: win.zIndex }
    : { position: "absolute", top: `${win.y}px`, left: `${win.x}px`, width: `${win.width}px`, height: `${win.height}px`, zIndex: win.zIndex };

  return (
    <div
      onMouseDown={() => focusWindow(win.id)}
      style={style}
      className={cn(
        "flex flex-col bg-[var(--card)] rounded-lg shadow-2xl overflow-hidden transition-shadow select-none cursor-default text-[var(--foreground)]",
        isFocused ? "border-2 border-[var(--primary)] ring-1 ring-[var(--primary)]/30 shadow-black/40" : "border border-[var(--border)] opacity-95",
        win.isMaximized && "rounded-none border-none ring-0 shadow-none"
      )}
    >
      {/* 8 Bordi e Angoli di Ridimensionamento in Stile Windows */}
      {!win.isMaximized && (
        <>
          <div onMouseDown={(e) => handleResizeStart(e, "n")} className="absolute top-0 left-2 right-2 h-1.5 cursor-n-resize z-50" />
          <div onMouseDown={(e) => handleResizeStart(e, "s")} className="absolute bottom-0 left-2 right-2 h-1.5 cursor-s-resize z-50" />
          <div onMouseDown={(e) => handleResizeStart(e, "w")} className="absolute left-0 top-2 bottom-2 w-1.5 cursor-w-resize z-50" />
          <div onMouseDown={(e) => handleResizeStart(e, "e")} className="absolute right-0 top-2 bottom-2 w-1.5 cursor-e-resize z-50" />
          <div onMouseDown={(e) => handleResizeStart(e, "nw")} className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-50" />
          <div onMouseDown={(e) => handleResizeStart(e, "ne")} className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-50" />
          <div onMouseDown={(e) => handleResizeStart(e, "sw")} className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-50" />
          <div onMouseDown={(e) => handleResizeStart(e, "se")} className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-50" />
        </>
      )}

      {/* Title Bar in stile Finestra Windows con colori dinamici per contrasto perfetto */}
      <div
        onMouseDown={handleTitleMouseDown}
        onDoubleClick={handleTitleDoubleClick}
        className={cn(
          "h-9 px-3 flex items-center justify-between border-b select-none cursor-default transition-colors",
          isFocused
            ? "bg-[var(--card)] border-[var(--border)] text-[var(--foreground)]"
            : "bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)]"
        )}
      >
        <div className="flex items-center space-x-2 truncate pointer-events-none">
          {MODULE_ICONS[win.componentId] || <Package className="w-4 h-4 text-blue-400" />}
          <span className="text-xs font-semibold tracking-wide truncate">{win.title}</span>
        </div>

        {/* Pulsanti Finestra Windows */}
        <div className="flex items-center space-x-1">
          {/* Posizionamento rapido finestra (Sopra / Sotto / Sinistra / Destra / Quadranti) */}
          <div ref={snapMenuRef} className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                focusWindow(win.id);
                setIsSnapMenuOpen((prev) => {
                  if (prev) setHoveredSnapSlot(null);
                  return !prev;
                });
              }}
              className={cn(
                "w-7 h-6 flex items-center justify-center rounded transition-colors cursor-default",
                isSnapMenuOpen
                  ? "bg-[var(--primary)]/20 text-[var(--primary)]"
                  : "hover:bg-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
              title="Posiziona finestra (Sopra, Sotto, Sinistra, Destra, Quadranti)"
            >
              <Grid2X2 className="w-3.5 h-3.5" />
            </button>

            {isSnapMenuOpen && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 z-[9995] bg-[#1e2128]/98 backdrop-blur-xl border border-[#3e4350] rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.75)] p-2.5 select-none"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 px-0.5 whitespace-nowrap">
                  Posiziona finestra
                </div>
                <div className="flex items-center space-x-2">
                  {/* Sopra / Sotto */}
                  <div className="w-[64px] h-[46px] p-1 rounded-lg border border-[#444957] bg-[#282a31] flex flex-col space-y-1">
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredSnapSlot("top-half")}
                      onMouseLeave={() => setHoveredSnapSlot(null)}
                      onClick={() => handleQuickSnap("top-half")}
                      title="Metà Superiore (50%)"
                      className="w-full flex-1 rounded border bg-[#383b45] border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-colors cursor-default"
                    />
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredSnapSlot("bottom-half")}
                      onMouseLeave={() => setHoveredSnapSlot(null)}
                      onClick={() => handleQuickSnap("bottom-half")}
                      title="Metà Inferiore (50%)"
                      className="w-full flex-1 rounded border bg-[#383b45] border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-colors cursor-default"
                    />
                  </div>

                  {/* Sinistra / Destra */}
                  <div className="w-[64px] h-[46px] p-1 rounded-lg border border-[#444957] bg-[#282a31] flex space-x-1">
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredSnapSlot("left-half")}
                      onMouseLeave={() => setHoveredSnapSlot(null)}
                      onClick={() => handleQuickSnap("left-half")}
                      title="Metà Sinistra (50%)"
                      className="flex-1 h-full rounded border bg-[#383b45] border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-colors cursor-default"
                    />
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredSnapSlot("right-half")}
                      onMouseLeave={() => setHoveredSnapSlot(null)}
                      onClick={() => handleQuickSnap("right-half")}
                      title="Metà Destra (50%)"
                      className="flex-1 h-full rounded border bg-[#383b45] border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-colors cursor-default"
                    />
                  </div>

                  {/* 4 Quadranti */}
                  <div className="w-[64px] h-[46px] p-1 rounded-lg border border-[#444957] bg-[#282a31] grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredSnapSlot("top-left")}
                      onMouseLeave={() => setHoveredSnapSlot(null)}
                      onClick={() => handleQuickSnap("top-left")}
                      title="In alto a sinistra"
                      className="h-full rounded border bg-[#383b45] border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-colors cursor-default"
                    />
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredSnapSlot("top-right")}
                      onMouseLeave={() => setHoveredSnapSlot(null)}
                      onClick={() => handleQuickSnap("top-right")}
                      title="In alto a destra"
                      className="h-full rounded border bg-[#383b45] border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-colors cursor-default"
                    />
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredSnapSlot("bottom-left")}
                      onMouseLeave={() => setHoveredSnapSlot(null)}
                      onClick={() => handleQuickSnap("bottom-left")}
                      title="In basso a sinistra"
                      className="h-full rounded border bg-[#383b45] border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-colors cursor-default"
                    />
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredSnapSlot("bottom-right")}
                      onMouseLeave={() => setHoveredSnapSlot(null)}
                      onClick={() => handleQuickSnap("bottom-right")}
                      title="In basso a destra"
                      className="h-full rounded border bg-[#383b45] border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-colors cursor-default"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sdoppia / Duplica Finestra (nuova istanza dello stesso modulo) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              duplicateWindow(win.id);
            }}
            className="w-7 h-6 flex items-center justify-center rounded hover:bg-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-default"
            title="Sdoppia finestra (apri un'altra istanza di questo modulo)"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {/* Riduci a icona */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              minimizeWindow(win.id);
            }}
            className="w-7 h-6 flex items-center justify-center rounded hover:bg-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-default"
            title="Riduci a icona"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Ingrandisci / Ripristina: click immediato stile Windows */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMaximizeWindow(win.id);
            }}
            className="w-7 h-6 flex items-center justify-center rounded hover:bg-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-default"
            title={win.isMaximized ? "Ripristina giù" : "Ingrandisci a schermo intero"}
          >
            {win.isMaximized ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3 h-3" />}
          </button>

          {/* Chiudi Finestra (Sempre presente su tutte le finestre - Punto 1) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void requestWindowClose(win.id);
            }}
            className="w-7 h-6 flex items-center justify-center rounded hover:bg-red-600 hover:text-white text-[var(--muted-foreground)] transition-colors cursor-default"
            title="Chiudi"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Contenuto Finestra con supporto colori tema */}
      <div className="flex-1 relative overflow-auto bg-[var(--background)] text-[var(--foreground)] cursor-default">
        {renderContent(win.componentId, win.id)}
      </div>
    </div>
  );
};

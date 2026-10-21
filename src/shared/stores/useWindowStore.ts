import { create } from "zustand";

export interface WindowItem {
  id: string;
  title: string;
  componentId: string;
  iconName?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  isMinimized: boolean;
  isMaximized: boolean;
  closable: boolean;
}

export type SnapSlotType =
  | "maximize"
  | "left-half"
  | "right-half"
  | "top-half"
  | "bottom-half"
  | "left-two-thirds"
  | "right-one-third"
  | "three-col-left"
  | "three-col-mid"
  | "three-col-right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export function getSnapSlotBounds(slot: SnapSlotType): { x: number; y: number; width: number; height: number } {
  const desktopW = window.innerWidth;
  const desktopH = window.innerHeight - 72;

  switch (slot) {
    case "maximize":
      return { x: 0, y: 0, width: desktopW, height: desktopH };
    case "left-half":
      return { x: 0, y: 0, width: Math.floor(desktopW / 2), height: desktopH };
    case "right-half":
      return { x: Math.floor(desktopW / 2), y: 0, width: Math.ceil(desktopW / 2), height: desktopH };
    case "top-half":
      return { x: 0, y: 0, width: desktopW, height: Math.floor(desktopH / 2) };
    case "bottom-half":
      return { x: 0, y: Math.floor(desktopH / 2), width: desktopW, height: Math.ceil(desktopH / 2) };
    case "left-two-thirds":
      return { x: 0, y: 0, width: Math.floor((desktopW * 2) / 3), height: desktopH };
    case "right-one-third":
      return { x: Math.floor((desktopW * 2) / 3), y: 0, width: Math.ceil(desktopW / 3), height: desktopH };
    case "three-col-left":
      return { x: 0, y: 0, width: Math.floor(desktopW / 3), height: desktopH };
    case "three-col-mid":
      return { x: Math.floor(desktopW / 3), y: 0, width: Math.floor(desktopW / 3), height: desktopH };
    case "three-col-right":
      return { x: Math.floor((desktopW * 2) / 3), y: 0, width: Math.ceil(desktopW / 3), height: desktopH };
    case "top-left":
      return { x: 0, y: 0, width: Math.floor(desktopW / 2), height: Math.floor(desktopH / 2) };
    case "top-right":
      return { x: Math.floor(desktopW / 2), y: 0, width: Math.ceil(desktopW / 2), height: Math.floor(desktopH / 2) };
    case "bottom-left":
      return { x: 0, y: Math.floor(desktopH / 2), width: Math.floor(desktopW / 2), height: Math.ceil(desktopH / 2) };
    case "bottom-right":
      return { x: Math.floor(desktopW / 2), y: Math.floor(desktopH / 2), width: Math.ceil(desktopW / 2), height: Math.ceil(desktopH / 2) };
  }
}

interface WindowState {
  windows: WindowItem[];
  activeWindowId: string | null;
  nextZIndex: number;
  lastVisibleWindowIds: string[];
  draggingWindowId: string | null;
  isSnapFlyoutVisible: boolean;
  hoveredSnapSlot: SnapSlotType | null;
  snapPreviewBounds: { x: number; y: number; width: number; height: number } | null;

  // Actions
  openWindow: (item: {
    id: string;
    title: string;
    componentId: string;
    iconName?: string;
    closable?: boolean;
    defaultWidth?: number;
    defaultHeight?: number;
  }) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  toggleMaximizeWindow: (id: string) => void;
  updateWindowBounds: (
    id: string,
    bounds: Partial<Pick<WindowItem, "x" | "y" | "width" | "height" | "isMaximized">>
  ) => void;

  setDraggingWindowId: (id: string | null) => void;
  setSnapFlyoutVisible: (visible: boolean) => void;
  setHoveredSnapSlot: (slot: SnapSlotType | null) => void;
  snapWindowToSlot: (id: string, slot: SnapSlotType) => void;

  toggleShowDesktop: () => void;
  areAllWindowsMinimized: () => boolean;

  // Layout Presets
  tileSideBySide: () => void;
  tileHorizontal: () => void;
  tileGrid: () => void;
  cascadeWindows: () => void;
}

// Tutte le finestre sono chiudibili (Punto 1) e aprono sempre massimizzate (Punto 5)
const DEFAULT_DASHBOARD_WINDOW: WindowItem = {
  id: "dashboard",
  title: "Dashboard",
  componentId: "dashboard",
  iconName: "LayoutGrid",
  x: 20,
  y: 20,
  width: 980,
  height: 640,
  zIndex: 10,
  isMinimized: false,
  isMaximized: true,
  closable: true,
};

export const useWindowStore = create<WindowState>((set, get) => ({
  windows: [DEFAULT_DASHBOARD_WINDOW],
  activeWindowId: "dashboard",
  nextZIndex: 11,
  lastVisibleWindowIds: ["dashboard"],
  draggingWindowId: null,
  isSnapFlyoutVisible: false,
  hoveredSnapSlot: null,
  snapPreviewBounds: null,

  openWindow: (item) => {
    const { windows, nextZIndex } = get();
    const existing = windows.find((w) => w.id === item.id);

    if (existing) {
      set({
        activeWindowId: existing.id,
        nextZIndex: nextZIndex + 1,
        windows: windows.map((w) =>
          w.id === existing.id
            ? { ...w, isMinimized: false, zIndex: nextZIndex + 1 }
            : w
        ),
      });
      return;
    }

    const offset = (windows.length % 6) * 30 + 30;
    const defaultW = item.defaultWidth ?? 960;
    const defaultH = item.defaultHeight ?? 620;

    const newWindow: WindowItem = {
      id: item.id,
      title: item.title,
      componentId: item.componentId,
      iconName: item.iconName,
      x: offset,
      y: offset,
      width: defaultW,
      height: defaultH,
      zIndex: nextZIndex + 1,
      isMinimized: false,
      isMaximized: true,
      closable: true,
    };

    set({
      windows: [...windows, newWindow],
      activeWindowId: newWindow.id,
      nextZIndex: nextZIndex + 2,
    });
  },

  closeWindow: (id) => {
    const { windows, activeWindowId } = get();
    const remaining = windows.filter((w) => w.id !== id);
    let nextActiveId = activeWindowId;

    if (activeWindowId === id) {
      const nonMinimized = remaining.filter((w) => !w.isMinimized);
      nextActiveId = nonMinimized.length > 0 ? nonMinimized[nonMinimized.length - 1].id : null;
    }

    set({
      windows: remaining,
      activeWindowId: nextActiveId,
    });
  },

  focusWindow: (id) => {
    const { windows, nextZIndex } = get();
    const target = windows.find((w) => w.id === id);
    if (!target) return;

    set({
      activeWindowId: id,
      nextZIndex: nextZIndex + 1,
      windows: windows.map((w) =>
        w.id === id
          ? { ...w, isMinimized: false, zIndex: nextZIndex + 1 }
          : w
      ),
    });
  },

  minimizeWindow: (id) => {
    const { windows, activeWindowId } = get();
    const remainingVisible = windows.filter((w) => w.id !== id && !w.isMinimized);

    set({
      windows: windows.map((w) => (w.id === id ? { ...w, isMinimized: true } : w)),
      activeWindowId: activeWindowId === id ? (remainingVisible.length > 0 ? remainingVisible[remainingVisible.length - 1].id : null) : activeWindowId,
    });
  },

  toggleMaximizeWindow: (id) => {
    const { windows, nextZIndex } = get();
    set({
      activeWindowId: id,
      nextZIndex: nextZIndex + 1,
      windows: windows.map((w) =>
        w.id === id
          ? { ...w, isMaximized: !w.isMaximized, isMinimized: false, zIndex: nextZIndex + 1 }
          : w
      ),
    });
  },

  updateWindowBounds: (id, bounds) => {
    set((state) => ({
      windows: state.windows.map((w) => (w.id === id ? { ...w, ...bounds } : w)),
    }));
  },

  setDraggingWindowId: (id) => {
    set({ draggingWindowId: id });
  },

  setSnapFlyoutVisible: (visible) => {
    set({ isSnapFlyoutVisible: visible });
  },

  setHoveredSnapSlot: (slot) => {
    if (!slot) {
      set({ hoveredSnapSlot: null, snapPreviewBounds: null });
    } else {
      set({ hoveredSnapSlot: slot, snapPreviewBounds: getSnapSlotBounds(slot) });
    }
  },

  snapWindowToSlot: (id, slot) => {
    const { windows, nextZIndex } = get();
    const target = windows.find((w) => w.id === id);
    if (!target) return;

    const isMax = slot === "maximize";
    const bounds = getSnapSlotBounds(slot);

    set({
      nextZIndex: nextZIndex + 1,
      isSnapFlyoutVisible: false,
      hoveredSnapSlot: null,
      draggingWindowId: null,
      snapPreviewBounds: null,
      windows: windows.map((w) =>
        w.id === id
          ? {
              ...w,
              ...bounds,
              isMaximized: isMax,
              isMinimized: false,
              zIndex: nextZIndex + 1,
            }
          : w
      ),
      activeWindowId: id,
    });
  },

  areAllWindowsMinimized: () => {
    const { windows } = get();
    return windows.length > 0 && windows.every((w) => w.isMinimized);
  },

  toggleShowDesktop: () => {
    const { windows, lastVisibleWindowIds, areAllWindowsMinimized } = get();

    if (areAllWindowsMinimized()) {
      set({
        windows: windows.map((w) => ({
          ...w,
          isMinimized: !lastVisibleWindowIds.includes(w.id),
        })),
        activeWindowId: lastVisibleWindowIds[lastVisibleWindowIds.length - 1] || null,
      });
    } else {
      const visibleIds = windows.filter((w) => !w.isMinimized).map((w) => w.id);
      set({
        lastVisibleWindowIds: visibleIds.length > 0 ? visibleIds : ["dashboard"],
        windows: windows.map((w) => ({ ...w, isMinimized: true })),
        activeWindowId: null,
      });
    }
  },

  tileSideBySide: () => {
    const { windows, nextZIndex } = get();
    const activeList = windows.filter((w) => !w.isMinimized);
    if (activeList.length === 0) return;

    const desktopW = window.innerWidth;
    const desktopH = window.innerHeight - 72;
    const halfW = Math.floor(desktopW / 2);

    set({
      nextZIndex: nextZIndex + 1,
      windows: windows.map((w) => {
        if (w.id === activeList[0].id) {
          return { ...w, x: 0, y: 0, width: halfW, height: desktopH, isMaximized: false, isMinimized: false, zIndex: nextZIndex + 1 };
        }
        if (activeList[1] && w.id === activeList[1].id) {
          return { ...w, x: halfW, y: 0, width: halfW, height: desktopH, isMaximized: false, isMinimized: false, zIndex: nextZIndex + 1 };
        }
        return w;
      }),
    });
  },

  tileHorizontal: () => {
    const { windows, nextZIndex } = get();
    const activeList = windows.filter((w) => !w.isMinimized);
    if (activeList.length === 0) return;

    const desktopW = window.innerWidth;
    const desktopH = window.innerHeight - 72;
    const halfH = Math.floor(desktopH / 2);

    set({
      nextZIndex: nextZIndex + 1,
      windows: windows.map((w) => {
        if (w.id === activeList[0].id) {
          return { ...w, x: 0, y: 0, width: desktopW, height: halfH, isMaximized: false, isMinimized: false, zIndex: nextZIndex + 1 };
        }
        if (activeList[1] && w.id === activeList[1].id) {
          return { ...w, x: 0, y: halfH, width: desktopW, height: halfH, isMaximized: false, isMinimized: false, zIndex: nextZIndex + 1 };
        }
        return w;
      }),
    });
  },

  tileGrid: () => {
    const { windows, nextZIndex } = get();
    const activeList = windows.filter((w) => !w.isMinimized);
    if (activeList.length === 0) return;

    const desktopW = window.innerWidth;
    const desktopH = window.innerHeight - 72;
    const halfW = Math.floor(desktopW / 2);
    const halfH = Math.floor(desktopH / 2);

    const positions = [
      { x: 0, y: 0, w: halfW, h: halfH },
      { x: halfW, y: 0, w: halfW, h: halfH },
      { x: 0, y: halfH, w: halfW, h: halfH },
      { x: halfW, y: halfH, w: halfW, h: halfH },
    ];

    set({
      nextZIndex: nextZIndex + 4,
      windows: windows.map((w) => {
        const idx = activeList.findIndex((item) => item.id === w.id);
        if (idx >= 0 && idx < 4) {
          const p = positions[idx];
          return { ...w, x: p.x, y: p.y, width: p.w, height: p.h, isMaximized: false, isMinimized: false, zIndex: nextZIndex + idx };
        }
        return w;
      }),
    });
  },

  cascadeWindows: () => {
    const { windows, nextZIndex } = get();
    set({
      nextZIndex: nextZIndex + windows.length,
      windows: windows.map((w, index) => ({
        ...w,
        x: 30 + index * 35,
        y: 20 + index * 35,
        width: 880,
        height: 560,
        isMaximized: false,
        isMinimized: false,
        zIndex: nextZIndex + index,
      })),
    });
  },
}));

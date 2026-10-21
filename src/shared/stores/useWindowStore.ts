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

interface WindowState {
  windows: WindowItem[];
  activeWindowId: string | null;
  nextZIndex: number;

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
    bounds: Partial<Pick<WindowItem, "x" | "y" | "width" | "height">>
  ) => void;

  // Snap & Tiling Presets
  tileSideBySide: () => void;
  tileGrid: () => void;
  cascadeWindows: () => void;
  minimizeAll: () => void;
}

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
  isMaximized: false,
  closable: false,
};

export const useWindowStore = create<WindowState>((set, get) => ({
  windows: [DEFAULT_DASHBOARD_WINDOW],
  activeWindowId: "dashboard",
  nextZIndex: 11,

  openWindow: (item) => {
    const { windows, nextZIndex } = get();
    const existing = windows.find((w) => w.id === item.id);

    if (existing) {
      // Finestra già aperta: portala in primo piano e ripristina se minimizzata
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

    // Calcolo posizionamento a cascata per la nuova finestra
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
      isMaximized: false,
      closable: item.closable ?? true,
    };

    set({
      windows: [...windows, newWindow],
      activeWindowId: newWindow.id,
      nextZIndex: nextZIndex + 2,
    });
  },

  closeWindow: (id) => {
    const { windows, activeWindowId } = get();
    const target = windows.find((w) => w.id === id);
    if (!target || !target.closable) return;

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

  tileSideBySide: () => {
    const { windows, nextZIndex } = get();
    const activeList = windows.filter((w) => !w.isMinimized);
    if (activeList.length === 0) return;

    const desktopW = window.innerWidth;
    const desktopH = window.innerHeight - 80; // altezza disponibile al netto della barra superiore

    if (activeList.length === 1) {
      set({
        windows: windows.map((w) =>
          w.id === activeList[0].id
            ? { ...w, x: 20, y: 15, width: desktopW - 40, height: desktopH - 30, isMaximized: false }
            : w
        ),
      });
      return;
    }

    // Affianca le prime due finestre aperte 50% / 50%
    const halfW = Math.floor((desktopW - 30) / 2);
    set({
      nextZIndex: nextZIndex + 1,
      windows: windows.map((w) => {
        if (w.id === activeList[0].id) {
          return { ...w, x: 10, y: 10, width: halfW, height: desktopH - 20, isMaximized: false, isMinimized: false, zIndex: nextZIndex + 1 };
        }
        if (w.id === activeList[1].id) {
          return { ...w, x: halfW + 20, y: 10, width: halfW, height: desktopH - 20, isMaximized: false, isMinimized: false, zIndex: nextZIndex + 1 };
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
    const desktopH = window.innerHeight - 80;
    const halfW = Math.floor((desktopW - 30) / 2);
    const halfH = Math.floor((desktopH - 30) / 2);

    const positions = [
      { x: 10, y: 10, w: halfW, h: halfH },
      { x: halfW + 20, y: 10, w: halfW, h: halfH },
      { x: 10, y: halfH + 20, w: halfW, h: halfH },
      { x: halfW + 20, y: halfH + 20, w: halfW, h: halfH },
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

  minimizeAll: () => {
    set((state) => ({
      windows: state.windows.map((w) => ({ ...w, isMinimized: true })),
      activeWindowId: null,
    }));
  },
}));

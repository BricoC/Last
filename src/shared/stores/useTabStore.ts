import { create } from "zustand";

export interface TabItem {
  id: string;
  title: string;
  componentId: string;
  closable: boolean;
}

interface TabState {
  tabs: TabItem[];
  activeTabId: string;
  isSplit: boolean;
  splitTabId: string | null;
  splitDirection: "horizontal" | "vertical";

  // Actions
  openTab: (tab: Omit<TabItem, "closable"> & { closable?: boolean }) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  toggleSplit: (targetTabId?: string) => void;
  setSplitTab: (tabId: string | null) => void;
  setSplitDirection: (direction: "horizontal" | "vertical") => void;
}

const DEFAULT_TAB: TabItem = {
  id: "dashboard",
  title: "Dashboard",
  componentId: "dashboard",
  closable: false,
};

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [DEFAULT_TAB],
  activeTabId: "dashboard",
  isSplit: false,
  splitTabId: null,
  splitDirection: "horizontal",

  openTab: (newTab) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.id === newTab.id);

    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    const tabToAdd: TabItem = {
      ...newTab,
      closable: newTab.closable ?? true,
    };

    set({
      tabs: [...tabs, tabToAdd],
      activeTabId: tabToAdd.id,
    });
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId, splitTabId } = get();
    if (tabs.length <= 1) return; // Non chiudere l'ultima tab rimasta

    const newTabs = tabs.filter((t) => t.id !== tabId);
    let nextActiveId = activeTabId;

    if (activeTabId === tabId) {
      const closedIndex = tabs.findIndex((t) => t.id === tabId);
      const fallbackIndex = Math.max(0, closedIndex - 1);
      nextActiveId = newTabs[fallbackIndex]?.id || newTabs[0].id;
    }

    const nextSplitId = splitTabId === tabId ? null : splitTabId;

    set({
      tabs: newTabs,
      activeTabId: nextActiveId,
      splitTabId: nextSplitId,
      isSplit: nextSplitId !== null,
    });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  toggleSplit: (targetTabId) => {
    const { isSplit, activeTabId, tabs } = get();
    if (isSplit) {
      set({ isSplit: false, splitTabId: null });
    } else {
      // Se non specificata, apri una tab diversa da quella attiva se esiste
      const fallback = tabs.find((t) => t.id !== activeTabId)?.id || null;
      const secondTabId = targetTabId || fallback;
      set({ isSplit: secondTabId !== null, splitTabId: secondTabId });
    }
  },

  setSplitTab: (tabId) => {
    set({ splitTabId: tabId, isSplit: tabId !== null });
  },

  setSplitDirection: (direction) => {
    set({ splitDirection: direction });
  },
}));

/**
 * REGISTRO CENTRALE HOOKS — LAST GESTIONALE
 * Obbligo di consultazione prima di creare custom hooks.
 */

export interface HookRegistryEntry {
  name: string;
  category: "state" | "ui" | "data" | "device";
  path: string;
  description: string;
  returns: string;
}

export const HOOKS_REGISTRY: HookRegistryEntry[] = [
  {
    name: "useTabStore",
    category: "state",
    path: "src/shared/stores/useTabStore.ts",
    description: "Gestione globale delle schede aperte, della scheda attiva e della modalità split-screen.",
    returns: "{ tabs, activeTabId, isSplit, splitTabId, openTab, closeTab, setActiveTab, toggleSplit }",
  },
  {
    name: "useThemeStore",
    category: "state",
    path: "src/shared/stores/useThemeStore.ts",
    description: "Gestione del Theme Engine dinamico e applicazione immediata delle CSS Variables su :root.",
    returns: "{ theme, setTheme, resetTheme, applyToDom }",
  },
  {
    name: "useProductList",
    category: "data",
    path: "src/features/price-lists/hooks/useProductList.ts",
    description: "Hook di caricamento, ricerca e mutazione articoli con persistenza SQLite e Soft Delete.",
    returns: "{ products, loading, error, searchQuery, setSearchQuery, addProduct, updateProduct, deleteProduct, reload }",
  },
];

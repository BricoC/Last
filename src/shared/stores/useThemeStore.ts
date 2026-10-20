import { create } from "zustand";

export interface ThemeTokens {
  mode: "dark" | "light";
  primaryColor: string;
  backgroundColor: string;
  cardColor: string;
  textColor: string;
  borderColor: string;
  borderRadius: string;
}

const DEFAULT_THEME: ThemeTokens = {
  mode: "dark",
  primaryColor: "#3b82f6",
  backgroundColor: "#0f172a",
  cardColor: "#1e293b",
  textColor: "#f8fafc",
  borderColor: "#334155",
  borderRadius: "0.5rem",
};

interface ThemeState {
  theme: ThemeTokens;
  setTheme: (updates: Partial<ThemeTokens>) => void;
  resetTheme: () => void;
  applyToDom: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: DEFAULT_THEME,

  setTheme: (updates) => {
    const updated = { ...get().theme, ...updates };
    set({ theme: updated });
    get().applyToDom();
  },

  resetTheme: () => {
    set({ theme: DEFAULT_THEME });
    get().applyToDom();
  },

  applyToDom: () => {
    const { theme } = get();
    const root = document.documentElement;

    root.style.setProperty("--background", theme.backgroundColor);
    root.style.setProperty("--card", theme.cardColor);
    root.style.setProperty("--foreground", theme.textColor);
    root.style.setProperty("--primary", theme.primaryColor);
    root.style.setProperty("--border", theme.borderColor);
    root.style.setProperty("--radius", theme.borderRadius);
  },
}));

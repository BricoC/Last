import { create } from "zustand";

export type ThemePresetId = "grigio" | "nero-oled" | "avorio";

export interface ThemeTokens {
  preset: ThemePresetId;
  presetName: string;
  brightnessLevel: number; // 1 to 5 (solo per Grigio)
  primaryColor: string;
  backgroundColor: string;
  cardColor: string;
  cardHoverColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  borderRadius: string;
}

// Grigio L4 (Titanio Chiaro) — Tonalità neutra pulita predefinita
const THEME_GRIGIO_L4: ThemeTokens = {
  preset: "grigio",
  presetName: "Grigio",
  brightnessLevel: 4,
  primaryColor: "#3b82f6",
  backgroundColor: "#22242a",
  cardColor: "#2c3038",
  cardHoverColor: "#353a45",
  textColor: "#f3f4f6",
  mutedTextColor: "#9ca3af",
  borderColor: "#3e4350",
  borderRadius: "0.5rem",
};

interface ThemeState {
  theme: ThemeTokens;
  setTheme: (updates: Partial<ThemeTokens>) => void;
  setPreset: (preset: ThemePresetId) => void;
  setBrightness: (level: number) => void;
  resetTheme: () => void;
  applyToDom: () => void;
}

// Helper per generare tonalità Grigio per i 5 livelli di luminosità
function getGrigioTones(level: number) {
  switch (level) {
    case 1:
      return { bg: "#16171a", card: "#1e2024", border: "#2e3238" };
    case 2:
      return { bg: "#1a1c20", card: "#23262c", border: "#333842" };
    case 3:
      return { bg: "#1e2025", card: "#282b32", border: "#393e49" };
    case 4: // Default Titanio Chiaro
    default:
      return { bg: "#22242a", card: "#2c3038", border: "#3e4350" };
    case 5:
      return { bg: "#272a32", card: "#323742", border: "#464c5b" };
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: THEME_GRIGIO_L4,

  setTheme: (updates) => {
    const updated = { ...get().theme, ...updates };
    set({ theme: updated });
    get().applyToDom();
  },

  setPreset: (preset) => {
    let newTheme: ThemeTokens;
    if (preset === "grigio") {
      const tones = getGrigioTones(get().theme.brightnessLevel || 4);
      newTheme = {
        ...get().theme,
        preset: "grigio",
        presetName: "Grigio",
        backgroundColor: tones.bg,
        cardColor: tones.card,
        borderColor: tones.border,
        textColor: "#f3f4f6",
        mutedTextColor: "#9ca3af",
        primaryColor: "#3b82f6",
      };
    } else if (preset === "nero-oled") {
      newTheme = {
        ...get().theme,
        preset: "nero-oled",
        presetName: "Nero Assoluto (OLED)",
        backgroundColor: "#000000",
        cardColor: "#111111",
        cardHoverColor: "#1c1c1c",
        borderColor: "#262626",
        textColor: "#ffffff",
        mutedTextColor: "#888888",
        primaryColor: "#3b82f6",
      };
    } else {
      // Bianco / Avorio (Light theme pulito e riposante)
      newTheme = {
        ...get().theme,
        preset: "avorio",
        presetName: "Bianco Avorio",
        backgroundColor: "#f7f6f2",
        cardColor: "#ffffff",
        cardHoverColor: "#f0eee9",
        borderColor: "#ded9cf",
        textColor: "#1e232b",
        mutedTextColor: "#64748b",
        primaryColor: "#2563eb",
      };
    }
    set({ theme: newTheme });
    get().applyToDom();
  },

  setBrightness: (level) => {
    if (get().theme.preset === "grigio") {
      const tones = getGrigioTones(level);
      set({
        theme: {
          ...get().theme,
          brightnessLevel: level,
          backgroundColor: tones.bg,
          cardColor: tones.card,
          borderColor: tones.border,
        },
      });
      get().applyToDom();
    } else {
      set({ theme: { ...get().theme, brightnessLevel: level } });
    }
  },

  resetTheme: () => {
    set({ theme: THEME_GRIGIO_L4 });
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
    root.style.setProperty("--muted-foreground", theme.mutedTextColor);
  },
}));

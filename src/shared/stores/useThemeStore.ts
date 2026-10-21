import { create } from "zustand";

export type ThemePresetId = "grigio" | "nero-oled" | "avorio";

export interface ThemeTokens {
  preset: ThemePresetId;
  presetName: string;
  brightnessLevel: number; // 1 to 5 per tutti i temi
  primaryColor: string;
  backgroundColor: string;
  cardColor: string;
  cardHoverColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  borderRadius: string;
}

// 5 Livelli di tonalità per GRIGIO
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

// 5 Livelli di tonalità per BIANCO AVORIO (con testo scuro nitidissimo e contrasto perfetto)
function getAvorioTones(level: number) {
  switch (level) {
    case 1: // Bianco Puro / Avorio chiarissimo
      return { bg: "#ffffff", card: "#f8f9fa", border: "#e5e7eb" };
    case 2: // Avorio Luminoso
      return { bg: "#fcfbf7", card: "#ffffff", border: "#dedbd2" };
    case 3: // Avorio Standard Caldo (Default)
    default:
      return { bg: "#f7f5ef", card: "#ffffff", border: "#d6d1c5" };
    case 4: // Avorio Sabbia / Papiro
      return { bg: "#eeebe0", card: "#faf8f2", border: "#cbc5b6" };
    case 5: // Avorio Titanio Chiaro / Grigio Caldo
      return { bg: "#e5e1d4", card: "#f4f1e8", border: "#bfb8a6" };
  }
}

// 5 Livelli di tonalità per NERO ASSOLUTO (OLED)
function getNeroTones(level: number) {
  switch (level) {
    case 1: // Nero 100% puro
    default:
      return { bg: "#000000", card: "#0c0c0c", border: "#222222" };
    case 2:
      return { bg: "#070707", card: "#121212", border: "#282828" };
    case 3:
      return { bg: "#0e0e0e", card: "#181818", border: "#303030" };
    case 4:
      return { bg: "#141414", card: "#1f1f1f", border: "#383838" };
    case 5:
      return { bg: "#1a1a1a", card: "#252525", border: "#404040" };
  }
}

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

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: THEME_GRIGIO_L4,

  setTheme: (updates) => {
    const updated = { ...get().theme, ...updates };
    set({ theme: updated });
    get().applyToDom();
  },

  setPreset: (preset) => {
    const currentLevel = get().theme.brightnessLevel || 3;
    let newTheme: ThemeTokens;

    if (preset === "grigio") {
      const tones = getGrigioTones(get().theme.brightnessLevel || 4);
      newTheme = {
        ...get().theme,
        preset: "grigio",
        presetName: "Grigio",
        backgroundColor: tones.bg,
        cardColor: tones.card,
        cardHoverColor: "#353a45",
        borderColor: tones.border,
        textColor: "#f3f4f6",
        mutedTextColor: "#9ca3af",
        primaryColor: "#3b82f6",
      };
    } else if (preset === "nero-oled") {
      const tones = getNeroTones(currentLevel);
      newTheme = {
        ...get().theme,
        preset: "nero-oled",
        presetName: "Nero Assoluto (OLED)",
        backgroundColor: tones.bg,
        cardColor: tones.card,
        cardHoverColor: "#1c1c1c",
        borderColor: tones.border,
        textColor: "#ffffff",
        mutedTextColor: "#888888",
        primaryColor: "#3b82f6",
      };
    } else {
      // Bianco Avorio (Testo scuro carbone nitido, contrasto 100%)
      const tones = getAvorioTones(currentLevel);
      newTheme = {
        ...get().theme,
        preset: "avorio",
        presetName: "Bianco Avorio",
        backgroundColor: tones.bg,
        cardColor: tones.card,
        cardHoverColor: "#edeae1",
        borderColor: tones.border,
        textColor: "#111827", // Grigio antracite scurissimo (leggibilità assoluta)
        mutedTextColor: "#4b5563", // Contrasto morbido ma leggibile
        primaryColor: "#2563eb",
      };
    }

    set({ theme: newTheme });
    get().applyToDom();
  },

  setBrightness: (level) => {
    const { preset } = get().theme;
    let updatedTones: { bg: string; card: string; border: string };

    if (preset === "avorio") {
      updatedTones = getAvorioTones(level);
    } else if (preset === "nero-oled") {
      updatedTones = getNeroTones(level);
    } else {
      updatedTones = getGrigioTones(level);
    }

    set({
      theme: {
        ...get().theme,
        brightnessLevel: level,
        backgroundColor: updatedTones.bg,
        cardColor: updatedTones.card,
        borderColor: updatedTones.border,
      },
    });
    get().applyToDom();
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
    root.style.setProperty("--card-foreground", theme.textColor);
    root.style.setProperty("--popover", theme.cardColor);
    root.style.setProperty("--popover-foreground", theme.textColor);
    root.style.setProperty("--secondary", theme.cardHoverColor);
    root.style.setProperty("--secondary-foreground", theme.textColor);
    root.style.setProperty("--foreground", theme.textColor);
    root.style.setProperty("--primary", theme.primaryColor);
    root.style.setProperty("--border", theme.borderColor);
    root.style.setProperty("--radius", theme.borderRadius);
    root.style.setProperty("--muted-foreground", theme.mutedTextColor);
  },
}));

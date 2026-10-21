import { create } from "zustand";

export type ThemePresetId = "grigio" | "blu-notte" | "nero-oled" | "smeraldo" | "viola";

export interface AccentColorOption {
  id: string;
  name: string;
  color: string;
}

export const ACCENT_COLORS: AccentColorOption[] = [
  { id: "blu-cobalto", name: "Blu Cobalto", color: "#3b82f6" },
  { id: "ciano-cielo", name: "Ciano Cielo", color: "#06b6d4" },
  { id: "verde-petrolio", name: "Verde Petrolio", color: "#0d9488" },
  { id: "smeraldo", name: "Smeraldo", color: "#10b981" },
  { id: "ambra-oro", name: "Ambra Oro", color: "#f59e0b" },
  { id: "arancio-vivo", name: "Arancio Vivo", color: "#f97316" },
  { id: "rosa-carminio", name: "Rosa Carminio", color: "#f43f5e" },
  { id: "viola-ametista", name: "Viola Ametista", color: "#a855f7" },
  { id: "indaco-notte", name: "Indaco Notte", color: "#6366f1" },
  { id: "ardesia-neutro", name: "Ardesia Neutro", color: "#94a3b8" },
];

export interface ThemeTokens {
  preset: ThemePresetId;
  presetName: string;
  brightnessLevel: number; // 1 to 5
  primaryColor: string;
  backgroundColor: string;
  cardColor: string;
  cardHoverColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  borderRadius: string;
}

// Grigio L4 (Titanio Chiaro) — Tonalità neutra, pulita, priva di bluastro freddo, esattamente come da richiesta
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
  setAccentColor: (color: string) => void;
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
      };
    } else if (preset === "nero-oled") {
      newTheme = {
        ...get().theme,
        preset: "nero-oled",
        presetName: "Nero Assoluto (OLED)",
        backgroundColor: "#0a0a0a",
        cardColor: "#141414",
        borderColor: "#262626",
      };
    } else if (preset === "smeraldo") {
      newTheme = {
        ...get().theme,
        preset: "smeraldo",
        presetName: "Verde Smeraldo Notte",
        backgroundColor: "#0d1b17",
        cardColor: "#142621",
        borderColor: "#1d3830",
        primaryColor: "#10b981",
      };
    } else if (preset === "viola") {
      newTheme = {
        ...get().theme,
        preset: "viola",
        presetName: "Viola Ametista Notturno",
        backgroundColor: "#171224",
        cardColor: "#221b35",
        borderColor: "#342952",
        primaryColor: "#a855f7",
      };
    } else {
      // Blu Notte
      newTheme = {
        ...get().theme,
        preset: "blu-notte",
        presetName: "Blu Notte",
        backgroundColor: "#0f172a",
        cardColor: "#1e293b",
        borderColor: "#334155",
        primaryColor: "#3b82f6",
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

  setAccentColor: (color) => {
    set({ theme: { ...get().theme, primaryColor: color } });
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
    root.style.setProperty("--foreground", theme.textColor);
    root.style.setProperty("--primary", theme.primaryColor);
    root.style.setProperty("--border", theme.borderColor);
    root.style.setProperty("--radius", theme.borderRadius);
    root.style.setProperty("--muted-foreground", theme.mutedTextColor);
  },
}));

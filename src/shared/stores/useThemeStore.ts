import { create } from "zustand";

export type ThemePresetId = "grigio" | "nero-oled" | "avorio";

export interface ThemeTokens {
  preset: ThemePresetId;
  presetName: string;
  brightnessLevel: number; // 1 to 10 per tutti i temi
  primaryColor: string;
  backgroundColor: string;
  cardColor: string;
  cardHoverColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  borderRadius: string;
}

export interface ThemeTonePalette {
  bg: string;
  card: string;
  border: string;
}

export interface ThemeBrightnessOption {
  level: number;
  label: string;
  bg: string;
  card: string;
  border: string;
}

export function clampBrightnessLevel(level: number | undefined | null, fallback = 4): number {
  const num = Number(level);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(10, Math.max(1, Math.round(num)));
}

const GRIGIO_TONES: ThemeTonePalette[] = [
  { bg: "#131417", card: "#1b1d21", border: "#2a2e34" },
  { bg: "#16171a", card: "#1e2024", border: "#2e3238" },
  { bg: "#1a1c20", card: "#23262c", border: "#333842" },
  { bg: "#1e2025", card: "#282b32", border: "#393e49" },
  { bg: "#22242a", card: "#2c3038", border: "#3e4350" },
  { bg: "#272a32", card: "#323742", border: "#464c5b" },
  { bg: "#2c303a", card: "#383d4a", border: "#4e5566" },
  { bg: "#323642", card: "#3e4452", border: "#575f72" },
  { bg: "#383d4a", card: "#454b5b", border: "#60697d" },
  { bg: "#3f4554", card: "#4c5364", border: "#6a7389" },
];

const AVORIO_TONES: ThemeTonePalette[] = [
  { bg: "#ffffff", card: "#f8f9fa", border: "#e5e7eb" },
  { bg: "#fcfbf7", card: "#ffffff", border: "#dedbd2" },
  { bg: "#f7f5ef", card: "#ffffff", border: "#d6d1c5" },
  { bg: "#f2efe6", card: "#fcfbf7", border: "#cfc9bb" },
  { bg: "#eeebe0", card: "#faf8f2", border: "#cbc5b6" },
  { bg: "#e8e4d7", card: "#f6f4ec", border: "#c3bcac" },
  { bg: "#e2ddd0", card: "#f2efe5", border: "#bbb3a2" },
  { bg: "#dbd5c6", card: "#ede9dd", border: "#b2aa97" },
  { bg: "#d4cebd", card: "#e8e3d5", border: "#a9a08c" },
  { bg: "#ccc5b3", card: "#e2dccd", border: "#9f9681" },
];

const NERO_TONES: ThemeTonePalette[] = [
  { bg: "#000000", card: "#0a0a0a", border: "#1f1f1f" },
  { bg: "#050505", card: "#0f0f10", border: "#242426" },
  { bg: "#0a0a0b", card: "#141416", border: "#2a2a2d" },
  { bg: "#0f0f11", card: "#19191c", border: "#303034" },
  { bg: "#141417", card: "#1e1e22", border: "#36363b" },
  { bg: "#19191d", card: "#242429", border: "#3d3d43" },
  { bg: "#1e1e23", card: "#29292f", border: "#44444b" },
  { bg: "#232329", card: "#2f2f36", border: "#4c4c54" },
  { bg: "#28282f", card: "#34343c", border: "#54545d" },
  { bg: "#2e2e36", card: "#3a3a43", border: "#5d5d67" },
];

const GRIGIO_LABELS = [
  "L1 (Notte Fonda)", "L2 (Scuro Profondo)", "L3 (Grafite Scuro)", "L4 (Grafite Medio)",
  "L5 (Titanio — Consigliato)", "L6 (Titanio Chiaro)", "L7 (Acciaio)", "L8 (Ardesia)",
  "L9 (Grigio Chiaro)", "L10 (Massima Luminosità)",
];

const AVORIO_LABELS = [
  "L1 (Bianco Puro)", "L2 (Avorio Luminoso)", "L3 (Avorio Caldo — Consigliato)", "L4 (Crema Leggero)",
  "L5 (Avorio Sabbia)", "L6 (Papiro)", "L7 (Pietra Chiara)", "L8 (Lino)",
  "L9 (Tortora Chiaro)", "L10 (Avorio Intenso)",
];

const NERO_LABELS = [
  "L1 (Nero Assoluto 100%)", "L2 (Carbone Profondo)", "L3 (Carbone Scuro)", "L4 (Grafite Notte)",
  "L5 (Ossidiana)", "L6 (Antracite Scuro)", "L7 (Ardesia Scuro)", "L8 (Ebano)",
  "L9 (Fumo Scuro)", "L10 (Nero Morbido)",
];

export function getThemeTonePalette(preset: ThemePresetId, level: number): ThemeTonePalette {
  const idx = clampBrightnessLevel(level) - 1;
  if (preset === "avorio") return AVORIO_TONES[idx];
  if (preset === "nero-oled") return NERO_TONES[idx];
  return GRIGIO_TONES[idx];
}

export function getBrightnessLevelsForPreset(preset: ThemePresetId): ThemeBrightnessOption[] {
  const tones = preset === "avorio" ? AVORIO_TONES : preset === "nero-oled" ? NERO_TONES : GRIGIO_TONES;
  const labels = preset === "avorio" ? AVORIO_LABELS : preset === "nero-oled" ? NERO_LABELS : GRIGIO_LABELS;
  return tones.map((tone, idx) => ({
    level: idx + 1,
    label: labels[idx],
    ...tone,
  }));
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

const STORAGE_KEY = "last_theme_tokens";

function getInitialTheme(): ThemeTokens {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.preset && parsed.backgroundColor) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return THEME_GRIGIO_L4;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getInitialTheme(),

  setTheme: (updates) => {
    const updated = { ...get().theme, ...updates };
    set({ theme: updated });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
    get().applyToDom();
  },

  setPreset: (preset) => {
    const currentLevel = clampBrightnessLevel(get().theme.brightnessLevel, 4);
    const tones = getThemeTonePalette(preset, currentLevel);
    let newTheme: ThemeTokens;

    if (preset === "grigio") {
      newTheme = {
        ...get().theme,
        preset: "grigio",
        presetName: "Grigio",
        brightnessLevel: currentLevel,
        backgroundColor: tones.bg,
        cardColor: tones.card,
        cardHoverColor: "#353a45",
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
        brightnessLevel: currentLevel,
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
      newTheme = {
        ...get().theme,
        preset: "avorio",
        presetName: "Bianco Avorio",
        brightnessLevel: currentLevel,
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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newTheme)); } catch {}
    get().applyToDom();
  },

  setBrightness: (level) => {
    const { preset } = get().theme;
    const clamped = clampBrightnessLevel(level);
    const updatedTones = getThemeTonePalette(preset, clamped);

    const updatedTheme = {
      ...get().theme,
      brightnessLevel: clamped,
      backgroundColor: updatedTones.bg,
      cardColor: updatedTones.card,
      borderColor: updatedTones.border,
    };

    set({ theme: updatedTheme });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedTheme)); } catch {}
    get().applyToDom();
  },

  resetTheme: () => {
    set({ theme: THEME_GRIGIO_L4 });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(THEME_GRIGIO_L4)); } catch {}
    get().applyToDom();
  },

  applyToDom: () => {
    if (typeof document === "undefined") return;
    const { theme } = get();
    const root = document.documentElement;

    root.setAttribute("data-theme", theme.preset);
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

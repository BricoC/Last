import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type HistoryModalLimit = 300 | 600 | 1000 | 2500 | 5000 | 10000 | "tutti";

export interface AppSettingsState {
  historyModalLimit: HistoryModalLimit;
  setHistoryModalLimit: (limit: HistoryModalLimit) => void;
}

export const HISTORY_LIMIT_OPTIONS: { value: HistoryModalLimit; label: string; desc: string }[] = [
  { value: 300, label: "300", desc: "Super leggero" },
  { value: 600, label: "600", desc: "Veloce" },
  { value: 1000, label: "1.000 (Default)", desc: "Consigliato" },
  { value: 2500, label: "2.500", desc: "Esteso" },
  { value: 5000, label: "5.000", desc: "Molto esteso" },
  { value: 10000, label: "10.000", desc: "Completo" },
  { value: "tutti", label: "Tutti", desc: "Nessun limite SQL" },
];

export const useAppSettingsStore = create<AppSettingsState>()(
  persist(
    (set) => ({
      historyModalLimit: 1000,
      setHistoryModalLimit: (limit) => set({ historyModalLimit: limit }),
    }),
    {
      name: "last_app_settings",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

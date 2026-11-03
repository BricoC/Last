import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type HistoryModalLimit = 300 | 600 | 1000 | 2500 | 5000 | 10000 | "tutti";

export interface AppSettingsState {
  historyModalLimit: HistoryModalLimit;
  setHistoryModalLimit: (limit: HistoryModalLimit) => void;
}

export const HISTORY_LIMIT_OPTIONS: { value: HistoryModalLimit; label: string; desc: string }[] = [
  { value: "tutti", label: "Tutti (Consigliato)", desc: "Dati completi al 100%" },
  { value: 10000, label: "10.000", desc: "Molto esteso" },
  { value: 5000, label: "5.000", desc: "Esteso" },
  { value: 2500, label: "2.500", desc: "Medio" },
  { value: 1000, label: "1.000", desc: "Parziale" },
  { value: 600, label: "600", desc: "Veloce" },
  { value: 300, label: "300", desc: "Super leggero" },
];

export const useAppSettingsStore = create<AppSettingsState>()(
  persist(
    (set) => ({
      historyModalLimit: "tutti",
      setHistoryModalLimit: (limit) => set({ historyModalLimit: limit }),
    }),
    {
      name: "last_app_settings",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persistedState: any, version: number) => {
        // Se l'utente aveva la vecchia configurazione con limite 1000 o versione precedente, aggiorna a "tutti"
        if (version < 2 || !persistedState?.historyModalLimit || persistedState?.historyModalLimit === 1000) {
          return {
            ...persistedState,
            historyModalLimit: "tutti",
          };
        }
        return persistedState;
      },
    }
  )
);

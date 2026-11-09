import { create } from "zustand";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "up-to-date"
  | "error";

interface AppUpdaterState {
  status: UpdaterStatus;
  currentVersion: string;
  newVersion: string | null;
  releaseDate: string | null;
  releaseNotes: string | null;
  downloadProgress: number; // 0 - 100
  errorMessage: string | null;
  isModalOpen: boolean;
  pendingUpdate: Update | null;

  init: () => Promise<void>;
  checkForUpdates: (silent?: boolean) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restartApp: () => Promise<void>;
  openModal: () => void;
  dismissModal: () => void;
}

export const useAppUpdaterStore = create<AppUpdaterState>((set, get) => ({
  status: "idle",
  currentVersion: "0.1.0",
  newVersion: null,
  releaseDate: null,
  releaseNotes: null,
  downloadProgress: 0,
  errorMessage: null,
  isModalOpen: false,
  pendingUpdate: null,

  init: async () => {
    if (isTauri()) {
      try {
        const ver = await getVersion();
        set({ currentVersion: ver });
      } catch (e) {
        console.warn("[AppUpdater] Impossibile recuperare getVersion:", e);
      }
    }
  },

  checkForUpdates: async (silent = true) => {
    if (!isTauri()) {
      if (!silent) set({ status: "up-to-date", errorMessage: null });
      return;
    }

    set({ status: "checking", errorMessage: null });

    try {
      const update = await check();

      if (update && update.available) {
        set({
          pendingUpdate: update,
          newVersion: update.version,
          releaseDate: update.date || null,
          releaseNotes: update.body || null,
          status: "available",
        });

        // Scarica e prepara silenziosamente in background in stile Windows Update
        await get().downloadAndInstall();
      } else {
        set({ status: "up-to-date", pendingUpdate: null });
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[AppUpdater] Controllo aggiornamenti:", msg);
      if (silent) {
        // In modalità automatica silenziosa non disturbare l'utente se non c'è connessione o mancano release
        set({ status: "idle", errorMessage: null });
      } else {
        set({ status: "error", errorMessage: msg });
      }
    }
  },

  downloadAndInstall: async () => {
    const { pendingUpdate } = get();
    if (!pendingUpdate) return;

    set({ status: "downloading", downloadProgress: 0, errorMessage: null });

    try {
      let downloaded = 0;
      let total = 0;

      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength || 0;
          set({ downloadProgress: 0 });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            const pct = Math.min(Math.round((downloaded / total) * 100), 99);
            set({ downloadProgress: pct });
          }
        } else if (event.event === "Finished") {
          set({ downloadProgress: 100 });
        }
      });

      // Download completato con successo: pronto per il riavvio
      set({
        status: "ready",
        downloadProgress: 100,
        isModalOpen: true, // Mostra il popup di riavvio stile Windows Update
      });
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[AppUpdater] Errore download aggiornamento:", msg);
      set({ status: "error", errorMessage: msg });
    }
  },

  restartApp: async () => {
    if (!isTauri()) return;
    try {
      await relaunch();
    } catch (err) {
      console.error("[AppUpdater] Errore riavvio applicazione:", err);
    }
  },

  openModal: () => set({ isModalOpen: true }),
  dismissModal: () => set({ isModalOpen: false }),
}));


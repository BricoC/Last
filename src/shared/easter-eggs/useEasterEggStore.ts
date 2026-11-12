import { create } from "zustand";

interface EasterEggStore {
  isVaultUnlocked: boolean;
  unlockVault: () => void;

  // Nedry lock state
  isNedryLocked: boolean;
  setNedryLocked: (locked: boolean) => void;
  resetNedryLock: () => void;

  // Illidan cinematic state
  isIllidanPlaying: boolean;
  playIllidanCinematic: () => void;
  stopIllidanCinematic: () => void;

  // Vault Modal state
  isVaultOpen: boolean;
  openVault: () => void;
  closeVault: () => void;
}

export const useEasterEggStore = create<EasterEggStore>((set) => ({
  isVaultUnlocked: localStorage.getItem("last_easter_egg_vault_unlocked") === "true",
  unlockVault: () => {
    localStorage.setItem("last_easter_egg_vault_unlocked", "true");
    set({ isVaultUnlocked: true });
  },

  isNedryLocked: localStorage.getItem("last_nedry_locked") === "true",
  setNedryLocked: (locked: boolean) => {
    if (locked) {
      localStorage.setItem("last_nedry_locked", "true");
    } else {
      localStorage.removeItem("last_nedry_locked");
    }
    set({ isNedryLocked: locked });
  },
  resetNedryLock: () => {
    localStorage.removeItem("last_nedry_locked");
    set({ isNedryLocked: false });
  },

  isIllidanPlaying: false,
  playIllidanCinematic: () => set({ isIllidanPlaying: true }),
  stopIllidanCinematic: () => set({ isIllidanPlaying: false }),

  isVaultOpen: false,
  openVault: () => set({ isVaultOpen: true }),
  closeVault: () => set({ isVaultOpen: false }),
}));

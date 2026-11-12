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

  // MGS Alert state
  isMgsAlertActive: boolean;
  startMgsAlert: () => void;
  stopMgsAlert: () => void;

  // MGS Codec state
  isMgsCodecOpen: boolean;
  activeCodecFreq: string;
  openMgsCodec: (freq: string) => void;
  closeMgsCodec: () => void;

  // Street Fighter state
  streetFighterMove: "hadouken" | "shoryuken" | null;
  triggerStreetFighter: (move: "hadouken" | "shoryuken") => void;
  closeStreetFighter: () => void;

  // FF7 Victory state
  isFf7Active: boolean;
  triggerFf7: () => void;
  closeFf7: () => void;

  // FF9 Moguo state
  isFf9MoguoActive: boolean;
  ff9MoguoStage: number;
  triggerFf9Moguo: (explicitStage?: number) => void;
  closeFf9Moguo: () => void;

  // NieR: Automata state
  isNierActive: boolean;
  triggerNier: () => void;
  closeNier: () => void;

  // Metal Slug state
  isMetalSlugActive: boolean;
  triggerMetalSlug: () => void;
  closeMetalSlug: () => void;

  // Super Mario state
  isMarioActive: boolean;
  marioCoinsCount: number;
  triggerMario: () => void;
  hitMarioBlock: () => void;
  closeMario: () => void;

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

  isNedryLocked: false,
  setNedryLocked: (_locked: boolean) => {
    localStorage.removeItem("last_nedry_locked");
    set({ isNedryLocked: false });
  },
  resetNedryLock: () => {
    localStorage.removeItem("last_nedry_locked");
    set({ isNedryLocked: false });
  },

  isIllidanPlaying: false,
  playIllidanCinematic: () => set({ isIllidanPlaying: true }),
  stopIllidanCinematic: () => set({ isIllidanPlaying: false }),

  // MGS Alert
  isMgsAlertActive: false,
  startMgsAlert: () => set({ isMgsAlertActive: true }),
  stopMgsAlert: () => set({ isMgsAlertActive: false }),

  // MGS Codec
  isMgsCodecOpen: false,
  activeCodecFreq: "140.85",
  openMgsCodec: (freq: string) => set({ isMgsCodecOpen: true, activeCodecFreq: freq }),
  closeMgsCodec: () => set({ isMgsCodecOpen: false }),

  // Street Fighter
  streetFighterMove: null,
  triggerStreetFighter: (move: "hadouken" | "shoryuken") => set({ streetFighterMove: move }),
  closeStreetFighter: () => set({ streetFighterMove: null }),

  // FF7 Victory
  isFf7Active: false,
  triggerFf7: () => set({ isFf7Active: true }),
  closeFf7: () => set({ isFf7Active: false }),

  // FF9 Moguo
  isFf9MoguoActive: false,
  ff9MoguoStage: 0,
  triggerFf9Moguo: (explicitStage?: number) =>
    set((state) => ({
      isFf9MoguoActive: true,
      ff9MoguoStage: explicitStage !== undefined ? explicitStage : state.ff9MoguoStage,
    })),
  closeFf9Moguo: () =>
    set((state) => ({
      isFf9MoguoActive: false,
      ff9MoguoStage: (state.ff9MoguoStage + 1) % 4,
    })),

  // NieR: Automata
  isNierActive: false,
  triggerNier: () => set({ isNierActive: true }),
  closeNier: () => set({ isNierActive: false }),

  // Metal Slug
  isMetalSlugActive: false,
  triggerMetalSlug: () => set({ isMetalSlugActive: true }),
  closeMetalSlug: () => set({ isMetalSlugActive: false }),

  // Super Mario
  isMarioActive: false,
  marioCoinsCount: 0,
  triggerMario: () => set({ isMarioActive: true, marioCoinsCount: 0 }),
  hitMarioBlock: () =>
    set((state) => ({
      marioCoinsCount: Math.min(7, state.marioCoinsCount + 1),
    })),
  closeMario: () => set({ isMarioActive: false, marioCoinsCount: 0 }),

  isVaultOpen: false,
  openVault: () => set({ isVaultOpen: true }),
  closeVault: () => set({ isVaultOpen: false }),
}));

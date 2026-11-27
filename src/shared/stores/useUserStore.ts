import { create } from "zustand";
import {
  AppUser,
  AppUserService,
  hashPassword,
  isLegacyPasswordHash,
  verifyPassword,
} from "@/shared/services/appUserService";
import { useThemeStore } from "@/shared/stores/useThemeStore";

interface UserState {
  users: AppUser[];
  currentUser: AppUser | null;
  isLoading: boolean;
  loadError: string | null;
  pendingPasswordSwitch: AppUser | null;
  loadUsers: () => Promise<void>;
  requestSwitchUser: (userId: string) => Promise<boolean>;
  cancelPasswordSwitch: () => void;
  confirmPasswordSwitch: (password: string) => Promise<boolean>;
  switchUser: (userId: string) => void;
  setUserTheme: (
    userId: string,
    preset: "grigio" | "nero-oled" | "avorio",
    brightness?: number
  ) => Promise<void>;
  updateCurrentUserTopbarOrder: (order: string[]) => Promise<void>;
  setUserTopbarOrder: (userId: string, order: string[]) => Promise<void>;
  createUser: (userData: {
    name: string;
    station_name?: string;
    can_access_settings: boolean;
    can_access_ddt?: boolean;
    can_access_price_lists?: boolean;
    can_edit_price_lists?: boolean;
    can_edit_or_numbers?: boolean;
    can_manage_backups?: boolean;
    allowed_pages?: string[];
    theme_preset?: "grigio" | "nero-oled" | "avorio";
    theme_brightness?: number;
    password_hash?: string;
    require_password?: boolean;
  }) => Promise<AppUser>;
  updateUser: (user: AppUser) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
}

const failedPasswordAttempts = new Map<string, { count: number; lockedUntil: number }>();

export const useUserStore = create<UserState>((set, get) => ({
  users: [],
  currentUser: null,
  isLoading: true,
  loadError: null,
  pendingPasswordSwitch: null,

  loadUsers: async () => {
    set({ isLoading: true, loadError: null });
    try {
      const list = await AppUserService.getAllUsers();
      const activeId = AppUserService.getActiveUserId();
      let active = list.find((u) => u.id === activeId);
      if (!active && list.length > 0) {
        active = list[0];
        AppUserService.setActiveUserId(active.id);
      }

      // Applica il tema salvato della postazione attiva all'avvio
      if (active?.theme_preset) {
        const themeStore = useThemeStore.getState();
        if (active.theme_brightness) {
          themeStore.setBrightness(active.theme_brightness);
        }
        themeStore.setPreset(active.theme_preset);
      }

      // Se l'utente attivo è già autenticato in questa sessione (es. Admin ha già inserito la password),
      // manteniamo currentUser autenticato senza richiedere la password di nuovo quando si entra in Impostazioni!
      const current = get().currentUser;
      if (current && current.id === active?.id) {
        set({
          users: list,
          currentUser: active,
          pendingPasswordSwitch: null,
          isLoading: false,
          loadError: null,
        });
        return;
      }

      // Se invece non c'è ancora un utente autenticato (blocco all'avvio / refresh F5)
      // e l'utente attivo richiede password:
      if (active && active.require_password && active.password_hash) {
        set({
          users: list,
          currentUser: null,
          pendingPasswordSwitch: active,
          isLoading: false,
          loadError: null,
        });
      } else {
        set({
          users: list,
          currentUser: active || null,
          pendingPasswordSwitch: null,
          isLoading: false,
          loadError: null,
        });
      }
    } catch (e) {
      console.error("Errore caricamento utenti:", e);
      const msg = e instanceof Error ? e.message : String(e || "Errore lettura utenti dal database");
      set({
        users: [],
        currentUser: null,
        pendingPasswordSwitch: null,
        isLoading: false,
        loadError: msg,
      });
    }
  },

  requestSwitchUser: async (userId: string): Promise<boolean> => {
    const { users, currentUser, switchUser, pendingPasswordSwitch } = get();
    if (currentUser?.id === userId && !pendingPasswordSwitch) return true;
    const target = users.find((u) => u.id === userId);
    if (!target) return false;

    // Se l'utente richiede password ed è presente un hash
    if (target.require_password && target.password_hash) {
      set({ pendingPasswordSwitch: target });
      return false;
    }

    // Altrimenti passa subito senza password
    set({ pendingPasswordSwitch: null });
    switchUser(userId);
    return true;
  },

  cancelPasswordSwitch: () => {
    const { currentUser, users, switchUser } = get();
    if (!currentUser) {
      // Se non c'è un utente attivo autenticato (blocco all'avvio o F5),
      // cerca la prima postazione libera che non richiede password (es. Banco)
      const unprotected = users.find((u) => !u.require_password || !u.password_hash);
      if (unprotected) {
        set({ pendingPasswordSwitch: null });
        switchUser(unprotected.id);
        return;
      }
      return;
    }
    set({ pendingPasswordSwitch: null });
  },

  confirmPasswordSwitch: async (password: string): Promise<boolean> => {
    const { pendingPasswordSwitch } = get();
    if (!pendingPasswordSwitch) return false;

    const attemptState = failedPasswordAttempts.get(pendingPasswordSwitch.id);
    if (attemptState && Date.now() < attemptState.lockedUntil) {
      const waitSec = Math.ceil((attemptState.lockedUntil - Date.now()) / 1000);
      throw new Error(`Troppi tentativi errati. Riprova tra ${waitSec} secondi.`);
    }

    const ok = await verifyPassword(password, pendingPasswordSwitch.password_hash);
    if (!ok) {
      const nextCount = (attemptState?.count ?? 0) + 1;
      const delayMs = nextCount >= 3 ? Math.min(30_000, 1000 * 2 ** (nextCount - 3)) : 0;
      failedPasswordAttempts.set(pendingPasswordSwitch.id, {
        count: nextCount,
        lockedUntil: Date.now() + delayMs,
      });
      return false;
    }
    failedPasswordAttempts.delete(pendingPasswordSwitch.id);

    // Upgrade legacy SHA-256 only after it has authenticated successfully.
    // Persist before granting access so a failed DB write never silently keeps
    // the account on the weaker hash.
    if (isLegacyPasswordHash(pendingPasswordSwitch.password_hash)) {
      const upgradedUser: AppUser = {
        ...pendingPasswordSwitch,
        password_hash: await hashPassword(password),
      };
      await AppUserService.updateUser(upgradedUser);
      set((state) => ({
        users: state.users.map((u) => (u.id === upgradedUser.id ? upgradedUser : u)),
      }));
    }

    const verifiedTarget = get().users.find((u) => u.id === pendingPasswordSwitch.id) ?? pendingPasswordSwitch;
    AppUserService.setActiveUserId(verifiedTarget.id);
    set({ pendingPasswordSwitch: null, currentUser: verifiedTarget });
    if (verifiedTarget.theme_preset) {
      const themeStore = useThemeStore.getState();
      if (verifiedTarget.theme_brightness) {
        themeStore.setBrightness(verifiedTarget.theme_brightness);
      }
      themeStore.setPreset(verifiedTarget.theme_preset);
    }
    return true;
  },

  switchUser: (userId: string) => {
    const { users, currentUser } = get();
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    // Non consentire mai switch diretto su un utente protetto da password senza verifica
    if (target.require_password && target.password_hash && currentUser?.id !== target.id) {
      set({ pendingPasswordSwitch: target });
      return;
    }
    AppUserService.setActiveUserId(target.id);
    set({ currentUser: target });

    // Cambio tema istantaneo in base alle preferenze della postazione selezionata
    if (target.theme_preset) {
      const themeStore = useThemeStore.getState();
      if (target.theme_brightness) {
        themeStore.setBrightness(target.theme_brightness);
      }
      themeStore.setPreset(target.theme_preset);
    }
  },

  setUserTheme: async (userId: string, preset: "grigio" | "nero-oled" | "avorio", brightness = 4) => {
    const { users, currentUser } = get();
    const target = users.find((u) => u.id === userId);
    if (!target) return;

    const updatedUser: AppUser = {
      ...target,
      theme_preset: preset,
      theme_brightness: brightness,
    };

    await AppUserService.updateUser(updatedUser);
    const updatedList = users.map((u) => (u.id === userId ? updatedUser : u));
    set({
      users: updatedList,
      currentUser: currentUser?.id === userId ? updatedUser : currentUser,
    });

    if (currentUser?.id === userId) {
      const themeStore = useThemeStore.getState();
      themeStore.setBrightness(brightness);
      themeStore.setPreset(preset);
    }
  },

  updateCurrentUserTopbarOrder: async (order: string[]) => {
    const { currentUser, users } = get();
    if (!currentUser) return;
    const updatedUser: AppUser = {
      ...currentUser,
      topbar_order: order,
    };
    await AppUserService.updateUser(updatedUser);
    const updatedList = users.map((u) => (u.id === currentUser.id ? updatedUser : u));
    set({ users: updatedList, currentUser: updatedUser });
  },

  setUserTopbarOrder: async (userId: string, order: string[]) => {
    const { users, currentUser } = get();
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    const updatedUser: AppUser = {
      ...target,
      topbar_order: order,
    };
    await AppUserService.updateUser(updatedUser);
    const updatedList = users.map((u) => (u.id === userId ? updatedUser : u));
    set({
      users: updatedList,
      currentUser: currentUser?.id === userId ? updatedUser : currentUser,
    });
  },

  createUser: async (userData) => {
    if (!get().currentUser?.is_admin) {
      throw new Error("Solo un amministratore può creare nuovi utenti.");
    }
    const newUser = await AppUserService.createUser(userData);
    const { users } = get();
    const updated = [...users, newUser];
    set({ users: updated });
    return newUser;
  },

  updateUser: async (user: AppUser) => {
    if (!get().currentUser?.is_admin) {
      throw new Error("Solo un amministratore può modificare i profili utente.");
    }
    await AppUserService.updateUser(user);
    const { users, currentUser } = get();
    const updated = users.map((u) => (u.id === user.id ? user : u));
    set({
      users: updated,
      currentUser: currentUser?.id === user.id ? user : currentUser,
    });

    // Se l'utente aggiornato è quello attualmente attivo, applica l'eventuale tema aggiornato
    if (currentUser?.id === user.id && user.theme_preset) {
      const themeStore = useThemeStore.getState();
      if (user.theme_brightness) {
        themeStore.setBrightness(user.theme_brightness);
      }
      themeStore.setPreset(user.theme_preset);
    }
  },

  deleteUser: async (userId: string) => {
    const caller = get().currentUser;
    if (!caller?.is_admin && caller?.id !== userId) {
      throw new Error("Solo un amministratore può eliminare gli utenti.");
    }
    await AppUserService.deleteUser(userId);
    const { users, currentUser, pendingPasswordSwitch } = get();
    const updated = users.filter((u) => u.id !== userId);
    let nextCurrent = currentUser;
    let nextPending = pendingPasswordSwitch?.id === userId ? null : pendingPasswordSwitch;
    if (currentUser?.id === userId) {
      const unprotectedFallback = updated.find((u) => !u.require_password) || null;
      if (unprotectedFallback) {
        nextCurrent = unprotectedFallback;
        AppUserService.setActiveUserId(unprotectedFallback.id);
        if (unprotectedFallback.theme_preset) {
          const themeStore = useThemeStore.getState();
          if (unprotectedFallback.theme_brightness) {
            themeStore.setBrightness(unprotectedFallback.theme_brightness);
          }
          themeStore.setPreset(unprotectedFallback.theme_preset);
        }
      } else {
        // Non effettuare mai switch diretto su un account protetto da password (es. Admin)
        nextCurrent = null;
        nextPending = updated[0] || null;
      }
    }
    set({ users: updated, currentUser: nextCurrent, pendingPasswordSwitch: nextPending });
  },
}));

import { create } from "zustand";
import { AppUser, AppUserService, verifyPassword } from "@/shared/services/appUserService";
import { useThemeStore } from "@/shared/stores/useThemeStore";

interface UserState {
  users: AppUser[];
  currentUser: AppUser | null;
  isLoading: boolean;
  isSyncingCloud: boolean;
  lastCloudSync: Date | null;
  pendingPasswordSwitch: AppUser | null;
  loadUsers: () => Promise<void>;
  syncCloudUsers: () => Promise<void>;
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
    allowed_pages?: string[];
    theme_preset?: "grigio" | "nero-oled" | "avorio";
    theme_brightness?: number;
    password_hash?: string;
    require_password?: boolean;
  }) => Promise<AppUser>;
  updateUser: (user: AppUser) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  users: [],
  currentUser: null,
  isLoading: true,
  isSyncingCloud: false,
  lastCloudSync: null,
  pendingPasswordSwitch: null,

  loadUsers: async () => {
    set({ isLoading: true });
    try {
      // 1. Prova prima la sincronizzazione rapida da Supabase Cloud
      try {
        await AppUserService.syncWithCloud();
      } catch (syncErr) {
        console.warn("[useUserStore] Sincronizzazione Cloud non disponibile, uso cache locale:", syncErr);
      }

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

      // Se l'utente attivo richiede password, NON impostiamo currentUser all'avvio/F5:
      // Si attiva il blocco di sicurezza finché non viene immessa la password corretta
      if (active && active.require_password && active.password_hash) {
        set({
          users: list,
          currentUser: null,
          pendingPasswordSwitch: active,
          isLoading: false,
          lastCloudSync: new Date(),
        });
      } else {
        set({
          users: list,
          currentUser: active || null,
          pendingPasswordSwitch: null,
          isLoading: false,
          lastCloudSync: new Date(),
        });
      }
    } catch (e) {
      console.error("Errore caricamento utenti:", e);
      set({ isLoading: false });
    }
  },

  syncCloudUsers: async () => {
    set({ isSyncingCloud: true });
    try {
      await AppUserService.syncWithCloud();
      const list = await AppUserService.getAllUsers();
      const current = get().currentUser;
      if (current) {
        const active = list.find((u) => u.id === current.id) || current;
        set({
          users: list,
          currentUser: active,
          isSyncingCloud: false,
          lastCloudSync: new Date(),
        });
      } else {
        set({
          users: list,
          isSyncingCloud: false,
          lastCloudSync: new Date(),
        });
      }
    } catch (err) {
      console.error("[useUserStore] Errore sync cloud:", err);
      set({ isSyncingCloud: false });
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
    const { pendingPasswordSwitch, switchUser } = get();
    if (!pendingPasswordSwitch) return false;

    const ok = await verifyPassword(password, pendingPasswordSwitch.password_hash);
    if (ok) {
      const targetId = pendingPasswordSwitch.id;
      set({ pendingPasswordSwitch: null });
      switchUser(targetId);
      return true;
    }
    return false;
  },

  switchUser: (userId: string) => {
    const { users } = get();
    const target = users.find((u) => u.id === userId);
    if (target) {
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
    const newUser = await AppUserService.createUser(userData);
    const { users } = get();
    const updated = [...users, newUser];
    set({ users: updated });
    return newUser;
  },

  updateUser: async (user: AppUser) => {
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
    await AppUserService.deleteUser(userId);
    const { users, currentUser } = get();
    const updated = users.filter((u) => u.id !== userId);
    let nextCurrent = currentUser;
    if (currentUser?.id === userId) {
      nextCurrent = updated[0] || null;
      if (nextCurrent) {
        AppUserService.setActiveUserId(nextCurrent.id);
        if (nextCurrent.theme_preset) {
          const themeStore = useThemeStore.getState();
          if (nextCurrent.theme_brightness) {
            themeStore.setBrightness(nextCurrent.theme_brightness);
          }
          themeStore.setPreset(nextCurrent.theme_preset);
        }
      }
    }
    set({ users: updated, currentUser: nextCurrent });
  },
}));

import { create } from "zustand";
import { AppUser, AppUserService } from "@/shared/services/appUserService";
import { useThemeStore } from "@/shared/stores/useThemeStore";

interface UserState {
  users: AppUser[];
  currentUser: AppUser | null;
  isLoading: boolean;
  loadUsers: () => Promise<void>;
  switchUser: (userId: string) => void;
  setUserTheme: (
    userId: string,
    preset: "grigio" | "nero-oled" | "avorio",
    brightness?: number
  ) => Promise<void>;
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
  }) => Promise<AppUser>;
  updateUser: (user: AppUser) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  users: [],
  currentUser: null,
  isLoading: true,

  loadUsers: async () => {
    set({ isLoading: true });
    try {
      const list = await AppUserService.getAllUsers();
      const activeId = AppUserService.getActiveUserId();
      let active = list.find((u) => u.id === activeId);
      if (!active && list.length > 0) {
        active = list[0];
        AppUserService.setActiveUserId(active.id);
      }
      set({ users: list, currentUser: active || null, isLoading: false });

      // Applica il tema salvato della postazione attiva all'avvio
      if (active?.theme_preset) {
        const themeStore = useThemeStore.getState();
        if (active.theme_brightness) {
          themeStore.setBrightness(active.theme_brightness);
        }
        themeStore.setPreset(active.theme_preset);
      }
    } catch (e) {
      console.error("Errore caricamento utenti:", e);
      set({ isLoading: false });
    }
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

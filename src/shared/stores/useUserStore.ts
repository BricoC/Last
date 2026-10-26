import { create } from "zustand";
import { AppUser, AppUserService } from "@/shared/services/appUserService";

interface UserState {
  users: AppUser[];
  currentUser: AppUser | null;
  isLoading: boolean;
  loadUsers: () => Promise<void>;
  switchUser: (userId: string) => void;
  createUser: (userData: {
    name: string;
    station_name?: string;
    can_access_settings: boolean;
    can_access_ddt?: boolean;
    can_access_price_lists?: boolean;
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
      }
    }
    set({ users: updated, currentUser: nextCurrent });
  },
}));

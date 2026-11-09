import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUserStore } from "@/shared/stores/useUserStore";
import { AppUserService, AppUser, hashPassword } from "@/shared/services/appUserService";

describe("useUserStore Password Gate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useUserStore.setState({
      users: [],
      currentUser: null,
      pendingPasswordSwitch: null,
      isLoading: false,
    });
  });

  it("locks on startup/F5 if active user requires password", async () => {
    const adminHash = await hashPassword("admin123");
    const mockUsers: AppUser[] = [
      {
        id: "admin",
        name: "Admin",
        station_name: "PC Ufficio",
        can_access_settings: true,
        can_access_ddt: true,
        can_access_price_lists: true,
        can_edit_price_lists: true,
        can_edit_or_numbers: true,
        is_admin: true,
        allowed_pages: ["dashboard"],
        theme_preset: "grigio",
        theme_brightness: 4,
        require_password: true,
        password_hash: adminHash,
        created_at: new Date().toISOString(),
      },
      {
        id: "banco-1",
        name: "Banco",
        station_name: "Cassa",
        can_access_settings: false,
        can_access_ddt: true,
        can_access_price_lists: true,
        can_edit_price_lists: false,
        can_edit_or_numbers: false,
        is_admin: false,
        allowed_pages: ["dashboard"],
        theme_preset: "avorio",
        theme_brightness: 3,
        require_password: false,
        password_hash: "",
        created_at: new Date().toISOString(),
      },
    ];

    vi.spyOn(AppUserService, "getAllUsers").mockResolvedValue(mockUsers);
    vi.spyOn(AppUserService, "getActiveUserId").mockReturnValue("admin");
    vi.spyOn(AppUserService, "syncWithCloud").mockResolvedValue({ pulled: 0, pushed: 0, success: true });

    await useUserStore.getState().loadUsers();

    const state = useUserStore.getState();
    // currentUser MUST NOT be granted before typing the password
    expect(state.currentUser).toBeNull();
    // pendingPasswordSwitch must be set to Admin
    expect(state.pendingPasswordSwitch?.id).toBe("admin");
  });

  it("grants access when correct password is submitted", async () => {
    const adminHash = await hashPassword("admin123");
    const adminUser: AppUser = {
      id: "admin",
      name: "Admin",
      station_name: "PC Ufficio",
      can_access_settings: true,
      can_access_ddt: true,
      can_access_price_lists: true,
      can_edit_price_lists: true,
      can_edit_or_numbers: true,
      is_admin: true,
      allowed_pages: ["dashboard"],
      theme_preset: "grigio",
      theme_brightness: 4,
      require_password: true,
      password_hash: adminHash,
      created_at: new Date().toISOString(),
    };

    useUserStore.setState({
      users: [adminUser],
      currentUser: null,
      pendingPasswordSwitch: adminUser,
    });

    // Wrong password
    const wrongRes = await useUserStore.getState().confirmPasswordSwitch("errata");
    expect(wrongRes).toBe(false);
    expect(useUserStore.getState().currentUser).toBeNull();
    expect(useUserStore.getState().pendingPasswordSwitch?.id).toBe("admin");

    // Correct password
    const okRes = await useUserStore.getState().confirmPasswordSwitch("admin123");
    expect(okRes).toBe(true);
    expect(useUserStore.getState().currentUser?.id).toBe("admin");
    expect(useUserStore.getState().pendingPasswordSwitch).toBeNull();
  });

  it("switches to unprotected user if cancelled without active user (startup lock)", async () => {
    const adminHash = await hashPassword("admin123");
    const adminUser: AppUser = {
      id: "admin",
      name: "Admin",
      station_name: "PC Ufficio",
      can_access_settings: true,
      can_access_ddt: true,
      can_access_price_lists: true,
      can_edit_price_lists: true,
      can_edit_or_numbers: true,
      is_admin: true,
      allowed_pages: ["dashboard"],
      theme_preset: "grigio",
      theme_brightness: 4,
      require_password: true,
      password_hash: adminHash,
      created_at: new Date().toISOString(),
    };

    const bancoUser: AppUser = {
      id: "banco-1",
      name: "Banco",
      station_name: "Cassa",
      can_access_settings: false,
      can_access_ddt: true,
      can_access_price_lists: true,
      can_edit_price_lists: false,
      can_edit_or_numbers: false,
      is_admin: false,
      allowed_pages: ["dashboard"],
      theme_preset: "avorio",
      theme_brightness: 3,
      require_password: false,
      password_hash: "",
      created_at: new Date().toISOString(),
    };

    useUserStore.setState({
      users: [adminUser, bancoUser],
      currentUser: null,
      pendingPasswordSwitch: adminUser,
    });

    useUserStore.getState().cancelPasswordSwitch();

    // Must safely fallback to Banco
    expect(useUserStore.getState().currentUser?.id).toBe("banco-1");
    expect(useUserStore.getState().pendingPasswordSwitch).toBeNull();
  });

  it("does not re-prompt for password when already authenticated as Admin (e.g. entering Settings)", async () => {
    const adminHash = await hashPassword("admin123");
    const adminUser: AppUser = {
      id: "admin",
      name: "Admin",
      station_name: "PC Ufficio",
      can_access_settings: true,
      can_access_ddt: true,
      can_access_price_lists: true,
      can_edit_price_lists: true,
      can_edit_or_numbers: true,
      is_admin: true,
      allowed_pages: ["dashboard"],
      theme_preset: "grigio",
      theme_brightness: 4,
      require_password: true,
      password_hash: adminHash,
      created_at: new Date().toISOString(),
    };

    // User is already logged in as Admin
    useUserStore.setState({
      users: [adminUser],
      currentUser: adminUser,
      pendingPasswordSwitch: null,
    });

    vi.spyOn(AppUserService, "getAllUsers").mockResolvedValue([adminUser]);
    vi.spyOn(AppUserService, "getActiveUserId").mockReturnValue("admin");
    vi.spyOn(AppUserService, "syncWithCloud").mockResolvedValue({ pulled: 0, pushed: 0, success: true });

    // Entering Settings calls loadUsers()
    await useUserStore.getState().loadUsers();

    // Must remain authenticated without setting pendingPasswordSwitch!
    expect(useUserStore.getState().currentUser?.id).toBe("admin");
    expect(useUserStore.getState().pendingPasswordSwitch).toBeNull();
  });
});

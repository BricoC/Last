import { describe, it, expect } from "vitest";
import {
  isPageAllowedForUser,
  DEFAULT_ALLOWED_PAGES,
  ALL_APP_PAGE_MODULES,
  AppUser,
} from "../appUserService";

describe("isPageAllowedForUser", () => {
  const adminUser: AppUser = {
    id: "admin",
    name: "Admin",
    station_name: "PC Admin",
    can_access_settings: true,
    can_access_ddt: true,
    can_access_price_lists: true,
    can_edit_price_lists: true,
    can_edit_or_numbers: true,
    is_admin: true,
    allowed_pages: DEFAULT_ALLOWED_PAGES,
    theme_preset: "grigio",
    theme_brightness: 4,
    created_at: new Date().toISOString(),
  };

  const restrictedUser: AppUser = {
    id: "banco-1",
    name: "Banco 1",
    station_name: "Cassa 1",
    can_access_settings: false,
    can_access_ddt: true,
    can_access_price_lists: true,
    can_edit_price_lists: false,
    can_edit_or_numbers: false,
    is_admin: false,
    allowed_pages: ["dashboard", "ddt-studio"],
    theme_preset: "avorio",
    theme_brightness: 3,
    created_at: new Date().toISOString(),
  };

  it("admin has access to every single module", () => {
    for (const mod of ALL_APP_PAGE_MODULES) {
      expect(isPageAllowedForUser(adminUser, mod.id)).toBe(true);
    }
  });

  it("restricted user only has access to allowed pages", () => {
    expect(isPageAllowedForUser(restrictedUser, "dashboard")).toBe(true);
    expect(isPageAllowedForUser(restrictedUser, "ddt-studio")).toBe(true);
    expect(isPageAllowedForUser(restrictedUser, "orders")).toBe(false);
    expect(isPageAllowedForUser(restrictedUser, "or-numbers")).toBe(false);
    expect(isPageAllowedForUser(restrictedUser, "settings")).toBe(false);
  });

  it("denies access when user is null or undefined", () => {
    expect(isPageAllowedForUser(null, "dashboard")).toBe(false);
    expect(isPageAllowedForUser(undefined, "dashboard")).toBe(false);
  });

  it("denies settings access if can_access_settings is false, even if in allowed_pages", () => {
    const userWithSettingsInList: AppUser = {
      ...restrictedUser,
      allowed_pages: ["settings", "dashboard"],
      can_access_settings: false,
    };
    expect(isPageAllowedForUser(userWithSettingsInList, "settings")).toBe(false);
    expect(isPageAllowedForUser(userWithSettingsInList, "dashboard")).toBe(true);
  });
});


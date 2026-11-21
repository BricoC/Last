import { describe, it, expect } from "vitest";
import {
  isPageAllowedForUser,
  DEFAULT_ALLOWED_PAGES,
  ALL_APP_PAGE_MODULES,
  AppUser,
  hashPassword,
  isLegacyPasswordHash,
  verifyPassword,
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
    require_password: false,
    password_hash: "",
    topbar_order: DEFAULT_ALLOWED_PAGES,
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
    require_password: false,
    password_hash: "",
    topbar_order: DEFAULT_ALLOWED_PAGES,
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

  it("denies all pages when allowed_pages is explicitly empty (Deseleziona tutte) for non-admin", () => {
    const zeroAccessUser: AppUser = {
      ...restrictedUser,
      allowed_pages: [],
      can_access_settings: false,
    };
    for (const mod of ALL_APP_PAGE_MODULES) {
      expect(isPageAllowedForUser(zeroAccessUser, mod.id)).toBe(false);
    }
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

  it("creates salted PBKDF2 password hashes and verifies the right password", async () => {
    const hash = await hashPassword("segreto123");
    const secondHash = await hashPassword("segreto123");
    expect(hash).toMatch(/^pbkdf2-sha256\$600000\$/);
    expect(hash).not.toBe(secondHash);
    expect(isLegacyPasswordHash(hash)).toBe(false);
    expect(await verifyPassword("segreto123", hash)).toBe(true);
    expect(await verifyPassword("sbagliata", hash)).toBe(false);
  });

  it("continues accepting legacy SHA-256 hashes so they can be upgraded at login", async () => {
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode("segreto123"))
    );
    const legacyHash = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");

    expect(isLegacyPasswordHash(legacyHash)).toBe(true);
    expect(await verifyPassword("segreto123", legacyHash)).toBe(true);
    expect(await verifyPassword("sbagliata", legacyHash)).toBe(false);
  });

  it("fails verification when hash is empty or undefined", async () => {
    expect(await verifyPassword("segreto123", "")).toBe(false);
    expect(await verifyPassword("segreto123", undefined)).toBe(false);
    expect(await verifyPassword("segreto123", "pbkdf2-sha256$100000$invalid$invalid")).toBe(false);
  });
});


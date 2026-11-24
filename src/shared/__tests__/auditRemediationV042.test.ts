import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUserStore } from "@/shared/stores/useUserStore";
import { AppUserService, hashPassword, type AppUser } from "@/shared/services/appUserService";
import { isPositivePrice, money } from "@/shared/domain/monetaryValue";
import { calculateDdtTotals } from "@/features/ddt-studio/utils/ddtCalculations";
import { getOrStatus, type OrRow } from "@/features/or-numbers/types/orNumbers";

describe("Audit Remediation P0 (AUD-01, AUD-07, AUD-08, AUD-09, AUD-23, AUD-24)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useUserStore.setState({
      users: [],
      currentUser: null,
      pendingPasswordSwitch: null,
      isLoading: false,
    });
  });

  it("AUD-01: deleting the active non-admin user does not bypass Admin password lock", async () => {
    const adminHash = await hashPassword("admin-secret");
    const adminUser: AppUser = {
      id: "admin",
      name: "Admin",
      station_name: "Ufficio",
      can_access_settings: true,
      can_access_ddt: true,
      can_access_price_lists: true,
      can_edit_price_lists: true,
      can_edit_or_numbers: true,
      can_manage_backups: true,
      is_admin: true,
      allowed_pages: ["dashboard"],
      theme_preset: "grigio",
      theme_brightness: 4,
      require_password: true,
      password_hash: adminHash,
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const staffUser: AppUser = {
      ...adminUser,
      id: "staff-1",
      name: "Staff",
      is_admin: false,
      can_manage_backups: false,
      require_password: false,
      password_hash: "",
    };

    vi.spyOn(AppUserService, "deleteUser").mockResolvedValue();
    vi.spyOn(AppUserService, "setActiveUserId").mockImplementation(() => {});

    useUserStore.setState({
      users: [adminUser, staffUser],
      currentUser: staffUser,
      pendingPasswordSwitch: null,
      isLoading: false,
    });

    await useUserStore.getState().deleteUser("staff-1");

    expect(useUserStore.getState().currentUser).toBeNull();
    expect(useUserStore.getState().pendingPasswordSwitch?.id).toBe("admin");
  });

  it("AUD-09: getOrStatus preserves 'green' and 'yellow' even when hasMissingPrices is true", () => {
    const completed: OrRow = {
      id: "ddt-1",
      docNumber: 42,
      series: "A",
      date: "2026-11-20",
      client: "CARRARA SPA",
      destination: "CV7",
      orderReference: "OR-4500123",
      statusLog: "Inviato",
      hasMissingPrices: true,
    };
    expect(getOrStatus(completed)).toBe("green");

    const sent: OrRow = { ...completed, orderReference: "", statusLog: "Inviato" };
    expect(getOrStatus(sent)).toBe("yellow");

    const pendingUnpriced: OrRow = { ...completed, orderReference: "", statusLog: "" };
    expect(getOrStatus(pendingUnpriced)).toBe("unpriced");
  });

  it("AUD-24: isPositivePrice rejects negative values and calculateDdtTotals ignores negative-qty costs", () => {
    expect(isPositivePrice(money(-10))).toBe(false);
    expect(isPositivePrice(-5)).toBe(false);
    expect(isPositivePrice("-2.5")).toBe(false);
    expect(isPositivePrice(money(0))).toBe(false);
    expect(isPositivePrice(money(0.01))).toBe(true);

    const totals = calculateDdtTotals([
      {
        description: "Riga negativa",
        quantity: "-2",
        unit_price: money(10),
        purchase_price: money(5),
        vat_rate: 22,
      },
      {
        description: "Riga positiva",
        quantity: "2",
        unit_price: money(10),
        purchase_price: money(5),
        vat_rate: 22,
      },
    ]);

    expect(totals.totale_imponibile.toNumber()).toBe(20);
    expect(totals.totale_acquisto?.toNumber()).toBe(10);
  });

  it("AUD-11: getPendingOperationFailure tracks outbox failures and clears them once confirmed", async () => {
    const ops = [
      { sequence: 1, record_id: "r-1", action: "delete", payload: "{}", project_url: "https://proj-a.supabase.co" },
    ];
    const mockDb = {
      select: vi.fn().mockResolvedValue(ops),
      execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    };
    const dbMod = await import("@/shared/data-layer/database");
    vi.spyOn(dbMod, "getDatabase").mockResolvedValue(mockDb as never);

    const { flushPendingCloudOperations, getPendingOperationFailure } = await import(
      "@/shared/data-layer/pendingCloudOperations"
    );

    await flushPendingCloudOperations(
      "test_aud11",
      async () => {
        throw new Error("HTTP 500");
      },
      "https://proj-a.supabase.co",
    );
    expect(getPendingOperationFailure("test_aud11")).toContain("HTTP 500");

    await flushPendingCloudOperations(
      "test_aud11",
      async () => {},
      "https://proj-a.supabase.co",
    );
    expect(getPendingOperationFailure("test_aud11")).toBeNull();
  });

  it("AUD-02: direct switchUser('admin') cannot bypass Admin password gate", async () => {
    const adminHash = await hashPassword("admin-secret");
    const adminUser: AppUser = {
      id: "admin",
      name: "Admin",
      station_name: "Ufficio",
      can_access_settings: true,
      can_access_ddt: true,
      can_access_price_lists: true,
      can_edit_price_lists: true,
      can_edit_or_numbers: true,
      can_manage_backups: true,
      is_admin: true,
      allowed_pages: ["dashboard"],
      theme_preset: "grigio",
      theme_brightness: 4,
      require_password: true,
      password_hash: adminHash,
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const staffUser: AppUser = {
      ...adminUser,
      id: "staff-1",
      name: "Staff",
      is_admin: false,
      require_password: false,
      password_hash: "",
    };
    useUserStore.setState({ users: [adminUser, staffUser], currentUser: staffUser, pendingPasswordSwitch: null });

    useUserStore.getState().switchUser("admin");

    expect(useUserStore.getState().currentUser?.id).toBe("staff-1");
    expect(useUserStore.getState().pendingPasswordSwitch?.id).toBe("admin");
  });
});

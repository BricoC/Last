import { describe, expect, it, vi, beforeEach } from "vitest";

const { select, execute } = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({ select, execute })),
}));

import { useUserStore } from "@/shared/stores/useUserStore";

describe("useUserStore SQLite failure lock", () => {
  beforeEach(() => {
    select.mockReset();
    execute.mockReset();
    useUserStore.setState({
      users: [],
      currentUser: null,
      isLoading: false,
      loadError: null,
      pendingPasswordSwitch: null,
    });
  });

  it("never falls back to passwordless Admin when SQLite fails reading app_users", async () => {
    execute.mockResolvedValue({ rowsAffected: 0 });
    select.mockRejectedValue(new Error("database disk image is malformed"));

    await useUserStore.getState().loadUsers();

    const state = useUserStore.getState();
    expect(state.currentUser).toBeNull();
    expect(state.users).toEqual([]);
    expect(state.pendingPasswordSwitch).toBeNull();
    expect(state.loadError).toContain("malformed");
  });
});

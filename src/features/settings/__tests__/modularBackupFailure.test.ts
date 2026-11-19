import { describe, expect, it, vi, beforeEach } from "vitest";

const { invoke, select, execute } = vi.hoisted(() => ({
  invoke: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({ select, execute })),
}));

import { executeModularBackup } from "../services/backupService";

describe("executeModularBackup read failure safety", () => {
  beforeEach(() => {
    invoke.mockReset();
    select.mockReset();
    execute.mockReset();
  });

  it("fails explicitly, preserves previous backups, and skips rotation when a selected table read fails", async () => {
    select
      .mockRejectedValueOnce(new Error("SQLITE_CORRUPT: table unreadable"));

    const result = await executeModularBackup("C:\\Backups", ["clients"]);

    expect(result.success).toBe(false);
    expect(result.error).toContain("SQLITE_CORRUPT");
    expect(invoke).not.toHaveBeenCalledWith("write_backup_file", expect.anything());
    expect(invoke).not.toHaveBeenCalledWith("clean_old_backups", expect.anything());
  });
});

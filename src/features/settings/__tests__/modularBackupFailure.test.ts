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

import { checkAndExecuteDailyBackup, executeModularBackup, loadBackupConfig, saveBackupConfig } from "../services/backupService";

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

it("crea il backup giornaliero con soli preventivi e include la coda ordini nel file fisico", async () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key,value),
  });
  try {
    const queue = [{ id: "operation", targetId: "order", action: "insert", timestamp: "2026-11-20" }];
    store.set("last_order_offline_queue", JSON.stringify(queue));
    invoke.mockReset().mockImplementation(async cmd => cmd === "copy_database_file" ? 1024 : null);
    select.mockImplementation(async sql => [{ count: sql.includes("quotes") ? 1 : 0 }]);
    saveBackupConfig({ ...loadBackupConfig(), autoBackupType: "full", folderPath: "test-backups" });
    expect((await checkAndExecuteDailyBackup("Test")).ran).toBe(true);
    expect(invoke).toHaveBeenCalledWith("copy_database_file", {
      targetFilePath: expect.any(String), orderQueue: JSON.stringify(queue),
    });
    const result = await executeModularBackup("test-backups", ["orders"]);
    expect(result.success).toBe(true);
    const write = invoke.mock.calls.find(([cmd]) => cmd === "write_backup_file");
    expect(JSON.parse(write![1].content).orderQueue).toEqual(queue);
  } finally {
    vi.unstubAllGlobals();
  }
});

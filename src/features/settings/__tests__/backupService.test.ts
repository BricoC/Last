import { describe, it, expect, beforeEach } from "vitest";
import {
  BACKUP_CATEGORIES,
  loadBackupConfig,
  saveBackupConfig,
  type BackupConfig,
} from "../services/backupService";

// Mock per localStorage in ambiente di test Node
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

describe("backupService unit tests", () => {
  beforeEach(() => {
    (globalThis as any).localStorage = createLocalStorageMock();
  });

  it("include tutte le categorie fondamentali dell'applicativo", () => {
    const ids = BACKUP_CATEGORIES.map((c) => c.id);
    expect(ids).toContain("ddt");
    expect(ids).toContain("clients");
    expect(ids).toContain("price_lists");
    expect(ids).toContain("invoices");
    expect(ids).toContain("notes");
    expect(ids).toContain("offers");
    expect(ids).toContain("quotes");
    expect(ids).toContain("orders");
    expect(ids).toContain("settings");
  });

  it("carica la configurazione predefinita quando localStorage è vuoto", () => {
    const config = loadBackupConfig();
    expect(config.folderPath).toBe("D:\\BricoClassFiles\\OneDrive\\Last\\Backup");
    expect(config.autoDailyEnabled).toBe(true);
    expect(config.autoBackupType).toBe("full");
    expect(config.autoCategories.length).toBe(BACKUP_CATEGORIES.length);
    expect(config.lastRunDate).toBeNull();
  });

  it("salva e ricarica correttamente le impostazioni personalizzate di backup", () => {
    const custom: BackupConfig = {
      folderPath: "C:\\MieiBackup",
      autoDailyEnabled: false,
      autoBackupType: "modular",
      autoCategories: ["notes", "offers"],
      lastRunDate: "2026-11-07",
      lastRunTimestamp: "2026-11-07T10:00:00.000Z",
      lastRunBy: "Sam",
      maxHistoryCount: 15,
    };

    saveBackupConfig(custom);
    const loaded = loadBackupConfig();

    expect(loaded.folderPath).toBe("C:\\MieiBackup");
    expect(loaded.autoDailyEnabled).toBe(false);
    expect(loaded.autoBackupType).toBe("modular");
    expect(loaded.autoCategories).toEqual(["notes", "offers"]);
    expect(loaded.lastRunDate).toBe("2026-11-07");
    expect(loaded.lastRunBy).toBe("Sam");
    expect(loaded.maxHistoryCount).toBe(15);
  });
});

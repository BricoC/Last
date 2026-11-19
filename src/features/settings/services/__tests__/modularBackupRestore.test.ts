import { beforeEach, describe, expect, it, vi } from "vitest";
import { restoreModularBackup, type BackupPackage } from "../backupService";

const { invoke, select, execute } = vi.hoisted(() => ({
  invoke: vi.fn(), select: vi.fn(), execute: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({ select, execute })),
}));

const backup: BackupPackage = {
  app: "Last", version: "1.0", createdAt: "2026-01-01T00:00:00Z", type: "modular",
  selectedCategories: ["invoices"], tableCounts: {},
  tables: { supplier_invoices: [], supplier_invoice_items: [{ id: 1, invoice_id: null }] },
};

describe("Ripristino modulare", () => {
  beforeEach(() => {
    invoke.mockReset();
    execute.mockReset();
    select.mockReset().mockResolvedValue([{ name: "id", pk: 1 }, { name: "invoice_id", pk: 0 }]);
  });

  it("include la tabella vuota, salta la tabella assente e invia un solo batch", async () => {
    const result = await restoreModularBackup(backup, ["invoices"], "replace");
    expect(result).toEqual({ success: true, restoredCounts: { supplier_invoices: 0, supplier_invoice_items: 1 } });
    expect(execute).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("apply_local_database_batch", {
      validateReferencesAfterWrite: true,
      referenceTables: ["supplier_invoices", "supplier_invoice_items"],
      writes: [
        { sql: 'DELETE FROM "supplier_invoices"', params: [] },
        { sql: 'DELETE FROM "supplier_invoice_items"', params: [] },
        { sql: expect.stringContaining('INSERT INTO "supplier_invoice_items"'), params: [1, null] },
      ],
    });
  });

  it("non riporta conteggi confermati se il batch fallisce", async () => {
    invoke.mockRejectedValue("Errore simulato dopo il DELETE");
    await expect(restoreModularBackup(backup, ["invoices"], "replace")).resolves.toEqual({
      success: false, restoredCounts: {}, error: "Errore simulato dopo il DELETE",
    });
    expect(execute).not.toHaveBeenCalled();
  });
});

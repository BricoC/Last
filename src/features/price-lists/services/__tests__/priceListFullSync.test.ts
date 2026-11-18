import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { migrationTestDatabase } from "@/shared/data-layer/__tests__/migrationTestDatabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateCustomerPriceListUpgradeV22 } from "@/shared/data-layer/migrations/customerPriceListSchema";
import { migrateElectronicInvoicesSchemaV15 } from "@/shared/data-layer/migrations/electronicInvoicesSchema";
import { migratePendingCloudWritesV31 } from "@/shared/data-layer/migrations/pendingCloudWritesSchema";
import { migratePriceListsSchemaV11 } from "@/shared/data-layer/migrations/priceListSchema";
import { priceListSyncService } from "../priceListSyncService";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@/shared/data-layer/database", () => ({ getDatabase: vi.fn() }));

describe("Sincronizzazione completa listini", () => {
  let sqlite: DatabaseSync;
  let clientDescription: string;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(async () => {
    sqlite = new DatabaseSync(":memory:");
    const db = migrationTestDatabase(sqlite);
    await migratePriceListsSchemaV11(db);
    await migrateCustomerPriceListUpgradeV22(db);
    await migrateElectronicInvoicesSchemaV15(db);
    await migratePendingCloudWritesV31(db);
    sqlite.exec(`
      INSERT INTO listino_generale (id, descrizione, sync_revision) VALUES
        ('gen_1', 'Modifica locale', 'pending'),
        ('gen_3', 'Riga rimossa dal cloud', NULL),
        ('new_local', 'Nuovo locale', NULL);
      INSERT INTO listini_clienti (id, cliente, descrizione, sync_revision) VALUES
        ('cli_4', 'ACME', 'Modifica locale assente dal cloud', 'pending');
    `);
    invoke.mockReset().mockImplementation(async (command, request) => {
      if (command === "load_supabase_config") return { config: { projectUrl: "https://example.test", anonKey: "mock" } };
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        for (const { sql, params } of request.writes as { sql: string; params: SQLInputValue[] }[]) {
          const args = Object.fromEntries(params.map((value, index) => [`$${index + 1}`, value]));
          sqlite.prepare(sql).run(args);
        }
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    });
    clientDescription = "Riga cliente cloud";
    fetchMock.mockReset().mockImplementation(async (input) => {
      const table = new URL(String(input)).pathname.split("/").pop();
      const rows = table === "listino_generale"
        ? [{ id: 1, descrizione: "Vecchio cloud" }, { id: 2, descrizione: "Nuovo cloud" }]
        : table === "listini_clienti" ? [{ id: 5, cliente: "ACME", descrizione: clientDescription }] : [];
      return Response.json(rows, { headers: { "Content-Range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sqlite.close();
  });

  it("conserva righe nuove e modifiche pendenti, anche se assenti dal cloud", async () => {
    await priceListSyncService.syncAllFromSupabase();
    expect(sqlite.prepare("SELECT id, descrizione FROM listino_generale ORDER BY id").all()).toEqual([
      { id: "gen_1", descrizione: "Modifica locale" },
      { id: "gen_2", descrizione: "Nuovo cloud" },
      { id: "new_local", descrizione: "Nuovo locale" },
    ]);
    expect(sqlite.prepare("SELECT id FROM listini_clienti ORDER BY id").all()).toEqual([
      { id: "cli_4" }, { id: "cli_5" },
    ]);
  });

  it("richiede un unico batch e conserva entrambi i listini se il secondo fallisce", async () => {
    clientDescription = "rifiutata";
    sqlite.exec(`CREATE TRIGGER reject_cloud_row BEFORE INSERT ON listini_clienti
      WHEN NEW.descrizione = 'rifiutata' BEGIN SELECT RAISE(ABORT, 'Riga non valida'); END;`);
    await expect(priceListSyncService.syncAllFromSupabase()).rejects.toThrow("Riga non valida");
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "load_supabase_config", "apply_local_database_batch",
    ]);
    expect(sqlite.prepare("SELECT id FROM listino_generale ORDER BY id").all()).toEqual([
      { id: "gen_1" }, { id: "gen_3" }, { id: "new_local" },
    ]);
    expect(sqlite.prepare("SELECT id FROM listini_clienti").all()).toEqual([{ id: "cli_4" }]);
  });
});

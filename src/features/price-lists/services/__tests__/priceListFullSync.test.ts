import { migratePendingCloudOperationsV34 } from "@/shared/data-layer/migrations/pendingCloudOperationsSchema";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { migrationTestDatabase } from "@/shared/data-layer/__tests__/migrationTestDatabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateCustomerPriceListUpgradeV22 } from "@/shared/data-layer/migrations/customerPriceListSchema";
import { migrateElectronicInvoicesSchemaV15 } from "@/shared/data-layer/migrations/electronicInvoicesSchema";
import { migratePendingCloudWritesV31 } from "@/shared/data-layer/migrations/pendingCloudWritesSchema";
import { migratePriceListsSchemaV11 } from "@/shared/data-layer/migrations/priceListSchema";
import { priceListSyncService } from "../priceListSyncService";

vi.mock("@/shared/services/supabaseSession", () => ({
  supabaseFetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

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
    await db.addColumnIfMissing("listino_generale", "remote_sync_revision", "TEXT");
    await db.addColumnIfMissing("listini_clienti", "remote_sync_revision", "TEXT");
    sqlite.exec("CREATE TABLE clients (id TEXT PRIMARY KEY)");
    await migratePendingCloudOperationsV34(db);
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

  it("continua dopo una pagina corta finché ha scaricato tutte le righe", async () => {
    const fallback = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith("/listino_generale")) return fallback(input, init);
      const offset = Number(url.searchParams.get("offset"));
      return Response.json([{ id: offset + 1 }], { headers: { "Content-Range": `${offset}-${offset}/3` } });
    });

    await expect(priceListSyncService.syncAllFromSupabase()).resolves.toMatchObject({ generalCount: 3 });
    const generalRequests = fetchMock.mock.calls.map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname.endsWith("/listino_generale"));
    expect(generalRequests.map((url) => url.searchParams.get("offset"))).toEqual(["0", "1", "2"]);
    expect(sqlite.prepare("SELECT id FROM listino_generale ORDER BY id").all()).toEqual([
      { id: "gen_1" }, { id: "gen_2" }, { id: "gen_3" }, { id: "new_local" },
    ]);
  });

  it("interrompe una risposta incompleta senza applicare cancellazioni locali", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{ id: 1 }], { headers: { "Content-Range": "0-0/3" } }))
      .mockResolvedValueOnce(Response.json([], { headers: { "Content-Range": "*/3" } }));

    await expect(priceListSyncService.syncAllFromSupabase()).rejects.toThrow("Download incompleto");
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(["load_supabase_config"]);
    expect(sqlite.prepare("SELECT id FROM listino_generale ORDER BY id").all()).toEqual([
      { id: "gen_1" }, { id: "gen_3" }, { id: "new_local" },
    ]);
  });
  it("non reimporta una riga cancellata mentre l'operazione cloud è in coda", async () => {
    sqlite.exec(`INSERT INTO pending_cloud_operations (scope,record_id,action,payload)
      VALUES ('listino_generale','gen_2','trash','{}')`);
    await priceListSyncService.syncAllFromSupabase();
    expect(sqlite.prepare("SELECT id FROM listino_generale WHERE id='gen_2'").get()).toBeUndefined();
  });

});

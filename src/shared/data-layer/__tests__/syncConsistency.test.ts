import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import type { buildMigrationPlan } from "../migrationPlan";
import type { SqliteWrite } from "../localDatabaseBatch";
import { migrationTestDatabase } from "./migrationTestDatabase";
import { getDatabase } from "../database";
import { getDdtPullState, pullDdtChanges } from "@/features/ddt-studio/services/ddtCloudPull";
import { PriceListSyncService } from "@/features/price-lists/services/priceListSyncService";
import { readPriceListPullState } from "@/features/price-lists/services/priceListPullState";
import type { ListinoGeneraleRow } from "@/features/price-lists/models/priceList";
import { clientRepository } from "@/features/clients/services/clientRepository";
import { quoteRepository } from "@/features/quotes/services/quoteRepository";
import { cloudSyncStatusService } from "@/shared/services/cloudSyncStatusService";

const { invoke, get, fetch } = vi.hoisted(() => ({ invoke: vi.fn(), get: vi.fn(), fetch: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { get } }));
vi.mock("@/shared/services/supabaseSession", () => ({ supabaseFetch: fetch }));
vi.mock("@/shared/services/supabaseRealtimeSubscription", () => ({ createSupabaseRealtimeSubscription: () => () => {} }));

const sqlite = new DatabaseSync(":memory:");
const project = "https://sync.example.test";
const stamp = "2023-11-01T10:00:00.000Z";
const config = { config: { projectUrl: project, anonKey: "test" } };
const bind = (params: unknown[] = []) => Object.fromEntries(params.map((value, i) => [`$${i + 1}`, value as SQLInputValue]));
type Step = Awaited<ReturnType<typeof buildMigrationPlan>>[number];

beforeAll(async () => {
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = migrationTestDatabase(sqlite);
  get.mockReturnValue({
    select: async (sql: string, params?: unknown[]) => sqlite.prepare(sql).all(bind(params)),
    execute: async (sql: string, params?: unknown[]) => ({ rowsAffected: sqlite.prepare(sql).run(bind(params)).changes }),
  });
  invoke.mockImplementation(async (command: string, payload) => {
    if (command === "load_supabase_config") return config;
    if (command === "run_local_migrations") {
      for (const migration of payload.migrations) {
        if (migration.version === 39) {
          sqlite.exec(`
            ALTER TABLE supplier_invoices DROP COLUMN cloud_upload_pending;
            ALTER TABLE supplier_invoices DROP COLUMN cloud_uploaded_at;
            ALTER TABLE listino_generale DROP COLUMN sync_confirmed_at;
            ALTER TABLE listini_clienti DROP COLUMN sync_confirmed_at;
            INSERT INTO supplier_invoices(id,supplier_name,vat_number,doc_number,doc_date,year)
              VALUES (91,'Omonimo','IT00000000001','F1','2023-11-01',2023);
            UPDATE supplier_invoices SET project_url='${project}' WHERE id=91;
            INSERT INTO supplier_invoice_items(supplier_name,doc_number,doc_date,year,description)
              VALUES ('Omonimo','F1','2023-11-01',2023,'Riga preesistente');
          `);
        }
        for (const step of migration.steps as Step[]) {
          if (step.kind === "write") await migrations.execute(step.write.sql, step.write.params);
          else if (step.kind === "addColumn") await migrations.addColumnIfMissing(step.table, step.column, step.definition, step.backfill);
          else await migrations.requireEmpty(step.sql, step.message);
        }
      }
    }
    if (command === "apply_local_database_batch") {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        for (const write of payload.writes as SqliteWrite[]) {
          const result = sqlite.prepare(write.sql).run(bind(write.params));
          if (write.expectedRows != null && result.changes !== write.expectedRows) throw new Error("Riga cambiata");
        }
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  });
  await getDatabase();
});

afterEach(() => { fetch.mockReset(); vi.unstubAllGlobals(); });
afterAll(() => sqlite.close());

it("keeps one canonical price-list row and downloads revisions older than the local push", async () => {
  sqlite.exec(`
    CREATE TABLE price_list_pull_state(project_url TEXT,table_name TEXT,revision TEXT,PRIMARY KEY(project_url,table_name));
    INSERT INTO price_list_pull_state VALUES ('${project}','listino_generale','10'),('${project}','listini_vari','3');
    INSERT INTO listino_generale(id,descrizione,sync_revision) VALUES ('local-uuid','Edited locally','a'),('gen_77','Duplicate','');
    UPDATE listino_generale SET sync_revision=NULL WHERE id='gen_77';
  `);
  const downloadStarts: string[] = [];
  fetch.mockImplementation(async (target: string | URL, request?: RequestInit) => {
    const url = new URL(target);
    if (request?.method === "POST") return Response.json([{ id: 77, last_sync_revision: 30, updated_at: stamp }]);
    const cutoff = url.searchParams.get("last_sync_revision");
    downloadStarts.push(`${url.pathname} ${cutoff}`);
    if (url.pathname.endsWith("/listino_generale") && cutoff === "gt.10") {
      return Response.json([
        { id: 19, last_sync_revision: 20, descrizione: "Unseen", updated_at: stamp },
        { id: 77, last_sync_revision: 30, last_write_key: "local-uuid", descrizione: "Edited locally", updated_at: stamp },
      ]);
    }
    return Response.json([]);
  });
  const service = new PriceListSyncService();
  await expect(service.pushGeneralBatchToSupabase([{
    id: "local-uuid", source_table: "listino_generale", descrizione: "Edited locally", sync_revision: "a",
  } as ListinoGeneraleRow])).resolves.toMatchObject({ success: true });
  expect((await readPriceListPullState(project)).get("listino_generale")).toBe("10");
  await expect(service.syncIncrementalGeneralFromSupabase()).resolves.toMatchObject({ updatedCount: 2 });
  expect(downloadStarts).toContain("/rest/v1/listini_vari gt.3");
  expect(sqlite.prepare("SELECT id FROM listino_generale ORDER BY id").all().map((row) => row.id)).toEqual(["gen_19", "gen_77"]);
  expect((await readPriceListPullState(project)).get("listino_generale")).toBe("30");
});

it("flags missing remote rows even with newer local pending prices", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  sqlite.exec(`
    CREATE TABLE ddt_pull_state(project_url TEXT PRIMARY KEY,revision TEXT NOT NULL,initialized INTEGER NOT NULL DEFAULT 0);
    INSERT INTO ddt_pull_state VALUES ('${project}','0',1);
    INSERT INTO listino_generale(id,descrizione,updated_at,sync_revision) VALUES('unconfirmed','Pending','2099-01-01','r');
  `);
  fetch.mockImplementation(async (target: string | URL) => {
    const url = new URL(target);
    if (url.pathname.endsWith("last_ddt_revision")) return Response.json("0");
    if (url.pathname.endsWith("/listino_generale")) return Response.json([
      { last_sync_revision: 31, codice_articolo: "CLOUD", descrizione: "Missing locally", updated_at: stamp },
    ]);
    return Response.json([]);
  });
  await expect(cloudSyncStatusService.getStatus(true)).resolves.toMatchObject({
    hasPendingLocalChanges: true, hasPendingRemoteChanges: true, canAutoSync: true,
    remoteLatestListino: { code: "CLOUD" },
  });
});

it("propagates push errors while keeping failed writes pending", async () => {
  fetch.mockImplementation(async () => new Response(null, { status: 503 }));
  await expect(new PriceListSyncService().retryPendingChanges()).rejects.toThrow("HTTP 503");
  expect(sqlite.prepare("SELECT sync_revision FROM listino_generale WHERE id='unconfirmed'").get()?.sync_revision).toBe("r");
});

it("shows price-list trash changes waiting to upload even when remote downloads are current", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  sqlite.exec(`DELETE FROM listino_generale WHERE id='unconfirmed';
    INSERT INTO pending_cloud_operations(scope,record_id,action,payload,project_url)
      VALUES ('listino_generale','old-price','trash','{}','${project}');`);
  fetch.mockImplementation(async (target: string | URL) => new URL(target).pathname.endsWith("last_ddt_revision")
    ? Response.json("0") : Response.json([]));
  await expect(cloudSyncStatusService.getStatus(true)).resolves.toMatchObject({
    hasPendingLocalChanges: true, hasPendingRemoteChanges: false, canAutoSync: true,
    alignmentMessage: "Modifiche locali da inviare",
  });
  sqlite.exec("DELETE FROM pending_cloud_operations WHERE record_id='old-price'; DELETE FROM ddt_pull_state;");
});

it("rolls back a changed historical DDT on a line conflict, then retries and processes its tombstone", async () => {
  const doc = (id: string, numero: number, total = 1) => ({
    id, numero, anno: 2023, data: "2023-11-01", stato: "confermato", cliente: "Cliente",
    ultima_modifica: stamp, totale_documento: total, totale_imponibile: total, totale_iva: 0,
  });
  const line = (id: string) => ({ id, riga_nr: 1, descrizione: id, prezzo: 1, importo: 1, quantita: 1, iva_pct: 0 });
  const change = (header: ReturnType<typeof doc>, revision: string, lines: ReturnType<typeof line>[]) => ({
    id: header.id, revision, deletedAt: null, document: { header, lines },
  });
  const pages = (...batches: unknown[][]) => {
    for (const page of [...batches, []]) fetch.mockResolvedValueOnce(Response.json(page));
  };
  pages([change(doc("old", 1), "1", [line("old-line")]), change(doc("other", 2), "2", [line("other-line")])]);
  await pullDdtChanges(project, "test");
  pages([change(doc("old", 1, 99), "3", [line("other-line")])]);
  await expect(pullDdtChanges(project, "test")).rejects.toThrow("Riga cambiata");
  expect((await getDdtPullState(project)).revision).toBe("2");
  expect(sqlite.prepare("SELECT total_document_subunits FROM ddt_documents WHERE id='old'").get()?.total_document_subunits).toBe(100_000);
  expect(sqlite.prepare("SELECT id FROM ddt_items WHERE ddt_id='old' AND deleted_at IS NULL").get()?.id).toBe("old-line");
  fetch.mockReset();
  pages([change(doc("old", 1, 20), "3", [])], [{ id: "other", revision: "4", deletedAt: stamp, document: null }]);
  await expect(pullDdtChanges(project, "test")).resolves.toMatchObject({ updated: 1, deleted: 1 });
  expect(sqlite.prepare("SELECT id FROM ddt_items WHERE ddt_id='old' AND deleted_at IS NULL").get()).toBeUndefined();
  expect(sqlite.prepare("SELECT deleted_at FROM ddt_documents WHERE id='other'").get()?.deleted_at).toBe(stamp);
  expect((await getDdtPullState(project)).revision).toBe("4");
});

it("rolls back merged customer references when a later write fails", async () => {
  sqlite.exec(`
    INSERT INTO clients(id,business_name,created_at,updated_at,updated_by) VALUES
      ('preferred','Anagrafica','${stamp}','${stamp}','test'),('duplicate','Omonimo','${stamp}','${stamp}','test');
    INSERT INTO ddt_documents(id,year,doc_date,client_name,client_id,created_at,updated_at,updated_by)
      VALUES ('merge-ddt',2026,'2026-11-01','Omonimo','duplicate','${stamp}','${stamp}','test');
    INSERT INTO quotes(id,year,quote_date,client_name,client_id,created_at,updated_at,updated_by)
      VALUES ('merge-quote',2026,'2026-11-01','Omonimo','duplicate','${stamp}','${stamp}','test');
    CREATE TRIGGER reject_merge BEFORE UPDATE ON quotes WHEN NEW.id='merge-quote'
      BEGIN SELECT RAISE(ABORT,'Test di rollback'); END;
  `);
  await expect(clientRepository.mergeClients("preferred", ["duplicate"])).rejects.toThrow("Test di rollback");
  expect(sqlite.prepare("SELECT client_id FROM ddt_documents WHERE id='merge-ddt'").get()?.client_id).toBe("duplicate");
  expect(sqlite.prepare("SELECT deleted_at FROM clients WHERE id='duplicate'").get()?.deleted_at).toBeNull();
  sqlite.exec("DROP TRIGGER reject_merge");
  await expect(clientRepository.mergeClients("preferred", ["duplicate", "duplicate"])).resolves.toMatchObject({ id: "preferred" });
  expect(sqlite.prepare("SELECT client_id FROM quotes WHERE id='merge-quote'").get()?.client_id).toBe("preferred");
});

it("atomically reserves separate local quote numbers", async () => {
  const numbers = await Promise.all(Array.from({ length: 4 }, () => quoteRepository.generateNextQuoteNumber(2040)));
  expect(numbers.sort()).toEqual([1, 2, 3, 4]);
});

it("links legacy invoice lines during migration and permits two fiscal identities with the same name and number", () => {
  expect(sqlite.prepare("SELECT invoice_id FROM supplier_invoice_items WHERE description='Riga preesistente'").get()?.invoice_id).toBe(91);
  expect(sqlite.prepare(`SELECT issuer_key, cloud_upload_pending, cloud_uploaded_at, project_url
    FROM supplier_invoices WHERE id=91`).get()).toEqual({
    issuer_key: "vat:00000000001", cloud_upload_pending: 0, cloud_uploaded_at: null, project_url: project,
  });
  expect(sqlite.prepare("SELECT sync_confirmed_at FROM listino_generale LIMIT 1").get()).toBeDefined();
  expect(sqlite.prepare("SELECT 1 FROM pragma_table_info('listini_clienti') WHERE name='sync_confirmed_at'").get()).toBeDefined();
  sqlite.exec(`INSERT INTO supplier_invoices(supplier_name,issuer_key,vat_number,doc_number,doc_date,year)
    VALUES ('Omonimo','vat:00000000002','00000000002','F1','2023-11-01',2023)`);
  expect(sqlite.prepare("SELECT COUNT(*) AS count FROM supplier_invoices WHERE doc_number='F1'").get()?.count).toBe(2);
});

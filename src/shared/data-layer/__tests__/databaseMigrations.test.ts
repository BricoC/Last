import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { migrationTestDatabase } from "./migrationTestDatabase";
import type { buildMigrationPlan, MigrationDatabase } from "../migrationPlan";

const { invoke, get } = vi.hoisted(() => ({ invoke: vi.fn(), get: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { get } }));

type PlannedMigration = { version: number; steps: Awaited<ReturnType<typeof buildMigrationPlan>> };

async function runPlan(db: MigrationDatabase, migration: PlannedMigration) {
  for (const step of migration.steps) {
    switch (step.kind) {
      case "write": await db.execute(step.write.sql, step.write.params); break;
      case "addColumn": await db.addColumnIfMissing(step.table, step.column, step.definition, step.backfill); break;
      case "requireEmpty": await db.requireEmpty(step.sql, step.message); break;
    }
  }
}

it("prepara lo schema su un DB vuoto e ripara le colonne di versioni già registrate", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    const db = migrationTestDatabase(sqlite);
    let repair: PlannedMigration | undefined;
    get.mockReturnValue(db);
    invoke.mockImplementation(async (command, params?: { migrations: PlannedMigration[] }) => {
      if (command === "run_local_migrations") {
        for (const migration of params!.migrations) await runPlan(db, migration);
        repair = params!.migrations.find(({ version }) => version === 33);
      }
    });

    const { getDatabase } = await import("../database");
    await getDatabase();
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(["initialize_local_database", "run_local_migrations"]);
    expect(sqlite.prepare("SELECT id FROM email_settings").get()?.id).toBe("email_config");
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'note_deletions'").get()).toBeDefined();
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_ddt_number_year_active'").get()).toBeDefined();

    sqlite.exec(`UPDATE email_settings SET bank_to = 'saved@example.test';
      ALTER TABLE offers DROP COLUMN updated_by;
      ALTER TABLE company_settings DROP COLUMN sdi_code;`);
    await runPlan(db, repair!);
    expect(sqlite.prepare("SELECT name FROM pragma_table_info('offers') WHERE name = 'updated_by'").get()).toBeDefined();
    expect(sqlite.prepare("SELECT name FROM pragma_table_info('company_settings') WHERE name = 'sdi_code'").get()).toBeDefined();
    expect(sqlite.prepare("SELECT bank_to FROM email_settings").get()?.bank_to).toBe("saved@example.test");
  } finally {
    sqlite.close();
  }
});

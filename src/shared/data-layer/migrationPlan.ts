import type { SqliteWrite } from "./localDatabaseBatch";

export interface MigrationDatabase {
  execute(sql: string, params?: unknown[]): Promise<void>;
  addColumnIfMissing(table: string, column: string, definition: string, backfill?: string): Promise<void>;
  requireEmpty(sql: string, message: string): Promise<void>;
}

type MigrationStep =
  | { kind: "write"; write: SqliteWrite }
  | { kind: "addColumn"; table: string; column: string; definition: string; backfill?: string }
  | { kind: "requireEmpty"; sql: string; message: string };

export async function buildMigrationPlan(up: (db: MigrationDatabase) => Promise<void>): Promise<MigrationStep[]> {
  const steps: MigrationStep[] = [];
  await up({
    async execute(sql, params = []) { steps.push({ kind: "write", write: { sql, params } }); },
    async addColumnIfMissing(table, column, definition, backfill) {
      steps.push({ kind: "addColumn", table, column, definition, backfill });
    },
    async requireEmpty(sql, message) { steps.push({ kind: "requireEmpty", sql, message }); },
  });
  return steps;
}

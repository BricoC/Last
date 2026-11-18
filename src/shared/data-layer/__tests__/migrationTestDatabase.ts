import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { MigrationDatabase } from "../migrationPlan";

export function migrationTestDatabase(sqlite: DatabaseSync): MigrationDatabase {
  return {
    async execute(sql, params = []) {
      if (!params.length) sqlite.exec(sql);
      else sqlite.prepare(sql).run(Object.fromEntries(params.map((value, index) => [
        `$${index + 1}`, value as SQLInputValue,
      ])));
    },
    async addColumnIfMissing(table, column, definition, backfill) {
      const exists = sqlite.prepare("SELECT 1 FROM pragma_table_info(?) WHERE name = ?").get(table, column);
      if (!exists) {
        sqlite.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
        if (backfill) sqlite.exec(backfill);
      }
    },
    async requireEmpty(sql, message) {
      if (sqlite.prepare(sql).get()) throw new Error(message);
    },
  };
}

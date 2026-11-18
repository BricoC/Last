import { describe, it, expect, vi } from "vitest";
import { isSqliteBusyError, withSqliteBusyRetry } from "../database";

describe("database busy retry helpers", () => {
  it("recognizes SQLite locked/busy errors accurately", () => {
    expect(isSqliteBusyError(new Error("error returned from database: (code: 5) database is locked"))).toBe(true);
    expect(isSqliteBusyError("SQLITE_BUSY: database table is locked")).toBe(true);
    expect(isSqliteBusyError(new Error("UNIQUE constraint failed"))).toBe(false);
  });

  it("retries transient database-is-locked errors and resolves once available", async () => {
    let attempts = 0;
    const op = vi.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("error returned from database: (code: 5) database is locked");
      }
      return "ok";
    });

    const result = await withSqliteBusyRetry(op);
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry non-busy SQL errors", async () => {
    const op = vi.fn(async () => {
      throw new Error("no such table: missing");
    });

    await expect(withSqliteBusyRetry(op)).rejects.toThrow("no such table: missing");
    expect(op).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { invokeMock, isTauriMock, executeMock, selectMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(),
  executeMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}));

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({
    execute: executeMock,
    select: selectMock,
  })),
}));

import {
  syncClientRowsToLocalSqlite,
  type ParsedListinoClienteRow,
} from "../manualPriceListImportService";

function makeRow(idx: number): ParsedListinoClienteRow {
  return {
    cliente: `LIST_CLIENT_${idx}`,
    fileName: "CLIENT.xls",
    descrizione: `ART_${idx}`,
    prezzo_fattura: 10 + idx,
    prezzo_acquisto: 5,
    acquisto_old: "5 net",
    ricarico: 50,
    note: null,
    note1: null,
    note2: null,
    hasTextAcquisto: true,
  };
}

describe("syncClientRowsToLocalSqlite", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    isTauriMock.mockReset();
    executeMock.mockReset();
    selectMock.mockReset();
  });

  it("delegates bulk local sync to the atomic Rust command in chunks when running in Tauri", async () => {
    isTauriMock.mockReturnValue(true);
    invokeMock.mockResolvedValue({ updated: 0, inserted: 5000 });

    const rows = Array.from({ length: 5002 }, (_, i) => makeRow(i));
    const progressCalls: Array<[number, number]> = [];

    await syncClientRowsToLocalSqlite(rows, (processed, total) => {
      progressCalls.push([processed, total]);
    });

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock.mock.calls[0][0]).toBe("sync_client_price_lists_to_local");
    expect(invokeMock.mock.calls[0][1].rows).toHaveLength(5000);
    expect(invokeMock.mock.calls[1][1].rows).toHaveLength(2);
    expect(progressCalls).toEqual([
      [5000, 5002],
      [5002, 5002],
    ]);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("updates matched rows by primary key and inserts new rows with valid id in non-Tauri fallback", async () => {
    isTauriMock.mockReturnValue(false);
    selectMock.mockResolvedValue([
      { id: "cli_10", cliente: "LIST_CLIENT_0", descrizione: "ART_0" },
    ]);
    executeMock.mockResolvedValue({ rowsAffected: 1 });

    await syncClientRowsToLocalSqlite([makeRow(0), makeRow(1)]);

    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(executeMock.mock.calls[0][0]).toContain("UPDATE listini_clienti SET");
    expect(executeMock.mock.calls[0][1][8]).toBe("cli_10");
    expect(executeMock.mock.calls[1][0]).toContain("INSERT INTO listini_clienti");
    expect(typeof executeMock.mock.calls[1][1][0]).toBe("string");
    expect(executeMock.mock.calls[1][1][0]).not.toBe("");
  });
});

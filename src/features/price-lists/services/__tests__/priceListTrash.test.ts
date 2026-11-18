import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecute, mockSelect } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({
    execute: mockExecute,
    select: mockSelect,
  })),
}));

import { priceListRepository } from "../priceListRepository";

describe("PriceListRepository Trash Restore", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockSelect.mockReset();
    mockExecute.mockResolvedValue({ rowsAffected: 1 });
  });

  it("restoreFromClientTrash deletes from listini_clienti_cestino and inserts into listini_clienti", async () => {
    mockSelect.mockResolvedValueOnce([
      {
        id: "trash-item-1",
        cliente: "ROSSI",
        articolo: "ART1",
        descrizione: "Trapano",
        prezzo: "100,00",
        sconto: "10",
        netto: "90,00",
        um: "NR",
        fornitore: "HIKOKI",
        cod_fornitore: "HK1",
        acquisto_eur: "60,00",
        perc_acquisto: "50",
        ricarico: "50%",
        data_acquisto: "2026-11-01",
        acquisto_old: "",
        data_ref: "",
      },
    ]);

    const restored = await priceListRepository.restoreFromClientTrash("trash-item-1");

    expect(restored?.id).toBe("trash-item-1");
    const executedSql = mockExecute.mock.calls.map((c) => String(c[0]));
    expect(executedSql.some((sql) => /INSERT\s+INTO\s+listini_clienti\b/i.test(sql))).toBe(true);
    expect(executedSql).toContain("DELETE FROM listini_clienti_cestino WHERE id = $1;");
    expect(executedSql.some((sql) => /DELETE\s+FROM\s+listini_clienti\s+WHERE/i.test(sql))).toBe(false);
  });
});

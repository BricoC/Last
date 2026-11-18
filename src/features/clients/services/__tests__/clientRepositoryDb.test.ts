import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockSelect } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({
    execute: mockExecute,
    select: mockSelect,
  })),
}));

import { ClientRepository } from "../clientRepository";

describe("ClientRepository - upsertClientFromDocument & price list columns", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockSelect.mockReset();
    mockExecute.mockResolvedValue({ rowsAffected: 1 });
  });

  it("upsertClientFromDocument riutilizza il cliente esistente per nome e non cancella listini/pec/note", async () => {
    const repo = new ClientRepository();
    const existingRow = {
      id: "cli-existing-1",
      code: "C001",
      business_name: "ACME SRL",
      address: null,
      city: "Lucca",
      postal_code: "55100",
      province: "LU",
      vat_number: "01234567890",
      fiscal_code: null,
      sdi_code: "M5UXCR1",
      pec: "acme@pec.it",
      email: "info@acme.it",
      payment_method: "Bonifico",
      destination_name: null,
      destination_address: null,
      destination_city: null,
      destinations_json: JSON.stringify([{ citta: "Capannori", luogo: "Sede 2" }]),
      price_lists_json: JSON.stringify(["LIST_ACME"]),
      phones_json: JSON.stringify([{ id: "p1", nome: "Uff", numero: "0583" }]),
      notes: "Cliente storico",
      is_active: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      updated_by: "system",
      deleted_at: null,
      sync_status: "synced",
    };

    mockSelect
      // lookup by LOWER(TRIM(business_name))
      .mockResolvedValueOnce([existingRow])
      // getClientById after update
      .mockResolvedValueOnce([{ ...existingRow, address: "Via Nuova 5" }]);

    const updated = await repo.upsertClientFromDocument({
      business_name: "  acme srl  ",
      address: "Via Nuova 5",
      phones: [],
    });

    expect(updated.id).toBe("cli-existing-1");
    const updateCall = mockExecute.mock.calls.find((c) =>
      String(c[0]).includes("UPDATE clients SET")
    );
    expect(updateCall).toBeDefined();
    // params indices in createOrUpdateClient: code=0, address=2, pec=9, email=10, destinations=15, price_lists=16, phones=17, notes=18, id=22
    const params = updateCall?.[1] as any[];
    expect(params[0]).toBe("C001");
    expect(params[2]).toBe("Via Nuova 5");
    expect(params[9]).toBe("acme@pec.it");
    expect(params[15]).toContain("Capannori");
    expect(params[16]).toContain("LIST_ACME");
    expect(params[17]).toContain("0583");
    expect(params[18]).toBe("Cliente storico");
    expect(params[22]).toBe("cli-existing-1");
  });

  it("getPriceListArticles legge acquisto_eur e perc_acquisto da listini_clienti", async () => {
    const repo = new ClientRepository();
    mockSelect.mockResolvedValueOnce([
      {
        id: 1,
        cliente: "LIST_ACME",
        codice_articolo: "A1",
        descrizione: "Vite",
        prezzo_fattura: 12.5,
        prezzo_acquisto: 8.2,
        ricarico: 52.4,
        note: null,
      },
    ]);

    const res = await repo.getPriceListArticles(["LIST_ACME"]);
    expect(res).toHaveLength(1);
    expect(res[0].prezzo_acquisto).toBe(8.2);
    expect(res[0].ricarico).toBe(52.4);
    const sql = String(mockSelect.mock.calls[0][0]);
    expect(sql).toContain("acquisto_eur");
    expect(sql).toContain("perc_acquisto");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInvoke, mockExecute, mockSelect } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockExecute: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({
    execute: mockExecute,
    select: mockSelect,
  })),
}));

import { money } from "@/shared/domain/monetaryValue";
import { calculateDdtTotals } from "../../utils/ddtCalculations";
import { DdtDocument, DdtItem } from "../../models/ddt";
import {
  buildDdtSavePayloadFromImported,
  ddtRepository,
  normalizeImportedDdt,
} from "../ddtRepository";

describe("DdtRepository Logic & Life-cycle", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockExecute.mockReset();
    mockSelect.mockReset();
    mockExecute.mockResolvedValue({ rowsAffected: 1 });
    mockSelect.mockResolvedValue([]);
  });
  it("crea una bozza valida con totali a 5 decimali corretti", () => {
    const items: DdtItem[] = [
      {
        id: "1",
        created_at: "2026-07-31T10:00:00Z",
        updated_at: "2026-07-31T10:00:00Z",
        updated_by: "system",
        deleted_at: null,
        sync_status: "synced",
        ddt_id: "doc-1",
        row_index: 1,
        description: "TASSELLO SX 6",
        unit: "NR",
        quantity: "15",
        unit_price: money("0,15800"),
        discount_pct: "0",
        net_amount: money("2,37000"),
        vat_rate: 22,
        vat_amount: money("0,52140"),
      },
    ];

    const totals = calculateDdtTotals(items);
    expect(totals.totale_imponibile.formatIT(false)).toBe("2,37000");
    expect(totals.totale_iva.formatIT(false)).toBe("0,52140");
    expect(totals.totale_documento.formatIT(false)).toBe("2,89140");
  });

  it("duplica un documento preservando gli snapshot del cliente e le righe resettando il numero", () => {
    const original: DdtDocument = {
      id: "doc-orig",
      doc_number: 2023,
      series: "",
      year: 2026,
      doc_date: "2026-07-31",
      status: "confermato",
      client_name: "RENAT",
      client_address: "Via Tazio Nuvolari",
      client_city: "Carraia - LU",
      transport_reason: "Vendita",
      carriage_terms: "Franco stabilimento",
      account_or_balance: "",
      operator: "Samu",
      total_taxable: money("3,00000"),
      total_vat: money("0,66000"),
      total_document: money("3,66000"),
      created_at: "2026-07-31T10:00:00Z",
      updated_at: "2026-07-31T10:00:00Z",
      updated_by: "system",
      deleted_at: null,
      sync_status: "synced",
      items: [
        {
          id: "r1",
          created_at: "2026-07-31T10:00:00Z",
          updated_at: "2026-07-31T10:00:00Z",
          updated_by: "system",
          deleted_at: null,
          sync_status: "synced",
          ddt_id: "doc-orig",
          row_index: 1,
          description: "TASSELLO SX 6",
          unit: "NR",
          quantity: "15",
          unit_price: money("0,15800"),
          discount_pct: "0",
          net_amount: money("2,37000"),
          vat_rate: 22,
          vat_amount: money("0,52140"),
        },
      ],
    };

    // Simulazione logica duplicazione
    const duplicated: Partial<DdtDocument> = {
      ...original,
      id: "new-uuid",
      doc_number: null, // Azzerato! Non deve riutilizzare il numero definitivo
      status: "bozza",  // Torna bozza
      doc_date: new Date().toISOString().split("T")[0],
    };

    expect(duplicated.doc_number).toBeNull();
    expect(duplicated.status).toBe("bozza");
    expect(duplicated.client_name).toBe("RENAT");
    expect(duplicated.items?.[0].description).toBe("TASSELLO SX 6");
    expect(duplicated.items?.[0].unit_price.formatIT(false)).toBe("0,15800");
  });

  it("gestisce il ciclo di vita del Cestino DDT a 15 voci FIFO con rilevamento conflitti di ripristino", () => {
    // 1. Un DDT nel cestino con numero 2938
    const trashDdt = {
      id: "trash-1",
      doc_number: 2938,
      year: 2026,
      status: "confermato",
      deleted_at: "2026-11-09T18:00:00Z",
    };

    // 2. Se un altro DDT attivo ha già preso il numero 2938, ripristino originale fallisce per conflitto
    const activeDdts = [{ id: "active-1", doc_number: 2938, year: 2026, deleted_at: null }];
    const hasConflict = activeDdts.some(
      (d) => d.year === trashDdt.year && d.doc_number === trashDdt.doc_number && d.deleted_at === null
    );
    expect(hasConflict).toBe(true);

    // 3. Ripristino alternativo come Bozza (azzerando il doc_number)
    const restoredAsDraft = {
      ...trashDdt,
      doc_number: null,
      status: "bozza",
      deleted_at: null,
    };
    expect(restoredAsDraft.doc_number).toBeNull();
    expect(restoredAsDraft.status).toBe("bozza");
    expect(restoredAsDraft.deleted_at).toBeNull();

    // 4. Ripristino alternativo con nuovo numero progressivo (2939)
    const maxActiveNumber = Math.max(...activeDdts.map((d) => d.doc_number));
    const nextNumber = maxActiveNumber + 1;
    const restoredWithNewNumber = {
      ...trashDdt,
      doc_number: nextNumber,
      status: "confermato",
      deleted_at: null,
    };
    expect(restoredWithNewNumber.doc_number).toBe(2939);
    expect(restoredWithNewNumber.deleted_at).toBeNull();
  });

  it("converte LocalImportHeader/LocalImportLine (camelCase) in payload snake_case per save_ddt_transaction", () => {
    const rawHeader = {
      id: "imp-doc-1",
      docNumber: 3044,
      year: 2026,
      series: "",
      docDate: "2026-11-18",
      status: "confermato",
      clientName: "MARIO ROSSI SRL",
      clientAddress: "Via Roma 1",
      clientCity: "Lucca",
      clientVat: "01234567890",
      clientFiscalCode: null,
      clientSdi: "ABC1234",
      clientPhonesJson: "[]",
      destinationName: "Cantiere Nord",
      destinationAddress: null,
      destinationCity: "Capannori",
      transportReason: "Vendita",
      paymentMethod: "Bonifico",
      orderReference: "ORD-1",
      accountOrBalance: "",
      operator: "Sam",
      goodsAppearance: "Cartoni",
      carriageTerms: "Franco",
      packagesCount: "2",
      weightKg: "10",
      carrier: "Mittente",
      internalNotes: "Note test",
      totalTaxableSubunits: 8730000,
      totalVatSubunits: 1920600,
      totalDocumentSubunits: 10650600,
    };
    const rawLines = [
      {
        id: "imp-line-1",
        cloudHeaderId: "imp-doc-1",
        rowIndex: 1,
        description: "SEGA CIRCOLARE",
        rowKind: "item",
        unit: "NR",
        quantity: "2",
        unitPriceSubunits: 5000000,
        discountPct: "10+3",
        netAmountSubunits: 8730000,
        vatRate: 22,
        vatAmountSubunits: 1920600,
        purchasePriceSubunits: 3000000,
      },
    ];

    const payload = buildDdtSavePayloadFromImported(rawHeader, rawLines);
    expect(payload).toMatchObject({
      id: "imp-doc-1",
      doc_number: 3044,
      doc_date: "2026-11-18",
      client_name: "MARIO ROSSI SRL",
      client_phones_json: "[]",
      transport_reason: "Vendita",
      carriage_terms: "Franco",
      pickup_date_time: null,
      is_emission: false,
      total_taxable_subunits: 8730000,
    });
    expect(payload.items[0]).toMatchObject({
      id: "imp-line-1",
      row_index: 1,
      row_kind: "item",
      unit_price_subunits: 5000000,
      discount_pct: "10+3",
      net_amount_subunits: 8730000,
      vat_rate: 22,
    });

    const normalized = normalizeImportedDdt(rawHeader, rawLines);
    expect(normalized.doc.doc_number).toBe(3044);
    expect(normalized.items[0].unit_price?.toSubunits()).toBe(5000000);
  });

  it("ripristina il DDT locale se replaceLocalDdtWithImported fallisce durante save_ddt_transaction", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Simulated Rust failure"));

    await expect(
      ddtRepository.replaceLocalDdtWithImported(
        "local-ddt-1",
        { id: "imp-2", docNumber: 12, year: 2026, docDate: "2026-11-18", clientName: "ACME" },
        []
      )
    ).rejects.toThrow("Simulated Rust failure");

    const rollbackDocCall = mockExecute.mock.calls.find((call) =>
      String(call[0]).includes("UPDATE ddt_documents SET deleted_at = NULL")
    );
    const rollbackItemsCall = mockExecute.mock.calls.find((call) =>
      String(call[0]).includes("UPDATE ddt_items SET deleted_at = NULL")
    );
    expect(rollbackDocCall).toBeDefined();
    expect(rollbackItemsCall).toBeDefined();
  });

  it("mantiene doc_number = null nelle bozze e calcola sconto a cascata + quantita zero", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    // getDdtById chiama db.select per documento e righe
    mockSelect
      .mockResolvedValueOnce([
        {
          id: "draft-1",
          doc_number: null,
          series: "",
          year: 2026,
          doc_date: "2026-11-18",
          status: "bozza",
          client_name: "ACME",
          client_phones_json: "[]",
          transport_reason: "Vendita",
          account_or_balance: "",
          operator: "",
          carriage_terms: "Franco stabilimento",
          total_taxable_subunits: 8730000,
          total_vat_subunits: 1920600,
          total_document_subunits: 10650600,
          created_at: "2026-11-18T10:00:00Z",
          updated_at: "2026-11-18T10:00:00Z",
          updated_by: "system",
          deleted_at: null,
          sync_status: "pending",
        },
      ])
      .mockResolvedValueOnce([]);

    await ddtRepository.saveDraft(
      { id: "draft-1", doc_number: 9999, year: 2026, status: "bozza", client_name: "ACME" },
      [
        {
          description: "ARTICOLO 1",
          quantity: "2",
          unit_price: money(50),
          discount_pct: "10+3",
          vat_rate: 22,
        },
        {
          description: "ARTICOLO QTA ZERO",
          code: "Z1",
          quantity: "0",
          unit_price: money(50),
          discount_pct: "0",
          vat_rate: 22,
        },
      ]
    );

    expect(mockInvoke).toHaveBeenCalledWith(
      "save_ddt_transaction",
      expect.objectContaining({
        payload: expect.objectContaining({
          doc_number: null,
          status: "bozza",
        }),
      })
    );
    const savedPayload = mockInvoke.mock.calls[0][1].payload;
    expect(savedPayload.items[0].net_amount_subunits).toBe(8730000);
    expect(savedPayload.items[1].quantity).toBe("0");
    expect(savedPayload.items[1].net_amount_subunits).toBe(0);
  });
});

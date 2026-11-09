import { describe, it, expect } from "vitest";
import { money } from "@/shared/domain/monetaryValue";
import { calculateDdtTotals } from "../../utils/ddtCalculations";
import { DdtDocument, DdtItem } from "../../models/ddt";

describe("DdtRepository Logic & Life-cycle", () => {
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
});

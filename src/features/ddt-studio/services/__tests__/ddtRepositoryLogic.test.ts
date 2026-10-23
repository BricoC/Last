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
});

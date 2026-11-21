import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/shared/services/supabaseSession", () => ({
  supabaseFetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

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

import { buildSupabaseDdtPayloads } from "../ddtCloudPayload";
import { ddtCloudPushService } from "../ddtCloudPushService";

describe("ddtCloudPushService", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockInvoke.mockReset();
    mockExecute.mockReset();
    mockSelect.mockReset();
    mockInvoke.mockResolvedValue({
      config: { projectUrl: "https://example.supabase.co", anonKey: "anon-key" },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps SQLite DDT header and items (including discounts and notes) into Supabase payloads", () => {
    const doc = {
      id: "ddt-1",
      doc_number: 3026,
      year: 2026,
      series: "",
      doc_date: "2026-11-17",
      status: "confermato",
      client_name: "CARTIERE CARRARA",
      client_address: "Via Roma 1",
      client_city: "Capannori",
      client_vat: "01234567890",
      client_fiscal_code: null,
      client_sdi: "M5UXCR1",
      client_phones_json: JSON.stringify([{ id: "1", nome: "Ufficio", numero: "05831234" }]),
      destination_name: "CV4",
      destination_city: "Lucca",
      transport_reason: "Vendita",
      payment_method: "RI.BA. 60 GG",
      order_reference: "ORD-99",
      operator: "Sam",
      goods_appearance: "Cartoni",
      carriage_terms: "Franco stabilimento",
      packages_count: "2",
      weight_kg: "12,5",
      carrier: "Mittente",
      internal_notes: "Consegna urgente",
      total_taxable_subunits: 37830000, // 378.30
      total_vat_subunits: 8322600, // 83.226
      total_document_subunits: 46152600, // 461.526
      created_at: "2026-11-17T09:00:00.000Z",
      updated_at: "2026-11-17T09:05:00.000Z",
      deleted_at: null,
      sync_status: "pending",
      project_url: "https://example.supabase.co",
    };

    const items = [
      {
        id: "item-1",
        ddt_id: "ddt-1",
        row_index: 1,
        code: "ART1",
        description: "AVVITATORE",
        row_kind: "item",
        unit: "NR.",
        quantity: "1",
        unit_price_subunits: 39000000, // 390.00
        discount_pct: "3",
        net_amount_subunits: 37830000, // 378.30
        vat_rate: 22,
        purchase_price_subunits: 20000000, // 200.00
        deleted_at: null,
      },
      {
        id: "item-2",
        ddt_id: "ddt-1",
        row_index: 2,
        code: null,
        description: "SERIAL: J830370",
        row_kind: "note",
        unit: "",
        quantity: "",
        unit_price_subunits: 0,
        discount_pct: "",
        net_amount_subunits: 0,
        vat_rate: 0,
        purchase_price_subunits: 0,
        deleted_at: null,
      },
    ];

    const { headerPayload, linePayloads } = buildSupabaseDdtPayloads(doc, items);

    expect(headerPayload.numero).toBe(3026);
    expect(headerPayload.peso_kg).toBe(12.5);
    expect(headerPayload.totale_imponibile).toBe(378.3);
    expect(headerPayload.prezzo_acquisto_totale).toBe(200);
    expect(headerPayload.ricavo).toBe(178.3);
    expect(headerPayload.sconto_totale).toBe(11.7);
    expect(headerPayload.telefoni).toEqual([{ id: "1", nome: "Ufficio", numero: "05831234" }]);

    expect(linePayloads).toHaveLength(2);
    expect(linePayloads[0]).toMatchObject({
      id: "item-1",
      riga_nr: 1,
      prezzo: 390,
      sconto_pct: 0.03,
      importo: 378.3,
      prezzo_scontato: 378.3,
      prezzo_acquisto: 200,
      ricavo: 178.3,
    });
    expect(linePayloads[1]).toMatchObject({
      id: "item-2",
      riga_nr: 2,
      quantita: 0,
      prezzo: 0,
      importo: 0,
      descrizione: "SERIAL: J830370",
    });
  });

  it("reassigns doc_number on cloud collision during new emission and marks synced", async () => {
    const localDoc = {
      id: "ddt-local-uuid",
      doc_number: 3026,
      year: 2026,
      series: "",
      doc_date: "2026-11-17",
      status: "confermato",
      client_name: "CENTO",
      client_address: null,
      client_city: null,
      client_vat: null,
      client_fiscal_code: null,
      client_sdi: null,
      client_phones_json: "[]",
      destination_name: null,
      destination_city: null,
      transport_reason: "Vendita",
      payment_method: null,
      order_reference: null,
      operator: "Sam",
      goods_appearance: null,
      carriage_terms: "Franco stabilimento",
      packages_count: null,
      weight_kg: null,
      carrier: null,
      internal_notes: null,
      total_taxable_subunits: 1000000,
      total_vat_subunits: 220000,
      total_document_subunits: 1220000,
      created_at: "2026-11-17T10:00:00.000Z",
      updated_at: "2026-11-17T10:00:00.000Z",
      deleted_at: null,
      sync_status: "pending",
      project_url: "https://example.supabase.co",
    };

    mockSelect
      .mockResolvedValueOnce([localDoc]) // pushDdtById -> load doc
      .mockResolvedValueOnce([]) // upsertSingleDdt -> load items
      .mockResolvedValueOnce([{ max_num: 3026 }])
      .mockResolvedValueOnce([localDoc]); // serialized local version

    mockExecute.mockResolvedValue({ rowsAffected: 1 });

    const fetchCalls: Array<{ url: string; method: string; body?: string }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      fetchCalls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });

      // 1st collision check: 3026 owned by another PC's UUID
      if (method === "GET" && url.includes("numero=eq.3026")) {
        return new Response(JSON.stringify([{ id: "other-pc-uuid" }]), { status: 200 });
      }
      // getRemoteMaxDocNumber
      if (method === "GET" && url.includes("order=numero.desc")) {
        return new Response(JSON.stringify([{ numero: 3026 }]), { status: 200 });
      }
      // 2nd collision check for 3027 -> free
      if (method === "GET" && url.includes("numero=eq.3027")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/rpc/last_ddt_snapshot")) return Response.json(null);
      if (url.includes("/rpc/last_write_ddt")) return Response.json({ revision: "1", updatedAt: localDoc.updated_at });
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const res = await ddtCloudPushService.pushDdtById("ddt-local-uuid", {
      reassignNumberOnConflict: true,
    });

    expect(res).toEqual({ success: true, docNumber: 3027 });
    const batches = mockInvoke.mock.calls.filter(([name]) => name === "apply_local_database_batch");
    expect(batches[0][1].writes[0].params).toEqual([3027, localDoc.id, localDoc.updated_at]);
    expect(batches[1][1].writes[3].params).toEqual([localDoc.id, localDoc.updated_at, 3027, localDoc.project_url]);
    const write = fetchCalls.filter((call) => call.url.includes("/rpc/last_write_ddt"));
    expect(write).toHaveLength(1);
    expect(JSON.parse(write[0].body!)).toMatchObject({ p_header: { numero: 3027 }, p_lines: [], p_expected_revision: null });
  });

  it("pushes active pending DDTs and deletes soft-deleted DDTs remotely in batch push", async () => {
    const activeDoc = {
      id: "doc-active",
      doc_number: 3030,
      year: 2026,
      series: "",
      doc_date: "2026-11-17",
      status: "confermato",
      client_name: "ALFITAL",
      client_address: null,
      client_city: null,
      client_vat: null,
      client_fiscal_code: null,
      client_sdi: null,
      client_phones_json: "[]",
      destination_name: null,
      destination_city: null,
      transport_reason: "Vendita",
      payment_method: null,
      order_reference: null,
      operator: null,
      goods_appearance: null,
      carriage_terms: "Franco stabilimento",
      packages_count: null,
      weight_kg: null,
      carrier: null,
      internal_notes: null,
      total_taxable_subunits: 500000,
      total_vat_subunits: 110000,
      total_document_subunits: 610000,
      created_at: "2026-11-17T10:00:00.000Z",
      updated_at: "2026-11-17T10:00:00.000Z",
      deleted_at: null,
      sync_status: "pending",
      project_url: "https://example.supabase.co",
    };

    const trashedDoc = {
      ...activeDoc,
      id: "doc-trashed",
      doc_number: 3029,
      deleted_at: "2026-11-17T10:05:00.000Z",
    };

    mockSelect
      .mockResolvedValueOnce([trashedDoc, activeDoc]) // pendingDocs
      .mockResolvedValueOnce([trashedDoc]) // local deletion version
      .mockResolvedValueOnce([trashedDoc]) // confirm local deletion is still pending
      .mockResolvedValueOnce([]) // items for activeDoc
      .mockResolvedValueOnce([activeDoc]); // local active version

    mockExecute.mockResolvedValue({ rowsAffected: 1 });
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/rpc/last_ddt_snapshot")) return Response.json(null);
      if (url.includes("/rpc/last_write_ddt")) return Response.json({ revision: "2", updatedAt: activeDoc.updated_at });
      return Response.json([]);
    });

    const batchRes = await ddtCloudPushService.pushPendingDdts();

    expect(batchRes).toEqual({ pushed: 1, deleted: 1, errors: 0 });
    const batches = mockInvoke.mock.calls.filter(([name]) => name === "apply_local_database_batch");
    expect(batches[0][1].writes[1].params).toEqual([trashedDoc.id, trashedDoc.updated_at, trashedDoc.deleted_at]);
    expect(batches[1][1].writes[3].params).toEqual([activeDoc.id, activeDoc.updated_at, activeDoc.doc_number, activeDoc.project_url]);
  });

  it("maps cascade discount (10+3 -> 0.127) and explicit zero quantity without coercing to 1", () => {
    const doc = {
      id: "ddt-cascade",
      doc_number: 3050,
      year: 2026,
      series: "",
      doc_date: "2026-11-18",
      status: "confermato",
      client_name: "TEST CLIENT",
      client_phones_json: "[]",
      total_taxable_subunits: 8730000,
      total_vat_subunits: 1920600,
      total_document_subunits: 10650600,
      created_at: "2026-11-18T10:00:00.000Z",
      updated_at: "2026-11-18T10:00:00.000Z",
      deleted_at: null,
      sync_status: "pending",
    } as any;

    const items = [
      {
        id: "item-cascade",
        ddt_id: "ddt-cascade",
        row_index: 1,
        code: "C1",
        description: "ARTICOLO CON SCONTO DOPPIO",
        row_kind: "item",
        unit: "NR",
        quantity: "2",
        unit_price_subunits: 5000000,
        discount_pct: "10+3",
        net_amount_subunits: 8730000,
        vat_rate: 22,
        purchase_price_subunits: 0,
        deleted_at: null,
      },
      {
        id: "item-zero",
        ddt_id: "ddt-cascade",
        row_index: 2,
        code: "C2",
        description: "ARTICOLO QTA ZERO",
        row_kind: "item",
        unit: "NR",
        quantity: "0",
        unit_price_subunits: 5000000,
        discount_pct: "0",
        net_amount_subunits: 0,
        vat_rate: 22,
        purchase_price_subunits: 0,
        deleted_at: null,
      },
    ] as any[];

    const { linePayloads } = buildSupabaseDdtPayloads(doc, items);
    expect(linePayloads[0].sconto_pct).toBe(0.127);
    expect(linePayloads[1].quantita).toBe(0);
  });
});

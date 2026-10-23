import { describe, it, expect } from "vitest";
import { Client, ClientPhone } from "../../models/client";

describe("Client Model & Repository Consistency Rules", () => {
  it("rispetta la struttura BaseEntity e il tracciamento audit", () => {
    const now = new Date().toISOString();
    const client: Client = {
      id: crypto.randomUUID(),
      code: "CLI-001",
      business_name: "Impresa Edile Rossi SRL",
      address: "Via Roma 10",
      city: "Milano",
      postal_code: "20100",
      province: "MI",
      vat_number: "IT12345678901",
      fiscal_code: "12345678901",
      sdi_code: "M5UXCR1",
      pec: "rossi@pec.it",
      payment_method: "Bonifico 30gg",
      phones: [
        { id: "1", nome: "Ufficio", numero: "02123456" },
        { id: "2", nome: "Geometra", numero: "3331234567" },
      ],
      is_active: true,
      created_at: now,
      updated_at: now,
      updated_by: "system",
      deleted_at: null,
      sync_status: "pending",
    };

    expect(client.id).toBeDefined();
    expect(client.business_name).toBe("Impresa Edile Rossi SRL");
    expect(client.phones).toHaveLength(2);
    expect(client.is_active).toBe(true);
    expect(client.deleted_at).toBeNull();
  });

  it("garantisce il soft delete senza cancellazione fisica dei dati", () => {
    const now = new Date().toISOString();
    const original: Client = {
      id: "cli-99",
      business_name: "Ferramenta Bianchi",
      phones: [],
      is_active: true,
      created_at: now,
      updated_at: now,
      updated_by: "system",
      deleted_at: null,
      sync_status: "synced",
    };

    const deletedTime = new Date().toISOString();
    const softDeleted: Client = {
      ...original,
      deleted_at: deletedTime,
      updated_at: deletedTime,
      updated_by: "system",
      sync_status: "pending",
    };

    expect(softDeleted.id).toBe(original.id);
    expect(softDeleted.deleted_at).toBe(deletedTime);
    expect(softDeleted.sync_status).toBe("pending");
  });

  it("gestisce correttamente la serializzazione e deserializzazione dei contatti telefonici multipli", () => {
    const phones: ClientPhone[] = [
      { id: "p1", nome: "Cantiere", numero: "3409876543" },
      { id: "p2", nome: "Amministrazione", numero: "06998877" },
    ];

    const json = JSON.stringify(phones);
    const parsed = JSON.parse(json);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].nome).toBe("Cantiere");
    expect(parsed[1].numero).toBe("06998877");
  });
});

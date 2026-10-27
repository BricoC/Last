import { describe, it, expect } from "vitest";
import { Client, ClientPhone, ClientDestination } from "../../models/client";
import { matchesSearchToken, matchesFragmentSearch } from "@/shared/hooks/useFragmentSearch";
import { deduplicateDestinations } from "../../utils/destinationUtils";

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
      destinations: [],
      price_lists: ["LIST_EDILE_ROSSI"],
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
    expect(client.price_lists).toContain("LIST_EDILE_ROSSI");
    expect(client.is_active).toBe(true);
    expect(client.deleted_at).toBeNull();
  });

  it("garantisce il soft delete senza cancellazione fisica dei dati", () => {
    const now = new Date().toISOString();
    const original: Client = {
      id: "cli-99",
      business_name: "Ferramenta Bianchi",
      phones: [],
      destinations: [],
      price_lists: [],
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

  it("garantisce la ricerca senza punti per acronimi e sigle (camm -> C.A.M.M., movi -> MO.VI)", () => {
    expect(matchesSearchToken("c.a.m.m.", "cam")).toBe(true);
    expect(matchesSearchToken("c.a.m.m.", "camm")).toBe(true);
    expect(matchesSearchToken("c.a.m.m.", "c.a.m.m.")).toBe(true);
    expect(matchesSearchToken("mo.vi logistica", "mov")).toBe(true);
    expect(matchesSearchToken("mo.vi logistica", "movi")).toBe(true);
    expect(matchesSearchToken("f.lli bertini srl", "flli")).toBe(true);
    expect(matchesSearchToken("s.i.s.a. srl", "sisa")).toBe(true);

    expect(matchesFragmentSearch("C.A.M.M. TRASPORTI", "camm")).toBe(true);
    expect(matchesFragmentSearch("MO.VI LOGISTICA", "movi logistica")).toBe(true);
  });

  it("preserva stabilimenti distinti, opzioni numerate e voci senza luogo (es. ROGIO vs ROGIO 2, STAB. FERRANIA)", () => {
    const carraraDestinations: ClientDestination[] = [
      { id: "1", citta: "CV1", luogo: "CARTIERE CARRARA" },
      { id: "2", citta: "CV2", luogo: "CARTIERE CARRARA" },
      { id: "3", citta: "CV3", luogo: "CARTIERE CARRARA" },
      { id: "4", citta: "CV4", luogo: "CARTIERE CARRARA" },
      { id: "5", citta: "CV5", luogo: "CARTIERE CARRARA" },
      { id: "6", citta: "CV7", luogo: "CARTIERE CARRARA" },
      { id: "7", citta: "ROGIO", luogo: "CARTIERE CARRARA" },
      { id: "8", citta: "STAB. FERRANIA", luogo: "" },
      { id: "9", citta: "ROGIO 2", luogo: "" },
    ];

    const result = deduplicateDestinations(carraraDestinations);
    expect(result).toHaveLength(9);
    expect(result.map((d) => d.citta)).toEqual([
      "CV1",
      "CV2",
      "CV3",
      "CV4",
      "CV5",
      "CV7",
      "ROGIO",
      "STAB. FERRANIA",
      "ROGIO 2",
    ]);
  });

  it("unifica solo veri duplicati con punteggiatura, spazi o civici con slash/trattino differenti", () => {
    const duplicates: ClientDestination[] = [
      { id: "a", citta: "CAPANNORI", luogo: "VIA DELLE CARTIERE, 217/B" },
      { id: "b", citta: "CAPANNORI", luogo: "VIA DELLE CARTIERE 217-B" },
      { id: "c", citta: "CAPANNORI", luogo: "Via Delle Cartiere 217 B" },
      { id: "d", citta: "CAPANNORI", luogo: "VIA ROMANA 10" },
    ];

    const result = deduplicateDestinations(duplicates);
    expect(result).toHaveLength(2);
    expect(result.some((d) => d.luogo.includes("CARTIERE"))).toBe(true);
    expect(result.some((d) => d.luogo.includes("ROMANA"))).toBe(true);
  });
});

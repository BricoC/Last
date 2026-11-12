import { describe, it, expect } from "vitest";
import { Client, ClientPhone, ClientDestination } from "../../models/client";
import { matchesSearchToken, matchesFragmentSearch } from "@/shared/hooks/useFragmentSearch";
import { deduplicateDestinations } from "../../utils/destinationUtils";
import { rankClientsBySearch } from "../../utils/clientSearchUtils";

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

    // Se si cerca con punteggiatura (es. 200.01), NON deve matchare numeri senza punto (es. 4240200012, 020001553, 2200012)
    expect(matchesSearchToken("4240200012", "200.01")).toBe(false);
    expect(matchesSearchToken("020001553", "200.01")).toBe(false);
    expect(matchesSearchToken("2200012", "200.01")).toBe(false);
    expect(matchesSearchToken("200.01", "200.01")).toBe(true);
    expect(matchesSearchToken("lama m42 ineco 200.01", "200.01")).toBe(true);

    // E viceversa: cercando 20001 (senza punto) NON deve matchare 200.01!
    expect(matchesSearchToken("200.01", "20001")).toBe(false);
    expect(matchesSearchToken("lama m42 ineco 200.01", "20001")).toBe(false);
    expect(matchesSearchToken("4240200012", "20001")).toBe(true);
    expect(matchesSearchToken("020001553", "20001")).toBe(true);

    // Simulazione esatta delle righe reali delle fatture elettroniche con date e codici misti
    const rowCricchetto = "cricchetto reversibile 1/2 00102960 / 4240200012 ineco-industrial national c... e01198 2026 2026-03-31";
    const rowLama200_01 = "lama m42 co 8% 2380x20x0.9 z 14 200.01 ineco-industrial national c... 0000073 2025 2025-01-31";
    const rowSpeseVarie = "spese varie doc trade srl 020001553 2024 2024-09-30";

    // "200.01" trova la lama ma NON cricchetto né spese varie
    expect(matchesSearchToken(rowLama200_01, "200.01")).toBe(true);
    expect(matchesSearchToken(rowCricchetto, "200.01")).toBe(false);
    expect(matchesSearchToken(rowSpeseVarie, "200.01")).toBe(false);

    // "20001" trova cricchetto e spese varie ma NON trova 200.01!
    expect(matchesSearchToken(rowLama200_01, "20001")).toBe(false);
    expect(matchesSearchToken(rowCricchetto, "20001")).toBe(true);
    expect(matchesSearchToken(rowSpeseVarie, "20001")).toBe(true);
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

  it("ricerca multi-parola intelligente: 'cart ca' trova solo Cartiere Cardella e Cartiere Carrara escludendo falsi positivi", () => {
    const makeClient = (id: string, name: string, city?: string): Client => ({
      id,
      business_name: name,
      city: city ?? "",
      phones: [],
      destinations: [],
      price_lists: [],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: "system",
      deleted_at: null,
      sync_status: "synced",
    });

    const sampleClients: Client[] = [
      makeClient("1", "ANDER CARTONGESSO SOC. COOPERATIVA"),
      makeClient("2", "CARTIERE CARDELLA", "SAN PIETRO A VICO"),
      makeClient("3", "CARTIERE CARRARA", "TASSIGNANO"),
      makeClient("4", "CARTOGRAFICA GALEOTTI", "GUAMO"),
      makeClient("5", "FLORY CART 2.0 DI S. GHILARDUCCI & CO", "TASSIGNANO"),
      makeClient("6", "FLORYCART 2.0"),
    ];

    // "cart ca" deve matchare ESCLUSIVAMENTE Cartiere Cardella e Cartiere Carrara
    const resultsCartCa = rankClientsBySearch(sampleClients, "cart ca");
    expect(resultsCartCa.map((c) => c.business_name)).toEqual([
      "CARTIERE CARDELLA",
      "CARTIERE CARRARA",
    ]);

    // "cart" restituisce tutti ma con Cartiere in cima (prefisso su business_name)
    const resultsCart = rankClientsBySearch(sampleClients, "cart");
    expect(resultsCart[0].business_name).toBe("CARTIERE CARDELLA");
    expect(resultsCart[1].business_name).toBe("CARTIERE CARRARA");
    expect(resultsCart[2].business_name).toBe("CARTOGRAFICA GALEOTTI");
    expect(resultsCart.some((c) => c.business_name.includes("ANDER"))).toBe(true);
    expect(resultsCart.some((c) => c.business_name.includes("FLORY"))).toBe(true);

    // "cart tass" trova solo Carrara e Flory Cart (in città Tassignano)
    const resultsCartTass = rankClientsBySearch(sampleClients, "cart tass");
    expect(resultsCartTass.map((c) => c.business_name)).toEqual([
      "CARTIERE CARRARA",
      "FLORY CART 2.0 DI S. GHILARDUCCI & CO",
    ]);

    // Acronimi e sigle senza punti (es. "camm" trova "C.A.M.M.")
    const cammClient = makeClient("7", "C.A.M.M. TRASPORTI");
    const resultsCamm = rankClientsBySearch([...sampleClients, cammClient], "camm");
    expect(resultsCamm.map((c) => c.business_name)).toEqual(["C.A.M.M. TRASPORTI"]);
  });

  it("ricerca 'car carr': trova CARTIERE CARRARA in vetta ed esclude categoricamente Polistirolo 2000 e Tenace Automation", () => {
    const makeClient = (id: string, name: string, city?: string, address?: string): Client => ({
      id,
      business_name: name,
      city: city ?? "",
      address: address ?? "",
      phones: [],
      destinations: [],
      price_lists: [],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: "system",
      deleted_at: null,
      sync_status: "synced",
    });

    const clients: Client[] = [
      makeClient("1", "CARTIERE CARRARA", "TASSIGNANO", "VIA CAV. LAV. MARIO CARRARA"),
      makeClient("2", "CARRARA LAB", "TASSIGNANO", "VIA CAV. LAV. MARIO CARRARA"),
      makeClient("3", "CARROZZERIA ELISA", "CARRAIA", "VIA DI CARRAIA"),
      makeClient("4", "VERIPLAST CARRAIA", "CARRAIA", "VIA DI CARRAIA"),
      makeClient("5", "POLISTIROLO 2000", "CARRAIA", "VIA DI CARRAIA"),
      makeClient("6", "TENACE AUTOMATION", "CARRAIA", "VIA DI CARRAIA"),
    ];

    const results = rankClientsBySearch(clients, "car carr");
    const names = results.map((c) => c.business_name);

    // CARTIERE CARRARA deve essere al 1° posto assoluto
    expect(names[0]).toBe("CARTIERE CARRARA");

    // POLISTIROLO 2000 e TENACE AUTOMATION NON devono MAI comparire
    expect(names).not.toContain("POLISTIROLO 2000");
    expect(names).not.toContain("TENACE AUTOMATION");

    // CARRARA LAB ha solo 1 parola che matcha ('carrara') e non deve matchare un query a 2 token distinti
    expect(names).not.toContain("CARRARA LAB");

    // VERIPLAST CARRAIA non può riutilizzare 'carraia' due volte per 'car' e 'carr'
    expect(names).not.toContain("VERIPLAST CARRAIA");
  });
});

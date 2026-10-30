import { describe, it, expect } from "vitest";
import { cleanDestinationName, getDestinationInfo } from "../destinationCleaner";
import { ClientDestination } from "@/features/clients/models/client";

describe("destinationCleaner", () => {
  it("rimuove il nome della ditta dalle sigle di consegna (es. CV7 - CARTIERE CARRARA -> CV7)", () => {
    expect(cleanDestinationName("CV7 - CARTIERE CARRARA", "CARTIERE CARRARA")).toBe("CV7");
    expect(cleanDestinationName("CV1 - CARTIERE CARRARA", "CARTIERE CARRARA")).toBe("CV1");
    expect(cleanDestinationName("ROGIO - CARTIERE CARRARA", "CARTIERE CARRARA")).toBe("ROGIO");
    expect(cleanDestinationName("STAB. FERRANIA - CARTIERE CARRARA", "CARTIERE CARRARA")).toBe("STAB. FERRANIA");
    expect(cleanDestinationName("STAB. ALTOPASCIO - CARTIERE CARRARA", "CARTIERE CARRARA")).toBe("STAB. ALTOPASCIO");
    expect(cleanDestinationName("TASSIGNANO", "CARTIERE CARRARA")).toBe("TASSIGNANO");
  });

  it("gestisce altri clienti (es. WEPA ITALIA)", () => {
    expect(cleanDestinationName("F.SSO RALLETTA - WEPA ITALIA", "WEPA ITALIA")).toBe("F.SSO RALLETTA");
    expect(cleanDestinationName("LOCALITA' SALANETTI - WEPA ITALIA", "WEPA ITALIA")).toBe("LOCALITA' SALANETTI");
    expect(cleanDestinationName("WEPA ITALIA", "WEPA ITALIA")).toBe("");
  });

  it("getDestinationInfo restituisce label pulita e addressValue", () => {
    const d: ClientDestination = {
      id: "1",
      citta: "CV7",
      luogo: "CV7 - CARTIERE CARRARA",
    };
    const info = getDestinationInfo(d, "CARTIERE CARRARA");
    expect(info.label).toBe("CV7");
    expect(info.addressValue).toBe("CV7");
  });

  it("getDestinationInfo con citta e luogo distinti non ridondanti", () => {
    const d: ClientDestination = {
      id: "2",
      citta: "CV5",
      luogo: "MAGAZZINO RICAMBI - CARTIERE CARRARA",
    };
    const info = getDestinationInfo(d, "CARTIERE CARRARA");
    expect(info.label).toBe("CV5 · MAGAZZINO RICAMBI");
    expect(info.addressValue).toBe("CV5");
  });
});


import { describe, expect, it } from "vitest";
import { formatCloudDestination } from "./ddtCloudPayload";

describe("formatCloudDestination", () => {
  it("concatena nome e indirizzo quando distinti", () => {
    expect(formatCloudDestination("EUROVAST · Toringo", "Stab. Pescia", "EUROVAST")).toBe(
      "EUROVAST · Toringo - Stab. Pescia",
    );
  });

  it("non duplica l'indirizzo dopo roundtrip ripetuti con Supabase", () => {
    const firstPush = formatCloudDestination("EUROVAST · Toringo", "Stab. Pescia ", "EUROVAST");
    const secondPush = formatCloudDestination(firstPush, "Stab. Pescia ", "EUROVAST");
    const thirdPush = formatCloudDestination(secondPush, "Stab. Pescia ", "EUROVAST");

    expect(firstPush).toBe("EUROVAST · Toringo - Stab. Pescia");
    expect(secondPush).toBe("EUROVAST · Toringo - Stab. Pescia");
    expect(thirdPush).toBe("EUROVAST · Toringo - Stab. Pescia");
  });

  it("restituisce solo l'indirizzo se il nome manca o coincide col cliente o con l'indirizzo", () => {
    expect(formatCloudDestination("", "Stab. Pescia", "EUROVAST")).toBe("Stab. Pescia");
    expect(formatCloudDestination("EUROVAST", "Stab. Pescia", "EUROVAST")).toBe("Stab. Pescia");
    expect(formatCloudDestination("Stab. Pescia", "Stab. Pescia ", "EUROVAST")).toBe("Stab. Pescia");
  });
});

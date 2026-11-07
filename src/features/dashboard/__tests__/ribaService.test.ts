import { describe, it, expect } from "vitest";
import { calculateNextRibaDeadline } from "../services/ribaService";

describe("calculateNextRibaDeadline", () => {
  it("determina correttamente la scadenza del 10 del mese corrente quando siamo prima del 10", () => {
    // 7 Novembre 2026
    const base = new Date(2026, 10, 7, 10, 30, 0); // month is 0-indexed: 10 = Nov
    const res = calculateNextRibaDeadline(base);

    expect(res.deadlineStr).toBe("10/11/2026");
    expect(res.deadlineKey).toBe("riba_10_11_2026");
    expect(res.daysToDeadline).toBe(3);
  });

  it("include il giorno stesso della scadenza del 10 (giorni rimanenti = 0)", () => {
    const base = new Date(2026, 10, 10, 14, 0, 0);
    const res = calculateNextRibaDeadline(base);

    expect(res.deadlineStr).toBe("10/11/2026");
    expect(res.daysToDeadline).toBe(0);
  });

  it("passa alla fine del mese quando il 10 è già trascorso", () => {
    const base = new Date(2026, 10, 11, 8, 0, 0);
    const res = calculateNextRibaDeadline(base);

    expect(res.deadlineStr).toBe("30/11/2026");
    expect(res.deadlineKey).toBe("riba_30_11_2026");
    expect(res.daysToDeadline).toBe(19);
  });

  it("gestisce correttamente la fine mese di Febbraio in anno bisestile", () => {
    const base = new Date(2024, 1, 15); // 15 Feb 2024 (bisestile)
    const res = calculateNextRibaDeadline(base);

    expect(res.deadlineStr).toBe("29/02/2024");
    expect(res.daysToDeadline).toBe(14);
  });

  it("gestisce correttamente la fine mese di Febbraio in anno non bisestile", () => {
    const base = new Date(2025, 1, 15); // 15 Feb 2025
    const res = calculateNextRibaDeadline(base);

    expect(res.deadlineStr).toBe("28/02/2025");
    expect(res.daysToDeadline).toBe(13);
  });

  it("passa al 10 Gennaio dell'anno successivo partendo da inizio Gennaio dopo Capodanno", () => {
    const base = new Date(2026, 0, 2); // 2 Gennaio 2026
    const res = calculateNextRibaDeadline(base);

    expect(res.deadlineStr).toBe("10/01/2026");
    expect(res.daysToDeadline).toBe(8);
  });
});


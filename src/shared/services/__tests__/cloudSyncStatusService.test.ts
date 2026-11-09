import { describe, expect, it } from "vitest";
import {
  formatSyncTimestamp,
  formatRelativeTime,
} from "../cloudSyncStatusService";

describe("cloudSyncStatusService formatting", () => {
  it("formatta correttamente timestamp null o non validi", () => {
    expect(formatSyncTimestamp(null)).toBe("Nessuna sincronizzazione registrata");
    expect(formatSyncTimestamp(undefined)).toBe("Nessuna sincronizzazione registrata");
    expect(formatSyncTimestamp("data_non_valida")).toBe("Data non disponibile");
  });

  it("formatta data odierna con 'Oggi alle HH:mm:ss'", () => {
    const now = new Date();
    const formatted = formatSyncTimestamp(now);
    expect(formatted).toContain("Oggi alle");
  });

  it("formatta data passata nel formato DD/MM/YYYY HH:mm:ss", () => {
    const past = new Date("2025-05-15T14:30:45Z");
    const formatted = formatSyncTimestamp(past);
    expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/);
  });

  it("calcola il tempo relativo correttamente", () => {
    expect(formatRelativeTime(null)).toBe("");
    expect(formatRelativeTime(undefined)).toBe("");

    const now = new Date();
    expect(formatRelativeTime(now)).toBe("appena adesso");

    const twoMinutesAgo = new Date(Date.now() - 130 * 1000);
    expect(formatRelativeTime(twoMinutesAgo)).toBe("2 min fa");

    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
    expect(formatRelativeTime(threeHoursAgo)).toBe("3 ore fa");

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    expect(formatRelativeTime(twoDaysAgo)).toBe("2 gg fa");
  });
});


import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatSyncTimestamp,
  formatRelativeTime,
  cloudSyncStatusService,
} from "../cloudSyncStatusService";
import { ddtIncrementalSyncService } from "@/features/ddt-studio/services/ddtIncrementalSyncService";
import { priceListSyncService } from "@/features/price-lists/services/priceListSyncService";
import { offersSyncService } from "@/features/offers/services/offersSyncService";
import { clientSyncService } from "@/features/clients/services/clientSyncService";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

it("mantiene l'ultimo timestamp riuscito quando un modulo segnala un errore", async () => {
  const storage = new Map([["last_supabase_sync_timestamp", "2026-01-01T08:00:00Z"]]);
  vi.stubGlobal("localStorage", {
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    getItem: (key: string) => storage.get(key) ?? null,
  });
  vi.spyOn(ddtIncrementalSyncService, "syncNewDdtsFromSupabase").mockResolvedValue({
    newHeadersCount: 0, newLinesCount: 0, backupPath: null, error: "HTTP 503",
  });
  vi.spyOn(priceListSyncService, "syncIncrementalGeneralFromSupabase").mockResolvedValue({
    updatedCount: 2, updatedRows: [],
  });
  vi.spyOn(priceListSyncService, "syncIncrementalClientiFromSupabase").mockResolvedValue({
    updatedCount: 0, updatedRows: [],
  });
  vi.spyOn(priceListSyncService, "retryPendingChanges").mockResolvedValue();
  const offers = vi.spyOn(offersSyncService, "retryPendingChanges").mockRejectedValue(new Error("Offerta da verificare"));
  const clients = vi.spyOn(clientSyncService, "syncPendingClientsToSupabase").mockResolvedValue({ pushed: 1, deleted: 0 });
  const result = await cloudSyncStatusService.executeFullSync();
  expect(result).toMatchObject({ success: false, genCount: 2, summary: expect.stringContaining("DDT: HTTP 503") });
  expect(result.summary).toContain("Offerta da verificare");
  expect(offers).toHaveBeenCalledOnce();
  expect(clients).toHaveBeenCalledOnce();
  expect(storage.get("last_supabase_sync_timestamp")).toBe("2026-01-01T08:00:00Z");
  expect(storage.get("last_supabase_sync_failure")).toBe(result.summary);
});


import { describe, expect, it, vi, beforeEach } from "vitest";

interface QueueRow {
  sequence: number;
  scope: string;
  record_id: string;
  action: string;
  payload: string;
  project_url: string | null;
}

const rows: QueueRow[] = [];
let seq = 1;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: vi.fn(async () => ({
    select: vi.fn(async (_sql: string, params: unknown[]) =>
      rows.filter((r) => r.scope === params[0]).sort((a, b) => a.sequence - b.sequence)
    ),
    execute: vi.fn(async (_sql: string, params: unknown[]) => {
      const idx = rows.findIndex((r) => r.sequence === params[0]);
      if (idx !== -1) rows.splice(idx, 1);
      return { rowsAffected: 1 };
    }),
  })),
}));

import {
  flushPendingCloudOperations,
  getLegacyPendingOperationsCount,
  pendingCloudWrite,
} from "../pendingCloudOperations";

describe("pendingCloudOperations project isolation & legacy preservation", () => {
  beforeEach(() => {
    rows.length = 0;
    seq = 1;
  });

  it("suspends Project A ops on Project B, resumes them on return to A, and preserves legacy ops", async () => {
    const writeA = pendingCloudWrite("quotes", "q-1", "delete", { id: "q-1" }, "https://proj-a.supabase.co");
    rows.push({
      sequence: seq++,
      scope: String(writeA.params[0]),
      record_id: String(writeA.params[1]),
      action: String(writeA.params[2]),
      payload: String(writeA.params[3]),
      project_url: (writeA.params[4] as string | null) ?? null,
    });
    // Legacy item without project_url
    rows.push({
      sequence: seq++,
      scope: "quotes",
      record_id: "q-legacy",
      action: "delete",
      payload: "{}",
      project_url: null,
    });

    const applied: string[] = [];

    // Switch to Project B -> A's op and legacy op must both stay untouched
    const countOnB = await flushPendingCloudOperations(
      "quotes",
      async (op) => { applied.push(op.record_id); },
      "https://proj-b.supabase.co",
    );
    expect(countOnB).toBe(0);
    expect(applied).toEqual([]);
    expect(rows.map((r) => r.record_id)).toEqual(["q-1", "q-legacy"]);
    expect(getLegacyPendingOperationsCount()).toBe(1);

    // Return to Project A -> q-1 resumes & completes, legacy op stays preserved & flagged
    const countOnA = await flushPendingCloudOperations(
      "quotes",
      async (op) => { applied.push(op.record_id); },
      "https://proj-a.supabase.co",
    );
    expect(countOnA).toBe(1);
    expect(applied).toEqual(["q-1"]);
    expect(rows.map((r) => r.record_id)).toEqual(["q-legacy"]);
    expect(getLegacyPendingOperationsCount()).toBe(1);
  });

  it("keeps the operation queued if the active project changes mid-flush before send", async () => {
    const writeA = pendingCloudWrite("quotes", "q-mid", "trash", { id: "q-mid" }, "https://proj-a.supabase.co");
    rows.push({
      sequence: seq++,
      scope: String(writeA.params[0]),
      record_id: String(writeA.params[1]),
      action: String(writeA.params[2]),
      payload: String(writeA.params[3]),
      project_url: (writeA.params[4] as string | null) ?? null,
    });

    let activeProject = "https://proj-a.supabase.co";
    const sentTo: string[] = [];

    const count = await flushPendingCloudOperations(
      "quotes",
      async (op) => {
        // Simulate project switching to B right before the actual HTTP send
        activeProject = "https://proj-b.supabase.co";
        if (op.project_url !== activeProject) {
          throw new Error("Il progetto Supabase attivo è cambiato");
        }
        sentTo.push(activeProject);
      },
      "https://proj-a.supabase.co",
    );

    expect(count).toBe(0);
    expect(sentTo).toEqual([]);
    expect(rows.map((r) => r.record_id)).toEqual(["q-mid"]);
  });
});

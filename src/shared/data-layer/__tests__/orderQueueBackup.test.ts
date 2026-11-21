import { afterEach, expect, it, vi } from "vitest";
import type Database from "@tauri-apps/plugin-sql";
import { consumeRestoredOrderQueue, ORDER_QUEUE_KEY, readOrderQueueForBackup } from "../orderQueueBackup";

afterEach(() => vi.unstubAllGlobals());
it("ripristina su un profilo vuoto e mantiene ordine, identificativi e progetto sui retry", async () => {
  const data = new Map<string,string>();
  vi.stubGlobal("localStorage", {
    setItem: (k: string,v: string) => data.set(k,v), getItem: (k: string) => data.get(k) ?? null,
  });
  const op = { id: "first", targetId: "order", action: "insert", timestamp: "2026-11-20", projectUrl: "https://project.test", payload: { item: 4 } };
  const other = { ...op, id: "second", action: "update" };
  const row = { payload: JSON.stringify([op,other]), merge_queue: 0 };
  const db = { select: async () => [row], execute: vi.fn().mockResolvedValue({}) };
  await consumeRestoredOrderQueue(db as unknown as Database);
  expect(readOrderQueueForBackup()).toEqual([op,other]);
  row.merge_queue = 1;
  await consumeRestoredOrderQueue(db as unknown as Database);
  expect(readOrderQueueForBackup()).toEqual([op,other]);
  data.set(ORDER_QUEUE_KEY,"broken");
  await expect(consumeRestoredOrderQueue(db as unknown as Database)).rejects.toThrow();
  expect(db.execute).toHaveBeenCalledTimes(2);
});

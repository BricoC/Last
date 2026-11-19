import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseRealtimeSubscription } from "../supabaseRealtimeSubscription";
import { SUPABASE_SESSION_UPDATED } from "../supabaseSession";

function fakeClient() {
  const removeChannel = vi.fn(async (_channel: RealtimeChannel) => "ok");
  return { client: { removeChannel } as unknown as SupabaseClient, removeChannel };
}

describe("Ciclo di vita delle sottoscrizioni Supabase", () => {
  beforeEach(() => vi.stubGlobal("window", new EventTarget()));
  afterEach(() => vi.unstubAllGlobals());

  it("condivide il canale tra due istanze e lo chiude all'ultimo smontaggio", async () => {
    const { client, removeChannel } = fakeClient();
    const channel = {} as RealtimeChannel;
    const open = vi.fn(() => channel);
    const subscribe = createSupabaseRealtimeSubscription(async () => client, open, "test");
    const disposeFirst = subscribe();
    const disposeSecond = subscribe();
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    disposeFirst();
    disposeFirst();
    expect(removeChannel).not.toHaveBeenCalled();
    disposeSecond();
    expect(removeChannel).toHaveBeenCalledExactlyOnceWith(channel);
  });

  it("ignora il login precedente se il suo client arriva dopo il cambio di sessione", async () => {
    const previous = fakeClient();
    const current = fakeClient();
    let finishPrevious!: (client: SupabaseClient) => void;
    const load = vi.fn<() => Promise<SupabaseClient | null>>()
      .mockImplementationOnce(() => new Promise((resolve) => { finishPrevious = resolve; }))
      .mockResolvedValue(current.client);
    const open = vi.fn((_client: SupabaseClient, _isCurrent: () => boolean) => ({}) as RealtimeChannel);
    const dispose = createSupabaseRealtimeSubscription(load, open, "test")();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event(SUPABASE_SESSION_UPDATED));
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    finishPrevious(previous.client);
    await Promise.resolve();
    expect(open.mock.calls[0][0]).toBe(current.client);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][1]()).toBe(true);
    dispose();
    expect(open.mock.calls[0][1]()).toBe(false);
  });
});

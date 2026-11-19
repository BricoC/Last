import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { subscribeSupabaseSession } from "./supabaseSession";

export function createSupabaseRealtimeSubscription(
  loadClient: () => Promise<SupabaseClient | null>,
  open: (client: SupabaseClient, isCurrent: () => boolean) => RealtimeChannel,
  label: string,
): () => () => void {
  let subscribers = 0;
  let generation = 0;
  let active: { client: SupabaseClient; channel: RealtimeChannel } | undefined;
  let reconnecting = false;
  let closing: { client: SupabaseClient; task: Promise<unknown> } | undefined;
  let unsubscribeSession: (() => void) | undefined;

  function reconnect() {
    const version = ++generation;
    const isCurrent = () => version === generation && subscribers > 0;
    if (active) {
      const previous = active;
      active = undefined;
      const task = previous.client.removeChannel(previous.channel).catch((error) => console.warn(label, error))
        .finally(() => { if (closing?.task === task) closing = undefined; });
      closing = { client: previous.client, task };
    }
    if (!subscribers) {
      reconnecting = false;
      return;
    }

    reconnecting = true;
    void (async () => {
      try {
        const client = await loadClient();
        if (!client || !isCurrent()) return;
        if (closing?.client === client) await closing.task;
        if (isCurrent()) active = { client, channel: open(client, isCurrent) };
      } catch (error) {
        if (isCurrent()) console.warn(label, error);
      } finally {
        if (isCurrent()) reconnecting = false;
      }
    })();
  }

  function onOnline() {
    const channelState = (active?.channel as { state?: string } | undefined)?.state;
    const isStaleOrClosed =
      !active || channelState === "closed" || channelState === "errored";
    if (isStaleOrClosed && !reconnecting) reconnect();
  }

  return () => {
    subscribers++;
    if (subscribers === 1) {
      unsubscribeSession = subscribeSupabaseSession(reconnect);
      window.addEventListener("online", onOnline);
      reconnect();
    }
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      subscribers--;
      if (!subscribers) {
        unsubscribeSession?.();
        unsubscribeSession = undefined;
        window.removeEventListener("online", onOnline);
        reconnect();
      }
    };
  };
}

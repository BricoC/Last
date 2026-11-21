import { supabaseFetch } from "@/shared/services/supabaseSession";
import type { OfferRecord } from "../types/offer";

export async function writeRemoteOffer(
  { projectUrl, anonKey }: { projectUrl: string; anonKey: string },
  item: OfferRecord,
): Promise<number | null> {
  const body = JSON.stringify({
    local_id: item.id,
    offer_date: item.offer_date,
    requester: item.requester,
    contact: item.contact || "",
    items_text: item.items_text,
    status: item.status,
    is_urgent: Boolean(item.is_urgent),
    is_archived: Boolean(item.is_archived),
    created_by: item.created_by || "Operatore",
    updated_by: item.updated_by || "Operatore",
    created_at: item.created_at,
    updated_at: item.updated_at,
  });
  const url = new URL("/rest/v1/offerte", projectUrl);
  const send = async (method: "PATCH" | "POST") => {
    const response = await supabaseFetch(url, {
      method,
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
        Prefer: method === "POST"
          ? "return=representation,resolution=merge-duplicates"
          : "return=representation",
      },
      body,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(`Errore invio Supabase: ${error.message || response.statusText || response.status}`);
    }
    const rows = await response.json().catch(() => null);
    if (method === "PATCH" && Array.isArray(rows) && rows.length === 0) return null;
    const id = Array.isArray(rows) && rows.length === 1 ? Number(rows[0]?.id) : NaN;
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Offerta non confermata da Supabase");
    return id;
  };

  if (!item.supabase_id) {
    url.searchParams.set("on_conflict", "local_id");
    return send("POST");
  }

  url.searchParams.set("id", `eq.${item.supabase_id}`);
  url.searchParams.set("or", `(local_id.eq.${JSON.stringify(item.id)},local_id.is.null)`);
  const confirmedId = await send("PATCH");
  if (confirmedId !== null) return confirmedId;

  url.search = "";
  url.searchParams.set("local_id", `eq.${item.id}`);
  return send("PATCH");
}

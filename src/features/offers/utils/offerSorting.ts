import type { OfferRecord } from "../types/offer";

/**
 * Ordina le offerte mantenendo quelle "Inviata" in fondo alla lista,
 * dopo le offerte ancora da gestire, sempre in ordine decrescente di data.
 */
export function sortOffers(offers: OfferRecord[]): OfferRecord[] {
  return [...offers].sort((a, b) => {
    const aSent = a.status === "Inviata" ? 1 : 0;
    const bSent = b.status === "Inviata" ? 1 : 0;
    if (aSent !== bSent) return aSent - bSent;

    const cmpDate = (b.offer_date || "").localeCompare(a.offer_date || "");
    if (cmpDate !== 0) return cmpDate;

    return (b.created_at || "").localeCompare(a.created_at || "");
  });
}

import { describe, it, expect } from "vitest";
import { matchesFragmentSearch } from "@/shared/hooks/useFragmentSearch";
import { OFFER_STATUSES, OFFER_STATUS_STYLES, type OfferRecord, type TrashOfferRow } from "../types/offer";

describe("Offers Types and Search Logic", () => {
  it("defines exactly the 4 required statuses with respective styles", () => {
    expect(OFFER_STATUSES).toEqual([
      "Da preparare",
      "Inviata",
      "In sospeso",
      "Aggiornata",
    ]);

    expect(OFFER_STATUS_STYLES["Da preparare"].dot).toContain("red");
    expect(OFFER_STATUS_STYLES["Inviata"].dot).toContain("emerald");
    expect(OFFER_STATUS_STYLES["In sospeso"].dot).toContain("amber");
    expect(OFFER_STATUS_STYLES["Aggiornata"].dot).toContain("purple");
  });

  const sampleOffers: OfferRecord[] = [
    {
      id: "1",
      offer_date: "2026-11-03",
      requester: "igrif",
      contact: "333 1234567",
      items_text: "5 completo verde xl\n5 chiave beta 951 n.6\n25 16x80 te zn",
      status: "Da preparare",
      is_urgent: 1,
      is_archived: 0,
      created_by: "Amministratore",
      updated_by: "Amministratore",
      created_at: "2026-11-03T10:00:00.000Z",
      updated_at: "2026-11-03T10:00:00.000Z",
      sync_status: "synced",
    },
    {
      id: "2",
      offer_date: "2026-11-02",
      requester: "anthony carma",
      contact: "info@anthony.it",
      items_text: "15 appendi abiti laplast bianco\n25 dado alto zn m16",
      status: "Inviata",
      is_urgent: 0,
      is_archived: 0,
      created_by: "Operatore",
      updated_by: "Operatore",
      created_at: "2026-11-02T10:00:00.000Z",
      updated_at: "2026-11-02T10:00:00.000Z",
      sync_status: "synced",
    },
  ];

  it("filters offers correctly by multi-token query across requester and items", () => {
    // "igrif chiave" should match offer 1
    const res1 = sampleOffers.filter((item) =>
      matchesFragmentSearch([item.requester, item.items_text, item.contact || "", item.status], "igrif chiave")
    );
    expect(res1).toHaveLength(1);
    expect(res1[0].requester).toBe("igrif");

    // "carma dado" should match offer 2
    const res2 = sampleOffers.filter((item) =>
      matchesFragmentSearch([item.requester, item.items_text, item.contact || "", item.status], "carma dado")
    );
    expect(res2).toHaveLength(1);
    expect(res2[0].requester).toBe("anthony carma");

    // "inviata" should match offer 2
    const res3 = sampleOffers.filter((item) =>
      matchesFragmentSearch([item.requester, item.items_text, item.contact || "", item.status], "inviata")
    );
    expect(res3).toHaveLength(1);
    expect(res3[0].id).toBe("2");
  });

  it("sorts offers by date descending with the latest on top", () => {
    const sorted = [...sampleOffers].sort((a, b) => {
      const cmpDate = b.offer_date.localeCompare(a.offer_date);
      if (cmpDate !== 0) return cmpDate;
      return b.created_at.localeCompare(a.created_at);
    });

    expect(sorted[0].id).toBe("1"); // 2026-11-03 before 2026-11-02
  });

  it("handles TrashOfferRow with deleted_at timestamp correctly", () => {
    const trashItem: TrashOfferRow = {
      ...sampleOffers[0],
      deleted_at: "2026-11-07T09:40:00.000Z",
      deleted_by: "Admin",
    };

    expect(trashItem.deleted_at).toBe("2026-11-07T09:40:00.000Z");
    expect(trashItem.deleted_by).toBe("Admin");
    expect(trashItem.requester).toBe("igrif");
  });
});


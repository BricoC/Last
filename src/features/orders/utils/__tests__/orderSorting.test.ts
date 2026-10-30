import { describe, it, expect } from "vitest";

function sortOrders(nodes: any[]): any[] {
  const filledWithFornitore: any[] = [];
  const filledWithoutFornitore: any[] = [];
  const empties: any[] = [];

  for (const node of nodes) {
    if (node.data?.isNew) {
      empties.push(node);
    } else {
      const forn = node.data?.supplier_name?.trim();
      if (forn) {
        filledWithFornitore.push(node);
      } else {
        filledWithoutFornitore.push(node);
      }
    }
  }

  const sortByDate = (a: any, b: any) => {
    const timeA = new Date(a.data?.created_at || 0).getTime();
    const timeB = new Date(b.data?.created_at || 0).getTime();
    return timeA - timeB;
  };

  const sortByFornitoreAndDate = (a: any, b: any) => {
    const fornA = (a.data?.supplier_name || "").toLowerCase();
    const fornB = (b.data?.supplier_name || "").toLowerCase();
    if (fornA < fornB) return -1;
    if (fornA > fornB) return 1;
    return sortByDate(a, b);
  };

  filledWithFornitore.sort(sortByFornitoreAndDate);
  filledWithoutFornitore.sort(sortByDate);

  return [...filledWithFornitore, ...filledWithoutFornitore, ...empties];
}

describe("Order Sorting Logic (postSortRows parity with NoManV1)", () => {
  it("preserves exact chronological order for alternating local and remote orders without supplier", () => {
    const nodes = [
      { data: { id: "1", description: "1", supplier_name: "", created_at: "2026-10-30T13:59:53.735Z", isNew: false } },
      { data: { id: "2", description: "2", supplier_name: "", created_at: "2026-10-30T13:59:55.638Z", isNew: false } },
      { data: { id: "3", description: "3", supplier_name: "", created_at: "2026-10-30T13:59:58.353Z", isNew: false } },
      { data: { id: "4", description: "4", supplier_name: "", created_at: "2026-10-30T14:00:01.262Z", isNew: false } },
      { data: { id: "5", description: "5", supplier_name: "", created_at: "2026-10-30T14:00:04.650Z", isNew: false } },
      { data: { id: "6", description: "6", supplier_name: "", created_at: "2026-10-30T14:00:07.444Z", isNew: false } },
      { data: { id: "7", description: "7", supplier_name: "", created_at: "2026-10-30T14:00:10.689Z", isNew: false } },
      { data: { id: "empty_1", isNew: true } },
      { data: { id: "empty_2", isNew: true } },
    ];

    // Shuffle input to simulate arriving out of order or separate streams
    const shuffled = [nodes[1], nodes[3], nodes[5], nodes[0], nodes[2], nodes[4], nodes[6], nodes[8], nodes[7]];

    const sorted = sortOrders(shuffled);
    const descriptions = sorted.filter(n => !n.data.isNew).map(n => n.data.description);

    expect(descriptions).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(sorted[7].data.isNew).toBe(true);
    expect(sorted[8].data.isNew).toBe(true);
  });

  it("groups orders with supplier alphabetically, then by date, keeping them before unsorted orders", () => {
    const nodes = [
      { data: { id: "u1", description: "Senza fornitore 1", supplier_name: "", created_at: "2026-10-30T12:00:00Z", isNew: false } },
      { data: { id: "s1", description: "Severi 1", supplier_name: "Severi", created_at: "2026-10-30T13:00:00Z", isNew: false } },
      { data: { id: "f1", description: "Franzini 1", supplier_name: "Franzini", created_at: "2026-10-30T14:00:00Z", isNew: false } },
      { data: { id: "s2", description: "Severi 2", supplier_name: "Severi", created_at: "2026-10-30T11:00:00Z", isNew: false } },
      { data: { id: "e1", isNew: true } },
    ];

    const sorted = sortOrders(nodes);
    const ids = sorted.map(n => n.data.id);

    expect(ids).toEqual(["f1", "s2", "s1", "u1", "e1"]);
  });
});


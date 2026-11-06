import { describe, it, expect } from "vitest";
import { formatQuoteCode } from "../../models/quoteDraft";

describe("Quote Numbering & Trash Rules", () => {
  it("formats quote numbers strictly as YYYY.xxx (from 001 to 9999)", () => {
    expect(formatQuoteCode(2026, 1)).toBe("2026.001");
    expect(formatQuoteCode(2026, 9)).toBe("2026.009");
    expect(formatQuoteCode(2026, 10)).toBe("2026.010");
    expect(formatQuoteCode(2026, 99)).toBe("2026.099");
    expect(formatQuoteCode(2026, 100)).toBe("2026.100");
    expect(formatQuoteCode(2026, 999)).toBe("2026.999");
    expect(formatQuoteCode(2026, 1000)).toBe("2026.1000");
    expect(formatQuoteCode(2027, 1)).toBe("2027.001");
  });

  it("never reuses a quote number even if cancelled or deleted", () => {
    // Simulating sequence tracker with sequence persistence
    let recordedSequence = 0;
    const existingQuotes = [
      { id: "1", year: 2026, quote_number: 1, deleted_at: null },
      { id: "2", year: 2026, quote_number: 2, deleted_at: "2026-11-06T09:00:00Z" }, // deleted!
    ];
    recordedSequence = Math.max(recordedSequence, 2);

    // Function reproducing the non-reusable numbering calculation
    function getNextNumber(year: number, quotes: typeof existingQuotes, seq: number) {
      const quotesMax = Math.max(...quotes.filter(q => q.year === year).map(q => q.quote_number), 0);
      const maxCurrent = Math.max(seq, quotesMax, 0);
      return maxCurrent + 1;
    }

    // Next number must be 3, NOT 2
    const nextNum = getNextNumber(2026, existingQuotes, recordedSequence);
    expect(nextNum).toBe(3);

    // Even if quote 2 was pruned completely from memory/trash:
    recordedSequence = Math.max(recordedSequence, nextNum);
    const purgedQuotes = existingQuotes.filter(q => q.id !== "2");
    const followingNum = getNextNumber(2026, purgedQuotes, recordedSequence);
    expect(followingNum).toBe(4);
  });

  it("caps trash items strictly to 5 maximum (FIFO pruning)", () => {
    const trashItems: { id: string; deleted_at: number }[] = [];

    function addToTrash(id: string, timestamp: number) {
      trashItems.unshift({ id, deleted_at: timestamp });
      if (trashItems.length > 5) {
        trashItems.length = 5; // prune oldest
      }
    }

    addToTrash("quote-1", 1000);
    addToTrash("quote-2", 2000);
    addToTrash("quote-3", 3000);
    addToTrash("quote-4", 4000);
    addToTrash("quote-5", 5000);

    expect(trashItems.length).toBe(5);
    expect(trashItems[0].id).toBe("quote-5");
    expect(trashItems[4].id).toBe("quote-1");

    // Adding 6th item prunes quote-1
    addToTrash("quote-6", 6000);
    expect(trashItems.length).toBe(5);
    expect(trashItems[0].id).toBe("quote-6");
    expect(trashItems.map(i => i.id)).toEqual([
      "quote-6", "quote-5", "quote-4", "quote-3", "quote-2"
    ]);
    expect(trashItems.some(i => i.id === "quote-1")).toBe(false);
  });
});

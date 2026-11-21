import type { DdtArchiveEntry } from "../models/ddt";

export type MarginFilter = "all" | "with_margins" | "without_margins";

export function isReturnDdt(transportReason?: string | null): boolean {
  return (transportReason ?? "").toLowerCase().includes("reso");
}

export function matchesMarginFilter(
  doc: Pick<DdtArchiveEntry, "has_complete_margins" | "transport_reason">,
  marginFilter: MarginFilter
): boolean {
  if (marginFilter === "all") return true;
  if (isReturnDdt(doc.transport_reason)) return false;
  return marginFilter === "with_margins" ? doc.has_complete_margins : !doc.has_complete_margins;
}

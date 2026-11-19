import { parseItalianNumber } from "@/shared/utils/numberUtils";
import { round5 } from "./priceFormulas";

const FRACTION_COLUMNS = new Set(["perc_pub", "perc_prof", "perc_fatt", "aumento", "maga", "perc_iva"]);

export function formatPriceListInput(value: unknown, column: string): string {
  if (value == null) return "";
  if (typeof value === "number" && FRACTION_COLUMNS.has(column)) {
    return `${round5(value * 100)}%`;
  }
  return String(value);
}

export function parsePriceListNumber(value: string | number | null): number | null {
  const parsed = parseItalianNumber(value);
  return parsed == null ? null : round5(parsed);
}

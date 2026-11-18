import type { ListinoGeneraleRow } from "../models/priceList";

export const generalPriceHistoryFields: ReadonlyArray<{
  key: keyof ListinoGeneraleRow;
  label: string;
  fraction?: true;
}> = [
  { key: "prezzo_acquisto", label: "Prezzo Acquisto" },
  { key: "prezzo_fattura", label: "Prezzo Fattura" },
  { key: "prezzo_pubblico", label: "Prezzo Pubblico" },
  { key: "prezzo_profess", label: "Prezzo Profess" },
  { key: "perc_pub", label: "% Pubblico", fraction: true },
  { key: "perc_prof", label: "% Profess", fraction: true },
  { key: "perc_fatt", label: "% Fattura", fraction: true },
  { key: "aumento", label: "Aumento %", fraction: true },
  { key: "maga", label: "Magazzino %", fraction: true },
  { key: "perc_iva", label: "IVA", fraction: true },
];

export function generalPriceVariation(previous: number | null, next: number | null, fraction = false): number | null {
  if (previous) return (((next ?? 0) - previous) / Math.abs(previous)) * 100;
  return fraction && next !== null ? next * 100 : null;
}

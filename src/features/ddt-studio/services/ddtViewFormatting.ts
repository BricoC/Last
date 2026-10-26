import { MonetaryValue } from "@/shared/domain/monetaryValue";

export const ITALIAN_MONTHS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
] as const;

export const formatDdtMoney = (subunits: number) => `€ ${MonetaryValue.fromSubunits(subunits).formatIT(false)}`;
export const formatDdtPercent = (value: number | null) => value === null ? "—" : `${value.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;

/**
 * Formatta la data in formato leggibile e ricercabile con nome mese per esteso:
 * es. "25.Settembre.2025"
 */
export const formatDdtViewDate = (value?: string | null): string => {
  if (!value) return "";
  const clean = value.split("T")[0].split(" ")[0].trim();

  // Se già ISO YYYY-MM-DD
  if (clean.includes("-")) {
    const parts = clean.split("-");
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parts[2].padStart(2, "0");
      const monthName = ITALIAN_MONTHS[monthIdx];
      if (monthName) {
        return `${day}.${monthName}.${year}`;
      }
    }
  }

  // Se DD/MM/YYYY
  if (clean.includes("/")) {
    const parts = clean.split("/");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, "0");
      const monthIdx = parseInt(parts[1], 10) - 1;
      const year = parts[2];
      const monthName = ITALIAN_MONTHS[monthIdx];
      if (monthName) {
        return `${day}.${monthName}.${year}`;
      }
    }
  }

  return clean;
};

export const formatDdtNumber = (number: number | null, series: string) => number === null ? "Bozza" : `${series ? `${series}/` : ""}${number}`;

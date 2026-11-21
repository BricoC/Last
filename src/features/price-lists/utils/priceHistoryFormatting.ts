import type { PriceListLogEntry } from "../models/priceList";

export function round5(num: number): number {
  return Math.round((num + Number.EPSILON) * 100000) / 100000;
}

export function formatPriceHistoryDate(isoString: string): string {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    return `${date.toLocaleDateString("it-IT")} ${date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return isoString;
  }
}

export function formatPriceHistoryValue(value: number | null | undefined, field: string): string {
  const normalizedField = field.toLowerCase();
  const isPercent = normalizedField.includes("%") || normalizedField.includes("iva") || normalizedField.includes("aumento") || normalizedField.includes("magazzino");
  const isMoney = normalizedField.includes("prezzo") || normalizedField.includes("costo") || normalizedField.includes("acquisto") || normalizedField.includes("fattura") || normalizedField.includes("pubblico") || normalizedField.includes("profess");

  if (value == null) {
    if (isPercent) return "0% (Non impostato)";
    if (isMoney) return "€ 0,00";
    return "(vuoto)";
  }
  if (isPercent) return `${round5(value * 100)}%`;
  if (isMoney) {
    return `€ ${round5(value).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 5 })}`;
  }
  return String(round5(value));
}

export function getPriceHistoryTextDiff(log: PriceListLogEntry) {
  if (log.vecchio_testo != null || log.nuovo_testo != null) {
    return { oldText: log.vecchio_testo || "(vuoto)", newText: log.nuovo_testo || "(vuoto)" };
  }
  if (log.motivo) {
    const match = log.motivo.match(/da "([^"]*)" a "([^"]*)"/i);
    if (match) return { oldText: match[1] || "(vuoto)", newText: match[2] || "(vuoto)" };
  }
  return { oldText: null, newText: null };
}

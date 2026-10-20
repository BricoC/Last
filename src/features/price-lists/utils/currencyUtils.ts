/**
 * Utility pure per la manipolazione sicura degli importi in centesimi.
 * Elimina tutti gli errori tipici dei numeri in virgola mobile (es. 0.1 + 0.2 !== 0.3).
 */

/**
 * Converte i centesimi interi in valore decimale float (per calcoli intermedi).
 */
export function centsToEuro(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return cents / 100;
}

/**
 * Converte un numero decimale in centesimi interi arrotondati.
 */
export function euroToCents(euro: number): number {
  if (!Number.isFinite(euro)) return 0;
  return Math.round(euro * 100);
}

/**
 * Converte una stringa utente (es. "12,50", "12.50 €", " 15 ") in centesimi interi.
 */
export function parseEuroStringToCents(input: string | number): number {
  if (typeof input === "number") {
    return euroToCents(input);
  }

  if (!input || typeof input !== "string") return 0;

  // Rimuovi spazi, simboli di valuta e sostituisci virgola con punto
  const cleaned = input
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".")
    .trim();

  const parsed = parseFloat(cleaned);
  if (isNaN(parsed) || !isFinite(parsed)) return 0;

  return Math.round(parsed * 100);
}

/**
 * Formatta i centesimi per la visualizzazione nella griglia o nei report (es. "1,58 €" o "1,58").
 */
export function formatCentsToEuro(cents: number, includeCurrency = true): string {
  const euro = centsToEuro(cents);
  const formatted = euro.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return includeCurrency ? `${formatted} €` : formatted;
}

/**
 * Calcola la percentuale di ricarico sul prezzo di acquisto.
 * Ricarico = ((Vendita - Acquisto) / Acquisto) * 100
 */
export function calculateMarkupPercentage(purchaseCents: number, saleCents: number): number {
  if (purchaseCents <= 0) return 0;
  const markup = ((saleCents - purchaseCents) / purchaseCents) * 100;
  return Math.round(markup * 100) / 100;
}

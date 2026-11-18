/**
 * Funzioni di calcolo prezzi e ricarichi per il Listino Generale
 * Basate sulla logica storica:
 * - r1 = prezzo_acquisto * (1 + aumento)
 * - r2 = r1 * (1 + maga)  [Costo Acquisto con Maggiorazioni]
 * - prezzo_fattura = r2 * (1 + perc_fatt)  [senza IVA]
 * - prezzo_pubblico = r2 * (1 + perc_pub) * (1 + perc_iva)  [IVA inclusa]
 * - prezzo_profess = r2 * (1 + perc_prof) * (1 + perc_iva)  [IVA inclusa]
 */

export function round5(num: number): number {
  if (isNaN(num) || !isFinite(num)) return 0;
  return Math.round(num * 100000) / 100000;
}

function normalizeIvaFraction(percIva: number | null | undefined): number {
  if (percIva === null || percIva === undefined) return 0.22;
  const n = Number(percIva);
  return Number.isFinite(n) ? n : 0.22;
}

export function calculateR1(prezzoAcquisto: number | null | undefined, aumentoPercent: number | null | undefined): number {
  const acq = Number(prezzoAcquisto) || 0;
  const aumFrac = Number(aumentoPercent) || 0;
  return round5(acq * (1 + aumFrac));
}

export function calculateR2(r1: number, magaPercent: number | null | undefined): number {
  const magaFrac = Number(magaPercent) || 0;
  return round5(r1 * (1 + magaFrac));
}

export function calculateCostoMaggiorato(
  prezzoAcquisto: number | null | undefined,
  aumento: number | null | undefined,
  maga: number | null | undefined
): number {
  const r1 = calculateR1(prezzoAcquisto, aumento);
  return calculateR2(r1, maga);
}

export function calculatePrezzoFattura(costoMaggiorato: number, percFatt: number | null | undefined): number {
  if (costoMaggiorato <= 0) return 0;
  const frac = Number(percFatt) || 0;
  return round5(costoMaggiorato * (1 + frac));
}

export function calculatePercFattura(prezzoFattura: number, costoMaggiorato: number): number {
  if (costoMaggiorato <= 0) return 0;
  return round5(((prezzoFattura - costoMaggiorato) / costoMaggiorato) * 100);
}

export function calculatePrezzoPubblico(
  costoMaggiorato: number,
  percPub: number | null | undefined,
  percIva: number | null | undefined = 0.22
): number {
  if (costoMaggiorato <= 0) return 0;
  const frac = Number(percPub) || 0;
  const ivaFrac = normalizeIvaFraction(percIva);
  return round5(costoMaggiorato * (1 + frac) * (1 + ivaFrac));
}

export function calculatePercPubblico(
  prezzoPubblico: number,
  costoMaggiorato: number,
  percIva: number | null | undefined = 0.22
): number {
  if (costoMaggiorato <= 0) return 0;
  const ivaFrac = normalizeIvaFraction(percIva);
  const nettoIva = prezzoPubblico / (1 + ivaFrac);
  return round5(((nettoIva - costoMaggiorato) / costoMaggiorato) * 100);
}

export function calculatePrezzoProfess(
  costoMaggiorato: number,
  percProf: number | null | undefined,
  percIva: number | null | undefined = 0.22
): number {
  if (costoMaggiorato <= 0) return 0;
  const frac = Number(percProf) || 0;
  const ivaFrac = normalizeIvaFraction(percIva);
  return round5(costoMaggiorato * (1 + frac) * (1 + ivaFrac));
}

export function calculatePercProfess(
  prezzoProfess: number,
  costoMaggiorato: number,
  percIva: number | null | undefined = 0.22
): number {
  if (costoMaggiorato <= 0) return 0;
  const ivaFrac = normalizeIvaFraction(percIva);
  const nettoIva = prezzoProfess / (1 + ivaFrac);
  return round5(((nettoIva - costoMaggiorato) / costoMaggiorato) * 100);
}


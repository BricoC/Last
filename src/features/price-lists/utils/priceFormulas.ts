/**
 * Funzioni di calcolo prezzi e ricarichi per il Listino Generale
 * Basate sulla logica storica:
 * - r1 = prezzo_acquisto * (1 + aumento)
 * - r2 = r1 * (1 + maga)  [Costo Acquisto con Maggiorazioni]
 * - prezzo_fattura = r2 * (1 + perc_fatt)  [senza IVA]
 * - prezzo_pubblico = r2 * (1 + perc_pub) * (1 + perc_iva)  [IVA inclusa]
 * - prezzo_profess = r2 * (1 + perc_prof) * (1 + perc_iva)  [IVA inclusa]
 */

export function calculateR1(prezzoAcquisto: number | null | undefined, aumentoPercent: number | null | undefined): number {
  const acq = Number(prezzoAcquisto) || 0;
  const aum = Number(aumentoPercent) || 0;
  // aumento è memorizzato come percentuale intera (es. 5 = 5%) o frazione (es. 0.05)
  const aumFrac = aum > 1 ? aum / 100 : aum;
  return acq * (1 + aumFrac);
}

export function calculateR2(r1: number, magaPercent: number | null | undefined): number {
  const maga = Number(magaPercent) || 0;
  const magaFrac = maga > 1 ? maga / 100 : maga;
  return r1 * (1 + magaFrac);
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
  const p = Number(percFatt) || 0;
  const frac = p > 2 ? p / 100 : p;
  return costoMaggiorato * (1 + frac);
}

export function calculatePercFattura(prezzoFattura: number, costoMaggiorato: number): number {
  if (costoMaggiorato <= 0) return 0;
  return ((prezzoFattura - costoMaggiorato) / costoMaggiorato) * 100;
}

export function calculatePrezzoPubblico(
  costoMaggiorato: number,
  percPub: number | null | undefined,
  percIva: number | null | undefined = 0.22
): number {
  if (costoMaggiorato <= 0) return 0;
  const p = Number(percPub) || 0;
  const frac = p > 2 ? p / 100 : p;
  const iva = Number(percIva) || 0.22;
  const ivaFrac = iva > 1 ? iva / 100 : iva;
  return costoMaggiorato * (1 + frac) * (1 + ivaFrac);
}

export function calculatePercPubblico(
  prezzoPubblico: number,
  costoMaggiorato: number,
  percIva: number | null | undefined = 0.22
): number {
  if (costoMaggiorato <= 0) return 0;
  const iva = Number(percIva) || 0.22;
  const ivaFrac = iva > 1 ? iva / 100 : iva;
  const nettoIva = prezzoPubblico / (1 + ivaFrac);
  return ((nettoIva - costoMaggiorato) / costoMaggiorato) * 100;
}

export function calculatePrezzoProfess(
  costoMaggiorato: number,
  percProf: number | null | undefined,
  percIva: number | null | undefined = 0.22
): number {
  if (costoMaggiorato <= 0) return 0;
  const p = Number(percProf) || 0;
  const frac = p > 2 ? p / 100 : p;
  const iva = Number(percIva) || 0.22;
  const ivaFrac = iva > 1 ? iva / 100 : iva;
  return costoMaggiorato * (1 + frac) * (1 + ivaFrac);
}

export function calculatePercProfess(
  prezzoProfess: number,
  costoMaggiorato: number,
  percIva: number | null | undefined = 0.22
): number {
  if (costoMaggiorato <= 0) return 0;
  const iva = Number(percIva) || 0.22;
  const ivaFrac = iva > 1 ? iva / 100 : iva;
  const nettoIva = prezzoProfess / (1 + ivaFrac);
  return ((nettoIva - costoMaggiorato) / costoMaggiorato) * 100;
}

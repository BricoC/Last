/**
 * Utility pure per normalizzare città e provincia evitando duplicazioni
 * come "LUNATA (LU) (LU) (LU)" o "TASSIGNANO LU (LU)".
 */

export interface ParsedCityProvince {
  city: string;
  province: string;
}

const TRAILING_PAREN_PROV_RE = /\s*\(([A-Za-z]{2})\)\s*$/;
const TRAILING_DASH_PROV_RE = /\s+-\s+([A-Za-z]{2})\s*$/;

/**
 * Estrae città pulita e sigla provincia (2 lettere maiuscole) da valori grezzi,
 * rimuovendo eventuali sigle provincia ripetute in coda (es. "LUNATA (LU) (LU) (LU)",
 * "LUNATA (LU) - LU", "CARRAIA LU (LU)").
 */
export function parseCityAndProvince(
  rawCity?: string | null,
  rawProvince?: string | null
): ParsedCityProvince {
  let city = (rawCity || "").trim();
  let province = (rawProvince || "").trim().toUpperCase();

  // Normalizza eventuale provincia tra parentesi es. "(LU)" -> "LU"
  const parenOnlyProv = province.match(/^\(([A-Za-z]{2})\)$/);
  if (parenOnlyProv) {
    province = parenOnlyProv[1].toUpperCase();
  }

  let extractedProvince = "";
  let changed = true;
  while (changed && city) {
    changed = false;

    const dashMatch = city.match(TRAILING_DASH_PROV_RE);
    if (dashMatch) {
      const candidate = dashMatch[1].toUpperCase();
      const rest = city.slice(0, dashMatch.index).trim();
      if (rest) {
        if (!extractedProvince) extractedProvince = candidate;
        city = rest;
        changed = true;
        continue;
      }
    }

    const parenMatch = city.match(TRAILING_PAREN_PROV_RE);
    if (parenMatch) {
      const candidate = parenMatch[1].toUpperCase();
      const rest = city.slice(0, parenMatch.index).trim();
      if (rest) {
        if (!extractedProvince) extractedProvince = candidate;
        city = rest;
        changed = true;
        continue;
      }
    }
  }

  const effectiveProvince = province || extractedProvince;

  // Rimuove anche eventuali sigle provincia nude ripetute in coda se coincidono con la provincia nota
  // (es. "TASSIGNANO LU LU" con province "LU" -> "TASSIGNANO")
  if (effectiveProvince && /^[A-Za-z]{2}$/.test(effectiveProvince) && city) {
    const bareProvRe = new RegExp(`\\s+${effectiveProvince}$`, "i");
    while (bareProvRe.test(city)) {
      const stripped = city.replace(bareProvRe, "").trim();
      if (!stripped || stripped === city) break;
      city = stripped;
    }
  }

  return {
    city,
    province: effectiveProvince,
  };
}

/**
 * Ripulisce una stringa città/località da ripetizioni di provincia
 * (es. "LUNATA (LU) (LU) (LU)" -> "LUNATA", "CARRAIA LU (LU)" -> "CARRAIA").
 * Usata per il campo città nei DDT dove non va aggiunta automaticamente la provincia tra parentesi.
 */
export function formatCityForDdt(
  rawCity?: string | null,
  rawProvince?: string | null
): string {
  return parseCityAndProvince(rawCity, rawProvince).city;
}

/**
 * Formatta città e provincia per la tabella anagrafica clienti: "LUNATA (LU)"
 * garantendo che la provincia non venga mai duplicata.
 */
export function formatCityForAnagrafica(
  rawCity?: string | null,
  rawProvince?: string | null
): string {
  const { city, province } = parseCityAndProvince(rawCity, rawProvince);
  if (city && province) return `${city} (${province})`;
  return city || (province ? `(${province})` : "");
}

/**
 * Formatta la località per Supabase ("LUNATA - LU") senza mai duplicare la provincia.
 */
export function formatLocalitaForSupabase(
  rawCity?: string | null,
  rawProvince?: string | null
): string {
  const { city, province } = parseCityAndProvince(rawCity, rawProvince);
  return [city, province].filter(Boolean).join(" - ");
}

/**
 * Collassa eventuali sigle provincia ripetute in coda a una stringa già salvata
 * (es. "LUNATA (LU) (LU) (LU)" -> "LUNATA (LU)", "CARRAIA LU (LU)" -> "CARRAIA (LU)").
 * Lascia invariate le stringhe che non hanno ripetizioni.
 */
export function collapseDuplicateProvinces(raw?: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Rileva se ci sono almeno due suffissi provincia consecutivi (es. "(LU) (LU)" o "LU (LU)")
  const hasRepeatedParens = /\s*\(([A-Za-z]{2})\)\s*\(([A-Za-z]{2})\)\s*$/i.test(trimmed);
  const bareThenParen = trimmed.match(/\s+([A-Za-z]{2})\s*\(([A-Za-z]{2})\)\s*$/i);
  const hasBareThenSameParen =
    Boolean(bareThenParen) &&
    bareThenParen![1].toUpperCase() === bareThenParen![2].toUpperCase();

  if (!hasRepeatedParens && !hasBareThenSameParen) {
    return trimmed;
  }

  const { city, province } = parseCityAndProvince(trimmed);
  return city && province ? `${city} (${province})` : city || trimmed;
}

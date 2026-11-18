/**
 * Normalizza e converte un valore numerico in formato italiano o internazionale
 * (es. "1.234,56 €", "12,50%", "1.58") in numero finito, oppure null.
 */
export function parseItalianNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;

  let clean = String(val).trim().replace(/[€%\s]/g, "");
  if (!clean) return null;

  const match = clean.match(/[+-]?[\d.,]+/);
  if (!match) return null;
  clean = match[0];

  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // Formato italiano: 1.234,56 -> rimuovi punti migliaia, virgola -> punto
      clean = clean.replace(/\./g, "").replace(",", ".");
    } else {
      // Formato US: 1,234.56 -> rimuovi virgole migliaia
      clean = clean.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    clean = clean.replace(/,/g, ".");
  } else if (/^[+-]?\d{1,3}(\.\d{3}){2,}$/.test(clean)) {
    // Più gruppi migliaia con punto senza virgola: 1.234.567 -> 1234567
    clean = clean.replace(/\./g, "");
  }

  const parsed = parseFloat(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

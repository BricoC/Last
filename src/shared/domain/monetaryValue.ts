import Decimal from "decimal.js";

/**
 * Configurazione globale Decimal.js per operazioni monetarie
 * 5 decimali esatti, precisione sufficiente per evitare overflow e perdita intermedia.
 */
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 28,
});

export const MONETARY_DECIMALS = 5;
export const SCALE_FACTOR = 100_000; // 10^5 per memorizzazione come intero scalato in SQLite

/**
 * Rappresenta un valore monetario esatto a 5 cifre decimali.
 * Tutte le operazioni matematiche preservano la precisione esatta.
 */
export class MonetaryValue {
  private readonly d: Decimal;

  constructor(value: Decimal.Value | MonetaryValue | null = 0) {
    if (!value) {
      this.d = new Decimal(0);
    } else if (value instanceof MonetaryValue) {
      this.d = value.d;
    } else if (typeof value === "string") {
      this.d = MonetaryValue.parseItalianOrStandard(value);
    } else {
      this.d = new Decimal(value || 0);
    }
  }

  /**
   * Crea un MonetaryValue da un intero scalato (es. 15800 -> 0.15800 €)
   */
  public static fromSubunits(subunits: number | bigint | string): MonetaryValue {
    const raw = typeof subunits === "bigint" ? subunits.toString() : subunits;
    const dec = new Decimal(raw || 0).dividedBy(SCALE_FACTOR);
    return new MonetaryValue(dec);
  }

  /**
   * Crea un MonetaryValue convertendo vecchi centesimi (es. 158 -> 1.58000 €)
   */
  public static fromLegacyCents(cents: number | bigint | string): MonetaryValue {
    const raw = typeof cents === "bigint" ? cents.toString() : cents;
    const dec = new Decimal(raw || 0).dividedBy(100);
    return new MonetaryValue(dec);
  }

  /**
   * Parsing sicuro da stringa utente (gestisce sia '12,34567' che '12.34567' o '1.234,56 €')
   */
  public static parse(input: string | number | null | undefined): MonetaryValue {
    if (input === null || input === undefined || input === "") {
      return new MonetaryValue(0);
    }
    if (typeof input === "number") {
      return new MonetaryValue(input);
    }
    return new MonetaryValue(input);
  }

  private static parseItalianOrStandard(str: string): Decimal {
    let clean = str.trim().replace(/\s+/g, "").replace(/€/g, "");
    if (!clean) return new Decimal(0);

    // Se contiene sia '.' che ',', stabiliamo quale è il separatore decimale
    const lastComma = clean.lastIndexOf(",");
    const lastDot = clean.lastIndexOf(".");

    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) {
        // Formato italiano: 1.234,56789 -> rimuovi i punti, sostituisci virgola con punto
        clean = clean.replace(/\./g, "").replace(",", ".");
      } else {
        // Formato US: 1,234.56789 -> rimuovi le virgole
        clean = clean.replace(/,/g, "");
      }
    } else if (lastComma !== -1) {
      // Solo virgola: 12,34567 -> 12.34567
      clean = clean.replace(",", ".");
    }

    try {
      return new Decimal(clean);
    } catch {
      return new Decimal(0);
    }
  }

  public plus(other: Decimal.Value | MonetaryValue): MonetaryValue {
    const otherDec = other instanceof MonetaryValue ? other.d : new MonetaryValue(other).d;
    return new MonetaryValue(this.d.plus(otherDec));
  }

  public minus(other: Decimal.Value | MonetaryValue): MonetaryValue {
    const otherDec = other instanceof MonetaryValue ? other.d : new MonetaryValue(other).d;
    return new MonetaryValue(this.d.minus(otherDec));
  }

  public times(factor: Decimal.Value | MonetaryValue): MonetaryValue {
    const factorDec = factor instanceof MonetaryValue ? factor.d : new Decimal(factor || 0);
    return new MonetaryValue(this.d.times(factorDec));
  }

  public dividedBy(divisor: Decimal.Value | MonetaryValue): MonetaryValue {
    const divisorDec = divisor instanceof MonetaryValue ? divisor.d : new Decimal(divisor || 1);
    if (divisorDec.isZero()) {
      return new MonetaryValue(0);
    }
    return new MonetaryValue(this.d.dividedBy(divisorDec));
  }

  /**
   * Applica una percentuale di sconto (es. sconto 15% -> restituisce importo scontato)
   */
  public applyDiscount(discountPercent: Decimal.Value): MonetaryValue {
    const sc = new Decimal(discountPercent || 0);
    if (sc.isZero()) return this;
    const discountAmount = this.d.times(sc).dividedBy(100);
    return new MonetaryValue(this.d.minus(discountAmount));
  }

  /**
   * Calcola l'IVA su questo imponibile data l'aliquota (es. 22 -> imponibile * 0.22)
   */
  public calculateVat(vatRatePercent: Decimal.Value): MonetaryValue {
    const rate = new Decimal(vatRatePercent || 0);
    if (rate.isZero()) return new MonetaryValue(0);
    return new MonetaryValue(this.d.times(rate).dividedBy(100));
  }

  public isZero(): boolean {
    return this.d.isZero();
  }

  public isPositive(): boolean {
    return this.d.isPositive() && !this.d.isZero();
  }

  public isNegative(): boolean {
    return this.d.isNegative();
  }

  public equals(other: Decimal.Value | MonetaryValue): boolean {
    const otherDec = other instanceof MonetaryValue ? other.d : new MonetaryValue(other).d;
    return this.d.equals(otherDec);
  }

  /**
   * Restituisce il valore scalato a intero a 5 decimali per SQLite (es. 12.34567 -> 1234567)
   */
  public toSubunits(): number {
    return this.d.times(SCALE_FACTOR).round().toNumber();
  }

  /**
   * Restituisce la stringa decimale canonica a 5 decimali (es. "12.34567", "0.00001", "12.00000")
   */
  public toCanonicalString(): string {
    return this.d.toFixed(MONETARY_DECIMALS);
  }

  /**
   * Restituisce il numero float JavaScript (solo per grafici o display non autorevole)
   */
  public toNumber(): number {
    return this.d.toNumber();
  }

  /**
   * Formatta in stile italiano con 5 decimali (es. "12,34567" o "12,34567 €")
   */
  public formatIT(withCurrencySymbol = false, minDecimals = MONETARY_DECIMALS, maxDecimals = MONETARY_DECIMALS): string {
    const fixed = this.d.toFixed(maxDecimals);
    const [intPart, decPart = ""] = fixed.split(".");
    // Aggiungi separatore delle migliaia '.'
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    
    // Regola decimali minimi/massimi
    let finalDec = decPart;
    if (finalDec.length < minDecimals) {
      finalDec = finalDec.padEnd(minDecimals, "0");
    }

    const res = finalDec ? `${formattedInt},${finalDec}` : formattedInt;
    return withCurrencySymbol ? `${res} €` : res;
  }

  /**
   * Formatta con 2 decimali per totali generici o visualizzazioni standard se richiesto
   */
  public formatIT2(withCurrencySymbol = true): string {
    return this.formatIT(withCurrencySymbol, 2, 2);
  }

  public toString(): string {
    return this.toCanonicalString();
  }
}

/**
 * Utility di convenienza per istanziare rapidamente un MonetaryValue
 */
export function money(val?: Decimal.Value | MonetaryValue | null): MonetaryValue {
  return new MonetaryValue(val);
}

/**
 * Converte in modo sicuro qualsiasi valore (MonetaryValue, string, number, plain object serializzato)
 * in un'istanza valida di MonetaryValue garantendo l'accesso a tutti i metodi (.isZero, .formatIT, ecc.).
 */
export function safeMoney(val?: any): MonetaryValue {
  if (val === null || val === undefined || val === "") return new MonetaryValue(0);
  if (val instanceof MonetaryValue) return val;
  if (typeof val === "object" && typeof val.isZero === "function" && typeof val.formatIT === "function") {
    return val;
  }
  if (typeof val === "object" && val.d) {
    try {
      const dec = new Decimal(val);
      return new MonetaryValue(dec);
    } catch {
      return new MonetaryValue(0);
    }
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return new MonetaryValue(0);
    return new MonetaryValue(trimmed);
  }
  if (typeof val === "number" || typeof val === "bigint") {
    return new MonetaryValue(val);
  }
  return new MonetaryValue(0);
}

/**
 * Verifica se un valore è presente e strettamente maggiore di zero.
 * Non lancia mai eccezioni anche se il valore è una stringa, numero o oggetto grezzo.
 */
export function isPositivePrice(val?: any): boolean {
  if (val === null || val === undefined || val === "" || val === 0 || val === "0") return false;
  if (typeof val === "object" && typeof val.isZero === "function") {
    return !val.isZero();
  }
  const m = safeMoney(val);
  return !m.isZero();
}


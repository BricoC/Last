import { ClientDestination } from "../models/client";

/**
 * Normalizza il campo città / stabilimento / cantiere rimuovendo punteggiatura e spazi ridondanti
 */
export function normalizeCityOrCode(text?: string): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[.,\-_'\/\\#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizza un testo di indirizzo per confronto e deduplicazione:
 * - Rimozione accenti
 * - Rimozione punteggiatura e separatori (. , - _ ' / \)
 * - Correzione refusi tipografici comuni nei DDT ("VIIA" -> "VIA", "VISA" -> "VIA")
 * - Unificazione civici con slash, trattini o spazi ("94/H" -> "94H", "217-B" -> "217B", "217 B" -> "217B")
 * - Rimozione parole di raccordo e congiunzioni stradali
 */
export function normalizeAddressForDeduplication(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    // Correzione refusi di battitura comuni (es: VIIA -> VIA, VISA -> VIA)
    .replace(/\b(VIIA|VISA|VILE)\b/g, "VIA")
    .replace(/\bV\.\b/g, "VIA")
    // Rimuove slash, trattini e spazi nei numeri civici (es: 94/H -> 94H, 217-B -> 217B, 217 B -> 217B)
    .replace(/([0-9]+)[\/\-]([A-Z0-9]+)/g, "$1$2")
    .replace(/([0-9]+)\s+([A-Z])\b/g, "$1$2")
    // Punteggiatura varia -> spazio
    .replace(/[.,\-_'\/\\#]/g, " ")
    // Rimuove prefissi stradali e congiunzioni
    .replace(/\b(VIA|VIALE|CORSO|PIAZZA|VICOLO|STRADA|LOC|LOCALITA|FRAZIONE)\b/g, " ")
    .replace(/\b(E|ED|DEI|DELLE|DEGLI|DEL|DELLA|DI|DA)\b/g, " ")
    .replace(/\bTAZIO\b/g, "T")
    .replace(/\b(RAFFAELLO|RAFFELE)\b/g, "RAFFAELLO")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Genera una chiave univoca per confrontare due destinazioni.
 * Distingue SEMPRE stabilimenti, cantieri e sigle differenti (es. CV1, CV2, ROGIO, ROGIO 2, STAB. FERRANIA).
 */
export function normalizeDestinationKey(citta?: string, luogo?: string, note?: string): string {
  const normCitta = normalizeCityOrCode(citta);
  const fullAddress = [luogo, note].filter(Boolean).join(" ");
  const normAddress = normalizeAddressForDeduplication(fullAddress);

  if (normCitta && normAddress) {
    return `${normCitta}:::${normAddress}`;
  }
  if (normCitta) {
    return `CODE:::${normCitta}`;
  }
  return `ADDR:::${normAddress}`;
}

/**
 * Unifica e deduplica l'elenco delle destinazioni di un cliente:
 * - Fonde indirizzi identici con punteggiatura, spazi o congiunzioni differenti
 * - Corregge refusi nel testo visualizzato (es: "VIIA" -> "VIA")
 * - Unifica voci prive di città se ne esiste un'altra con lo stesso indirizzo esatto provvista di città
 * - Preserva rigorosamente opzioni con stabilimenti o numerazioni distinte (es. ROGIO vs ROGIO 2, STAB. FERRANIA, CV1..CV7)
 */
export function deduplicateDestinations(destinations: ClientDestination[]): ClientDestination[] {
  if (!destinations || destinations.length <= 1) return destinations || [];

  const map = new Map<string, ClientDestination>();

  for (const d of destinations) {
    const key = normalizeDestinationKey(d.citta, d.luogo, d.note);
    if (!map.has(key)) {
      const cleanLuogo = (d.luogo || "").replace(/\bVIIA\b/g, "VIA").replace(/\bVISA\b/g, "VIA");
      map.set(key, { ...d, luogo: cleanLuogo });
    } else {
      const existing = map.get(key)!;
      const cleanLuogo = (d.luogo || "").replace(/\bVIIA\b/g, "VIA").replace(/\bVISA\b/g, "VIA");
      // Sceglie la forma più estesa e pulita (es. con congiunzione o civico)
      if (cleanLuogo.length > (existing.luogo || "").length) {
        existing.luogo = cleanLuogo;
      }
      if (!existing.citta && d.citta) existing.citta = d.citta;
      if (!existing.note && d.note) existing.note = d.note;
    }
  }

  // Se c'è una voce senza città ma con indirizzo identico a una provvista di città, unifichiamo
  const items = Array.from(map.values());
  const finalResults: ClientDestination[] = [];

  for (let i = 0; i < items.length; i++) {
    const cur = items[i];

    if (!cur.citta && cur.luogo) {
      const curAddr = normalizeAddressForDeduplication(cur.luogo);
      if (curAddr) {
        const matchingWithCity = items.find(
          (other, j) => i !== j && other.citta && normalizeAddressForDeduplication(other.luogo) === curAddr
        );
        if (matchingWithCity) {
          continue;
        }
      }
    }

    finalResults.push(cur);
  }

  return finalResults;
}

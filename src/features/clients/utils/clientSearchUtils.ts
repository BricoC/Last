import type { Client } from "../models/client";

function normalize(text?: string | null): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenize(text?: string | null): string[] {
  if (!text) return [];
  return (normalize(text).match(/[a-z0-9]+/g) || []);
}

function cleanAlphanumeric(text?: string | null): string {
  if (!text) return "";
  return normalize(text).replace(/[^a-z0-9]/g, "");
}

/**
 * Filtra e ordina per rilevanza l'elenco clienti in base a una query di ricerca multi-parola.
 *
 * Regole fondamentali:
 * 1. Campi di ricerca ammessi: Ragione Sociale (business_name), Città (city), P.IVA e Codice Fiscale.
 *    (Gli indirizzi stradali e le destinazioni merci NON vengono cercati per evitare falsi positivi
 *     dovuti a vie con nomi di località o persone coincidenti con nomi di aziende).
 * 2. Se la query ha 2 o più parole (es. "car carr" o "cart ca"):
 *    - Ogni parola deve trovare corrispondenza in parole distinte.
 *    - ALMENO UNA parola deve trovare corrispondenza nella Ragione Sociale (business_name)
 *      (oppure in P.IVA / Codice Fiscale). Non è ammesso che tutte le parole soddisfino solo la città.
 *    - La stessa parola o radice (es. "carraia" presente sia nel nome che nella città) NON può
 *      essere utilizzata due volte per soddisfare due token differenti.
 * 3. Assegna punteggi di rilevanza prioritari a:
 *    - Corrispondenza di TUTTI i token all'interno della Ragione Sociale (+300 bonus enorme)
 *    - Prefisso esatto dell'intera ragione sociale (+200)
 *    - Prima parola della ragione sociale che inizia con il primo token (+100)
 *    - Parole della ragione sociale che iniziano con i token cercati (+50 prima parola, +35 successive)
 *    - Supporto per sigle/acronimi senza punti (es. "camm" -> "C.A.M.M.", "movi" -> "MO.VI")
 */
export function rankClientsBySearch(clients: Client[], query: string): Client[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [...clients].sort((a, b) =>
      a.business_name.localeCompare(b.business_name, "it", { sensitivity: "base" })
    );
  }

  const queryNorm = normalize(trimmed);
  const queryClean = cleanAlphanumeric(trimmed);
  const tokens = tokenize(trimmed);

  if (tokens.length === 0) {
    return [...clients];
  }

  const scored: { client: Client; score: number }[] = [];

  for (const client of clients) {
    const nameNorm = normalize(client.business_name);
    const nameClean = cleanAlphanumeric(client.business_name);
    const nameWords = tokenize(client.business_name);
    const cityWords = tokenize(client.city);

    const vatClean = cleanAlphanumeric(client.vat_number);
    const cfClean = cleanAlphanumeric(client.fiscal_code);

    let allMatched = true;
    let score = 0;

    // Bonus priorità prefisso sull'intera ragione sociale
    if (nameNorm.startsWith(queryNorm)) {
      score += 200;
    } else if (queryClean && nameClean.startsWith(queryClean)) {
      score += 150;
    } else if (nameWords.length > 0 && nameWords[0].startsWith(tokens[0])) {
      score += 100;
    }

    const usedNameIndices = new Set<number>();
    const usedCityIndices = new Set<number>();
    const matchedWordStems = new Set<string>();
    let codeMatched = false;

    for (const token of tokens) {
      let matched = false;
      const tokenClean = cleanAlphanumeric(token);

      // 1. Prefisso su parole non ancora utilizzate della ragione sociale
      for (let i = 0; i < nameWords.length; i++) {
        if (!usedNameIndices.has(i) && nameWords[i].startsWith(token)) {
          usedNameIndices.add(i);
          matchedWordStems.add(nameWords[i]);
          matched = true;
          score += (i === 0 ? 50 : 35);
          break;
        }
      }

      // 2. Sottostringa su parole non ancora utilizzate della ragione sociale
      if (!matched) {
        for (let i = 0; i < nameWords.length; i++) {
          if (!usedNameIndices.has(i) && nameWords[i].includes(token)) {
            usedNameIndices.add(i);
            matchedWordStems.add(nameWords[i]);
            matched = true;
            score += 15;
            break;
          }
        }
      }

      // 3. Corrispondenza su parole della città (city)
      // NON riutilizzare parole già usate nel nome (es. "carraia" presente sia nel nome che nel comune)
      if (!matched) {
        for (let i = 0; i < cityWords.length; i++) {
          const cWord = cityWords[i];
          if (!usedCityIndices.has(i) && !matchedWordStems.has(cWord)) {
            if (cWord.startsWith(token)) {
              usedCityIndices.add(i);
              matchedWordStems.add(cWord);
              matched = true;
              score += 15;
              break;
            } else if (cWord.includes(token)) {
              usedCityIndices.add(i);
              matchedWordStems.add(cWord);
              matched = true;
              score += 5;
              break;
            }
          }
        }
      }

      // 4. Corrispondenza su P.IVA o Codice Fiscale
      if (!matched) {
        if (vatClean && tokenClean && vatClean.includes(tokenClean)) {
          matched = true;
          codeMatched = true;
          score += 25;
        } else if (cfClean && tokenClean && cfClean.includes(tokenClean)) {
          matched = true;
          codeMatched = true;
          score += 25;
        }
      }

      // 5. Corrispondenza acronimi / sigle senza punteggiatura (es. "camm" -> "C.A.M.M.")
      if (!matched && tokens.length === 1 && tokenClean) {
        if (nameClean.includes(tokenClean)) {
          matched = true;
          usedNameIndices.add(0);
          score += 40;
        }
      }

      if (!matched) {
        allMatched = false;
        break;
      }
    }

    // Regola cardine per query multi-parola (es. "car carr"):
    // Almeno un token DEVE aver trovato corrispondenza nella ragione sociale (o P.IVA/CF).
    // Non è assolutamente accettabile che due o più parole cerchino un cliente e trovino
    // un'azienda il cui nome ha 0 corrispondenze solo perché risiede in quel comune.
    if (tokens.length >= 2 && usedNameIndices.size === 0 && !codeMatched) {
      allMatched = false;
    }

    if (allMatched) {
      // Bonus enorme se TUTTI i token hanno trovato corrispondenza nella ragione sociale
      if (usedNameIndices.size === tokens.length) {
        score += 300;
      }
      scored.push({ client, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.client.business_name.localeCompare(b.client.business_name, "it", { sensitivity: "base" });
  });

  return scored.map((s) => s.client);
}

import { getDatabase } from "@/shared/data-layer/database";

const GENERIC_CLIENT_WORDS = new Set([
  "FALEGNAMERIA", "OFFICINA", "CARROZZERIA", "IMPRESA", "DITTA", "STUDIO", "AZIENDA",
  "SOCIETA", "SOCIETÀ", "COOPERATIVA", "COOP", "SRL", "S.R.L.", "S.R.L", "SNC", "S.N.C.", "S.N.C",
  "SPA", "S.P.A.", "S.P.A", "SAS", "S.A.S.", "S.A.S", "SS", "S.S.", "DI", "DEI", "DEL", "DELLA",
  "E", "&", "LIST", "LISTINO", "ITALIA", "ITALY", "GROUP", "SERVIZI", "COMMERCIALE", "PRODUZIONE",
  "DISTRIBUZIONE", "INDUSTRIA", "INDUSTRIE", "IMPIANTI", "COSTRUZIONI", "LINEA", "SYSTEM", "SISTEM",
  "INTERNATIONAL", "GLOBAL"
]);

/**
 * Pulisce e normalizza il nome del cliente o listino rimuovendo prefissi e punteggiatura.
 */
export const cleanClientStr = (str: string): string => {
  if (!str) return "";
  return String(str)
    .toUpperCase()
    .replace(/^LIST[_\s\-]+/i, "")
    .replace(/^LISTINO[_\s\-]+/i, "")
    .replace(/[.,\-_/\\()]/g, " ")
    .trim();
};

/**
 * Verifica se il nome del cliente cercato coincide o è semanticamente associato al listino cliente.
 * Supporta:
 * - Uguaglianza esatta
 * - Acronimi con o senza punti (es. CAMM <-> C.A.M.M.)
 * - Alias storici noti (es. Cartiere Carrara <-> CARMA, Barsella <-> Barsella)
 * - Match sul token primario distintivo (es. WEPA ITALIA <-> LIST_WEPA LISTINO)
 */
export const isClientMatching = (clientSearchName: string, rowClientName: string): boolean => {
  if (!clientSearchName || !rowClientName) return false;

  const cClean = cleanClientStr(clientSearchName);
  const rClean = cleanClientStr(rowClientName);

  if (!cClean || !rClean) return false;
  if (cClean === rClean) return true;

  // 1. Acronimi senza spazi/punteggiatura (es. CAMM <-> C.A.M.M.)
  const cNoSpaces = cClean.replace(/\s+/g, "");
  const rNoSpaces = rClean.replace(/\s+/g, "");
  if (cNoSpaces && rNoSpaces && (cNoSpaces === rNoSpaces || cNoSpaces.includes(rNoSpaces) || rNoSpaces.includes(cNoSpaces))) {
    if (cNoSpaces.length >= 3 && rNoSpaces.length >= 3) return true;
  }

  // 2. Alias noti diretti da NoManV1
  if ((cClean.includes("CARTIERE") || cClean.includes("CARRARA")) && rClean.includes("CARMA")) return true;
  if (rClean.includes("CARMA") && (cClean.includes("CARTIERE") || cClean.includes("CARRARA"))) return true;
  if (cClean.includes("BARSELLA") && rClean.includes("BARSELLA")) return true;

  // 3. Match semantico per token caratteristici (escluse parole generiche come SRL, ITALIA, ecc.)
  const cTokens = cClean.split(/\s+/).filter((t) => t.length > 2 && !GENERIC_CLIENT_WORDS.has(t));
  const rTokens = rClean.split(/\s+/).filter((t) => t.length > 2 && !GENERIC_CLIENT_WORDS.has(t));

  if (cTokens.length > 0 && rTokens.length > 0) {
    const primaryToken = cTokens[0];
    const matchPrimary = rTokens.some(
      (rt) => rt === primaryToken || (primaryToken.length >= 4 && rt.startsWith(primaryToken))
    );
    if (matchPrimary) return true;

    if (cTokens.length >= 2 && cTokens.every((ct) => rTokens.includes(ct))) return true;
    if (rTokens.length >= 2 && rTokens.every((rt) => cTokens.includes(rt))) return true;
  }

  return false;
};

/**
 * Risolve i nomi esatti dei listini associati a un cliente interrogando:
 * 1. La tabella `clients` locale (campo `price_lists_json`)
 * 2. Gli alias e il match semantico (`isClientMatching`) tra tutti i listini presenti in `listini_clienti`
 */
export const resolveClientPriceLists = async (clientName: string): Promise<string[]> => {
  const clean = cleanClientStr(clientName);
  if (!clean || clean === "TUTTI") return [];

  const db = await getDatabase();

  // 1. Cerca in clients.price_lists_json
  try {
    const clientRows = await db.select<Array<{ price_lists_json: string | null }>>(
      `SELECT price_lists_json FROM clients 
       WHERE deleted_at IS NULL AND price_lists_json IS NOT NULL AND price_lists_json != '[]'
         AND (
           LOWER(TRIM(business_name)) = LOWER($1)
           OR LOWER($1) LIKE '%' || LOWER(TRIM(business_name)) || '%'
           OR LOWER(TRIM(business_name)) LIKE '%' || LOWER($1) || '%'
         )
       LIMIT 1`,
      [clean]
    );

    if (clientRows.length > 0 && clientRows[0].price_lists_json) {
      const parsed = JSON.parse(clientRows[0].price_lists_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter((p): p is string => typeof p === "string" && Boolean(p.trim()));
        if (valid.length > 0) return valid;
      }
    }
  } catch (err) {
    console.warn("[clientPriceListMatcher] Errore lookup price_lists_json:", err);
  }

  // 2. Fallback su isClientMatching interrogando tutti i listini distinti disponibili
  try {
    const listiniRows = await db.select<Array<{ cliente: string }>>(
      `SELECT DISTINCT cliente FROM listini_clienti 
       WHERE cliente NOT LIKE 'LIST_000%' AND cliente != 'LIST_'`
    );
    const matched = listiniRows
      .map((r) => r.cliente)
      .filter((plName) => isClientMatching(clean, plName));

    if (matched.length > 0) {
      return matched;
    }
  } catch (err) {
    console.warn("[clientPriceListMatcher] Errore lookup listini_clienti:", err);
  }

  return [`LIST_${clean}`];
};


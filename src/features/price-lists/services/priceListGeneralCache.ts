import { priceListRepository } from "./priceListRepository";
import { ListinoGeneraleRow } from "../models/priceList";

let cachedGeneralList: ListinoGeneraleRow[] | null = null;
let fetchPromise: Promise<ListinoGeneraleRow[]> | null = null;

/**
 * Cache globale condivisa del listino generale (in memoria)
 * per evitare query SQLite ripetute su decine di migliaia di record ad ogni apertura di modali.
 */
export async function getCachedGeneralList(limit = 50000, forceRefresh = false): Promise<ListinoGeneraleRow[]> {
  if (cachedGeneralList && !forceRefresh) {
    return cachedGeneralList;
  }
  if (fetchPromise && !forceRefresh) {
    return fetchPromise;
  }

  fetchPromise = priceListRepository
    .searchGeneral("", limit)
    .then((rows) => {
      cachedGeneralList = rows;
      fetchPromise = null;
      return rows;
    })
    .catch((err) => {
      fetchPromise = null;
      throw err;
    });

  return fetchPromise;
}

export function invalidateGeneralListCache(): void {
  cachedGeneralList = null;
  fetchPromise = null;
}

export function setCachedGeneralList(rows: ListinoGeneraleRow[]): void {
  cachedGeneralList = rows;
}

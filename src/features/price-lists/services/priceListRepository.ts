import { getDatabase } from "@/shared/data-layer/database";
import { ListinoGeneraleRow, ListinoClienteRow, PriceListLogEntry } from "../models/priceList";

export class PriceListRepository {
  /**
   * Conteggio totale articoli Listino Generale in SQLite locale.
   */
  async getGeneralCount(): Promise<number> {
    const db = await getDatabase();
    const rows = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM listino_generale;"
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * Ricerca full-text tokenizzata su Listino Generale.
   * Divide la stringa di ricerca in token e ricerca su descrizione, codice_articolo, fornitore e categoria.
   */
  async searchGeneral(query: string, limit: number = 50000): Promise<ListinoGeneraleRow[]> {
    const db = await getDatabase();
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

    if (tokens.length === 0) {
      return await db.select<ListinoGeneraleRow[]>(
        `SELECT * FROM listino_generale ORDER BY descrizione ASC LIMIT $1;`,
        [limit]
      );
    }

    const conditions: string[] = [];
    const params: any[] = [];

    tokens.forEach((t, idx) => {
      params.push(`%${t}%`);
      const pIdx = `$${idx + 1}`;
      conditions.push(
        `(LOWER(descrizione) LIKE ${pIdx} OR LOWER(codice_articolo) LIKE ${pIdx} OR LOWER(fornitore) LIKE ${pIdx} OR LOWER(cat) LIKE ${pIdx})`
      );
    });

    params.push(limit);
    const limitIdx = `$${params.length}`;

    const sql = `
      SELECT * FROM listino_generale 
      WHERE ${conditions.join(" AND ")}
      ORDER BY descrizione ASC 
      LIMIT ${limitIdx};
    `;

    return await db.select<ListinoGeneraleRow[]>(sql, params);
  }

  /**
   * Conteggio totale voci Listini Clienti reali in SQLite locale (esclusi test LIST_000 e LIST_).
   */
  async getClientPriceCount(clientFilter?: string): Promise<number> {
    const db = await getDatabase();
    if (clientFilter && clientFilter !== "TUTTI") {
      const cleanFilter = clientFilter.trim().replace(/^LIST_/, "").toLowerCase();
      const rows = await db.select<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM listini_clienti 
         WHERE (
           LOWER(TRIM(REPLACE(cliente, 'LIST_', ''))) = $1
           OR LOWER(cliente) = $1
           OR LOWER(cliente) = 'list_' || $1
           OR LOWER(cliente) LIKE '%' || $1 || '%'
           OR $1 LIKE '%' || LOWER(TRIM(REPLACE(cliente, 'LIST_', ''))) || '%'
         )
         AND cliente NOT LIKE 'LIST_000%' 
         AND cliente != 'LIST_';`,
        [cleanFilter]
      );
      return rows[0]?.count ?? 0;
    }
    const rows = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM listini_clienti 
       WHERE cliente NOT LIKE 'LIST_000%' 
         AND cliente != 'LIST_' 
         AND TRIM(REPLACE(cliente, 'LIST_', '')) != '';`
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * Restituisce tutti i clienti distinti reali (con prefisso LIST_ già rimosso).
   */
  async getDistinctClients(): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.select<{ cliente: string }[]>(
      `SELECT DISTINCT cliente FROM listini_clienti 
       WHERE cliente NOT LIKE 'LIST_000%' 
         AND cliente != 'LIST_' 
         AND TRIM(REPLACE(cliente, 'LIST_', '')) != ''
       ORDER BY cliente ASC;`
    );
    return rows
      .map((r) => r.cliente.replace(/^LIST_/, "").trim())
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => a.localeCompare(b, "it"));
  }

  /**
   * Ricerca full-text su Listini Clienti (esclusi test LIST_000 e LIST_).
   */
  async searchClientPrices(
    query: string,
    clientFilter?: string,
    limit: number = 20000
  ): Promise<ListinoClienteRow[]> {
    const db = await getDatabase();
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

    const conditions: string[] = [
      "cliente NOT LIKE 'LIST_000%'",
      "cliente != 'LIST_'",
      "TRIM(REPLACE(cliente, 'LIST_', '')) != ''",
    ];
    const params: any[] = [];

    if (clientFilter && clientFilter !== "TUTTI") {
      const cleanFilter = clientFilter.trim().replace(/^LIST_/, "").toLowerCase();
      params.push(cleanFilter);
      const cIdx = `$${params.length}`;
      conditions.push(`(
        LOWER(TRIM(REPLACE(cliente, 'LIST_', ''))) = ${cIdx}
        OR LOWER(cliente) = ${cIdx}
        OR LOWER(cliente) = 'list_' || ${cIdx}
        OR LOWER(cliente) LIKE '%' || ${cIdx} || '%'
        OR ${cIdx} LIKE '%' || LOWER(TRIM(REPLACE(cliente, 'LIST_', ''))) || '%'
      )`);
    }

    tokens.forEach((t) => {
      params.push(`%${t}%`);
      const pIdx = `$${params.length}`;
      conditions.push(
        `(LOWER(descrizione) LIKE ${pIdx} OR LOWER(codice_articolo) LIKE ${pIdx} OR LOWER(cliente) LIKE ${pIdx})`
      );
    });

    params.push(limit);
    const limitIdx = `$${params.length}`;

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const sql = `
      SELECT * FROM listini_clienti 
      ${whereClause}
      ORDER BY cliente ASC, descrizione ASC 
      LIMIT ${limitIdx};
    `;

    const rows = await db.select<ListinoClienteRow[]>(sql, params);
    // Pulizia a runtime del nome cliente da prefisso LIST_
    return rows.map((r) => ({
      ...r,
      cliente: r.cliente.replace(/^LIST_/, "").trim(),
    }));
  }

  /**
   * Ricerca storico modifiche di una riga/articolo da listini_prezzi_log (massimo 15 modifiche).
   */
  async getItemPriceHistory(codiceArticolo: string): Promise<PriceListLogEntry[]> {
    if (!codiceArticolo) return [];
    const db = await getDatabase();
    return await db.select<PriceListLogEntry[]>(
      `SELECT * FROM listini_prezzi_log 
       WHERE codice_articolo = $1 
       ORDER BY created_at DESC 
       LIMIT 15;`,
      [codiceArticolo]
    );
  }
}

export const priceListRepository = new PriceListRepository();

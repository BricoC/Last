import { getDatabase } from "@/shared/data-layer/database";
import { ListinoGeneraleRow, ListinoClienteRow } from "../models/priceList";

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
  async searchGeneral(query: string, limit: number = 2000): Promise<ListinoGeneraleRow[]> {
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
   * Conteggio totale voci Listini Clienti in SQLite locale.
   */
  async getClientPriceCount(clientFilter?: string): Promise<number> {
    const db = await getDatabase();
    if (clientFilter && clientFilter !== "TUTTI") {
      const rows = await db.select<{ count: number }[]>(
        "SELECT COUNT(*) as count FROM listini_clienti WHERE cliente = $1;",
        [clientFilter]
      );
      return rows[0]?.count ?? 0;
    }
    const rows = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM listini_clienti;"
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * Restituisce tutti i clienti distinti presenti nei listini clienti per il filtro/tendina.
   */
  async getDistinctClients(): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.select<{ cliente: string }[]>(
      "SELECT DISTINCT cliente FROM listini_clienti WHERE cliente IS NOT NULL AND cliente != '' ORDER BY cliente ASC;"
    );
    return rows.map((r) => r.cliente);
  }

  /**
   * Ricerca full-text su Listini Clienti con filtro cliente facoltativo.
   */
  async searchClientPrices(
    query: string,
    clientFilter?: string,
    limit: number = 2000
  ): Promise<ListinoClienteRow[]> {
    const db = await getDatabase();
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

    const conditions: string[] = [];
    const params: any[] = [];

    if (clientFilter && clientFilter !== "TUTTI") {
      params.push(clientFilter);
      conditions.push(`cliente = $${params.length}`);
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT * FROM listini_clienti 
      ${whereClause}
      ORDER BY cliente ASC, descrizione ASC 
      LIMIT ${limitIdx};
    `;

    return await db.select<ListinoClienteRow[]>(sql, params);
  }

  /**
   * Ricerca prezzi praticati a un determinato cliente su uno o più articoli.
   */
  async getClientPricesForCustomer(clientName: string): Promise<ListinoClienteRow[]> {
    const db = await getDatabase();
    return await db.select<ListinoClienteRow[]>(
      `SELECT * FROM listini_clienti 
       WHERE cliente = $1 
       ORDER BY descrizione ASC;`,
      [clientName]
    );
  }
}

export const priceListRepository = new PriceListRepository();

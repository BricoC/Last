import { getDatabase } from "@/shared/data-layer/database";
import { ListinoGeneraleRow, ListinoClienteRow, PriceListLogEntry } from "../models/priceList";
import { resolveClientPriceLists } from "@/features/ddt-studio/utils/clientPriceListMatcher";

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
      const resolved = await resolveClientPriceLists(clientFilter);
      if (resolved.length > 0) {
        const plConditions = resolved.map((pl) => {
          params.push(pl.toLowerCase());
          params.push(pl.replace(/^LIST_/, "").toLowerCase());
          return `(LOWER(cliente) = $${params.length - 1} OR LOWER(TRIM(REPLACE(cliente, 'LIST_', ''))) = $${params.length})`;
        });
        conditions.push(`(${plConditions.join(" OR ")})`);
      } else {
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

  /**
   * Registra variazioni di prezzo nello storico listini_prezzi_log.
   */
  async logPriceChanges(entries: Omit<PriceListLogEntry, "id">[]): Promise<void> {
    if (entries.length === 0) return;
    const db = await getDatabase();
    await db.execute("BEGIN TRANSACTION;");
    try {
      for (const entry of entries) {
        await db.execute(
          `INSERT INTO listini_prezzi_log (
            created_at, tipo_listino, cliente, codice_articolo, descrizione,
            campo_modificato, vecchio_valore, nuovo_valore, variazione_pct,
            operatore, motivo
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`,
          [
            entry.created_at || new Date().toISOString(),
            entry.tipo_listino || "generale",
            entry.cliente || "",
            entry.codice_articolo,
            entry.descrizione || null,
            entry.campo_modificato,
            entry.vecchio_valore ?? null,
            entry.nuovo_valore ?? null,
            entry.variazione_pct ?? null,
            entry.operatore || "Operatore",
            entry.motivo ?? null,
          ]
        );
      }
      await db.execute("COMMIT;");
    } catch (err) {
      await db.execute("ROLLBACK;");
      console.error("[PriceListRepository] Errore inserimento log:", err);
    }
  }

  /**
   * Salva o aggiorna un lotto di articoli del Listino Generale nel database SQLite locale.
   */
  async saveGeneralRows(rows: ListinoGeneraleRow[]): Promise<void> {
    if (rows.length === 0) return;
    const db = await getDatabase();
    await db.execute("BEGIN TRANSACTION;");
    try {
      for (const row of rows) {
        await db.execute(
          `INSERT INTO listino_generale (
            id, source_table, cat, fornitore, codice_articolo, data_ref,
            descrizione, um, perc_pub, prezzo_pubblico, perc_prof, prezzo_profess,
            perc_fatt, prezzo_fattura, prezzo_acquisto, aumento, r1, maga, r2,
            perc_iva, note, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
          ON CONFLICT(id) DO UPDATE SET
            cat = excluded.cat,
            fornitore = excluded.fornitore,
            codice_articolo = excluded.codice_articolo,
            data_ref = excluded.data_ref,
            descrizione = excluded.descrizione,
            um = excluded.um,
            perc_pub = excluded.perc_pub,
            prezzo_pubblico = excluded.prezzo_pubblico,
            perc_prof = excluded.perc_prof,
            prezzo_profess = excluded.prezzo_profess,
            perc_fatt = excluded.perc_fatt,
            prezzo_fattura = excluded.prezzo_fattura,
            prezzo_acquisto = excluded.prezzo_acquisto,
            aumento = excluded.aumento,
            r1 = excluded.r1,
            maga = excluded.maga,
            r2 = excluded.r2,
            perc_iva = excluded.perc_iva,
            note = excluded.note,
            updated_at = excluded.updated_at;`,
          [
            row.id,
            row.source_table || "listino_generale",
            row.cat ?? null,
            row.fornitore ?? null,
            row.codice_articolo ?? null,
            row.data_ref ?? null,
            row.descrizione,
            row.um ?? "NR.",
            row.perc_pub ?? null,
            row.prezzo_pubblico ?? null,
            row.perc_prof ?? null,
            row.prezzo_profess ?? null,
            row.perc_fatt ?? null,
            row.prezzo_fattura ?? null,
            row.prezzo_acquisto ?? null,
            row.aumento ?? null,
            row.r1 ?? null,
            row.maga ?? null,
            row.r2 ?? null,
            row.perc_iva ?? 0.22,
            row.note ?? null,
            row.created_at || new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
      }
      await db.execute("COMMIT;");
    } catch (err) {
      await db.execute("ROLLBACK;");
      throw err;
    }
  }

  /**
   * Elimina un lotto di articoli del Listino Generale per ID da SQLite locale.
   */
  async deleteGeneralRows(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDatabase();
    await db.execute("BEGIN TRANSACTION;");
    try {
      for (const id of ids) {
        await db.execute("DELETE FROM listino_generale WHERE id = $1;", [id]);
      }
      await db.execute("COMMIT;");
    } catch (err) {
      await db.execute("ROLLBACK;");
      throw err;
    }
  }
}

export const priceListRepository = new PriceListRepository();

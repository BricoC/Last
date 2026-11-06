import { getDatabase } from "@/shared/data-layer/database";
import {
  ListinoGeneraleRow,
  ListinoClienteRow,
  PriceListLogEntry,
  TrashListinoRow,
  TrashListinoClienteRow,
} from "../models/priceList";
import { resolveClientPriceLists } from "@/features/ddt-studio/utils/clientPriceListMatcher";

function cleanNum5(val: number | null | undefined): number | null {
  if (val == null || isNaN(val) || !isFinite(val)) return null;
  return Math.round(val * 100000) / 100000;
}

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
   * Restituisce la data/ora ISO più recente registrata per il listino generale
   * confrontando listini_prezzi_log e listino_generale.updated_at.
   */
  async getLastModificationTime(): Promise<string | null> {
    const db = await getDatabase();
    let latestTimestamp: string | null = null;

    try {
      const logRows = await db.select<{ created_at: string }[]>(
        `SELECT created_at FROM listini_prezzi_log 
         WHERE (tipo_listino = 'generale' OR tipo_listino IS NULL) 
           AND created_at IS NOT NULL AND created_at != ''
         ORDER BY created_at DESC LIMIT 1;`
      );
      if (logRows.length > 0 && logRows[0]?.created_at) {
        latestTimestamp = logRows[0].created_at;
      }
    } catch (err) {
      console.warn("[PriceListRepository] Errore lettura ultimo log:", err);
    }

    try {
      const genRows = await db.select<{ updated_at: string }[]>(
        `SELECT updated_at FROM listino_generale 
         WHERE updated_at IS NOT NULL AND updated_at != '' 
         ORDER BY updated_at DESC LIMIT 1;`
      );
      if (genRows.length > 0 && genRows[0]?.updated_at) {
        const genDate = genRows[0].updated_at;
        if (!latestTimestamp || genDate > latestTimestamp) {
          latestTimestamp = genDate;
        }
      }
    } catch (err) {
      console.warn("[PriceListRepository] Errore lettura ultimo updated_at:", err);
    }

    return latestTimestamp;
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

  private schemaLogChecked = false;
  private async ensureLogColumns(): Promise<void> {
    if (this.schemaLogChecked) return;
    try {
      const db = await getDatabase();
      try { await db.execute("ALTER TABLE listini_prezzi_log ADD COLUMN row_id TEXT;"); } catch {}
      try { await db.execute("ALTER TABLE listini_prezzi_log ADD COLUMN vecchio_testo TEXT;"); } catch {}
      try { await db.execute("ALTER TABLE listini_prezzi_log ADD COLUMN nuovo_testo TEXT;"); } catch {}
      try { await db.execute("CREATE INDEX IF NOT EXISTS idx_listini_log_row ON listini_prezzi_log(row_id);"); } catch {}
      this.schemaLogChecked = true;
    } catch {}
  }

  /**
   * Ricerca storico modifiche di una riga/articolo da listini_prezzi_log (massimo 30 modifiche).
   * Ricerca per row_id (id fisso), codice_articolo oppure per descrizione.
   */
  async getItemPriceHistory(
    codiceArticolo?: string | null,
    rowId?: string | null,
    descrizione?: string | null
  ): Promise<PriceListLogEntry[]> {
    const db = await getDatabase();
    await this.ensureLogColumns();
    const conds: string[] = [];
    const params: any[] = [];

    if (rowId && rowId.trim()) {
      params.push(rowId.trim());
      conds.push(`row_id = $${params.length}`);
    }
    if (codiceArticolo && codiceArticolo.trim()) {
      params.push(codiceArticolo.trim());
      conds.push(`codice_articolo = $${params.length}`);
    }
    if (rowId && rowId.trim()) {
      params.push(rowId.trim());
      conds.push(`codice_articolo = $${params.length}`);
    }
    if (descrizione && descrizione.trim()) {
      params.push(descrizione.trim());
      conds.push(`descrizione = $${params.length}`);
    }

    if (conds.length === 0) return [];

    return await db.select<PriceListLogEntry[]>(
      `SELECT * FROM listini_prezzi_log 
       WHERE ${conds.join(" OR ")} 
       ORDER BY created_at DESC 
       LIMIT 30;`,
      params
    );
  }

  /**
   * Registra variazioni di prezzo e testi nello storico listini_prezzi_log.
   */
  async logPriceChanges(entries: Omit<PriceListLogEntry, "id">[]): Promise<void> {
    if (entries.length === 0) return;
    const db = await getDatabase();
    await this.ensureLogColumns();
    for (const entry of entries) {
      try {
        await db.execute(
          `INSERT INTO listini_prezzi_log (
            row_id, created_at, tipo_listino, cliente, codice_articolo, descrizione,
            campo_modificato, vecchio_valore, nuovo_valore, vecchio_testo, nuovo_testo,
            variazione_pct, operatore, motivo
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);`,
          [
            entry.row_id ?? null,
            entry.created_at || new Date().toISOString(),
            entry.tipo_listino || "generale",
            entry.cliente || "",
            entry.codice_articolo || "SCONOSCIUTO",
            entry.descrizione || null,
            entry.campo_modificato,
            cleanNum5(entry.vecchio_valore),
            cleanNum5(entry.nuovo_valore),
            entry.vecchio_testo ?? null,
            entry.nuovo_testo ?? null,
            cleanNum5(entry.variazione_pct),
            entry.operatore || "Operatore",
            entry.motivo ?? null,
          ]
        );
      } catch (err) {
        console.warn("[PriceListRepository] Skip log entry error:", err);
      }
    }
  }

  /**
   * Salva o aggiorna un lotto di articoli del Listino Generale nel database SQLite locale.
   */
  async saveGeneralRows(rows: ListinoGeneraleRow[]): Promise<void> {
    if (rows.length === 0) return;
    const db = await getDatabase();
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
          row.descrizione || "",
          row.um ?? "NR.",
          cleanNum5(row.perc_pub),
          cleanNum5(row.prezzo_pubblico),
          cleanNum5(row.perc_prof),
          cleanNum5(row.prezzo_profess),
          cleanNum5(row.perc_fatt),
          cleanNum5(row.prezzo_fattura),
          cleanNum5(row.prezzo_acquisto),
          cleanNum5(row.aumento),
          cleanNum5(row.r1),
          cleanNum5(row.maga),
          cleanNum5(row.r2),
          cleanNum5(row.perc_iva ?? 0.22),
          row.note ?? null,
          row.created_at || new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    }
  }

  /**
   * Elimina un lotto di articoli del Listino Generale per ID da SQLite locale.
   */
  async deleteGeneralRows(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDatabase();
    for (const id of ids) {
      await db.execute("DELETE FROM listino_generale WHERE id = $1;", [id]);
    }
  }

  /**
   * Sposta uno o più articoli nel Cestino (massimo 30 elementi a scorrimento FIFO)
   * e li rimuove dal listino generale attivo.
   */
  async moveToTrash(rows: ListinoGeneraleRow[], deletedBy?: string): Promise<void> {
    if (rows.length === 0) return;
    const db = await getDatabase();
    const now = new Date().toISOString();
    const op = deletedBy || "Operatore";

    for (const row of rows) {
      await db.execute(
        `INSERT INTO listino_generale_cestino (
          id, deleted_at, deleted_by, source_table, cat, fornitore, codice_articolo, data_ref,
          descrizione, um, perc_pub, prezzo_pubblico, perc_prof, prezzo_profess,
          perc_fatt, prezzo_fattura, prezzo_acquisto, aumento, r1, maga, r2,
          perc_iva, note, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
        ON CONFLICT(id) DO UPDATE SET
          deleted_at = excluded.deleted_at,
          deleted_by = excluded.deleted_by,
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
          now,
          op,
          row.source_table || "listino_generale",
          row.cat ?? null,
          row.fornitore ?? null,
          row.codice_articolo ?? null,
          row.data_ref ?? null,
          row.descrizione || "",
          row.um ?? "NR.",
          cleanNum5(row.perc_pub),
          cleanNum5(row.prezzo_pubblico),
          cleanNum5(row.perc_prof),
          cleanNum5(row.prezzo_profess),
          cleanNum5(row.perc_fatt),
          cleanNum5(row.prezzo_fattura),
          cleanNum5(row.prezzo_acquisto),
          cleanNum5(row.aumento),
          cleanNum5(row.r1),
          cleanNum5(row.maga),
          cleanNum5(row.r2),
          cleanNum5(row.perc_iva ?? 0.22),
          row.note ?? null,
          row.created_at || now,
          now,
        ]
      );

      await db.execute("DELETE FROM listino_generale WHERE id = $1;", [row.id]);
    }

    // Tronca il cestino alle ultime 50 voci (FIFO: le più vecchie vengono eliminate)
    await db.execute(`
      DELETE FROM listino_generale_cestino 
      WHERE id NOT IN (
        SELECT id FROM listino_generale_cestino 
        ORDER BY deleted_at DESC 
        LIMIT 50
      );
    `);
  }

  /**
   * Restituisce gli articoli nel cestino ordinati dal più recente al più vecchio (max 50).
   */
  async getTrashItems(): Promise<TrashListinoRow[]> {
    const db = await getDatabase();
    return await db.select<TrashListinoRow[]>(
      "SELECT * FROM listino_generale_cestino ORDER BY deleted_at DESC LIMIT 50;"
    );
  }

  /**
   * Conteggio voci nel cestino.
   */
  async getTrashCount(): Promise<number> {
    const db = await getDatabase();
    const rows = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM listino_generale_cestino;"
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * Ripristina un articolo dal Cestino al Listino Generale attivo.
   */
  async restoreFromTrash(id: string): Promise<ListinoGeneraleRow | null> {
    const db = await getDatabase();
    const rows = await db.select<ListinoGeneraleRow[]>(
      "SELECT * FROM listino_generale_cestino WHERE id = $1 LIMIT 1;",
      [id]
    );
    if (rows.length === 0) return null;

    const row = rows[0];
    await this.saveGeneralRows([row]);
    await db.execute("DELETE FROM listino_generale_cestino WHERE id = $1;", [id]);

    return row;
  }

  /**
   * Salva o aggiorna un batch di righe di Listini Clienti in SQLite.
   */
  async saveClientRows(rows: ListinoClienteRow[]): Promise<void> {
    if (rows.length === 0) return;
    const db = await getDatabase();
    for (const row of rows) {
      await db.execute(
        `INSERT INTO listini_clienti (
          id, cliente, fornitore, codice_articolo, descrizione,
          prezzo_fattura, prezzo_acquisto, acquisto_eur, perc_acquisto,
          data_acquisto, acquisto_old, ricarico, data_ref,
          note, note1, note2, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT(id) DO UPDATE SET
          cliente = excluded.cliente,
          fornitore = excluded.fornitore,
          codice_articolo = excluded.codice_articolo,
          descrizione = excluded.descrizione,
          prezzo_fattura = excluded.prezzo_fattura,
          prezzo_acquisto = excluded.prezzo_acquisto,
          acquisto_eur = excluded.acquisto_eur,
          perc_acquisto = excluded.perc_acquisto,
          data_acquisto = excluded.data_acquisto,
          acquisto_old = excluded.acquisto_old,
          ricarico = excluded.ricarico,
          data_ref = excluded.data_ref,
          note = excluded.note,
          note1 = excluded.note1,
          note2 = excluded.note2,
          updated_at = excluded.updated_at;`,
        [
          row.id,
          row.cliente,
          row.fornitore ?? null,
          row.codice_articolo ?? null,
          row.descrizione,
          cleanNum5(row.prezzo_fattura),
          cleanNum5(row.prezzo_acquisto),
          cleanNum5(row.acquisto_eur),
          cleanNum5(row.perc_acquisto),
          row.data_acquisto ?? null,
          row.acquisto_old ?? null,
          cleanNum5(row.ricarico),
          row.data_ref ?? null,
          row.note ?? null,
          row.note1 ?? null,
          row.note2 ?? null,
          row.created_at || new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    }
  }

  /**
   * Sposta uno o più articoli nel Cestino Clienti (massimo 50 elementi a scorrimento FIFO)
   */
  async moveToClientTrash(rows: ListinoClienteRow[], deletedBy?: string): Promise<TrashListinoClienteRow[]> {
    if (rows.length === 0) return [];
    const db = await getDatabase();
    const nowIso = new Date().toISOString();
    const operator = deletedBy || "Operatore";

    const trashEntries: TrashListinoClienteRow[] = [];

    for (const row of rows) {
      const trashItem: TrashListinoClienteRow = {
        ...row,
        deleted_at: nowIso,
        deleted_by: operator,
      };
      trashEntries.push(trashItem);

      await db.execute(
        `INSERT INTO listini_clienti_cestino (
          id, deleted_at, deleted_by, cliente, fornitore, codice_articolo, descrizione,
          prezzo_fattura, acquisto_eur, perc_acquisto, data_acquisto,
          acquisto_old, ricarico, data_ref, note, note1, note2, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT(id) DO UPDATE SET
          deleted_at = excluded.deleted_at,
          deleted_by = excluded.deleted_by;`,
        [
          row.id,
          nowIso,
          operator,
          row.cliente,
          row.fornitore ?? null,
          row.codice_articolo ?? null,
          row.descrizione,
          cleanNum5(row.prezzo_fattura),
          cleanNum5(row.acquisto_eur),
          cleanNum5(row.perc_acquisto),
          row.data_acquisto ?? null,
          row.acquisto_old ?? null,
          cleanNum5(row.ricarico),
          row.data_ref ?? null,
          row.note ?? null,
          row.note1 ?? null,
          row.note2 ?? null,
          row.created_at ?? null,
          row.updated_at ?? null,
        ]
      );

      // Rimuovi dalla tabella attiva
      await db.execute("DELETE FROM listini_clienti WHERE id = $1;", [row.id]);
    }

    // Tronca il cestino alle ultime 50 voci (FIFO: le più vecchie vengono eliminate)
    await db.execute(`
      DELETE FROM listini_clienti_cestino
      WHERE id NOT IN (
        SELECT id FROM listini_clienti_cestino
        ORDER BY deleted_at DESC
        LIMIT 50
      );
    `);

    return trashEntries;
  }

  /**
   * Restituisce gli articoli nel cestino clienti ordinati dal più recente al più vecchio (max 50).
   */
  async getClientTrashItems(): Promise<TrashListinoClienteRow[]> {
    const db = await getDatabase();
    return await db.select<TrashListinoClienteRow[]>(
      "SELECT * FROM listini_clienti_cestino ORDER BY deleted_at DESC LIMIT 50;"
    );
  }

  /**
   * Conteggio voci nel cestino clienti.
   */
  async getClientTrashCount(): Promise<number> {
    const db = await getDatabase();
    const rows = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM listini_clienti_cestino;"
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * Ripristina un articolo dal Cestino al Listino Clienti attivo.
   */
  async restoreFromClientTrash(id: string): Promise<ListinoClienteRow | null> {
    const db = await getDatabase();
    const rows = await db.select<ListinoClienteRow[]>(
      "SELECT * FROM listini_clienti_cestino WHERE id = $1 LIMIT 1;",
      [id]
    );
    if (!rows || rows.length === 0) return null;

    const row = rows[0];
    await this.saveClientRows([row]);
    await db.execute("DELETE FROM listini_clienti WHERE id = $1;", [id]);

    return row;
  }

  /**
   * Svuota completamente il cestino clienti.
   */
  async emptyClientTrash(): Promise<void> {
    const db = await getDatabase();
    await db.execute("DELETE FROM listini_clienti_cestino;");
  }
}

export const priceListRepository = new PriceListRepository();

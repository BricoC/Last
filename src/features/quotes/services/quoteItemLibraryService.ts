import { getDatabase } from "@/shared/data-layer/database";
import { MonetaryValue, money } from "@/shared/domain/monetaryValue";
import type { QuoteVatRate } from "../models/quote";
import type {
  QuoteFavoriteItem,
  QuoteFavoriteItemInput,
  QuoteHistoricalItem,
} from "../models/quoteLibrary";

interface FavoriteRow {
  id: string;
  category: string;
  description: string;
  unit: string;
  supplier: string | null;
  supplier_item_code: string | null;
  code: string | null;
  purchase_price_subunits: number;
  markup_pct: string | null;
  base_unit_price_subunits: number;
  forced_unit_price_subunits: number | null;
  discount_pct: string;
  vat_rate: number;
  availability: string | null;
  notes: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

interface HistoricalRow {
  id: string;
  quote_id: string;
  quote_number: number | null;
  year: number;
  quote_date: string;
  client_name: string;
  description: string;
  unit: string;
  quantity: string;
  supplier: string | null;
  supplier_item_code: string | null;
  code: string | null;
  purchase_price_subunits: number;
  markup_pct: string | null;
  base_unit_price_subunits: number;
  effective_unit_price_subunits: number;
  forced_unit_price_subunits: number | null;
  discount_pct: string;
  vat_rate: number;
  availability: string | null;
  notes: string | null;
}

export class QuoteItemLibraryService {
  /**
   * Recupera le voci preferite salvate, opzionalmente filtrate per categoria e/o testo.
   */
  public async getFavoriteItems(category?: string, search?: string): Promise<QuoteFavoriteItem[]> {
    const db = await getDatabase();
    const conditions: string[] = ["deleted_at IS NULL"];
    const params: any[] = [];

    if (category && category !== "Tutti") {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const pIdx = `$${params.length}`;
      conditions.push(
        `(LOWER(description) LIKE ${pIdx} OR LOWER(COALESCE(supplier, '')) LIKE ${pIdx} OR LOWER(COALESCE(code, '')) LIKE ${pIdx} OR LOWER(COALESCE(supplier_item_code, '')) LIKE ${pIdx})`
      );
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await db.select<FavoriteRow[]>(
      `SELECT * FROM quote_favorite_items ${whereClause} ORDER BY usage_count DESC, updated_at DESC LIMIT 300`,
      params
    );

    return rows.map(this.mapFavoriteRow);
  }

  /**
   * Salva o aggiorna una voce tra i preferiti.
   */
  public async saveFavoriteItem(input: QuoteFavoriteItemInput): Promise<QuoteFavoriteItem> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const id = input.id || crypto.randomUUID();

    const category = (input.category || "Generale").trim() || "Generale";
    const description = input.description.trim().toUpperCase();
    const unit = (input.unit || "NR").trim().toUpperCase() || "NR";
    const supplier = input.supplier ? input.supplier.trim().toUpperCase() : null;
    const supplier_item_code = input.supplier_item_code ? input.supplier_item_code.trim().toUpperCase() : null;
    const code = input.code ? input.code.trim().toUpperCase() : null;
    const purchase_price_subunits = money(input.purchase_price ?? 0).toSubunits();
    const markup_pct = input.markup_pct !== null && input.markup_pct !== undefined ? String(input.markup_pct) : null;
    const base_unit_price_subunits = input.base_unit_price ? money(input.base_unit_price).toSubunits() : 0;
    const forced_unit_price_subunits =
      input.forced_unit_price !== undefined && input.forced_unit_price !== null && input.forced_unit_price !== ""
        ? money(input.forced_unit_price).toSubunits()
        : null;
    const discount_pct = String(input.discount_pct ?? 0);
    const vat_rate = Number(input.vat_rate ?? 22);
    const availability = input.availability || null;
    const notes = input.notes || null;

    if (input.id) {
      await db.execute(
        `UPDATE quote_favorite_items SET
          category = $1, description = $2, unit = $3, supplier = $4,
          supplier_item_code = $5, code = $6, purchase_price_subunits = $7,
          markup_pct = $8, base_unit_price_subunits = $9, forced_unit_price_subunits = $10,
          discount_pct = $11, vat_rate = $12, availability = $13, notes = $14,
          updated_at = $15
        WHERE id = $16`,
        [
          category, description, unit, supplier,
          supplier_item_code, code, purchase_price_subunits,
          markup_pct, base_unit_price_subunits, forced_unit_price_subunits,
          discount_pct, vat_rate, availability, notes,
          now, id,
        ]
      );
    } else {
      await db.execute(
        `INSERT INTO quote_favorite_items (
          id, category, description, unit, supplier,
          supplier_item_code, code, purchase_price_subunits,
          markup_pct, base_unit_price_subunits, forced_unit_price_subunits,
          discount_pct, vat_rate, availability, notes,
          usage_count, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11,
          $12, $13, $14, $15,
          0, $16, $17
        )`,
        [
          id, category, description, unit, supplier,
          supplier_item_code, code, purchase_price_subunits,
          markup_pct, base_unit_price_subunits, forced_unit_price_subunits,
          discount_pct, vat_rate, availability, notes,
          now, now,
        ]
      );
    }

    const saved = await db.select<FavoriteRow[]>(
      "SELECT * FROM quote_favorite_items WHERE id = $1",
      [id]
    );
    if (!saved[0]) throw new Error("Errore recupero voce preferita salvata.");
    return this.mapFavoriteRow(saved[0]);
  }

  /**
   * Elimina (soft-delete) una voce preferita.
   */
  public async deleteFavoriteItem(id: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.execute(
      "UPDATE quote_favorite_items SET deleted_at = $1, updated_at = $2 WHERE id = $3",
      [now, now, id]
    );
  }

  /**
   * Incrementa il contatore di utilizzo di una voce preferita.
   */
  public async incrementFavoriteUsage(id: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "UPDATE quote_favorite_items SET usage_count = usage_count + 1 WHERE id = $1",
      [id]
    );
  }

  /**
   * Recupera le categorie distinte delle voci preferite.
   */
  public async getCategories(): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.select<{ category: string }[]>(
      "SELECT DISTINCT category FROM quote_favorite_items WHERE deleted_at IS NULL AND category IS NOT NULL ORDER BY category ASC"
    );
    const standardCategories = ["Manodopera", "Trasporto", "Materiali", "Generale"];
    const set = new Set([...standardCategories, ...rows.map((r) => r.category.trim()).filter(Boolean)]);
    return Array.from(set);
  }

  /**
   * Recupera le righe storiche da tutti i preventivi esistenti.
   */
  public async getHistoricalItems(filters?: {
    search?: string;
    supplier?: string;
    clientName?: string;
    limit?: number;
  }): Promise<QuoteHistoricalItem[]> {
    const db = await getDatabase();
    const conditions: string[] = [
      "qi.deleted_at IS NULL",
      "q.deleted_at IS NULL",
      "LENGTH(TRIM(qi.description)) > 0",
    ];
    const params: any[] = [];

    if (filters?.search && filters.search.trim()) {
      const tokens = filters.search
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      for (const token of tokens) {
        params.push(`%${token}%`);
        const pIdx = `$${params.length}`;
        conditions.push(
          `(LOWER(qi.description) LIKE ${pIdx} OR LOWER(COALESCE(qi.supplier, '')) LIKE ${pIdx} OR LOWER(COALESCE(qi.code, '')) LIKE ${pIdx} OR LOWER(COALESCE(qi.supplier_item_code, '')) LIKE ${pIdx} OR LOWER(COALESCE(q.client_name, '')) LIKE ${pIdx})`
        );
      }
    }

    if (filters?.supplier && filters.supplier !== "Tutti") {
      params.push(filters.supplier.trim().toUpperCase());
      conditions.push(`UPPER(TRIM(COALESCE(qi.supplier, ''))) = $${params.length}`);
    }

    if (filters?.clientName && filters.clientName.trim()) {
      params.push(`%${filters.clientName.trim().toLowerCase()}%`);
      conditions.push(`LOWER(TRIM(COALESCE(q.client_name, ''))) LIKE $${params.length}`);
    }

    const limit = Math.min(filters?.limit || 200, 500);

    const query = `
      SELECT 
        qi.id,
        qi.quote_id,
        qi.description,
        qi.unit,
        qi.quantity,
        qi.supplier,
        qi.supplier_item_code,
        qi.code,
        qi.purchase_price_subunits,
        qi.markup_pct,
        qi.base_unit_price_subunits,
        qi.effective_unit_price_subunits,
        qi.forced_unit_price_subunits,
        qi.discount_pct,
        qi.vat_rate,
        qi.availability,
        qi.notes,
        q.quote_number,
        q.year,
        q.quote_date,
        q.client_name
      FROM quote_items qi
      JOIN quotes q ON q.id = qi.quote_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY q.quote_date DESC, qi.updated_at DESC
      LIMIT ${limit}
    `;

    const rows = await db.select<HistoricalRow[]>(query, params);
    return rows.map(this.mapHistoricalRow);
  }

  /**
   * Recupera la cronologia completa di tutte le volte che un determinato articolo
   * (con la stessa descrizione) è comparso nei preventivi.
   */
  public async getHistoryForDescription(description: string): Promise<QuoteHistoricalItem[]> {
    if (!description || !description.trim()) return [];
    const db = await getDatabase();
    const query = `
      SELECT 
        qi.id,
        qi.quote_id,
        qi.description,
        qi.unit,
        qi.quantity,
        qi.supplier,
        qi.supplier_item_code,
        qi.code,
        qi.purchase_price_subunits,
        qi.markup_pct,
        qi.base_unit_price_subunits,
        qi.effective_unit_price_subunits,
        qi.forced_unit_price_subunits,
        qi.discount_pct,
        qi.vat_rate,
        qi.availability,
        qi.notes,
        q.quote_number,
        q.year,
        q.quote_date,
        q.client_name
      FROM quote_items qi
      JOIN quotes q ON q.id = qi.quote_id
      WHERE qi.deleted_at IS NULL
        AND q.deleted_at IS NULL
        AND UPPER(TRIM(qi.description)) = $1
      ORDER BY q.quote_date DESC, qi.updated_at DESC
      LIMIT 100
    `;
    const rows = await db.select<HistoricalRow[]>(query, [description.trim().toUpperCase()]);
    return rows.map(this.mapHistoricalRow);
  }

  private mapFavoriteRow(row: FavoriteRow): QuoteFavoriteItem {
    return {
      id: row.id,
      category: row.category,
      description: row.description,
      unit: row.unit,
      supplier: row.supplier,
      supplier_item_code: row.supplier_item_code,
      code: row.code,
      purchase_price: MonetaryValue.fromSubunits(row.purchase_price_subunits),
      markup_pct: row.markup_pct ? Number(row.markup_pct) : null,
      base_unit_price: MonetaryValue.fromSubunits(row.base_unit_price_subunits),
      forced_unit_price:
        row.forced_unit_price_subunits !== null
          ? MonetaryValue.fromSubunits(row.forced_unit_price_subunits)
          : null,
      discount_pct: Number(row.discount_pct || 0),
      vat_rate: (Number(row.vat_rate) || 22) as QuoteVatRate,
      availability: row.availability,
      notes: row.notes,
      usage_count: row.usage_count || 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private mapHistoricalRow(row: HistoricalRow): QuoteHistoricalItem {
    return {
      id: row.id,
      quote_id: row.quote_id,
      quote_number: row.quote_number,
      year: row.year,
      quote_date: row.quote_date,
      client_name: row.client_name,
      description: row.description,
      unit: row.unit,
      quantity: row.quantity,
      supplier: row.supplier,
      supplier_item_code: row.supplier_item_code,
      code: row.code,
      purchase_price: MonetaryValue.fromSubunits(row.purchase_price_subunits),
      markup_pct: row.markup_pct ? Number(row.markup_pct) : null,
      base_unit_price: MonetaryValue.fromSubunits(row.base_unit_price_subunits),
      effective_unit_price: MonetaryValue.fromSubunits(row.effective_unit_price_subunits),
      forced_unit_price:
        row.forced_unit_price_subunits !== null
          ? MonetaryValue.fromSubunits(row.forced_unit_price_subunits)
          : null,
      discount_pct: Number(row.discount_pct || 0),
      vat_rate: (Number(row.vat_rate) || 22) as QuoteVatRate,
      availability: row.availability,
      notes: row.notes,
    };
  }
}

export const quoteItemLibraryService = new QuoteItemLibraryService();

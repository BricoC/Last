import { getDatabase } from "@/shared/data-layer/database";
import { Product, CreateProductInput, UpdateProductInput } from "../models/product";
import { validateProductInput } from "../utils/productValidation";

export class ProductRepository {
  /**
   * Recupera tutti gli articoli attivi (esclusi quelli eliminati logicamente con deleted_at).
   * Supporta ricerca opzionale per codice o descrizione.
   */
  async getActiveProducts(searchQuery?: string): Promise<Product[]> {
    const db = await getDatabase();

    if (searchQuery && searchQuery.trim()) {
      const term = `%${searchQuery.trim()}%`;
      return db.select<Product[]>(
        `SELECT * FROM products 
         WHERE deleted_at IS NULL 
           AND (code LIKE $1 OR description LIKE $1)
         ORDER BY code ASC`,
        [term]
      );
    }

    return db.select<Product[]>(
      `SELECT * FROM products 
       WHERE deleted_at IS NULL 
       ORDER BY code ASC`
    );
  }

  /**
   * Recupera un singolo articolo per ID.
   */
  async getProductById(id: string): Promise<Product | null> {
    const db = await getDatabase();
    const rows = await db.select<Product[]>(
      `SELECT * FROM products WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Crea un nuovo articolo nel database SQLite locale.
   */
  async createProduct(input: CreateProductInput, operator = "Cassa 1"): Promise<Product> {
    const validation = validateProductInput(input);
    if (!validation.isValid) {
      throw new Error(`Validazione fallita: ${validation.errors.map((e) => e.message).join(", ")}`);
    }

    const db = await getDatabase();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const product: Product = {
      id,
      code: input.code.trim().toUpperCase(),
      description: input.description.trim(),
      unit: (input.unit || "NR").trim().toUpperCase(),
      purchase_price_cents: Math.max(0, input.purchase_price_cents || 0),
      sale_price_cents: Math.max(0, input.sale_price_cents || 0),
      vat_rate: input.vat_rate !== undefined ? input.vat_rate : 22,
      category: input.category?.trim() || undefined,
      supplier: input.supplier?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      created_at: now,
      updated_at: now,
      updated_by: operator,
      deleted_at: null,
      sync_status: "pending",
    };

    await db.execute(
      `INSERT INTO products (
        id, code, description, unit, purchase_price_cents, sale_price_cents,
        vat_rate, category, supplier, notes, created_at, updated_at, updated_by,
        deleted_at, sync_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        product.id,
        product.code,
        product.description,
        product.unit,
        product.purchase_price_cents,
        product.sale_price_cents,
        product.vat_rate,
        product.category ?? null,
        product.supplier ?? null,
        product.notes ?? null,
        product.created_at,
        product.updated_at,
        product.updated_by,
        product.deleted_at,
        product.sync_status,
      ]
    );

    return product;
  }

  /**
   * Aggiorna un articolo esistente.
   */
  async updateProduct(id: string, input: UpdateProductInput, operator = "Cassa 1"): Promise<Product> {
    const current = await this.getProductById(id);
    if (!current) {
      throw new Error(`Articolo con id ${id} non trovato.`);
    }

    const merged = { ...current, ...input };
    const validation = validateProductInput(merged);
    if (!validation.isValid) {
      throw new Error(`Validazione fallita: ${validation.errors.map((e) => e.message).join(", ")}`);
    }

    const db = await getDatabase();
    const now = new Date().toISOString();

    const updated: Product = {
      ...merged,
      code: merged.code.trim().toUpperCase(),
      description: merged.description.trim(),
      unit: (merged.unit || "NR").trim().toUpperCase(),
      updated_at: now,
      updated_by: operator,
      sync_status: "pending",
    };

    await db.execute(
      `UPDATE products SET
        code = $1,
        description = $2,
        unit = $3,
        purchase_price_cents = $4,
        sale_price_cents = $5,
        vat_rate = $6,
        category = $7,
        supplier = $8,
        notes = $9,
        updated_at = $10,
        updated_by = $11,
        sync_status = $12
      WHERE id = $13`,
      [
        updated.code,
        updated.description,
        updated.unit,
        updated.purchase_price_cents,
        updated.sale_price_cents,
        updated.vat_rate,
        updated.category ?? null,
        updated.supplier ?? null,
        updated.notes ?? null,
        updated.updated_at,
        updated.updated_by,
        updated.sync_status,
        id,
      ]
    );

    return updated;
  }

  /**
   * Esegue il soft-delete di un articolo valorizzando deleted_at (Nessuna cancellazione fisica).
   */
  async softDeleteProduct(id: string, operator = "Cassa 1"): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    await db.execute(
      `UPDATE products SET 
        deleted_at = $1,
        updated_at = $2,
        updated_by = $3,
        sync_status = 'pending'
       WHERE id = $4`,
      [now, now, operator, id]
    );
  }

  /**
   * Inserisce o aggiorna una lista di articoli in blocco (per import o incolla massivo).
   */
  async batchUpsert(products: Product[]): Promise<void> {
    const db = await getDatabase();

    for (const p of products) {
      await db.execute(
        `INSERT INTO products (
          id, code, description, unit, purchase_price_cents, sale_price_cents,
          vat_rate, category, supplier, notes, created_at, updated_at, updated_by,
          deleted_at, sync_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT(id) DO UPDATE SET
          code = excluded.code,
          description = excluded.description,
          unit = excluded.unit,
          purchase_price_cents = excluded.purchase_price_cents,
          sale_price_cents = excluded.sale_price_cents,
          vat_rate = excluded.vat_rate,
          category = excluded.category,
          supplier = excluded.supplier,
          notes = excluded.notes,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          sync_status = excluded.sync_status`,
        [
          p.id,
          p.code,
          p.description,
          p.unit,
          p.purchase_price_cents,
          p.sale_price_cents,
          p.vat_rate,
          p.category ?? null,
          p.supplier ?? null,
          p.notes ?? null,
          p.created_at,
          p.updated_at,
          p.updated_by,
          p.deleted_at,
          p.sync_status,
        ]
      );
    }
  }
}

export const productRepository = new ProductRepository();

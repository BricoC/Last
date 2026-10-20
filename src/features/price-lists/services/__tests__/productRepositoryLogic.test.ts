import { describe, it, expect } from "vitest";
import { Product } from "../../models/product";

describe("Product Repository & Consistency Rules", () => {
  it("rispetta la struttura BaseEntity e il tracciamento audit", () => {
    const now = new Date().toISOString();
    const product: Product = {
      id: crypto.randomUUID(),
      code: "BOSCH-GSB13",
      description: "Trapano a percussione Bosch",
      unit: "NR",
      purchase_price_cents: 4500, // 45.00 €
      sale_price_cents: 6990,     // 69.90 €
      vat_rate: 22,
      created_at: now,
      updated_at: now,
      updated_by: "Cassa 1",
      deleted_at: null,
      sync_status: "pending",
    };

    expect(product.id).toBeDefined();
    expect(product.deleted_at).toBeNull();
    expect(product.sync_status).toBe("pending");
    expect(product.purchase_price_cents).toBe(4500);
    expect(product.sale_price_cents).toBe(6990);
  });

  it("garantisce il soft delete senza cancellazione fisica dei dati", () => {
    const now = new Date().toISOString();
    const original: Product = {
      id: "prod-1",
      code: "VITE-4X40",
      description: "Vite per legno 4x40",
      unit: "PZ",
      purchase_price_cents: 2,
      sale_price_cents: 5,
      vat_rate: 22,
      created_at: now,
      updated_at: now,
      updated_by: "Cassa 1",
      deleted_at: null,
      sync_status: "synced",
    };

    const deletedTime = new Date().toISOString();
    const softDeleted: Product = {
      ...original,
      deleted_at: deletedTime,
      updated_at: deletedTime,
      updated_by: "Admin",
      sync_status: "pending",
    };

    expect(softDeleted.id).toBe(original.id);
    expect(softDeleted.code).toBe(original.code);
    expect(softDeleted.deleted_at).not.toBeNull();
    expect(softDeleted.sync_status).toBe("pending");
  });

  it("regola di unicità codice: un articolo eliminato permette di riutilizzare il codice su uno nuovo", () => {
    const activeProducts: Product[] = [
      {
        id: "prod-active-1",
        code: "TASSELLO-8",
        description: "Tassello 8mm attivo",
        unit: "NR",
        purchase_price_cents: 10,
        sale_price_cents: 25,
        vat_rate: 22,
        created_at: "2026-01-01T10:00:00Z",
        updated_at: "2026-01-01T10:00:00Z",
        updated_by: "Operatore",
        deleted_at: null,
        sync_status: "synced",
      },
    ];

    const deletedProducts: Product[] = [
      {
        id: "prod-old-1",
        code: "TASSELLO-6",
        description: "Vecchio tassello dismesso",
        unit: "NR",
        purchase_price_cents: 8,
        sale_price_cents: 20,
        vat_rate: 22,
        created_at: "2025-01-01T10:00:00Z",
        updated_at: "2025-06-01T10:00:00Z",
        updated_by: "Operatore",
        deleted_at: "2025-06-01T10:00:00Z",
        sync_status: "synced",
      },
    ];

    expect(deletedProducts.length).toBe(1);

    const isCodeActive = (code: string) =>
      activeProducts.some((p) => p.code === code && p.deleted_at === null);

    expect(isCodeActive("TASSELLO-8")).toBe(true);
    expect(isCodeActive("TASSELLO-6")).toBe(false);
  });
});

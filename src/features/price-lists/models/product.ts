import { BaseEntity } from "@/shared/types/baseEntity";

/**
 * Modello aziendale Product (Articolo / Listino).
 * Estende BaseEntity con campi di audit e tracciamento conformi a agent.md.
 * Tutti i prezzi monetari sono rigorosamente espressi in CENTESIMI INTERI per evitare errori float.
 */
export interface Product extends BaseEntity {
  /** Codice articolo univoco tra gli articoli attivi (es. "TAS-SX6", "VIT-4X35") */
  code: string;

  /** Descrizione commerciale completa dell'articolo */
  description: string;

  /** Unità di misura (es. "NR", "PZ", "KG", "MT", "LT") */
  unit: string;

  /** Prezzo di acquisto fornitore in centesimi (es. 158 centesimi = 1.58 €) */
  purchase_price_cents: number;

  /** Prezzo di vendita al pubblico in centesimi (es. 237 centesimi = 2.37 €) */
  sale_price_cents: number;

  /** Aliquota IVA percentuale intera (es. 22, 10, 4, 0) */
  vat_rate: number;

  /** Categoria merceologica facoltativa (es. "Viteria", "Fissaggi") */
  category?: string;

  /** Fornitore predefinito facoltativo */
  supplier?: string;

  /** Note interne facoltative */
  notes?: string;
}

/**
 * Input per la creazione di un nuovo articolo.
 */
export type CreateProductInput = Omit<
  Product,
  "id" | "created_at" | "updated_at" | "deleted_at" | "sync_status" | "updated_by"
> & {
  updated_by?: string;
};

/**
 * Input per l'aggiornamento di un articolo esistente.
 */
export type UpdateProductInput = Partial<CreateProductInput>;

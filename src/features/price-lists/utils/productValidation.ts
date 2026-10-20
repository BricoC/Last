import { CreateProductInput } from "../models/product";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Valida i campi essenziali di un articolo prima del salvataggio in SQLite.
 */
export function validateProductInput(input: Partial<CreateProductInput>): ValidationResult {
  const errors: ValidationError[] = [];

  // Codice
  const code = input.code?.trim();
  if (!code) {
    errors.push({ field: "code", message: "Il codice articolo è obbligatorio." });
  } else if (code.length < 2) {
    errors.push({ field: "code", message: "Il codice deve contenere almeno 2 caratteri." });
  }

  // Descrizione
  const desc = input.description?.trim();
  if (!desc) {
    errors.push({ field: "description", message: "La descrizione dell'articolo è obbligatoria." });
  }

  // Prezzi
  if (input.purchase_price_cents !== undefined && input.purchase_price_cents < 0) {
    errors.push({ field: "purchase_price_cents", message: "Il prezzo di acquisto non può essere negativo." });
  }

  if (input.sale_price_cents !== undefined && input.sale_price_cents < 0) {
    errors.push({ field: "sale_price_cents", message: "Il prezzo di vendita non può essere negativo." });
  }

  // IVA
  if (input.vat_rate !== undefined) {
    if (input.vat_rate < 0 || input.vat_rate > 100) {
      errors.push({ field: "vat_rate", message: "L'aliquota IVA deve essere compresa tra 0 e 100%." });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * BaseEntity - Modello fondamentale per tutte le entità persistenti del gestionale Last.
 * Obbligatorio per garantire la sincronizzazione a prova di bomba (SQLite Outbox ↔ Supabase).
 */
export interface BaseEntity {
  /** UUID v4 generato localmente (univoco al mondo) */
  id: string;

  /** Data e ora di creazione in formato ISO 8601 UTC */
  created_at: string;

  /** Data e ora dell'ultima modifica in formato ISO 8601 UTC */
  updated_at: string;

  /** Identificativo utente o nome postazione (es. 'Cassa 1', 'Ufficio') */
  updated_by: string;

  /** Timestamp di eliminazione logica (null se record attivo) */
  deleted_at: string | null;

  /** Stato di allineamento locale con il Cloud Supabase */
  sync_status: 'synced' | 'pending';
}

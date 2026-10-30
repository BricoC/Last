export interface OrderItem {
  id: string;
  supabase_id?: number | null;
  order_date: string;       // gg/mm/aaaa
  supplier_name: string;     // Fornitore
  article_code: string;      // Codice articolo
  description: string;       // Descrizione (MAIUSCOLO)
  quantity: string;          // Quantità
  price: string;             // Prezzo
  ordered_date?: string | null; // Data Ordine inviato (gg/mm/aaaa)
  notes?: string;            // Note
  user_name?: string;        // Utente/postazione
  is_archived: boolean;      // true se archiviato
  is_deleted: boolean;       // true se nel cestino
  highlights?: Record<string, boolean>; // evidenze celle { [colId]: true }
  created_at: string;
  updated_at: string;
  sync_status?: 'synced' | 'pending' | 'failed';
  isNew?: boolean;           // per righe buffer vuote in griglia
  _localKey?: string;
}

export interface Supplier {
  id: string;
  supabase_id?: number | null;
  name: string;              // Nome Azienda
  representative?: string;   // Rappresentante
  email?: string;            // Email per invio ordine
  phone?: string;            // Telefono
  address?: string;          // Indirizzo
  vat_number?: string;       // P.IVA
  notes?: string;            // Note
  created_at: string;
  updated_at: string;
  sync_status?: 'synced' | 'pending' | 'failed';
  isNew?: boolean;
}

export interface OrderAuditLog {
  id: string;
  supabase_id?: number | null;
  table_name: string;
  operation_type: 'INSERT' | 'UPDATE' | 'DELETE';
  operation_date: string;
  user_name?: string;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  summary?: string;
  created_at: string;
}

export type OrderViewMode = 'attivi' | 'archiviati' | 'cestino';


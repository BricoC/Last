export interface ListinoGeneraleRow {
  id: string;
  source_table: "listino_generale" | "listini_vari";
  cat: string | null;
  fornitore: string | null;
  codice_articolo: string | null;
  data_ref: string | null;
  descrizione: string;
  um: string | null;
  perc_pub: number | null;
  prezzo_pubblico: number | null;
  perc_prof: number | null;
  prezzo_profess: number | null;
  perc_fatt: number | null;
  prezzo_fattura: number | null;
  prezzo_acquisto: number | null;
  aumento: number | null;
  r1: number | null;
  maga: number | null;
  r2: number | null;
  perc_iva: number | null;
  note: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ListinoClienteRow {
  id: string;
  cliente: string;
  codice_articolo: string | null;
  descrizione: string;
  prezzo_fattura: number | null;
  prezzo_acquisto: number | null;
  ricarico: number | null;
  note: string | null;
  note1: string | null;
  note2: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PriceListLogEntry {
  id: number;
  created_at: string;
  tipo_listino: string;
  cliente: string;
  codice_articolo: string;
  descrizione: string | null;
  campo_modificato: string;
  vecchio_valore: number | null;
  nuovo_valore: number | null;
  variazione_pct: number | null;
  operatore: string;
  motivo: string | null;
}

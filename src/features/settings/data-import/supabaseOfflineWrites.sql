-- Retry idempotenti per i listini e sostituzione atomica delle fatture.
BEGIN;
ALTER TABLE public.listino_generale ADD COLUMN IF NOT EXISTS last_write_key text;
ALTER TABLE public.listini_vari ADD COLUMN IF NOT EXISTS last_write_key text;
ALTER TABLE public.listini_clienti ADD COLUMN IF NOT EXISTS last_write_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_listino_generale_last_write_key ON public.listino_generale(last_write_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_listini_vari_last_write_key ON public.listini_vari(last_write_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_listini_clienti_last_write_key ON public.listini_clienti(last_write_key);

-- La testata serializza i retry concorrenti della stessa fattura. Le righe
-- vengono sostituite nella stessa transazione della testata.
CREATE OR REPLACE FUNCTION public.last_replace_supplier_invoice(p_header jsonb, p_lines jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  h public.fatture_elettroniche_testate;
BEGIN
  SELECT * INTO h FROM jsonb_populate_record(NULL::public.fatture_elettroniche_testate, p_header);
  INSERT INTO public.fatture_elettroniche_testate (
    fornitore, partita_iva, codice_fiscale, numero_documento, data_documento,
    anno, totale_documento, imponibile, imposta, tipo_pagamento, data_scadenza,
    iban, istituto_finanziario, nome_file, note
  ) VALUES (
    h.fornitore, h.partita_iva, h.codice_fiscale, h.numero_documento, h.data_documento,
    h.anno, h.totale_documento, h.imponibile, h.imposta, h.tipo_pagamento, h.data_scadenza,
    h.iban, h.istituto_finanziario, h.nome_file, h.note
  )
  ON CONFLICT (fornitore, numero_documento, data_documento) DO UPDATE SET
    partita_iva = excluded.partita_iva, codice_fiscale = excluded.codice_fiscale,
    anno = excluded.anno, totale_documento = excluded.totale_documento,
    imponibile = excluded.imponibile, imposta = excluded.imposta,
    tipo_pagamento = excluded.tipo_pagamento, data_scadenza = excluded.data_scadenza,
    iban = excluded.iban, istituto_finanziario = excluded.istituto_finanziario,
    nome_file = excluded.nome_file, note = excluded.note;

  DELETE FROM public.fatture_elettroniche_righe
  WHERE fornitore = h.fornitore AND numero_documento = h.numero_documento AND data_documento = h.data_documento;

  INSERT INTO public.fatture_elettroniche_righe (
    fornitore, numero_documento, data_documento, anno, numero_linea,
    codice_articolo, descrizione, quantita, unita_misura, prezzo_unitario,
    sconto_1, sconto_2, sconto_3, prezzo_scontato, prezzo_totale, aliquota_iva
  )
  SELECT h.fornitore, h.numero_documento, h.data_documento, h.anno, r.numero_linea,
    r.codice_articolo, r.descrizione, r.quantita, r.unita_misura, r.prezzo_unitario,
    r.sconto_1, r.sconto_2, r.sconto_3, r.prezzo_scontato, r.prezzo_totale, r.aliquota_iva
  FROM jsonb_populate_recordset(NULL::public.fatture_elettroniche_righe, p_lines) AS r;
END $$;
REVOKE ALL ON FUNCTION public.last_replace_supplier_invoice(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.last_replace_supplier_invoice(jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.last_invoice_issuer_key(p_vat text, p_cf text, p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN vat <> '' THEN 'vat:' || CASE WHEN vat ~ '^IT[0-9]{11}$' THEN substr(vat,3) ELSE vat END
    WHEN cf <> '' THEN 'cf:' || cf
    ELSE 'name:' || upper(btrim(coalesce(p_name,'')))
  END
  FROM (SELECT upper(regexp_replace(coalesce(p_vat,''), '[[:space:]]', '', 'g')) AS vat,
               upper(regexp_replace(coalesce(p_cf,''), '[[:space:]]', '', 'g')) AS cf) tax
$$;
REVOKE ALL ON FUNCTION public.last_invoice_issuer_key(text, text, text) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.fatture_elettroniche_testate ADD COLUMN IF NOT EXISTS issuer_key text
  GENERATED ALWAYS AS (public.last_invoice_issuer_key(partita_iva,codice_fiscale,fornitore)) STORED;
ALTER TABLE public.fatture_elettroniche_righe ADD COLUMN IF NOT EXISTS invoice_id bigint
  REFERENCES public.fatture_elettroniche_testate(id) ON DELETE CASCADE;

DO $$
DECLARE old_constraint text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.fatture_elettroniche_testate
    GROUP BY issuer_key, numero_documento, data_documento HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Fatture legacy duplicate per identità fiscale, numero e data: riconciliare prima della migrazione';
  END IF;
  FOR old_constraint IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.fatture_elettroniche_testate'::regclass
      AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (fornitore, numero_documento, data_documento)'
  LOOP
    EXECUTE format('ALTER TABLE public.fatture_elettroniche_testate DROP CONSTRAINT %I', old_constraint);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS last_unique_invoice_issuer
  ON public.fatture_elettroniche_testate(issuer_key, numero_documento, data_documento);
CREATE INDEX IF NOT EXISTS last_invoice_items_header ON public.fatture_elettroniche_righe(invoice_id);

WITH unambiguous AS (
  SELECT min(id) AS id, fornitore, numero_documento, data_documento
  FROM public.fatture_elettroniche_testate GROUP BY fornitore, numero_documento, data_documento HAVING count(*) = 1
)
UPDATE public.fatture_elettroniche_righe r SET invoice_id = h.id
FROM unambiguous h WHERE r.invoice_id IS NULL AND h.fornitore = r.fornitore
  AND h.numero_documento = r.numero_documento AND h.data_documento = r.data_documento;

CREATE OR REPLACE FUNCTION public.last_replace_supplier_invoice_v2(p_header jsonb, p_lines jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  h public.fatture_elettroniche_testate;
  header_id bigint;
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
  ON CONFLICT (issuer_key, numero_documento, data_documento) DO UPDATE SET
    fornitore = excluded.fornitore,
    partita_iva = excluded.partita_iva, codice_fiscale = excluded.codice_fiscale,
    anno = excluded.anno, totale_documento = excluded.totale_documento,
    imponibile = excluded.imponibile, imposta = excluded.imposta,
    tipo_pagamento = excluded.tipo_pagamento, data_scadenza = excluded.data_scadenza,
    iban = excluded.iban, istituto_finanziario = excluded.istituto_finanziario,
    nome_file = excluded.nome_file, note = excluded.note
  RETURNING id INTO header_id;

  DELETE FROM public.fatture_elettroniche_righe
  WHERE invoice_id = header_id;

  INSERT INTO public.fatture_elettroniche_righe (
    invoice_id, fornitore, numero_documento, data_documento, anno, numero_linea,
    codice_articolo, descrizione, quantita, unita_misura, prezzo_unitario,
    sconto_1, sconto_2, sconto_3, prezzo_scontato, prezzo_totale, aliquota_iva
  )
  SELECT header_id, h.fornitore, h.numero_documento, h.data_documento, h.anno, r.numero_linea,
    r.codice_articolo, r.descrizione, r.quantita, r.unita_misura, r.prezzo_unitario,
    r.sconto_1, r.sconto_2, r.sconto_3, r.prezzo_scontato, r.prezzo_totale, r.aliquota_iva
  FROM jsonb_populate_recordset(NULL::public.fatture_elettroniche_righe, p_lines) AS r;
END $$;

-- Older clients can still write using their original RPC without overwriting an invoice of a namesake issuer.
CREATE OR REPLACE FUNCTION public.last_replace_supplier_invoice(p_header jsonb, p_lines jsonb)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT public.last_replace_supplier_invoice_v2(p_header,p_lines)
$$;
REVOKE ALL ON FUNCTION public.last_replace_supplier_invoice_v2(jsonb,jsonb),
  public.last_replace_supplier_invoice(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.last_replace_supplier_invoice_v2(jsonb,jsonb),
  public.last_replace_supplier_invoice(jsonb,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;

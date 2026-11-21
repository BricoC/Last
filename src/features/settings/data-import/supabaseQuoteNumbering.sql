BEGIN;

LOCK TABLE public.preventivi, public.preventivi_cestino IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS last_private.quote_number_claims (
  anno integer NOT NULL,
  quote_number integer NOT NULL CHECK (quote_number > 0),
  quote_id text NOT NULL,
  PRIMARY KEY (anno, quote_number),
  UNIQUE (anno, quote_id)
);
ALTER TABLE last_private.quote_number_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE last_private.quote_number_claims FROM PUBLIC, anon, authenticated;

-- The same quote can be present in both tables during a move to the trash.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT anno, quote_number, id::text AS quote_id FROM public.preventivi WHERE quote_number IS NOT NULL
      UNION SELECT anno, quote_number, id::text AS quote_id FROM public.preventivi_cestino WHERE quote_number IS NOT NULL
    ) old_numbers GROUP BY anno, quote_number HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Progressivi preventivo già duplicati. Riconciliare i numeri esistenti prima della migrazione';
  END IF;
END $$;

INSERT INTO last_private.quote_number_claims(anno, quote_number, quote_id)
SELECT anno, quote_number, id::text FROM public.preventivi WHERE quote_number IS NOT NULL
UNION SELECT anno, quote_number, id::text FROM public.preventivi_cestino WHERE quote_number IS NOT NULL
ON CONFLICT (anno, quote_number) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS last_unique_quote_number ON public.preventivi(anno,quote_number);
CREATE UNIQUE INDEX IF NOT EXISTS last_unique_trash_quote_number ON public.preventivi_cestino(anno,quote_number);

CREATE OR REPLACE FUNCTION last_private.claim_written_quote_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.quote_number IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(162842178, NEW.anno);
  INSERT INTO last_private.quote_number_claims AS claims(anno,quote_number,quote_id)
    VALUES (NEW.anno,NEW.quote_number,NEW.id::text)
  ON CONFLICT (anno,quote_number) DO UPDATE SET quote_id=excluded.quote_id
    WHERE claims.quote_id=excluded.quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Progressivo preventivo già assegnato a un altro documento' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION last_private.claim_written_quote_number() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS last_claim_quote_number ON public.preventivi;
CREATE TRIGGER last_claim_quote_number BEFORE INSERT OR UPDATE OF anno,quote_number ON public.preventivi
  FOR EACH ROW EXECUTE FUNCTION last_private.claim_written_quote_number();
DROP TRIGGER IF EXISTS last_claim_quote_number ON public.preventivi_cestino;
CREATE TRIGGER last_claim_quote_number BEFORE INSERT OR UPDATE OF anno,quote_number ON public.preventivi_cestino
  FOR EACH ROW EXECUTE FUNCTION last_private.claim_written_quote_number();

CREATE OR REPLACE FUNCTION public.last_reserve_quote_number(p_year integer, p_quote_id text, p_local_floor integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  reserved integer;
BEGIN
  PERFORM public.last_require_station_access();
  IF p_quote_id IS NULL OR btrim(p_quote_id) = '' THEN RAISE EXCEPTION 'ID preventivo mancante'; END IF;
  PERFORM pg_advisory_xact_lock(162842178, p_year);
  SELECT quote_number INTO reserved FROM last_private.quote_number_claims WHERE anno=p_year AND quote_id=p_quote_id;
  IF FOUND THEN RETURN reserved; END IF;
  SELECT GREATEST(
    COALESCE((SELECT ultimo_numero FROM public.preventivi_sequenza WHERE anno=p_year),0),
    COALESCE((SELECT MAX(quote_number) FROM last_private.quote_number_claims WHERE anno=p_year),0),
    p_local_floor, 0
  ) + 1 INTO reserved;
  INSERT INTO last_private.quote_number_claims(anno,quote_number,quote_id) VALUES(p_year,reserved,p_quote_id);
  INSERT INTO public.preventivi_sequenza AS seq(anno,ultimo_numero) VALUES(p_year,reserved)
    ON CONFLICT(anno) DO UPDATE SET ultimo_numero=GREATEST(seq.ultimo_numero,excluded.ultimo_numero);
  RETURN reserved;
END $$;
REVOKE ALL ON FUNCTION public.last_reserve_quote_number(integer,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.last_reserve_quote_number(integer,text,integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

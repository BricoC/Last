BEGIN;

ALTER TABLE public.ddt ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.ddt_righe ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.ddt DROP CONSTRAINT IF EXISTS ddt_anno_numero_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS ddt_anno_numero_active_uniq
  ON public.ddt (anno, numero)
  WHERE deleted_at IS NULL;

DROP POLICY IF EXISTS "Last active DDT" ON public.ddt;
CREATE POLICY "Last active DDT" ON public.ddt AS RESTRICTIVE FOR SELECT TO authenticated
  USING (deleted_at IS NULL);
DROP POLICY IF EXISTS "Last active DDT lines" ON public.ddt_righe;
CREATE POLICY "Last active DDT lines" ON public.ddt_righe AS RESTRICTIVE FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE SEQUENCE IF NOT EXISTS last_private.ddt_sync_revision;
CREATE TABLE IF NOT EXISTS last_private.ddt_sync_changes (
  id text PRIMARY KEY,
  revision bigint UNIQUE NOT NULL,
  deleted_at timestamptz
);
ALTER TABLE last_private.ddt_sync_changes ADD COLUMN IF NOT EXISTS write_key text;
ALTER TABLE last_private.ddt_sync_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE last_private.ddt_sync_changes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION last_private.record_ddt_sync_change(p_id text, p_deleted_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_id IS NULL THEN RETURN; END IF;
  -- Revision order must follow commit order, including transactions with several writes.
  PERFORM pg_advisory_xact_lock(162842177, 1);
  INSERT INTO last_private.ddt_sync_changes(id, revision, deleted_at)
  VALUES (p_id, nextval('last_private.ddt_sync_revision'), p_deleted_at)
  ON CONFLICT (id) DO UPDATE SET revision = EXCLUDED.revision, deleted_at = EXCLUDED.deleted_at, write_key = NULL;
END $$;

CREATE OR REPLACE FUNCTION last_private.capture_ddt_sync_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  affected_id text;
  removed_at timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'ddt' THEN
    IF TG_OP = 'DELETE' THEN
      PERFORM last_private.record_ddt_sync_change(OLD.id::text, clock_timestamp());
    ELSE
      PERFORM last_private.record_ddt_sync_change(NEW.id::text, NEW.deleted_at);
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      SELECT id::text, deleted_at INTO affected_id, removed_at FROM public.ddt
      WHERE id::text = OLD.ddt_id::text OR (OLD.ddt_id IS NULL AND anno = OLD.anno AND numero = OLD.numero_ddt);
      PERFORM last_private.record_ddt_sync_change(affected_id, removed_at);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT id::text, deleted_at INTO affected_id, removed_at FROM public.ddt
      WHERE id::text = NEW.ddt_id::text OR (NEW.ddt_id IS NULL AND anno = NEW.anno AND numero = NEW.numero_ddt);
      PERFORM last_private.record_ddt_sync_change(affected_id, removed_at);
    END IF;
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION last_private.record_ddt_sync_change(text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION last_private.capture_ddt_sync_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS last_capture_ddt_sync_change ON public.ddt;
CREATE TRIGGER last_capture_ddt_sync_change AFTER INSERT OR UPDATE OR DELETE ON public.ddt
  FOR EACH ROW EXECUTE FUNCTION last_private.capture_ddt_sync_change();
DROP TRIGGER IF EXISTS last_capture_ddt_sync_change ON public.ddt_righe;
CREATE TRIGGER last_capture_ddt_sync_change AFTER INSERT OR UPDATE OR DELETE ON public.ddt_righe
  FOR EACH ROW EXECUTE FUNCTION last_private.capture_ddt_sync_change();

INSERT INTO last_private.ddt_sync_changes(id, revision, deleted_at)
SELECT id::text, nextval('last_private.ddt_sync_revision'), deleted_at FROM public.ddt ORDER BY id
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION last_private.ddt_sync_snapshot(p_id text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('header', to_jsonb(h), 'lines', COALESCE((
    SELECT jsonb_agg(to_jsonb(r) ORDER BY r.riga_nr, r.id) FROM public.ddt_righe r
    WHERE r.deleted_at IS NULL AND (r.ddt_id::text = h.id::text OR
      (r.ddt_id IS NULL AND r.anno = h.anno AND r.numero_ddt = h.numero))
  ), '[]'::jsonb))
  FROM public.ddt h WHERE h.id::text = p_id AND h.deleted_at IS NULL
$$;
REVOKE ALL ON FUNCTION last_private.ddt_sync_snapshot(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.last_ddt_snapshot(p_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(last_private.ddt_sync_snapshot(p_id), '{}'::jsonb)
    || jsonb_build_object('revision', c.revision::text, 'deletedAt', c.deleted_at, 'writeKey', c.write_key)
  FROM last_private.ddt_sync_changes c WHERE c.id = p_id AND public.last_require_station_access()
$$;

CREATE OR REPLACE FUNCTION public.last_ddt_changes(p_after bigint, p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.last_require_station_access();
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', entries.id, 'revision', entries.revision::text, 'deletedAt', entries.deleted_at,
    'document', CASE WHEN entries.deleted_at IS NULL THEN last_private.ddt_sync_snapshot(entries.id) END
  ) ORDER BY entries.revision), '[]'::jsonb)
  FROM (SELECT id, revision, deleted_at FROM last_private.ddt_sync_changes
    WHERE revision > p_after
    ORDER BY revision LIMIT GREATEST(1, LEAST(p_limit, 100))) entries);
END
$$;

CREATE OR REPLACE FUNCTION public.last_ddt_revision()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(MAX(revision), 0)::text FROM last_private.ddt_sync_changes
  WHERE public.last_require_station_access()
$$;

CREATE OR REPLACE FUNCTION public.last_write_ddt(p_header jsonb, p_lines jsonb, p_expected_revision bigint, p_restore boolean, p_write_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  h public.ddt;
  line public.ddt_righe;
  current_revision bigint;
  removed_at timestamptz;
  current_write_key text;
  saved_revision bigint;
  stamp timestamptz := clock_timestamp();
BEGIN
  PERFORM public.last_require_station_access();
  PERFORM pg_advisory_xact_lock(162842177, 1);
  SELECT * INTO h FROM jsonb_populate_record(NULL::public.ddt, p_header);
  SELECT revision, deleted_at, write_key INTO current_revision, removed_at, current_write_key
  FROM last_private.ddt_sync_changes WHERE id = h.id::text;
  IF p_write_key IS NOT NULL AND p_write_key = current_write_key AND removed_at IS NULL THEN
    RETURN (SELECT jsonb_build_object('updatedAt', ultima_modifica, 'revision', current_revision::text)
      FROM public.ddt WHERE id=h.id);
  END IF;
  IF p_expected_revision IS DISTINCT FROM current_revision THEN
    RAISE EXCEPTION 'Il DDT è cambiato su Supabase durante il salvataggio' USING ERRCODE = '40001';
  END IF;
  IF removed_at IS NOT NULL AND NOT p_restore THEN
    RAISE EXCEPTION 'Il DDT è stato eliminato su Supabase' USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.ddt (
    id, numero, anno, data, cliente, indirizzo, citta, pagamento, destinazione, citta_dest, nr_vs_ordine,
    causale, porto, aspetto, colli, peso_kg, vettore, operatore, note, totale_imponibile, totale_iva,
    totale_documento, stato, created_at, ultima_modifica, piva, cod_fiscale, sdi, telefoni,
    prezzo_acquisto_totale, ricavo, ricarico_totale, sconto_totale, deleted_at
  ) VALUES (
    h.id, h.numero, h.anno, h.data, h.cliente, h.indirizzo, h.citta, h.pagamento, h.destinazione, h.citta_dest,
    h.nr_vs_ordine, h.causale, h.porto, h.aspetto, h.colli, h.peso_kg, h.vettore, h.operatore, h.note,
    h.totale_imponibile, h.totale_iva, h.totale_documento, h.stato, COALESCE(h.created_at, stamp), stamp,
    h.piva, h.cod_fiscale, h.sdi, h.telefoni, h.prezzo_acquisto_totale, h.ricavo, h.ricarico_totale,
    h.sconto_totale, NULL
  ) ON CONFLICT (id) DO UPDATE SET
    numero = excluded.numero, anno = excluded.anno, data = excluded.data, cliente = excluded.cliente,
    indirizzo = excluded.indirizzo, citta = excluded.citta, pagamento = excluded.pagamento,
    destinazione = excluded.destinazione, citta_dest = excluded.citta_dest, nr_vs_ordine = excluded.nr_vs_ordine,
    causale = excluded.causale, porto = excluded.porto, aspetto = excluded.aspetto, colli = excluded.colli,
    peso_kg = excluded.peso_kg, vettore = excluded.vettore, operatore = excluded.operatore, note = excluded.note,
    totale_imponibile = excluded.totale_imponibile, totale_iva = excluded.totale_iva,
    totale_documento = excluded.totale_documento, stato = excluded.stato, ultima_modifica = stamp,
    piva = excluded.piva, cod_fiscale = excluded.cod_fiscale, sdi = excluded.sdi, telefoni = excluded.telefoni,
    prezzo_acquisto_totale = excluded.prezzo_acquisto_totale, ricavo = excluded.ricavo,
    ricarico_totale = excluded.ricarico_totale, sconto_totale = excluded.sconto_totale, deleted_at = NULL;

  UPDATE public.ddt_righe r SET deleted_at = stamp
  WHERE r.deleted_at IS NULL AND (
    (r.ddt_id::text = h.id::text AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) AS x WHERE x->>'id' = r.id::text))
    OR (r.ddt_id IS NULL AND r.anno = h.anno AND r.numero_ddt = h.numero)
  );
  FOR line IN SELECT * FROM jsonb_populate_recordset(NULL::public.ddt_righe, p_lines) LOOP
    INSERT INTO public.ddt_righe (
      id, ddt_id, riga_nr, um, quantita, descrizione, prezzo, sconto_pct, importo, iva_pct,
      prezzo_acquisto, prezzo_scontato, ricavo, anno, numero_ddt, deleted_at
    ) VALUES (
      line.id, h.id, line.riga_nr, line.um, line.quantita, line.descrizione, line.prezzo, line.sconto_pct,
      line.importo, line.iva_pct, line.prezzo_acquisto, line.prezzo_scontato, line.ricavo, h.anno, h.numero, NULL
    ) ON CONFLICT (id) DO UPDATE SET
      ddt_id = excluded.ddt_id, riga_nr = excluded.riga_nr, um = excluded.um, quantita = excluded.quantita,
      descrizione = excluded.descrizione, prezzo = excluded.prezzo, sconto_pct = excluded.sconto_pct,
      importo = excluded.importo, iva_pct = excluded.iva_pct, prezzo_acquisto = excluded.prezzo_acquisto,
      prezzo_scontato = excluded.prezzo_scontato, ricavo = excluded.ricavo, anno = excluded.anno,
      numero_ddt = excluded.numero_ddt, deleted_at = NULL
    WHERE public.ddt_righe.ddt_id::text = h.id::text OR
      (public.ddt_righe.ddt_id IS NULL AND public.ddt_righe.anno = h.anno AND public.ddt_righe.numero_ddt = h.numero);
    IF NOT FOUND THEN RAISE EXCEPTION 'Riga già associata a un altro DDT'; END IF;
  END LOOP;
  UPDATE last_private.ddt_sync_changes SET write_key=p_write_key WHERE id=h.id::text RETURNING revision INTO saved_revision;
  RETURN jsonb_build_object('updatedAt', stamp, 'revision', saved_revision::text);
END $$;

CREATE OR REPLACE FUNCTION public.last_delete_ddt(p_id text, p_expected_revision bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  stamp timestamptz := clock_timestamp();
  removed public.ddt;
  current_revision bigint;
  current_deleted_at timestamptz;
BEGIN
  PERFORM public.last_require_station_access();
  PERFORM pg_advisory_xact_lock(162842177, 1);
  SELECT revision, deleted_at INTO current_revision, current_deleted_at
  FROM last_private.ddt_sync_changes WHERE id=p_id;
  IF current_deleted_at IS NOT NULL THEN RETURN; END IF;
  IF current_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'Il DDT è cambiato su Supabase durante l’eliminazione' USING ERRCODE = '40001';
  END IF;
  UPDATE public.ddt SET deleted_at = stamp, ultima_modifica = stamp
    WHERE id::text = p_id AND deleted_at IS NULL RETURNING * INTO removed;
  IF NOT FOUND THEN
    PERFORM last_private.record_ddt_sync_change(p_id, stamp);
    RETURN;
  END IF;
  UPDATE public.ddt_righe SET deleted_at = stamp WHERE deleted_at IS NULL AND
    (ddt_id::text = p_id OR (ddt_id IS NULL AND anno = removed.anno AND numero_ddt = removed.numero));
END $$;

REVOKE ALL ON FUNCTION public.last_ddt_snapshot(text), public.last_ddt_changes(bigint,integer),
  public.last_ddt_revision(), public.last_write_ddt(jsonb,jsonb,bigint,boolean,text), public.last_delete_ddt(text,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.last_ddt_snapshot(text), public.last_ddt_changes(bigint,integer),
  public.last_ddt_revision(), public.last_write_ddt(jsonb,jsonb,bigint,boolean,text), public.last_delete_ddt(text,bigint)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

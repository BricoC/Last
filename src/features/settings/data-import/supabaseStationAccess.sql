-- Last | Protezione delle API Supabase e dei canali Realtime.
-- Eseguire come proprietario dello schema dal SQL Editor dopo il collaudo.
BEGIN;

CREATE SCHEMA IF NOT EXISTS last_private;
REVOKE ALL ON SCHEMA last_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS last_private.workstations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
ALTER TABLE last_private.workstations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE last_private.workstations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.last_station_is_allowed()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT (auth.jwt()->>'is_anonymous') IS DISTINCT FROM 'true'
    AND EXISTS (
      SELECT 1 FROM last_private.workstations
      WHERE user_id = auth.uid() AND revoked_at IS NULL
    );
$$;
REVOKE ALL ON FUNCTION public.last_station_is_allowed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.last_station_is_allowed() TO authenticated;

CREATE OR REPLACE FUNCTION public.last_require_station_access()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NOT public.last_station_is_allowed() THEN
    RAISE EXCEPTION 'Postazione Last non autorizzata' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.last_require_station_access() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.last_require_station_access() TO authenticated;

DO $$
DECLARE
  table_name text;
  columns text;
  managed_tables constant text[] := ARRAY[
    'ddt', 'ddt_righe', 'ddt_logs', 'clienti',
    'listino_generale', 'listini_vari', 'listino_generale_cestino',
    'listini_clienti', 'listini_clienti_cestino',
    'preventivi', 'preventivi_cestino', 'preventivi_sequenza',
    'fatture_elettroniche_testate', 'fatture_elettroniche_righe',
    'fornitori', 'ordini', 'note', 'offerte',
    'app_users', 'email_settings', 'backup_settings', 'riba_pagamenti'
  ];
BEGIN
  FOREACH table_name IN ARRAY managed_tables LOOP
    IF table_name = 'app_users' AND to_regclass('public.app_users') IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO columns
    FROM pg_attribute
    WHERE attrelid = to_regclass(format('public.%I', table_name)) AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated', columns, table_name);

    EXECUTE format('DROP POLICY IF EXISTS "Accesso completo gestionale" ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Last station gate" ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Last station sync" ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Last block anonymous access" ON public.%I', table_name);
    EXECUTE format('CREATE POLICY "Last block anonymous access" ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)', table_name);
    IF table_name = 'note' THEN
      DROP POLICY IF EXISTS "Accesso note per tutti" ON public.note;
    ELSIF table_name = 'offerte' THEN
      DROP POLICY IF EXISTS "Accesso offerte per tutti" ON public.offerte;
    END IF;

    IF table_name = 'app_users' THEN
      EXECUTE format('CREATE POLICY "Last station gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false)', table_name);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', table_name);
      EXECUTE format(
        'CREATE POLICY "Last station gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
         USING ((SELECT public.last_require_station_access())) WITH CHECK ((SELECT public.last_require_station_access()))',
        table_name
      );
      EXECUTE format(
        'CREATE POLICY "Last station sync" ON public.%I FOR ALL TO authenticated
         USING ((SELECT public.last_station_is_allowed())) WITH CHECK ((SELECT public.last_station_is_allowed()))',
        table_name
      );
    END IF;

    -- Postgres Changes non applica RLS agli eventi DELETE. Last usa canali privati.
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  sequence_name regclass;
  table_name text;
BEGIN
  FOR table_name, sequence_name IN
    SELECT t.relname, s.oid::regclass
    FROM pg_class s
    JOIN pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = s.oid
      AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i') AND d.refobjsubid > 0
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = t.relname
      AND p.policyname = 'Last station gate'
    WHERE n.nspname = 'public' AND s.relkind = 'S'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', sequence_name);
    IF table_name <> 'app_users' THEN
      EXECUTE format('GRANT USAGE ON SEQUENCE %s TO authenticated', sequence_name);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Last receive station broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "Last station broadcast gate" ON realtime.messages;
DROP POLICY IF EXISTS "Last block anonymous broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "Last block client broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "Last block client broadcast updates" ON realtime.messages;
DROP POLICY IF EXISTS "Last block client broadcast deletes" ON realtime.messages;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages' AND c.relrowsecurity
  ) THEN
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
CREATE POLICY "Last receive station broadcasts" ON realtime.messages
  FOR SELECT TO authenticated
  USING (extension = 'broadcast' AND realtime.topic() IN ('last:ddt', 'last:orders', 'last:order-sync', 'last:offers')
    AND (SELECT public.last_station_is_allowed()));
CREATE POLICY "Last station broadcast gate" ON realtime.messages
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((coalesce(realtime.topic(), '') NOT IN ('last:ddt', 'last:orders', 'last:order-sync', 'last:offers')
    AND topic NOT IN ('last:ddt', 'last:orders', 'last:order-sync', 'last:offers'))
    OR (SELECT public.last_station_is_allowed()));
CREATE POLICY "Last block anonymous broadcasts" ON realtime.messages
  AS RESTRICTIVE FOR SELECT TO anon
  USING (coalesce(realtime.topic(), '') NOT IN ('last:ddt', 'last:orders', 'last:order-sync', 'last:offers')
    AND topic NOT IN ('last:ddt', 'last:orders', 'last:order-sync', 'last:offers'));
CREATE POLICY "Last block client broadcasts" ON realtime.messages
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (coalesce(realtime.topic(), '') NOT IN ('last:ddt', 'last:orders', 'last:order-sync', 'last:offers')
    AND topic NOT IN ('last:ddt', 'last:orders', 'last:order-sync', 'last:offers'));
CREATE POLICY "Last block client broadcast updates" ON realtime.messages
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (topic NOT IN ('last:ddt', 'last:orders', 'last:order-sync', 'last:offers'))
  WITH CHECK (topic NOT IN ('last:ddt', 'last:orders', 'last:order-sync', 'last:offers'));
CREATE POLICY "Last block client broadcast deletes" ON realtime.messages
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (topic NOT IN ('last:ddt', 'last:orders', 'last:order-sync', 'last:offers'));

CREATE OR REPLACE FUNCTION last_private.publish_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  payload jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    payload := jsonb_build_object('eventType', TG_OP, 'old', jsonb_build_object('id', OLD.id));
  ELSIF TG_TABLE_NAME = 'ordini' THEN
    payload := jsonb_build_object('eventType', TG_OP, 'new', to_jsonb(NEW));
  ELSIF TG_TABLE_NAME = 'ddt' THEN
    payload := jsonb_build_object('eventType', TG_OP, 'new', jsonb_build_object('anno', NEW.anno));
  ELSE
    payload := jsonb_build_object('eventType', TG_OP);
  END IF;
  PERFORM realtime.send(payload, TG_TABLE_NAME, TG_ARGV[0], true);
  IF TG_ARGV[0] = 'last:orders' THEN
    PERFORM realtime.send(payload, TG_TABLE_NAME, 'last:order-sync', true);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION last_private.publish_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS last_publish_change ON public.ddt;
CREATE TRIGGER last_publish_change AFTER INSERT OR UPDATE OR DELETE ON public.ddt
  FOR EACH ROW EXECUTE FUNCTION last_private.publish_change('last:ddt');
DROP TRIGGER IF EXISTS last_publish_change ON public.ordini;
CREATE TRIGGER last_publish_change AFTER INSERT OR UPDATE OR DELETE ON public.ordini
  FOR EACH ROW EXECUTE FUNCTION last_private.publish_change('last:orders');
DROP TRIGGER IF EXISTS last_publish_change ON public.fornitori;
CREATE TRIGGER last_publish_change AFTER INSERT OR UPDATE OR DELETE ON public.fornitori
  FOR EACH ROW EXECUTE FUNCTION last_private.publish_change('last:orders');
DROP TRIGGER IF EXISTS last_publish_change ON public.offerte;
CREATE TRIGGER last_publish_change AFTER INSERT OR UPDATE OR DELETE ON public.offerte
  FOR EACH ROW EXECUTE FUNCTION last_private.publish_change('last:offers');

NOTIFY pgrst, 'reload schema';
COMMIT;

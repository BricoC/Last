BEGIN;
LOCK TABLE public.listino_generale, public.listini_vari, public.listini_clienti IN SHARE ROW EXCLUSIVE MODE;
CREATE SEQUENCE IF NOT EXISTS last_private.price_list_sync_revision;

CREATE OR REPLACE FUNCTION last_private.assign_price_list_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Keep the revision order aligned with transaction commit order within each stream.
  PERFORM pg_advisory_xact_lock(162842179, hashtext(TG_TABLE_NAME));
  NEW.last_sync_revision := nextval('last_private.price_list_sync_revision');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION last_private.assign_price_list_revision() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE stream text;
BEGIN
  FOREACH stream IN ARRAY ARRAY['listino_generale','listini_vari','listini_clienti'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS last_sync_revision bigint', stream);
    EXECUTE format('UPDATE public.%I SET last_sync_revision=nextval(''last_private.price_list_sync_revision'') WHERE last_sync_revision IS NULL', stream);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN last_sync_revision SET NOT NULL', stream);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I(last_sync_revision)', 'last_revision_' || stream, stream);
    EXECUTE format('DROP TRIGGER IF EXISTS last_assign_price_list_revision ON public.%I', stream);
    EXECUTE format('CREATE TRIGGER last_assign_price_list_revision BEFORE INSERT OR UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION last_private.assign_price_list_revision()', stream);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

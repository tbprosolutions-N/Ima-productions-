-- Realtime: allow calendar (and other clients) to receive live INSERT/UPDATE/DELETE on events and artists.
-- Required for postgres_changes subscriptions so the calendar UI updates without refresh.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'artists') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.artists;
  END IF;
END $$;

-- Data Warehouse backup: remove legacy sync_queue and all sync triggers.
-- Backup is now on-demand via export-to-sheets Edge Function (snapshot → GAS).

-- 1. Drop triggers that enqueue sync on events / finance_expenses
DROP TRIGGER IF EXISTS enqueue_auto_sync_on_events ON public.events;
DROP TRIGGER IF EXISTS enqueue_auto_sync_on_finance_expenses ON public.finance_expenses;

-- 2. Drop the enqueue function
DROP FUNCTION IF EXISTS public.enqueue_auto_sync();

-- 3. Remove sync_queue from Realtime publication (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'sync_queue') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.sync_queue;
  END IF;
END $$;

-- 4. Drop the sync_queue table (policies are dropped with the table)
DROP TABLE IF EXISTS public.sync_queue;

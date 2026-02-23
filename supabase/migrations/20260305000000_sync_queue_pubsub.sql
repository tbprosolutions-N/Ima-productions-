-- sync_queue: Async Pub/Sub pattern for Google Sheets sync.
-- Frontend INSERTs rows; Database Webhook triggers Edge Function; Edge Function updates status.
CREATE TABLE IF NOT EXISTS public.sync_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  data          jsonb NOT NULL,
  status        text NOT NULL CHECK (status IN ('pending','processing','completed','failed')) DEFAULT 'pending',
  result        jsonb,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON public.sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_agency ON public.sync_queue(agency_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON public.sync_queue(created_at DESC);

ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

-- Users can insert their own sync jobs
DROP POLICY IF EXISTS "Users can insert own sync jobs" ON public.sync_queue;
CREATE POLICY "Users can insert own sync jobs" ON public.sync_queue
  FOR INSERT WITH CHECK (
    (user_id::uuid) = auth.uid()
    AND (agency_id::uuid) IN (SELECT (agency_id::uuid) FROM public.users WHERE id = auth.uid())
  );

-- Users can read their own sync jobs (for Realtime + status polling)
DROP POLICY IF EXISTS "Users can read own sync jobs" ON public.sync_queue;
CREATE POLICY "Users can read own sync jobs" ON public.sync_queue
  FOR SELECT USING ((user_id::uuid) = auth.uid());

-- No UPDATE/DELETE for users — Edge Function uses Service Role
GRANT SELECT, INSERT ON public.sync_queue TO authenticated;

-- Enable Realtime for status updates (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sync_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_queue;
  END IF;
END $$;

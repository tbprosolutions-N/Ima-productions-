-- Step 1: Fix sync_queue RLS so users can read sync_queue rows for their agency (fixes 404 on Calendar).
-- Project uses public.users (id, agency_id); no "profiles" table.
-- Replace the restrictive "read own" policy with "read by agency".

ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own sync jobs" ON public.sync_queue;
DROP POLICY IF EXISTS "Users can select their own agency syncs" ON public.sync_queue;
CREATE POLICY "Users can select their own agency syncs" ON public.sync_queue
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE (agency_id::uuid) = (sync_queue.agency_id::uuid))
  );

-- Step 2: Clear stuck failed rows from old attempts (e.g. base64 decode errors).
DELETE FROM public.sync_queue WHERE status = 'failed';

COMMENT ON POLICY "Users can select their own agency syncs" ON public.sync_queue IS
  'Authenticated users can read sync_queue rows for their agency (same agency_id as in public.users). Fixes 404 when Calendar fetches sync status.';

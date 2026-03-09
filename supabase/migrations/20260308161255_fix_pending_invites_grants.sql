-- Fix: GRANT SELECT/INSERT/UPDATE/DELETE on pending_invites to authenticated role.
-- Without this, the Supabase REST API returns 400/403 even when RLS policies allow access,
-- because the role itself has no table-level permission.
-- Idempotent — safe to re-run.

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_invites TO authenticated;

-- RLS Audit: Ensure authenticated users can SELECT events, artists, clients.
-- Addresses Supabase Advisor warnings about RLS potentially blocking data access.
-- Idempotent: DROP IF EXISTS + CREATE.

-- Enable RLS if not already (idempotent)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- events: SELECT for users in same agency
DROP POLICY IF EXISTS "Users can read agency events" ON public.events;
CREATE POLICY "Users can read agency events" ON public.events
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid())
  );

-- artists: SELECT for users in same agency
DROP POLICY IF EXISTS "Users can read agency artists" ON public.artists;
CREATE POLICY "Users can read agency artists" ON public.artists
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid())
  );

-- clients: SELECT for users in same agency
DROP POLICY IF EXISTS "Users can read agency clients" ON public.clients;
CREATE POLICY "Users can read agency clients" ON public.clients
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid())
  );

-- Grant SELECT to authenticated (RLS policies enforce agency scoping)
GRANT SELECT ON public.events TO authenticated;
GRANT SELECT ON public.artists TO authenticated;
GRANT SELECT ON public.clients TO authenticated;

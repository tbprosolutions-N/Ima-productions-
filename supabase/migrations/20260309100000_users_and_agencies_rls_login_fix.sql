-- Ensure authenticated users can read their own row from public.users and their agency from public.agencies.
-- Without these, AuthContext profile fetch or AgencyContext agency fetch can fail → redirect to login or "טעינת הסוכנות נכשלה".
-- Idempotent: DROP IF EXISTS before CREATE.

-- 1) public.users: allow SELECT own row (required for AuthContext fetchUserProfile)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (id = auth.uid());

-- 2) public.agencies: allow SELECT for the agency the user belongs to (required for AgencyContext fetchAgencies)
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own agency" ON public.agencies;
CREATE POLICY "Users can read own agency" ON public.agencies
  FOR SELECT USING (
    id IN (SELECT agency_id FROM public.users WHERE id = auth.uid())
  );

COMMENT ON POLICY "Users can read own profile" ON public.users IS
  'Authenticated user can read their own row. Required for login profile fetch.';
COMMENT ON POLICY "Users can read own agency" ON public.agencies IS
  'Authenticated user can read the agency row for their users.agency_id. Required for MainLayout/AgencyContext.';

-- Ensure authenticated users can SELECT their own row from public.users.
-- Without this, profile fetch fails → login loop.
-- Idempotent: DROP IF EXISTS before CREATE.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (id = auth.uid());

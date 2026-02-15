-- Allow anonymous users to check if an email exists for magic-link login.
-- RLS on users blocks anon SELECT (auth.uid() = id). This RPC runs with
-- SECURITY DEFINER and returns only a boolean, so it's safe for login pre-check.

CREATE OR REPLACE FUNCTION public.check_email_exists_for_login(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(NULLIF(p_email, '')))
  );
$$;

-- Grant execute to anon so login page can call it
GRANT EXECUTE ON FUNCTION public.check_email_exists_for_login(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_email_exists_for_login(text) TO authenticated;

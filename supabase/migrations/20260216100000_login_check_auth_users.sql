-- Check auth.users (source of truth for magic links) instead of public.users.
-- generateLink requires user in auth.users; this aligns the pre-check with that.

CREATE OR REPLACE FUNCTION public.check_email_exists_for_login(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(NULLIF(p_email, '')))
  );
$$;

-- IMA OS: login self-heal (run once in Supabase SQL Editor)
-- Fixes: "Could not find the function public.ensure_user_profile(company_code) in the schema cache"

CREATE OR REPLACE FUNCTION public.ensure_user_profile(company_code TEXT DEFAULT NULL)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  au RECORD;
  resolved_agency_id UUID;
  resolved_email TEXT;
  resolved_full_name TEXT;
  resolved_role TEXT;
  result_row public.users%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = uid) THEN
    SELECT * INTO result_row FROM public.users u WHERE u.id = uid;
    RETURN result_row;
  END IF;

  SELECT * INTO au FROM auth.users WHERE id = uid;
  resolved_email := COALESCE(au.email, '');
  resolved_full_name := COALESCE(
    au.raw_user_meta_data->>'full_name',
    NULLIF(split_part(resolved_email, '@', 1), ''),
    'New User'
  );

  IF company_code IS NOT NULL AND length(trim(company_code)) > 0 THEN
    SELECT id INTO resolved_agency_id
    FROM public.agencies
    WHERE company_id = trim(company_code)
    LIMIT 1;
  END IF;

  IF resolved_agency_id IS NULL THEN
    SELECT id INTO resolved_agency_id
    FROM public.agencies
    WHERE type = 'ima'
    LIMIT 1;
  END IF;

  IF resolved_agency_id IS NULL THEN
    RAISE EXCEPTION 'No agency found to provision user';
  END IF;

  resolved_role := 'producer';
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.agency_id = resolved_agency_id AND u.role = 'owner'
  ) THEN
    resolved_role := 'owner';
  END IF;

  INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
  VALUES (uid, resolved_email, resolved_full_name, resolved_role, resolved_agency_id, FALSE)
  RETURNING * INTO result_row;

  RETURN result_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile(TEXT) TO authenticated;

-- Force PostgREST to reload schema cache so the RPC is discoverable immediately:
NOTIFY pgrst, 'reload schema';


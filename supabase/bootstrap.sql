-- IMA OS: Supabase bootstrap/repair (idempotent)
-- Goal: make the system run successfully even if you previously ran the older supabase/schema.sql.
-- Run this in Supabase SQL Editor.

-- 0) Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) Ensure agencies has company_id (older schema.sql doesn't)
ALTER TABLE IF EXISTS public.agencies
  ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);

-- Ensure agencies.type is NOT NULL in production schema (older schema may allow null)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='agencies' AND column_name='type'
  ) THEN
    EXECUTE 'ALTER TABLE public.agencies ALTER COLUMN type SET NOT NULL';
  END IF;
EXCEPTION WHEN others THEN
  -- ignore if cannot alter due to existing null rows; user can fix manually
END $$;

-- 2) Ensure users has agency_id NOT NULL (older schema may allow null)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='agency_id'
  ) THEN
    -- best-effort; if existing nulls, this will fail (and that's ok)
    EXECUTE 'ALTER TABLE public.users ALTER COLUMN agency_id SET NOT NULL';
  END IF;
EXCEPTION WHEN others THEN
END $$;

-- 3) Ensure default IMA agency exists (used by login + backfill)
INSERT INTO public.agencies (name, type, company_id, settings)
SELECT 'IMA Productions', 'ima', 'IMA001', '{"currency":"ILS","timezone":"Asia/Jerusalem"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.agencies WHERE company_id = 'IMA001');

-- 4) Ensure RPC exists (login self-heal)
-- NOTE: This requires public.users + public.agencies to exist.
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

-- 5) Backfill public.users from auth.users (when users table is empty)
INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
SELECT
  au.id,
  COALESCE(au.email, '') AS email,
  COALESCE(au.raw_user_meta_data->>'full_name', NULLIF(split_part(COALESCE(au.email, ''), '@', 1), ''), 'New User') AS full_name,
  COALESCE(au.raw_user_meta_data->>'role', 'producer') AS role,
  (SELECT id FROM public.agencies WHERE company_id = 'IMA001' LIMIT 1) AS agency_id,
  COALESCE((au.raw_user_meta_data->>'onboarded')::boolean, FALSE) AS onboarded
FROM auth.users au
LEFT JOIN public.users u ON u.id = au.id
WHERE u.id IS NULL;

-- 6) Storage bucket for expenses (private)
-- This works in Supabase SQL Editor. If it fails, create bucket manually in Storage UI.
INSERT INTO storage.buckets (id, name, public)
VALUES ('expenses', 'expenses', false)
ON CONFLICT (id) DO NOTHING;

-- 7) Force PostgREST schema cache refresh (fixes “schema cache” RPC errors)
NOTIFY pgrst, 'reload schema';


-- IMA OS: Backfill public.users from auth.users (run once)
-- Use when auth users already exist but public.users is empty (triggers were installed later).

-- Ensure default agencies exist (safe if already present)
INSERT INTO public.agencies (name, type, company_id, settings)
SELECT 'IMA Productions', 'ima', 'IMA001', '{"currency":"ILS","timezone":"Asia/Jerusalem"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.agencies WHERE company_id = 'IMA001');

-- Insert missing profile rows for existing auth users
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

-- Optional: make sure PostgREST refreshes schema (not required for data, but safe)
NOTIFY pgrst, 'reload schema';


-- Seed npcollectivebooking@gmail.com (Alon Benartzi) as owner for Google SSO first login.
-- Run only if agencies exist. Uses first agency and first owner as invited_by (or skips if user already in pending_invites).

DO $$
DECLARE
  v_agency_id UUID;
  v_invited_by UUID;
BEGIN
  SELECT id INTO v_agency_id FROM public.agencies LIMIT 1;
  IF v_agency_id IS NULL THEN
    RETURN;
  END IF;

  -- Get first owner for invited_by (required FK)
  SELECT id INTO v_invited_by FROM public.users WHERE role = 'owner' LIMIT 1;
  IF v_invited_by IS NULL THEN
    RETURN;
  END IF;

  -- Insert if not already present
  INSERT INTO public.pending_invites (email, full_name, role, agency_id, invited_by, permissions)
  VALUES (
    'npcollectivebooking@gmail.com',
    'Alon Benartzi',
    'owner',
    v_agency_id,
    v_invited_by,
    '{}'::jsonb
  )
  ON CONFLICT (email, agency_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    invited_by = EXCLUDED.invited_by;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Seed owner: %', SQLERRM;
END $$;

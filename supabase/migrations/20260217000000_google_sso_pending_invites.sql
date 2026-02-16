-- Google SSO migration: pending invites for add-user flow (no email/Edge Function).
-- When a user signs in with Google, handle_new_user checks pending_invites and uses that agency/role.

CREATE TABLE IF NOT EXISTS public.pending_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('producer', 'finance', 'manager', 'owner')) DEFAULT 'producer',
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email, agency_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_invites_email ON public.pending_invites(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_pending_invites_agency ON public.pending_invites(agency_id);

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage pending_invites for their agency"
  ON public.pending_invites
  FOR ALL
  USING (
    agency_id IN (
      SELECT agency_id FROM public.users
      WHERE id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM public.users
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- RPC: Add invited user (owner only). No email sent; user signs in with Google.
CREATE OR REPLACE FUNCTION public.add_invited_user(
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_agency_id UUID,
  p_permissions JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_agency UUID;
BEGIN
  -- Caller must be owner of the agency
  SELECT agency_id INTO v_caller_agency
  FROM public.users
  WHERE id = auth.uid() AND role = 'owner' AND agency_id = p_agency_id;
  IF v_caller_agency IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'רק Owner יכול להוסיף משתמשים');
  END IF;

  p_email := LOWER(TRIM(p_email));
  IF p_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'אימייל חסר');
  END IF;

  p_full_name := COALESCE(NULLIF(TRIM(p_full_name), ''), split_part(p_email, '@', 1));
  p_role := COALESCE(NULLIF(p_role, ''), 'producer');
  IF p_role NOT IN ('producer', 'finance', 'manager', 'owner') THEN
    p_role := 'producer';
  END IF;

  INSERT INTO public.pending_invites (email, full_name, role, agency_id, invited_by, permissions)
  VALUES (p_email, p_full_name, p_role, p_agency_id, auth.uid(), COALESCE(p_permissions, '{}'))
  ON CONFLICT (email, agency_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    permissions = EXCLUDED.permissions,
    invited_by = auth.uid(),
    created_at = NOW();

  RETURN jsonb_build_object('ok', true, 'email', p_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_invited_user(TEXT, TEXT, TEXT, UUID, JSONB) TO authenticated;

-- Update handle_new_user: only create public.users when email is in pending_invites (invite-only B2B).
-- If not invited, no public.users row → app will fail profile fetch → sign out and redirect to /login?unauthorized=1.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  resolved_agency_id UUID;
  resolved_role TEXT;
  resolved_full_name TEXT;
  invite_rec RECORD;
BEGIN
  resolved_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, ''), '@', 1), 'New User');
  resolved_role := 'producer';
  resolved_agency_id := NULL;

  -- Check pending_invites for this email (invite-only)
  SELECT * INTO invite_rec
  FROM public.pending_invites
  WHERE LOWER(email) = LOWER(COALESCE(NEW.email, ''))
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Bootstrap: if no users exist yet, create first owner for first IMA agency
    IF (SELECT COUNT(*) FROM public.users) = 0 THEN
      SELECT id INTO resolved_agency_id FROM public.agencies WHERE type = 'ima' OR company_id = 'IMA001' LIMIT 1;
      IF resolved_agency_id IS NULL THEN
        INSERT INTO public.agencies (name, type, company_id, settings)
        VALUES ('IMA Productions', 'ima', 'IMA001', '{"currency":"ILS","timezone":"Asia/Jerusalem"}'::jsonb)
        RETURNING id INTO resolved_agency_id;
      END IF;
      resolved_role := 'owner';
      INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
      VALUES (NEW.id, COALESCE(NEW.email, ''), resolved_full_name, resolved_role, resolved_agency_id, FALSE);
      RETURN NEW;
    END IF;
    -- Not invited: do not create public.users. App will redirect to /login?unauthorized=1
    RETURN NEW;
  END IF;

  resolved_agency_id := invite_rec.agency_id;
  resolved_role := invite_rec.role;
  resolved_full_name := COALESCE(NULLIF(TRIM(invite_rec.full_name), ''), resolved_full_name);
  DELETE FROM public.pending_invites WHERE id = invite_rec.id;

  INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    resolved_full_name,
    resolved_role,
    resolved_agency_id,
    FALSE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update ensure_user_profile: only create when email is in pending_invites (invite-only).
-- Prevents ensure_user_profile from creating users for uninvited OAuth sign-ins.
CREATE OR REPLACE FUNCTION public.ensure_user_profile(company_code TEXT DEFAULT NULL)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  result_row public.users%ROWTYPE;
  invite_rec RECORD;
  v_agency_id UUID;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = uid) THEN
    SELECT * INTO result_row FROM public.users u WHERE u.id = uid;
    RETURN result_row;
  END IF;

  -- Bootstrap: first user ever becomes owner
  IF (SELECT COUNT(*) FROM public.users) = 0 THEN
    SELECT id INTO v_agency_id FROM public.agencies WHERE type = 'ima' OR company_id = 'IMA001' LIMIT 1;
    IF v_agency_id IS NULL THEN
      INSERT INTO public.agencies (name, type, company_id, settings)
      VALUES ('IMA Productions', 'ima', 'IMA001', '{"currency":"ILS","timezone":"Asia/Jerusalem"}'::jsonb)
      RETURNING id INTO v_agency_id;
    END IF;
    INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
    SELECT uid, au.email, COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1), 'New User'), 'owner', v_agency_id, FALSE
    FROM auth.users au WHERE au.id = uid
    RETURNING * INTO result_row;
    RETURN result_row;
  END IF;

  -- Invite-only: only create if email is in pending_invites
  SELECT pi.* INTO invite_rec FROM public.pending_invites pi
  WHERE LOWER(pi.email) = (SELECT LOWER(au.email) FROM auth.users au WHERE au.id = uid)
  ORDER BY pi.created_at DESC LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not authorized. Ask an owner to add your email in Settings → Users.';
  END IF;

  DELETE FROM public.pending_invites WHERE id = invite_rec.id;

  INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
  VALUES (
    uid,
    (SELECT email FROM auth.users WHERE id = uid),
    COALESCE(NULLIF(TRIM(invite_rec.full_name), ''), (SELECT split_part(email, '@', 1) FROM auth.users WHERE id = uid), 'New User'),
    invite_rec.role,
    invite_rec.agency_id,
    FALSE
  )
  RETURNING * INTO result_row;

  RETURN result_row;
END;
$$;

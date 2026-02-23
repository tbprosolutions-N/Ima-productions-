-- ============================================================
-- CONSOLIDATED PRODUCTION SYNC MIGRATION
-- NPC Management System — Run once against production Supabase.
-- All statements are idempotent (IF NOT EXISTS / OR REPLACE / ON CONFLICT).
-- Order: Schema → Indexes → RLS → RPCs → Grants → Reload
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1: CORE TABLE SCHEMA ADDITIONS
-- ────────────────────────────────────────────────────────────

-- 1A. artists.amount (סכום)
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS amount numeric DEFAULT NULL;
COMMENT ON COLUMN public.artists.amount IS 'סכום – optional sum/amount for artist context';

-- 1B. events.event_time (שעת אירוע)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_time text DEFAULT NULL;
COMMENT ON COLUMN public.events.event_time IS 'שעת אירוע – event time (e.g. 14:30)';

-- 1C. clients.color (UI color for cards/calendar)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS color text DEFAULT NULL;
COMMENT ON COLUMN public.clients.color IS 'Hex color for UI display (e.g. #3B82F6)';

-- 1D. documents.send_to (who receives generated doc: artist | client | both)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS send_to text DEFAULT 'both';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_send_to_check'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_send_to_check
        CHECK (send_to IN ('artist', 'client', 'both'));
  END IF;
END $$;
COMMENT ON COLUMN public.documents.send_to IS 'Recipient for generated doc: artist, client, or both';

-- 1E. finance_expenses full schema (idempotent add-if-missing)
ALTER TABLE public.finance_expenses
  ADD COLUMN IF NOT EXISTS vendor         text,
  ADD COLUMN IF NOT EXISTS supplier_name  text,
  ADD COLUMN IF NOT EXISTS amount         decimal(10,2),
  ADD COLUMN IF NOT EXISTS vat            decimal(10,2),
  ADD COLUMN IF NOT EXISTS expense_date   date,
  ADD COLUMN IF NOT EXISTS notes          text,
  ADD COLUMN IF NOT EXISTS morning_status varchar(20)  DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS morning_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at     timestamptz  DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz  DEFAULT now(),
  ADD COLUMN IF NOT EXISTS uploaded_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storage_path   text;

-- Backfill supplier_name from vendor
UPDATE public.finance_expenses
  SET supplier_name = vendor
  WHERE supplier_name IS NULL AND vendor IS NOT NULL;

-- 1F. pending_invites table (invite-only auth)
CREATE TABLE IF NOT EXISTS public.pending_invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  full_name  text NOT NULL DEFAULT '',
  role       text NOT NULL CHECK (role IN ('producer','finance','manager','owner')) DEFAULT 'producer',
  agency_id  uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permissions jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  UNIQUE(email, agency_id)
);

-- ────────────────────────────────────────────────────────────
-- SECTION 2: PERFORMANCE INDEXES
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_agency_id              ON public.users(agency_id);
CREATE INDEX IF NOT EXISTS idx_clients_agency_id             ON public.clients(agency_id);
CREATE INDEX IF NOT EXISTS idx_artists_agency_id             ON public.artists(agency_id);
CREATE INDEX IF NOT EXISTS idx_events_agency_id              ON public.events(agency_id);
CREATE INDEX IF NOT EXISTS idx_documents_agency_id           ON public.documents(agency_id);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_agency_id    ON public.finance_expenses(agency_id);
CREATE INDEX IF NOT EXISTS idx_events_event_date             ON public.events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_agency_date            ON public.events(agency_id, event_date);
CREATE INDEX IF NOT EXISTS idx_pending_invites_email         ON public.pending_invites(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_pending_invites_agency        ON public.pending_invites(agency_id);

-- Optional (add if tables exist; skip error if missing in some deployments)
DO $$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_integrations_agency_id ON public.integrations(agency_id)';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sync_jobs_agency_id ON public.sync_jobs(agency_id)';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- SECTION 3: ROW-LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

-- pending_invites RLS
ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners can manage pending_invites for their agency" ON public.pending_invites;
CREATE POLICY "Owners can manage pending_invites for their agency"
  ON public.pending_invites FOR ALL
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

-- finance_expenses RLS
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read agency finance_expenses"     ON public.finance_expenses;
DROP POLICY IF EXISTS "Finance roles can insert finance_expenses"  ON public.finance_expenses;
DROP POLICY IF EXISTS "Finance roles can update finance_expenses"  ON public.finance_expenses;
DROP POLICY IF EXISTS "Finance roles can delete finance_expenses"  ON public.finance_expenses;

CREATE POLICY "Users can read agency finance_expenses" ON public.finance_expenses
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "Finance roles can insert finance_expenses" ON public.finance_expenses
  FOR INSERT WITH CHECK (
    agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid() AND role IN ('owner','manager','finance'))
  );
CREATE POLICY "Finance roles can update finance_expenses" ON public.finance_expenses
  FOR UPDATE USING (
    agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid() AND role IN ('owner','manager','finance'))
  );
CREATE POLICY "Finance roles can delete finance_expenses" ON public.finance_expenses
  FOR DELETE USING (
    agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid() AND role IN ('owner','manager','finance'))
  );

-- Storage bucket for expenses
INSERT INTO storage.buckets (id, name, public)
  VALUES ('expenses', 'expenses', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Agency members can read expenses files"  ON storage.objects;
DROP POLICY IF EXISTS "Finance roles can upload expenses files" ON storage.objects;
DROP POLICY IF EXISTS "Finance roles can delete expenses files" ON storage.objects;

CREATE POLICY "Agency members can read expenses files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "Finance roles can upload expenses files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('owner','manager','finance')
  );
CREATE POLICY "Finance roles can delete expenses files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('owner','manager','finance')
  );

-- ────────────────────────────────────────────────────────────
-- SECTION 4: AUTH RPCs (all CREATE OR REPLACE → idempotent)
-- ────────────────────────────────────────────────────────────

-- 4A. check_email_exists_for_login
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

-- 4B. handle_new_user trigger (invite-only; first user becomes owner)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  resolved_agency_id uuid;
  resolved_role text;
  resolved_full_name text;
  invite_rec RECORD;
BEGIN
  resolved_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'New User'
  );
  resolved_role := 'producer';
  resolved_agency_id := NULL;

  -- Check pending_invites for this email
  SELECT * INTO invite_rec
    FROM public.pending_invites
    WHERE LOWER(email) = LOWER(COALESCE(NEW.email, ''))
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

  IF NOT FOUND THEN
    -- Bootstrap: first user ever → owner of a new or existing agency
    IF (SELECT COUNT(*) FROM public.users) = 0 THEN
      SELECT id INTO resolved_agency_id
        FROM public.agencies
        WHERE type = 'ima' OR company_id = 'IMA001'
        LIMIT 1;

      IF resolved_agency_id IS NULL THEN
        INSERT INTO public.agencies (name, type, company_id, settings)
          VALUES (
            'NPC Agency',
            'ima',
            'NPC001',
            '{"currency":"ILS","timezone":"Asia/Jerusalem"}'::jsonb
          )
          RETURNING id INTO resolved_agency_id;
      END IF;

      resolved_role := 'owner';
      INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
        VALUES (NEW.id, COALESCE(NEW.email,''), resolved_full_name, resolved_role, resolved_agency_id, false);
      RETURN NEW;
    END IF;
    -- Not invited and not first: skip (app redirects to /login?unauthorized=1)
    RETURN NEW;
  END IF;

  -- Invited user: consume invite and create profile
  resolved_agency_id := invite_rec.agency_id;
  resolved_role      := invite_rec.role;
  resolved_full_name := COALESCE(NULLIF(TRIM(invite_rec.full_name),''), resolved_full_name);
  DELETE FROM public.pending_invites WHERE id = invite_rec.id;

  INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
    VALUES (NEW.id, COALESCE(NEW.email,''), resolved_full_name, resolved_role, resolved_agency_id, false);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4C. ensure_user_profile (fallback: invite-only; bootstrap if 0 users)
CREATE OR REPLACE FUNCTION public.ensure_user_profile(company_code text DEFAULT NULL)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  result_row public.users%ROWTYPE;
  invite_rec RECORD;
  v_agency_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Already exists
  SELECT * INTO result_row FROM public.users WHERE id = uid;
  IF FOUND THEN RETURN result_row; END IF;

  -- Bootstrap: first user → owner
  IF (SELECT COUNT(*) FROM public.users) = 0 THEN
    SELECT id INTO v_agency_id
      FROM public.agencies WHERE type = 'ima' OR company_id IN ('IMA001','NPC001')
      LIMIT 1;

    IF v_agency_id IS NULL THEN
      INSERT INTO public.agencies (name, type, company_id, settings)
        VALUES ('NPC Agency', 'ima', 'NPC001', '{"currency":"ILS","timezone":"Asia/Jerusalem"}'::jsonb)
        RETURNING id INTO v_agency_id;
    END IF;

    INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
      SELECT uid,
             au.email,
             COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email,'@',1), 'Owner'),
             'owner',
             v_agency_id,
             false
        FROM auth.users au WHERE au.id = uid
      RETURNING * INTO result_row;
    RETURN result_row;
  END IF;

  -- Invite-only: must have a pending invite
  SELECT pi.* INTO invite_rec
    FROM public.pending_invites pi
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
      COALESCE(NULLIF(TRIM(invite_rec.full_name),''), split_part((SELECT email FROM auth.users WHERE id = uid),'@',1), 'New User'),
      invite_rec.role,
      invite_rec.agency_id,
      false
    )
    RETURNING * INTO result_row;

  RETURN result_row;
END;
$$;

-- 4D. add_invited_user (owner only)
CREATE OR REPLACE FUNCTION public.add_invited_user(
  p_email      text,
  p_full_name  text,
  p_role       text,
  p_agency_id  uuid,
  p_permissions jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_agency uuid;
BEGIN
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
  IF p_role NOT IN ('producer','finance','manager','owner') THEN p_role := 'producer'; END IF;

  INSERT INTO public.pending_invites (email, full_name, role, agency_id, invited_by, permissions)
    VALUES (p_email, p_full_name, p_role, p_agency_id, auth.uid(), COALESCE(p_permissions,'{}'))
    ON CONFLICT (email, agency_id) DO UPDATE SET
      full_name   = EXCLUDED.full_name,
      role        = EXCLUDED.role,
      permissions = EXCLUDED.permissions,
      invited_by  = auth.uid(),
      created_at  = NOW();

  RETURN jsonb_build_object('ok', true, 'email', p_email);
END;
$$;

-- 4E. update_agency_user_role (owner only)
-- Drop first so we can change parameter names if the existing function had different param names (e.g. p_new_role)
DROP FUNCTION IF EXISTS public.update_agency_user_role(uuid, text);
CREATE OR REPLACE FUNCTION public.update_agency_user_role(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_caller_role  text;
  v_target_agency uuid;
  v_caller_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Unauthorized'); END IF;
  SELECT role INTO v_caller_role FROM public.users WHERE id = v_caller_id;
  IF v_caller_role IS NULL THEN RETURN jsonb_build_object('ok',false,'error','User not found'); END IF;
  IF v_caller_role != 'owner' THEN RETURN jsonb_build_object('ok',false,'error','Only owner can update roles'); END IF;
  SELECT agency_id INTO v_target_agency FROM public.users WHERE id = p_user_id;
  SELECT agency_id INTO v_caller_agency FROM public.users WHERE id = v_caller_id;
  IF v_target_agency IS NULL OR v_caller_agency != v_target_agency THEN
    RETURN jsonb_build_object('ok',false,'error','User not in same agency');
  END IF;
  IF p_role NOT IN ('producer','finance','manager','owner') THEN
    RETURN jsonb_build_object('ok',false,'error','Invalid role');
  END IF;
  UPDATE public.users SET role = p_role, updated_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('ok',true);
END;
$$;

-- 4F. remove_agency_user (owner only)
DROP FUNCTION IF EXISTS public.remove_agency_user(uuid);
CREATE OR REPLACE FUNCTION public.remove_agency_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_caller_role  text;
  v_target_agency uuid;
  v_caller_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Unauthorized'); END IF;
  IF p_user_id = v_caller_id THEN RETURN jsonb_build_object('ok',false,'error','Cannot remove yourself'); END IF;
  SELECT role INTO v_caller_role FROM public.users WHERE id = v_caller_id;
  IF v_caller_role IS NULL THEN RETURN jsonb_build_object('ok',false,'error','User not found'); END IF;
  IF v_caller_role != 'owner' THEN RETURN jsonb_build_object('ok',false,'error','Only owner can remove users'); END IF;
  SELECT agency_id INTO v_target_agency FROM public.users WHERE id = p_user_id;
  SELECT agency_id INTO v_caller_agency FROM public.users WHERE id = v_caller_id;
  IF v_target_agency IS NULL OR v_caller_agency != v_target_agency THEN
    RETURN jsonb_build_object('ok',false,'error','User not in same agency');
  END IF;
  DELETE FROM public.users WHERE id = p_user_id;
  RETURN jsonb_build_object('ok',true);
END;
$$;

-- 4G. remove_pending_invite (owner only)
CREATE OR REPLACE FUNCTION public.remove_pending_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_caller_role  text;
  v_invite_agency uuid;
  v_caller_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Unauthorized'); END IF;
  SELECT role INTO v_caller_role FROM public.users WHERE id = v_caller_id;
  IF v_caller_role IS NULL THEN RETURN jsonb_build_object('ok',false,'error','User not found'); END IF;
  IF v_caller_role != 'owner' THEN RETURN jsonb_build_object('ok',false,'error','Only owner can remove invites'); END IF;
  SELECT agency_id INTO v_invite_agency FROM public.pending_invites WHERE id = p_invite_id;
  SELECT agency_id INTO v_caller_agency FROM public.users WHERE id = v_caller_id;
  IF v_invite_agency IS NULL OR v_caller_agency != v_invite_agency THEN
    RETURN jsonb_build_object('ok',false,'error','Invite not found or not in same agency');
  END IF;
  DELETE FROM public.pending_invites WHERE id = p_invite_id;
  RETURN jsonb_build_object('ok',true);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 5: GRANTS
-- ────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.check_email_exists_for_login(text)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile(text)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_invited_user(text,text,text,uuid,jsonb)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agency_user_role(uuid,text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_agency_user(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_pending_invite(uuid)                  TO authenticated;

-- ────────────────────────────────────────────────────────────
-- SECTION 6: RELOAD POSTGREST SCHEMA CACHE
-- ────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- END OF CONSOLIDATED MIGRATION
-- ============================================================

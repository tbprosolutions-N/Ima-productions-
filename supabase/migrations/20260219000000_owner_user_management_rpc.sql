-- RPCs for owner/super-admin to edit and delete agency users.
-- Restricted to: role = 'owner' OR email = 'tb.prosolutions@gmail.com'

CREATE OR REPLACE FUNCTION public.update_agency_user_role(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_email text;
  v_target_agency uuid;
  v_caller_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  SELECT role, email INTO v_caller_role, v_caller_email
  FROM public.users WHERE id = v_caller_id;

  IF v_caller_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User not found');
  END IF;

  IF v_caller_role != 'owner' AND LOWER(COALESCE(v_caller_email, '')) != 'tb.prosolutions@gmail.com' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only owner or admin can update user roles');
  END IF;

  SELECT agency_id INTO v_target_agency FROM public.users WHERE id = p_user_id;
  SELECT agency_id INTO v_caller_agency FROM public.users WHERE id = v_caller_id;

  IF v_target_agency IS NULL OR v_caller_agency != v_target_agency THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User not in same agency');
  END IF;

  IF p_role NOT IN ('producer', 'finance', 'manager', 'owner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid role');
  END IF;

  UPDATE public.users SET role = p_role, updated_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Drop first in case existing function has different return type
DROP FUNCTION IF EXISTS public.remove_agency_user(uuid);

CREATE OR REPLACE FUNCTION public.remove_agency_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_email text;
  v_target_agency uuid;
  v_caller_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  IF p_user_id = v_caller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot remove yourself');
  END IF;

  SELECT role, email INTO v_caller_role, v_caller_email
  FROM public.users WHERE id = v_caller_id;

  IF v_caller_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User not found');
  END IF;

  IF v_caller_role != 'owner' AND LOWER(COALESCE(v_caller_email, '')) != 'tb.prosolutions@gmail.com' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only owner or admin can remove users');
  END IF;

  SELECT agency_id INTO v_target_agency FROM public.users WHERE id = p_user_id;
  SELECT agency_id INTO v_caller_agency FROM public.users WHERE id = v_caller_id;

  IF v_target_agency IS NULL OR v_caller_agency != v_target_agency THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User not in same agency');
  END IF;

  DELETE FROM public.users WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

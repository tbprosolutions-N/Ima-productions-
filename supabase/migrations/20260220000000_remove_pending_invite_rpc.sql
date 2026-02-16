-- RPC to remove a pending invite (for users not yet signed in).
-- Same permission check as remove_agency_user: owner or tb.prosolutions@gmail.com

CREATE OR REPLACE FUNCTION public.remove_pending_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_email text;
  v_invite_agency uuid;
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
    RETURN jsonb_build_object('ok', false, 'error', 'Only owner or admin can remove invites');
  END IF;

  SELECT agency_id INTO v_invite_agency FROM public.pending_invites WHERE id = p_invite_id;
  SELECT agency_id INTO v_caller_agency FROM public.users WHERE id = v_caller_id;

  IF v_invite_agency IS NULL OR v_caller_agency != v_invite_agency THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invite not found or not in same agency');
  END IF;

  DELETE FROM public.pending_invites WHERE id = p_invite_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_pending_invite(uuid) TO authenticated;

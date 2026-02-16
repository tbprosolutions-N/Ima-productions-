-- Allow authenticated users to call owner RPCs (actual permission is enforced inside the functions by role = 'owner').
GRANT EXECUTE ON FUNCTION public.update_agency_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_agency_user(uuid) TO authenticated;

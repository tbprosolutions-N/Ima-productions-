# Login Email Check RPC — Manual Migration

If `supabase db push` fails (e.g. migration history conflicts), run this SQL manually in **Supabase Dashboard → SQL Editor**:

```sql
-- Allow anonymous users to check if an email exists for magic-link login.
CREATE OR REPLACE FUNCTION public.check_email_exists_for_login(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(NULLIF(p_email, '')))
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_email_exists_for_login(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_email_exists_for_login(text) TO authenticated;
```

This fixes the "כתובת הדוא"ל לא נמצאה במערכת" error that occurred when RLS blocked anonymous users from reading the `users` table during the login pre-check.

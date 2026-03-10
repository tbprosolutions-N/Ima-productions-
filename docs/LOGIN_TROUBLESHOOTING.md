# Login troubleshooting — single checklist

If login doesn’t work (redirect loop, “profile missing”, or nothing happens), use this list **in order**. The app uses **one login page** (`src/pages/LoginPage.tsx`) and **one callback** (`src/pages/AuthCallbackPage.tsx`). See **docs/ROUTES_AND_PAGES.md** for which file handles which URL.

---

## 1. Use the correct URL

- **Production:** Open **https://npc-am.com** (not a Vercel preview URL).
- **Local:** **http://localhost:5173**.

---

## 2. Supabase — Redirect URL (required)

1. **Supabase Dashboard** → your project → **Authentication** → **URL Configuration**.
2. **Redirect URLs** — add **both** (so login works from `npc-am.com` and `www.npc-am.com`):
   ```
   https://npc-am.com/auth/callback
   https://www.npc-am.com/auth/callback
   ```
3. **Site URL** can be `https://npc-am.com` (or add `https://www.npc-am.com` if you use www).
4. Save and wait ~1 minute.

Without this, Supabase will not redirect back after Google and login will fail.

---

## 3. Supabase — RLS (if you reach callback then get sent back to login)

If you see “מתחבר...” on `/auth/callback` and then end up on `/login?unauthorized=1` or timeout:

1. **SQL Editor** → run: `supabase/migrations/20260309100000_users_and_agencies_rls_login_fix.sql`
2. This allows users to read their own row in `public.users` and `public.agencies`.

---

## 4. User must exist in `public.users`

- **Google:** After first sign-in, `ensure_user_profile` (or bootstrap) must create a row in `public.users`. If the user is not the first and not in `pending_invites`, no row is created and the app sends you back to login.
- **Fix:** Use **docs/BOOTSTRAP_GET_ME_IN.md** (API or `npm run bootstrap-user`) to create your user row, or add the email to **Settings → ניהול משתמשים** (pending invite) before they sign in.

---

## 5. Email + password

- Login page has **“או כניסה עם דוא״ל וסיסמה”**. It only works if that user has a **password set in Supabase** (e.g. via `BOOTSTRAP_PASSWORD=... npm run bootstrap-user your@email.com`).
- If you signed up only with Google, use the **Google** button unless you ran bootstrap with a password.

---

## 6. Vercel env (production)

- **VITE_SUPABASE_URL** and **VITE_SUPABASE_ANON_KEY** must be set for your Supabase project.
- Redeploy after changing env.

---

## Where to change code

- **Login screen (copy, buttons, layout):** `src/pages/LoginPage.tsx`
- **Callback (after Google redirect):** `src/pages/AuthCallbackPage.tsx`
- **Auth logic (session, profile fetch):** `src/contexts/AuthContext.tsx`
- **Supabase client and redirect URL:** `src/lib/supabase.ts`

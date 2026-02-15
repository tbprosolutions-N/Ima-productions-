# Final Server Setup — npc-am.com Production

Run the steps below **before** go-live. Use your **real** Supabase project (no demo).

---

## 1. Supabase: Expenses storage bucket and RLS

Run this script in **Supabase Dashboard → SQL Editor**.  
**Prerequisite:** The `finance_expenses` table and `public.users` (with `agency_id`, `role`) must already exist (from your main schema or bootstrap).

```sql
-- Storage bucket "expenses" (create if missing)
INSERT INTO storage.buckets (id, name, public)
VALUES ('expenses', 'expenses', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users in the same agency can read; finance roles can upload/delete
DROP POLICY IF EXISTS "Agency members can read expenses files" ON storage.objects;
CREATE POLICY "Agency members can read expenses files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Finance roles can upload expenses files" ON storage.objects;
CREATE POLICY "Finance roles can upload expenses files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('owner','manager','finance')
  );

DROP POLICY IF EXISTS "Finance roles can delete expenses files" ON storage.objects;
CREATE POLICY "Finance roles can delete expenses files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('owner','manager','finance')
  );
```

After running, verify in **Storage** that the `expenses` bucket exists and is **private**.

---

## 2. Supabase Dashboard — URL Configuration (Auth connectivity)

**This step fixes "Auth Timeout" and connection failures in production.**

In **Supabase Dashboard** go to: **Authentication → URL Configuration**.

Set these **exact** values for production (npc-am.com):

| Field | Value |
|-------|--------|
| **Site URL** | `https://npc-am.com` |
| **Redirect URLs** (one per line or comma-separated, depending on UI) | See list below |

**Redirect URLs to add (include all of these):**

```
https://npc-am.com
https://npc-am.com/
https://npc-am.com/login
https://npc-am.com/dashboard
https://npc-am.com/reset-password
https://npc-am.com/** 
```

- Some Supabase UIs allow a wildcard: add `https://npc-am.com/**` if available.
- If wildcards are not supported, add at least:  
  `https://npc-am.com`, `https://npc-am.com/`, `https://npc-am.com/login`, `https://npc-am.com/dashboard`, `https://npc-am.com/reset-password`.

**Checklist:**

- [ ] **Site URL** = `https://npc-am.com`
- [ ] **Redirect URLs** include `https://npc-am.com` and `https://npc-am.com/login`
- [ ] Save changes and wait a minute for propagation
- [ ] Clear browser cache / try incognito if login still times out

Without these, Supabase Auth may reject or hang on redirects and the app will show "Auth Timeout" or a frozen loading screen. The app uses a **10-second rescue**: if the connection does not complete in 10 seconds, a **"נסה שוב להתחבר" (Retry Connection)** button appears; you can also go to the login page and sign in with email/password.

---

## 3. Netlify environment variables

In **Netlify → Site → Site configuration → Environment variables**, set these for **Production** (and optionally for other environments):

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key | `eyJhbGciOiJIUzI1NiIs...` |
| `VITE_MORNING_API_URL` | Morning sandbox/production API base URL | Your Morning API base URL |
| `VITE_APP_NAME` | App display name | `npc-am` or your brand |
| `VITE_APP_VERSION` | App version string | `1.0.0` |

**Optional (dev only):**

| Variable | Description |
|----------|-------------|
| `VITE_DEMO_BYPASS` | Set to `true` only in dev if you use demo login; leave unset or `false` in production. |

**Checklist:**

- [ ] `VITE_SUPABASE_URL` — production Supabase URL
- [ ] `VITE_SUPABASE_ANON_KEY` — production anon key
- [ ] `VITE_MORNING_API_URL` — Morning API base (sandbox or production)
- [ ] `VITE_APP_NAME` — set
- [ ] `VITE_APP_VERSION` — set
- [ ] No `VITE_DEMO_BYPASS=true` in production

Redeploy the site after changing environment variables.

**Build note:** Netlify runs `npm install` then `npm run build`. If the build fails with "tsc not found", ensure **Build command** is `npm run build` (which uses the project’s TypeScript from `node_modules`). You can set **NODE_VERSION** to `18` or `20` in Netlify → Environment variables if you need a specific Node version.

---

## 4. Post-setup

- Confirm login (email + magic link or password) works against production Supabase.
- Open Finance → upload an expense file and confirm it appears (bucket + RLS working).
- Only **Owner** users can access `/sync` (Sync Monitor); others are redirected to the dashboard.

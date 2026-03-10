# Authentication Flow — Forensic Diagnostic Report

**Objective:** Identify the "Broken Link" causing the login loop.  
**Scope:** Environment & keys, auth handshake, route guards, and codebase consistency.

---

## Phase 1: Environment & Keys Audit

### 1.1 Supabase client initialization (`src/lib/supabase.ts`)

| Item | Finding | Status |
|------|---------|--------|
| **VITE_SUPABASE_URL** | `rawUrl = (import.meta.env.VITE_SUPABASE_URL as string \| undefined) ?? ''`; normalized (trim, no trailing slash); if empty → `FALLBACK_URL` = `https://oerqkyzfsdygmmsonrgz.supabase.co` | ✅ Loaded correctly; fallback matches project |
| **VITE_SUPABASE_ANON_KEY** | `rawKey` from env; if empty → `FALLBACK_KEY` (JWT for project oerqkyzfsdygmmsonrgz). Final key trimmed. | ✅ Loaded correctly |
| **Diagnostic added** | On load (browser): logs `[Auth] Env check — URL (first 5):`, `Key (first 5):`, and whether URL contains `oerqkyzfsdygmmsonrgz`. | ✅ Implemented |
| **appUrl** | `_rawViteAppUrl = (import.meta.env.VITE_APP_URL as string \| undefined)?.trim()`; `appUrl = _rawViteAppUrl \|\| PRODUCTION_APP_URL`; `PRODUCTION_APP_URL = 'https://npc-am.com'` (no trailing slash). | ✅ No trailing slashes; no string comparison used for redirect |
| **OAuth redirect** | `getGoogleOAuthRedirectTo()` returns **only** `PRODUCTION_AUTH_CALLBACK` = `'https://npc-am.com/auth/callback'`. Not derived from `window.location.origin` or `appUrl`. | ✅ Production URL forced |

**Confirmed config (Phase 1):** Supabase URL/Key load with correct fallbacks; OAuth redirect is hardcoded to `https://npc-am.com/auth/callback`. No env or origin used for redirect.

---

## Phase 2: Authentication Handshake Audit

### 2.1 AuthContext — init flow

- **Sequence:** `initAuth()` runs in `useEffect` on mount.
- **On `/auth/callback` with `?code=`:** Waits 2.5s, then `getSessionUserFast()` (up to 8s + 6s retry). Supabase client has `detectSessionInUrl: true` and `flowType: 'pkce'`, so it exchanges `code` for session when the page loads; after 2.5s session should be in storage.
- **If `authUser` exists:** `fetchUserProfile(authUser)` is called (select from `public.users` by `authUser.id`). If that returns `null`:
  - Retry: wait 1.5s, call `ensure_user_profile`, then select again.
  - If still no profile: recheck `public.users` once.
  - **If recheck is null:** `setUser(null)`, `setSupabaseUser(null)`, `supabase.auth.signOut()`, then `window.location.href = base + '/login?unauthorized=1'`.

**Conclusion:** The only path that sends the user back to `/login` with an established auth session is: **profile fetch returns null and recheck returns null** (i.e. no row in `public.users` for this auth user, or the select is blocked).

### 2.2 onAuthStateChange

- **When `session?.user`:** `setSupabaseUser(session.user)`, then `await fetchUserProfile(session.user)`. Result of `fetchUserProfile` is **not** checked; `setUser` is only called inside `fetchUserProfile` when a row exists.
- **So:** If `SIGNED_IN` fires but `fetchUserProfile` returns `null` (no row or RLS), `user` stays `null`. The listener does **not** clear the session. The redirect to login is driven by **initAuth** (after recheck fails), not by the listener.

**Suspected point of failure (Phase 2):**  
**AuthContext.tsx lines 172–184:** When `authUser` exists but `profile` is null after retry and recheck, the code signs out and redirects to `/login?unauthorized=1`. So the "leak" is: **`public.users` select returns no row** (RLS blocking, or row never created by `ensure_user_profile`).

### 2.3 public.users fetch and JWT

- **Select:** `supabase.from('users').select(...).eq('id', authUser.id).maybeSingle()`.
- **406/401:** `maybeSingle()` returns `{ data: null, error }` on RLS/permission failure; it does not throw. So we get `data === null` and optionally `error` set. The code treats "no row" and "error" the same for the first attempt; after retry, if `recheck` is null we sign out and redirect.
- **JWT during redirect:** With PKCE, the redirect lands on `https://npc-am.com/auth/callback?code=...`. The Supabase client (same origin, same storage key `ima_os_auth`) exchanges the code and writes the session to localStorage. There is no separate server round-trip that would "lose" the JWT; the client holds it. So **session loss during redirect is not the cause** of the loop; the cause is **profile missing or unreadable** after session is established.

### 2.4 AuthCallbackPage and `#access_token`

- **PKCE:** Supabase is configured with `flowType: 'pkce'`. The callback URL receives **query** `?code=...`, not hash `#access_token=...`. So the app does **not** need to parse `#access_token` for this flow.
- **AuthCallbackPage:** Reads `searchParams` and `window.location.hash` only for **error** params (`error`, `error_description`). It does not parse tokens. Session is established by the Supabase client via `detectSessionInUrl` and code exchange.
- **Conclusion:** Callback page is correct for PKCE. No change needed for `#access_token`.

---

## Phase 3: Deep Research & Diagnostics

### 3.1 Hardcoded URLs / old Supabase IDs

| Location | Value | Verdict |
|----------|--------|--------|
| `src/lib/supabase.ts` | `FALLBACK_URL` = `https://oerqkyzfsdygmmsonrgz.supabase.co` | ✅ Matches expected project |
| `src/lib/supabase.ts` | `PRODUCTION_APP_URL` = `'https://npc-am.com'`, `PRODUCTION_AUTH_CALLBACK` = `'https://npc-am.com/auth/callback'` | ✅ Correct production |
| Scripts (e.g. `setup-invoice-vision.js`) | Reference `oerqkyzfsdygmmsonrgz` | ✅ Same project |
| **No other Supabase project IDs or conflicting auth URLs found in `src/`.** | | |

### 3.2 Middleware / ProtectedRoute

- **middleware.ts:** Not present (no file matching `**/middleware*.ts` or `**/middleware*.js`).
- **PrivateRoute (`App.tsx` 69–89):**
  - Uses `useAuth()` → `user`, `loading`, `authConnectionFailed`.
  - If `loading` → `<PageLoader />` (no redirect).
  - If `!user` and !loading → `<Navigate to="/login" replace />`.
- **AppRoutes:** For paths other than `/login` and `/auth/callback`, when `loading` is true we render `<PageLoader />`. So we **do** wait for Auth to finish before deciding to redirect.
- **Exception:** `/auth/callback` is **not** behind PrivateRoute; it is rendered immediately. So AuthProvider runs, `initAuth` runs; when it completes with no profile it performs the sign-out and full-page redirect to `/login?unauthorized=1`. So the redirect is **not** from PrivateRoute; it is from **AuthContext initAuth** (lines 179–184).

**Conclusion:** Route guards do **not** redirect before session is initialized. The redirect that causes the loop is the explicit `window.location.href = .../login?unauthorized=1` in AuthContext when profile is missing.

---

## Summary: Confirmed Config

- Supabase client: URL and anon key loaded (with fallbacks); project ref `oerqkyzfsdygmmsonrgz`; `flowType: 'pkce'`, `detectSessionInUrl: true`, `storageKey: 'ima_os_auth'`.
- OAuth redirect: Always `https://npc-am.com/auth/callback`; no dependency on `window.location` or `VITE_APP_URL`.
- appUrl: Built from env with trim; fallback `https://npc-am.com`; no trailing slash.
- No middleware; PrivateRoute only redirects when `!loading && !user`.
- AuthCallbackPage: Correct for PKCE; errors from query/hash shown; no manual token parsing.

---

## Suspected Point of Failure

**File:** `src/contexts/AuthContext.tsx`  
**Block:** Lines 163–184 (profile fetch + recheck + redirect).

**Exact logic:**  
When `authUser` exists but `fetchUserProfile(authUser)` returns `null` (and retry + recheck still yield no row), the code:

1. Sets `user` and `supabaseUser` to `null`
2. Calls `supabase.auth.signOut()`
3. Redirects to `{origin}/login?unauthorized=1`

So the **config/logic mismatch** is: the app assumes "no row in `public.users`" means "unauthorized" and signs out. That is correct only if:

- RLS allows the authenticated user to SELECT their own row (`id = auth.uid()`), **and**
- A row exists (created by `ensure_user_profile` or by invite/trigger).

If either RLS blocks the read or the row is missing (e.g. user not in `pending_invites` and not first user), we get the observed loop.

---

## The "Smoking Gun"

**Why the user is sent back to login:**

1. User completes Google OAuth and is redirected to `https://npc-am.com/auth/callback?code=...`.
2. Supabase client exchanges the code; session is stored; `getSessionUserFast()` returns `authUser`.
3. `fetchUserProfile(authUser)` runs: `supabase.from('users').select(...).eq('id', authUser.id).maybeSingle()`.
4. **Either:**
   - **RLS:** Policy "Users can read own profile" is missing or wrong on `public.users`, so the select returns no row (or error), **or**
   - **No row:** `ensure_user_profile` does not create a row (e.g. email not in `pending_invites` and not the first user), so there is nothing to read.
5. Retry (ensure_user_profile + re-fetch) and recheck still yield no row.
6. AuthContext then: sign out + redirect to `/login?unauthorized=1`.
7. On next load there is no session, so `user` stays null and the app shows login. **Loop.**

So the single root cause is: **the `public.users` select for the authenticated user returns no row**, either because of RLS or because the row was never created.

---

## Step-by-Step Fix Instructions

### Step 1: Ensure RLS allows reading own user row (Supabase)

1. Open **Supabase Dashboard** → **SQL Editor**.
2. Run the contents of:
   - `supabase/migrations/20260309100000_users_and_agencies_rls_login_fix.sql`
   - (Or at minimum: enable RLS on `public.users` and create policy `FOR SELECT USING (id = auth.uid())`.)

This guarantees that an authenticated user can read their own row in `public.users`.

### Step 2: Ensure the user has a row in `public.users`

- **First user:** `ensure_user_profile` (or bootstrap) should create an owner row. Ensure the first login is either from an invite or that your bootstrap creates the row.
- **Invited users:** Add the user’s email to `pending_invites` (e.g. via Settings → ניהול משתמשים) **before** they log in. Then `ensure_user_profile` will create the row from the invite.

Verify in **Table Editor** → `public.users` that a row exists for the auth user’s `id` (from **Authentication** → **Users**).

### Step 3: Verify env and redirect (Vercel / local)

- In Vercel (and local if used): set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for project `oerqkyzfsdygmmsonrgz`.
- In Supabase → **Authentication** → **URL Configuration**, add **Redirect URLs:**  
  `https://npc-am.com/auth/callback`  
  (and `https://npc-am.com` if required).

Redeploy after env changes.

### Step 4: Use console diagnostics

- Open **https://npc-am.com**, then DevTools → Console.
- On load you should see:  
  `[Auth] Env check — URL (first 5): https | Key (first 5): eyJhb | Project ref in URL: true`  
  (or equivalent for your key prefix).
- When you click "Sign in with Google":  
  `Auth Redirect Target: https://npc-am.com/auth/callback`.
- If you land on `/auth/callback` and then are sent to login, the failure is between session establishment and profile fetch (Steps 1–2 above).

### Step 5: Optional — softer behavior when profile is missing

If you want to avoid an immediate sign-out when the profile is missing (e.g. to show a "pending approval" UI instead of a loop), you can change AuthContext so that when `authUser` exists but `profile` is null after retries:

- Do **not** call `supabase.auth.signOut()`.
- Set `user` to `null` but keep `supabaseUser` (or a "pending" state) and redirect to a dedicated "pending approval" or "contact admin" page instead of `/login?unauthorized=1`.

That is a product decision; the **root** fix remains: RLS + row existence so that `fetchUserProfile` returns a row.

---

## Verification Checklist

- [ ] RLS on `public.users`: policy allows `SELECT WHERE id = auth.uid()`.
- [ ] RLS on `public.agencies`: policy allows select for the user’s `agency_id` (see same migration file).
- [ ] Row in `public.users` for the test user’s `id`.
- [ ] Redirect URL `https://npc-am.com/auth/callback` in Supabase.
- [ ] Vercel env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` set; redeploy done.
- [ ] Console shows correct URL/key prefix and "Project ref in URL: true" on npc-am.com.

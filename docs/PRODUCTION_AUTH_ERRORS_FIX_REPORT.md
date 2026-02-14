# Production Auth Errors — Fix Report

**Date:** 2026-02-10  
**Environment:** Netlify (production: https://npc-am.com)  
**Goal:** Fix login/auth timeouts and ensure the same errors do not recur.

---

## 1. Problems Observed

| Symptom | Console / UI |
|--------|---------------|
| Auth initialization failed | `Auth initialization failed` in console |
| Profile fetch timeout | `Auth: Failed to fetch profile Error: Fetch user profile timed out after 18000ms` |
| Sign-in timeout | `Login error: Error: Sign in timed out after 15000ms` |
| Unclear user action | UI: "ההתחברות ארכה יותר מדי... Supabase חייבים Redirect URLs לכלול את כתובת האתר" — user did not know which exact URLs to add |

**Root causes:**

1. **Redirect URLs not configured** — Supabase Auth requires the production site URL (and `/login`) in **Auth → URL Configuration → Redirect URLs**. If missing, token exchange or session persistence can hang or fail, leading to timeouts.
2. **Timeouts too short for production** — On first load or slow networks, Supabase (getSession, profile fetch, signIn) can take longer than the previous 8–15s limits.
3. **Generic error message** — The login page did not show the **exact** URLs to add, so admins could not fix the issue without checking docs.

---

## 2. Fixes Applied (Code)

### 2.1 Login page — actionable timeout error

**File:** `src/pages/LoginPage.tsx`

- **Timeout error message:** When sign-in or profile times out, the message now includes the **exact** Redirect URLs to add, derived from `window.location.origin`:
  - Example: "הוסף ב־Supabase Auth → URL Configuration → Redirect URLs: https://npc-am.com ו־https://npc-am.com/login"
- **Sign-in timeout:** Increased from 15s to **20s** when host is not `localhost` (production).
- **Post-login profile step:** `ensureProfileBeforeRedirect` uses **12s** timeouts (session + profile + RPC) on production instead of 8s, and the "No session after login" error now tells the user to add the site to Redirect URLs.

### 2.2 Auth context — production timeouts and logging

**File:** `src/contexts/AuthContext.tsx`

- **Watchdog:** Initialization safety watchdog increased from 8s to **14s** on production so the app does not give up before Supabase responds on slow networks.
- **getSession:** Timeout increased from 10s to **12s** on production.
- **fetchUserProfile:** First fetch and self-heal (ensure_user_profile + re-fetch) use **18s** on production (12s on dev).
- **Console:** On init failure in production, we now log a warning with the exact URLs to add: `window.location.origin` and `window.location.origin + '/login'`.

### 2.3 Summary of timeout values

| Operation | Development | Production |
|-----------|-------------|------------|
| Auth init watchdog | 8s | 14s |
| getSession (init) | 10s | 12s |
| Fetch user profile | 12s | 18s |
| Sign-in (LoginPage) | 15s | 20s |
| ensureProfileBeforeRedirect (session + profile + RPC) | 8s each | 12s each |

---

## 3. How to Prevent These Errors Again

### 3.1 Before going live on a new Netlify URL

1. **Supabase Auth → URL Configuration**
   - Add **Redirect URLs:**
     - `https://<your-netlify-site>.netlify.app`
     - `https://<your-netlify-site>.netlify.app/login`
   - Save.

2. **Netlify env**
   - `VITE_SUPABASE_URL` = Supabase project URL  
   - `VITE_SUPABASE_ANON_KEY` = Supabase anon key  
   - Redeploy after changing env.

3. **Database (once per project)**
   - Run `supabase/ensure_user_profile.sql` in Supabase SQL Editor so login self-heal and profile creation work.

### 3.2 If users still see "ההתחברות ארכה יותר מדי"

1. Check the **exact** URLs in the new error message and add them to Supabase Redirect URLs.
2. Ask the user to click **"נקה התחברות (Auth) ונסה שוב"** and try again.
3. Check Supabase project status and network (no firewall blocking Supabase).

### 3.3 Checklist for new production domains

When you add a **new** production domain (e.g. a second Netlify site or a custom domain):

- [ ] Add `https://<new-domain>` and `https://<new-domain>/login` to Supabase Auth → Redirect URLs.
- [ ] Ensure Netlify (or your host) has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set for that deploy.
- [ ] Redeploy so the frontend uses the correct env.

---

## 4. Files Changed

| File | Changes |
|------|--------|
| `src/pages/LoginPage.tsx` | Timeout error message with exact Redirect URLs; 20s sign-in timeout in production; 12s timeouts in ensureProfileBeforeRedirect in production; clearer "No session" error. |
| `src/contexts/AuthContext.tsx` | Production-only: 14s init watchdog, 12s getSession, 18s profile fetch; console warning with Redirect URLs on init failure. |

---

## 5. Verification

After deploying:

1. Open the production login page (e.g. `https://npc-am.com/login`).
2. Enter Company ID, email, password and sign in.
3. You should either land on the dashboard or see a clear error (e.g. invalid credentials).
4. If you see the new timeout message, it must include the two exact URLs to add; add them in Supabase and retry with "נקה התחברות (Auth) ונסה שוב".

This report should be kept with the rest of the delivery/runbook docs so future deployments follow the same steps and avoid the same auth/redirect issues.

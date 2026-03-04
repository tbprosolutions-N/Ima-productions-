# Task 1: Environment & Variable Audit — COMPLETE

**Date:** 2026-02-16  
**Status:** ✅ Complete

---

## 1. Frontend Variables (VITE_ prefix)

| Variable | Used In | Status |
|----------|---------|--------|
| `VITE_SUPABASE_URL` | supabase.ts, EnvCheck, ErrorBoundary, SystemHealthPage | ✅ Correct |
| `VITE_SUPABASE_ANON_KEY` | supabase.ts, EnvCheck, ErrorBoundary, SystemHealthPage | ✅ Correct |
| `VITE_APP_URL` | supabase.ts (auth redirect), EnvCheck | ✅ Correct |
| `VITE_APP_NAME` | EnvCheck | ✅ Optional |
| `VITE_EMAIL_FROM` | agreementService.ts | ✅ Optional (fallback: npc-am.com) |
| `VITE_DEMO_BYPASS` | settingsStore, E2E fixtures | ✅ Dev/test only |
| `VITE_MORNING_SANDBOX_*` | settingsStore | ✅ Optional |

**Verdict:** All frontend variables correctly use `VITE_` prefix. No leaks.

---

## 2. Backend / Vercel API Routes

| Variable | Used In | Vercel Dashboard Name |
|----------|---------|------------------------|
| `SUPABASE_URL` | api/morning, api/calendar-invite | ✅ Same |
| `SUPABASE_SERVICE_ROLE_KEY` | api/morning | ✅ Same |
| `VITE_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY` | api/calendar-invite | ✅ Add `SUPABASE_ANON_KEY` if 502 |
| `MORNING_BASE_URL` | api/morning | Optional |

**Verdict:** Backend variable names match expected Vercel Dashboard names.

---

## 3. Supabase Edge Functions (Secrets)

| Secret | Used In | Status |
|--------|---------|--------|
| `SUPABASE_URL` | Injected by Supabase | ✅ Auto |
| `SUPABASE_SERVICE_ROLE_KEY` | All Edge Functions | ✅ Auto |
| `RESEND_API_KEY` | send-email, send-immediate-alert, invite-user | Required for email |
| `RESEND_FROM` | send-email, send-immediate-alert | Default: npc-am.com |
| `SUPABASE_ANON_KEY` | invite-user | For user client |
| `GOOGLE_*` | calendar-invite, google-oauth-callback | For Calendar |

**Verdict:** Naming matches Supabase secrets convention.

---

## 4. Hardcoded IDs / URLs Check

| Location | Value | Verdict |
|----------|-------|---------|
| `.env` | `oerqkyzfsdygmmsonrgz.supabase.co` | ✅ Current production (client's Supabase) |
| `supabase/.temp/project-ref` | `oerqkyzfsdygmmsonrgz` | ✅ From `supabase link` |
| `scripts/start-e2e-server.mjs` | `https://demo.supabase.co` | ✅ Fallback only when VITE_SUPABASE_URL unset (E2E) |
| `src/lib/supabase.ts` | `VITE_APP_URL \|\| 'https://npc-am.com'` | ✅ Fallback for auth redirect |
| `agreementService.ts` | `noreply@npc-am.com` | ✅ Production domain |

**No OLD Netlify or Supabase project IDs found in source code.** All references use env vars or current production values.

---

## 5. Netlify Deprecated (No Impact on Vercel)

- `netlify/functions/` — exists but not used (Vercel uses `api/`)
- `scripts/deploy-netlify.js` — deprecated
- `netlify.toml` — deprecated
- Frontend uses `window.location.origin` + `/api/morning` → Vercel routes

**Verdict:** Netlify code is dormant; production uses Vercel.

---

## 6. Action Items for Vercel Dashboard

1. **Required (Production):**
   - `VITE_SUPABASE_URL` = `https://oerqkyzfsdygmmsonrgz.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (JWT from Supabase Dashboard)
   - `SUPABASE_URL` = same as above
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role JWT (Dashboard → Settings → API)
   - `SUPABASE_ANON_KEY` = same as VITE_SUPABASE_ANON_KEY (for calendar-invite proxy)
   - `VITE_APP_URL` = `https://npc-am.com`

2. **Verify:** `SUPABASE_SERVICE_ROLE_KEY` must be the **JWT** (starts with `eyJ`), not `sb_secret_*`. If using `sb_secret_*`, replace with the JWT from Supabase Dashboard → Project Settings → API → service_role.

---

## 7. .env.example Alignment

`.env.example` correctly documents:
- VITE_* for frontend
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY for API routes
- RESEND_* for Edge Functions
- No hardcoded production values

---

**Task 1 Complete.** Ready for Task 2 (Service Integration Test).

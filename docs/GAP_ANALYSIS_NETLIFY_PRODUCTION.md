# Gap Analysis: Netlify Production vs System Characterization

**Reference:** `docs/CHARACTERIZATION_AND_STATUS.md`  
**Production URL:** https://npc-am.com  
**Date:** 2025-01-31

---

## 1. Features marked "✅ Real (production)" — missing env or plumbing for Netlify

| Feature (from characterization) | Netlify / frontend | Supabase / Edge Functions | Gap |
|----------------------------------|--------------------|---------------------------|-----|
| **Auth: email + password** | ✅ `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` documented and used in `src/lib/supabase.ts` | — | **None** if both are set in Netlify env. |
| **Auth: magic link / invite email** | ✅ UI sends `redirectTo: window.location.origin + '/login'` (correct for Netlify) | **invite-user** needs: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; optional `SITE_URL`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (or Gmail via integration_tokens) | **Plumbing:** Invite is **fully connected** (Settings → ניהול משתמשים → invite calls `supabase.functions.invoke('invite-user', …)`). **Gap:** Deploy `invite-user` and set **Supabase Edge Function secrets** (not Netlify). Netlify has no extra env for this. |
| **Auth: ensure_user_profile RPC** | ✅ Login and AuthContext call `ensure_user_profile` | **DB:** RPC must exist (e.g. run `supabase/ensure_user_profile.sql` once) | **Gap:** One-time SQL in Supabase; no env. |
| **Redirect URLs (Supabase Auth)** | — | **Supabase Dashboard → Auth → URL Configuration:** must include `https://npc-am.com` and `https://npc-am.com/login` | **Gap:** Configuration only; documented in runbooks. |
| **Netlify deploy** | ✅ `netlify.toml`: build `npm run build`, publish `dist` | — | **Gap:** Only **Netlify env** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required. Optional: `VITE_MORNING_API_URL`, `VITE_DEMO_BYPASS=false`. |
| **Settings: integrations (Google)** | ✅ OAuth start returns to `window.location.origin`; no frontend env for Google | **google-oauth-start**, **google-oauth-callback**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` (Supabase secrets) | **No Netlify env.** All Google env are in Supabase Edge Function secrets. |
| **Edge Function: invite-user** | ✅ Wired: Settings user invite calls `invite-user` with `redirectTo` | Must be **deployed** + secrets set (see above) | **Gap:** Deployment + secrets; not “missing” in code. |
| **Edge Function: extract-invoice-vision** | ✅ Wired: `FinancePage` → `extractInvoiceData()` → `invoiceExtraction.ts` → `supabase.functions.invoke('extract-invoice-vision', …)` | Must be **deployed** + `ANTHROPIC_API_KEY` in Supabase secrets; optional (falls back to OCR) | **Gap:** Deploy + secret for Vision; UI is already connected. |
| **Supabase: RLS, Storage** | — | Backend config | No Netlify-specific gap. |
| **Sync monitor / sync jobs** | ✅ UI reads `sync_jobs` and can insert jobs; no frontend env for sync-runner | **sync-runner** triggered by cron or external POST; needs `SYNC_RUNNER_SECRET`, `GOOGLE_OAUTH_*`, etc. in Supabase | **No Netlify env.** Runner is server-side. |

**Summary (Netlify URL):**  
- **Netlify env required for “real” production:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.  
- **No other Netlify env** are required for the features listed as “Real (production).”  
- **Missing “plumbing” for production** is mostly **Supabase-side:** deploy Edge Functions, set their secrets, run `ensure_user_profile.sql`, and add Redirect URLs. The **UI is already connected** to `invite-user` and `extract-invoice-vision`.

---

## 2. "Demo only" features planned to move to "Production" but not yet

From the characterization table:

| Feature | Status | Notes |
|---------|--------|--------|
| **Demo login (no Supabase)** | Intentionally demo-only | DEV only; `VITE_DEMO_BYPASS` + “Demo login” button; no plan to make this “production.” |
| **QA / System Health pages** | Intentionally DEV-only | **Already “moved” in the sense of production behavior:** In production (`!import.meta.env.DEV`), `/qa` and `/health` **redirect to `/dashboard`** (`App.tsx`). So they are not exposed on the Netlify URL. No further work needed unless you want these pages available in production (e.g. behind a feature flag or role). |
| **Sync monitor** | ✅ Same UI; production runs real jobs | Already “production”: reads real `sync_jobs` when not demo. No gap. |

**Conclusion:** There are **no “demo only” features** that were explicitly planned to become production and are still missing. QA/Health are intentionally hidden on production.

---

## 3. Edge Functions: deployment and UI connection

### invite-user

| Aspect | Status |
|--------|--------|
| **Deployed** | Must be deployed manually: `npx supabase functions deploy invite-user` (or via dashboard). Not auto-deployed by Netlify. |
| **Connected to UI** | ✅ **Yes.** Settings → Users → “שלח הזמנה” calls `supabase.functions.invoke('invite-user', { body: { agencyId, email, full_name, role, redirectTo: origin + '/login' } })`. |
| **Secrets** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (required). Optional: `SITE_URL`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (or Gmail via agency integration_tokens). |
| **Gap** | **Deployment + secrets** in Supabase. No code or Netlify env missing. |

### extract-invoice-vision

| Aspect | Status |
|--------|--------|
| **Deployed** | Must be deployed: `npx supabase functions deploy extract-invoice-vision`. Optional feature. |
| **Connected to UI** | ✅ **Yes.** Finance → upload → `extractInvoiceData(file)` (`src/services/invoiceExtraction.ts`) calls `supabase.functions.invoke('extract-invoice-vision', { body: { imageBase64, mimeType } })` for images; on failure or non-image, falls back to OCR. |
| **Secrets** | `ANTHROPIC_API_KEY` (required for Vision; if unset, function returns 503 and UI uses OCR). |
| **Gap** | **Deploy + set ANTHROPIC_API_KEY** in Supabase. UI is fully wired. |

---

## 4. Top 5 technical tasks to call the project "Feature Complete" for a real agency

1. **Production auth and redirect**
   - Set **Netlify env:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (and ensure build uses them).
   - In **Supabase Auth → URL Configuration**, add:
     - `https://npc-am.com`
     - `https://npc-am.com/login`
   - Run **`supabase/ensure_user_profile.sql`** once in Supabase SQL Editor so login self-heal and profile fetch work.

2. **Invite and magic link (invite-user)**
   - **Deploy** Edge Function: `npx supabase functions deploy invite-user`.
   - Set **secrets** for `invite-user`: `SUPABASE_SERVICE_ROLE_KEY` (required); optionally `SITE_URL=https://npc-am.com`; for Gmail delivery optionally `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (and ensure Google integration has Gmail scope when used).
   - **Verify:** Settings → User management → invite a test user → confirm magic link opens Netlify URL and login works.

3. **Google integrations (OAuth + calendar/sheets)**
   - Deploy **google-oauth-start**, **google-oauth-callback** (and **google-calendar-watch**, **google-calendar-webhook** if using calendar sync).
   - Set **Supabase secrets:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` (callback URL of the project’s google-oauth-callback). For calendar webhook: `GOOGLE_CALENDAR_WEBHOOK_URL`.
   - **Verify:** Settings → Integrations → connect Google Drive/Calendar; create event and confirm calendar/sheets sync if used.

4. **Background sync (sync-runner)**
   - Deploy **sync-runner** and configure trigger (e.g. Supabase cron or external scheduler) with `SYNC_RUNNER_SECRET`.
   - Set **sync-runner secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_RUNNER_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (and `GOOGLE_CALENDAR_WEBHOOK_URL` if using calendar webhook).
   - **Verify:** Create/edit event → Sync Monitor shows job; after runner runs, calendar/sheets reflect changes.

5. **Invoice Vision (optional but completes “smart” finance)**
   - Deploy **extract-invoice-vision** and set **Supabase secret:** `ANTHROPIC_API_KEY`.
   - **Verify:** Finance → upload an invoice image → review screen shows Vision-extracted supplier/amount/date (or graceful fallback to OCR if key missing).

---

## 5. Quick checklist (Netlify URL)

| # | Task | Owner |
|---|------|--------|
| 1 | Netlify env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Deploy |
| 2 | Supabase Redirect URLs include production + `/login` | Config |
| 3 | Run `ensure_user_profile.sql` once in Supabase | DB |
| 4 | Deploy `invite-user` + set `SUPABASE_SERVICE_ROLE_KEY` (and optional SITE_URL, Google) | Edge |
| 5 | Deploy Google OAuth pair + set `GOOGLE_OAUTH_*`, `GOOGLE_OAUTH_REDIRECT_URI` | Edge |
| 6 | Deploy `sync-runner` + cron/trigger + `SYNC_RUNNER_SECRET`, Google secrets | Edge |
| 7 | (Optional) Deploy `extract-invoice-vision` + `ANTHROPIC_API_KEY` | Edge |

---

*This gap analysis is based on `docs/CHARACTERIZATION_AND_STATUS.md` and the current codebase (Netlify build, Supabase client, Edge Functions, and UI wiring).*

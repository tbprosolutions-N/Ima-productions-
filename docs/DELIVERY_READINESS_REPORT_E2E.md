# Pre-Delivery E2E Production Readiness Audit

**Date:** 2026-02-11  
**Context:** Handoff to client TOMORROW. Production URL: **https://npc-am.com**. Client contact: **npcollectivebooking@gmail.com**.

---

## PHASE 1: Environment & Real Data Enforcement

### 1.1 VITE_DEMO_BYPASS & Demo Mode

| Check | Result | Details |
|-------|--------|---------|
| **Demo only in DEV** | PASS | `isDemoMode()` returns `true` only when `import.meta.env.DEV` is true **and** (localStorage `demo_authenticated` or `VITE_DEMO_BYPASS === 'true'`). In production build, `import.meta.env.DEV` is **false**, so demo is never active. |
| **AuthContext** | PASS | Demo auth is used only when `import.meta.env.DEV && demoAuth === 'true'`. Production always uses Supabase session + profile. |
| **LoginPage** | PASS | "Demo login" and demo invite link are shown only when `import.meta.env.DEV`. |
| **Recommendation** | — | Ensure production build is used (e.g. `npm run build`); do not set `NODE_ENV=development` or Vite `mode: 'development'` in production deploy. |

**Verdict:** In production at npc-am.com, the app **always** uses the real Supabase connection. No code change required; ensure Netlify build does not inject `VITE_DEMO_BYPASS=true`.

---

### 1.2 Morning (Green Invoice) — Sandbox for Safe Testing

| Check | Result | Details |
|-------|--------|---------|
| **Frontend morningService.ts** | N/A | Frontend does not hold credentials; it only calls `/.netlify/functions/morning-api` with `agencyId` and `eventId`. No sandbox/production switch in frontend. |
| **Netlify Function morning-api.ts** | CONFIG | Uses `process.env.MORNING_BASE_URL` (default `https://api.greeninvoice.co.il/api/v1`). It does **not** read `MORNING_ENV` to switch URLs. Sandbox is typically determined by **which API key/secret** you use (Green Invoice sandbox vs production account). |
| **.env.example** | OK | Documents `MORNING_ENV=sandbox` and `MORNING_BASE_URL=...`. |

**Verdict:** For **safe testing**, set in **Netlify → Environment variables**:

- `MORNING_API_KEY` and `MORNING_API_SECRET` = **sandbox** credentials from Green Invoice (sandbox account).
- `MORNING_ENV=sandbox` (optional; used for UI badge only via `VITE_MORNING_ENV` in build).
- If Green Invoice provides a **different sandbox API base URL**, set `MORNING_BASE_URL` to that URL in Netlify; otherwise keep default.

No code change required; configuration only.

---

## PHASE 2: Architecture & Feature Validation (Dry Run)

### 2.1 User Management — Real Users & Roles

| Item | Status | Implementation |
|------|--------|----------------|
| **Create real users (Supabase Auth)** | READY | **invite-user** Edge Function: creates user via `admin.auth.admin.createUser` or invite; generates magic link; sends via Gmail API (if Google connected) or Supabase `inviteUserByEmail`. |
| **Roles enforced in UI** | READY | **Sidebar:** Finance nav and Sync nav filtered by `canAccessRoute(item.roles)` using `user.role` and `user.permissions?.finance`. **App.tsx:** `/finance` route redirects non-finance/manager/owner to dashboard. **EventsPage:** Create/edit gated by `user.permissions?.events_create` and role. |
| **RLS** | ASSUMED | Docs and migrations define RLS on `events`, `clients`, `artists`, `finance_expenses`, etc. (agency_id + role). Not re-verified in this audit; ensure migrations have been run. |

**Verdict:** User management and role-based UI are implemented. **Pre-delivery:** Deploy `invite-user`, set `SUPABASE_SERVICE_ROLE_KEY` and optional `SITE_URL=https://npc-am.com`; add `https://npc-am.com` and `https://npc-am.com/login` to Supabase Auth Redirect URLs.

---

### 2.2 Google Integrations

| Feature | Status | Implementation |
|---------|--------|----------------|
| **Google Calendar — OAuth/API** | PARTIAL / STUB in UI; BACKEND READY | **Backend:** `google-oauth-start`, `google-oauth-callback` store tokens; `sync-runner` handles `calendar_upsert` (event → Google Calendar, optional invites). **Frontend Calendar page:** "הוסף ל-Google Calendar" uses **buildGoogleCalendarUrl()** → opens **calendar.google.com** in browser (user adds event manually). No frontend API call to create event. **Events save:** Inserts `sync_jobs` with `provider: 'google', kind: 'calendar_upsert'`; sync-runner (cron or manual trigger) performs the actual API create/update. So: **Calendar sync is backend-driven**; UI only opens a manual-add link. |
| **Google Drive — Automated backup** | NOT IMPLEMENTED | **OAuth:** Drive scope requested; connect/disconnect toggles `drive_connected` in config. **No** Edge Function or sync job uploads files to Drive. Docs (INTEGRATION_AUDIT): "Upload / sync | ❌ Not implemented". Settings copy says "סנכרון מסמכים לתיקיית Drive" but no Drive API usage. |
| **Email (npcollectivebooking@gmail.com)** | CONFIG-DRIVEN | Invite/magic-link emails are sent **from the Google account that completed OAuth** for the agency (tokens in `integration_tokens`). There is **no** hardcoded sender; to use npcollectivebooking@gmail.com, that account must be connected in Settings → Integrations (Google). |

**Verdict:**  
- **Calendar:** Functional via sync-runner + sync_jobs; frontend "Add to Google Calendar" is manual link only.  
- **Drive:** Stub only; list under PARTIAL.  
- **Email:** Works when client’s Google (e.g. npcollectivebooking@gmail.com) is connected; no code change.

---

### 2.3 File Persistence & OCR

| Item | Status | Implementation |
|------|--------|----------------|
| **Expense/document upload → Supabase Storage** | READY | **FinancePage** and **FinanceContext:** `supabase.storage.from('expenses').upload(storage_path, file, { upsert: true })` then insert into `finance_expenses`. Path: `{agencyId}/{reviewId}/{filename}`. RLS and bucket `expenses` defined in migrations. |
| **OCR / extraction** | READY, NO TESSERACT | **No Tesseract.js** in codebase. **ocrService.ts:** Uses **pdfjs-dist** for PDF text layer + regex parsing (amount, date, supplier). **invoiceExtraction.ts:** For images, calls Edge Function **extract-invoice-vision** (Claude Vision); on failure or non-image, falls back to **processFile** (PDF/text/filename). **Never throws:** on any failure returns `defaultExtractedExpense(file.name)`. No crash risk from OCR. |

**Verdict:** File persistence and extraction are implemented and safe. Ensure Supabase Storage bucket `expenses` exists and finance migrations (RLS + storage policies) have been run.

---

### 2.4 Morning (Green Invoice) API

| Item | Status | Implementation |
|------|--------|----------------|
| **Generate documents (sandbox)** | READY (CONFIG) | **Netlify Function** `morning-api`: getToken → load event/client/artist from Supabase → POST to Green Invoice `/documents` → update event (`morning_sync_status`, `morning_document_id`, etc.). Sandbox = use sandbox credentials (and sandbox base URL if different) in Netlify env. |
| **Check document status** | READY | Action `getDocumentStatus` in same function; fetches document from Green Invoice, updates event `morning_doc_status` / `status: 'paid'` as needed. |

**Verdict:** Morning integration is implemented. For delivery, set Netlify env (sandbox key/secret, optional `MORNING_BASE_URL`) and test one "סנכרן Morning" flow.

---

### 2.5 Notifications

| Item | Status | Implementation |
|------|--------|----------------|
| **Real alerts from DB** | NOT IMPLEMENTED | **SettingsPage:** "Notifications (local-only for demo stability)". State is `notifEmail`, `notifEvents`, `notifFinance` in component state; key `ima_notif_${agencyId}` suggests localStorage, not DB. No `notifications` table or real-time subscriptions for in-app alerts. |

**Verdict:** Notifications are **UI-only / local**; no backend notification system. List under PARTIAL if client expects real alerts.

---

### 2.6 Core CRUD — Data Source (Supabase vs Demo)

| Page | Data source in production | Demo fallback |
|------|---------------------------|---------------|
| **Dashboard** | Supabase `events` + `clients` when `!isDemoMode()` | `isDemoMode()` → demoGetEvents/Clients (localStorage). **Production:** always Supabase. |
| **Events** | Supabase `events` (select/insert/update/delete) when `!isDemoMode()` | Same; production = Supabase only. |
| **Artists** | Supabase `artists` when `!isDemoMode()` | Same. |
| **Clients** | Supabase `clients` when `!isDemoMode()` | Same. |
| **Finance** | Supabase `finance_expenses` + `supabase.storage` when `!isDemoMode()` | Expenses list and upload skip when isDemoMode(); production = Supabase + Storage. |
| **Calendar** | Supabase `events` when `!isDemoMode()` | Same. |
| **Documents** | Supabase `documents` when `!isDemoMode()` | Same. |
| **Settings** | Supabase `integrations`, `agencies`, invite via `invite-user` | Demo uses localStorage for integrations. |

**Verdict:** In production (`import.meta.env.DEV === false`), **isDemoMode() is always false**. All CRUD and storage use **Supabase only**; no demo fallback in production.

---

## PHASE 3: Delivery Readiness Report

### PASSED & READY

1. **Environment / demo** — Production build uses real Supabase only; demo is DEV-only.
2. **Auth** — Email/password and magic link (invite-user); redirect uses `window.location.origin` (correct for npc-am.com).
3. **User management** — invite-user creates users and sends magic link (Gmail or Supabase mailer); roles enforced in UI (Sidebar, /finance, Events create).
4. **Core CRUD** — Dashboard, Events, Artists, Clients, Finance, Calendar, Documents read/write from Supabase in production.
5. **Finance — file persistence** — Upload to `supabase.storage` bucket `expenses` and insert into `finance_expenses`; RLS and storage policies in migrations.
6. **Finance — OCR/extraction** — Vision (Edge Function) + PDF/text/filename fallback; never throws; no Tesseract.
7. **Morning API** — Netlify Function create document + get status; sandbox = env (credentials + optional base URL).
8. **Google Calendar (backend)** — OAuth + sync-runner `calendar_upsert`; events pushed to Google Calendar when sync runs.
9. **Gmail for invites** — invite-user sends via Gmail API when Google is connected (e.g. npcollectivebooking@gmail.com).

---

### PARTIAL / STUBS

1. **Google Drive — automated backup** — OAuth and “connected” state only; **no** upload or sync to Drive. Settings text suggests future feature. Document as “planned” or “connect only” for client.
2. **Google Calendar — frontend** — “הוסף ל-Google Calendar” opens a **link** to add event manually; real sync is via sync-runner (cron/manual). Acceptable if client understands sync is background.
3. **Notifications** — Local/UI only; no DB-driven alerts. If client expects real notifications, list as post-launch.
4. **Morning sandbox** — Enforced only by **config** (Netlify env: sandbox credentials and optional sandbox base URL). No code change; verify env before demo.

---

### BROKEN / SHOWSTOPPERS

- **None** identified in code. Delivery risk is **configuration** only:
  - Missing Supabase Redirect URLs for npc-am.com → login/auth can fail.
  - Missing invite-user deploy or secrets → invite/magic link fails.
  - Missing Netlify env (Supabase, Morning) → build or runtime errors.
  - Storage/RLS migrations not run → finance upload or list can fail.

---

## Immediate Action Plan (Before Tomorrow)

### Must-do (critical)

1. **Supabase Auth**  
   - Add **Redirect URLs:** `https://npc-am.com`, `https://npc-am.com/login`.  
   - Confirm **Site URL** (e.g. `https://npc-am.com`).

2. **Netlify env (production)**  
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (required for login).  
   - `MORNING_API_KEY`, `MORNING_API_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (for Morning + Netlify Function).  
   - For **sandbox only:** use Green Invoice **sandbox** key/secret; set `MORNING_ENV=sandbox`; if they provide a sandbox base URL, set `MORNING_BASE_URL`.

3. **Supabase Edge Functions**  
   - Deploy **invite-user** and set secrets: `SUPABASE_SERVICE_ROLE_KEY`, optional `SITE_URL=https://npc-am.com`, optional `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` (or rely on integration_tokens after one OAuth with npcollectivebooking@gmail.com).

4. **Database / Storage**  
   - Run finance/storage migrations so `finance_expenses` and bucket `expenses` with RLS exist (e.g. `20260205000000_finance_expenses_ensure_schema_rls.sql` or `MANUAL_RUN_FINANCE_AND_STORAGE.sql`).

5. **Smoke test on npc-am.com**  
   - Login (email/password).  
   - Create event → save.  
   - Finance: upload one expense → confirm in list and (if possible) Storage.  
   - Settings: send one invite (to a test email) → open magic link → confirm login.  
   - Optional: one “סנכרן Morning” (with sandbox credentials).

### Should-do (recommended)

6. **Sync runner** — If client needs Calendar sync: ensure sync-runner is deployed and triggered (cron or manual POST) so `calendar_upsert` jobs run.
7. **Route guard for /sync** — Sidebar already hides Sync for non-owners; optionally add route-level redirect in App.tsx for `/sync` so only owners can open it (consistency).
8. **Client communication** — Clarify: Google Drive = “connect only, no auto backup yet”; notifications = “local preferences only”; Calendar = “sync via background jobs + manual add link”.

---

## Summary Table

| Area | Status | Blocker? |
|------|--------|----------|
| Demo bypass / real data | OK in production | No |
| Morning sandbox | Config only | No |
| User management & roles | Ready | No |
| Google Calendar (backend) | Ready | No |
| Google Drive backup | Stub | No (document) |
| Email (invites) | Config (connect Google) | No |
| File persistence (Storage) | Ready | No (migrations) |
| OCR / extraction | Ready, no crash | No |
| Morning documents | Ready | No (env) |
| Notifications | Local only | No (document) |
| Core CRUD | Supabase-only in prod | No |

**Conclusion:** The system is **suitable for delivery** provided the **Immediate Action Plan** (Supabase Redirect URLs, Netlify env, invite-user deploy + secrets, finance/storage migrations, smoke test) is completed before handoff. No showstopper bugs found; gaps are documented (Drive, notifications) and config-driven.

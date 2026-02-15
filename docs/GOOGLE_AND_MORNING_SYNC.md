# Full Sync: Google & Morning APIs

This doc describes how Google and Morning sync work and what to configure so both run correctly.

---

## Overview

| Integration | Purpose | Trigger | Backend |
|-------------|---------|---------|---------|
| **Morning (Green Invoice)** | Create/check documents for events; sync expenses | UI (Events/Finance) + optional `sync_jobs` | Netlify Function `morning-api` |
| **Google (Calendar, Drive)** | Calendar events, Drive/Sheets | UI (Settings) + `sync_jobs` + cron | Supabase Edge: `sync-runner`, `google-calendar-webhook`, `cron-tick` |

---

## 1. Morning API — Full sync

**Already used from UI:** Events page “סנכרן Morning” and Finance expenses sync call the Netlify Function directly.

**Checklist:**

1. **Netlify env** (Site → Environment variables):
   - `MORNING_API_KEY`, `MORNING_API_SECRET` (Green Invoice)
   - `MORNING_BASE_URL` (optional)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

2. **Settings → Integrations:** Connect Morning (API Key + Company ID). That stores credentials for the Netlify function and/or `integration_secrets` if used by sync-runner.

3. **Events:** Click “סנכרן Morning” on an event → `POST /.netlify/functions/morning-api` with `action: 'createDocument'` or `'getDocumentStatus'`.

4. **Finance:** “סנכרן ל־Morning” queues a `sync_jobs` row with `provider: 'morning'`, `kind: 'morning_sync_expenses'`. For that to run, **sync-runner** must be invoked (see below).

See **docs/MORNING_NETLIFY_SETUP.md** for full Morning setup.

---

## 2. Google API — Full sync

**OAuth:** User connects in Settings → Integrations (Google Drive / Google Calendar). That calls Supabase Function `google-oauth-start` and stores tokens in `integration_tokens`.

**Sync jobs:** The app queues rows in `sync_jobs` with `provider: 'google'`, `kind: 'calendar_pull'` or `'calendar_watch_renew'` or Sheets-related kinds. Those are **processed by the Supabase Edge Function `sync-runner`**.

**Checklist:**

1. **Supabase Edge Functions (deploy & secrets):**
   - **sync-runner** — processes `sync_jobs` (Google + Morning + Sheets). Needs:
     - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_RUNNER_SECRET`
     - For Google: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
   - **google-calendar-webhook** — receives Google push notifications; enqueues `calendar_pull` jobs.
   - **cron-tick** — scheduled (e.g. every 5–15 min); enqueues `calendar_watch_renew` and optional `calendar_pull`. Needs `CRON_SECRET`, Supabase secrets.

2. **Schedule cron-tick** in Supabase (Dashboard → Edge Functions → cron-tick → Schedule) or via external cron calling the function URL with `x-cron-secret`.

3. **sync-runner** must be **invoked** regularly (e.g. every 1–2 min) so pending `sync_jobs` rows are processed. That can be:
   - A separate scheduled function that POSTs to sync-runner with `SYNC_RUNNER_SECRET`, or
   - Supabase Scheduled Functions / pg_cron calling the sync-runner URL.

4. **Settings → Integrations:** User clicks “התחבר” for Google Drive / Google Calendar so tokens exist in `integration_tokens` for the agency.

---

## 3. Sync job flow (Google + Morning)

1. **UI or cron** inserts into `sync_jobs` with `status: 'pending'`.
2. **sync-runner** (Supabase Edge) is invoked with auth (`SYNC_RUNNER_SECRET`).
3. sync-runner selects pending jobs, sets `status: 'running'`, processes:
   - **Google:** calendar_pull, calendar_watch_renew, sheets sync (using `integration_tokens` + Google OAuth).
   - **Morning:** morning_sync_event, morning_sync_expenses (using `integration_secrets` or env).
4. On success/failure it updates the row to `succeeded` or `failed` and sets `result` / `last_error`.

**Monitor:** Sync Monitor page (Owner only) lists `sync_jobs` and supports “Retry Failed”.

---

## 4. Quick verification

| Step | What to check |
|------|----------------|
| Morning from UI | Events → “סנכרן Morning” on an event → document created in Green Invoice. |
| Morning env | Netlify → Functions → morning-api → Logs (no 500 from missing env). |
| Google OAuth | Settings → Integrations → Google “התחבר” → redirect back and “מחובר”. |
| sync_jobs | Sync Monitor (as Owner) → see pending/running/succeeded/failed. |
| sync-runner | Supabase → Edge Functions → sync-runner → Logs; or trigger manually with correct secret. |
| cron-tick | Schedule set and runs; sync_jobs get new `calendar_watch_renew` / `calendar_pull` rows. |

---

## 5. Files reference

| File | Role |
|------|------|
| `netlify/functions/morning-api.ts` | Morning API proxy (create document, get status). |
| `src/services/morningService.ts` | Frontend calls to morning-api. |
| `src/lib/syncJobs.ts` | `queueSyncJob()` — insert into `sync_jobs`. |
| `src/lib/googleOAuth.ts` | Start Google OAuth flow (Supabase function). |
| `supabase/functions/sync-runner/index.ts` | Consumes `sync_jobs` (Google, Morning, Sheets). |
| `supabase/functions/cron-tick/index.ts` | Enqueues Google calendar renewal + pull. |
| `supabase/functions/google-calendar-webhook/index.ts` | Handles Google push; enqueues calendar_pull. |

With Netlify Morning env set, Supabase Edge Functions deployed and scheduled, and Google connected in Settings, full sync with both Google and Morning works end-to-end.

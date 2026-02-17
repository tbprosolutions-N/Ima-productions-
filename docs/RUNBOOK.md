# NPC Management System — Operations Runbook

> **Audience:** System owner / DevOps.  
> **Last updated:** Feb 2026

---

## Table of Contents

1. [Environment Variables Checklist](#1-environment-variables-checklist)
2. [How to Add a New User](#2-how-to-add-a-new-user)
3. [How to Fix "No Agency" Errors](#3-how-to-fix-no-agency-errors)
4. [How to Debug Google Sheets Sync Failures](#4-how-to-debug-google-sheets-sync-failures)
5. [Database — Running Migrations](#5-database--running-migrations)
6. [Auth — Diagnosing Login Failures](#6-auth--diagnosing-login-failures)
7. [First-Run Bootstrap (Fresh Deployment)](#7-first-run-bootstrap-fresh-deployment)
8. [Morning (Green Invoice) Integration](#8-morning-green-invoice-integration)

---

## 1. Environment Variables Checklist

### Netlify → Site configuration → Environment variables

Set scope to **All** (build + functions) unless noted otherwise.

| Variable | Scope | Required | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Build | ✅ Yes | Supabase project URL (from Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Build | ✅ Yes | Supabase **anon** JWT key (starts with `eyJ…`) |
| `VITE_APP_URL` | Build | Recommended | Canonical app URL, e.g. `https://npc-am.com`. Used for OAuth redirects. |
| `VITE_APP_NAME` | Build | No | Custom app name shown in UI. Default: `NPC - Agency Management` |
| `SUPABASE_URL` | Functions | ✅ Yes | Same as VITE_SUPABASE_URL (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Functions | ✅ Yes | Supabase **service_role** key (from Settings → API). Never expose to browser. |
| `GOOGLE_SA_CLIENT_EMAIL` | Functions | ✅ Yes | Google Service Account email (e.g. `npc-sa@project.iam.gserviceaccount.com`) |
| `GOOGLE_SA_PRIVATE_KEY` | Functions | ✅ Yes | Service Account PEM private key. Replace literal `\n` with actual newlines in Netlify env editor. |
| `MORNING_API_KEY` | Functions | No | Morning/Green Invoice API ID (fallback if not stored in DB) |
| `MORNING_API_SECRET` | Functions | No | Morning/Green Invoice API secret (fallback) |
| `MORNING_BASE_URL` | Functions | No | Override API base URL. Default: `https://api.greeninvoice.co.il/api/v1` |

> **After any change to `VITE_*` variables**, trigger a new deploy in Netlify (Deploys → Trigger deploy → Deploy site). Vite reads these at build time.

### Local development

Create `.env` in project root:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_APP_URL=http://localhost:5173
```

Then restart the dev server: `npm run dev`

---

## 2. How to Add a New User

The system is **invite-only** (B2B). Users cannot self-register.

### Step-by-step

1. Log in as an **Owner** user.
2. Navigate to **Settings → Users**.
3. Click **"הוסף משתמש"** (Add User).
4. Fill in:
   - **Email** — must match the Google account the user will sign in with.
   - **Full Name** — display name.
   - **Role** — `producer`, `finance`, `manager`, or `owner`.
5. Click **Save**. This inserts a row in `public.pending_invites`.
6. Tell the user to sign in with **Google SSO** at your app URL.
7. On first sign-in, the `handle_new_user` trigger fires, consumes the invite, and creates a `public.users` profile.
8. The user now appears in the Settings → Users list.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| User redirected to `/login?unauthorized=1` | Email not in `pending_invites` or wrong Google account | Re-check email in Settings → Users. Remove and re-add if needed. |
| User added but doesn't appear in list | RPC returned `ok: false` | Check browser console. User may lack Owner role. |
| "Only Owner can add users" error | Caller is not `owner` role | Ask an existing owner to perform the action. |

---

## 3. How to Fix "No Agency" Errors

The yellow banner _"לחשבון שלך לא משויכת סוכנות"_ appears when a logged-in user's profile has `agency_id = NULL` or the agency row doesn't exist.

### Diagnosis

1. Open browser console → look for `[Agency]` logs.
2. Check Supabase → `public.users` table. Find the user row and inspect `agency_id`.
3. Check Supabase → `public.agencies` table. Verify the referenced agency exists.

### Fix options

**Option A – Agency exists, user is missing it:**
```sql
UPDATE public.users
  SET agency_id = '<correct-agency-uuid>'
  WHERE email = 'user@example.com';
```

**Option B – Agency doesn't exist (fresh DB with no bootstrap):**
```sql
-- 1. Create the agency
INSERT INTO public.agencies (name, type, company_id, settings)
  VALUES ('NPC Agency', 'ima', 'NPC001', '{"currency":"ILS","timezone":"Asia/Jerusalem"}')
  RETURNING id;

-- 2. Assign all users missing an agency to it
UPDATE public.users
  SET agency_id = '<id-from-step-1>'
  WHERE agency_id IS NULL;
```

**Option C – Auto-bootstrap via `ensure_user_profile` RPC:**
The `AgencyContext` automatically calls `ensure_user_profile` when it detects no `agency_id`. If the RPC fails, check:
- That `ensure_user_profile` function exists in DB (run consolidated migration if needed).
- That the user is authenticated (has a valid session).

**Option D – Click "רענן" in the yellow banner:**
This retries the agency fetch and re-triggers the RPC. Works after fixing the DB.

---

## 4. How to Debug Google Sheets Sync Failures

The sync runs via the Netlify function `sheets-sync-api`. It triggers when the first event is created.

### Check Function Logs

1. Netlify Dashboard → Functions → `sheets-sync-api` → Logs.
2. Look for the `requestId` in the logs to trace a specific invocation.

### Common errors

| Error | Meaning | Fix |
|---|---|---|
| `400 Invalid folderId` | The Google Drive folder ID/URL is malformed | Re-paste the folder ID from Drive URL (`...folders/<ID>`) in Settings → Backup |
| `403 FolderAccessError` | Service Account not added to Drive folder | Share the Drive folder with `GOOGLE_SA_CLIENT_EMAIL` as **Editor** |
| `502 Google API error` | Sheets/Drive API rejected the request | Check Service Account credentials; verify the SA has Drive/Sheets API enabled in GCP |
| `504 Handler timeout` | Function exceeded 25s | Check GCP quota; verify Drive folder is accessible; retry |
| `GoogleAuthError: missing env` | `GOOGLE_SA_CLIENT_EMAIL` or `GOOGLE_SA_PRIVATE_KEY` not set | Set the Netlify env vars (see §1) and redeploy functions |
| `private key must contain BEGIN` | `GOOGLE_SA_PRIVATE_KEY` has incorrect newlines | In Netlify env editor, paste the PEM key with real line breaks (not `\n` literals) |

### Manual test via curl

```bash
curl -X POST https://your-netlify-site.netlify.app/.netlify/functions/sheets-sync-api \
  -H "Content-Type: application/json" \
  -d '{
    "action": "createAndSync",
    "agencyId": "<agency-uuid>",
    "folderId": "<drive-folder-id>"
  }'
```

Expected response: `{"ok":true,"spreadsheetId":"...","spreadsheetUrl":"..."}`

### Folder setup checklist

- [ ] Drive folder created and ID copied from URL.
- [ ] Folder shared with Service Account email as **Editor**.
- [ ] `GOOGLE_SA_CLIENT_EMAIL` and `GOOGLE_SA_PRIVATE_KEY` set in Netlify.
- [ ] Drive API and Sheets API **enabled** in the Google Cloud project for the Service Account.
- [ ] `folderId` saved in Settings → Backup tab in the app.

---

## 5. Database — Running Migrations

### Standard flow (Supabase CLI)

```bash
# Push all pending migrations to production
supabase db push --linked

# Or push a single file
supabase db push --linked --file supabase/migrations/20260224000000_consolidated_production_sync.sql
```

### Emergency: SQL Editor

If Supabase CLI is not set up, paste the migration content directly in **Supabase → SQL Editor → New query** and click **Run**.

All migrations in `supabase/migrations/` are designed to be idempotent — safe to re-run.

### Consolidated migration (must run on fresh production)

File: `supabase/migrations/20260224000000_consolidated_production_sync.sql`

This single file applies all schema changes, indexes, RLS policies, and RPCs. Run it against your production Supabase instance before deploying the app for the first time.

---

## 6. Auth — Diagnosing Login Failures

### Symptoms

| Symptom | Likely cause |
|---|---|
| Redirect to `/login?unauthorized=1` after Google sign-in | User email not in `pending_invites` |
| Spinner stuck on login page | Network timeout reaching Supabase; or `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` wrong |
| "AuthRescueScreen" shown (חיבור נכשל) | Supabase unreachable (wrong URL, project paused, or network issue) |
| Login works locally but not in production | `VITE_*` vars not set in Netlify or not redeployed after change |

### Browser diagnostic

```js
// Paste in DevTools console:
__NPC_SUPABASE_DIAGNOSTIC()
```

Output shows URL prefix, key length, and whether the key is a valid JWT.

### Supabase Auth configuration

In **Supabase → Authentication → URL Configuration**:
- **Site URL**: `https://npc-am.com` (your production domain)
- **Redirect URLs**: `https://npc-am.com`, `https://npc-am.com/**`

In **Google Cloud Console → OAuth 2.0 Client**:
- **Authorized redirect URIs**: `https://<your-supabase-project>.supabase.co/auth/v1/callback`

---

## 7. First-Run Bootstrap (Fresh Deployment)

When the database is completely empty (no users, no agencies):

1. **Run the consolidated migration** (see §5). This creates the `handle_new_user` trigger and `ensure_user_profile` RPC with bootstrap logic.
2. **Sign in with Google**. The first user to sign in will:
   - Trigger `handle_new_user` → finds no pending invite → sees 0 users in DB → creates "NPC Agency" and makes itself `owner`.
   - If the trigger fails (e.g., `pending_invites` table missing): `AuthContext` calls `ensure_user_profile` RPC, which applies the same bootstrap logic.
3. Verify in Supabase → `public.users` and `public.agencies` that rows were created.
4. You're now the Owner. Add other users via Settings → Users (see §2).

---

## 8. Morning (Green Invoice) Integration

### Setup

1. Go to **Settings → Backup / integrations tab**.
2. Enter your Morning API ID and Secret.
3. Click Save. Credentials are stored encrypted in `public.integration_secrets` per agency.

### Fallback

Set `MORNING_API_KEY` and `MORNING_API_SECRET` in Netlify environment variables. These are used if no DB credentials exist for the agency.

### Troubleshooting

- Morning returns `401`: API credentials invalid. Re-enter in Settings.
- Morning returns `404`: Check that you're using the correct `base_url` (`https://api.greeninvoice.co.il/api/v1`).
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` missing from Netlify: the Morning proxy function (`morning-api`, `morning-save-credentials`) cannot retrieve credentials from DB.

---

*End of Runbook — update this file when infrastructure changes.*

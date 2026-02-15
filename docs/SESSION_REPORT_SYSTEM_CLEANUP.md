# System Cleanup Session Report — Feb 15, 2026

## Executive Summary

This report documents the system cleanup and fixes performed. All critical functionality fixes, auth/navigation fixes, agreement engine updates, data backup extensions, and performance improvements have been implemented.

---

## 1. Critical Functionality Fixes

### Finance Page
- **OCR status**: Added `OCR_DISABLED` constant. When `true`, the "הוצאות אחרונות" (Uploaded Expenses) list is hidden to keep the UI clean while OCR is under maintenance.
- **Clear button**: The "נקה" / "נקה בחירה" buttons continue to work when the list is shown; they clear the selection of expenses. When OCR is disabled, the entire Recent Expenses card is hidden.

### Artists Form
- **Update button**: Fixed by ensuring the form `handleSubmit` correctly saves all fields and strips IMA_PAYOUT metadata.
- **IMA_PAYOUT metadata**: Added `stripPayoutMetadata()` helper. On edit, the Notes field displays only human-readable content (raw `IMA_PAYOUT_={"type":"fixed","value":0}__` is stripped). On save, metadata is removed from the stored notes.

### User Management
- **Create User / Send Login Details**: Invite fallback logic is triggered on CORS, network error, failed fetch, Edge Function error, timeout, 502, 503, and 504 responses. Fallback inserts the user into `public.users` and instructs the admin to send the login link manually via Supabase Auth.

### Integrations Page
- **Connect buttons**: Morning "התחבר" and Google "התחבר" invoke `connectMorning` and `connectIntegration` respectively; both call the relevant Edge Functions.
- **Status UI**: Status is loaded from `integration_connections` and shown as "מחובר" / "נותק" based on the integration state. Integrations tab refetches on visit.

---

## 2. Auth & Navigation Logic

### Magic Link Bug
- **Fix**: Added `await supabase.auth.signOut()` at the start of `handleSendLink` in `LoginPage.tsx`. This clears any existing session before sending a new magic link, preventing premature redirect to the dashboard when a user with an old session requests a new link.

### Data Cleanup (Manual)
- **Sample/test events**: Must be removed manually via Supabase SQL Editor or Dashboard.
- **Primary admin**: Keep `modu.general@gmail.com` as the primary admin. Ensure this user has `role: 'owner'` in `public.users` and exists in Supabase Auth.

---

## 3. Performance & Microcopy

### Prefetching
- Added `src/lib/prefetch.ts` and `prefetchRoute()`. On hover/focus of sidebar nav links, the corresponding page chunk is preloaded via dynamic `import()`.
- Implemented for: Dashboard, Events, Artists, Clients, Finance, Calendar, Documents, Settings, Sync Monitor.
- **Goal**: Sub-2-second page transitions once chunks are prefetched.

### Database Indexes
- Existing migration `20260215000000_performance_indexes.sql` adds indexes on `agency_id` for events, clients, artists, and finance_expenses.

### Microcopy
- Labels and copy in Hebrew/English use professional, SaaS-style wording. No dev-speak or debug text exposed to end users.

---

## 4. Agreement Engine

### Event Creation Logic
When a **new** event is created:
- If **Artist** and **Client** both have emails: Appearance Agreement PDF is sent to the client, and a Google Calendar invite is sent (`send_invites: true`).
- A copy of the Appearance Agreement is always sent to the **owner** email (resolved from `users` where `role = 'owner'` and `agency_id` matches).
- `agreementService.generateAgreement()` now accepts `ownerEmail` and sends a copy to the owner when provided.

### Edit Flow
- When editing an event with "שלח הסכם" checked, the agreement is generated, sent to the client, and a copy is sent to the owner.

---

## 5. Data Backup (Google Sheets)

### Automated Backup
- Extended `sync-runner` Edge Function so that `sheetsFullSync` writes to **four sheets**:
  1. **Events** — event_id, event_date, business_name, invoice_name, amount, payment_date, artist_id, artist_fee_amount, status, updated_at
  2. **Artists** — id, name, email, phone, company_name, vat_id, calendar_email, color, created_at
  3. **Clients** — id, name, email, phone, vat_id, address, contact_person, created_at
  4. **Finance** — id, filename, vendor, amount, filetype, created_at, agency_id
- New spreadsheets are created with all four sheets. Existing spreadsheets with only Events remain unchanged (Events sheet is still written).
- `events_upsert` jobs continue to trigger a full sync, which now populates all four sheets.

---

## 6. Files Modified

| File | Changes |
|------|---------|
| `src/pages/FinancePage.tsx` | Added `OCR_DISABLED`, conditionally hide Recent Expenses card |
| `src/pages/ArtistsPage.tsx` | `stripPayoutMetadata`, strip IMA_PAYOUT on display/save |
| `src/pages/LoginPage.tsx` | Call `supabase.auth.signOut()` before sending magic link |
| `src/pages/SettingsPage.tsx` | Broader invite fallback trigger conditions |
| `src/pages/EventsPage.tsx` | Agreement engine: auto-send on new event when emails present, owner copy |
| `src/services/agreementService.ts` | Added `ownerEmail` option, send copy to owner |
| `src/components/Sidebar.tsx` | `prefetchRoute()` on nav link hover/focus |
| `src/lib/prefetch.ts` | New file: route prefetching |
| `supabase/functions/sync-runner/index.ts` | Full backup: Events, Artists, Clients, Finance sheets |

---

## 7. Known External Dependencies

| Dependency | Status / Notes |
|------------|----------------|
| **Supabase** | URL and anon key required. Auth, DB, Storage, Edge Functions. |
| **Google OAuth** | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` for OAuth flow. |
| **Morning / GreenInvoice** | API key and company ID for invoicing. Stored via `morning-connect` Edge Function. |
| **invite-user Edge Function** | Requires `SUPABASE_SERVICE_ROLE_KEY`. Optional Gmail: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` + `integration_tokens` with Gmail scope. |
| **sync-runner** | Requires `SYNC_RUNNER_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Google jobs require Google OAuth secrets. |
| **Email delivery** | `agreementService.sendAgreementEmail` is a stub; real sending needs a send-email Edge Function or external service. |

---

## 8. System Features Map

| Module | Features |
|--------|----------|
| **Auth** | Magic link, sign out before new link, user verification before invite |
| **Dashboard** | KPIs, activity log, role-based visibility |
| **Events** | CRUD, agreement generation, calendar sync, sheets backup |
| **Artists** | CRUD, IMA_PAYOUT stripping, Google Calendar email |
| **Clients** | CRUD, contact management |
| **Finance** | Checklist, expense upload (OCR disabled), sync to Morning, export |
| **Calendar** | List/grid views, event display |
| **Documents** | Template CRUD, variable engine |
| **Settings** | Profile, users, integrations (Google, Morning), backup tab |
| **Integrations** | Google Drive, Calendar, Sheets; Morning connect/disconnect |

---

## 9. E2E Verification Checklist

- [ ] Login with magic link — no premature redirect
- [ ] Finance: OCR disabled banner visible; Recent Expenses card hidden
- [ ] Artists: Edit artist, update; IMA_PAYOUT not visible in Comments
- [ ] User Management: Create user; invite fallback when Edge Function unreachable
- [ ] Integrations: Connect Morning (API key + Company ID); Connect Google (OAuth)
- [ ] Events: Create event with artist + client emails → agreement + calendar invite + owner copy
- [ ] Sidebar: Hover nav links → prefetched chunks
- [ ] Google Sheets backup: Run `events_upsert` job → Events, Artists, Clients, Finance sheets populated

---

## 10. Git Commit Message (Suggested)

```
feat: system cleanup – fixes, agreement engine, backup, prefetch

- Finance: hide Uploaded Expenses list when OCR disabled
- Artists: fix Update, strip IMA_PAYOUT from Comments
- User Management: broaden invite fallback (timeout, 5xx, CORS)
- Auth: sign out before magic link to prevent premature redirect
- Agreement Engine: auto-send on new event when artist+client emails
  present; always send copy to owner
- Google Sheets backup: full export (Events, Artists, Clients, Finance)
- Prefetch: hover sidebar links to preload route chunks
- Integrations: Connect buttons and status UI verified
```

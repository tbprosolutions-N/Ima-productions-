# Backup/Sync — Verification & Automatic Synchronization

## 1. Current logic (verified)

| Step | What happens |
|------|----------------|
| **Setup** | User pastes Google Drive Folder ID in Settings; first sync creates a sheet and stores `spreadsheet_id` in `integrations.config`. |
| **Trigger (manual)** | Button click → frontend calls `createSheetAndSync` or `resyncSheet` → INSERT into `sync_queue` with `action: 'createAndSync'` or `'sync'`, plus full `sheets` and `counts`. |
| **Webhook** | Supabase Database Webhook on `sync_queue` (Insert) → POST to `sheets-sync` Edge Function with payload `{ type, table, record }`. |
| **Edge Function** | Parses payload (JSON-first, then base64 fallback), reads `record.data`, writes to Google Sheets via Service Account, updates row to `completed` or `failed`. |
| **Output** | Sheet uses **USER_ENTERED** for `syncEditable`; `sync`/`createAndSync` use RAW. Bilingual editable sheet is from "סנכרן לגיליון עבודה חי" (syncEditable). |

---

## 2. Sticking points & resolution

### 2.1 "Failed to decode base64"

- **Cause:** Webhook sends `record` as a **JSON object** (or JSON string). The Edge Function was calling `atob(record)` when `record` was a string, and some configs send plain JSON, so `atob` threw.
- **Fix (JSON-first):** In `sheets-sync/index.ts`, `parseRequestBody`:
  1. Parses body as JSON (no base64 on body).
  2. For webhook payloads, when `record` is a string: **try `JSON.parse(record)` first**; only if that fails try `safeAtob(record)` then parse.
- **Result:** Sync_queue rows that contain JSON (as in your table) are handled without decoding; base64 is only used for legacy direct-call format. **Redeploy** the function after pulling the latest code so this is live.

### 2.2 Other potential bottlenecks

| Risk | Mitigation |
|------|------------|
| **Google API limits** | Sheets API: 100 requests per 100 seconds per user (Service Account). Sequential writes in `pushSheetsData` avoid burst; if you have many agencies, consider per-agency debouncing (see automatic sync). |
| **RLS** | Edge Function uses **Service Role** for Supabase client (bypasses RLS). Trigger-inserted rows use the **calling user** (`auth.uid()`), so RLS on `sync_queue` (insert only when `user_id = auth.uid()`) is satisfied. |
| **Webhook delivery** | If the webhook fails (timeout, 5xx), the row stays `pending`; no automatic retry. Optional: cron or periodic job to retry `pending` rows older than N minutes. |
| **Empty payload** | Circuit breaker in `sheetsSyncService` blocks enqueue when events + artists + expenses are all zero. AutoSync fetches fresh data server-side, so same rule applies. |

---

## 3. Automatic synchronization

### 3.1 Design

- **Trigger:** `AFTER INSERT OR UPDATE` on `events` and on `finance_expenses`.
- **Action:** Insert a row into `sync_queue` with `data = { "action": "autoSync" }` (no `sheets` payload).
- **Debouncing:** Only insert if there is **no** row for the same `agency_id` with `status IN ('pending','processing')` and `created_at` within the last **2 minutes**. That way rapid edits don’t flood the queue and we don’t create duplicate sheets.
- **Edge Function:** New action **`autoSync`**. Loads `spreadsheet_id` from `integrations` for that `agency_id`, fetches events/clients/artists/expenses from Supabase, builds the same sheet structure as `sync`, writes with **USER_ENTERED**, and updates the queue row. **No new sheet is created**; always uses existing `spreadsheet_id`.

### 3.2 Database trigger (migration)

- One trigger function that:
  - Reads `agency_id` from `NEW`.
  - If `auth.uid()` is null, skips (no user context).
  - Checks debounce: skip if a recent pending/processing job exists for this agency.
  - Inserts into `sync_queue`: `user_id = auth.uid()`, `agency_id`, `data = '{"action":"autoSync"}'`.
- Two triggers: `events` (AFTER INSERT OR UPDATE), `finance_expenses` (AFTER INSERT OR UPDATE).

### 3.3 Edge Function `autoSync`

- Input: `record` from webhook with `record.agency_id` and `record.data.action === 'autoSync'`.
- Steps:
  1. Get `spreadsheet_id` from `integrations` where `agency_id` and `provider = 'sheets'`.
  2. If missing, mark queue row `failed` with a clear message and return.
  3. Fetch events, clients, artists, expenses from Supabase (Service Role) for that `agency_id`.
  4. Build sheets (Hebrew headers, one header row, data rows) in the same format as client `sync`.
  5. Call `pushSheetsData` with `valueInputOption: 'USER_ENTERED'` and `ensureSheets: true`.
  6. Update queue row to `completed` with counts.

---

## 4. Validation — what to check

### 4.1 Manual sync (button) and base64 fix

1. **Logs (Supabase Dashboard → Edge Functions → sheets-sync → Logs)**  
   - After a manual sync, you should see: `Function triggered`, `Webhook processing queueId=... action=createAndSync` or `action=sync`, then `Sync: אירועים ok, ...` (and similar for other sheets).  
   - You should **not** see "Failed to decode base64" for normal webhook payloads.

2. **Database**  
   - **sync_queue:** The row for that run should move from `pending` → `processing` → `completed`. `result` should contain `spreadsheetId` and `counts`.  
   - If it stays `failed`, read `error_message`; it should no longer be "Failed to decode base64" for JSON payloads.

3. **Google Sheet**  
   - Open the sheet; tabs אירועים, לקוחות, אמנים, פיננסים should have the latest data. For "גיליון עבודה חי", numbers and dates should be editable (USER_ENTERED).

### 4.2 Automatic sync (after enabling trigger + autoSync)

1. **Database**  
   - **sync_queue:** After you INSERT or UPDATE a row in `events` or `finance_expenses`, a new row should appear with `data->>'action' = 'autoSync'` and `status` progressing to `completed` (or `failed` with a clear `error_message`).  
   - **Debounce:** Perform two quick updates to the same agency’s event; you should see at most one new `autoSync` row within 2 minutes (second insert may be skipped).

2. **Logs**  
   - You should see `action=autoSync`, then logs for fetching data and writing sheets (e.g. `Sync: אירועים ok, ...`).

3. **Google Sheet**  
   - After a short delay, the sheet should reflect the new or updated event/expense without using the manual sync button.

### 4.3 Quick checklist

| Check | Where | Expected |
|-------|--------|----------|
| Webhook fires on sync_queue INSERT | Supabase → Database → Webhooks | `sheets-sync-trigger` on `sync_queue`, Insert |
| No base64 error on manual sync | sync_queue.error_message | Not "Failed to decode base64" |
| Queue row completes | sync_queue.status, result | status = completed, result has counts |
| AutoSync row created on event change | sync_queue (after INSERT/UPDATE event) | New row with action autoSync |
| AutoSync completes | sync_queue.status for autoSync row | completed (or failed with clear message) |
| Sheet updated without button | Google Sheet | Data matches latest events/expenses |

---

## 5. Files to add/change

- **Doc:** This file (`docs/BACKUP_SYNC_VERIFICATION_AND_AUTO_SYNC.md`).
- **Migration:** `supabase/migrations/20260307000000_auto_sync_trigger.sql` — trigger function `enqueue_auto_sync()` plus triggers on `events` and `finance_expenses` (debounced enqueue of `autoSync`). Apply with `supabase db push` (or run migration on remote).
- **Edge Function:** `sheets-sync/index.ts` — `action === 'autoSync'` implemented: fetches `spreadsheet_id` from `integrations`, loads events/clients/artists/expenses, builds sheets, pushes with USER_ENTERED and `ensureSheets: true`. Redeploy with `supabase functions deploy sheets-sync --no-verify-jwt` after pulling.

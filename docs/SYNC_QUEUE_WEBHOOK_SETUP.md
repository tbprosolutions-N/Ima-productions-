# Backup to Google Sheets — Data Warehouse (export-to-sheets)

Backup is **on-demand only**: no real-time sync, no `sync_queue` table. The client (Alon) gets a 100% accurate snapshot every time he clicks **Export to Sheets** in Settings → Backup.

## 1. Google Apps Script (GAS)

1. Copy the script from **`scripts/gas-sheets-bridge/code.gs`** into a new Google Apps Script project.
2. Deploy as **Web app**: Execute as **Me**, Who has access **Anyone**.
3. Copy the Web app URL (e.g. `https://script.google.com/macros/s/.../exec`).

The GAS script accepts a POST with `{ spreadsheetId?, sheets: { אירועים, לקוחות, אמנים, פיננסים } }`. It **overwrites** each sheet with the new snapshot (clear + setValues). If no `spreadsheetId` is sent, it creates a new spreadsheet and returns its ID and URL.

## 2. Supabase secrets

```bash
npx supabase secrets set GAS_WEBHOOK_URL="https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec"
```

Same secret is used by the **export-to-sheets** Edge Function.

## 3. Deploy Edge Function

```bash
npx supabase functions deploy export-to-sheets --no-verify-jwt
```

The function:

- Accepts POST body: `{ agency_id: string, spreadsheet_id?: string }`.
- Fetches a full snapshot (events, clients, artists, finance_expenses) for that agency.
- Sends the snapshot to the GAS Web App.
- If GAS creates a new spreadsheet, the function upserts `integrations` so the UI can show “Open backup sheet”.
- Returns `{ ok, spreadsheetId, spreadsheetUrl, counts }` to the client.

## 4. Apply migrations (drop legacy sync)

If you had the old sync_queue setup, apply the migration that removes it:

```bash
npx supabase db push
```

This applies **`20260310000000_drop_sync_queue_legacy.sql`**: drops `sync_queue` table and its triggers (no more auto-enqueue on events/finance_expenses).

## 5. Flow (current)

1. **Settings → Backup:** User clicks **Export to Sheets** (or “ייצוא לגיליון”).
2. **Frontend** calls `supabase.functions.invoke('export-to-sheets', { body: { agency_id, spreadsheet_id } })`.
3. **export-to-sheets** fetches snapshot from DB, POSTs to GAS; GAS overwrites the sheet (or creates a new one).
4. **Response** returns `spreadsheetId` / `spreadsheetUrl` / `counts`; if a new sheet was created, the client stores it so “Open backup sheet” works next time.

No Database Webhook, no Realtime, no sync status badge. Event create/edit only touches the `events` table; backup is separate and on-demand.

## 6. Immediate email alert (unchanged)

To notify the client when an event is created:

1. Deploy: `npx supabase functions deploy send-immediate-alert --no-verify-jwt`
2. Optional: `supabase secrets set RESEND_API_KEY=re_xxx`
3. Create a Database Webhook on table **`events`**, event **Insert**, function **`send-immediate-alert`**

The function sends a short Hebrew email to the agency owner.

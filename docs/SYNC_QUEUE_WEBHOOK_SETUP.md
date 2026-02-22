# Sync Queue — Database Webhook Setup

The async Pub/Sub sync pattern uses a Database Webhook to trigger the `sheets-sync` Edge Function when a row is inserted into `sync_queue`.

## 1. Apply Migration

```bash
npx supabase db push
```

Or run `supabase/migrations/20260305000000_sync_queue_pubsub.sql` manually in the Supabase SQL Editor.

## 2. Create Database Webhook

1. Open **Supabase Dashboard** → **Database** → **Webhooks**
2. Click **Create a new hook**
3. Configure:
   - **Name:** `sheets-sync-trigger`
   - **Table:** `sync_queue`
   - **Events:** `Insert`
   - **Type:** `Supabase Edge Function`
   - **Function:** `sheets-sync`
   - **HTTP Headers:** (optional) Add `x-webhook-source: sync_queue` for debugging

4. Save

The webhook sends a POST to the Edge Function with:
```json
{
  "type": "INSERT",
  "table": "sync_queue",
  "record": {
    "id": "uuid",
    "user_id": "uuid",
    "agency_id": "uuid",
    "data": { "action": "createAndSync"|"sync", "folderId"?, "spreadsheetId"?, "sheets": {...}, "counts": {...} },
    "status": "pending"
  }
}
```

## 3. Deploy Edge Function

```bash
npx supabase functions deploy sheets-sync --no-verify-jwt
```

## 4. Flow

1. **Frontend:** User clicks Sync → INSERT into `sync_queue` → toast "מסנכרן ברקע..."
2. **Webhook:** Supabase fires POST to `sheets-sync` with the new row
3. **Edge Function:** Uses Service Role to read `sync_queue`, writes to Google Sheets, updates status to `completed` or `failed`
4. **Realtime:** Frontend subscribes to `sync_queue`; when status changes, toast turns green (success) or red (error)

## 5. Realtime

The migration adds `sync_queue` to `supabase_realtime` publication. Ensure Realtime is enabled in **Project Settings → API**.

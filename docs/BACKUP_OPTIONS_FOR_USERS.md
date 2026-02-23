# Backup Options for User Use (System Shutdown / Offline)

When the system is down or Google Sheets sync fails, users can still secure their data using these backup options. All can be used from **Settings → Backup** in the app.

---

## 1. **Download CSV (local backup) — always works, no server dependency**

- **Where:** Settings → Backup → **הורד CSV (גיבוי מקומי)**
- **What it does:** Builds a backup_v1 snapshot (Events, Clients, Artists, Expenses) and downloads a single CSV file with bilingual headers (Hebrew + English) to the user’s device.
- **When to use:** Anytime. Works offline if the app is already loaded; only needs DB access for live data.
- **Pros:** No Google, no Edge Function, no sync_queue. File is on the user’s machine.
- **Cons:** Manual; user must click and store the file.

---

## 2. **Snapshot to cloud (Supabase Storage)**

- **Where:** Settings → Backup → **גיבוי מאובטח לענן (Snapshot)**
- **What it does:** Generates the same backup_v1 snapshot, then uploads JSON + CSV to the `backups` bucket: `backups/{agency_id}/{timestamp}_snapshot.json` and `.csv`.
- **When to use:** When you want a copy in your Supabase project (e.g. for compliance or restore).
- **Pros:** Stored in your project; does not depend on Google Sheets or the sync_queue webhook.
- **Cons:** Requires Storage and RLS configured for the `backups` bucket.

---

## 3. **Editable continuity sheet (Google Sheets)**

- **Where:** Settings → Backup → **סנכרן לגיליון עבודה חי (Editable)**
- **What it does:** Pushes the same bilingual snapshot to an existing Google Sheet via sync_queue → sheets-sync Edge Function. Uses **USER_ENTERED** so dates and numbers stay editable in Sheets.
- **When to use:** When the user already has a synced sheet and wants an editable, bilingual copy they can change (e.g. status, budget) even if the NPC system is offline.
- **Pros:** Familiar spreadsheet UI; client can edit and share the sheet.
- **Cons:** Depends on sync_queue webhook and Edge Function; if those fail (e.g. “Failed to decode base64”), use options 1 or 2 instead.

---

## 4. **Create new Google Sheet + sync (first-time setup)**

- **Where:** Settings → Backup → paste Drive folder link → create/sync flow.
- **What it does:** Creates a new spreadsheet in the given folder and syncs Events, Clients, Artists, Expenses (Hebrew headers). Uses sync_queue and Edge Function.
- **When to use:** First-time setup of a backup sheet; same dependency as option 3.

---

## Recommended for “system shutdown” safety

- **Primary:** Use **Download CSV** regularly (e.g. weekly or before major changes). Keep the files in a safe folder or drive. No dependency on sync_queue or Google.
- **Secondary:** Use **Snapshot to cloud** when you want an automatic copy in Supabase Storage, independent of Google.
- **Optional:** Use the **Editable sheet** when the sync pipeline is healthy; if sync fails, fall back to CSV and/or Snapshot until the webhook/Edge Function issue is resolved.

---

## If sync_queue shows “Failed to decode base64”

The sheets-sync Edge Function has been updated to:

- Treat webhook payloads as **JSON first** (no base64 when `record` and `record.data` are already objects).
- Only use base64 decode for legacy direct-call format.
- When `record` is a string, try **JSON.parse(record)** before base64.

Redeploy the function after pulling the latest code:

```bash
npx supabase functions deploy sheets-sync --no-verify-jwt
```

If problems continue, use **Download CSV** and **Snapshot to cloud** as the main backup path until the sync pipeline is fully fixed.

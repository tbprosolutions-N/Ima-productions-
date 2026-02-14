# Integration Audit & Invoice Extraction (OCR/IDP) Evaluation

## Step 1: Integration Audit

### Google Calendar

| Aspect | Status | Details |
|--------|--------|---------|
| **OAuth** | ✅ Implemented | `google-oauth-start`, `google-oauth-callback` (Edge Functions). Scopes include `calendar`. Tokens stored in `integration_tokens` (server-only). |
| **Client helpers** | ✅ Partial | `src/lib/googleCalendar.ts`: only `buildGoogleCalendarUrl()` — builds a **link** to open Google Calendar in browser (add event manually). No API calls from frontend. |
| **Watch (push)** | ✅ Implemented | `google-calendar-watch`: creates a push channel for company calendar; stores channel in `google_calendar_watches`. |
| **Webhook** | ✅ Implemented | `google-calendar-webhook`: receives Google push notifications, enqueues `sync_jobs` with `kind: 'calendar_pull'`. |
| **Sync runner** | ✅ Implemented | `sync-runner`: handles `events_upsert` (IMA → Google Calendar), `calendar_pull` (Google → IMA), `events_full_sync` (Sheets). |
| **Bidirectional** | ✅ Yes | **IMA → Google**: `events_upsert` creates/updates events on company calendar (and optional artist calendar); sends invites via `sendUpdates: 'all'`. **Google → IMA**: `calendar_pull` uses `syncToken` to fetch changes, updates `events` (e.g. `event_date`, marks cancelled). Only events with `extendedProperties.private.ima_event_id` are synced back. |
| **Routes / UI** | Settings → Integrations: “Google Calendar (Daybook Sync)”, connect OAuth, “הפעל סנכרון דו‑כיווני (Webhook)”, “חדש Webhooks”. Finance/Events queue jobs via `queueSyncJob({ provider: 'google', kind: 'events_upsert' | 'calendar_watch_renew' })`. |

---

### Gmail

| Aspect | Status | Details |
|--------|--------|---------|
| **OAuth scope** | ✅ Requested | `google-oauth-start` includes `https://www.googleapis.com/auth/gmail.send` when `gmail: true` or default scopes. |
| **Token storage** | ✅ Same as Calendar | Tokens in `integration_tokens` (one row per agency for `provider: 'google'`); no separate Gmail token. |
| **Sending email** | ✅ Implemented | **invite-user** Edge Function: when the agency has Google connected with `gmail.send` (or equivalent) scope, it creates the user, generates a magic link, and sends the invite email via **Gmail API** (`users/me/messages/send`). Fallback: if Google is not connected, uses Supabase Auth `inviteUserByEmail`. |
| **Bidirectional** | ❌ N/A | No read from Gmail in codebase. Settings copy: “שליחת הזמנות לאירועים והסכמים מהמייל של חשבון ה‑Admin” — event/agreement invites from Admin Gmail planned, not built. |
| **Routes / UI** | Settings → “Gmail (Invites / Agreements)”: status shows “מוכן (Google מחובר)” when Google connected; **Send Link** and new user invite use Gmail when connected. |

---

### Google Drive

| Aspect | Status | Details |
|--------|--------|---------|
| **OAuth scope** | ✅ Requested | `drive.file` in `google-oauth-start`. |
| **Upload / sync** | ❌ Not implemented | No Edge Function or sync job that uploads files to Drive or syncs a folder. |
| **Bidirectional** | ❌ N/A | Settings: “סנכרון מסמכים לתיקיית Drive” — UI only; “Sync Now” shows “בקרוב (דמו)”. |
| **Routes / UI** | Settings → “Google Drive (Documents Sync)”: connect/disconnect toggles `gDriveConnected` and OAuth; no Drive API usage. |

---

### Morning (Green Invoice)

| Aspect | Status | Details |
|--------|--------|---------|
| **Credentials** | ✅ Implemented | `morning-connect` Edge Function: stores `companyId`, `apiKey`, `baseUrl` in `integration_secrets` (provider `morning`). |
| **Events → Morning** | ✅ Implemented | `sync-runner`: `morningSyncEventDocument()` creates a document in Green Invoice from `events` row (client, artist, amount, date); updates `events.morning_sync_status`, `morning_document_id`, etc. |
| **Expenses → Morning** | ✅ Implemented | `sync-runner`: `morningSyncExpenses()` reads `finance_expenses` with `morning_status in ('not_synced','error')`, creates receipt (type 400) per expense, updates `morning_status` to `synced`. |
| **Morning → IMA** | ❌ Not implemented | No webhook or poll that creates/updates events or expenses from Morning into IMA. One-way: IMA → Morning only. |
| **Routes / UI** | Settings → Integrations (Morning); Finance page “סנכרון ל‑Morning” queues `expenses_sync`. Events page has “Sync to Morning” per event. |

---

### Summary Table

| Service        | OAuth / Connect | Outbound (IMA → service) | Inbound (service → IMA) | Bi-directional |
|----------------|-----------------|---------------------------|--------------------------|----------------|
| **Google Calendar** | ✅              | ✅ (events_upsert)        | ✅ (calendar_pull)       | ✅             |
| **Gmail**           | ✅              | ✅ (invites via Gmail API) | ❌                       | ❌             |
| **Google Drive**    | ✅ (scope only) | ❌                        | ❌                       | ❌             |
| **Morning**         | ✅ (API key)    | ✅ (events + expenses)    | ❌                       | ❌             |

---

## Step 2: Technology Selection (Invoice Data Extraction)

**Requirements:** PDF/Image → structured data (Vendor Name, Vendor ID / H.P, Date, Total Amount, VAT). **Hebrew + RTL** and complex layouts must be supported. **MVP, cost-effective**, and you are in Cursor with **Claude 3.5 Sonnet**.

### Options Compared

| Option | Hebrew/RTL | Complex layouts | Cost (MVP) | Integration effort | Notes |
|--------|------------|-----------------|------------|--------------------|-------|
| **Google Document AI** | ✅ Good | ✅ Pre-trained docs | Pay per page | New API key, SDK | Strong for forms; Hebrew supported. |
| **AWS Textract** | ✅ Good | ✅ Tables/forms | Pay per page | AWS account, SDK | Good for tables; Hebrew supported. |
| **Claude 3.5 Sonnet (Vision)** | ✅ Excellent | ✅ Flexible | Per token (input/output) | No new vendor; Cursor/API | Best for RTL + complex; can reason over layout. |
| **Rossum / Tabscanner** | ✅ (product-dependent) | ✅ Dedicated | Subscription | API integration | Purpose-built; higher cost for MVP. |

### Recommendation for MVP: **Claude 3.5 Sonnet Vision (with current OCR fallback)**

**Reasons:**

1. **Hebrew & RTL** — Native strength; no extra configuration.
2. **Cost-effective for MVP** — No new cloud account; use existing Cursor/API. Pay only for pages you actually process.
3. **Fits current stack** — You already use Cursor/Claude; add one extraction path (image/PDF → base64 or URL → Vision API).
4. **Robust and flexible** — Handles messy layouts, mixed Hebrew/English, and ambiguous fields (e.g. “ח.פ.” vs “ע.מ.”) via instructions.
5. **Modular** — Can keep existing `ocrService.ts` (PDF.js + regex) as **fallback** when Vision is unavailable or for simple filenames; add a “Vision extractor” that returns the same `ExtractedExpense` shape.

**Mapping to your model:**

- **Vendor Name** → `supplier_name`
- **Vendor ID (H.P / ח.פ.)** → new optional field e.g. `vendor_id` (or store in `notes` until schema is extended)
- **Date** → `expense_date` (ISO date string)
- **Total Amount** → `amount`
- **VAT** → `vat` (amount or % as needed)

**Fallback strategy:**  
Try Vision first; on failure or if no API key, fall back to current `processFile()` (PDF.js + `extractFromText` / `extractFromFilename`). This keeps the existing flow and adds a stronger path without breaking it.

---

## Step 3: Implementation (After Your Confirmation)

Planned flow once you confirm:

1. **Upload** — Reuse existing Finance upload (file picker / drag-drop); file goes to `processFile()` or a new `processFileWithVision()`.
2. **Extract** — New module (e.g. `src/services/invoiceExtraction.ts` or extend `ocrService.ts`):
   - If Vision enabled: send image/PDF page(s) to Claude 3.5 Sonnet Vision with a structured prompt (Hebrew + RTL, fields: vendor name, H.P, date, total, VAT); parse JSON from response.
   - Map to `ExtractedExpense` (+ optional `vendor_id`); on failure or no key, call existing `processFile()`.
3. **Map to internal model** — Same as today: `ExtractedExpense` → `ExpenseItem` / `finance_expenses` (vendor, amount, date, vat); add `vendor_id` to DB/type if you want it stored.
4. **Modularity** — One extraction interface (e.g. `extractInvoiceData(file: File): Promise<ExtractedExpense>`), two backends (Vision + current OCR); UI unchanged except it gets better data when Vision is used.

**No major architectural conflict** with current design: extraction stays in a service, Finance page keeps calling a single “process file” API and then saving to `finance_expenses` and (optionally) Morning.

---

---

## Step 4: Implementation (Done)

- **`src/services/invoiceExtraction.ts`** — Single interface `extractInvoiceData(file: File): Promise<ExtractedExpense>`. For **images** (JPEG, PNG, GIF, WebP), calls Edge Function `extract-invoice-vision`; on failure or non-image, falls back to `ocrService.processFile()` (PDF.js + filename/text).
- **`supabase/functions/extract-invoice-vision/index.ts`** — Edge Function: accepts `{ imageBase64, mimeType }`, calls Anthropic Claude 3.5 Sonnet Vision with a Hebrew/RTL-aware prompt, returns `{ supplier_name, amount, vat, expense_date, vendor_id? }`.
- **Finance page** — Uses `extractInvoiceData()` for uploads; no UI change except better extracted data when Vision is used.
- **Secret:** Set `ANTHROPIC_API_KEY` in Supabase (Dashboard → Project Settings → Edge Functions → Secrets, or `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`). If unset, the Edge Function returns 503 and the client falls back to OCR.
- **Optional:** `ExtractedExpense` includes optional `vendor_id`; can be stored in `notes` or a DB column later.

**One-time setup (you run this):**

1. Log in and link Supabase (if not already):
   ```bash
   npx supabase login
   npx supabase link --project-ref oerqkyzfsdygmmsonrgz
   ```
   (Project ref matches your dashboard: [Supabase project](https://supabase.com/dashboard/project/oerqkyzfsdygmmsonrgz).)
2. Set your Anthropic key and deploy the function:
   ```bash
   node scripts/setup-invoice-vision.js
   ```
   When prompted, paste your Anthropic API key (from https://console.anthropic.com/). Or run without prompt:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-... node scripts/setup-invoice-vision.js
   ```
   Alternatively, set the secret in Supabase Dashboard → Project Settings → Edge Functions → Secrets, then run:
   ```bash
   npm run deploy:invoice-vision
   ```

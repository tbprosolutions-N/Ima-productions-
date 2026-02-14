# Finance Expense Flow – Audit Summary and Changes

## Goal

**Scan → Extract (OCR/Vision) → Save to Supabase → Immediate UI update**  
No manual “Review” step before saving; “הוצאות אחרונות” updates as soon as each file is saved.

---

## 1. Schema consistency

- **Checked**: `supabase/schema-clean.sql` and `supabase/migrations/20260203000000_add_expense_ocr_fields.sql`.
- **`finance_expenses`** in the full schema already has:  
  `id`, `agency_id`, `uploaded_by`, `filename`, `filetype`, `size`, `storage_path`, `vendor`, `supplier_name`, `amount`, `vat`, `expense_date`, `notes`, `morning_status`, `morning_synced_at`, `created_at`, `updated_at`.
- **Added**:
  - **`supabase/migrations/20260205000000_ensure_finance_expenses_and_storage.sql`**  
    Ensures missing columns exist (for DBs created from older migrations), creates the `expenses` bucket if missing, and creates or updates RLS and Storage policies.
  - **`supabase/MANUAL_RUN_FINANCE_AND_STORAGE.sql`**  
    Same content for running manually in **Supabase Dashboard → SQL Editor** (e.g. for production).

**SQL to run manually (if not using CLI migrations):**  
Open **Supabase Dashboard → SQL Editor**, paste and run the contents of **`supabase/MANUAL_RUN_FINANCE_AND_STORAGE.sql`**.

---

## 2. Logic (FinanceContext & page)

- **`addExpenseFromOcr`**  
  - Uploads file to Storage → inserts a row into `finance_expenses` with extracted data → **appends the new row to state** with `setExpensesState((prev) => [newItem, ...prev])`.  
  - “הוצאות אחרונות” updates immediately; no extra “Review” step.
- **Flow on the Finance page**  
  - In production, upload runs **Scan → Extract → for each file: `addExpenseFromOcr`** (no review modal before DB save).  
  - Partial success: if one file fails, an error is shown and the loop stops; successfully saved items remain in the list.
- **Structured errors**  
  - **`ExpenseUploadError`** with codes: `STORAGE_FORBIDDEN`, `STORAGE_FAILED`, `INSERT_FORBIDDEN`, `INSERT_SCHEMA`, `INSERT_FAILED`.  
  - Finance page shows Hebrew messages based on code (e.g. 403 Storage, RLS, missing column).
- **Load error in production**  
  - **`expensesLoadError`** is set when `loadExpenses()` fails (e.g. not authenticated, DB error).  
  - A banner is shown with the message and a “נסה שוב” button; only when **not** in demo mode.

---

## 3. Supabase & Storage

- **Upload path**: `expenses` bucket, path `{agencyId}/{expenseId}/{filename}`.
- **RLS (table)**  
  - In `schema-clean.sql` and in the new migration:  
  - SELECT: user’s agency; INSERT/UPDATE/DELETE: `owner` / `manager` / `finance` for that agency.
- **Storage policies**  
  - Read: agency members (path prefix = their `agency_id`).  
  - Insert/Delete: `owner` / `manager` / `finance` for that agency.  
  - Recreated in the new migration so they match the table RLS and path layout.

Running **`MANUAL_RUN_FINANCE_AND_STORAGE.sql`** (or the CLI migration) ensures the bucket exists and these policies are in place.

---

## 4. Edge Function & OCR

- **`supabase/functions/extract-invoice-vision/index.ts`**  
  - Uses Anthropic Vision; returns JSON with `supplier_name`, `amount`, `vat`, `expense_date`, `vendor_id`.  
  - **Error responses** now include a **`code`** (e.g. `NO_API_KEY`, `BAD_REQUEST`, `VISION_API_ERROR`, `EXTRACTION_ERROR`) and, where useful, **`details`** for logging.  
  - Console logging added for missing key, API errors, and generic failures.
- **Client**  
  - **`src/services/invoiceExtraction.ts`**: on Vision failure or malformed response, logs a short message (and optional `code`) and falls back to OCR or default extraction.  
  - **FinanceContext** and **Finance page**: on upload/insert failure, log to console and show a clear Hebrew message (Storage 403, Insert permission, schema/column, etc.).

---

## 5. Demo vs production

- **Production (not demo)**  
  - Expenses are loaded and saved only via Supabase (`finance_expenses` + `expenses` bucket).  
  - If **load** fails: `expensesLoadError` is set and the banner is shown.  
  - If **upload** fails: `ExpenseUploadError` is thrown and the page shows the corresponding message.  
- **Demo**  
  - Uses localStorage/IndexedDB; no Supabase for expenses.  
  - Load error banner and upload error codes are not shown in the same way (demo path unchanged).

---

## 6. Production login & magic link

- **`docs/PRODUCTION_LOGIN_MAGIC_LINK.md`** was added. It covers:
  - How invite + magic link works (Gmail vs Supabase mailer).
  - **Supabase Auth**: Site URL and **Redirect URLs** (must include the URL where the magic link redirects).
  - Deploying **`invite-user`** and setting **`SUPABASE_SERVICE_ROLE_KEY`** (and optional Gmail secrets).
  - Optional SMTP for Supabase mailer.
  - A short **pre-meeting checklist** (Auth URLs, invite test, Finance upload test).

---

## SQL to run in Supabase Dashboard

1. Open your **Supabase project → SQL Editor**.
2. Paste the full contents of **`supabase/MANUAL_RUN_FINANCE_AND_STORAGE.sql`**.
3. Run it once.

This will:

- Add any missing columns on `finance_expenses`.
- Ensure the `expenses` bucket exists.
- Create RLS policies on `finance_expenses` if they don’t exist.
- Recreate Storage policies for `expenses` (read/upload/delete by agency and role).

---

## Files touched

| File | Change |
|------|--------|
| `supabase/migrations/20260205000000_ensure_finance_expenses_and_storage.sql` | New: schema + bucket + RLS + Storage policies. |
| `supabase/MANUAL_RUN_FINANCE_AND_STORAGE.sql` | New: same SQL for manual run in Dashboard. |
| `src/contexts/FinanceContext.tsx` | `ExpenseUploadError`, `expensesLoadError`, detailed Storage/Insert errors, console logging. |
| `src/pages/FinancePage.tsx` | Use `expensesLoadError` (banner), catch `ExpenseUploadError` in upload loop, show Hebrew messages. |
| `src/services/invoiceExtraction.ts` | Log Vision failure / malformed response before fallback. |
| `supabase/functions/extract-invoice-vision/index.ts` | Error responses include `code` (and `details` where useful), console logging. |
| `docs/PRODUCTION_LOGIN_MAGIC_LINK.md` | New: production login and magic link setup. |
| `docs/FINANCE_AUDIT_SUMMARY.md` | This summary. |

---

## Quick production checklist (before your meeting)

- [ ] Run **`supabase/MANUAL_RUN_FINANCE_AND_STORAGE.sql`** in Supabase SQL Editor.
- [ ] In **Auth → URL Configuration**, set **Redirect URLs** (e.g. your production app URL).
- [ ] Deploy **`invite-user`** and set **`SUPABASE_SERVICE_ROLE_KEY`**.
- [ ] (Optional) Deploy **`extract-invoice-vision`** and set **`ANTHROPIC_API_KEY`** for better extraction.
- [ ] Send a test invite and open the magic link to confirm login.
- [ ] On Finance, upload an expense and confirm it appears in “הוצאות אחרונות” without refresh.

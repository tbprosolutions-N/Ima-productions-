# Finance expense flow – audit summary and SQL

## 1. Schema consistency

- **Table `finance_expenses`** (from `supabase/schema-clean.sql` and migrations) includes:
  - `id`, `agency_id`, `uploaded_by`, `filename`, `filetype`, `size`, `storage_path`
  - `vendor`, `supplier_name`, `amount`, `vat`, `expense_date`, `notes`
  - `morning_status`, `morning_synced_at`, `created_at`, `updated_at`
- **Migration** `supabase/migrations/20260203000000_add_expense_ocr_fields.sql` adds `expense_date`, `vat`, `supplier_name` if missing.
- **New migration** `supabase/migrations/20260205000000_finance_expenses_ensure_schema_rls.sql`:
  - Adds any of these columns if still missing.
  - Enables RLS on `finance_expenses`.
  - Recreates RLS policies for SELECT/INSERT/UPDATE/DELETE (agency + owner/manager/finance).
  - Ensures storage bucket `expenses` exists and recreates storage policies for read/upload/delete.

**SQL to run manually (if you prefer not to use the migration file):**  
Run the contents of **`supabase/migrations/20260205000000_finance_expenses_ensure_schema_rls.sql`** in the Supabase SQL Editor. That file is idempotent (safe to run more than once).

---

## 2. Logic (FinanceContext & page)

- **Scan → Extract → Save → immediate UI**
  - Upload triggers extraction (Vision then OCR fallback); then for each file the app calls **`addExpenseFromOcr`**.
  - **No review step**: each expense is uploaded to Storage, inserted into `finance_expenses`, and appended to context state so “הוצאות אחרונות” updates immediately.
- **`addExpenseFromOcr`** (in `FinanceContext.tsx`):
  - Uploads file to bucket `expenses` at `{agencyId}/{reviewId}/{filename}`.
  - Inserts a row with extracted fields (`vendor`, `supplier_name`, `amount`, `expense_date`, `vat`, etc.).
  - On success: maps the inserted row to an expense item and does **`setExpensesState(prev => [newItem, ...prev])`** so the list updates without refresh.
- **Insert errors** are mapped to **`ExpenseUploadError`** with codes:
  - **`INSERT_FORBIDDEN`** (403/policy) → “שמירת רשומה נחסמה (הרשאות)…”
  - **`INSERT_SCHEMA`** (missing column / schema) → “שגיאת טבלה… הרץ את מיגרציית finance_expenses…”
  - **`INSERT_FAILED`** → generic save error
- **Load errors** in production: **`expensesLoadError`** is set when `loadExpenses` fails (e.g. not authenticated, DB error). The Finance page shows this message and a “נסה שוב” (retry) button.

---

## 3. Supabase & storage

- **Upload:** Files go to the **`expenses`** bucket, path **`{agencyId}/{expenseId}/{safeFilename}`**.
- **RLS (table):**  
  - SELECT: user’s agency.  
  - INSERT/UPDATE/DELETE: user in same agency and role in `('owner','manager','finance')`.
- **Storage RLS:**  
  - Read: bucket `expenses`, path prefix = user’s `agency_id`.  
  - Insert/Delete: same path check and role in `('owner','manager','finance')`.
- The migration file above creates the bucket (if missing) and (re)creates these policies.

---

## 4. Edge Function & OCR

- **`extract-invoice-vision`** (Supabase Edge Function):
  - Expects **`ANTHROPIC_API_KEY`** in secrets; returns 503 if missing.
  - Accepts POST body `{ imageBase64, mimeType }`, calls Claude Vision, returns `{ supplier_name?, amount?, vat?, expense_date?, vendor_id? }` or `{ error, hint }`.
  - Errors are logged server-side; client gets structured error.
- **Client** (`invoiceExtraction.ts`):
  - For images: tries Vision first; on failure or bad response falls back to OCR, then to default (filename as vendor, no amount).
  - **Logging:** Vision failures and timeouts are logged with `[invoiceExtraction]` and file name (and error/code/status when available) so you can see why extraction failed in the console.
- **Upload/save errors** are logged in **`FinanceContext`** as **`[Finance] Storage upload failed`** and **`[Finance] finance_expenses insert failed`** with code/message/details, and surfaced to the user via **`ExpenseUploadError`** and toast messages.

---

## 5. Demo vs production

- **Demo mode** (e.g. `VITE_DEMO_BYPASS=true` or demo login): expenses live in localStorage/IndexedDB; no Supabase.
- **Production** (no demo): all expense load/save/delete go to Supabase. If the user is not authenticated or the DB fails:
  - **Load:** **`expensesLoadError`** is set and shown on the Finance page with “נסה שוב”.
  - **Save:** **`ExpenseUploadError`** with the appropriate code and Hebrew message (forbidden, schema, or generic).

---

## SQL to run in Supabase Dashboard

Run the full contents of:

**`supabase/migrations/20260205000000_finance_expenses_ensure_schema_rls.sql`**

in **Supabase → SQL Editor**. It will:

1. Add missing columns on `finance_expenses` (`expense_date`, `vat`, `supplier_name`).
2. Backfill `supplier_name` from `vendor` where needed.
3. Enable RLS on `finance_expenses`.
4. Drop and recreate RLS policies for `finance_expenses` (read + insert/update/delete for finance roles).
5. Ensure bucket **`expenses`** exists.
6. Drop and recreate storage policies for **`expenses`** (read, insert, delete for agency + finance roles).

No other manual SQL is required for the Finance expense flow if this migration has been applied (or the equivalent from `schema-clean.sql` plus the RLS/storage section above).

# Why Some Finance Expense Issues Can’t Be “Fixed” in Code Alone

## What *was* fixed in the app

1. **Save and show after one upload**  
   On upload (production), the app now:
   - Runs OCR/Vision extraction on the file.
   - Uploads the file to Supabase Storage.
   - Inserts a row into `finance_expenses` with the **extracted** fields (vendor/supplier, amount, date, VAT).
   - Updates global state (FinanceContext) so “הוצאות אחרונות” (Last Expenses) shows the new row **immediately** with the scanned data.

2. **Global state for expenses**  
   `FinanceContext` holds the expenses list and exposes `addExpenseFromOcr`. So the flow is: **OCR result → DB insert → state update → UI update**. No separate “review then save” step required for data to persist and display.

3. **Pushing the OCR object to DB and state**  
   `addExpenseFromOcr` takes the extracted object (supplier_name, amount, expense_date, vat) and:
   - Writes it into the `finance_expenses` row (vendor, amount, etc.).
   - Appends the new row to context state so the list reflects it right away.

So the **intended flow** (scan → save → display) is implemented in code. If it still doesn’t work on your side, the cause is usually **outside** the Finance page logic.

---

## Why expense problems can still happen (and can’t all be “fixed” in the app)

### 1. **Extraction quality (OCR / Vision)**

- **Vision (Claude)** runs only when the **Edge Function `extract-invoice-vision` is deployed** and **`ANTHROPIC_API_KEY`** is set in Supabase. If not, the app falls back to the built-in OCR.
- Built-in OCR is simpler and often **fails or returns wrong/empty** data for:
  - Hebrew/RTL text
  - Complex layouts (tables, multi-column, handwritten)
  - Some PDFs (e.g. scanned images inside PDF)
- So “scan the file and show the content” **depends on extraction**. The app **can’t fix** bad or empty extraction; that would need better models, different services, or manual correction in the UI (which already exists: you can edit vendor/amount in Last Expenses).

**What you can do:** Deploy the Vision Edge Function and set `ANTHROPIC_API_KEY` (see `docs/INTEGRATION_AUDIT_AND_OCR_EVALUATION.md`). For difficult documents, expect to correct vendor/amount manually after upload.

---

### 2. **Supabase / backend configuration**

Saving and displaying expenses in production depends on:

- **Table `finance_expenses`**  
  Must have columns such as: `id`, `agency_id`, `filename`, `filetype`, `size`, `storage_path`, `vendor`, `supplier_name`, `amount`, `expense_date`, `vat`, `notes`, `morning_status`, `created_at`, `updated_at`, `uploaded_by`. If a column is missing or named differently, **inserts can fail** or not show correctly.
- **Storage bucket `expenses`**  
  Must exist and allow uploads (and optionally deletes) for the signed-in user’s agency. If the bucket or RLS is wrong, **file upload fails** and the whole “save after upload” flow breaks.
- **Row Level Security (RLS)**  
  Policies must allow:
  - **INSERT** for the current user’s `agency_id`
  - **SELECT** for the same agency
  - **UPDATE/DELETE** as needed for editing/deleting expenses  

If RLS blocks the insert or select, the app will get errors and **won’t be able to “fix” that** from the frontend; it’s a backend/DB configuration issue.

**What you can do:** In Supabase: check table schema, Storage bucket, and RLS policies for `finance_expenses` and `expenses`. Use the browser Network tab and Supabase logs to see failed requests (e.g. 403, 500).

---

### 3. **Demo vs production mode**

- **Demo mode** uses **localStorage** (and IndexedDB for file blobs). Nothing is written to Supabase. So in demo you will **never** see “saved to DB and displayed from DB”; you only see in-memory + localStorage state.
- **Production** uses **Supabase** (Storage + `finance_expenses`). If you test in production but Supabase isn’t configured (or you’re not logged in with a real user), inserts or loads can fail and the list may stay empty or not update.

The app code is correct for **each** mode; the “problem” is which mode you’re in and whether the backend for that mode is set up.

**What you can do:** For “save and display in DB”, use production (real Supabase + real login) and ensure the project is configured as above.

---

### 4. **File type, size, and timeouts**

- **Vision** is only used for **image** MIME types (e.g. jpeg, png). For PDFs, the app uses the built-in OCR (or, if you add it, a PDF→image path). So for “scan and show content”, **non-image PDFs** may get poor or no extraction.
- Large files or slow networks can hit the **60s timeout** for the Vision call; then the app falls back to OCR or a default (e.g. filename as vendor, no amount). The app **can’t fix** server or network slowness from the frontend.

**What you can do:** Prefer clear, readable images or PDFs; keep file size reasonable; check Network tab for timeouts or failed requests to the Edge Function.

---

### 5. **Errors not obvious in the UI**

- When an **insert** or **storage upload** fails, the app shows a generic error (e.g. “שגיאה בשמירה” or “העלאת קבצים נכשלה”). The **underlying** reason (e.g. “permission denied”, “column X does not exist”, “bucket not found”) is in:
  - Browser **Console**
  - **Network** tab (failed request and response body)
  - **Supabase** dashboard (logs, Storage, Table errors)

So “expenses still don’t work” can be a **backend or config** failure that the UI doesn’t describe in detail. The app **can’t fix** what it doesn’t control (DB, RLS, Storage, env vars).

**What you can do:** Reproduce the flow (e.g. upload one expense), then check Console + Network + Supabase logs and fix the reported error (schema, RLS, bucket, keys).

---

## Summary

| What | Can the app “fix” it? |
|------|------------------------|
| Flow: upload → extract → save to DB → show in Last Expenses | ✅ Yes – this is implemented (FinanceContext + addExpenseFromOcr). |
| Empty or wrong vendor/amount from extraction | ❌ No – depends on OCR/Vision quality and deployment (e.g. Vision Edge Function + API key). |
| Insert or storage upload fails (e.g. 403, 500) | ❌ No – depends on Supabase schema, Storage bucket, RLS, and env. |
| Wrong mode (demo vs production) or unconfigured backend | ❌ No – depends on how you run the app and configure Supabase. |
| Timeouts or unsupported file types | ❌ No – infrastructure/limits; we can only fall back or show an error. |

So: **the Finance page logic for expenses (save + display after upload, global state, pushing OCR to DB and state) is in place.** What often remains “broken” in practice is **extraction quality**, **Supabase/backend setup**, or **environment** (demo vs prod, missing keys, RLS). Those can’t be fixed only by changing the Finance page code; they need configuration, deployment, and sometimes better extraction services or manual correction in the UI.

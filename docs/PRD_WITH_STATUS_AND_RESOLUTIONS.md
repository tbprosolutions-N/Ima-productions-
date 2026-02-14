# NPC — Product Requirements Document (PRD) with Status & Technical Resolutions

This document lists product features with a **Status** column and **technical issues encountered and how they were resolved**. It is the single source of truth for delivery readiness on the **real (production) site**.

---

## Test site (real app only)

**Live app URL for testing:**  
**[https://npc-am.com](https://npc-am.com)**

All testing and validation should be done on this URL. Demo mode (local only) is for development; production behaviour is verified on the link above.

---

## 1. Authentication & user lifecycle


| Feature                   | Status        | Notes                                                                                                               |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| Email + password login    | ✅ Implemented | Supabase Auth; works in production when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Netlify.        |
| Magic link / invite email | ✅ Implemented | See **Email & invite** section below. Works when configured; no artificial blocking.                                |
| Session persistence       | ✅ Implemented | `localStorage` + double retry and `ensure_user_profile` RPC when profile missing.                                   |
| Redirect after magic link | ✅ Implemented | Frontend sends `redirectTo: window.location.origin + '/login'`; Supabase Redirect URLs must include production URL. |


### Technical issue: Magic link “Invalid or expired” after click

- **Cause:** Production app URL was not in Supabase Auth → URL Configuration → **Redirect URLs**.
- **Resolution:** Add exactly `https://npc-am.com` (and optionally `https://npc-am.com/login`) to Redirect URLs. No code change; configuration only. Documented in `docs/PRODUCTION_LOGIN_MAGIC_LINK.md` and `docs/CLIENT_DEMO_CHECKLIST.md`.

### Technical issue: Invite email “should work; no reason it shouldn’t”

- **Requirement:** Sending an email to log in (magic link) or inviting a new user must work in normal use. The only acceptable reason for failure is **abuse** (e.g. sending on the order of 1000 emails per minute).
- **Resolution:** There is **no rate limit** in the `invite-user` Edge Function. Normal invite and magic-link flows are not throttled. If rate limiting is added in the future, it must apply only at abuse level (e.g. ≥1000 invites per minute per agency), so normal usage is never blocked. See `docs/QA_REPORT_AND_TASKS.md` (P3-2) for this policy.

---

## 2. Finance — Expense feature


| Feature                             | Status        | Notes                                                                                                |
| ----------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| Expense upload (production)         | ✅ Implemented | File → Supabase Storage bucket `expenses` → row in `finance_expenses`; OCR/extraction optional.      |
| Expense list & load                 | ✅ Implemented | `FinanceContext.loadExpenses()` from `finance_expenses`; load error shown in UI with “נסה שוב”.      |
| User-visible upload errors          | ✅ Implemented | Storage 403 → Hebrew message (RLS/bucket); Insert 403 → permissions; Insert schema → migration hint. |
| File manager (filter, view, delete) | ✅ Implemented | Filter by name/period; view/download; delete from Storage + DB.                                      |
| Period summary & reports            | ✅ Implemented | Uses real expenses; cash flow and period totals.                                                     |
| Sync to Morning                     | ✅ Implemented | Production sync job; status in UI.                                                                   |


### Technical issue: Expense upload “can fail silently”

- **Cause:** If Storage RLS or `finance_expenses` RLS blocked the request, the UI could show a generic error or no clear message.
- **Resolution:**  
  - **FinanceContext.addExpenseFromOcr:** Storage errors are mapped to `ExpenseUploadError` with `STORAGE_FORBIDDEN` or `STORAGE_FAILED`; insert errors to `INSERT_FORBIDDEN`, `INSERT_SCHEMA`, or `INSERT_FAILED`.  
  - **FinancePage.addFiles:** Catches `ExpenseUploadError` and shows a **user-visible Hebrew message** for each code (e.g. “העלאת קובץ נחסמה (403) — בדוק הרשאות Storage ו־RLS על bucket expenses”, “שגיאת טבלה … הרץ את מיגרציית finance_expenses ב־Supabase”).  
  - **FinancePage.saveReviewAndUpload:** Uses the same Supabase calls; on failure throws and `showError(e?.message)` shows the server error.  
  - **Load errors:** `expensesLoadError` is set when `loadExpenses` fails (e.g. PGRST301 / not authenticated); the Finance page displays it with a “נסה שוב” button.  
  So the only reasons upload or load can “fail” in production are: (1) misconfiguration (RLS, bucket policy, or missing `finance_expenses` migration), (2) network/server error, or (3) user not allowed (role). In all cases the user now sees a clear message; there is no silent failure.

### Configuration required for expense upload

- Supabase Storage: bucket `expenses` with RLS allowing authenticated users (or agency-scoped) to INSERT/SELECT/DELETE.
- Table `finance_expenses` created and RLS allowing INSERT/SELECT/UPDATE/DELETE for the user’s `agency_id`.
- No rate limit on expense upload; normal usage is not throttled.

---

## 3. Email & invite (detailed)


| Feature                                    | Status        | Notes                                                                                                                                     |
| ------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Invite new user (Settings → ניהול משתמשים) | ✅ Implemented | Calls `invite-user` Edge Function with `agencyId`, `email`, `full_name`, `role`, `redirectTo: origin + '/login'`.                         |
| Send magic link via Gmail                  | ✅ Implemented | When Google is connected with Gmail scope, invite-user uses Gmail API to send the invite email.                                           |
| Send magic link via Supabase mailer        | ✅ Implemented | When Gmail is not used, `inviteUserByEmail` or createUser + generateLink; Supabase sends email if SMTP is configured.                     |
| Fallback: copy link                        | ✅ Implemented | If sending fails, response includes `magic_link`; UI shows “העתק” so admin can send the link manually.                                    |
| Rate limiting                              | ✅ Not applied | No rate limit in invite-user. Email/invite is designed to work for normal use; only extreme abuse (e.g. 1000/min) would warrant limiting. |


### Technical issue: “No reason it shouldn’t work”

- **Requirement:** Login-by-email (magic link) and new-user invite must work when the environment is correctly set up. Failures should only be due to misconfiguration or abuse (e.g. 1000 emails per minute).
- **Resolution:**  
  - **No blocking rate limit:** The `invite-user` Edge Function does not implement any per-minute or per-hour cap. Normal invite and magic-link traffic is not throttled.  
  - **Docs:** QA report (P3-2) updated to state that any future rate limit must apply only at abuse level (e.g. 1000/min), so normal use always works.  
  - **Configuration checklist:** Redirect URLs, `SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and either Gmail (OAuth) or Supabase SMTP are documented; when these are set, invite and magic link work.

---

## 4. Other features (summary)


| Feature                         | Status        | Notes                                                             |
| ------------------------------- | ------------- | ----------------------------------------------------------------- |
| Dashboard KPIs                  | ✅ Implemented | Production: Supabase + finance_expenses.                          |
| Events / Artists / Clients CRUD | ✅ Implemented | Production: Supabase; RLS by agency_id.                           |
| Calendar                        | ✅ Implemented | FullCalendar; production data.                                    |
| Documents, Settings, Backup     | ✅ Implemented | Production paths implemented.                                     |
| Integrations (Google, Morning)  | ✅ Implemented | OAuth + integration_tokens; Gmail used for invite when connected. |
| Theme (black & white)           | ✅ Implemented | Default palette `bw`; NPC rebrand applied.                        |


---

## 5. Status legend

- **✅ Implemented** — Feature is implemented and works on the **real site** when the required env and Supabase configuration are in place.
- **⚠️ Config required** — Same as above but explicitly called out in this PRD (e.g. Redirect URLs, Storage RLS, invite-user secrets).

---

## 6. Quick reference

- **Real site for tests:** [https://npc-am.com](https://npc-am.com)  
- **Redirect URLs:** Must include `https://npc-am.com` (and optionally `/login`) in Supabase Auth.  
- **Invite/email:** Works when `invite-user` is deployed, secrets are set (including `SITE_URL` and Gmail or SMTP), and Redirect URLs are correct. No rate limit for normal use.  
- **Finance expense:** Upload and load show clear errors when Storage or `finance_expenses` RLS/schema is misconfigured; no silent failure.


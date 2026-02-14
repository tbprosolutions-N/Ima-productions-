# IMA OS — E2E QA Runbook (2026)

This runbook is designed to validate **end-to-end functionality** of the system (frontend + Supabase + storage + RLS) with a focus on **no-freeze / no-blank-screen** behavior and data integrity.

## E2E Login (demo vs real) — fixed 2026-02

- **Demo (dev only)**  
  1. Open `http://localhost:3001/login`.  
  2. Either click **"כניסה בדמו (ללא Supabase)"** or enter email `modu.general@gmail.com`, company **IMA001**, any password, then **התחבר**.  
  3. You should land on the dashboard; agency is DEMO_AGENCY, no Supabase calls.

- **Real (Supabase)**  
  1. In `.env`: set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon key is a long JWT from Dashboard → Settings → API).  
  2. In Supabase SQL Editor: run `supabase/ensure_user_profile.sql`.  
  3. Login with real email/password + company code; session + profile must succeed.

## Pre-flight

- **App running**: `http://localhost:3001/`
- **Health page (dev only)**: `http://localhost:3001/health`
- **Supabase**:
  - `supabase/schema-clean.sql` executed
  - Storage bucket `expenses` exists (private)
  - RPC `ensure_user_profile(company_code)` exists (included in schema)

## Automated smoke (recommended first)

Open `http://localhost:3001/health` → click **Run all checks**.

Expected:
- PASS for env + session
- If logged in: PASS for profile/agencies/CRUD
- Finance/storage checks depend on role + bucket/policies

Copy the report and keep it with release notes.

## Manual E2E scenarios (deep QA)

### Authentication & onboarding
- **Login** with valid email/password + company code.
- **Returning user**: no tutorial should auto-run again.
- **Logout/login** cycle: must not get stuck on an infinite loader.

### RBAC / permissions
Test with roles: `owner`, `manager`, `finance`, `producer`.

- **Owner-only**:
  - Edit `status` on events (pending/approved/declined/paid mapping)
  - Edit sensitive financial fields (amount/payment date/doc fields)
  - Integrations connect/disconnect
  - User management screens/actions
- **Non-owner**: those actions must be blocked in UI and enforced by DB.

### Dashboard
- KPIs render without delay and update after:
  - creating an event
  - uploading an expense
- Event table loads, filters work, exports require report type selection.
- “Last activity” updates (server audit logs in production / local in demo).

### Events (core workflow)
- Create event (required fields)
- Inline edit in table:
  - amount (owner/manager)
  - payment date (owner/manager)
  - status (owner only)
- Verify edits persist after refresh and respect RLS.

### Artists / Clients
- CRUD operations (create/edit/delete)
- Profile “folder” view:
  - events linked to artist/client appear
  - date filtering works
  - report export works

### Finance
- Upload an expense file:
  - metadata saved to `finance_expenses`
  - file saved to Storage bucket `expenses`
- Verify:
  - “Recent expenses” shows uploaded rows
  - view/download works
  - delete deletes only selected items (no mass delete bug)
- Period report / report generator:
  - “Display” required before download
  - export formats (Excel/CSV)

### Calendar / Daybook
- Events appear on calendar
- Artist color legend is visible in dark mode

### Documents
- Templates exist and can be created/edited
- “Send” validates email presence and shows reason if missing

## Regression checklist (no-crash policy)

- Hard refresh on every page: no blank screens
- Navigate rapidly: no broken buttons
- Dark mode: inputs/borders visible
- Large dialogs/forms: scroll works (no overflow)

---

## Tasks split for deep QA (2026-02)

### Done this pass
1. **Login loader / latency** – Timeouts reduced (login 10s→5s, Auth init 10s→6s, getSession 8s→4s). Loader still shows until profile is ready; if `ensure_user_profile` is missing in DB, Login page shows SQL fix and copy button.
2. **Expense-add → logout** – Auth no longer clears user on transient profile fetch failure; only clears when session is actually null. `onAuthStateChange(session=null)` does one quick `getSession()` retry before clearing.
3. **Checklist in interface** – Settings → tab **"רשימת אישורים"** shows the 10 approval items from SYSTEM_APPROVALS_CHECKLIST; checkboxes persist per agency in localStorage.
4. **Finance bulk delete** – Only rows with checkbox checked are deleted; `selectedExpenseIds` filtered to `true` for both count and delete.

### Remaining tasks (split for QA)
| # | Area | Task | Priority |
|---|------|------|----------|
| 1 | Auth/DB | Run `supabase/ensure_user_profile.sql` (or schema-clean.sql) in Supabase SQL Editor if login fails with "Could not find function ensure_user_profile". | P0 |
| 2 | Finance | Verify expense upload → Storage + `finance_expenses` row; View/Download buttons; bulk delete only selected. | P0 |
| 3 | Events | "Create New Event" flow completes and persists. | P0 |
| 4 | UI | Dark mode: ensure inputs/borders/calendar captions visible. | P1 |
| 5 | Documents | "Send" button: show reason if missing email / cannot send. | P1 |
| 6 | Settings | Logo upload: fix button and display. | P1 |
| 7 | Integrations | Morning API: two keys in settings; wire expenses to Morning. | P2 |
| 8 | Profiles | Artist/Client forms: add account details (ID, bank, branch, company). | P2 |
| 9 | Activity | Last activity window: show logs (user, time, action); filter (today/30d); scroll. | P2 |
| 10 | Permissions | Permission checkboxes in Settings; "Send connection link" in user management. | P2 |
| 11 | Reports | "Report by filters" → "Custom report"; more options; block export when no type selected. | P2 |
| 12 | Tutorial | Auto-off for returning users. | P2 |
| 13 | Branding | Company name from settings in header/sidebar; adapt to screen size. | P2 |
| 14 | Calendar | Google Calendar sync; artist colors; caption visibility. | P2 |
| 15 | Payments | Artist payments on artist profile edit; option on event. | P2 |
| 16 | Event form | Remove duplicate Business Name; Maturity→Payment Date; doc types; status visible; autocomplete. | P2 |
| 17 | UI | Gradients per palette; full responsiveness. | P2 |


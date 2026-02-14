# QA Tasks & Deep Test Plan

## Build & Lint (automated)

| Task | Command | Purpose |
|------|---------|---------|
| TypeScript + build | `npm run build` | Catches undefined refs, wrong types, unused vars |
| Lint | `npm run lint` | ESLint rules |
| E2E route traverse | `npm run test:e2e` | Login + visit /dashboard, /events, /finance, /calendar, /settings, /health (no console/error) |

## Fixes applied (this pass)

- **Settings:** Removed leftover `setLogo` / `setLogoMeta` calls from `useEffect` (logo upload was removed). Removed unused imports: `clearAgencyLogo`, `getAgencyLogo`, `getAgencyLogoMeta`, `setAgencyLogo`, `StoredLogo`, `useRef`, `Trash2`.
- **Finance:** Moved “Period Summary sync” `useEffect` to run *after* `loadExpensesIntoState` is defined (fixes “used before declaration”). Replaced `.finally()` with `.then(..., ...)` for compatibility. Removed unused `nowIso`. 
- **Dashboard:** Removed unused `occurredPaidSum` / `occurredPaid` (card was replaced with “אירועים החודש”).

---

## Task list (split for QA)

### 1. Critical path – no runtime errors

- [ ] **Login** – Demo and production login; no `ReferenceError` or blank screen.
- [ ] **Settings** – Open `/settings`; all tabs (General, Users, Integrations, Backup, Checklist) render; no `setLogo` or logo-related errors.
- [ ] **Finance** – Open `/finance`; load expenses list; open Period Summary; upload file (review flow); save expense. No “used before declaration” or Promise errors.
- [ ] **Dashboard** – Open `/dashboard`; KPIs and insights render; “אירועים החודש” card shows count; date filter and report builder open.

### 2. Invoice extraction & Vision

- [ ] **OCR fallback** – With no Vision (or 503): image/PDF upload still fills review with filename/OCR data.
- [ ] **Vision path** – With `ANTHROPIC_API_KEY` set: image upload returns extracted supplier/amount/date in review.
- [ ] **Error handling** – Large image, timeout, or malformed response does not crash; fallback to OCR or default row.

### 3. Integrations

- [ ] **Google Calendar** – Connect OAuth; create/update event; sync to calendar; webhook/calendar_pull (if enabled).
- [ ] **Gmail** – Invite user / Send Link when Google connected; email sent via Gmail API or Supabase fallback.
- [ ] **Morning** – Credentials saved; event/expense sync runs without crash.

### 4. Security & account

- [ ] **2FA** – Settings → Security: list factors, enroll TOTP (QR + code), verify; unenroll.
- [ ] **Logout** – Sign out clears session and redirects to `/login`.

### 5. UI consistency

- [ ] **Calendar** – List and month view; date filter; artist colors from profile; no layout overflow.
- [ ] **Dashboard** – Date filter labels; artist-overlap alert when same-date events; insights rotate.
- [ ] **RTL** – Hebrew and RTL layout correct on all main pages.

### 6. Regression checks

- [ ] **Events** – Create/edit event; status not manually set on create; sync to Morning/Calendar.
- [ ] **Artists / Clients** – CRUD; artist color saved and shown on calendar.
- [ ] **Documents** – Template and send flow (if used).

---

## How to run deep QA

1. **Build**  
   `npm run build`  
   Must succeed (no TS or build errors).

2. **E2E (route traverse)**  
   `npm run test:e2e`  
   Uses Playwright; starts preview server and hits core routes. Ensures no uncaught errors or blank screens.

3. **Manual**  
   - Open `http://localhost:3001` (or preview port).  
   - Log in (demo or prod).  
   - Go through the task list above (Settings, Finance, Dashboard, Calendar, etc.).

4. **Console**  
   Keep DevTools console open; fix any red errors or warnings that appear on key flows.

---

## Quick reference – files touched recently

- `src/pages/SettingsPage.tsx` – Logo code and unused imports removed.
- `src/pages/FinancePage.tsx` – Period Summary effect order, Promise.finally, unused var; extractInvoiceData + processFile fallback.
- `src/pages/DashboardPage.tsx` – “אירועים החודש” card; overlap alert; removed occurredPaidSum.
- `src/services/invoiceExtraction.ts` – Vision + OCR fallback; timeout; never throw.
- `supabase/functions/extract-invoice-vision/index.ts` – Error handling; image size limit; safe JSON parse.

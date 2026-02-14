# App run verification

## Automated checks (all passing)

- **Build**: `npm run build` completes successfully (TypeScript + Vite).
- **E2E tests** (Playwright, demo bypass on port 4173):
  1. **Login** – Demo login reaches dashboard.
  2. **Route traverse** – All core routes load without crash: dashboard, events, artists, clients, finance, calendar, documents, settings, health.
  3. **Dashboard** – "צור אירוע חדש" opens the event dialog; "ביטול" closes it (tour "דלג" is dismissed when present).
  4. **Finance** – Page loads; "ייצא דוח חודשי" opens the period report dialog.
  5. **Events & Settings** – Events page and Settings page load and show expected content.

## How to run the app locally

1. **Dev server** (default port 3001):
   ```bash
   npm run dev
   ```
   If port 3001 is in use, stop the other process or open http://localhost:3001 if the app is already running.

2. **E2E tests** (start their own server on 4173):
   ```bash
   npx playwright test
   ```

3. **Production build + preview**:
   ```bash
   npm run build
   npm run preview
   ```

## Manual smoke checklist (recommended)

Use this when you run the app manually to confirm main flows:

- **Login** – Company ID + email + password (or demo bypass) and reach dashboard.
- **Dashboard** – KPIs load; "צור אירוע חדש" opens dialog; status is display-only; table shows events; "מחולל דוחות" / "ייצוא דוח" work.
- **Events** – Table loads; status is display-only; filters and export work; create/edit event if available.
- **Finance** – Period summary and date range; "ייצא דוח חודשי" opens modal; to-do list progress bar and checklist toggle; cash flow graph when period has data; upload expense file (OCR → save → show in "הוצאות אחרונות").
- **Calendar** – Month navigation; list/calendar view; event colors (artist profile sync).
- **Artists / Clients** – List and basic CRUD or view.
- **Settings** – Branding card (company name + save); notifications toggles; 2FA if enabled.
- **Sign out** – Logout and redirect.

## Known constraints

- **Demo mode**: Uses `VITE_DEMO_BYPASS=true` for E2E; no real Supabase auth.
- **Port 3001**: Vite is set to `strictPort: true`; only one dev server at a time.
- **Finance upload**: In production, expense OCR and save depend on Supabase Storage + `finance_expenses` and (optionally) the `extract-invoice-vision` Edge Function with `ANTHROPIC_API_KEY` for Vision extraction.

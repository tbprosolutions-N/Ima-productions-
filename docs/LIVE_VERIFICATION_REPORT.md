# Live Verification Report

## Prerequisites

- App running **without** demo bypass: `npm run dev` (no `VITE_DEMO_BYPASS`)
- Real Supabase, Google Sheets, and Morning API configured
- Logged in with valid credentials

## Run Live Test

```bash
# Terminal 1: Start app (no demo bypass)
npm run dev

# Terminal 2: Run Playwright live verification
# Windows:
set LIVE_VERIFICATION=1 && npx playwright test tests/e2e/live-verification.spec.ts --project=live

# Unix/macOS:
LIVE_VERIFICATION=1 npx playwright test tests/e2e/live-verification.spec.ts --project=live
```

## Metrics to Capture

| Metric | Target | Actual |
|--------|--------|--------|
| Save → "Saved to Database" Toast | <400ms | ___ ms |
| Background Sheets sync duration | Logged as `[perf] SheetsSync: background:done` | ___ ms |
| Toast portal z-index | 9999 | ___ |
| Sync icon updates without refresh | Yes | ___ |

## Checklist

- [ ] Toast "Saved to Database" appears within 400ms of clicking Save
- [ ] Toast portal renders at z-index 9999 over screen
- [ ] `[perf] SheetsSync: background:start` and `background:done` appear in console
- [ ] Morning sync status icon updates (e.g. not_synced → synced) without page refresh
- [ ] Event `LIVE_TEST_VERIFICATION` visible in events table

## Cleanup

After confirming sync in Google Sheets and Morning:

```sql
-- Run in Supabase SQL Editor
-- See scripts/cleanup-live-test-event.sql
DELETE FROM events WHERE business_name = 'LIVE_TEST_VERIFICATION';
```

## Live Status (fill after run)

- **Date**: ___
- **Result**: PASS / FAIL
- **Notes**: ___

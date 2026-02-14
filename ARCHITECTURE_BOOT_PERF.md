# IMA OS — “Fast Boot” Architecture (fix slow refresh forever)

## What’s causing the slow “loading” and broken refresh

### 1) `supabase.auth.getUser()` is a network call
On many Windows setups (VPN / firewall / flaky DNS), `getUser()` can take a long time or hang.  
In the old flow, the app **blocked the entire UI** behind a global spinner waiting for `getUser()`.

### 2) Boot was doing too much before rendering anything useful
- `App.tsx` imported *every page* up-front → huge JS parse/execute at first load.
- `AgencyContext` fetched **all agencies** even though the schema is effectively **one agency per user** (`users.agency_id`).

### 3) When something fails, the UI didn’t show *which step* failed
Users experienced “loading… nothing happens” instead of “Supabase session not available” / “profile row missing” / “RLS blocked”.

## The architecture that fixes this “one and for all”

### A) Two-phase auth boot (fast-first, strict-later)
**Phase 1 (instant, local)**: use `supabase.auth.getSession()` → reads local session without network.  
**Phase 2 (background validation)**: optionally call `getUser()` later if you need strict verification.

Result: **refresh becomes instant** even on bad networks.

### B) Progressive loading: render shell first, lazy-load heavy pages
Use **route-based code splitting** (`React.lazy` + `Suspense`) so initial JS is small.

Result: time-to-interactive improves, and refresh no longer parses the entire app before showing UI.

### C) Minimal data boot
Fetch only what is needed:
- Fetch **only the current agency** by `users.agency_id`, not every agency.
- Fetch profile (`public.users`) with timeouts + auto-provision via RPC.

### D) Hard timeouts + diagnostics instead of infinite spinners
Every boot-critical call has:
- a timeout
- a watchdog that ends global loading
- a dev-only **/health** page that runs E2E checks and prints the exact failing layer.

## What I implemented now
- `getSessionUserFast()` in `src/lib/supabase.ts` (fast, no network)
- Auth boot switched from `getUser()` → `getSession()` (fast refresh)
- Agency fetch reduced to single row (`eq('id', user.agency_id)`)
- Route-based lazy loading for all pages (big performance win)
- Dev-only E2E runner: `/health` (env/session/profile/RLS/CRUD/finance/storage)

## How to run an E2E user flow right now (expert QA)

1. Open `http://localhost:3001/health`
2. Click **Run all checks**
3. If any FAIL, copy report and fix that layer before continuing.

Then do manual flow:
- Login → Dashboard loads
- Create Artist + Client
- Create Event (link artist/client)
- Edit event inline (owner-only fields)
- Upload expense and confirm it appears in “Recent expenses”
- Export a report (must click “Display” first)


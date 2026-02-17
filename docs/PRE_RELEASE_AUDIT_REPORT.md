# Pre-Release Audit & Upgrade Report  
## NPC Management System — Tier-1 SaaS Readiness

**Audit Date:** Pre-handover live trial  
**Scope:** Full codebase — React (components, contexts, hooks), Netlify functions, routing, Supabase integrations.

---

## 1. Executive Summary

**Overall health: 🟠 GOOD with targeted fixes required**

The NPC Management System is structurally sound: Error Boundary at root, auth initialization with session race fix, React Query caching for Events/Artists/Clients, role-based routing (Owner vs Member), and Hebrew RTL + loading/empty states on core pages. Critical gaps to address before handover:

- **No route-level Error Boundaries** — a single component throw can white-screen the app.
- **Silent catch in `sheetsSyncClient.ts`** (line 28) swallows errors; client-side Sheets sync can fail without user feedback.
- **Finance page** does not surface `expensesLoadError` consistently in the UI in all views; some mutation paths lack explicit error toasts.
- **Dashboard** uses raw `supabase.from().select()` with `.limit(500)` and no React Query — inconsistent with rest of app and no cache invalidation story.
- **PWA**: Service worker registration failure is silently ignored; no offline fallback UI.
- **Env vars**: Netlify/server secrets (e.g. `GOOGLE_SA_PRIVATE_KEY`) are not exposed to client; `EnvCheck` only validates `VITE_SUPABASE_*` — good. No hardcoded secrets found in client code.

**Recommendation:** Implement the Upgrade Action Plan below (prioritized) before client handover. Estimated effort: 1–2 days for P0/P1 items.

---

## 2. Deep Dive Findings (5 Pillars)

### Pillar 1: Functional & Flow (CRUD, edge cases, routing)

| Finding | Status | Location / detail |
|--------|--------|-------------------|
| Events CRUD | 🟢 PASS | `EventsPage.tsx`: insert/update/delete use Supabase with `error` checked and `throw`; `success()` / `showError()` toasts; `currentAgency` guarded before mutations (e.g. lines 281, 765, 835, 867, 971). Invalidation via `useInvalidateEvents(currentAgency?.id)` after save. |
| Artists CRUD | 🟢 PASS | `ArtistsPage.tsx`: update/insert/delete with error handling; `if (!currentAgency) return` before delete (lines 96, 150). Empty state: "אין נתונים להצגה" / "הוסף אמן ראשון" (lines 204–217). |
| Clients CRUD | 🟢 PASS | `ClientsPage.tsx`: update/insert with validation (email regex), `showError` on failure; `useClientsQuery(currentAgency?.id)` with default `[]`. |
| Events form partial submit | 🟠 WARNING | `EventsPage.tsx`: `eventData` builds from `formData`; optional fields (e.g. `client_id`, `artist_id`) can be null — OK. No client-side "required field" block for minimal record (e.g. date + business_name); DB/RLS may reject. Consider explicit validation and toast before submit. |
| Dashboard quick event | 🟢 PASS | `DashboardPage.tsx`: creates client/artist by name if not found, then `supabase.from('events').insert(payload)`; errors thrown and surface via catch. |
| Routing behavior | 🟢 PASS | `App.tsx`: `PrivateRoute` shows `PageLoader` when `loading`, redirects to `/login` only when `!user` and `!loading`. Settings/Finance gated by `effectiveRole === 'owner'`. No orphan routes found. |
| Documents CRUD | 🟢 PASS | `DocumentsPage.tsx`: insert/update/delete with `if (error) throw error` and `showError(err?.message || '...')` in catch (lines 145–146, 165–166). |
| Finance expenses load | 🟢 PASS | `FinanceContext.tsx`: `loadExpenses` sets `expensesLoadError` on Supabase error or exception (lines 92–94, 119–122); typed `ExpenseUploadError` for upload/insert failures. |

---

### Pillar 2: Sync & Integrations (Drive, Sheets, Calendar, persistence, recovery)

| Finding | Status | Location / detail |
|--------|--------|-------------------|
| Google Drive backup (Netlify) | 🟢 PASS | `netlify/functions/sheets-sync-api.ts`: create spreadsheet → move to folder; move failure throws and returns 502 with message (no silent swallow). Handler wrapped in try/catch; all errors return JSON with `error`/`detail`. Env: `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`. |
| Sheets sync client (browser) | 🔴 FAIL | `src/services/sheetsSyncClient.ts` line 28: `} catch {}` — empty catch swallows errors; user gets no feedback when client-side Sheets sync fails. `checkAndTriggerSilentSync` and callers (e.g. `useSilentSheetsSync`) will not show error toasts for non-token failures. |
| Sheets sync service (Netlify) | 🟢 PASS | `src/services/sheetsSyncService.ts`: `sheetsFetch` returns `ok: false` with `error` and `detail`; UI uses `result.detail || result.error` for toasts (SettingsPage). |
| Calendar integration | 🟢 PASS | `src/lib/googleCalendar.ts`: builds Google Calendar URL only (no direct API from client). Events page uses `queueSyncJob` for `calendar_upsert`; actual sync is server/worker. No silent catch in calendar path. |
| Data persistence | 🟢 PASS | Events/Artists/Clients use Supabase + React Query; invalidation after mutations. Finance uses `FinanceContext` + `loadExpenses`; demo uses `demoStore` / `financeStore`. |
| Error recovery | 🟠 WARNING | After Sheets/Drive 502, user sees toast with `detail`; no automatic retry or "Retry" button on the same card. Manual "גיבוי יזום" allows retry — acceptable but could add explicit "נסה שוב" on error. |

---

### Pillar 3: Performance & Latency (React Query, memory, re-renders, lazy load, PWA)

| Finding | Status | Location / detail |
|--------|--------|-------------------|
| React Query usage | 🟢 PASS | `useSupabaseQuery.ts`: `useEventsQuery`, `useArtistsQuery`, `useClientsQuery` with `staleTime: 2*60*1000`, `gcTime: 10*60*1000`, `enabled: !!agencyId`, `refetchOnWindowFocus: false`. `useRole.ts`: same pattern with `placeholderData: user?.role`. |
| Dashboard data fetch | 🟠 WARNING | `DashboardPage.tsx` (lines 60–62): uses raw `supabase.from('events').select('*')...limit(500)` and similar for clients/artists inside `useDashboardStats` — not React Query. No shared cache with `useEventsQuery`/etc.; no invalidation when events change from EventsPage. Risk: stale dashboard until full reload. |
| Memory leaks / re-renders | 🟢 PASS | `AgencyContext`: `fetchAgencies` in `useCallback` with `[user]`; effect deps `[user, fetchAgencies]`. `AuthContext`: `initialCheckDoneRef` used so listener does not clear session before init. No obvious infinite loops in reviewed effects. |
| Lazy loading | 🟢 PASS | `App.tsx`: all main route components lazy-loaded with `Suspense` and `<PageLoader label="טוען…" />` (or page-specific labels). |
| PWA / Service worker | 🟠 WARNING | `src/lib/pwa.ts`: `navigator.serviceWorker.register(...).then(..., () => { /* SW registration failed — non-critical */ })` — failure is silent. No offline fallback UI or "App unavailable offline" message. |
| useSilentSheetsSync deps | 🟢 PASS | Effect deps: `[location.pathname, currentAgency?.id, showToast, showError]` — stable; no loop. |

---

### Pillar 4: UI/UX, Microcopy & Feedback (loading, toasts, errors, empty states, RTL, mobile)

| Finding | Status | Location / detail |
|--------|--------|-------------------|
| Loading states | 🟢 PASS | Events: `loading ? <spinner> + "טוען..."` (lines 1039–1042). Artists: `loading ? <spinner>` (lines 200–202). Clients: same pattern. Dashboard: `loading` from `useDashboardStats` with skeleton/spinner (lines 531, 596). Auth: `PageLoader` until `getSession()` resolved. |
| Success/error toasts | 🟢 PASS | Settings, Events, Artists, Clients, Documents, Finance: use `success()` / `toast.error()` or `showError()` on mutation success/failure. Sheets backup toasts use `result.detail || result.error`. |
| Empty states | 🟢 PASS | ArtistsPage: "אין נתונים להצגה" / "לא נמצאו תוצאות" + CTA "הוסף אמן ראשון". EventsPage: empty table with "טוען..." when loading. ClientsPage: list or empty. Finance: expense list with load error message when `expensesLoadError`. |
| Finance load error UI | 🟠 WARNING | `FinanceContext` sets `expensesLoadError`; `FinancePageContent` receives it. Need to confirm every view that shows expenses also displays `expensesLoadError` (e.g. banner or inline) when non-null — otherwise user may see empty list without explanation. |
| RTL layout | 🟢 PASS | `index.html`: `lang="he" dir="rtl"`. `index.css`: `[dir="rtl"] { direction: rtl; }`. `LocaleContext`: direction from locale. Toast container `dir="rtl"` (ToastContext.tsx line 87). CalendarPage uses `direction="rtl"`. |
| Mobile responsiveness | 🟢 PASS | MainLayout: mobile header, sidebar drawer, `pt-[4.5rem]` for header offset. Tailwind breakpoints used. No obvious non-responsive critical paths. |
| Microcopy tone | 🟢 PASS | Hebrew copy is consistent: "טוען…", "אין נתונים להצגה", "נא להזין…", error messages with actionable wording. |

---

### Pillar 5: Security & Permissions (RBAC, session, env safety)

| Finding | Status | Location / detail |
|--------|--------|-------------------|
| Role-based routing | 🟢 PASS | `App.tsx`: Settings and Finance routes render only when `effectiveRole === 'owner'` (or redirect). Sidebar: `canAccessRoute(item.roles)` hides Finance/Settings for non-owners (`Sidebar.tsx`). |
| Session on refresh | 🟢 PASS | `AuthContext.tsx`: `initialCheckDoneRef` ensures `onAuthStateChange` does not clear user until initial `getSession()` has completed; prevents logout-on-refresh race. |
| Env variable safety | 🟢 PASS | Client only uses `VITE_*` (Supabase URL/anon key). Netlify functions use `process.env.GOOGLE_SA_*`, `SUPABASE_SERVICE_ROLE_KEY` — server-only. No secrets in client bundle. |
| EnvCheck | 🟢 PASS | `EnvCheck.tsx`: validates `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; shows clear config screen if missing or wrong format (JWT). |
| RLS / backend | 🟠 WARNING | Audit did not inspect Supabase RLS policies. Assume policies enforce agency_id and role where required; recommend separate DB/RLS audit before go-live. |

---

## 3. The Upgrade Action Plan (מקצה שיפורים)

### P0 — Critical (before handover)

1. **Fix silent catch in Sheets sync client**  
   - **File:** `src/services/sheetsSyncClient.ts`  
   - **Change:** Replace the empty `catch {}` (around line 28) with logging and optional callback (e.g. `onError?.(error)`) or propagate so `checkAndTriggerSilentSync` can pass failure to `useSilentSheetsSync` and show a non-intrusive error toast (e.g. "גיבוי אוטומטי נכשל — נסה גיבוי יזום בהגדרות").

2. **Add route-level Error Boundaries**  
   - **Files:** `App.tsx`, optionally a new `RouteErrorBoundary.tsx`  
   - **Change:** Wrap each major route (e.g. `<Route path="dashboard" element={<ErrorBoundary><Suspense>...</Suspense></ErrorBoundary>}`) or wrap the `<Outlet />` inside `MainLayout` with one Error Boundary so a single page crash shows the existing ErrorBoundary UI instead of a white screen for the whole app.

### P1 — High (strongly recommended)

3. **Surface Finance load errors everywhere**  
   - **File:** `src/pages/FinancePage.tsx`  
   - **Change:** Ensure `expensesLoadError` is displayed whenever the expenses list is shown (banner or inline message) and that all mutation paths (add/update/delete) show a toast on failure (confirm no path only does `console.error` without toast).

4. **Dashboard data via React Query or invalidation**  
   - **Files:** `src/pages/DashboardPage.tsx`, optionally `src/hooks/useSupabaseQuery.ts`  
   - **Change:** Either (a) use `useEventsQuery`/`useClientsQuery`/`useArtistsQuery` in dashboard (with limit 500 in queryFn if needed) and reuse cache, or (b) keep current fetch but call `queryClient.invalidateQueries(['events', agencyId])` (and clients/artists) when returning to dashboard so data is refreshed after events change.

5. **PWA: surface SW registration failure**  
   - **File:** `src/lib/pwa.ts`  
   - **Change:** In the `.then(..., () => { ... })` reject handler, set a global or context flag (e.g. `window.__PWA_REG_FAILED`) or dispatch a custom event; optionally show a one-time non-blocking toast or small banner: "התקנת האפליקציה לא זמינה בדפדפן זה" so support can diagnose.

### P2 — Polish

6. **Events form: minimal required validation**  
   - **File:** `src/pages/EventsPage.tsx`  
   - **Change:** Before submit, require at least e.g. `event_date` and `business_name`; if missing, `showError('נא למלא תאריך ושם עסק')` and return to avoid generic DB/RLS errors.

7. **Sheets/Drive: retry on error**  
   - **File:** `src/pages/SettingsPage.tsx`  
   - **Change:** When backup fails (toast with `result.detail`), add a small "נסה שוב" button next to the message or in the same card to call the same create/sync again without re-pasting the URL.

8. **RLS / Supabase policies**  
   - **Action:** Separate audit of `supabase/migrations` and RLS policies for `events`, `artists`, `clients`, `finance_expenses`, `integrations`, `users` to ensure agency scoping and role-based access match app assumptions.

---

**End of report.** Implement P0 and P1 for a Tier-1-ready handover; P2 and RLS audit for full polish and security sign-off.

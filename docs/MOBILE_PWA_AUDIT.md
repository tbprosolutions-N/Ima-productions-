# Mobile-First & PWA Audit — NPC

**Goal:** Native app feel on Netlify; ready for APK (Capacitor/Bubblewrap).  
**Account (example):** npcollectivebooking@gmail.com — use for full workflow test.

---

## 1. PWA & App Packaging ✅

| Item | Status |
|------|--------|
| **manifest.json** | `display: standalone`, `orientation: portrait`, theme/background `#0a0a0a`, icons 32/192/512 (SVG; add PNG 192/512 for best Android install). |
| **service-worker.js** | Network-first, cache fallback; SPA fallback to `/index.html`; cache name `npc-pwa-v2`. |
| **index.html** | `theme-color`, `apple-mobile-web-app-capable`, `viewport-fit=cover`, `apple-touch-icon` (32, 192, 512). |
| **Install prompt** | `beforeinstallprompt` captured in `pwa.ts`; MainLayout shows "התקן את NPC כאפליקציה" when available; buttons 44×44. |
| **HTTPS** | Netlify serves over HTTPS by default. |
| **APK readiness** | See `docs/PWA_AND_APK_PACKAGING.md` (Capacitor + Bubblewrap). |

---

## 2. Mobile-First UI/UX ✅

| Item | Status |
|------|--------|
| **Tables** | Events (EventsPage) and Dashboard events table use `table-scroll-wrap`: horizontal scroll with `-webkit-overflow-scrolling: touch`, `min-width` on table (800px). |
| **Touch targets** | Global: `min-height: 44px` and `min-width: 44px` for buttons/inputs on `pointer: coarse`. Actions column, Due Date, Sync column and Install banner use 44px. Mobile menu button 48×48. |
| **Pull-to-refresh** | Dashboard wrapped in `PullToRefresh`; at top of page, pull down to trigger `fetchDashboardEvents`. Hebrew labels: "משוך לרענון" / "שחרר לרענון" / "מרענן...". |
| **Dark theme** | High-contrast dark (nightlife) via `--background`, `--card`, `--border`; `.dark` and palette variants in `index.css`. |

---

## 3. Accounting & Sync (Frontend Mockup) ✅

| Item | Status |
|------|--------|
| **Due Date picker** | Events table has "תאריך יעד" column with `<Input type="date">`; updates event on blur. Placed next to "סנכרון Morning" column. |
| **Locked row** | When `morning_id` is present **or** `morning_sync_status === 'synced'`, row is read-only: amount, payment_date, due_date inputs disabled; Edit/Delete replaced by "בקשת תיקון" button. |
| **Request Correction** | Modal "בקשת תיקון למסמך רשמי" with warning about official document credits; buttons "ביטול" and "שלח בקשת תיקון" (mock — ready for Morning API). |
| **Event type** | `Event` has optional `morning_id`; UI uses it for lock when API provides it. |

---

## 4. Full System / Google Test Checklist

Use **npcollectivebooking@gmail.com** (or your test account) on the production URL (https://npc-am.com):

- [ ] **Login** — Email + password; Redirect URLs include site + `/login`.
- [ ] **Dashboard** — KPIs load; pull-to-refresh works at top of page.
- [ ] **Events** — Create event; set due date in table; sync Morning (demo or job); for synced row, confirm lock and "בקשת תיקון" flow.
- [ ] **Navigation** — Sidebar; mobile menu (hamburger); all main pages load.
- [ ] **PWA install** — On supported browser (Chrome Android, etc.), confirm install banner and "Add to Home Screen" / install prompt.
- [ ] **Standalone** — After install, open from home screen; no browser UI; portrait; dark theme.

No Morning API keys required for this UI/UX phase; sync and Request Correction are prepared for future connection.

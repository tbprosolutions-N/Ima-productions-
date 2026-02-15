# Deep QA Test Plan — Full App Flow, Backend, Frontend, UX/UI

This document describes the comprehensive QA test setup for the NPC Agency Management System, covering E2E flows, backend, frontend unit tests, UX, UI, and safety checks.

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run test:unit` | Run Vitest unit tests (lib/utils, etc.) |
| `npm run test:e2e` | Run Playwright E2E tests (full app flow) |
| `npm run test:e2e:ui` | Playwright UI mode for debugging |
| `npm run test:all` | Run unit + E2E tests |
| `npm run test:backend` | Backend integration example (requires netlify dev) |
| `npm run build` | TypeScript + Vite build (catches type errors) |
| `npm run lint` | ESLint |

---

## 1. End-to-End (E2E) Tests

**Location:** `tests/e2e/`  
**Tool:** Playwright  
**Mode:** Demo bypass (`VITE_DEMO_BYPASS=true`) — no real Supabase required. The E2E server (`scripts/start-e2e-server.mjs`) injects dummy Supabase env vars so the app loads without errors.

### Test Suites

| Spec | Coverage |
|------|----------|
| `auth.spec.ts` | Login, logout, protected routes, redirects, session |
| `navigation.spec.ts` | All core routes, sidebar links |
| `events.spec.ts` | Events page, create/edit dialog, form fields, search |
| `finance.spec.ts` | Finance page, period summary, export dialog |
| `artists-clients.spec.ts` | Artists and Clients CRUD, add dialogs |
| `settings-ux.spec.ts` | Settings, theme toggle, locale, RTL, dashboard KPIs |
| `accessibility.spec.ts` | Labels, landmarks, keyboard, dialogs |
| `demo-traverse.spec.ts` | Smoke test (original quick traverse) |

### Run E2E

```bash
npm run test:e2e
```

Playwright starts the preview server (port 4173) with demo bypass, runs all specs, and reports results. Use `--headed` or `--debug` for visibility.

---

## 2. Frontend Unit Tests

**Location:** `tests/unit/`  
**Tool:** Vitest + jsdom + Testing Library

### Test Suites

| Spec | Coverage |
|------|----------|
| `lib/utils.test.ts` | formatCurrency, formatDate, validateIsraeliVAT, validateEmail, validatePhone, sanitizeFilename, parseTemplateVariables, withTimeout, etc. |

### Run Unit Tests

```bash
npm run test:unit
npm run test:unit:watch   # Watch mode
```

---

## 3. Backend / Integration Tests

**Location:** `tests/backend/`  
**Docs:** `tests/backend/README.md`

- **Netlify Functions** — Test via `netlify dev` + HTTP calls to `/.netlify/functions/morning-api`
- **Supabase Edge Functions** — Test via `supabase functions serve` + HTTP calls
- **Database / RLS** — Verified via migrations and manual smoke tests (see `docs/QA_TASKS.md`)

```bash
npm run netlify:dev   # Terminal 1
npm run test:backend  # Terminal 2
```

---

## 4. UX / UI Tests

Covered by E2E specs:

- **Theme toggle** — dark/light in settings and sidebar
- **RTL/LTR** — `dir` attribute on `<html>`
- **Layout** — nav, main landmarks
- **Responsiveness** — viewport 1280×720 (adjust in `playwright.config.ts` for mobile)

### Visual Regression (Optional)

Add `expect(page).toHaveScreenshot()` in specific tests for pixel-perfect regression. Requires baseline screenshots in CI.

### Accessibility

- Form labels (getByLabel)
- Landmarks (nav, main)
- Keyboard dismissal (Escape)
- Page title

For deeper a11y, add `@axe-core/playwright` and run `expect(await axe.run(page)).toHaveNoViolations()`.

---

## 5. Safety and Good Usage Tests

| Area | Tests |
|------|-------|
| **Console errors** | E2E `beforeEach` fails on `pageerror` and `console.error` |
| **Blank screen** | Assert `#root` and `body` visible on each route |
| **Auth guard** | Unauthenticated → redirect to /login |
| **RBAC** | Producer cannot access /finance (redirect); owner can access /sync |
| **Data integrity** | QATestPage validates event links, expenses, sent docs |
| **Build** | `npm run build` must succeed |
| **Lint** | `npm run lint` must pass |

---

## 6. Test Matrix

| Layer | Tool | Command | When to Run |
|-------|------|---------|-------------|
| Unit | Vitest | `npm run test:unit` | Pre-commit, CI |
| E2E | Playwright | `npm run test:e2e` | PR, pre-release |
| Backend | Node/curl | `npm run test:backend` | Manual, staging |
| Build | Vite | `npm run build` | Every deploy |
| Lint | ESLint | `npm run lint` | Pre-commit |

---

## 7. CI Recommendation

```yaml
# Example GitHub Actions
- run: npm ci
- run: npm run build
- run: npm run lint
- run: npm run test:unit
- run: npm run test:e2e
```

---

## 8. Manual QA Checklist

For production handoff, also run:

- [ ] Login (email/password) on production URL
- [ ] Create event, save, edit
- [ ] Finance: upload expense, verify list and storage
- [ ] Settings: send invite (magic link)
- [ ] Morning sync (sandbox credentials)
- [ ] Theme switch, locale switch
- [ ] Mobile view (sidebar, PWA install banner)

See `docs/QA_TASKS.md` and `docs/CLIENT_DEMO_CHECKLIST.md` for full lists.

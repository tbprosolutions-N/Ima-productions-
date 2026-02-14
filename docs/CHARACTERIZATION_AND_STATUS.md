# System Characterization: End-to-End (Technical & Product)

## Test site (real app)

**https://npc-am.com** — Use this URL for all production testing.

---

## Product overview

Agency/event management system: multi-tenant, roles (owner/manager/finance/producer), events, artists, clients, finance (expenses, checklist, reports), calendar, documents, integrations (Google, Morning), backup, and user invites.

---

## Features / technology / flow — implementation status


| Feature / technology / flow                                 | Real (production) | Demo only | Notes                                                                         |
| ----------------------------------------------------------- | ----------------- | --------- | ----------------------------------------------------------------------------- |
| **Auth: email + password**                                  | ✅                 | —         | Supabase Auth; works in production when env set                               |
| **Auth: magic link / invite email**                         | ✅                 | —         | invite-user Edge Function; Gmail API or Supabase mailer; fallback: copy link  |
| **Auth: session persistence**                               | ✅                 | —         | localStorage `ima_os_auth`; double retry on session null                      |
| **Auth: ensure_user_profile RPC**                           | ✅                 | —         | Self-heal if users row missing; requires SQL run once in Supabase             |
| **Demo login (no Supabase)**                                | —                 | ✅         | DEV only; demo_authenticated + demo_user in localStorage                      |
| **Dashboard: KPIs**                                         | ✅                 | ✅         | Same UI; production reads from Supabase + finance_expenses                    |
| **Dashboard: recent activity**                              | ✅                 | ✅         | Activity log; production from DB                                              |
| **Events: CRUD**                                            | ✅                 | ✅         | Production: Supabase; demo: localStorage                                      |
| **Events: export (Excel/CSV)**                              | ✅                 | ✅         | Same code path                                                                |
| **Artists: CRUD**                                           | ✅                 | ✅         | Production: Supabase; demo: localStorage                                      |
| **Clients: CRUD**                                           | ✅                 | ✅         | Production: Supabase; demo: localStorage                                      |
| **Finance: expense upload**                                 | ✅                 | ✅         | Production: Storage + finance_expenses + OCR/Vision; demo: localStorage + IDB |
| **Finance: file manager modal**                             | ✅                 | ✅         | Filter by name/period; View/Delete; state from context (persists)             |
| **Finance: checklist**                                      | ✅                 | ✅         | localStorage per agency                                                       |
| **Finance: period summary / reports**                       | ✅                 | ✅         | Same; production uses real expenses                                           |
| **Finance: sync to Morning**                                | ✅                 | ✅         | Production: sync job; demo: mock                                              |
| **Calendar**                                                | ✅                 | ✅         | FullCalendar; production/demo same UI; data source differs                    |
| **Documents: templates, variables**                         | ✅                 | ✅         | Production/demo same; sent docs stored per mode                               |
| **Settings: profile (name)**                                | ✅                 | ✅         | Production: users table; demo: localStorage                                   |
| **Settings: company name / logo**                           | ✅                 | ✅         | localStorage (branding); owner-editable                                       |
| **Settings: user management**                               | ✅                 | ✅         | Production: invite-user + users; demo: localStorage + copy link               |
| **Settings: integrations (Google Drive/Calendar, Morning)** | ✅                 | ✅         | Production: OAuth + integration_tokens; demo: flags only                      |
| **Settings: backup (export JSON, copy, download)**          | ✅                 | ✅         | Same; exports events/clients/artists/expenses                                 |
| **Settings: 2FA (MFA)**                                     | ✅                 | —         | Supabase MFA; production only                                                 |
| **Theme: light/dark**                                       | ✅                 | ✅         | Same                                                                          |
| **Locale: Hebrew / English, RTL/LTR**                       | ✅                 | ✅         | Same                                                                          |
| **Supabase: RLS**                                           | ✅                 | —         | Production; agency_id scoping                                                 |
| **Supabase: Storage (expenses bucket)**                     | ✅                 | —         | Production uploads                                                            |
| **Edge Function: invite-user**                              | ✅                 | —         | Gmail API or inviteUserByEmail; returns magic_link on failure                 |
| **Edge Function: extract-invoice-vision**                   | ✅                 | —         | Optional; OCR upgrade when deployed + ANTHROPIC_API_KEY                       |
| **Redirect URLs (Supabase Auth)**                           | ✅                 | —         | Must include production URL for token refresh / magic link                    |
| **Netlify deploy**                                          | ✅                 | —         | dist; env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY                          |
| **QA / System Health pages**                                | —                 | ✅         | DEV only; redirect in production                                              |
| **Sync monitor**                                            | ✅                 | ✅         | Same UI; production runs real jobs                                            |


---

## Technical stack

- **Frontend:** React 18, TypeScript, Vite, React Router, Framer Motion, Tailwind, Radix UI, Recharts, FullCalendar.
- **Backend:** Supabase (Auth, Postgres, Storage, Edge Functions).
- **Integrations:** Google (OAuth: Drive, Calendar, Gmail for invite), Morning (API key + company ID).
- **State:** React context (Auth, Agency, Finance, Theme, Locale, Toast); localStorage for branding/demo/checklist; FinanceContext loads expenses from Supabase or demo store.
- **Build/deploy:** Vite build → `dist`; Netlify (manual or CLI).

---

## Summary

- **Real interface (production):** All main features (auth, events, artists, clients, finance, calendar, documents, settings, backup, integrations) are implemented for production when Supabase + Netlify env and Redirect URLs are configured. Invite email works via Gmail API or Supabase mailer; fallback is copy link.
- **Demo-only:** Demo login (no Supabase), QA page, System Health page. Everything else exists in both demo and real; data source and some endpoints (e.g. Morning sync) differ by mode.


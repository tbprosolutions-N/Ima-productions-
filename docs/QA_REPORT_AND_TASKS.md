# QA Report & Code Review — Recommendations and Tasks

## Pre-delivery QA summary

Review performed from a **code review and upgrade** perspective. Findings are split into **tasks** for prioritization.

---

## Critical (P0) — Before customer delivery

| Task ID | Area | Finding | Recommendation |
|---------|------|---------|----------------|
| P0-1 | Auth | Session can be lost if profile fetch fails and retries exhaust | Already mitigated with double retry + ensure_user_profile; ensure Supabase has ensure_user_profile and Redirect URLs include production URL. |
| P0-2 | Env | Production requires VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in Netlify | Document in handover; verify in production. |
| P0-3 | Invite email | Gmail or Supabase mailer must be configured for invites | Ensure invite-user is deployed; set GOOGLE_* or SMTP; test one invite and magic link. |
| P0-4 | Branding | Rebrand to NPC and black/white theme | Implement in codebase (separate tasks below). |

---

## High (P1) — Security, correctness, integrations

| Task ID | Area | Finding | Recommendation |
|---------|------|---------|----------------|
| P1-1 | RLS | All agency-scoped tables must enforce agency_id in RLS | Audit finance_expenses, users, events, artists, clients, agencies; ensure SELECT/INSERT/UPDATE/DELETE filter by agency_id (and optionally auth.uid()). |
| P1-2 | Secrets | No API keys in frontend except Supabase anon | Morning API key only in demo or server-side; Gmail tokens in Edge Function / integration_tokens. Verify no keys in client bundle. |
| P1-3 | Email | Invite and magic link depend on Redirect URL and SITE_URL | Add production URL to Supabase Auth → Redirect URLs; set SITE_URL in Edge Function secrets. |
| P1-4 | Integrations | Google OAuth must request correct scopes for Gmail/Drive/Calendar | Verify requested scopes in google-oauth-start and that integration_tokens stores refresh_token for invite flow. |
| P1-5 | Finance | Expense upload can fail silently if Storage RLS or table RLS blocks | Add user-visible error message on upload failure; log 403/500 in console. Already partially done; ensure all paths show message. |

---

## Medium (P2) — Maintainability, performance, UX

| Task ID | Area | Finding | Recommendation |
|---------|------|---------|----------------|
| P2-1 | Bundle size | Large chunks (e.g. FinancePage, charts, calendar) | Consider code-splitting or lazy loading for heavy routes; optional manualChunks in Vite. |
| P2-2 | Types | Some `any` in Supabase client and RPC responses | Introduce minimal Database types or generic types for .from() and .rpc() to reduce runtime errors. |
| P2-3 | Errors | Generic messages for auth/DB failures in production | Keep user-facing text generic; log detailed errors server-side or in console for support. |
| P2-4 | Accessibility | RTL/LTR and focus management in modals | Quick pass: ensure focus trap and aria labels on Dialog and key forms. |
| P2-5 | Testing | E2E exists (Playwright) but may not cover production auth | Add smoke test: login → dashboard → one CRUD; run against staging if available. |

---

## Low (P3) — Nice to have

| Task ID | Area | Finding | Recommendation |
|---------|------|---------|----------------|
| P3-1 | Logging | No structured logging for Edge Functions | Add request id and log errors with context (e.g. agencyId, email) for debugging. |
| P3-2 | Rate limits | No explicit rate limit on invite or upload | Invite and magic-link email must work for normal use. Do not add a rate limit that blocks normal traffic. If abuse protection is needed, apply only at abuse level (e.g. ≥1000 invites per minute per agency). Otherwise there is no reason invite/email should fail when configured. |
| P3-3 | Docs | README and SETUP reference IMA / magenta | ✅ Updated to NPC and black/white. |

---

## Task list (ordered for implementation)

1. **Rebrand to NPC** — ✅ Done. Replaced IMA Productions / IMA OS with NPC in app name, defaults, copy, invite-user and sync-runner Edge Functions, Sidebar, Settings, QA, ErrorBoundary, main.tsx.
2. **Black & white theme** — ✅ Done. Default palette is `bw`; primary/ring/accents are grayscale in `index.css` and ThemeContext.
3. **Verify production env** — Netlify: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY. Supabase: Redirect URLs, SITE_URL, invite-user secrets.
4. **Test invite flow** — Send one invite (Gmail or Supabase); open magic link; confirm login and redirect.
5. **Audit RLS** — Review policies for finance_expenses, users, and core tables; fix any missing agency_id filter.
6. **Improve upload error feedback** — Ensure Storage/insert errors show a clear message in the Finance upload UI.
7. **Document handover** — Update README/SETUP with NPC, env checklist, and support contact.

---

## Sign-off

- **Code review:** Completed; recommendations above.
- **QA test before delivery:** Run manual smoke test (login → dashboard → events → finance upload → settings → invite) on production URL after rebrand and theme changes.
- **Integrations (email):** Invite and magic link are designed to work when Gmail API or Supabase mailer is configured and Redirect URLs are set; fallback (copy link) is implemented. There is no rate limit blocking normal use; only extreme abuse (e.g. 1000 emails per minute) would warrant limiting.

# NPC Management System — Architecture & Next Steps

## 1. Current Architecture (As-Is)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Browser (React SPA, RTL Hebrew)                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │ AuthContext │  │ AgencyContext│  │ React Query │  │ Toast / UI state  │   │
│  │ (session +  │  │ (current     │  │ (events,    │  │                  │   │
│  │  user row)  │  │  agency)    │  │  artists,   │  │                  │   │
│  └──────┬──────┘  └──────┬───────┘  │  clients)   │  └──────────────────┘   │
│         │                │          └──────┬──────┘                          │
└─────────┼────────────────┼─────────────────┼────────────────────────────────┘
          │                │                 │
          ▼                ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Supabase (Auth + Postgres + RLS + Storage)                                  │
│  • auth.users + public.users (invite-only via pending_invites)               │
│  • agencies → events, clients, artists, documents, finance_expenses         │
│  • RLS: agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())     │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          │  Server-side only (Netlify)
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Netlify Functions                                                            │
│  • /api/sheets-sync — Service Account → Drive folder + Sheets (create/sync)  │
│  • (Future: calendar sync, agreement PDF, etc.)                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Data flow:** User signs in (Google) → profile from `public.users` (or redirect if not invited) → agency from `agencies` by `user.agency_id` → all list/mutation queries scoped by `agency_id`. No agency ⇒ banner + retry; no profile ⇒ login + unauthorized message.

---

## 2. Suggested Solution Architecture (Target)

Keep the same high-level shape; harden and clarify boundaries.

### 2.1 Frontend

| Layer | Responsibility | Recommendation |
|-------|----------------|----------------|
| **Auth** | Session + profile; redirect when no profile | Keep. Add optional “session expired” detection and one retry before redirect. |
| **Agency** | Current agency + error + retry | Keep. You already have `agencyError` + `retryAgency` and the banner. |
| **Data** | Server state (lists, mutations) | Centralize on **React Query** for all agency-scoped data. Replace any remaining raw `supabase.from().select()` in pages (e.g. Dashboard stats) with `useEventsQuery` / `useClientsQuery` / `useArtistsQuery` or dedicated hooks so cache and invalidation are consistent. |
| **Mutations** | Create/update/delete | Keep pattern: mutate → check `error` → invalidate query → toast. Ensure every mutation path either shows success or an error toast (no silent failures). |
| **Feature visibility** | Why things don’t work | Keep login unauthorized message + “no agency” banner. Optionally add a small **Help / Why can’t I…?** link that explains invite-only and “contact admin if no agency”. |

### 2.2 Backend (Supabase)

| Area | Recommendation |
|------|----------------|
| **Auth model** | Keep **invite-only**: `handle_new_user` + `ensure_user_profile` + `pending_invites`. First user = owner + first agency; everyone else must be invited. |
| **RLS** | Keep agency-scoped RLS. Add a **single “health” RPC** (e.g. `check_agency_access(agency_id)`) that returns ok/error so the frontend can distinguish “no agency” vs “no permission” if needed. |
| **Migrations** | Keep migrations for schema (e.g. `clients.color`, `documents.send_to`). Before deploy, run migrations in Supabase; document in README or runbook. |
| **Secrets** | Supabase anon + service_role only where needed. Netlify: `GOOGLE_SA_*`, `SUPABASE_*` in env; never in client. |

### 2.3 Netlify / Server-Side

| Area | Recommendation |
|------|----------------|
| **Sheets sync** | Keep single function with timeout (e.g. 25s), payload validation, folder pre-check, and logging. If you need larger syncs, add a “background” path later (e.g. queue job → separate worker) instead of lengthening the HTTP timeout. |
| **New features** | Prefer **Supabase RPCs** for pure DB logic; use **Netlify functions** only when you need server-only secrets (e.g. Service Account) or external APIs (Drive, Sheets, email). |
| **Errors** | Always return JSON `{ error, detail? }` and log with a request id; you already moved in this direction. |

### 2.4 Observability & Ops

| Item | Recommendation |
|------|----------------|
| **Logs** | Netlify function logs already use `[sheets-sync] requestId`. Add one place (e.g. README or `docs/RUNBOOK.md`) that says: “If backup fails, check Netlify function logs for requestId and look for Auth / Folder / Create / Sync step.” |
| **Health** | You have `/health`. Optionally have it call Supabase (e.g. `select 1`) and report “db: ok” so you can tell “app up but DB down” from “app down”. |
| **Alerts** | If you have monitoring (e.g. Netlify, Sentry), alert on 5xx for `/api/sheets-sync` and on auth/profile failure rate if you can measure it. |

---

## 3. What’s Next (Prioritized)

### P0 — Before more users

1. **Run migrations** in production Supabase (e.g. `clients.color`, `documents.send_to`, any RLS changes) so the app and DB match.
2. **Env check** in Netlify: `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` set and that the Drive folder is shared with the SA (Editor).
3. **First user**: Sign in with Google once so the first owner + first agency are created; then add the next users via Settings → Users.

### P1 — Stability & clarity

4. **Dashboard data**: Switch Dashboard to use React Query (e.g. `useEventsQuery`, `useClientsQuery`, `useArtistsQuery`) instead of raw `supabase.from().select().limit(500)` so dashboard stays in sync with Events/Clients/Artists pages and shares cache.
5. **Document “why features don’t work”**: Short section in README or in-app help: invite-only, first user = owner, “no agency” banner means contact admin or retry.
6. **One runbook**: `docs/RUNBOOK.md` with: how to add a user, how to fix “no agency”, how to debug Sheets backup (logs, folder sharing, env).

### P2 — Quality & scale

7. **Route-level error boundaries**: Wrap each main route (Dashboard, Events, Artists, etc.) in an error boundary so one failing component doesn’t white-screen the whole app.
8. **E2E smoke test**: One flow: login (or demo) → open Events → open Create Event → save (or cancel). Protects against full regression (auth + agency + one critical path).
9. **Optional background sync**: If Sheets sync often hits timeout with large data, add a “sync in background” flow: API returns 202 + job id, frontend polls or shows “גיבוי בתהליך” and a later “הגיבוי הושלם” toast.

---

## 4. Architecture Diagram (Target)

```
                    ┌──────────────────────────────────────────┐
                    │  React SPA (Vite)                         │
                    │  • AuthContext (session + profile)       │
                    │  • AgencyContext (current + error+retry) │
                    │  • React Query (events, artists, clients) │
                    │  • All mutations → invalidate + toast     │
                    └───────────────┬──────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  Supabase       │    │  Netlify            │    │  (Future: queue /   │
│  • Auth         │    │  /api/sheets-sync   │    │   worker for heavy   │
│  • Postgres+RLS │    │  (SA + Drive/Sheets) │    │   sync jobs)         │
│  • Storage      │    └─────────────────────┘    └─────────────────────┘
└─────────────────┘
```

**Principles:**  
- Single source of truth for auth and agency (Supabase + your contexts).  
- All agency-scoped reads/writes through Supabase with RLS; server-only work (Sheets, etc.) through Netlify with clear errors and timeouts.  
- User-facing reasons for “no access” and “no agency” are explicit (login message + banner); ops path is documented in a runbook.

---

## 5. Summary

- **Architecture:** Keep the current split (SPA → Supabase + Netlify). Harden by: consistent use of React Query, explicit auth/agency feedback, validated and logged server APIs, and one runbook.
- **Next steps:** P0 = migrations + env + first user; P1 = Dashboard via React Query + docs + runbook; P2 = error boundaries + smoke test + optional background sync.

This gives you a clear “what’s next” and a stable, scalable architecture without a full rewrite.

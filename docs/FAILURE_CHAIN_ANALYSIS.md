# Google Sheets Sync — Failure Chain Analysis (MODU)

## Root Cause Reasoning

### 1. Why "טעינת הסוכנות נכשלה" (Agency loading failed)

**Race condition:** `AgencyContext` ran `fetchAgencies` before `AuthContext` had finished loading. When `user` was set, `authLoading` could still be `true` in a brief window, or `user.agency_id` was not yet available from the profile fetch. The agencies query then ran with stale/partial context and failed.

**RLS propagation:** New users or invites can have a short delay before `users.agency_id` is visible to RLS subqueries. The `agencies` policy uses `agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())`. If that subquery returns nothing momentarily, the agencies fetch fails with an error (not empty result), triggering the catch path.

### 2. Why empty arrays reached the Edge Function

The UI uses `currentAgency?.id` for sync. When AgencyContext failed, `currentAgency` was `null`, but the Settings page fallback `agencyId = currentAgency?.id ?? 'ima-productions-id'` could send a non-UUID fallback. Queries for `agency_id = 'ima-productions-id'` return no rows (events, artists, expenses all empty). The frontend then formatted and sent `[]` to the Edge Function.

### 3. Why 502 instead of a graceful error

The Edge Function received empty `sheets` and attempted to process them. With no explicit empty-payload guard, it could hit unexpected paths (e.g., empty range writes, validation) and throw, causing Supabase to return 502. Returning 400 for empty payloads prevents this and gives a clear client error.

### 4. RLS implications

Supabase Advisor reported 51 RLS warnings. The policies for `events`, `artists`, and `clients` depend on `SELECT agency_id FROM users WHERE id = auth.uid()`. If the `users` row is missing or `agency_id` is NULL, those subqueries return nothing and all reads are blocked.

---

## Fixes Applied

| Layer | Fix |
|-------|-----|
| **AgencyContext** | Gate `fetchAgencies` on `authLoading`; auto-retry on transient failure (max 2); reset retry count on manual retry |
| **sheetsSyncService** | Circuit breaker: block Edge Function call when events, artists, and expenses are all empty |
| **Edge Function** | Stateless design; empty-payload guard returns 400; Service Role for integrations upsert (bypasses RLS) |
| **Database** | RLS audit migration: ensure events, artists, clients have SELECT policies for authenticated users |

---

## Deployment

1. Run migration: `npx supabase db push` or apply `20260304000000_rls_audit_events_artists_clients.sql`
2. Deploy Edge Function: `npx supabase functions deploy sheets-sync --no-verify-jwt`
3. Verify: Sign in, confirm agency loads, add an event/artist, then run Sheets sync

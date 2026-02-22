# Morning Integration – Tier 3 Security Status Report

**Date:** 2026-02-22  
**Scope:** T20–T23 (JWT auth, validation, structured error logging, secure credentials)

---

## Summary

The Morning (Green Invoice) integration is now secured end-to-end:

- **JWT authentication** on all user-facing Morning endpoints
- **Pre-push validation** to avoid unnecessary API calls for invalid data
- **Structured, auditable error logging** in the DB
- **Unified credential handling** using `integration_secrets` only (no env fallbacks)

---

## T20: JWT Authentication

| Endpoint | Auth | Behavior |
|----------|------|----------|
| **morning-api** (Netlify) | `Authorization: Bearer <session_token>` | 401 if missing/invalid; 403 if user not in agency |
| **morning-save-credentials** (Netlify) | Same | 401 if missing/invalid; 403 if not owner/finance |
| **morning-connect** (Edge) | Same | 401 if missing/invalid; 403 if not owner/finance |

**Client changes:**
- `morningService.ts` – Sends session token for `checkEventDocumentStatus` and `createEventDocument`
- `SettingsPage.tsx` – Sends session token for Morning credentials save

---

## T21: Validation Layer (sync-runner)

**Event document create:**
- `event_date` – required, valid date
- `amount` – required, > 0, finite
- `business_name` or `invoice_name` or `client_id` (with resolved client name) – at least one required
- `status` – must not be `cancelled`

**Expense sync:**
- `amount` – required, > 0, finite
- `supplier_name` or `vendor` – at least one required

Validation failures:
- Event: `morning_sync_status: 'error'`, `morning_last_error` = `{ "code": "VALIDATION", "message": "..." }`
- Expense: same pattern in `finance_expenses.morning_last_error` (new column)

---

## T22: Structured Error Logging

**Storage format (auditable JSON):**
```json
{
  "status": 400,
  "code": 123,
  "message": "Human-readable error from Morning",
  "raw": "First 1000 chars of raw response"
}
```

**Validation errors:**
```json
{
  "code": "VALIDATION",
  "message": "amount is required and must be > 0"
}
```

**Locations:**
- `events.morning_last_error` (existing TEXT column)
- `finance_expenses.morning_last_error` (new column via migration `20260303000000`)

**UI:** EventsPage shows `message` from parsed JSON when available; falls back to raw string.

---

## T23: Secure Credential Handling

| Component | Before | After |
|-----------|--------|-------|
| **morning-api** | integration_secrets → env fallback | integration_secrets only |
| **morning-save-credentials** | No auth | JWT + owner/finance check |
| **morning-connect** | No auth | JWT + owner/finance check |
| **sync-runner** | integration_secrets → env fallback | integration_secrets only |

Production credentials must come from **Settings → גיבוי נתונים** (integration_secrets). Env fallbacks removed.

---

## Deploy Checklist

1. **Run migration:**
   ```bash
   npx supabase db push
   # Or run manually: 20260303000000_finance_expenses_morning_last_error.sql
   ```

2. **Netlify:**
   - Redeploy so `morning-api` and `morning-save-credentials` use the new handlers.

3. **Supabase Edge Functions:**
   - `supabase functions deploy sync-runner`
   - `supabase functions deploy morning-connect` (if used)

4. **Ensure `integration_secrets` has Morning credentials** for each agency (no env fallback).

---

## Performance

- JWT checks and validation run before external API calls, so invalid or unauthorized requests fail fast.
- No extra DB round-trips: auth uses the same Supabase client as existing logic.
- Error logging adds minimal overhead (one JSON string write per failure).

The system stays **snappy**; no noticeable latency added.

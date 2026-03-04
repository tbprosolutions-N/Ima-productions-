# NPC Production Integrity Audit — Report

**Date:** 2025-02-16  
**Project:** oerqkyzfsdygmmsonrgz | npc-am.com

---

## Task 1: Supabase Data & Schema Integrity ✅

| Table     | Status | Rows |
|-----------|--------|------|
| artists   | ✅     | 5    |
| clients   | ✅     | 5    |
| events    | ✅     | 1    |
| documents | ✅     | 3    |

**RLS:** Enabled on events, artists, clients. Policies allow SELECT for users in same agency. Service role bypasses RLS.  
**Action:** No data migration issue. Verify policies in Dashboard → Table Editor → RLS.

---

## Task 2: Edge Functions & Secrets Audit ✅

| Function        | Invocation | Notes |
|-----------------|------------|-------|
| send-email      | ✅ 200     | RESEND_API_KEY, RESEND_FROM available |
| calendar-invite | ⚠️ 401     | Expected with invalid token; validates user JWT |

**Secrets (Supabase):** RESEND_API_KEY, RESEND_FROM, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY confirmed.  
**Run:** `npx supabase secrets list --project-ref oerqkyzfsdygmmsonrgz` to verify.

---

## Task 3: Vercel Runtime & API Handshake

**Manual checklist:** See `docs/EMERGENCY_AUDIT_TASK3.md`

| Check              | Action |
|--------------------|--------|
| CORS / Site URL    | Supabase → Auth → URL Configuration: `https://npc-am.com` |
| VITE_SUPABASE_URL  | Must be `https://oerqkyzfsdygmmsonrgz.supabase.co` |
| SUPABASE_ANON_KEY  | Same as VITE_SUPABASE_ANON_KEY (for calendar-invite proxy) |

---

## Task 4: Live Transaction Test — "Smoking Gun"

### Results

| Step              | Result |
|-------------------|--------|
| Login             | ⚠️ Skipped (AUDIT_PASSWORD not set) |
| Fetch artists     | ✅ 5 rows |
| Create Ghost Event| ✅ Created |
| calendar-invite   | ❌ 401 "Missing authorization" |

### Root Cause: Send Invitation Flow

The **Send Invitation** flow fails when:

1. **No valid user JWT** — The Vercel proxy `/api/calendar-invite` requires `Authorization: Bearer <user_jwt>`. If the user has no session (e.g. auth redirect misconfiguration, expired token), the proxy returns 401 "Missing authorization".

2. **Auth redirect mismatch** — If Supabase Auth redirect URLs don’t include `https://npc-am.com`, users may not get a valid session after login.

3. **Vercel env** — `SUPABASE_URL` and `SUPABASE_ANON_KEY` must be set. Missing values cause 502.

### Full Test (with credentials)

```bash
AUDIT_EMAIL=your@email.com AUDIT_PASSWORD=yourpass npx tsx tests/final-audit.ts
```

This will login, create a ghost event, and call calendar-invite with a real JWT. Any error code is reported.

---

## Commands

```bash
npm run audit:supabase   # Task 1 + 2
npm run audit:final      # Task 4 (set AUDIT_PASSWORD for full flow)
```

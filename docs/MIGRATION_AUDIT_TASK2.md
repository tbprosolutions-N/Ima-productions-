# Task 2: Service Integration Test — Results

**Date:** 2026-02-16  
**Script:** `node tests/debug-services.mjs` (or `npm run debug:services`)

---

## Results Summary (Final Run)

| Service | Status | Notes |
|---------|--------|-------|
| **Supabase** | PASS | Fetched 1 row from artists (בדיקה) |
| **Resend** | PASS | send-email Edge Function returned 200 |

---

## Changes Made

1. **Resend test** — Added `from: 'NPC Collective <noreply@npc-am.com>'` to request body (send-email requires it if RESEND_FROM not set in Supabase secrets).
2. **Script** — Added `npm run debug:services` to package.json.

---

## First Run (Transient)

- Supabase returned 502 (Bad Gateway) on first run — likely transient Cloudflare/Supabase issue.
- Resend returned 400 (Missing `from`) — fixed by passing `from` in body.

---

## Recommendation

Set `RESEND_FROM` in Supabase secrets so agreement/alert emails work without passing `from` in every request:
```bash
supabase secrets set RESEND_FROM="NPC Collective <noreply@npc-am.com>"
```

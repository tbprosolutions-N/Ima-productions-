# Final Vercel Env Sync Check

## Quick Verification

Run locally (loads `.env`):
```bash
npm run verify:env-sync
```

---

## Project ID Verification

**Expected:** `VITE_SUPABASE_URL` must be exactly:
```
https://oerqkyzfsdygmmsonrgz.supabase.co
```

**Check:** In Vercel → Project → Settings → Environment Variables, verify:
- No trailing slash
- Contains `oerqkyzfsdygmmsonrgz` (project ref)
- Not an old project URL (e.g. different project ref)

---

## Anon Key Verification

**Expected:** `VITE_SUPABASE_ANON_KEY` must be the JWT from the **new** project (oerqkyzfsdygmmsonrgz).

**How to get the correct key:**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/oerqkyzfsdygmmsonrgz)
2. Settings → API
3. Copy **anon** / **public** key (starts with `eyJ...`)

**Mismatch symptom:** If you use the old project's anon key, JWTs will fail validation and you'll get 401s. The anon key JWT contains a `ref` claim — it must match `oerqkyzfsdygmmsonrgz`.

---

## Proxy Check (api/calendar-invite.ts)

**Verified:** No hardcoded project ID. The proxy uses:
- `SUPABASE_URL` or `VITE_SUPABASE_URL` (line 35)
- `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY` (line 36)

The proxy forwards the **user's JWT** (from `Authorization: Bearer <token>`) as `access_token` in the request body to the Edge Function. The Edge Function validates that JWT against Supabase Auth.

---

## Required Vercel Environment Variables

| Variable | Required For | Value |
|----------|--------------|-------|
| `VITE_SUPABASE_URL` | Frontend + API routes | `https://oerqkyzfsdygmmsonrgz.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Frontend + API routes | JWT from project oerqkyzfsdygmmsonrgz |
| `SUPABASE_URL` | API routes (calendar-invite, morning) | Same as above |
| `SUPABASE_ANON_KEY` | API routes | Same as VITE_SUPABASE_ANON_KEY |
| `SUPABASE_SERVICE_ROLE_KEY` | Morning, server-side | Service role JWT |

**Note:** Vercel serverless functions use `process.env`. The `VITE_` prefix vars are available if set in Vercel; the proxy falls back to `SUPABASE_*` for clarity.

---

## Final Report (Local .env)

| Check | Status |
|-------|--------|
| Project URL | ✅ Matches `oerqkyzfsdygmmsonrgz.supabase.co` |
| Anon Key JWT ref | ✅ Matches `oerqkyzfsdygmmsonrgz` |
| Proxy (calendar-invite) | ✅ Uses env vars, no hardcoded ID |

**No mismatch in local `.env`.** If 401s persist on production, verify the **Vercel dashboard** has the same values (Vercel env is not visible from this repo).

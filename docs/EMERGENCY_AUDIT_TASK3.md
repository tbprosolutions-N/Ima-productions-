# Task 3: Vercel Runtime & API Handshake — Manual Checklist

## CORS Check (Supabase)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/oerqkyzfsdygmmsonrgz)
2. **Settings → API** (or Authentication → URL Configuration)
3. Under **Site URL**: `https://npc-am.com`
4. Under **Redirect URLs** (or Additional Redirect URLs): add
   - `https://npc-am.com`
   - `https://npc-am.com/**`
   - `https://npc-am.com/login`
5. If there is an **API CORS** or **Allowed Origins** setting, ensure `https://npc-am.com` is listed.

## Env Match (Vercel)

| Variable | Expected Value | Notes |
|----------|----------------|-------|
| `VITE_SUPABASE_URL` | `https://oerqkyzfsdygmmsonrgz.supabase.co` | Must match project ref |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` (JWT) | From Supabase → Settings → API |
| `SUPABASE_URL` | Same as above | For API routes |
| `SUPABASE_ANON_KEY` | Same as VITE_SUPABASE_ANON_KEY | calendar-invite proxy |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role JWT | For server-side only |

**Mismatch symptom:** 404 on every Supabase request, or "project not found".

## Quick Verification

```bash
# From project root, ensure URL matches:
echo $VITE_SUPABASE_URL
# Should contain: oerqkyzfsdygmmsonrgz
```

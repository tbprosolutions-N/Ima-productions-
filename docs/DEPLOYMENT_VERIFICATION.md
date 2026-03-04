# Deployment Verification — npc-am.com (oerqkyzfsdygmmsonrgz)

**Date:** Post-migration deployment  
**Project:** NPC Collective — oerqkyzfsdygmmsonrgz

## Step 4: Database & Auth Configuration Checklist

### VITE_APP_URL
- **Required:** `https://npc-am.com`
- **Where:** Vercel → Project → Settings → Environment Variables
- **Usage:** OAuth redirects in `src/lib/supabase.ts`; fallback `'https://npc-am.com'` if unset

### Supabase Auth → URL Configuration
In [Supabase Dashboard](https://supabase.com/dashboard/project/oerqkyzfsdygmmsonrgz/auth/url-configuration):

| Setting | Value |
|---------|-------|
| **Site URL** | `https://npc-am.com` |
| **Redirect URLs** | `https://npc-am.com`, `https://npc-am.com/login`, `https://npc-am.com/**` |

### Vercel Environment Variables (API Routes)
| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | `https://oerqkyzfsdygmmsonrgz.supabase.co` |
| `SUPABASE_ANON_KEY` | Yes | Same as `VITE_SUPABASE_ANON_KEY` (calendar-invite proxy) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | For `/api/morning`, admin tasks |
| `VITE_SUPABASE_URL` | Yes | Frontend Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Frontend anon key |
| `VITE_APP_URL` | Recommended | `https://npc-am.com` |

### Service Role Key Usage
- **API routes** (`api/morning.ts`, `api/calendar-invite.ts`): Use anon key for calendar-invite proxy; service role for Morning API (bypasses RLS where needed).
- **Edge Functions**: Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically.

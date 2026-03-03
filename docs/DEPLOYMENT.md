# Deployment

## Frontend: Vercel

**Site:** https://npc-am.com

The frontend is deployed on **Vercel**.

### How to deploy

1. **Push to main/master** — Git push triggers an automatic build on Vercel:
   ```bash
   git add -A
   git commit -m "Your message"
   git push origin master:main
   ```
   (Vercel deploys from `main`; ensure your local branch is pushed to `origin/main`.)

2. Vercel builds and deploys automatically. API routes at `/api/morning`, `/api/morning-save-credentials`.

### Build configuration

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Framework:** None (Vite SPA + API routes)

### Environment variables (Vercel Dashboard)

Set in **Vercel → Project → Settings → Environment Variables** (Production + Preview):

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key (JWT) |
| `VITE_APP_URL` | Recommended | `https://npc-am.com` (OAuth redirects) |
| `SUPABASE_URL` | Yes | Same as VITE_SUPABASE_URL (for API routes) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service_role key (for API routes) |

Optional:
- `RESEND_API_KEY` — Only if using Resend from Vercel (emails use Supabase Edge Functions)
- `MORNING_API_KEY` — Not needed; Morning credentials stored per-agency in `integration_secrets`

**Build warning fix:** If you see `npm warn Unknown env config "legacy-peer-dep"`, remove or fix the env var in Vercel: it should be `NPM_CONFIG_LEGACY_PEER_DEPS` (with an **S**), not `NPM_CONFIG_LEGACY_PEER_DEP`.

### Local .env

For local development, copy `.env.example` to `.env` and fill in real values. The postinstall script creates `.env` from `.env.example` if missing. On Vercel/CI, the "No .env found" message is suppressed — Vercel uses dashboard variables.

---

## Backend: Supabase

- **Database:** Supabase (PostgreSQL)
- **Edge Functions:** Deploy manually:
  ```bash
  npx supabase functions deploy send-email
  npx supabase functions deploy send-immediate-alert
  npx supabase functions deploy calendar-invite
  npx supabase functions deploy extract-invoice-vision
  ```

**Supabase secrets** (for Edge Functions):
- `RESEND_API_KEY`, `RESEND_FROM` (e.g. `NPC Collective <noreply@npc-am.com>`)
- `SUPABASE_SERVICE_ROLE_KEY` (injected automatically)
- `GOOGLE_SYSTEM_REFRESH_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (for calendar-invite)

**CORS / הזמנות במייל:** אם הזמנות ליומן לא נשלחות (שגיאת CORS), ודא:
1. `calendar-invite` נפרס: `npx supabase functions deploy calendar-invite`
2. ב-Supabase Dashboard → Authentication → URL Configuration: הוסף `https://www.npc-am.com` ל-Redirect URLs אם האתר נגיש עם www

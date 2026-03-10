# Login Diagnostic Result (automated run)

## What was run

1. **Dev server** started (`npm run dev` → http://localhost:5173).
2. **Login diagnostic script** (`scripts/login-diagnostic.mjs`) ran with Playwright:
   - Opened `/login`
   - Clicked "התחברות באמצעות Google"
   - Checked `/auth/callback` with and without error param
   - Queried Supabase (service role) for `public.users` and `auth.users`

## Findings

| Check | Result |
|-------|--------|
| Login page loads | OK — `/login` loads |
| Click Google | OK — **Redirects to accounts.google.com** (OAuth flow starts) |
| Callback (no code) | OK — Shows "מתחבר" (connecting) |
| public.users | OK — **2 rows** (e.g. modu.general@gmail.com, npcollectivebooking@gmail.com, both owner) |
| auth.users | OK — 2 rows |

**Conclusion:** The app and DB on your machine are set up correctly. Clicking Google sends you to Google sign-in; your user row exists in `public.users`.

## If you still can’t get in on production (npc-am.com)

1. **Redirect URL**  
   In Supabase → Authentication → URL Configuration → Redirect URLs, add exactly:
   ```
   https://npc-am.com/auth/callback
   ```

2. **Vercel env**  
   Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set for the project (and redeploy after changing).

3. **One-time bootstrap on production**  
   If the production DB never got your user row, call the bootstrap API once (see `docs/BOOTSTRAP_GET_ME_IN.md`).

## Run again

```bash
# Start app (in another terminal): npm run dev
npm run login-diagnostic
```

Optional: `LOGIN_DIAG_BASE=https://npc-am.com npm run login-diagnostic` to hit production (no DB check unless env has service role key).

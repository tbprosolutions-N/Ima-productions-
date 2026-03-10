# Get Me In — One-Time Bootstrap for Google Login

If Google login doesn’t work (redirect loop, “profile missing”), your **auth** account exists but your **app user** row is missing. Use one of the two options below.

---

## Option A: Production (npc-am.com) — API bootstrap

1. **Sign in with Google once**  
   Go to https://npc-am.com/login and click “התחברות באמצעות Google”. Complete Google sign-in. You may land on an error or “profile missing” page — that’s OK. This creates your row in `auth.users`.

2. **Add Vercel env vars**  
   In Vercel → Project → Settings → Environment Variables, add:
   - `BOOTSTRAP_SECRET` — any long random string (e.g. `openssl rand -hex 24`)
   - `SUPABASE_SERVICE_ROLE_KEY` — from Supabase → Settings → API (service_role, secret)
   - `SUPABASE_URL` — e.g. `https://oerqkyzfsdygmmsonrgz.supabase.co`  
   Redeploy if needed.

3. **Call the bootstrap API once** (replace values):

   ```bash
   curl -X POST https://npc-am.com/api/bootstrap-user \
     -H "Content-Type: application/json" \
     -d '{"email":"YOUR_GOOGLE_EMAIL@gmail.com","secret":"YOUR_BOOTSTRAP_SECRET"}'
   ```

   You should get: `{"ok":true,"message":"You can now log in at https://npc-am.com/login with Google."}`

4. **Log in again**  
   Go to https://npc-am.com/login and sign in with Google. You should reach the dashboard.

---

## Option B: Local — Script (uses your .env)

If you have a local `.env` with Supabase **service role** key:

1. In `.env`:
   - `VITE_SUPABASE_URL=https://oerqkyzfsdygmmsonrgz.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=your_service_role_key`

2. Run (use your Google email):

   ```bash
   npm run bootstrap-user you@example.com
   ```

   Or: `BOOTSTRAP_EMAIL=you@example.com npm run bootstrap-user`

3. Then log in at https://npc-am.com/login with Google.

---

## If the API says “Auth user not found”

You must complete **one full Google sign-in** so Supabase creates your `auth.users` row.  
Go to https://npc-am.com/login → “התחברות באמצעות Google” → finish Google flow (even if the app then shows an error). Then call the bootstrap API again with the same email.

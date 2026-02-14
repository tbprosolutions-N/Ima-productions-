# Production login & magic link (for tomorrow’s meeting)

## How login works in production

1. **Email + password**  
   Users can sign in at `/login` with company ID, email, and password (Supabase Auth).

2. **Invite (magic link)**  
   An **owner or manager** invites a user from **Settings → ניהול משתמשים** (User management):
   - Fills email, name, role.
   - Clicks “שלח הזמנה” (Send invite).
   - The app calls the **`invite-user`** Edge Function.

3. **What the Edge Function does**
   - If the agency has **Google (Gmail)** connected: creates the user in Supabase Auth, generates a **magic link**, and sends the email **via Gmail API** (from the connected admin’s Gmail).
   - If **no Gmail**: uses **Supabase Auth `inviteUserByEmail`** (email sent by Supabase’s mailer).
   - In both cases the email contains a **magic link**. The user clicks it and is redirected to your app, already logged in.

4. **Redirect after magic link**  
   The link sends the user to a **redirect URL** you control. That URL **must** be allowed in Supabase:

   - **Supabase Dashboard** → **Authentication** → **URL Configuration** → **Redirect URLs**  
   - Add your production app URL, e.g. `https://your-app.netlify.app` or `https://your-domain.com`.  
   - You can also add `https://your-domain.com/login` if you want the link to land on the login page.

5. **Optional: default redirect for magic links**  
   The Edge Function uses, in order:
   - `body.redirectTo` (if the frontend sends it when calling invite-user), or  
   - The env var **`SITE_URL`** (set in Supabase: Project → Edge Functions → Secrets / env).  
   Set **`SITE_URL`** to your production URL (e.g. `https://your-app.netlify.app`) so all magic links go there if the client doesn’t send `redirectTo`.

## Checklist before trying production

- [ ] **Redirect URLs**  
  In Supabase Auth → URL Configuration → Redirect URLs, add the **exact** production URL:
  - `https://npc-am.com`
  - Optionally `https://npc-am.com/login`  
  If this is missing, token refresh or magic-link redirect can fail and the app may kick you back to login.

- [ ] **Netlify env (build + runtime)**  
  In Netlify: Site → Site configuration → Environment variables, set for **Production** (and Build if you build on Netlify):
  - `VITE_SUPABASE_URL` = your Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` = your Supabase anon/public key  
  Without these, the production build cannot talk to Supabase and login will not work.

- [ ] **Edge Function `invite-user` deployed**  
  Deploy with:  
  `npx supabase functions deploy invite-user`  
  (from the project that uses your Supabase project.)

- [ ] **Secrets for `invite-user`**  
  In Supabase: Project → Edge Functions → Secrets (or `supabase secrets set`):
  - **`SUPABASE_SERVICE_ROLE_KEY`** (required).
  - **`SITE_URL`** (optional but recommended): e.g. `https://npc-am.com` — used when the app doesn’t send `redirectTo`; ensures magic links point to your app.
  - For Gmail sending: **`GOOGLE_OAUTH_CLIENT_ID`**, **`GOOGLE_OAUTH_CLIENT_SECRET`** (and agency must have Google connected with Gmail scope in Settings → Integrations).

**If invite email doesn’t send:** The app now returns a **magic link** when automatic email fails (e.g. no Gmail, Supabase mailer not configured). In Settings → ניהול משתמשים, after “שלח הזמנה” a dialog appears with “העתק” — copy that link and send it to the user (email/WhatsApp etc.). The link works the same as the one in the email.

- [ ] **User profile row**  
  After the first magic-link sign-in, the app expects a row in **`public.users`** for that auth user. The **`invite-user`** function creates this row when sending the invite. If you create users manually (e.g. in Supabase Auth dashboard), run **`ensure_user_profile.sql`** or your bootstrap so **`public.users`** gets a row (id, email, full_name, role, agency_id, etc.).

- [ ] **Email not received**  
  - Check spam.  
  - If using Supabase mailer: check Supabase Auth → Logs for send errors; confirm SMTP in Project Settings if you use custom SMTP.  
  - If using Gmail: ensure Google is connected in Settings → Integrations and that the invite is sent again (e.g. “Send link” from the user list).

## Quick test

1. Log in as **owner** (or manager) in production.
2. Go to **Settings** → **ניהול משתמשים**.
3. Add a **new user** (email, name, role) and click **שלח הזמנה**.
4. Check the inbox (and spam) for that email.
5. Open the **magic link** in the same or a new browser; you should land on your app, logged in as that user.

If the link gives “Invalid or expired link”, the redirect URL is likely not in the Redirect URLs list or the link expired (magic links expire after a short time; send a new invite to get a new link).

## If you get kicked out right after login

1. **Redirect URL** – Add `https://npc-am.com` (and `/login` if you use it) under Supabase → Authentication → URL Configuration → Redirect URLs. Without this, token refresh can fail and the app clears the session.
2. **User profile** – Ensure `ensure_user_profile` exists (run `supabase/ensure_user_profile.sql` in Supabase SQL Editor). If the app cannot load your `public.users` row, it may show you as logged out.
3. **Netlify env** – Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Netlify for the production environment, then redeploy so the build has the correct backend.
4. **Code** – The app now retries session read twice (including after a short delay) before clearing auth, so brief token-refresh glitches should no longer log you out. Redeploy to get that fix.

## Deploy from your machine (no interactive prompt)

1. **One-time link** (easiest): Open a terminal **in the project folder** (e.g. `cd c:\Users\tbsol\Downloads\OS`). Then run `npx netlify link`, choose your team and the site that serves **npc-am.com**. After that, `npm run deploy` will work without prompts.  
   **Important:** Do not run Netlify commands from `C:\Windows\system32` — you’ll get EPERM; always `cd` to the project first.
2. **Or use env vars** (e.g. for CI or scripted deploy): In Netlify go to Site configuration → General → Site information and copy **API ID** (Site ID). Create a **Personal access token** at https://app.netlify.com/user/applications#personal-access-tokens. Then run:
   - `set NETLIFY_SITE_ID=<your-site-id>` and `set NETLIFY_AUTH_TOKEN=<your-token>` (Windows)
   - or `export NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=...` (Mac/Linux)
   - then `npm run deploy`.

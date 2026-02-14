# Production Login & Magic Link (Before Your Meeting)

## How login works in production

1. **Owner/Manager** invites a user from **Settings → ניהול משתמשים**: enters email, name, role, and clicks invite.
2. The app calls the **`invite-user`** Edge Function (Supabase).
3. The Edge Function either:
   - **With Google (Gmail) connected**: Creates the user in Supabase Auth, generates a **magic link**, and sends the email via **Gmail API** (from the connected admin’s Gmail).
   - **Without Gmail**: Uses **Supabase Auth `inviteUserByEmail`**, which sends the invite email via **Supabase’s built-in mailer** (SMTP you configure in Supabase Dashboard).
4. The invited user receives an email with a **magic link**. Clicking it signs them in and redirects to your app.

## What you must set for production

### 1. Supabase Auth → URL Configuration

- In **Supabase Dashboard → Authentication → URL Configuration**:
  - **Site URL**: your production app URL (e.g. `https://your-app.netlify.app`).
  - **Redirect URLs**: add the **exact** URL(s) where users land after clicking the magic link, e.g.:
    - `https://your-app.netlify.app`
    - `https://your-app.netlify.app/login`
    - `http://localhost:3001` (if you test locally with production Supabase).

If the magic link redirect URL is not in this list, Supabase will show an error and the user won’t log in.

### 2. Edge Function `invite-user` (required for invite flow)

- Deploy:  
  `npx supabase functions deploy invite-user`
- **Secrets** (Supabase Dashboard → Edge Functions → invite-user → Secrets, or CLI):
  - `SUPABASE_URL` – your project URL (often set by default).
  - `SUPABASE_ANON_KEY` – anon key (often set by default).
  - `SUPABASE_SERVICE_ROLE_KEY` – **required** so the function can create users and generate magic links.
- Optional for **Gmail** sending (otherwise Supabase mailer is used):
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`  
  (And the agency must have Google connected with Gmail scope in Settings → Integrations.)

### 3. Optional: redirect URL for the invite email

- The function uses `SITE_URL` env or the request body field `redirectTo` to build the link.
- If you set **SITE_URL** in Edge Function secrets to your production URL, the magic link will redirect there.
- Otherwise the app can pass `redirectTo` when calling the invite function (if you added that in the UI).

### 4. Email delivery (Supabase mailer)

If you’re **not** using Gmail:

- **Supabase Dashboard → Project Settings → Auth → SMTP Settings**:
  - Enable “Custom SMTP” and set your SMTP server (e.g. SendGrid, Mailgun, or your domain’s SMTP).
- If SMTP is not configured, Supabase may still create the user but **the invite email might not be sent or might go to spam**. Check spam and Supabase Auth logs.

## Testing before the meeting

1. **Deploy** the app (e.g. Netlify) and point it to your **production** Supabase project (same env vars as production).
2. **Run** `supabase/MANUAL_RUN_FINANCE_AND_STORAGE.sql` in the Supabase SQL Editor so finance_expenses and Storage are ready.
3. **Deploy** Edge Functions:
   - `npx supabase functions deploy invite-user`
   - Optional: `npx supabase functions deploy extract-invoice-vision` and set `ANTHROPIC_API_KEY` for invoice extraction.
4. **Create the first user** (if needed):
   - Either use Supabase Dashboard → Authentication → Users → “Add user” and set email/password, then add a row in `public.users` with the same `id`, `agency_id`, `role`.
   - Or run your app’s onboarding/setup flow if it creates an owner.
5. **Invite a test user**: as owner, go to Settings → ניהול משתמשים → add a user with an email you can open.
6. **Check email** (and spam); click the magic link and confirm you land on your app and are logged in.
7. **Finance**: upload an expense file and confirm it saves and shows in “הוצאות אחרונות” (run the SQL above if you haven’t).

## Quick checklist

- [ ] Site URL and Redirect URLs set in Supabase Auth.
- [ ] `invite-user` deployed; `SUPABASE_SERVICE_ROLE_KEY` set.
- [ ] SMTP configured (if not using Gmail) for invite emails.
- [ ] Test invite → receive email → click magic link → login works.
- [ ] Finance: `MANUAL_RUN_FINANCE_AND_STORAGE.sql` run; upload expense and see it in the list.

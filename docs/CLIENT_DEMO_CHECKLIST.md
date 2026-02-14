# Client demo checklist – real app (npc-am.com)

Use this to make sure the **live app** is ready to show today.

---

## Before the meeting (5 min)

### 1. Production URL

- **Real app:** https://npc-am.com  
- Open it in the same browser you’ll use for the demo (Chrome/Edge recommended).

### 2. Netlify env (so login works)

- Netlify → your site (npc-am.com) → **Site configuration** → **Environment variables**
- For **Production** (and **Build** if Netlify builds the site), set:
  - `VITE_SUPABASE_URL` = your Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
- If you add or change variables, trigger a **new deploy** (Deploys → Trigger deploy → Deploy site).

### 3. Supabase redirect URL (stops “kicked out” after login)

- Supabase → **Authentication** → **URL Configuration** → **Redirect URLs**
- Add: `https://npc-am.com`  
  (and `https://npc-am.com/login`)

### 4. Deploy latest code (if you changed anything)

**Option A – Drag & drop (fastest, no terminal link):**
- Build is already done (the **dist** folder in your project is up to date).
- Open [Netlify Deploys](https://app.netlify.com) → your site (npc-am.com) → **Deploys**.
- Drag the folder **`c:\Users\tbsol\Downloads\OS\dist`** into the “Drag and drop your project folder here” area.
- Wait for the deploy to finish; the live site will update.

**Option B – From terminal (after one-time link):**
- Open terminal **in project folder** (`c:\Users\tbsol\Downloads\OS`).
- First time only: `npx netlify link` → choose team and the site that serves npc-am.com.
- Then: `npm run deploy`.

---

## Quick test run (2 min)

1. Go to https://npc-am.com  
2. Log in with your **company ID**, **email**, and **password**.  
3. Confirm you stay on the app (dashboard) and are not sent back to login.  
4. Click: **Dashboard** → **Events** → **Finance** → **Settings** (מראה ותצוגה / Appearance).  
5. If anything fails, check the browser console (F12) and the steps above.

---

## If login fails

- **“המערכת בהגדרה”** → Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify and redeploy.  
- **“Invalid login”** → Wrong email/password or user not in Supabase Auth.  
- **Kicked back to login right after signing in** → Add the production URL to Supabase Redirect URLs (step 3) and, if needed, run `supabase/ensure_user_profile.sql` once in Supabase SQL Editor.

---

## During the demo

- Use the **real app** URL: https://npc-am.com  
- Have a backup: if the live site has issues, run `npm run dev` locally and use **http://localhost:3002** with “Demo login” so you can still show the flow.

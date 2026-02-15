# Why Login Still Doesn't Work

Login fails on **npc-am.com** (or your production URL) when **Supabase does not allow that domain**. The app code is fine; the fix is in the **Supabase Dashboard**.

---

## Do this first (5 minutes)

### 1. Open Supabase

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Open your **project** (the one whose URL and anon key you put in Netlify env vars).

### 2. Open URL Configuration

1. In the left sidebar click **Authentication**.
2. Click **URL Configuration** (or **Providers** → **Auth URL Configuration** depending on UI).

### 3. Set these exactly

| Field | Value |
|-------|--------|
| **Site URL** | `https://npc-am.com` |
| **Redirect URLs** | Add these (one per line if the box has multiple lines): |

```
https://npc-am.com
https://npc-am.com/
https://npc-am.com/login
https://npc-am.com/dashboard
https://npc-am.com/reset-password
```

If the UI supports a wildcard, you can also add: `https://npc-am.com/**`

### 4. Save

1. Click **Save**.
2. Wait 1–2 minutes.
3. Try logging in again on **npc-am.com** (use incognito or clear cache if needed).

---

## Why this fixes it

- Supabase Auth only accepts requests from domains you list.
- If your production URL is not in **Site URL** and **Redirect URLs**, Supabase blocks or ignores the request → you see "Connection Failed" or timeout, and login doesn’t complete.
- After adding **https://npc-am.com** and **https://npc-am.com/login** (and saving), Supabase allows your app and login works.

---

## If it still fails

- Confirm the **project** in Supabase is the same one whose **URL** and **anon key** are in Netlify env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- Confirm the user exists in **Authentication → Users** and the email is **confirmed**.
- Try **incognito** or another browser to rule out cache.
- See **FINAL_SERVER_SETUP.md** for full checklist (storage, RLS, Netlify env, etc.).

# Custom Email Sender: "NPC AGENCY"

Magic-link and auth emails are sent by Supabase. To show **"NPC AGENCY"** and fix delivery, use **Custom SMTP** in Supabase with the correct values below.

## Fix checklist (Supabase Dashboard → Authentication → Emails → SMTP Settings)

| Field | Use this (Gmail example) | ❌ Wrong |
|-------|---------------------------|---------|
| **Sender name** | `NPC AGENCY` | `NPC` or anything else if you want this name |
| **Sender email** | `npcollectivebooking@gmail.com` (or your sending address) | — |
| **Host** | `smtp.gmail.com` | ~~`modu.general@gmail.com`~~ (that’s an email, not a host) |
| **Port** | `465` or `587` | — |
| **Username** | Your full Gmail address, e.g. `npcollectivebooking@gmail.com` | Not a display name like "IMA PRODUCTIONS" |
| **Password** | Gmail **App Password** (Google Account → Security → 2-Step Verification → App passwords) | Not your normal Gmail password |

Then click **Save changes**.

## Steps (one-time)

1. **Supabase Dashboard** → **Authentication** → **Emails** → **SMTP Settings**.
2. Enable **Custom SMTP**.
3. Set **Sender name** to `NPC AGENCY`, **Sender email** to your sending address.
4. Set **Host** to `smtp.gmail.com` (not an email address).
5. Set **Username** to your full Gmail address; **Password** to a Gmail App Password.
6. Save.

After this, magic-link emails will show **"NPC AGENCY"** and should send correctly.

---

## Redirect URLs (fixes 500 and "Auth initialization timed out")

In **Supabase Dashboard** → **Authentication** → **URL Configuration** set:

- **Site URL:** `https://npc-am.com`
- **Redirect URLs:** add both  
  `https://npc-am.com`  
  `https://npc-am.com/login`

Without these, magic-link redirects can return 500 and the app may show "Auth initialization timed out."

**Reference:** [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

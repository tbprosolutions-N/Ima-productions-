# NPC — Delivery Runbook (one page)

**Site:** https://npc-am.com  
**Dist folder:** `c:\Users\tbsol\Downloads\OS\dist`

---

## Before demo

| # | Task | Done |
|---|------|------|
| 1 | Build: `npm run build` | ☐ |
| 2 | Deploy: drag `dist` to Netlify → Deploys, or `npx netlify deploy --prod --dir=dist` | ☐ |
| 3 | Netlify env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` set | ☐ |
| 4 | Supabase → Auth → URL config: Redirect URLs include `https://npc-am.com` and `https://npc-am.com/login` | ☐ |
| 5 | Hard refresh or incognito (avoid old IMA OS / pink cache) | ☐ |

---

## User journey (quick pass)

| # | Page | Check |
|---|------|--------|
| 1 | **Login** | NPC + B&W; Company ID placeholder NPC001; "התחבר" works or shows clear error (then: "נקה התחברות ונסה שוב") |
| 2 | **Dashboard** | KPIs visible; "צור אירוע חדש" + table/filters; "מחולל דוחות" / ייצוא דוח |
| 3 | **Events** | "אירוע חדש" → create/edit/delete; empty → "צור אירוע ראשון" |
| 4 | **Artists** | "הוסף אמן" → CRUD; empty → "הוסף אמן ראשון" |
| 5 | **Clients** | "הוסף לקוח" → CRUD; empty → "הוסף לקוח ראשון" |
| 6 | **Finance** | Period summary; "בחר קבצים" upload; file manager; expense list; empty → hint to upload |
| 7 | **Calendar** | Month view; events or "אין אירועים" |
| 8 | **Documents** | "צור תבנית חדשה" → CRUD; empty → "צור תבנית ראשונה" |
| 9 | **Settings** | Profile, theme (B&W), company name, users (invite), integrations, backup |
| 10 | **Sync** (owner) | Job list + status |

---

## If login times out

1. The app shows the **exact** URLs to add in the error message — add them in **Supabase → Auth → URL Configuration → Redirect URLs**.
2. Click **"נקה התחברות (Auth) ונסה שוב"**, then re-enter Company ID, email, password → **התחבר**.
3. If it still fails: confirm Netlify env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), run `ensure_user_profile.sql` once in Supabase if needed, and check network.  
   **Full details:** `docs/PRODUCTION_AUTH_ERRORS_FIX_REPORT.md`

---

## Open dist folder

- **Path:** `c:\Users\tbsol\Downloads\OS\dist`  
- **In Explorer:** `explorer "c:\Users\tbsol\Downloads\OS\dist"`

# Delivery Day — User Journey Checklist

Use this checklist on the **real site** (**https://npc-am.com**) to verify every page is fully implemented and useful before delivery.

---

## Before you start

- [ ] **Deploy latest build** — Drag `dist` to Netlify Deploys or run `npx netlify deploy --prod --dir=dist`.
- [ ] **Env** — Netlify has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; Supabase Redirect URLs include `https://npc-am.com`.
- [ ] **Hard refresh** or incognito so cache doesn’t show old IMA OS / pink theme.

---

## 1. Login

| Step | What to verify |
|------|----------------|
| Open `/login` | Tab title: **NPC - Agency Management**. UI: black & white (no pink). App name: **NPC**. Placeholder Company ID: **NPC001**. Copyright: **NPC**. |
| Enter Company ID, email, password → התחבר | Either: redirect to dashboard, or clear error (e.g. timeout). If timeout: message suggests "נקה התחברות (Auth) ונסה שוב" and checking Supabase/Redirect URLs. |
| Click "נקה התחברות (Auth) ונסה שוב" | Form stays; auth storage cleared so next login is clean. |
| (Optional) Demo | In dev only: "כניסה בדמו" appears; not on production build. |

**Useful:** Login is the only gate; errors point to retry and Supabase/network.

---

## 2. Dashboard

| Step | What to verify |
|------|----------------|
| After login | Redirect to `/dashboard`. Sidebar shows **NPC** (or company name). Theme: B&W. |
| KPIs | Cards show numbers (or 0): הכנסות, אירועים החודש, תשלומים ממתינים, לקוחות פעילים. Producer: amounts may be hidden (***). |
| Insights | "תובנות" card: either list of insights or "אין תובנות להצגה" (acceptable). |
| Events table | Table with columns (or empty). Filters: search, status, date. "צור אירוע חדש" and "מחולל דוחות" / "ייצוא דוח" buttons work. |
| Empty events | If no events: message like "אין אירועים להצגה" and button "צור אירוע ראשון" (or "צור אירוע חדש"). |
| Report builder | Opens dialog; can pick date range and export. |

**Useful:** Dashboard is the hub; every action (new event, report, export) is reachable.

---

## 3. Events

| Step | What to verify |
|------|----------------|
| Nav → אירועים | Events list (table or cards). "אירוע חדש" button. |
| Empty | "אין אירועים במערכת" (or similar) + "צור אירוע ראשון". |
| Create | Open dialog, fill business name, date, client, artist, optional payout → Save. New row appears. |
| Edit / Delete | Edit opens same dialog; Delete (owner) works. Producer: no delete. |
| Search / filter | Search and filters narrow the list. |

**Useful:** Full CRUD; empty state drives first event creation.

---

## 4. Artists

| Step | What to verify |
|------|----------------|
| Nav → אמנים | List (grid or table). "הוסף אמן" button. |
| Empty | "אין אמנים במערכת" + "הוסף אמן ראשון". |
| Create | Dialog: name, email, phone, payout type, etc. Save → artist appears. |
| Edit | Edit artist; calendar link (production: Google calendar creation if connected). |
| Export | Role allowing: export visible and works. |

**Useful:** Full CRUD; calendar link useful when integrations are connected.

---

## 5. Clients

| Step | What to verify |
|------|----------------|
| Nav → לקוחות | List (grid or table). "הוסף לקוח" button. |
| Empty | "אין לקוחות במערכת" + "הוסף לקוח ראשון". |
| Create / Edit | Dialog: name, contact, etc. Save. |
| Period summary | If available: send period summary (email depends on backend/invite flow). |

**Useful:** Full CRUD; consistent with Events and Artists.

---

## 6. Finance

| Step | What to verify |
|------|----------------|
| Nav → כספים | Visible for finance/manager/owner; hidden or restricted for producer. |
| Period summary | From/To dates, totals (collected, payable, expenses). Producer: amounts may be ***. |
| Upload | "בחר קבצים" or upload area: select file(s) → upload to Storage + expense rows (production) or demo store. Error message if upload fails (no silent failure). |
| File manager | Open file manager: filter by name/period; view/download; delete. Empty: "אין עדיין מסמכים שהועלו" or "אין תוצאות התואמות את הסינון." |
| Expenses list | List/grid of expenses; edit amount/vendor; delete; bulk delete selected. Empty: "אין הוצאות שנרשמו החודש" (upload prompts elsewhere). |
| Checklist | Optional checklist; add/remove items. |
| Sync to Morning | If connected: sync action and status. |

**Useful:** Upload, list, filter, edit, delete, and (when configured) Morning sync are all usable.

---

## 7. Calendar

| Step | What to verify |
|------|----------------|
| Nav → יומן | FullCalendar view (month/week). Events from agency data. |
| Empty month | "אין אירועים בחודש זה" (or similar). |
| Create / Edit | Create event from calendar (if supported) or link to Events. Click event → details or edit. |
| List view | If present: list of events for period. |

**Useful:** Calendar reflects events; navigation and empty state are clear.

---

## 8. Documents

| Step | What to verify |
|------|----------------|
| Nav → מסמכים | List of templates. "צור תבנית חדשה" button. |
| Empty | "אין תבניות במערכת" + "צור תבנית ראשונה". |
| Create template | Dialog: name, body with variables (e.g. `{{event_date}}`, `{{artist_name}}`). Save. |
| Send | Select template, event, recipient; preview; send (delivery depends on backend). |
| Variable hint | UI mentions variables (e.g. {{business_name}}, {{event_date}}). |

**Useful:** Templates CRUD; send flow is available even if email delivery is configured later.

---

## 9. Settings

| Step | What to verify |
|------|----------------|
| Nav → הגדרות | Tabs: פרופיל, מראה ותצוגה, משתמשים, אינטגרציות, גיבוי, וכו'. |
| Profile | Edit name; save. |
| Appearance | Theme (light/dark); accent colour (שחור‑לבן default); language (עברית/English). Save applies. |
| Company name / logo | Owner: edit company name; upload logo (or placeholder NPC). |
| User management | Owner/Manager: list users; add user (email, name, role) → "שלח הזמנה". Invite sends email or shows "העתק" link. Producer: "אין הרשאה" or no tab. |
| Integrations | Google Drive, Calendar, Morning: connect (OAuth or API key). Status and disconnect. |
| Backup | Export JSON; copy or download. |

**Useful:** All key settings (profile, theme, company, users, integrations, backup) are on one page and actionable.

---

## 10. Sync Monitor

| Step | What to verify |
|------|----------------|
| Nav → סנכרון (if visible) | List of sync jobs; status (success/failed/pending). Filters. |
| Empty | "אין משימות" (or similar). |
| Retry | For failed job: retry button (if implemented). |

**Useful:** Visibility into sync status; no dead end.

---

## 11. Onboarding (first login)

| Step | What to verify |
|------|----------------|
| New user, not onboarded | Redirect to setup wizard (e.g. welcome, company name, optional steps). |
| Complete | After completion, redirect to dashboard; sidebar and pages as above. |

**Useful:** First-time path is clear and leads into the app.

---

## Quick pass (minimum for “every page implemented and useful”)

1. **Login** — NPC + B&W; timeout error suggests retry and Supabase.
2. **Dashboard** — KPIs, events table, create event, report/export.
3. **Events** — Create, edit, delete, search; empty state → "צור אירוע ראשון".
4. **Artists** — Create, edit; empty state → "הוסף אמן ראשון".
5. **Clients** — Create, edit; empty state → "הוסף לקוח ראשון".
6. **Finance** — Period summary, upload, file manager, expense list, checklist.
7. **Calendar** — Month view, events or "אין אירועים".
8. **Documents** — Templates list, create, send; empty state → "צור תבנית ראשונה".
9. **Settings** — Profile, theme, company, users, integrations, backup.
10. **Sync** — List and status (and retry if present).

If any step fails (e.g. button does nothing, page blank, or missing CTA on empty), note it and fix before delivery.

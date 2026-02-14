# npc-am.com — Domain Cutover Runbook

**Production URL:** https://npc-am.com  
**Purpose:** Move the live application from the Netlify subdomain to the custom domain npc-am.com so customers use the branded address.

---

## 1. Netlify — Add custom domain

1. **Netlify Dashboard** → Your site → **Domain management** (or **Site configuration** → **Domain management**).
2. Click **Add custom domain** or **Add domain alias**.
3. Enter **npc-am.com**.
4. (Optional) Add **www.npc-am.com** if you want www to work; Netlify can redirect www → apex or vice versa.
5. Netlify will show the **DNS records** you need. Typically:
   - **A record:** `75.2.60.5` (Netlify load balancer) for `npc-am.com`
   - Or **CNAME:** `your-site-name.netlify.app` for `www.npc-am.com` if you use www

---

## 2. DNS (at your registrar)

At the registrar where you purchased **npc-am.com**:

- Add an **A record** for `@` (or `npc-am.com`) pointing to **75.2.60.5** (Netlify’s LB),  
  **or**
- Add a **CNAME** for `@` to `your-netlify-site.netlify.app` (if your registrar supports CNAME on apex; otherwise use A).
- If you use **www**: CNAME `www` → `your-netlify-site.netlify.app`.

Wait for DNS propagation (minutes to 48 hours). In Netlify → Domain management, use **Verify** / **Check DNS** until it shows as verified.

---

## 3. HTTPS (Netlify)

- Netlify provisions a **free TLS certificate** for npc-am.com after DNS is verified.
- Ensure **HTTPS** is enabled (Netlify → Domain settings → HTTPS).
- Optional: **Force HTTPS** so http://npc-am.com redirects to https://npc-am.com.

---

## 4. Supabase Auth — Redirect URLs

Login and magic links **will fail** until the new domain is allowed:

1. **Supabase Dashboard** → **Authentication** → **URL Configuration**.
2. Under **Redirect URLs**, add:
   - `https://npc-am.com`
   - `https://npc-am.com/login`
3. (Optional) Keep the old Netlify URL during transition, then remove after cutover.
4. **Site URL** can be set to `https://npc-am.com` so emails and links use the new domain.

---

## 5. Netlify environment variables

No change required for the domain itself. Ensure for **Production** (and Build if Netlify builds):

- `VITE_SUPABASE_URL` = your Supabase project URL  
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon key  

Redeploy after any env change so the build has the correct values.

---

## 6. Invite-user Edge Function (optional)

If you use **SITE_URL** for magic links:

- Supabase → **Edge Functions** → **invite-user** → **Secrets**
- Set **SITE_URL** = `https://npc-am.com`  
  (so magic links point to npc-am.com when the client doesn’t send `redirectTo`).

---

## 7. Deploy

After DNS and Supabase are set:

- **Option A:** Drag the **dist** folder to Netlify → Deploys.
- **Option B:** From project folder: `npm run build` then `npm run deploy`.

The app will be available at **https://npc-am.com**. The Netlify Function `/.netlify/functions/morning-api` works on the custom domain because the frontend uses `window.location.origin`, so API calls go to `https://npc-am.com/.netlify/functions/morning-api`.

---

## 8. Checklist (before telling customers)

| # | Task | Done |
|---|------|------|
| 1 | Add npc-am.com in Netlify → Domain management | ☐ |
| 2 | Add A (or CNAME) at registrar; wait for DNS verify in Netlify | ☐ |
| 3 | HTTPS enabled and (optional) Force HTTPS in Netlify | ☐ |
| 4 | Supabase Auth → Redirect URLs: `https://npc-am.com`, `https://npc-am.com/login` | ☐ |
| 5 | Netlify env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` set; redeploy if needed | ☐ |
| 6 | Optional: SITE_URL = `https://npc-am.com` for invite-user | ☐ |
| 7 | Deploy latest build; open https://npc-am.com and test login + one full flow | ☐ |

---

## 9. Old Netlify URL

If the site was previously at e.g. **imaproductions.netlify.app** or **npcprod.netlify.app**:

- You can leave that URL as an alias in Netlify so old links still work, **or**
- In Netlify → Domain management, set **npc-am.com** as the primary domain and optionally remove the old subdomain so all traffic uses npc-am.com.

All app code uses `window.location.origin` for API and redirect URLs, so no code changes are required for the domain switch.

# Migration Integrity Audit — npc-am.com (Vercel)

**Date:** Post-migration to client account and npc-am.com domain  
**Scope:** Environment variables, Resend, Supabase, Appointments/Backups, Old references

---

## 1. Environment Variables

### ✅ Correct References
- **Supabase:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — used in `src/lib/supabase.ts`, no hardcoded keys
- **Fallback URL:** `src/lib/supabase.ts` uses `VITE_APP_URL || 'https://npc-am.com'` for OAuth — correct for production
- **Edge Functions:** Use `Deno.env.get("SUPABASE_URL")`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` — server-side only

### ⚠️ Issues

| File | Issue |
|------|-------|
| **.env.example** | Contains real-looking `MORNING_API_KEY` and `MORNING_API_SECRET` values. Replace with placeholders (e.g. `your_morning_api_key`) before committing. Real keys should only be in `.env` (gitignored). |
| **Cloudflare Pages** | Ensure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL=https://npc-am.com` are set in Cloudflare Pages → Settings → Environment variables |

### Localhost (Acceptable)
- `playwright.config.ts`, `tests/e2e/live-verification.spec.ts` — localhost for local E2E; `LIVE_BASE_URL` can override for production tests. No change needed.

---

## 2. Resend Integration

### ⚠️ From Address — Needs Update for @npc-am.com

| File | Current | Required |
|------|---------|----------|
| **src/services/agreementService.ts** | `from: 'NPC Collective <onboarding@resend.dev>'` (hardcoded) | Use `noreply@npc-am.com` or similar after domain verification |
| **supabase/functions/send-email/index.ts** | Uses `RESEND_FROM` env or body.from | Set `RESEND_FROM=NPC Collective <noreply@npc-am.com>` in Supabase secrets |
| **supabase/functions/send-immediate-alert/index.ts** | Fallback: `'NPC Alerts <onboarding@resend.dev>'` | Set `RESEND_FROM` in Supabase so both use production domain |

**Action:** 
1. Verify `npc-am.com` domain in [Resend Dashboard](https://resend.com/domains)
2. Set Supabase secret: `RESEND_FROM=NPC Collective <noreply@npc-am.com>` (or your chosen sender)
3. Update `agreementService.ts` to use `import.meta.env.VITE_EMAIL_FROM` or remove hardcoded fallback so `send-email` uses `RESEND_FROM` when body.from is omitted

### ✅ API Structure
- `send-email` Edge Function: correct schema (`to`, `subject`, `html`, `from?`, `attachments?`)
- `agreementService` passes `to`, `subject`, `html`, `from`, `attachments` — correct

---

## 3. Supabase Connection

### ✅ Correct
- **Client init:** `src/lib/supabase.ts` uses `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — no hardcoded values
- **Production:** Ensure Cloudflare build has these env vars; Supabase project is the client's instance
- **Auth redirects:** Supabase Dashboard → Auth → URL Configuration must include:
  - Site URL: `https://npc-am.com`
  - Redirect URLs: `https://npc-am.com`, `https://npc-am.com/login`, `https://npc-am.com/**`

---

## 4. Appointments & Backups

### Appointments (Events / Calendar)
- Events stored in Supabase `events` table — ✅ correct
- Calendar invite via `calendar-invite` Edge Function — ✅ uses Supabase
- No appointment-specific logic separate from events

### Backups (Sheets / Data Persistence)
- **Sheets sync:** `sheetsSyncClient.ts` uses Google APIs directly from browser + Supabase `integrations` for config — ✅ no Netlify dependency
- **export-to-sheets:** Supabase Edge Function — ✅ correct
- **finance_expenses, events, clients, artists:** All in Supabase — ✅ correct

### Migrations
- 29 migrations in `supabase/migrations/`. Run `supabase db push` or apply via Supabase Dashboard to ensure schema is up to date.
- Latest: `20260311000000_clients_invoice_name_event_time_end.sql`

---

## 5. 🔴 CRITICAL: Morning API — Broken on Cloudflare Pages

| File | Issue |
|------|-------|
| **src/services/morningService.ts** | Calls `/api/morning` and `/api/morning-save-credentials` |
| **src/pages/SettingsPage.tsx** | Calls `/api/morning-save-credentials` |
| **netlify.toml** | Redirects `/api/morning` → `/.netlify/functions/morning-api` |

**Problem:** Cloudflare Pages does **not** have Netlify functions. The `/api/*` routes will 404 or return the SPA. Morning (Green Invoice) integration will **fail** in production.

**Options:**
1. **Migrate to Supabase Edge Function:** Create `morning-api` and `morning-save-credentials` as Supabase Edge Functions; frontend calls `supabase.functions.invoke('morning-api', ...)` instead of `fetch('/api/morning', ...)`
2. **Use Cloudflare Workers:** Deploy equivalent functions as Cloudflare Workers and route `/api/*` via Cloudflare
3. **Proxy:** Keep Morning API on a separate Netlify/Heroku service and set `VITE_MORNING_API_URL` to that service URL; frontend calls that URL directly (requires CORS and auth handling)

---

## 6. Files with Old References (Summary)

| File | Reference | Action |
|------|-----------|--------|
| `src/services/agreementService.ts` | `onboarding@resend.dev` | Use configurable from; set RESEND_FROM |
| `src/services/morningService.ts` | `/api/morning` (Netlify) | Migrate to Supabase Edge Function or Cloudflare Worker |
| `src/pages/SettingsPage.tsx` | `/api/morning-save-credentials` | Same as above |
| `netlify.toml` | Netlify redirects | Deprecated; Morning API not available on Cloudflare |
| `supabase/functions/send-immediate-alert/index.ts` | `onboarding@resend.dev` | Set RESEND_FROM in Supabase |
| `.env.example` | Real-looking MORNING keys | Replace with placeholders |
| `docs/*` | Many "Netlify" references | Update to Cloudflare Pages where relevant |

---

## Database Migrations

To push all 29 pending migrations to the new Supabase instance, run:

```bash
npx supabase db push
```

Or, if using a linked project:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Ensure `SUPABASE_ACCESS_TOKEN` is set (from https://supabase.com/dashboard/account/tokens) or use `supabase login` first.

## Checklist for Production

- [ ] **Vercel env:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL=https://npc-am.com`; `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (for API routes)
- [ ] **Supabase Auth:** Redirect URLs include `https://npc-am.com`, `https://npc-am.com/login`
- [ ] **Resend:** Verify npc-am.com domain; set `RESEND_FROM=NPC Collective <noreply@npc-am.com>` in Supabase secrets
- [ ] **Morning API:** Now on Vercel API routes at `/api/morning`, `/api/morning-save-credentials`
- [ ] **.env.example:** Placeholders only (no real keys)
- [ ] **Migrations:** Run `npx supabase db push` to ensure schema is current

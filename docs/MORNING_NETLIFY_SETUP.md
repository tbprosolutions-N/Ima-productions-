# Morning (Green Invoice) — Netlify Function Setup

The app uses a **Netlify Function** to call the Morning (Green Invoice) API so the **API Secret never runs in the browser**. Production is served at **https://npc-am.com** (Netlify custom domain); the frontend calls `/.netlify/functions/morning-api` using `window.location.origin`, so the same function works on the custom domain.

---

## 1. Environment variables

### Local (`.env` for `netlify dev`)

Already added to `.env` (do not commit; `.env` is in `.gitignore`):

- `MORNING_API_KEY` — API Key ID (e.g. `4a948e28-3aae-411b-8da0-ec1e79ab4c02`)
- `MORNING_API_SECRET` — Secret; **wrap in double quotes** if it contains special characters, and escape any `"` inside with `\"`
- `MORNING_ENV` — e.g. `sandbox`
- `MORNING_BASE_URL` — optional; default `https://api.greeninvoice.co.il/api/v1`
- `SUPABASE_URL` — your Supabase project URL (same as for the app)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase **service_role** key (so the function can read events/clients/artists and update the event). Get it: **Supabase Dashboard → Project Settings → API** → copy the `service_role` secret (not the anon key).

Optional for frontend:

- `VITE_MORNING_ENV=sandbox` — so the UI can show a “Sandbox” badge if desired

### Netlify (Site → Environment variables)

In **Netlify Dashboard → Your site → Site configuration → Environment variables**, add:

| Variable | Value | Scopes |
|----------|--------|--------|
| `MORNING_API_KEY` | Your Green Invoice API Key ID | All |
| `MORNING_API_SECRET` | Your API Secret (paste as-is; Netlify handles special chars) | All |
| `MORNING_ENV` | `sandbox` (or leave empty for production) | All |
| `MORNING_BASE_URL` | Optional; default is production API URL | All |
| `SUPABASE_URL` | Your Supabase project URL | All |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | All |

Do **not** set `VITE_MORNING_API_SECRET` or any `VITE_` variable for the secret — that would expose it in the client bundle.

---

## 2. Flow

1. User clicks **“סנכרן Morning”** on an event row (Events page).
2. Frontend calls `POST /.netlify/functions/morning-api` with `{ action: 'createDocument', agencyId, eventId }`.
3. The Netlify Function:
   - Reads `MORNING_API_KEY` and `MORNING_API_SECRET` from `process.env`
   - Gets a JWT from Green Invoice `POST /account/token`
   - Loads the event (and client/artist) from Supabase
   - Creates a document with `POST /documents`
   - Updates the event in Supabase (`morning_sync_status`, `morning_document_id`, etc.)
4. Frontend gets `{ ok: true, docId, docNumber, docUrl }` and refetches events.

---

## 3. Verification

1. **Deploy** the site to Netlify (with the function in `netlify/functions/morning-api.ts` and env vars set).
2. Open **Events**, pick an event that has a client and amount.
3. Click **“סנכרן Morning”**.
4. You should see “המסמך נוצר ב־Morning בהצלחה ✅” and the row should show “סונכרן בהצלחה” and optionally “פתח מסמך”.
5. In the Green Invoice Sandbox (or production) dashboard, confirm the new document exists.

If the function returns 500/502, check Netlify Function logs (Netlify Dashboard → Functions → morning-api → Logs) and that all env vars are set (no extra spaces, secret in one line).

---

## 4. Files

| File | Role |
|------|------|
| `netlify/functions/morning-api.ts` | Netlify Function: token + create document, reads event from Supabase, updates event. |
| `src/services/morningService.ts` | Frontend: calls `/.netlify/functions/morning-api` with `createDocument`. |
| `src/pages/EventsPage.tsx` | Sync button calls `createEventDocument(agencyId, eventId)` when not in demo mode. |
| `.env` | Local env for `netlify dev` (MORNING_*, SUPABASE_*; do not commit). |
| `.env.example` | Template and documentation for Morning and Supabase vars. |

Demo mode (e.g. “Demo login”) still uses the **mock** flow (localStorage and simulated sync). Production and normal login use the Netlify Function and real Morning API.

# Google Integration Setup & Debugging

This guide covers OAuth configuration for Google Calendar, Drive, Gmail, and Sheets.

---

## 1. Redirect URI (CRITICAL)

**GOOGLE_OAUTH_REDIRECT_URI** must be set in Supabase secrets to:

```
https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/google-oauth-callback
```

Example: `https://abcdefghij.supabase.co/functions/v1/google-oauth-callback`

**Google Cloud Console** → APIs & Services → Credentials → OAuth 2.0 Client → Authorized redirect URIs must include **the exact same URL**.

---

## 2. Google Cloud Console Checklist

### OAuth consent screen
- [ ] App name and support email set
- [ ] **Publishing status**: If "Testing", only users in "Test users" can sign in. Add your email to Test users or set to "In production" for all users.
- [ ] Scopes: Add the ones used by the app (see below)

### Credentials
- [ ] Create OAuth 2.0 Client ID (Web application)
- [ ] **Authorized redirect URIs**: Add `https://<project>.supabase.co/functions/v1/google-oauth-callback`
- [ ] Copy Client ID and Client Secret

### Required scopes (match these in Google Console)
```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/spreadsheets
```

---

## 3. Supabase Secrets

In **Supabase Dashboard** → Project Settings → Edge Functions → Secrets, set:

| Secret | Required | Description |
|--------|----------|-------------|
| `GOOGLE_OAUTH_CLIENT_ID` | ✅ | From Google Cloud Console |
| `GOOGLE_OAUTH_CLIENT_SECRET` | ✅ | From Google Cloud Console |
| `GOOGLE_OAUTH_REDIRECT_URI` | ✅ | `https://<project>.supabase.co/functions/v1/google-oauth-callback` |
| `SITE_URL` | Optional | `https://npc-am.com` (for returnTo validation) |
| `GOOGLE_CALENDAR_WEBHOOK_URL` | For Calendar | `https://<project>.supabase.co/functions/v1/google-calendar-webhook` |

---

## 4. Deploy Edge Functions

```bash
npx supabase functions deploy google-oauth-start
npx supabase functions deploy google-oauth-callback
```

---

## 5. CORS

- **google-oauth-start**: Invoked via `supabase.functions.invoke()` from the frontend. Supabase handles CORS for the Functions URL. No changes needed.
- **invite-user**: Returns CORS headers. If you get CORS errors when calling from npc-am.com, ensure the request includes `Authorization: Bearer <anon_key>` and the Origin is allowed. Supabase Edge Functions allow `*` by default.

---

## 6. Common Failures

| Error | Fix |
|-------|-----|
| `redirect_uri_mismatch` | Redirect URI in Google Console must exactly match GOOGLE_OAUTH_REDIRECT_URI |
| `access_denied` / `consent_required` | App in Testing mode — add user to Test users or publish app |
| `Missing server configuration` | Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_REDIRECT_URI in Supabase secrets |
| `Token exchange failed` | Verify CLIENT_SECRET; ensure redirect_uri matches exactly |
| CORS on invite-user | Edge Function already returns CORS headers; check network tab for actual error |

---

## 7. Verify Flow

1. Settings → Integrations → Connect Google
2. Redirects to Google sign-in
3. After consent, redirects to google-oauth-callback (Supabase)
4. Callback exchanges code for tokens, stores in DB, redirects to SITE_URL or returnTo (e.g. /settings?tab=integrations)

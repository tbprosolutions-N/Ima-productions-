# Calendar System Setup (Behind the Scenes)

Calendar invites are sent automatically when Alon saves an event. No manual "Connect Google" required.

## Required: System Refresh Token

Set in Supabase Dashboard → Project Settings → Edge Functions → Secrets:

| Secret | Description |
|--------|-------------|
| `GOOGLE_SYSTEM_REFRESH_TOKEN` | Refresh token for the system Google account (NPC's calendar) |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client ID (same app that issued the refresh token) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth client secret |

## Optional

| Secret | Default | Description |
|--------|---------|-------------|
| `GOOGLE_SYSTEM_CALENDAR_ID` | `primary` | Calendar ID to write events to |

## How to get the refresh token

1. Use the same OAuth app (GOOGLE_OAUTH_CLIENT_ID/SECRET) to complete a one-time OAuth flow with the system Google account (e.g. npcollectivebooking@gmail.com).
2. Capture the `refresh_token` from the token response.
3. Store it as `GOOGLE_SYSTEM_REFRESH_TOKEN` in Supabase secrets.

## Flow

1. Alon saves an event (create or update) with "שלח הזמנה" checked.
2. Frontend calls `calendar-invite` Edge Function with `{ event_id, send_invites: true }`.
3. Function uses system refresh token to get access token, then calls Google Calendar API with `sendUpdates='all'`.
4. Artist and client receive invite emails from the system Google account.

## Fallback (optional)

If `GOOGLE_SYSTEM_REFRESH_TOKEN` is not set, the function looks for a row in `integration_tokens` with:
- `agency_id = '00000000-0000-0000-0000-000000000000'`
- `provider = 'google'`

You would need to create this row manually (e.g. after a one-time OAuth with the system account).

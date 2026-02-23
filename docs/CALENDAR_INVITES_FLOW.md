# Calendar Invites Flow

## Overview

When an event is created or updated, two flows run in parallel:

### 1. Google Calendar Invite (sync-runner)

- **Trigger:** EventsPage queues `calendar_upsert` to `sync_jobs` and calls `trigger-sync` Edge Function.
- **Flow:** `trigger-sync` → `sync-runner` → `googleCalendarUpsert` → Google Calendar API with `sendUpdates: "all"`.
- **Result:** Artist and client receive a **Google Calendar invite** (from the organizer's connected Google account). The invite is added to their calendar.

### 2. Resend Email Invitation (send-immediate-alert)

- **Trigger:** Database Webhook on `events` INSERT → `send-immediate-alert` Edge Function.
- **Flow:** Fetches artist (calendar_email) and client (email), sends Resend invite to each.
- **Result:** Artist and client receive an **email invitation** via Resend (subject: "הזמנה לאירוע — …").

### Requirements

- **Google Calendar:** Settings → Integrations → Connect Google (Calendar scope). Tokens stored in `integration_tokens`.
- **Resend:** `RESEND_API_KEY` and `RESEND_FROM` in Supabase secrets. Set in Resend Dashboard → Domains.
- **Database Webhook:** Supabase Dashboard → Database → Webhooks → Create hook on `events`, INSERT, target `send-immediate-alert`.

### Once domain is active

When the Resend domain is verified and DNS is active, Resend will stop returning 403 and all invitation emails will deliver successfully.

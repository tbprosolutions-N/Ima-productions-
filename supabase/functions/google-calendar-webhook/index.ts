// Supabase Edge Function: google-calendar-webhook
// Receives Google Calendar push notifications and enqueues a sync job.
//
// Google sends headers:
// - X-Goog-Channel-ID
// - X-Goog-Resource-ID
// - X-Goog-Resource-State
// - X-Goog-Channel-Token (if provided when creating the channel)
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Behavior:
// - Validate channel by matching integrations(provider='google').config.calendar_watch.channel_id + token
// - Enqueue sync_jobs(provider='google', kind='calendar_pull')

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function ok() {
  return new Response("ok", { status: 200 });
}

serve(async (req) => {
  // Google uses POST for notifications, but be permissive.
  const channelId = req.headers.get("x-goog-channel-id") || "";
  const resourceId = req.headers.get("x-goog-resource-id") || "";
  const state = req.headers.get("x-goog-resource-state") || "";
  const token = req.headers.get("x-goog-channel-token") || "";

  // Always ACK quickly to avoid retries/timeouts.
  if (!channelId) return ok();

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!SUPABASE_URL || !SERVICE_ROLE) return ok();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Look up watch by channel id (server-only table)
  const { data: watch } = await admin
    .from("google_calendar_watches")
    .select("id,agency_id,channel_token,calendar_id,scope,artist_id")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (!watch?.agency_id) return ok();
  const expectedToken = String((watch as any).channel_token || "");
  if (expectedToken && token && expectedToken !== token) return ok();

  // Track receive time (best-effort)
  await admin
    .from("google_calendar_watches")
    .update({ last_received_at: new Date().toISOString() } as any)
    .eq("id", (watch as any).id);

  // Enqueue pull job (runner processes it)
  await admin.from("sync_jobs").insert([
    {
      agency_id: (watch as any).agency_id,
      provider: "google",
      kind: "calendar_pull",
      status: "pending",
      payload: {
        watch_id: (watch as any).id,
        calendar_id: (watch as any).calendar_id,
        scope: (watch as any).scope,
        artist_id: (watch as any).artist_id,
        channel_id: channelId,
        resource_id: resourceId,
        resource_state: state,
        received_at: new Date().toISOString(),
      },
    } as any,
  ]);

  return ok();
});


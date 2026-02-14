// Supabase Edge Function: google-calendar-watch
// Creates a Google Calendar push notification "watch" for company calendar events.
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - GOOGLE_OAUTH_CLIENT_ID
// - GOOGLE_OAUTH_CLIENT_SECRET
// - GOOGLE_CALENDAR_WEBHOOK_URL (public URL of google-calendar-webhook function)
//
// Uses server-only tokens stored in public.integration_tokens.
// Stores watch channel info + syncToken in public.google_calendar_watches (server-only)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

function parseIsoDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isExpiredSoon(expiry: Date | null, skewSeconds = 120) {
  if (!expiry) return false;
  return expiry.getTime() - Date.now() <= skewSeconds * 1000;
}

async function refreshGoogleAccessToken(args: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      refresh_token: args.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  const json = await res.json() as { access_token?: string; expires_in?: number; scope?: string; token_type?: string };
  return {
    access_token: json.access_token || "",
    expires_in: json.expires_in || 3600,
    scope: json.scope,
    token_type: json.token_type,
  };
}

async function googleApiFetch(accessToken: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Google API error ${res.status}: ${await res.text()}`);
  return res;
}

type TokenRow = {
  id: string;
  agency_id: string;
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  token_type: string | null;
  expiry_date: string | null;
};

type IntegrationRow = {
  id: string;
  agency_id: string;
  provider: "google";
  status: string;
  config: Record<string, unknown> | null;
};

async function stopChannel(accessToken: string, channelId: string, resourceId: string) {
  if (!channelId || !resourceId) return;
  // channels.stop does not require content-type but we keep JSON
  await googleApiFetch(accessToken, "https://www.googleapis.com/calendar/v3/channels/stop", {
    method: "POST",
    body: JSON.stringify({ id: channelId, resourceId }),
  });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const GOOGLE_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
  const GOOGLE_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "";
  const WEBHOOK_URL = Deno.env.get("GOOGLE_CALENDAR_WEBHOOK_URL") || "";

  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Missing Supabase secrets" }, 500);
  if (!GOOGLE_ID || !GOOGLE_SECRET) return json({ error: "Missing Google OAuth secrets" }, 500);
  if (!WEBHOOK_URL) return json({ error: "Missing GOOGLE_CALENDAR_WEBHOOK_URL" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const body = await req.json().catch(() => ({}));
  const agencyId = String((body as any)?.agencyId || "").trim();
  if (!agencyId) return json({ error: "agencyId is required" }, 400);

  // Calendar id can be configured; default primary
  const calendarId = String((body as any)?.calendarId || "primary").trim() || "primary";

  const { data: tok, error: tokErr } = await admin
    .from("integration_tokens")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("provider", "google")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tokErr) return json({ error: tokErr.message }, 500);
  const token = tok as TokenRow | null;
  if (!token?.access_token) return json({ error: "No Google token found for agency" }, 400);

  let accessToken = token.access_token;
  const expiry = parseIsoDate(token.expiry_date);
  if (token.refresh_token && isExpiredSoon(expiry)) {
    const refreshed = await refreshGoogleAccessToken({
      clientId: GOOGLE_ID,
      clientSecret: GOOGLE_SECRET,
      refreshToken: token.refresh_token,
    });
    accessToken = refreshed.access_token;
    const nextExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await admin
      .from("integration_tokens")
      .update({ access_token: accessToken, expiry_date: nextExpiry, scope: refreshed.scope || token.scope, token_type: refreshed.token_type || token.token_type })
      .eq("id", token.id);
  }

  // Create a channel
  const channelId = uuid();
  const channelToken = uuid(); // used to verify webhook authenticity (shared secret per channel)

  // Get an initial syncToken (lightweight list)
  const listRes = await googleApiFetch(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=1&singleEvents=true&showDeleted=true`,
  );
  const listJson = await listRes.json() as { nextSyncToken?: string };
  const syncToken = listJson.nextSyncToken || null;

  // Start watch
  // TTL max varies; we use ~6 days (in seconds). Google may cap shorter.
  const ttlSeconds = 6 * 24 * 60 * 60;
  const watchRes = await googleApiFetch(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: "POST",
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: WEBHOOK_URL,
        token: channelToken,
        params: { ttl: String(ttlSeconds) },
      }),
    },
  );
  const watch = await watchRes.json() as { resourceId?: string; expiration?: string };

  // Persist into google_calendar_watches (company scope). Stop old channel if exists.
  const { data: existingWatch } = await admin
    .from("google_calendar_watches")
    .select("id,channel_id,resource_id")
    .eq("agency_id", agencyId)
    .eq("scope", "company")
    .eq("calendar_id", calendarId)
    .maybeSingle();

  if (existingWatch?.channel_id && existingWatch?.resource_id) {
    try {
      await stopChannel(accessToken, String(existingWatch.channel_id), String(existingWatch.resource_id));
    } catch {
      // ignore stop errors; new watch still works
    }
  }

  const expirationIso = watch.expiration ? new Date(Number(watch.expiration)).toISOString() : null;
  if (existingWatch?.id) {
    const { error: wErr } = await admin
      .from("google_calendar_watches")
      .update({
        channel_id: channelId,
        channel_token: channelToken,
        resource_id: watch.resourceId || null,
        expiration: expirationIso,
        sync_token: syncToken,
        last_pulled_at: null,
      } as any)
      .eq("id", existingWatch.id);
    if (wErr) return json({ error: wErr.message }, 500);
  } else {
    const { error: wErr } = await admin.from("google_calendar_watches").insert([
      {
        agency_id: agencyId,
        scope: "company",
        calendar_id: calendarId,
        channel_id: channelId,
        channel_token: channelToken,
        resource_id: watch.resourceId || null,
        expiration: expirationIso,
        sync_token: syncToken,
      } as any,
    ]);
    if (wErr) return json({ error: wErr.message }, 500);
  }

  // Keep minimal integration config for calendar id
  const { data: googleConn } = await admin
    .from("integrations")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("provider", "google")
    .maybeSingle();
  const existing = (googleConn as IntegrationRow | null)?.config || {};
  const nextConfig = {
    ...(existing || {}),
    company_calendar_id: calendarId,
  };

  const { error: upErr } = await admin.from("integrations").upsert(
    [
      {
        agency_id: agencyId,
        provider: "google",
        status: "connected",
        config: nextConfig,
        connected_at: nowIso(),
      } as any,
    ],
    { onConflict: "agency_id,provider" },
  );
  if (upErr) return json({ error: upErr.message }, 500);

  return json({
    ok: true,
    agencyId,
    calendarId,
    channelId,
    resourceId: watch.resourceId || null,
    expiration: watch.expiration || null,
    syncToken: syncToken ? "stored" : null,
  });
});


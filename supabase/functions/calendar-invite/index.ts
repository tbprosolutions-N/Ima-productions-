/**
 * Edge Function: calendar-invite
 * Direct Google Calendar invite — called immediately when event is created/updated.
 * Uses system-wide Google token (no per-user "Connect Google" required).
 * sendUpdates='all' so artists get email in inbox.
 *
 * Body: { event_id: string, send_invites?: boolean }
 * Requires: JWT (user must be authenticated)
 * Secrets: GOOGLE_SYSTEM_REFRESH_TOKEN, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
 * Optional: GOOGLE_SYSTEM_CALENDAR_ID (default: "primary")
 *
 * Fallback: integration_tokens row with agency_id = '00000000-0000-0000-0000-000000000000' (system)
 *
 * Deploy: npx supabase functions deploy calendar-invite
 */

// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function addDaysIsoDate(dateIso: string, days: number) {
  const d = new Date(dateIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addOneHour(timeStr: string): string {
  const parts = timeStr.split(":").map((p) => parseInt(p, 10) || 0);
  let h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  h = (h + 1) % 24;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
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

async function refreshGoogleToken(args: {
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
  const data = (await res.json()) as { access_token?: string; expires_in?: number; scope?: string; token_type?: string };
  return {
    access_token: data.access_token || "",
    expires_in: data.expires_in || 3600,
    scope: data.scope,
    token_type: data.token_type,
  };
}

async function googleApiFetch(accessToken: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Google API error ${res.status}: ${await res.text()}`);
  return res;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const GOOGLE_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim();
  const GOOGLE_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return json({ error: "Server not configured" }, 502);
  }
  if (!GOOGLE_ID || !GOOGLE_SECRET) {
    return json({ error: "Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET." }, 502);
  }

  let body: { event_id?: string; send_invites?: boolean; access_token?: string };
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const eventId = typeof body?.event_id === "string" ? body.event_id.trim() : "";
  if (!eventId) return json({ error: "Missing event_id" }, 400);
  const sendInvites = body?.send_invites !== false;

  // User JWT: from body.access_token (client sends anon key in Authorization for platform, user JWT in body)
  const userJwt = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.replace("Bearer ", "").trim() || "";

  const jwt = userJwt || bearerToken;
  if (!jwt) return json({ error: "Missing or invalid authorization" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

  let userId: string;
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    userId = payload?.sub;
    if (!userId) throw new Error("No sub in JWT");
  } catch {
    return json({ error: "Invalid token" }, 401);
  }

  const { data: userRow } = await admin
    .from("users")
    .select("agency_id")
    .eq("id", userId)
    .maybeSingle();
  const agencyId = (userRow as { agency_id?: string } | null)?.agency_id;
  if (!agencyId) return json({ error: "User has no agency" }, 403);

  // System-wide Google token: GOOGLE_SYSTEM_REFRESH_TOKEN (secret) or integration_tokens system row
  const SYSTEM_AGENCY_ID = "00000000-0000-0000-0000-000000000000";
  const systemRefreshToken = Deno.env.get("GOOGLE_SYSTEM_REFRESH_TOKEN")?.trim();

  let accessToken = "";
  let calendarId = String(Deno.env.get("GOOGLE_SYSTEM_CALENDAR_ID")?.trim() || "primary");

  if (systemRefreshToken) {
    // Use system secret — refresh every time (no persistence; stateless)
    const refreshed = await refreshGoogleToken({
      clientId: GOOGLE_ID,
      clientSecret: GOOGLE_SECRET,
      refreshToken: systemRefreshToken,
    });
    accessToken = refreshed.access_token;
  } else {
    // Fallback: integration_tokens system row (agency_id = system UUID)
    const { data: tokenRow, error: tokErr } = await admin
      .from("integration_tokens")
      .select("*")
      .eq("agency_id", SYSTEM_AGENCY_ID)
      .eq("provider", "google")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tokErr) return json({ error: tokErr.message }, 500);
    if (!tokenRow?.access_token && !(tokenRow as any)?.refresh_token) {
      return json({
        error: "Google Calendar not configured. Set GOOGLE_SYSTEM_REFRESH_TOKEN in Supabase secrets, or add a system row to integration_tokens.",
      }, 502);
    }
    accessToken = (tokenRow as any).access_token || "";
    const expiry = parseIsoDate((tokenRow as any).expiry_date);
    if ((tokenRow as any).refresh_token && isExpiredSoon(expiry)) {
      const refreshed = await refreshGoogleToken({
        clientId: GOOGLE_ID,
        clientSecret: GOOGLE_SECRET,
        refreshToken: (tokenRow as any).refresh_token,
      });
      accessToken = refreshed.access_token;
      const nextExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await admin
        .from("integration_tokens")
        .update({
          access_token: accessToken,
          expiry_date: nextExpiry,
          scope: refreshed.scope || (tokenRow as any).scope,
          token_type: refreshed.token_type || (tokenRow as any).token_type,
        })
        .eq("id", (tokenRow as any).id);
    }
    // Optional: system integrations row for calendar_id override
    const { data: sysConn } = await admin
      .from("integrations")
      .select("config")
      .eq("agency_id", SYSTEM_AGENCY_ID)
      .eq("provider", "google")
      .maybeSingle();
    const cfg = ((sysConn as any)?.config || {}) as any;
    if (cfg?.company_calendar_id) calendarId = String(cfg.company_calendar_id);
  }

  // Fetch event + artist + client
  const { data: ev, error: evErr } = await admin
    .from("events")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("id", eventId)
    .single();
  if (evErr || !ev) return json({ error: "Event not found or access denied" }, 404);

  const artistId = (ev as any).artist_id;
  const clientId = (ev as any).client_id;

  const [{ data: artist }, { data: client }] = await Promise.all([
    artistId
      ? admin.from("artists").select("id,name,email,calendar_email,google_calendar_id").eq("agency_id", agencyId).eq("id", artistId).maybeSingle()
      : Promise.resolve({ data: null }),
    clientId
      ? admin.from("clients").select("id,email").eq("agency_id", agencyId).eq("id", clientId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const eventDate = new Date((ev as any).event_date).toISOString().slice(0, 10);
  const eventTime = String((ev as any).event_time || "").trim();
  const eventTimeEnd = String((ev as any).event_time_end || "").trim();
  // Use time slots when we have at least start time; if no end, use start + 1 hour
  const hasTimeSlots = !!eventTime;

  const summaryParts = [String((ev as any).business_name || "אירוע")];
  if ((artist as any)?.name) summaryParts.push(String((artist as any).name));
  const summary = summaryParts.join(" · ");

  const attendees: { email: string }[] = [];
  const artistEmail = String(((artist as any)?.calendar_email || (artist as any)?.email || "")).trim();
  if (artistEmail) attendees.push({ email: artistEmail });
  const clientEmail = ((client as any)?.email || "").trim();
  if (clientEmail) attendees.push({ email: clientEmail });

  // Clean, client-facing description: ONLY שם העסק, שם בחשבונית, הערות (no Event ID, Amount, Status)
  const bizName = String((ev as any).business_name || "").trim();
  const invName = String((ev as any).invoice_name || "").trim();
  const notes = String((ev as any).notes || "").trim();
  const descParts: string[] = [];
  if (bizName) descParts.push(`שם העסק: ${bizName}`);
  if (invName) descParts.push(`שם בחשבונית: ${invName}`);
  if (notes) descParts.push(`הערות: ${notes}`);
  const description = descParts.length > 0 ? descParts.join("\n") : "";

  // MUST use start.dateTime and end.dateTime for timed events (not date = all-day)
  const TZ = "Asia/Jerusalem";
  let start: { date?: string; dateTime?: string; timeZone?: string };
  let end: { date?: string; dateTime?: string; timeZone?: string };
  if (hasTimeSlots) {
    const toHms = (t: string) => (t.split(":").length >= 3 ? t : `${t}:00`);
    const startHms = toHms(eventTime);
    const endHms = eventTimeEnd ? toHms(eventTimeEnd) : addOneHour(eventTime);
    const startDt = `${eventDate}T${startHms}`;
    const endDt = `${eventDate}T${endHms}`;
    start = { dateTime: startDt, timeZone: TZ };
    end = { dateTime: endDt, timeZone: TZ };
  } else {
    const endDate = addDaysIsoDate(`${eventDate}T00:00:00.000Z`, 1);
    start = { date: eventDate };
    end = { date: endDate };
  }

  const eventBody = {
    summary,
    description,
    start,
    end,
    attendees: attendees.length > 0 ? attendees : undefined,
    guestsCanModify: true,
    extendedProperties: {
      private: {
        ima_agency_id: agencyId,
        ima_event_id: eventId,
      },
    },
  };

  const existingGoogleEventId = String((ev as any).google_event_id || "");
  const existingArtistGoogleEventId = String((ev as any).google_artist_event_id || "");
  // sendUpdates='all' — artists get email notification in their inbox
  const sendUpdates = sendInvites ? "all" : "none";

  try {
    let result: any;
    if (existingGoogleEventId) {
      const res = await googleApiFetch(
        accessToken,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingGoogleEventId)}?sendUpdates=${encodeURIComponent(sendUpdates)}`,
        { method: "PATCH", body: JSON.stringify(eventBody) }
      );
      result = await res.json();
    } else {
      const res = await googleApiFetch(
        accessToken,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${encodeURIComponent(sendUpdates)}`,
        { method: "POST", body: JSON.stringify(eventBody) }
      );
      result = await res.json();
    }

    let artistResult: any = null;
    const artistCalendarId = String((artist as any)?.google_calendar_id || "").trim();
    if (artistCalendarId) {
      if (existingArtistGoogleEventId) {
        const res = await googleApiFetch(
          accessToken,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(artistCalendarId)}/events/${encodeURIComponent(existingArtistGoogleEventId)}?sendUpdates=${encodeURIComponent(sendUpdates)}`,
          { method: "PATCH", body: JSON.stringify(eventBody) }
        );
        artistResult = await res.json();
      } else {
        const res = await googleApiFetch(
          accessToken,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(artistCalendarId)}/events?sendUpdates=${encodeURIComponent(sendUpdates)}`,
          { method: "POST", body: JSON.stringify(eventBody) }
        );
        artistResult = await res.json();
      }
    }

    await admin
      .from("events")
      .update({
        google_event_id: result?.id || null,
        google_event_html_link: result?.htmlLink || null,
        google_artist_event_id: artistResult?.id || (artistCalendarId ? null : undefined),
        google_artist_event_html_link: artistResult?.htmlLink || (artistCalendarId ? null : undefined),
        google_sync_status: "synced",
        google_synced_at: nowIso(),
      } as any)
      .eq("agency_id", agencyId)
      .eq("id", eventId);

    return json({
      ok: true,
      calendarId,
      google_event_id: result?.id,
      htmlLink: result?.htmlLink,
      attendees: attendees.map((a) => a.email),
      sendUpdates,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[calendar-invite] Error:", msg);
    return json({ error: msg }, 502);
  }
});

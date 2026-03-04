/**
 * Edge Function: calendar-invite
 * Creates a Google Calendar event and sends email invitations.
 * If Google Calendar is unavailable (expired/revoked token), falls back to Resend email.
 *
 * Body: { event_id: string, send_invites?: boolean, access_token?: string }
 * Secrets: GOOGLE_SYSTEM_REFRESH_TOKEN, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
 *          RESEND_API_KEY, RESEND_FROM
 */

// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend";
import { corsHeaders } from "../_shared/cors.ts";

const CORS = corsHeaders;

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
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    return await handleRequest(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[calendar-invite] Unhandled exception:", msg);
    return json({ error: msg }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const GOOGLE_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim();
  const GOOGLE_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return json({ error: "Server not configured" }, 502);
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
    .select("agency_id, full_name")
    .eq("id", userId)
    .maybeSingle();
  const agencyId = (userRow as { agency_id?: string } | null)?.agency_id;
  const organizerName = String((userRow as { full_name?: string } | null)?.full_name || "").trim();
  if (!agencyId) return json({ error: "User has no agency" }, 403);

  // ── Step 1: Fetch event + artist + client (always needed) ──────────────────
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
      ? admin.from("clients").select("id,name,email").eq("agency_id", agencyId).eq("id", clientId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const eventDate = new Date((ev as any).event_date).toISOString().slice(0, 10);
  const eventTime = String((ev as any).event_time || "").trim();
  const eventTimeEnd = String((ev as any).event_time_end || "").trim();
  const hasTimeSlots = !!eventTime;

  const summaryParts = [String((ev as any).business_name || "אירוע")];
  if ((artist as any)?.name) summaryParts.push(String((artist as any).name));
  const summary = summaryParts.join(" · ");

  const attendees: { email: string }[] = [];
  const seenEmails = new Set<string>();
  const artistEmail = String(((artist as any)?.calendar_email || (artist as any)?.email || "")).trim();
  if (artistEmail && !seenEmails.has(artistEmail.toLowerCase())) {
    attendees.push({ email: artistEmail });
    seenEmails.add(artistEmail.toLowerCase());
  }
  const clientEmail = ((client as any)?.email || "").trim();
  if (clientEmail && !seenEmails.has(clientEmail.toLowerCase())) {
    attendees.push({ email: clientEmail });
    seenEmails.add(clientEmail.toLowerCase());
  }

  const clientName = String((client as any)?.name || "").trim();
  const artistName = String((artist as any)?.name || "").trim();
  const amount = Number((ev as any).amount) || 0;
  const amountStr = amount > 0 ? `₪${amount.toLocaleString("he-IL")}` : "";
  const hoursStr = hasTimeSlots
    ? (eventTimeEnd ? `${eventTime} - ${eventTimeEnd}` : eventTime)
    : "";
  const location = String((ev as any).location || "").trim();

  const descParts: string[] = [];
  if (clientName) descParts.push(`שם הלקוח: ${clientName}`);
  if (artistName) descParts.push(`שם האמן: ${artistName}`);
  if (amountStr) descParts.push(`סכום האירוע: ${amountStr}`);
  if (hoursStr) descParts.push(`שעות האירוע: ${hoursStr}`);
  if (organizerName) descParts.push(`מארגן: ${organizerName}`);
  const notes = String((ev as any).notes || "").trim();
  if (notes) descParts.push(`הערות: ${notes}`);
  const description = descParts.join("\n");

  // ── Step 2: Try to acquire Google access token ─────────────────────────────
  let accessToken = "";
  let googleTokenError = "";
  const SYSTEM_AGENCY_ID = "00000000-0000-0000-0000-000000000000";
  let calendarId = String(Deno.env.get("GOOGLE_SYSTEM_CALENDAR_ID")?.trim() || "primary");

  if (GOOGLE_ID && GOOGLE_SECRET) {
    const systemRefreshToken = Deno.env.get("GOOGLE_SYSTEM_REFRESH_TOKEN")?.trim();
    if (systemRefreshToken) {
      try {
        const refreshed = await refreshGoogleToken({
          clientId: GOOGLE_ID,
          clientSecret: GOOGLE_SECRET,
          refreshToken: systemRefreshToken,
        });
        accessToken = refreshed.access_token;
      } catch (tokenErr) {
        googleTokenError = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
        console.error("[calendar-invite] System token refresh failed (will use email fallback):", googleTokenError);
      }
    } else {
      // Fallback: integration_tokens system row
      const { data: tokenRow, error: tokErr } = await admin
        .from("integration_tokens")
        .select("*")
        .eq("agency_id", SYSTEM_AGENCY_ID)
        .eq("provider", "google")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!tokErr && (tokenRow?.access_token || (tokenRow as any)?.refresh_token)) {
        accessToken = (tokenRow as any).access_token || "";
        const expiry = parseIsoDate((tokenRow as any).expiry_date);
        if ((tokenRow as any).refresh_token && isExpiredSoon(expiry)) {
          try {
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
          } catch (tokenErr) {
            googleTokenError = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
            console.error("[calendar-invite] integration_tokens refresh failed (will use email fallback):", googleTokenError);
            accessToken = "";
          }
        }
        const { data: sysConn } = await admin
          .from("integrations")
          .select("config")
          .eq("agency_id", SYSTEM_AGENCY_ID)
          .eq("provider", "google")
          .maybeSingle();
        const cfg = ((sysConn as any)?.config || {}) as any;
        if (cfg?.company_calendar_id) calendarId = String(cfg.company_calendar_id);
      } else {
        googleTokenError = tokErr?.message || "No Google integration configured";
        console.warn("[calendar-invite] No Google token available (will use email fallback):", googleTokenError);
      }
    }
  } else {
    googleTokenError = "Google OAuth credentials not configured";
    console.warn("[calendar-invite]", googleTokenError, "(will use email fallback)");
  }

  // ── Step 3: Try Google Calendar (only if we have a valid access token) ──────
  let googleEventId: string | null = null;
  let googleHtmlLink: string | null = null;
  let googleCalendarError = googleTokenError;

  if (accessToken) {
    const TZ = "Asia/Jerusalem";
    let start: { date?: string; dateTime?: string; timeZone?: string };
    let end: { date?: string; dateTime?: string; timeZone?: string };
    if (hasTimeSlots) {
      const toHms = (t: string) => {
        const parts = t.split(":").map((p) => parseInt(p, 10) || 0);
        const h = parts[0] ?? 0;
        const m = parts[1] ?? 0;
        const s = parts[2] ?? 0;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      };
      const startHms = toHms(eventTime);
      const endHms = eventTimeEnd ? toHms(eventTimeEnd) : addOneHour(eventTime);
      start = { dateTime: `${eventDate}T${startHms}`, timeZone: TZ };
      end = { dateTime: `${eventDate}T${endHms}`, timeZone: TZ };
    } else {
      start = { date: eventDate };
      end = { date: addDaysIsoDate(`${eventDate}T00:00:00.000Z`, 1) };
    }

    const eventBody = {
      summary,
      description,
      ...(location && { location }),
      start,
      end,
      attendees: attendees.length > 0 ? attendees : undefined,
      guestsCanModify: true,
      transparency: "opaque",
      extendedProperties: { private: { ima_agency_id: agencyId, ima_event_id: eventId } },
    };

    const existingGoogleEventId = String((ev as any).google_event_id || "");
    const existingArtistGoogleEventId = String((ev as any).google_artist_event_id || "");
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

      googleEventId = result?.id || null;
      googleHtmlLink = result?.htmlLink || null;

      let artistResult: any = null;
      const artistCalendarId = String((artist as any)?.google_calendar_id || "").trim();
      if (artistCalendarId) {
        try {
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
        } catch (artistErr) {
          console.warn("[calendar-invite] Artist calendar update failed (non-fatal):", artistErr instanceof Error ? artistErr.message : artistErr);
        }
      }

      await admin
        .from("events")
        .update({
          google_event_id: googleEventId,
          google_event_html_link: googleHtmlLink,
          google_artist_event_id: artistResult?.id || (artistCalendarId ? null : undefined),
          google_artist_event_html_link: artistResult?.htmlLink || (artistCalendarId ? null : undefined),
          google_sync_status: "synced",
          google_synced_at: nowIso(),
        } as any)
        .eq("agency_id", agencyId)
        .eq("id", eventId);

      // Google Calendar succeeded — emails sent via sendUpdates='all'
      return json({
        ok: true,
        calendarId,
        google_event_id: googleEventId,
        htmlLink: googleHtmlLink,
        attendees: attendees.map((a) => a.email),
        sendUpdates,
      });
    } catch (gcalErr) {
      googleCalendarError = gcalErr instanceof Error ? gcalErr.message : String(gcalErr);
      console.error("[calendar-invite] Google Calendar API error (will try email fallback):", googleCalendarError);
    }
  }

  // ── Step 4: Resend email fallback ──────────────────────────────────────────
  // Reached when: token expired/revoked, no Google config, or Calendar API failed.
  if (!sendInvites) {
    // User didn't request invites — return the token/calendar error as warning
    return json({ ok: true, warning: googleCalendarError || "Google Calendar skipped" });
  }

  if (attendees.length === 0) {
    return json({
      ok: false,
      error: "No attendee emails found. Add email to artist or client.",
      google_error: googleCalendarError,
    }, 422);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const resendFrom = Deno.env.get("RESEND_FROM")?.trim();
  if (!resendApiKey || !resendFrom) {
    return json({ error: `Google Calendar unavailable: ${googleCalendarError}. Resend also not configured.` }, 502);
  }

  const eventDateFormatted = new Date((ev as any).event_date).toLocaleDateString("he-IL", {
    year: "numeric", month: "long", day: "numeric",
  });
  const timeRange = hoursStr ? ` | שעה: ${hoursStr}` : "";
  const locationLine = location ? `<p><strong>מיקום:</strong> ${location}</p>` : "";

  const emailHtml = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1a1a1a; border-bottom: 2px solid #eee; padding-bottom: 12px;">
        הזמנה לאירוע: ${summary}
      </h2>
      <p><strong>תאריך:</strong> ${eventDateFormatted}${timeRange}</p>
      ${locationLine}
      ${description ? `<pre style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;font-family:Arial,sans-serif;">${description}</pre>` : ""}
      <hr style="margin-top:24px;" />
      <p style="color:#888;font-size:12px;">הודעה זו נשלחה על ידי NPC Collective</p>
    </div>`;

  try {
    const resend = new Resend(resendApiKey);
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: resendFrom,
      to: attendees.map((a) => a.email),
      subject: `הזמנה: ${summary} — ${eventDateFormatted}`,
      html: emailHtml,
    });

    if (emailError) throw new Error(String(emailError?.message || emailError));

    console.log("[calendar-invite] Fallback email sent via Resend:", emailData?.id, "to:", attendees.map((a) => a.email));
    return json({
      ok: true,
      fallback: "email",
      email_id: emailData?.id,
      warning: `Google Calendar unavailable: ${googleCalendarError}`,
      attendees: attendees.map((a) => a.email),
    });
  } catch (emailErr) {
    const emailMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
    console.error("[calendar-invite] Resend fallback also failed:", emailMsg);
    return json({
      error: `Google Calendar: ${googleCalendarError} | Email: ${emailMsg}`,
    }, 502);
  }
}

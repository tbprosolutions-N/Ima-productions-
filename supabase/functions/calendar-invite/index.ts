/**
 * Edge Function: calendar-invite
 *
 * Auth priority:
 *   1. Service Account JWT  (GOOGLE_SA_CLIENT_EMAIL + GOOGLE_SA_PRIVATE_KEY) — never expires
 *   2. OAuth refresh token  (GOOGLE_SYSTEM_REFRESH_TOKEN)                    — may expire
 *   3. Resend email fallback (RESEND_API_KEY + RESEND_FROM)                   — always works
 *
 * Body: { event_id: string, send_invites?: boolean, access_token?: string }
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

function nowIso() { return new Date().toISOString(); }

function addDaysIsoDate(dateIso: string, days: number) {
  const d = new Date(dateIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addOneHour(t: string): string {
  const p = t.split(":").map((x) => parseInt(x, 10) || 0);
  return `${String(((p[0] ?? 0) + 1) % 24).padStart(2, "0")}:${String(p[1] ?? 0).padStart(2, "0")}:00`;
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

// ── Service Account JWT auth (RS256) ────────────────────────────────────────
async function getServiceAccountToken(saEmail: string, saPrivateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const header = b64url({ alg: "RS256", typ: "JWT" });
  const payload = b64url({
    iss: saEmail,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  });

  const signingInput = `${header}.${payload}`;

  // Normalize PEM (Supabase stores \n as literal \\n)
  const pem = saPrivateKeyPem.replace(/\\n/g, "\n");
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const jwtAssertion = `${signingInput}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwtAssertion,
    }),
  });

  if (!tokenRes.ok) throw new Error(`SA token error: ${await tokenRes.text()}`);
  const tokenData = await tokenRes.json() as { access_token?: string };
  if (!tokenData.access_token) throw new Error("SA response missing access_token");
  return tokenData.access_token;
}

// ── OAuth Refresh Token auth ─────────────────────────────────────────────────
async function refreshOAuthToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`OAuth refresh failed: ${await res.text()}`);
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error("OAuth response missing access_token");
  return data.access_token;
}

async function googleApiFetch(accessToken: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers || {}), authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
  });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
  return res;
}

// ── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    return await handleRequest(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[calendar-invite] Unhandled:", msg);
    return json({ error: msg }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return json({ error: "Server not configured" }, 502);

  let body: { event_id?: string; send_invites?: boolean; access_token?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const eventId = typeof body?.event_id === "string" ? body.event_id.trim() : "";
  if (!eventId) return json({ error: "Missing event_id" }, 400);
  const sendInvites = body?.send_invites !== false;

  const jwt = (typeof body?.access_token === "string" ? body.access_token.trim() : "")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
    || "";
  if (!jwt) return json({ error: "Missing authorization" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

  let userId: string;
  try {
    const p = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    userId = p?.sub;
    if (!userId) throw new Error("No sub");
  } catch { return json({ error: "Invalid token" }, 401); }

  const { data: userRow } = await admin.from("users").select("agency_id,full_name").eq("id", userId).maybeSingle();
  const agencyId = (userRow as any)?.agency_id;
  const organizerName = String((userRow as any)?.full_name || "").trim();
  if (!agencyId) return json({ error: "User has no agency" }, 403);

  // ── Fetch event + participants ─────────────────────────────────────────────
  const { data: ev, error: evErr } = await admin.from("events").select("*").eq("agency_id", agencyId).eq("id", eventId).single();
  if (evErr || !ev) return json({ error: "Event not found or access denied" }, 404);

  const [{ data: artist }, { data: client }] = await Promise.all([
    (ev as any).artist_id
      ? admin.from("artists").select("id,name,email,calendar_email,google_calendar_id").eq("agency_id", agencyId).eq("id", (ev as any).artist_id).maybeSingle()
      : Promise.resolve({ data: null }),
    (ev as any).client_id
      ? admin.from("clients").select("id,name,email").eq("agency_id", agencyId).eq("id", (ev as any).client_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const eventDate = new Date((ev as any).event_date).toISOString().slice(0, 10);
  const eventTime = String((ev as any).event_time || "").trim();
  const eventTimeEnd = String((ev as any).event_time_end || "").trim();
  const hasTime = !!eventTime;

  const summaryParts = [String((ev as any).business_name || "אירוע")];
  if ((artist as any)?.name) summaryParts.push(String((artist as any).name));
  const summary = summaryParts.join(" · ");

  const attendees: { email: string }[] = [];
  const seen = new Set<string>();
  for (const email of [
    String((artist as any)?.calendar_email || (artist as any)?.email || "").trim(),
    String((client as any)?.email || "").trim(),
  ]) {
    if (email && !seen.has(email.toLowerCase())) {
      attendees.push({ email });
      seen.add(email.toLowerCase());
    }
  }

  const amount = Number((ev as any).amount) || 0;
  const hoursStr = hasTime ? (eventTimeEnd ? `${eventTime} - ${eventTimeEnd}` : eventTime) : "";
  const location = String((ev as any).location || "").trim();
  const descParts: string[] = [];
  if ((client as any)?.name) descParts.push(`שם הלקוח: ${(client as any).name}`);
  if ((artist as any)?.name) descParts.push(`שם האמן: ${(artist as any).name}`);
  if (amount > 0) descParts.push(`סכום האירוע: ₪${amount.toLocaleString("he-IL")}`);
  if (hoursStr) descParts.push(`שעות האירוע: ${hoursStr}`);
  if (organizerName) descParts.push(`מארגן: ${organizerName}`);
  const notes = String((ev as any).notes || "").trim();
  if (notes) descParts.push(`הערות: ${notes}`);
  const description = descParts.join("\n");

  // ── Acquire Google access token (SA → OAuth → skip) ───────────────────────
  let accessToken = "";
  let googleTokenError = "";
  let calendarId = String(Deno.env.get("GOOGLE_SYSTEM_CALENDAR_ID")?.trim() || "primary");

  // Priority 1: Service Account (never expires)
  const saEmail = Deno.env.get("GOOGLE_SA_CLIENT_EMAIL")?.trim();
  const saPrivKey = Deno.env.get("GOOGLE_SA_PRIVATE_KEY")?.trim();
  if (saEmail && saPrivKey) {
    try {
      accessToken = await getServiceAccountToken(saEmail, saPrivKey);
      console.log("[calendar-invite] SA token acquired for:", saEmail);
    } catch (e) {
      googleTokenError = `SA: ${e instanceof Error ? e.message : e}`;
      console.warn("[calendar-invite] SA auth failed:", googleTokenError);
    }
  }

  // Priority 2: OAuth refresh token (may expire)
  if (!accessToken) {
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim();
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim();
    const refreshToken = Deno.env.get("GOOGLE_SYSTEM_REFRESH_TOKEN")?.trim();
    if (clientId && clientSecret && refreshToken) {
      try {
        accessToken = await refreshOAuthToken(clientId, clientSecret, refreshToken);
        console.log("[calendar-invite] OAuth token refreshed");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        googleTokenError = (googleTokenError ? googleTokenError + " | " : "") + `OAuth: ${msg}`;
        console.warn("[calendar-invite] OAuth refresh failed:", msg);
      }
    } else if (!saEmail) {
      googleTokenError = "No Google credentials configured (SA or OAuth)";
    }
  }

  // Priority 3: integration_tokens DB row
  if (!accessToken) {
    const SYSTEM_AGENCY = "00000000-0000-0000-0000-000000000000";
    const { data: tokenRow } = await admin.from("integration_tokens")
      .select("*").eq("agency_id", SYSTEM_AGENCY).eq("provider", "google")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (tokenRow) {
      accessToken = (tokenRow as any).access_token || "";
      const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim();
      const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim();
      if ((tokenRow as any).refresh_token && isExpiredSoon(parseIsoDate((tokenRow as any).expiry_date)) && clientId && clientSecret) {
        try {
          accessToken = await refreshOAuthToken(clientId, clientSecret, (tokenRow as any).refresh_token);
          await admin.from("integration_tokens").update({
            access_token: accessToken,
            expiry_date: new Date(Date.now() + 3600 * 1000).toISOString(),
          }).eq("id", (tokenRow as any).id);
        } catch (e) {
          accessToken = "";
          const msg = e instanceof Error ? e.message : String(e);
          googleTokenError = (googleTokenError ? googleTokenError + " | " : "") + `DB-token: ${msg}`;
        }
      }
      const { data: sysConn } = await admin.from("integrations").select("config")
        .eq("agency_id", SYSTEM_AGENCY).eq("provider", "google").maybeSingle();
      if ((sysConn as any)?.config?.company_calendar_id) calendarId = String((sysConn as any).config.company_calendar_id);
    }
  }

  // ── Try Google Calendar ───────────────────────────────────────────────────
  if (accessToken) {
    const TZ = "Asia/Jerusalem";
    let start: any, end: any;
    if (hasTime) {
      const hms = (t: string) => {
        const p = t.split(":").map((x) => parseInt(x, 10) || 0);
        return `${String(p[0] ?? 0).padStart(2, "0")}:${String(p[1] ?? 0).padStart(2, "0")}:${String(p[2] ?? 0).padStart(2, "0")}`;
      };
      start = { dateTime: `${eventDate}T${hms(eventTime)}`, timeZone: TZ };
      end = { dateTime: `${eventDate}T${eventTimeEnd ? hms(eventTimeEnd) : addOneHour(eventTime)}`, timeZone: TZ };
    } else {
      start = { date: eventDate };
      end = { date: addDaysIsoDate(`${eventDate}T00:00:00.000Z`, 1) };
    }

    const eventBody = {
      summary, description, ...(location && { location }), start, end,
      attendees: attendees.length ? attendees : undefined,
      guestsCanModify: true, transparency: "opaque",
      extendedProperties: { private: { ima_agency_id: agencyId, ima_event_id: eventId } },
    };
    const sendUpdates = sendInvites ? "all" : "none";
    const existingId = String((ev as any).google_event_id || "");
    const existingArtistId = String((ev as any).google_artist_event_id || "");

    try {
      let result: any;
      if (existingId) {
        result = await (await googleApiFetch(accessToken,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingId)}?sendUpdates=${sendUpdates}`,
          { method: "PATCH", body: JSON.stringify(eventBody) })).json();
      } else {
        result = await (await googleApiFetch(accessToken,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${sendUpdates}`,
          { method: "POST", body: JSON.stringify(eventBody) })).json();
      }

      let artistResult: any = null;
      const artistCalId = String((artist as any)?.google_calendar_id || "").trim();
      if (artistCalId) {
        try {
          if (existingArtistId) {
            artistResult = await (await googleApiFetch(accessToken,
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(artistCalId)}/events/${encodeURIComponent(existingArtistId)}?sendUpdates=${sendUpdates}`,
              { method: "PATCH", body: JSON.stringify(eventBody) })).json();
          } else {
            artistResult = await (await googleApiFetch(accessToken,
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(artistCalId)}/events?sendUpdates=${sendUpdates}`,
              { method: "POST", body: JSON.stringify(eventBody) })).json();
          }
        } catch (e) { console.warn("[calendar-invite] artist calendar (non-fatal):", e instanceof Error ? e.message : e); }
      }

      await admin.from("events").update({
        google_event_id: result?.id || null,
        google_event_html_link: result?.htmlLink || null,
        google_artist_event_id: artistResult?.id || (artistCalId ? null : undefined),
        google_artist_event_html_link: artistResult?.htmlLink || (artistCalId ? null : undefined),
        google_sync_status: "synced",
        google_synced_at: nowIso(),
      } as any).eq("agency_id", agencyId).eq("id", eventId);

      return json({ ok: true, calendarId, google_event_id: result?.id, htmlLink: result?.htmlLink, attendees: attendees.map((a) => a.email), sendUpdates });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[calendar-invite] Google Calendar API error (falling back to email):", msg);
      googleTokenError = (googleTokenError ? googleTokenError + " | " : "") + `Calendar API: ${msg}`;
    }
  }

  // ── Resend email fallback ─────────────────────────────────────────────────
  if (!sendInvites) return json({ ok: true, warning: googleTokenError || "Google Calendar skipped" });

  if (attendees.length === 0) {
    return json({ ok: false, error: "No attendee emails. Add email to artist or client.", google_error: googleTokenError }, 422);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const resendFrom = Deno.env.get("RESEND_FROM")?.trim();
  if (!resendKey || !resendFrom) {
    return json({ error: `Google Calendar unavailable: ${googleTokenError}. Resend not configured.` }, 502);
  }

  const dateFmt = new Date((ev as any).event_date).toLocaleDateString("he-IL", { year: "numeric", month: "long", day: "numeric" });
  const emailHtml = `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#1a1a1a;border-bottom:2px solid #eee;padding-bottom:12px;">
        הזמנה לאירוע: ${summary}
      </h2>
      <p><strong>תאריך:</strong> ${dateFmt}${hoursStr ? ` | שעה: ${hoursStr}` : ""}</p>
      ${location ? `<p><strong>מיקום:</strong> ${location}</p>` : ""}
      ${description ? `<pre style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;font-family:Arial,sans-serif;">${description}</pre>` : ""}
      <hr style="margin-top:24px;"/>
      <p style="color:#888;font-size:12px;">NPC Collective</p>
    </div>`;

  try {
    const resend = new Resend(resendKey);
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: resendFrom,
      to: attendees.map((a) => a.email),
      subject: `הזמנה: ${summary} — ${dateFmt}`,
      html: emailHtml,
    });
    if (emailError) throw new Error(String((emailError as any)?.message || emailError));
    console.log("[calendar-invite] Resend fallback sent:", emailData?.id, "→", attendees.map((a) => a.email));
    return json({ ok: true, fallback: "email", email_id: emailData?.id, warning: googleTokenError, attendees: attendees.map((a) => a.email) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `Google: ${googleTokenError} | Email: ${msg}` }, 502);
  }
}

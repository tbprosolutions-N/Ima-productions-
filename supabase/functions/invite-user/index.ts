// Supabase Edge Function: invite-user
// Invites a user by email without switching the current session.
//
// Required secrets:
// - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// For Gmail delivery (recommended):
// - GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
// - Optional override: GMAIL_ACCESS_TOKEN (single token for all sends; else uses integration_tokens per agency)
//
// Flow: Create user (createUser) → generate magic link → send via Gmail API. Only if Gmail API fails, return link to client.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type TokenRow = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  expiry_date: string | null;
};

function parseIsoDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isExpiredSoon(expiry: Date | null, skewSeconds = 120): boolean {
  if (!expiry) return false;
  return expiry.getTime() - Date.now() <= skewSeconds * 1000;
}

async function refreshGoogleAccessToken(args: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{ access_token: string }> {
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
  const data = (await res.json()) as { access_token?: string };
  return { access_token: data.access_token || "" };
}

function base64UrlEncode(str: string): string {
  const b64 = btoa(
    String.fromCharCode(...new TextEncoder().encode(str).map((c) => c))
  );
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function getGmailProfile(accessToken: string): Promise<{ emailAddress: string }> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { "authorization": `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail profile error ${res.status}`);
  return (await res.json()) as { emailAddress: string };
}

/** Get Gmail access token: GMAIL_ACCESS_TOKEN env (debug) or integration_tokens for the agency. */
async function getGmailAccessToken(
  admin: { from: (t: string) => any },
  agencyId: string,
  googleId: string,
  googleSecret: string,
): Promise<{ accessToken: string; tokenRow: TokenRow | null } | null> {
  const envToken = Deno.env.get("GMAIL_ACCESS_TOKEN")?.trim();
  if (envToken) return { accessToken: envToken, tokenRow: null };

  const { data: tok } = await admin
    .from("integration_tokens")
    .select("id,access_token,refresh_token,scope,expiry_date")
    .eq("agency_id", agencyId)
    .eq("provider", "google")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const tokenRow = tok as TokenRow | null;
  const scope = String(tokenRow?.scope || "");
  if (!tokenRow?.refresh_token || (!scope.includes("gmail.send") && !scope.includes("gmail.compose") && !scope.includes("mail.google.com")))
    return null;
  let accessToken = tokenRow.access_token || "";
  const expiry = parseIsoDate(tokenRow.expiry_date);
  if (isExpiredSoon(expiry) && tokenRow.refresh_token) {
    const refreshed = await refreshGoogleAccessToken({
      clientId: googleId,
      clientSecret: googleSecret,
      refreshToken: tokenRow.refresh_token,
    });
    accessToken = refreshed.access_token;
  }
  return accessToken ? { accessToken, tokenRow } : null;
}

async function sendViaGmail(args: {
  accessToken: string;
  to: string;
  subject: string;
  htmlBody: string;
  fromName?: string;
}): Promise<void> {
  const profile = await getGmailProfile(args.accessToken);
  const fromEmail = profile.emailAddress || "noreply@ima.local";
  const fromDisplay = (args.fromName || "NPC").replace(/"/g, '\\"');
  const crlf = "\r\n";
  const subjectB64 = typeof unescape !== "undefined"
    ? btoa(unescape(encodeURIComponent(args.subject))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    : btoa(args.subject).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const raw =
    `From: "${fromDisplay}" <${fromEmail}>${crlf}` +
    `To: ${args.to}${crlf}` +
    `Subject: =?UTF-8?B?${subjectB64}?=${crlf}` +
    `MIME-Version: 1.0${crlf}` +
    `Content-Type: text/html; charset=utf-8${crlf}` +
    crlf +
    args.htmlBody;
  const encoded = base64UrlEncode(raw);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${args.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw: encoded }),
  });
  const resText = await res.text();
  if (!res.ok) {
    console.error("Gmail API response:", res.status, resText);
    throw new Error(`Gmail API ${res.status}: ${resText || res.statusText}`);
  }
}

function corsHeaders(req?: Request) {
  const origin = req?.headers?.get("origin") || req?.headers?.get("referer")?.replace(/\/[^/]*$/, "") || "*";
  const allowOrigin = origin && origin !== "null" ? origin : "*";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400",
  };
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(req),
      ...extraHeaders,
    },
  });
}

type Body = {
  agencyId: string;
  email: string;
  full_name: string;
  role: "producer" | "finance" | "manager" | "owner";
  permissions?: Record<string, boolean>;
  redirectTo?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, {}, req);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE) {
    return json(
      {
        error:
          "Missing server configuration (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY).",
      },
      500,
      {},
      req,
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, {}, req);
  }

  const agencyId = (body.agencyId || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const full_name = (body.full_name || "").trim();
  const role = body.role;
  const permissions = body.permissions || {};
  // redirectTo must be in Supabase Auth → URL Configuration → Redirect URLs or the link will fail
  const originFromHeader = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/[^/]*$/, "") || "";
  const redirectTo = (body.redirectTo || "").trim() || (Deno.env.get("SITE_URL") || "").trim() || (originFromHeader ? `${originFromHeader}/login` : "").trim();
  const effectiveRedirect = redirectTo || undefined;
  let magicLinkFallback: string | null = null;

  if (!agencyId) return json({ error: "agencyId is required" }, 400, {}, req);
  if (!email) return json({ error: "email is required" }, 400, {}, req);
  if (!full_name) return json({ error: "full_name is required" }, 400, {}, req);
  if (!role) return json({ error: "role is required" }, 400, {}, req);

  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401, {}, req);

  // User-scoped client to verify caller + permissions
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: "Unauthorized" }, 401, {}, req);
  }

  const callerId = userData.user.id;

  const { data: callerProfile, error: callerProfileErr } = await userClient
    .from("users")
    .select("id,role,agency_id")
    .eq("id", callerId)
    .maybeSingle();

  if (callerProfileErr || !callerProfile) {
    return json({ error: "Caller profile missing (run bootstrap.sql / ensure_user_profile.sql)" }, 403, {}, req);
  }

  const callerRole = String((callerProfile as any).role || "");
  const callerAgency = String((callerProfile as any).agency_id || "");

  if (callerAgency !== agencyId) {
    return json({ error: "Forbidden: agency mismatch" }, 403, {}, req);
  }
  if (!(callerRole === "owner" || callerRole === "manager")) {
    return json({ error: "Forbidden: requires owner/manager" }, 403, {}, req);
  }

  // Service-role client for admin operations + DB writes
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const GOOGLE_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
  const GOOGLE_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "";
  const gmailCreds = (GOOGLE_ID && GOOGLE_SECRET)
    ? await getGmailAccessToken(admin, agencyId, GOOGLE_ID, GOOGLE_SECRET)
    : null;

  let invitedId: string | null = null;

  // 1) Gmail path: create user, generate link, send via Gmail API (only fallback to returning link on API error)
  if (gmailCreds?.accessToken) {
    const { data: createData, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { full_name, role, agency_id: agencyId, permissions },
    });
    if (createErr) {
      const { data: existing } = await admin.auth.admin.listUsers();
      const existingUser = (existing?.users || []).find((u: any) => (u.email || "").toLowerCase() === email);
      if (existingUser) invitedId = existingUser.id;
      if (!invitedId) {
        return json({
          error: createErr.message,
          hint: "If user already exists, use 'Send Link' from the user list to resend the login link via Gmail.",
        }, 400, {}, req);
      }
    } else {
      invitedId = createData?.user?.id || null;
    }
    if (invitedId) {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: effectiveRedirect },
      });
      if (linkErr) {
        console.error("generateLink error", linkErr);
      }
      const magicLink = linkData?.properties?.action_link;
      if (magicLink) {
        const subject = "הזמנה להתחברות — NPC";
        const htmlBody = `
            <div dir="rtl" style="font-family: sans-serif;">
              <p>שלום ${full_name || email},</p>
              <p>הוזמנת למערכת NPC. לחץ על הקישור להלן כדי להתחבר:</p>
              <p><a href="${magicLink}" style="background:#7c3aed;color:white;padding:10px 20px;text-decoration:none;border-radius:8px;">התחברות</a></p>
              <p>או העתק את הקישור: ${magicLink}</p>
              <p>אם לא ביקשת זאת, התעלם ממייל זה.</p>
            </div>`;
        try {
          await sendViaGmail({
            accessToken: gmailCreds.accessToken,
            to: email,
            subject,
            htmlBody,
            fromName: "NPC",
          });
        } catch (gmailErr) {
          console.error("Gmail API send failed", gmailErr);
          magicLinkFallback = magicLink;
        }
      }
    }
  }

  if (!invitedId) {
    // No Gmail: use Supabase Auth invite (sends via Supabase mailer)
    try {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: effectiveRedirect,
        data: { full_name, role, agency_id: agencyId, permissions },
      });
      if (error) throw error;
      invitedId = data?.user?.id || null;
    } catch (inviteErr: unknown) {
      const errMsg = inviteErr instanceof Error ? inviteErr.message : String(inviteErr);
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: { full_name, role, agency_id: agencyId, permissions },
      });
      if (error) {
        return json({
          error: errMsg || error.message,
          hint: "If email not received: check spam; ensure Redirect URLs in Supabase Auth include your app URL. Or connect Google (Gmail) in Settings → Integrations to send from your Gmail.",
        }, 400, {}, req);
      }
      invitedId = data?.user?.id || null;
      // Generate link so admin can send manually when Supabase mailer didn't send
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: effectiveRedirect },
      });
      if (linkData?.properties?.action_link) magicLinkFallback = linkData.properties.action_link;
    }
  }

  if (!invitedId) return json({ error: "Failed to determine invited user id" }, 500, {}, req);

  // Ensure `public.users` row exists. Try with permissions column; if schema doesn't have it, retry without.
  const baseRow: Record<string, unknown> = {
    id: invitedId,
    email,
    full_name,
    role,
    agency_id: agencyId,
    updated_at: new Date().toISOString(),
  };

  const tryUpsert = async (row: Record<string, unknown>) => {
    const { error } = await admin.from("users").upsert(row, { onConflict: "id" });
    if (error) throw error;
  };

  try {
    await tryUpsert({ ...baseRow, permissions });
  } catch {
    await tryUpsert(baseRow);
  }

  const hint = magicLinkFallback
    ? "Email could not be sent automatically. Copy the link below and send it to the user."
    : "Invite sent. If the user does not receive the email within a few minutes, ask them to check spam and ensure Supabase Auth → Redirect URLs includes: " + (effectiveRedirect || "(app URL)");

  return json({
    ok: true,
    user_id: invitedId,
    email,
    hint,
    ...(magicLinkFallback ? { magic_link: magicLinkFallback } : {}),
  }, 200, {}, req);
});

